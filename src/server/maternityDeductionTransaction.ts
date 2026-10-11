import { sanitizeMaternityCaseUpdates, validDocumentId, validMaternityStatus } from './maternityMutationGuard';
import {
  MaternityCase,
  Company,
  PlanCode,
  MaternityDeductionErrorCode,
  MaternityDeductionCallerContext,
  MaternityDeductionTransactionParams,
  MaternityDeductionTransactionResult,
  MaternityDeductionLedgerItem,
  LegacyCheckOptions,
} from '../types';
import {
  MATERNITY_DEDUCTIONS_COLLECTION,
  buildDeductionLedgerDocId,
  createDeductionLedgerPayload,
  evaluateMaternityDeductionEligibility,
  isLegacyMaternityCase,
} from '../services/maternityUsageService';
import { isFirebaseAdminConfigured, getAdminAuth, getAdminDb } from './firebaseAdmin';

/**
 * [R2-8 2/4-A-⑥-1] 모성보호 차감 트랜잭션 전용 에러 클래스
 */
export class MaternityDeductionError extends Error {
  constructor(
    public readonly code: MaternityDeductionErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MaternityDeductionError';
  }
}

/**
 * [R2-8 2/4-A-⑥-1] 호출자 권한 및 기업별 데이터 격리 검증 함수
 * 
 * - ADMIN: 전체 기업 대상 차감 권한 보유
 * - COMPANY: 본인 소속 기업(companyId 일치)의 사건에 대해서만 차감 허용
 * - WORKER: 전면 차단
 * - 비로그인/유효하지 않은 역할: 전면 차단
 */
export function validateCallerDeductionPermission(
  caller: MaternityDeductionCallerContext,
  targetCompanyId: string
): void {
  if (!caller || !caller.uid) {
    throw new MaternityDeductionError('UNAUTHORIZED', '로그인이 필요합니다. (인증 정보 없음)');
  }

  if (caller.role === 'WORKER') {
    throw new MaternityDeductionError(
      'FORBIDDEN',
      '근로자(WORKER) 계정은 모성보호 차감 트랜잭션을 실행할 수 없습니다.'
    );
  }

  if (caller.role !== 'ADMIN' && caller.role !== 'COMPANY') {
    throw new MaternityDeductionError(
      'FORBIDDEN',
      `차감 실행 권한이 없습니다. (ADMIN 또는 COMPANY 권한 필요, 현재 역할: ${caller.role})`
    );
  }

  if (caller.role === 'COMPANY') {
    if (!caller.companyId) {
      throw new MaternityDeductionError(
        'FORBIDDEN',
        '소속 기업 정보가 없는 기업 담당자 계정입니다.'
      );
    }
    if (caller.companyId !== targetCompanyId) {
      throw new MaternityDeductionError(
        'DATA_ISOLATION_VIOLATION',
        '타 기업의 모성보호 사건에 대해 차감을 실행할 수 없습니다. (기업별 데이터 격리 위반)',
        { callerCompanyId: caller.companyId, targetCompanyId }
      );
    }
  }
}

/**
 * [R2-8 2/4-A-⑥-1] 서버 측 Firestore Transaction 기반 모성보호 차감 핵심 함수
 * 
 * 필수 보장 규칙:
 * 1. ADMIN/COMPANY 권한 검증 및 기업별 데이터 격리
 * 2. 동일 사건 중복 차감 방지 (사건 deductionInfo 및 원장 status 확인)
 * 3. 동시 신청 시 초과 차감 방지 (Firestore Transaction 격리 및 잔여 수량 재확인)
 * 4. STANDARD 월 무료 5회 우선 적용 -> 소진 시 선불 이용권 차감
 * 5. 잔여 0회 시 차감 거부
 * 6. 사건 메타데이터(deductionInfo)와 차감 원장(maternity_deductions) 원자적 기록
 * 7. 기존 신청 건수와 신규 차감 기록 이중 집계 방지
 * 8. 레거시 사건 소급 차감 금지 (isLegacyMaternityCase)
 * 9. 월 무료 횟수 익월 이월 금지
 * 10. 트랜잭션 실패 시 전체 롤백
 */
export async function executeMaternityDeductionTransaction(
  params: MaternityDeductionTransactionParams,
  injectedDb?: any
): Promise<MaternityDeductionTransactionResult> {
  const {
    caller,
    companyId: targetCompanyId,
    caseId,
    targetYearMonth,
    referenceDateString,
    workStartDate,
    notes,
    options,
  } = params;

  if (!validDocumentId(targetCompanyId) || !validDocumentId(caseId) || !validMaternityStatus(params.targetStatus) ||
      (params.assignedAttorneyId !== undefined && !validDocumentId(params.assignedAttorneyId))) {
    throw new MaternityDeductionError('INVALID_STATE', '잘못된 사건 식별자 또는 상태입니다.');
  }
  let safeExtraCaseUpdates: Record<string, unknown>;
  try {
    safeExtraCaseUpdates = sanitizeMaternityCaseUpdates(params.extraCaseUpdates, caller.uid);
  } catch {
    throw new MaternityDeductionError('INVALID_STATE', '허용되지 않은 사건 수정 항목입니다.');
  }

  // 1. 권한 및 기업별 데이터 격리 검증
  validateCallerDeductionPermission(caller, targetCompanyId);

  // 2. DB 인스턴스 획득 (테스트/주입 DB 또는 Firestore Admin DB)
  const db = injectedDb || getAdminDb();
  if (!db) {
    throw new MaternityDeductionError(
      'TRANSACTION_FAILED',
      'Firestore 데이터베이스 연결을 초기화할 수 없습니다.'
    );
  }

  // 3. Firestore Transaction 실행
  return await db.runTransaction(async (transaction: any) => {
    // [READ 1] 모성보호 사건 문서 조회
    const caseRef = db.collection('maternity_cases').doc(caseId);
    const caseSnap = await transaction.get(caseRef);
    if (!caseSnap.exists) {
      throw new MaternityDeductionError(
        'CASE_NOT_FOUND',
        `대상 모성보호 사건(${caseId})을 찾을 수 없습니다.`
      );
    }
    const caseData = (typeof caseSnap.data === 'function' ? caseSnap.data() : caseSnap.data) as MaternityCase;

    // 사건 소속 기업 데이터 격리 교차 검증
    if (caseData.companyId !== targetCompanyId) {
      throw new MaternityDeductionError(
        'DATA_ISOLATION_VIOLATION',
        '사건의 소속 기업과 요청 기업 ID가 일치하지 않습니다. (데이터 격리 위반)',
        { caseCompanyId: caseData.companyId, targetCompanyId }
      );
    }

    // 취소된 사건 차감 불가
    if (caseData.status === 'CANCELLED') {
      throw new MaternityDeductionError(
        'INVALID_STATE',
        '취소(CANCELLED)된 사건에 대해서는 모성보호 차감을 실행할 수 없습니다.'
      );
    }

    // 레거시 사건 소급 차감 금지 검증
    if (isLegacyMaternityCase(caseData, options)) {
      throw new MaternityDeductionError(
        'LEGACY_CASE_RETROACTIVE_DENIED',
        '신규 차감 정책 도입 이전의 기존(레거시) 사건은 소급 차감할 수 없습니다.'
      );
    }

    // 동일 사건 중복 차감 방지 1: 사건 내 deductionInfo 검증
    if (caseData.deductionInfo && caseData.deductionInfo.deductionId) {
      if (params.allowSkipIfAlreadyDeducted) {
        // [R2-8 2/4-A-⑥-9] 이미 차감된 사건의 상태 전이 요청:
        // 추가 차감 및 원장 생성 없이 사건 상태 및 이력만 원자적으로 갱신
        const now = new Date().toISOString();
        const caseUpdatePayload: Record<string, any> = {
          updatedAt: now,
          updatedById: caller.uid,
        };
        if (params.targetStatus) {
          caseUpdatePayload.status = params.targetStatus;
        }
        if (params.assignedAttorneyId) {
          caseUpdatePayload.assignedAttorneyId = params.assignedAttorneyId;
        }
        if (params.statusChangeHistoryItem) {
          const currentHist = Array.isArray(caseData.history) ? caseData.history : [];
          caseUpdatePayload.history = [...currentHist, params.statusChangeHistoryItem];
        } else if (params.assignedAttorneyId && params.assignedAttorneyId !== caseData.assignedAttorneyId) {
          const currentHist = Array.isArray(caseData.history) ? caseData.history : [];
          caseUpdatePayload.history = [
            ...currentHist,
            {
              action: '담당 노무사 배정',
              previousStatus: caseData.status,
              newStatus: params.targetStatus || caseData.status,
              timestamp: now,
              actor: caller.displayName || '관리자',
              actorUid: caller.uid,
              notes: params.notes || `담당 노무사 배정 (${params.assignedAttorneyId})`,
            },
          ];
        }
        if (params.extraCaseUpdates) {
          Object.assign(caseUpdatePayload, safeExtraCaseUpdates);
        }
        transaction.update(caseRef, caseUpdatePayload);

        return {
          success: true,
          deductionId: caseData.deductionInfo.deductionId,
          caseId,
          companyId: targetCompanyId,
          source: caseData.deductionInfo.source,
          yearMonth: caseData.deductionInfo.yearMonth,
          deductedAt: caseData.deductionInfo.deductedAt,
          remainingMonthlyFree: 0,
          remainingPurchasedTickets: 0,
          totalRemaining: 0,
          ledgerItem: null as any,
          caseDeductionInfo: caseData.deductionInfo,
          targetStatus: params.targetStatus,
          alreadyDeducted: true,
        };
      }

      if (!caseData.deductionInfo.restoredAt) {
        throw new MaternityDeductionError(
          'ALREADY_DEDUCTED',
          '해당 사건은 이미 차감 처리(DEDUCTED)되어 있어 중복 차감할 수 없습니다.'
        );
      } else {
        throw new MaternityDeductionError(
          'ALREADY_DEDUCTED',
          '취소/복구 이력이 있는 사건은 자동으로 재차감할 수 없습니다. 신규 사건으로 재신청해야 합니다.'
        );
      }
    }

    // [READ 2] 차감 원장 문서 조회 (동일 사건 중복 차감 방지 2)
    const ledgerDocId = buildDeductionLedgerDocId(targetCompanyId, caseId);
    const ledgerRef = db.collection(MATERNITY_DEDUCTIONS_COLLECTION).doc(ledgerDocId);
    const ledgerSnap = await transaction.get(ledgerRef);
    if (ledgerSnap.exists) {
      const existingLedger = (typeof ledgerSnap.data === 'function' ? ledgerSnap.data() : ledgerSnap.data) as MaternityDeductionLedgerItem;
      if (existingLedger.status === 'DEDUCTED') {
        throw new MaternityDeductionError(
          'ALREADY_DEDUCTED',
          '동일 사건에 대한 차감 원장이 이미 존재합니다. (중복 차감 차단)'
        );
      }
      if (existingLedger.status === 'RESTORED') {
        throw new MaternityDeductionError(
          'ALREADY_DEDUCTED',
          '이미 복구(RESTORED) 처리된 원장이 존재하는 사건입니다.'
        );
      }
      if (existingLedger.status === 'CANCELLED') {
        throw new MaternityDeductionError(
          'ALREADY_DEDUCTED',
          '취소(CANCELLED)된 원장이 존재하는 사건입니다.'
        );
      }
    }

    // [READ 3] 기업 문서 조회 (최신 플랜 및 선불 이용권 잔여 수량 재확인)
    const companyRef = db.collection('companies').doc(targetCompanyId);
    const companySnap = await transaction.get(companyRef);
    if (!companySnap.exists) {
      throw new MaternityDeductionError(
        'COMPANY_NOT_FOUND',
        `기업 정보(${targetCompanyId})를 찾을 수 없습니다.`
      );
    }
    const companyData = (typeof companySnap.data === 'function' ? companySnap.data() : companySnap.data) as Company;

    // [R2-8 2/4-C-⑨-3] 실제 업무 착수 시점 확정 (사건 신청일이 아닌 실제 업무 착수 시점 기준)
    // 1) 명시적 referenceDateString / workStartDate
    // 2) 상태 전이 이력(statusChangeHistoryItem)의 timestamp (업무 착수 시점)
    // 3) 명시적 targetYearMonth 기반 (YYYY-MM-01)
    // 4) 현재 실행 시점 (new Date().toISOString())
    // * 중요: 사건 신청일(caseData.applicationDate)이나 생성일(caseData.createdAt)을 업무 착수일로 사용하지 않습니다!
    const workStartTimestamp =
      referenceDateString ||
      workStartDate ||
      params.statusChangeHistoryItem?.timestamp ||
      (targetYearMonth && /^\d{4}-\d{2}$/.test(targetYearMonth) ? `${targetYearMonth}-01` : undefined) ||
      new Date().toISOString();

    const workStartReferenceDate = workStartTimestamp.slice(0, 10);

    // 적용 연월 확정: 실제 업무 착수일이 속한 월을 기준으로 함
    const resolvedYearMonth =
      targetYearMonth && /^\d{4}-\d{2}$/.test(targetYearMonth)
        ? targetYearMonth
        : workStartReferenceDate.slice(0, 7);

    // [READ 4] 당월 무료 이용 횟수 산출 및 이중 집계 방지
    // 1) 당월 해당 기업의 차감 원장 목록 조회 (source === 'MONTHLY_FREE')
    const deductionsQuery = db
      .collection(MATERNITY_DEDUCTIONS_COLLECTION)
      .where('companyId', '==', targetCompanyId)
      .where('yearMonth', '==', resolvedYearMonth);
    const deductionsSnap = await transaction.get(deductionsQuery);

    // 2) 당월 해당 기업의 모성보호 사건 목록 조회 (기존 레거시 사건 포함)
    const casesQuery = db
      .collection('maternity_cases')
      .where('companyId', '==', targetCompanyId);
    const casesSnap = await transaction.get(casesQuery);

    // [이중 집계 방지 핵심 로직]
    // 사건 ID(caseId)를 키로 집합(Set)을 구성하여 동일 사건이 두 번 카운트되지 않도록 보장
    const freeQuotaConsumedCaseIds = new Set<string>();

    // 1. 이미 정상 차감된 신규 원장 중 MONTHLY_FREE 건 추가
    if (deductionsSnap && deductionsSnap.docs) {
      for (const dDoc of deductionsSnap.docs) {
        const item = (typeof dDoc.data === 'function' ? dDoc.data() : dDoc.data) as MaternityDeductionLedgerItem;
        if (item.status === 'DEDUCTED' && item.source === 'MONTHLY_FREE') {
          freeQuotaConsumedCaseIds.add(item.maternityCaseId);
        }
      }
    }

    // 2. 과거 레거시 사건(신규 원장/deductionInfo 없이 당월에 완료/종결된 레거시 사건) 중 취소되지 않은 건 추가
    if (casesSnap && casesSnap.docs) {
      for (const cDoc of casesSnap.docs) {
        const c = (typeof cDoc.data === 'function' ? cDoc.data() : cDoc.data) as MaternityCase;
        // 현재 차감 대상 사건은 아직 차감 전이므로 집계에서 제외
        if (c.id === caseId) continue;
        if (c.status === 'CANCELLED') continue;

        const cMonth = c.applicationDate?.slice(0, 7) || c.createdAt?.slice(0, 7) || '';
        if (cMonth === resolvedYearMonth) {
          // deductionInfo가 있는 건은 1번(신규 원장)에서 이미 판정되었거나 PREPAID_TICKET 건임
          // deductionInfo가 없는 건 중 과거에 완료/소급 처리된 레거시 사건만 무료 슬롯 점유 건으로 가산
          if ((!c.deductionInfo || !c.deductionInfo.deductionId) && isLegacyMaternityCase(c, options)) {
            freeQuotaConsumedCaseIds.add(c.id);
          }
        }
      }
    }

    const currentMonthFreeUsed = freeQuotaConsumedCaseIds.size;
    const currentPurchasedTickets = Math.max(0, companyData.purchasedMaternityTickets || 0);

    // [Pill 5 & 6] 순수 판정 함수를 통해 적격 여부 및 차감 출처 최종 판정 (단일 자격 판정 수행)
    const eligibility = evaluateMaternityDeductionEligibility({
      maternityCase: caseData,
      companyId: targetCompanyId,
      company: companyData,
      subscription: companyData.subscription,
      referenceDateString: workStartReferenceDate, // [R2-8 2/4-C-⑨-3] 실제 업무 착수일 기준 구독 유효 여부 판정
      targetYearMonth: resolvedYearMonth,          // [R2-8 2/4-C-⑨-3] 실제 업무 착수일이 속한 월 귀속
      currentMonthFreeUsed,
      purchasedTicketsRemaining: currentPurchasedTickets,
      existingLedgerItem: ledgerSnap.exists
        ? ((typeof ledgerSnap.data === 'function' ? ledgerSnap.data() : ledgerSnap.data) as MaternityDeductionLedgerItem)
        : null,
      options,
    });

    if (!eligibility.canDeduct || !eligibility.determinedSource) {
      throw new MaternityDeductionError(
        'QUOTA_EXHAUSTED',
        eligibility.reason || '모성보호 이용 횟수가 모두 소진되어 차감할 수 없습니다.',
        {
          eligibility,
          planCode: eligibility.planCode,
          resolvedYearMonth,
          currentMonthFreeUsed,
          currentPurchasedTickets,
        }
      );
    }

    const determinedSource = eligibility.determinedSource;
    const planCode: PlanCode = eligibility.planCode;
    const monthlyFreeQuota = eligibility.monthlyFreeQuota ?? 0;
    const now = new Date().toISOString();

    // 차감 원장 및 사건 임베디드 페이로드 생성
    const { ledgerItem, caseDeductionInfo } = createDeductionLedgerPayload({
      companyId: targetCompanyId,
      maternityCaseId: caseId,
      source: determinedSource,
      yearMonth: resolvedYearMonth,
      actorUid: caller.uid,
      actorRole: caller.role,
      actorName: caller.displayName,
      notes,
    });

    // [WRITE 1] 차감 원장 문서 기록 (maternity_deductions)
    const cleanLedgerItem = Object.fromEntries(
      Object.entries(ledgerItem).filter(([_, v]) => v !== undefined)
    );
    transaction.set(ledgerRef, cleanLedgerItem);

    // [WRITE 2] 모성보호 사건 문서에 deductionInfo 및 요청 시 targetStatus 원자적 업데이트 (maternity_cases)
    const caseUpdatePayload: Record<string, any> = {
      deductionInfo: caseDeductionInfo,
      updatedAt: now,
      updatedById: caller.uid,
    };
    if (params.targetStatus) {
      caseUpdatePayload.status = params.targetStatus;
    }
    if (params.assignedAttorneyId) {
      caseUpdatePayload.assignedAttorneyId = params.assignedAttorneyId;
    }
    if (params.statusChangeHistoryItem) {
      const currentHist = Array.isArray(caseData.history) ? caseData.history : [];
      caseUpdatePayload.history = [...currentHist, params.statusChangeHistoryItem];
    } else if (params.assignedAttorneyId) {
      const currentHist = Array.isArray(caseData.history) ? caseData.history : [];
      caseUpdatePayload.history = [
        ...currentHist,
        {
          action: '담당 노무사 배정',
          previousStatus: caseData.status,
          newStatus: params.targetStatus || caseData.status,
          timestamp: now,
          actor: caller.displayName || '관리자',
          actorUid: caller.uid,
          notes: params.notes || `담당 노무사 배정 (${params.assignedAttorneyId})`,
        },
      ];
    }
    if (params.extraCaseUpdates) {
      Object.assign(caseUpdatePayload, safeExtraCaseUpdates);
    }
    transaction.update(caseRef, caseUpdatePayload);

    // [WRITE 3] 기업 문서 업데이트 (companies) - 동일 기업 동시 신청 직렬화 및 무료/선불 초과 차감 방지
    // [R2-8 2/4-A-⑥-6] MONTHLY_FREE 차감 시에도 companies/{companyId} 문서를 트랜잭션에서 갱신하여
    // 동일 기업의 동시 신청을 직렬화하고 재시도 시 최신 잔여 횟수를 재계산하도록 보장
    let newPurchasedTickets = currentPurchasedTickets;
    if (determinedSource === 'PREPAID_TICKET') {
      newPurchasedTickets = Math.max(0, currentPurchasedTickets - 1);
      transaction.update(companyRef, {
        purchasedMaternityTickets: newPurchasedTickets,
        lastMaternityDeductionAt: now,
        updatedAt: now,
      });
    } else {
      // MONTHLY_FREE 차감 시에도 companies/{companyId} 문서를 트랜잭션에서 읽고 갱신하여 직렬화
      transaction.update(companyRef, {
        lastMaternityDeductionAt: now,
        updatedAt: now,
      });
    }

    // 차감 후 잔여 횟수 계산
    const remainingMonthlyFree =
      determinedSource === 'MONTHLY_FREE'
        ? Math.max(0, monthlyFreeQuota - (currentMonthFreeUsed + 1))
        : Math.max(0, monthlyFreeQuota - currentMonthFreeUsed);

    const totalRemaining = remainingMonthlyFree + newPurchasedTickets;

    return {
      success: true,
      deductionId: ledgerItem.deductionId,
      caseId,
      companyId: targetCompanyId,
      source: determinedSource,
      yearMonth: resolvedYearMonth,
      deductedAt: now,
      remainingMonthlyFree,
      remainingPurchasedTickets: newPurchasedTickets,
      totalRemaining,
      ledgerItem,
      caseDeductionInfo,
      targetStatus: params.targetStatus,
      alreadyDeducted: false,
    };
  });
}

/**
 * [R2-8 2/4-A-⑥-1 & ⑥-9] Firebase ID Token을 이용한 호출자 인증 및 차감 실행 헬퍼
 * 
 * - Express 라우트나 서버 엔드포인트에서 Bearer Token을 파싱하여 안전하게 실행할 때 사용
 */
export async function executeDeductionWithIdToken(params: {
  idToken: string;
  targetCompanyId: string;
  caseId: string;
  targetYearMonth?: string;
  referenceDateString?: string;
  workStartDate?: string;
  notes?: string;
  options?: LegacyCheckOptions;
  targetStatus?: import('../types').MaternityStatus;
  statusChangeHistoryItem?: import('../types').MaternityCaseHistoryItem;
  extraCaseUpdates?: Partial<import('../types').MaternityCase>;
  allowSkipIfAlreadyDeducted?: boolean;
  assignedAttorneyId?: string;
}): Promise<MaternityDeductionTransactionResult> {
  if (!isFirebaseAdminConfigured()) {
    throw new MaternityDeductionError(
      'TRANSACTION_FAILED',
      'Firebase Admin SDK가 구성되지 않았습니다. FIREBASE_SERVICE_ACCOUNT_KEY 환경변수를 확인하세요.'
    );
  }

  const {
    idToken,
    targetCompanyId,
    caseId,
    targetYearMonth,
    referenceDateString,
    workStartDate,
    notes,
    options,
    targetStatus,
    statusChangeHistoryItem,
    extraCaseUpdates,
    allowSkipIfAlreadyDeducted,
    assignedAttorneyId,
  } = params;
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  // 1. ID Token 검증
  const decoded = await adminAuth.verifyIdToken(idToken);
  const callerUid = decoded.uid;

  // 2. 호출자 역할 및 소속 기업 조회
  let role: MaternityDeductionCallerContext['role'] = 'WORKER';
  let companyId: string | undefined = undefined;
  let displayName: string | undefined = decoded.name || decoded.email;

  // 2-1: admins 컬렉션 확인
  const adminDoc = await adminDb.collection('admins').doc(callerUid).get();
  if (adminDoc.exists) {
    role = 'ADMIN';
  } else {
    // 2-2: users 컬렉션 확인
    const userDoc = await adminDb.collection('users').doc(callerUid).get();
    if (userDoc.exists) {
      const uData = userDoc.data();
      if (uData?.role === 'ADMIN') {
        role = 'ADMIN';
      } else if (uData?.role === 'COMPANY') {
        role = 'COMPANY';
        companyId = uData.companyId;
      } else {
        role = 'WORKER';
        companyId = uData?.companyId;
      }
      displayName = uData?.displayName || displayName;
    }
  }

  const caller: MaternityDeductionCallerContext = {
    uid: callerUid,
    role,
    companyId,
    displayName,
  };

  return executeMaternityDeductionTransaction({
    caller,
    companyId: targetCompanyId,
    caseId,
    targetYearMonth,
    referenceDateString,
    workStartDate,
    notes,
    options,
    targetStatus,
    statusChangeHistoryItem,
    extraCaseUpdates,
    allowSkipIfAlreadyDeducted,
    assignedAttorneyId,
  });
}
