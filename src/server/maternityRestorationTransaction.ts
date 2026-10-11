import {
  MaternityCase,
  Company,
  MaternityCaseHistoryItem,
  MaternityRestorationErrorCode,
  MaternityDeductionCallerContext,
  MaternityRestorationTransactionParams,
  MaternityRestorationTransactionResult,
  MaternityDeductionLedgerItem,
} from '../types';
import {
  MATERNITY_DEDUCTIONS_COLLECTION,
  buildDeductionLedgerDocId,
  evaluateMaternityRestorationEligibility,
  hasMaternityWorkStarted,
} from '../services/maternityUsageService';
import { isFirebaseAdminConfigured, getAdminAuth, getAdminDb } from './firebaseAdmin';

/**
 * [R2-8 2/4-A-⑥-3] 모성보호 복구 트랜잭션 전용 에러 클래스
 */
export class MaternityRestorationError extends Error {
  constructor(
    public readonly code: MaternityRestorationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MaternityRestorationError';
  }
}

/**
 * [R2-8 2/4-A-⑥-3] 복구 호출자 권한 및 기본 기업 격리 검증 함수
 */
export function validateCallerRestorationPermission(
  caller: MaternityDeductionCallerContext,
  targetCompanyId: string
): void {
  if (!caller || !caller.uid) {
    throw new MaternityRestorationError('UNAUTHORIZED', '로그인이 필요합니다. (인증 정보 없음)');
  }

  if (caller.role === 'WORKER') {
    throw new MaternityRestorationError(
      'FORBIDDEN',
      '근로자(WORKER) 계정은 모성보호 이용권 복구 트랜잭션을 실행할 수 없습니다.'
    );
  }

  if (caller.role !== 'ADMIN' && caller.role !== 'COMPANY') {
    throw new MaternityRestorationError(
      'FORBIDDEN',
      `복구 실행 권한이 없습니다. (ADMIN 또는 COMPANY 권한 필요, 현재 역할: ${caller.role})`
    );
  }

  if (caller.role === 'COMPANY') {
    if (!caller.companyId) {
      throw new MaternityRestorationError(
        'FORBIDDEN',
        '소속 기업 정보가 없는 기업 담당자 계정입니다.'
      );
    }
    if (caller.companyId !== targetCompanyId) {
      throw new MaternityRestorationError(
        'DATA_ISOLATION_VIOLATION',
        '타 기업의 모성보호 사건에 대해 복구를 실행할 수 없습니다. (기업별 데이터 격리 위반)',
        { callerCompanyId: caller.companyId, targetCompanyId }
      );
    }
  }
}

/**
 * [R2-8 2/4-A-⑥-3] 서버 측 Firestore Transaction 기반 모성보호 이용권 실제 복구 함수
 * 
 * 보장 규칙:
 * 1. ADMIN/COMPANY 권한 검증 및 타사 접근 차단
 * 2. 착수 전 취소 건: 자동 복구 승인
 * 3. 업무 착수 후 취소·반려 건: ADMIN의 확인/승인(`adminApprovalConfirmed: true`) 필수, COMPANY 직접 복구 차단
 * 4. 동일 사건 중복 복구 방지 (원장 status 확인 및 사건 deductionInfo.restoredAt 검증)
 * 5. 원장과 사건 deductionInfo 일치 검증 (deductionId, source, yearMonth)
 * 6. PREPAID_TICKET: 선불 이용권 1회 반환 (companies.purchasedMaternityTickets + 1)
 * 7. MONTHLY_FREE: 당월 내 취소 시에만 무료 횟수 반환 (원장이 RESTORED로 전이되어 향후 사용량 집계에서 자동 제외)
 * 8. 익월 취소 시 무료 횟수 이월 차단 (EXPIRED_MONTHLY_FREE)
 * 9. 복구와 사건 CANCELLED 상태 원자적 동시 전이 및 복구 처리자/이력 기록
 * 10. 실패 시 전체 롤백
 */
export async function executeMaternityRestorationTransaction(
  params: MaternityRestorationTransactionParams,
  injectedDb?: any
): Promise<MaternityRestorationTransactionResult> {
  const {
    caller,
    companyId: targetCompanyId,
    caseId,
    cancellationReason,
    adminApprovalConfirmed = false,
    cancellationDate,
    targetCaseCancellation = true,
  } = params;

  // 1. 권한 및 기업별 데이터 격리 1차 검증
  validateCallerRestorationPermission(caller, targetCompanyId);

  // 2. DB 인스턴스 획득 (주입 DB 또는 Firebase Admin DB)
  const db = injectedDb || getAdminDb();
  if (!db) {
    throw new MaternityRestorationError(
      'TRANSACTION_FAILED',
      'Firestore 데이터베이스 연결을 초기화할 수 없습니다.'
    );
  }

  // 3. Firestore Transaction 실행
  return await db.runTransaction(async (transaction: any) => {
    // [READ 1] 사건 문서 최신 조회
    const caseRef = db.collection('maternity_cases').doc(caseId);
    const caseSnap = await transaction.get(caseRef);
    if (!caseSnap.exists) {
      throw new MaternityRestorationError(
        'CASE_NOT_FOUND',
        `대상 모성보호 사건(${caseId})을 찾을 수 없습니다.`
      );
    }
    const caseData = (typeof caseSnap.data === 'function' ? caseSnap.data() : caseSnap.data) as MaternityCase;

    // 사건 소속 기업 데이터 격리 교차 검증
    if (caseData.companyId !== targetCompanyId) {
      throw new MaternityRestorationError(
        'DATA_ISOLATION_VIOLATION',
        '사건의 소속 기업과 요청 기업 ID가 일치하지 않습니다. (데이터 격리 위반)',
        { caseCompanyId: caseData.companyId, targetCompanyId }
      );
    }

    // [READ 2] 차감 원장 문서 최신 조회
    const ledgerDocId = buildDeductionLedgerDocId(targetCompanyId, caseId);
    const ledgerRef = db.collection(MATERNITY_DEDUCTIONS_COLLECTION).doc(ledgerDocId);
    const ledgerSnap = await transaction.get(ledgerRef);
    if (!ledgerSnap.exists) {
      throw new MaternityRestorationError(
        'LEDGER_NOT_FOUND',
        `해당 사건에 대한 차감 원장(${ledgerDocId})이 존재하지 않아 복구할 수 없습니다.`
      );
    }
    const ledgerData = (typeof ledgerSnap.data === 'function' ? ledgerSnap.data() : ledgerSnap.data) as MaternityDeductionLedgerItem;

    // 원장 소속 기업 교차 검증
    if (ledgerData.companyId !== targetCompanyId) {
      throw new MaternityRestorationError(
        'DATA_ISOLATION_VIOLATION',
        '차감 원장의 소속 기업과 요청 기업 ID가 일치하지 않습니다. (데이터 격리 위반)',
        { ledgerCompanyId: ledgerData.companyId, targetCompanyId }
      );
    }

    // 중복 복구 차단 1: 원장 상태 검증
    if (ledgerData.status === 'RESTORED') {
      throw new MaternityRestorationError(
        'ALREADY_RESTORED',
        '해당 사건은 이미 복구(RESTORED) 완료된 원장이 존재하여 중복 복구할 수 없습니다.'
      );
    }
    if (ledgerData.status === 'CANCELLED') {
      throw new MaternityRestorationError(
        'NOT_ELIGIBLE_FOR_RESTORATION',
        '취소 종결(CANCELLED) 처리된 원장으로 복구할 수 없습니다.'
      );
    }
    if (ledgerData.status !== 'DEDUCTED') {
      throw new MaternityRestorationError(
        'NOT_ELIGIBLE_FOR_RESTORATION',
        `DEDUCTED 상태의 원장만 복구할 수 있습니다. (현재 원장 상태: ${ledgerData.status})`
      );
    }

    // 중복 복구 차단 2: 사건 deductionInfo 및 restoredAt 검증
    const deductionInfo = caseData.deductionInfo;
    if (!deductionInfo) {
      throw new MaternityRestorationError(
        'NOT_ELIGIBLE_FOR_RESTORATION',
        '사건 문서에 차감 메타데이터(deductionInfo)가 존재하지 않습니다.'
      );
    }
    if (deductionInfo.restoredAt) {
      throw new MaternityRestorationError(
        'ALREADY_RESTORED',
        '사건에 이미 복구 일시(restoredAt)가 기록되어 있어 중복 복구할 수 없습니다.'
      );
    }

    // 사건 deductionInfo와 원장 메타데이터 일치 검증
    if (deductionInfo.deductionId !== ledgerData.deductionId) {
      throw new MaternityRestorationError(
        'NOT_ELIGIBLE_FOR_RESTORATION',
        '사건의 차감 ID와 원장의 차감 ID가 일치하지 않습니다. (데이터 불일치)'
      );
    }
    if (deductionInfo.source !== ledgerData.source) {
      throw new MaternityRestorationError(
        'NOT_ELIGIBLE_FOR_RESTORATION',
        '사건의 차감 출처와 원장의 차감 출처가 일치하지 않습니다. (데이터 불일치)'
      );
    }
    if (deductionInfo.yearMonth !== ledgerData.yearMonth) {
      throw new MaternityRestorationError(
        'NOT_ELIGIBLE_FOR_RESTORATION',
        '사건의 차감 연월과 원장의 차감 연월이 일치하지 않습니다. (데이터 불일치)'
      );
    }

    // 사건 상태 검증: 취소 상태가 아니고 이번 트랜잭션에서 취소 전이도 허용되지 않는 경우 차단
    if (caseData.status !== 'CANCELLED' && !targetCaseCancellation) {
      throw new MaternityRestorationError(
        'INVALID_STATE',
        `취소(CANCELLED) 상태가 아니거나 취소 전이가 요청되지 않은 사건(${caseData.status})은 복구할 수 없습니다.`
      );
    }

    // [READ 3] 기업 문서 최신 조회 (선불 이용권 반환용)
    const companyRef = db.collection('companies').doc(targetCompanyId);
    const companySnap = await transaction.get(companyRef);
    if (!companySnap.exists) {
      throw new MaternityRestorationError(
        'COMPANY_NOT_FOUND',
        `기업 정보(${targetCompanyId})를 찾을 수 없습니다.`
      );
    }
    const companyData = (typeof companySnap.data === 'function' ? companySnap.data() : companySnap.data) as Company;

    // [CHECK 4] 실제 업무 착수 여부 판정 및 관리자 승인 여부 서버 검증
    const workStarted = hasMaternityWorkStarted(caseData);
    if (workStarted) {
      // 업무 착수 건: COMPANY는 직접 복구 불가, 오직 ADMIN만 승인 후 복구 가능
      if (caller.role !== 'ADMIN') {
        throw new MaternityRestorationError(
          'ADMIN_APPROVAL_REQUIRED',
          '노무사 검토 착수 또는 업무 진행 후 취소·반려된 사건은 관리자(ADMIN)의 승인이 필요합니다. 기업 담당자는 직접 복구할 수 없습니다.'
        );
      }
      // ADMIN 호출자라도 승인 확인 플래그가 없으면 차단
      if (!adminApprovalConfirmed) {
        throw new MaternityRestorationError(
          'ADMIN_APPROVAL_REQUIRED',
          '업무 착수 후 취소 사건에 대한 관리자 복구 승인 확인(adminApprovalConfirmed)이 필요합니다.'
        );
      }
    }

    // [EVALUATION] ⑥-2 순수 복구 판정 함수 실행
    const now = new Date().toISOString();
    const effectiveCancellationDate = cancellationDate || now;
    const resolvedCancellationYearMonth = effectiveCancellationDate.slice(0, 7);

    // 판정 시 사건이 CANCELLED 상태로 전이된 상태로 평가
    const simulatedCaseForEval: MaternityCase = {
      ...caseData,
      status: 'CANCELLED',
    };

    const evalResult = evaluateMaternityRestorationEligibility({
      maternityCase: simulatedCaseForEval,
      ledgerItem: ledgerData,
      requestCompanyId: targetCompanyId,
      cancellationYearMonth: resolvedCancellationYearMonth,
      cancellationDate: effectiveCancellationDate,
      allowAdminOverride: workStarted && caller.role === 'ADMIN' && Boolean(adminApprovalConfirmed),
    });

    if (!evalResult.canRestore) {
      if (evalResult.restorationType === 'EXPIRED_MONTHLY_FREE') {
        throw new MaternityRestorationError(
          'EXPIRED_MONTHLY_FREE',
          evalResult.reason
        );
      }
      throw new MaternityRestorationError(
        'NOT_ELIGIBLE_FOR_RESTORATION',
        evalResult.reason
      );
    }

    // [WRITE 1] 원장 문서 RESTORED 업데이트 및 복구 처리자/이력 기록
    const updatedLedgerFields: Partial<MaternityDeductionLedgerItem> = {
      status: 'RESTORED',
      restoredAt: now,
      restorationReason: cancellationReason || evalResult.reason,
      restoredByUid: caller.uid,
      restoredByRole: caller.role,
      restoredByName: caller.displayName,
      updatedAt: now,
    };
    transaction.update(ledgerRef, updatedLedgerFields);

    // [WRITE 2] 사건 문서 취소(CANCELLED) 및 deductionInfo.restoredAt 원자적 전이
    const newHistoryItem: MaternityCaseHistoryItem = {
      action: '사건 취소 및 이용권 복구',
      previousStatus: caseData.status,
      newStatus: 'CANCELLED',
      timestamp: now,
      actor: caller.displayName || (caller.role === 'ADMIN' ? '관리자' : '기업담당자'),
      actorUid: caller.uid,
      notes: cancellationReason || evalResult.reason,
    };

    const updatedCaseFields: any = {
      status: 'CANCELLED',
      updatedAt: now,
      updatedById: caller.uid,
      deductionInfo: {
        ...deductionInfo,
        restoredAt: now,
        restorationReason: cancellationReason || evalResult.reason,
      },
      history: [...(caseData.history || []), newHistoryItem],
    };
    transaction.update(caseRef, updatedCaseFields);

    // [WRITE 3] 선불 이용권 복구 시 기업 보유 티켓 수량 1회 반환
    const previousPurchasedTickets = companyData.purchasedMaternityTickets || 0;
    let newPurchasedTickets = previousPurchasedTickets;

    if (evalResult.restorableSource === 'PREPAID_TICKET') {
      newPurchasedTickets = previousPurchasedTickets + 1;
      transaction.update(companyRef, {
        purchasedMaternityTickets: newPurchasedTickets,
        updatedAt: now,
      });
    }

    const updatedLedger: MaternityDeductionLedgerItem = {
      ...ledgerData,
      ...updatedLedgerFields,
    };

    const updatedCase: MaternityCase = {
      ...caseData,
      ...updatedCaseFields,
    };

    return {
      success: true,
      deductionId: ledgerData.deductionId,
      caseId,
      companyId: targetCompanyId,
      restorationType: evalResult.restorationType,
      restorableSource: evalResult.restorableSource,
      restoredSource: evalResult.restorableSource,
      restoredQuantity: evalResult.restoredQuantity || 1,
      restoredAt: now,
      restorationReason: cancellationReason || evalResult.reason,
      previousPurchasedTickets,
      newPurchasedTickets,
      ledgerItem: updatedLedger,
      caseDeductionInfo: updatedCase.deductionInfo!,
    };
  });
}

/**
 * [R2-8 2/4-A-⑥-3] Firebase ID Token을 이용한 호출자 인증 및 복구 실행 래퍼
 */
export async function executeRestorationWithIdToken(params: {
  idToken: string;
  targetCompanyId: string;
  caseId: string;
  cancellationReason?: string;
  adminApprovalConfirmed?: boolean;
  cancellationDate?: string;
  targetCaseCancellation?: boolean;
}): Promise<MaternityRestorationTransactionResult> {
  if (!isFirebaseAdminConfigured()) {
    throw new MaternityRestorationError(
      'TRANSACTION_FAILED',
      'Firebase Admin SDK가 구성되지 않았습니다. FIREBASE_SERVICE_ACCOUNT_KEY 환경변수를 확인하세요.'
    );
  }

  const {
    idToken,
    targetCompanyId,
    caseId,
    cancellationReason,
    adminApprovalConfirmed,
    cancellationDate,
    targetCaseCancellation,
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

  return executeMaternityRestorationTransaction({
    caller,
    companyId: targetCompanyId,
    caseId,
    cancellationReason,
    adminApprovalConfirmed,
    cancellationDate,
    targetCaseCancellation,
  });
}
