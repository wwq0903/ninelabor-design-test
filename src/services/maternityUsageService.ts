import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Company,
  CompanySubscription,
  UserProfile,
  CompanyMaternityUsageSummary,
  MaternityCase,
  PlanCode,
  UserRole,
  MaternityDeductionSource,
  MaternityDeductionStatus,
  MaternityCaseDeductionInfo,
  MaternityDeductionLedgerItem,
  EvaluateMaternityDeductionInput,
  MaternityDeductionEligibilityResult,
  LegacyCheckOptions,
  MaternityStatus,
  MaternityRestorationType,
  EvaluateMaternityRestorationInput,
  MaternityRestorationEligibilityResult,
} from '../types';
import { firmService } from './firmService';
import {
  MATERNITY_QUOTA_POLICY,
  MATERNITY_DEDUCTION_ORDER,
  getPlan,
} from '../config/plans';
import {
  getMaternityMonthlyFreeEligibility,
  MaternityMonthlyFreeEligibility,
} from '../utils/subscriptionEntitlement';

/**
 * [R2-8 2/4-A-⑤-2] 모성보호 차감 원장 컬렉션 명세
 */
export const MATERNITY_DEDUCTIONS_COLLECTION = 'maternity_deductions';

/**
 * [R2-8 2/4-A-⑤-2 & ⑤-3] 레거시(기존) 사건 여부 판별기
 * 
 * - deductionInfo 유무만으로 한정하지 않고, 적용 기준일(cutOffDate), 기준 연월, 사건 완료 상태를 종합 평가
 * - 신규 신청 건과 과거 완료 건을 명확히 구분하여 기존 사건에 대한 소급 차감 금지 보장
 */
export function isLegacyMaternityCase(
  caseItem: MaternityCase,
  options?: LegacyCheckOptions
): boolean {
  // 1. 이미 deductionInfo가 정상 등록된 건은 레거시가 아님 (신규 차감 체계 기적용 건)
  if (caseItem.deductionInfo && caseItem.deductionInfo.deductionId) {
    return false;
  }

  // 2. 적용 기준일(cutOffDate)이 지정된 경우: 기준일 이전 등록 건은 레거시 확정 (소급 차감 방지)
  if (options?.cutOffDate && caseItem.createdAt) {
    const caseTime = new Date(caseItem.createdAt).getTime();
    const cutOffTime = new Date(options.cutOffDate).getTime();
    if (!isNaN(caseTime) && !isNaN(cutOffTime)) {
      return caseTime < cutOffTime;
    }
  }

  // 3. 적용 기준 연월(effectiveYearMonth)이 지정된 경우: 기준 연월 이전 등록 건은 레거시 확정
  if (options?.effectiveYearMonth) {
    const caseDate = caseItem.applicationDate || caseItem.createdAt || '';
    if (caseDate) {
      return caseDate.slice(0, 7) < options.effectiveYearMonth;
    }
  }

  // 4. 이미 과거에 '완료(COMPLETED)' 처리되어 종료된 사건 중 deductionInfo가 없는 건은 소급 차감 불가한 레거시 건
  if (caseItem.status === 'COMPLETED') {
    return true;
  }

  // 5. 기준일/기준연월 옵션이 없고 완료 상태도 아닌 신규 신청/진행 건은 신규 판정 대상 건 (레거시 아님)
  return false;
}

/**
 * [R2-8 2/4-A-⑤-2] 중복 차감 방지 식별자 생성기
 * 
 * - 동일 사건에 대한 중복 차감 방지 (사건당 1건의 차감 고유 키 보장)
 */
export function buildDeductionIdempotencyKey(
  companyId: string,
  maternityCaseId: string,
  source: MaternityDeductionSource
): string {
  return `${companyId}_${maternityCaseId}_${source}`;
}

/**
 * [R2-8 2/4-A-⑤-2] 차감 원장 문서 ID 생성기
 * 
 * - Firestore 트랜잭션에서 동일 사건에 대한 원자적 단일 문서를 보장하는 ID 패턴
 */
export function buildDeductionLedgerDocId(companyId: string, maternityCaseId: string): string {
  return `deduct_${companyId}_${maternityCaseId}`;
}

/**
 * [R2-8 2/4-A-⑤-2] 차감/복구 상태 전이 유효성 검증
 * 
 * - 중복 차감 방지: 이미 차감된 상태에서 중복 차감 불가
 * - 중복 복구 방지: DEDUCTED 상태에서만 복구 가능 (이미 RESTORED인 경우 차단)
 */
export function validateDeductionTransition(
  currentStatus: MaternityDeductionStatus | null,
  targetAction: 'DEDUCT' | 'RESTORE' | 'CANCEL'
): { allowed: boolean; reason?: string } {
  if (targetAction === 'DEDUCT') {
    if (currentStatus !== null) {
      return { allowed: false, reason: `이미 차감 처리된 사건입니다. (현재 상태: ${currentStatus})` };
    }
    return { allowed: true };
  }

  if (targetAction === 'RESTORE' || targetAction === 'CANCEL') {
    if (currentStatus === null) {
      return { allowed: false, reason: '차감 이력이 존재하지 않아 복구/취소할 수 없습니다.' };
    }
    if (currentStatus === 'RESTORED') {
      return { allowed: false, reason: '이미 복구 처리 완료된 건입니다. (중복 복구 차단)' };
    }
    if (currentStatus === 'CANCELLED') {
      return { allowed: false, reason: '이미 취소 종결된 건입니다.' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: '지원하지 않는 차감 액션입니다.' };
}

/**
 * [R2-8 2/4-C-⑨-2] 모성보호 무료 쿼터 및 플랜 파라미터 공통 해석 헬퍼
 * - 핵심 판정은 getMaternityMonthlyFreeEligibility(company || subscription, referenceDateString)를 단일 기준으로 호출
 * - subscription/company가 생략된 레거시 단위 테스트를 위한 fallback(explicitMonthlyFreeQuota, paramPlanCode)을 일원화
 */
export function resolveMaternityQuotaContext(params: {
  company?: Company | null;
  subscription?: CompanySubscription | null;
  explicitMonthlyFreeQuota?: number;
  paramPlanCode?: PlanCode;
  referenceDateString?: string;
}): {
  monthlyFreeQuota: number;
  resolvedPlanCode: PlanCode;
  eligibilityReason?: string;
} {
  const { company, subscription, explicitMonthlyFreeQuota, paramPlanCode, referenceDateString } = params;

  if (company || subscription !== undefined) {
    const freeEligibility = getMaternityMonthlyFreeEligibility(company || subscription, referenceDateString);
    return {
      monthlyFreeQuota: freeEligibility.monthlyFreeQuota,
      resolvedPlanCode: freeEligibility.effectivePlanCode,
      eligibilityReason: freeEligibility.reason,
    };
  }

  if (explicitMonthlyFreeQuota !== undefined) {
    return {
      monthlyFreeQuota: explicitMonthlyFreeQuota,
      resolvedPlanCode: paramPlanCode || 'FREE',
    };
  }

  if (paramPlanCode) {
    // 하위 호환: 순수 단위테스트 등에서 planCode만 전달된 경우
    const policy = MATERNITY_QUOTA_POLICY[paramPlanCode] || {
      monthlyFreeQuota: 0,
      allowRollover: false,
      description: '무료 횟수 없음',
    };
    return {
      monthlyFreeQuota: policy.monthlyFreeQuota,
      resolvedPlanCode: paramPlanCode,
    };
  }

  return {
    monthlyFreeQuota: 0,
    resolvedPlanCode: 'FREE',
  };
}

/**
 * [R2-8 2/4-A-⑤-3] 모성보호 차감 대상 판정 순수 함수 (Pure Decision Function)
 * 
 * 실제 Firestore 쓰기 없이, 차감 실행 전 적격 여부와 차감 출처를 사전 판정합니다:
 * 1. 기업별 데이터 격리 검증: 사건 소속 companyId와 요청 companyId 일치 확인
 * 2. 레거시 사건 소급 차감 금지: 기존 사건에 대한 소급 차감 차단
 * 3. 중복 차감 방지: DEDUCTED 상태 및 RESTORED 상태의 재차감 전면 차단 (출처 무관)
 * 4. 차감 우선순위 (중앙 정책 단일 참조):
 *    - STANDARD: 당월 무료 잔여 횟수(월 5회) 우선 차감 -> 소진 시 구매 선불 이용권 차감
 *    - FREE, BASIC, OUTSOURCING, CUSTOM: 무료 0회 -> 구매 선불 이용권만 차감 가능
 *    - 모두 소진 시: 이용 불가(canDeduct: false) 및 명확한 사유 반환
 */
export function evaluateMaternityDeductionEligibility(
  input: EvaluateMaternityDeductionInput
): MaternityDeductionEligibilityResult {
  const {
    maternityCase,
    companyId,
    planCode: paramPlanCode,
    company,
    subscription,
    referenceDateString,
    monthlyFreeQuota: explicitMonthlyFreeQuota,
    targetYearMonth = new Date().toISOString().slice(0, 7),
    currentMonthFreeUsed = 0,
    purchasedTicketsRemaining = 0,
    existingLedgerItem,
    options,
  } = input;

  // [R2-8 2/4-C-⑨-3] 실제 업무 착수일 기준일: 명시된 기준일 또는 targetYearMonth 기반
  const effectiveRefDate =
    referenceDateString ||
    (targetYearMonth && /^\d{4}-\d{2}$/.test(targetYearMonth) ? `${targetYearMonth}-01` : undefined);

  // [R2-8 2/4-C-⑨-2] 공통 fallback 헬퍼를 통해 자격 및 월 무료 한도 단일 산출 (Source of Truth: subscription)
  const quotaContext = resolveMaternityQuotaContext({
    company,
    subscription,
    explicitMonthlyFreeQuota,
    paramPlanCode,
    referenceDateString: effectiveRefDate,
  });

  const planCode = quotaContext.resolvedPlanCode;
  const monthlyFreeQuota = quotaContext.monthlyFreeQuota;
  const eligibilityReason = quotaContext.eligibilityReason;

  // 1. 기업별 데이터 격리 검증
  if (maternityCase.companyId !== companyId) {
    return {
      canDeduct: false,
      reason: '사건의 소속 기업 ID와 요청 기업 ID가 일치하지 않습니다. (데이터 격리 위반)',
      planCode,
      monthlyFreeQuota,
      targetYearMonth,
      monthlyFreeRemainingBefore: 0,
      purchasedTicketsRemainingBefore: Math.max(0, purchasedTicketsRemaining),
      totalAvailableRemainingBefore: 0,
      caseId: maternityCase.id,
      companyId,
    };
  }

  // 2. 레거시(기존) 사건 소급 차감 금지 검증
  if (isLegacyMaternityCase(maternityCase, options)) {
    return {
      canDeduct: false,
      reason: '신규 차감 정책 도입 이전의 기존(레거시) 사건은 소급 차감할 수 없습니다.',
      planCode,
      monthlyFreeQuota,
      targetYearMonth,
      monthlyFreeRemainingBefore: 0,
      purchasedTicketsRemainingBefore: Math.max(0, purchasedTicketsRemaining),
      totalAvailableRemainingBefore: 0,
      caseId: maternityCase.id,
      companyId,
    };
  }

  // 3. 동일 사건 중복 차감 방지 검증 (출처 무관, 동일 사건 중복 전면 차단)
  // 3-1: 사건 문서 내 deductionInfo 검증
  if (maternityCase.deductionInfo && maternityCase.deductionInfo.deductionId) {
    if (!maternityCase.deductionInfo.restoredAt) {
      return {
        canDeduct: false,
        reason: '해당 사건은 이미 차감 처리(DEDUCTED)되어 있어 중복 차감할 수 없습니다.',
        planCode,
        monthlyFreeQuota,
        targetYearMonth,
        monthlyFreeRemainingBefore: 0,
        purchasedTicketsRemainingBefore: Math.max(0, purchasedTicketsRemaining),
        totalAvailableRemainingBefore: 0,
        caseId: maternityCase.id,
        companyId,
      };
    } else {
      // RESTORED 상태의 재차감은 자동 허용하지 않음
      return {
        canDeduct: false,
        reason: '취소/복구(RESTORED) 이력이 있는 사건은 자동으로 재차감할 수 없습니다. 신규 신청 건으로 접수해야 합니다.',
        planCode,
        monthlyFreeQuota,
        targetYearMonth,
        monthlyFreeRemainingBefore: 0,
        purchasedTicketsRemainingBefore: Math.max(0, purchasedTicketsRemaining),
        totalAvailableRemainingBefore: 0,
        caseId: maternityCase.id,
        companyId,
      };
    }
  }

  // 3-2: 별도 원장 문서(existingLedgerItem) 존재 시 검증
  if (existingLedgerItem) {
    if (existingLedgerItem.status === 'DEDUCTED') {
      return {
        canDeduct: false,
        reason: '동일 사건에 대한 차감 원장이 이미 존재합니다. (중복 차감 차단)',
        planCode,
        monthlyFreeQuota,
        targetYearMonth,
        monthlyFreeRemainingBefore: 0,
        purchasedTicketsRemainingBefore: Math.max(0, purchasedTicketsRemaining),
        totalAvailableRemainingBefore: 0,
        caseId: maternityCase.id,
        companyId,
      };
    }
    if (existingLedgerItem.status === 'RESTORED') {
      return {
        canDeduct: false,
        reason: '이미 복구(RESTORED) 처리된 원장이 존재하는 사건으로 재차감이 불가합니다.',
        planCode,
        monthlyFreeQuota,
        targetYearMonth,
        monthlyFreeRemainingBefore: 0,
        purchasedTicketsRemainingBefore: Math.max(0, purchasedTicketsRemaining),
        totalAvailableRemainingBefore: 0,
        caseId: maternityCase.id,
        companyId,
      };
    }
    if (existingLedgerItem.status === 'CANCELLED') {
      return {
        canDeduct: false,
        reason: '취소 종결(CANCELLED)된 원장이 존재하는 사건입니다.',
        planCode,
        monthlyFreeQuota,
        targetYearMonth,
        monthlyFreeRemainingBefore: 0,
        purchasedTicketsRemainingBefore: Math.max(0, purchasedTicketsRemaining),
        totalAvailableRemainingBefore: 0,
        caseId: maternityCase.id,
        companyId,
      };
    }
  }

  // 4. [R2-8 2/4-C-⑨] 차감 우선순위 및 잔여 횟수 판정
  const safeUsed = Math.max(0, currentMonthFreeUsed);
  // 당월 무료 잔여 횟수 (이월 불가, 당월 한도 내)
  const monthlyFreeRemainingBefore = Math.max(0, monthlyFreeQuota - safeUsed);
  // 구매 선불 이용권 잔여 횟수
  const purchasedTicketsRemainingBefore = Math.max(0, purchasedTicketsRemaining);
  // 총 이용 가능 횟수
  const totalAvailableRemainingBefore = monthlyFreeRemainingBefore + purchasedTicketsRemainingBefore;

  // 우선순위 1: STANDARD 당월 무료 잔여 횟수 우선 차감
  if (monthlyFreeRemainingBefore > 0) {
    return {
      canDeduct: true,
      determinedSource: 'MONTHLY_FREE',
      planCode,
      monthlyFreeQuota,
      targetYearMonth,
      monthlyFreeRemainingBefore,
      purchasedTicketsRemainingBefore,
      totalAvailableRemainingBefore,
      caseId: maternityCase.id,
      companyId,
    };
  }

  // 우선순위 2: 무료 횟수 소진 시(또는 타 플랜/구독 비활성 시) 구매 선불 이용권 차감
  if (purchasedTicketsRemainingBefore > 0) {
    return {
      canDeduct: true,
      determinedSource: 'PREPAID_TICKET',
      planCode,
      monthlyFreeQuota,
      targetYearMonth,
      monthlyFreeRemainingBefore,
      purchasedTicketsRemainingBefore,
      totalAvailableRemainingBefore,
      caseId: maternityCase.id,
      companyId,
    };
  }

  // 우선순위 3: 모두 소진된 경우 이용 불가 반환
  let reason: string;
  if (planCode === 'STANDARD') {
    if (monthlyFreeQuota > 0) {
      reason = 'STANDARD 플랜의 당월 무료 5회가 모두 소진되었으며, 보유 중인 선불 이용권이 없어 이용할 수 없습니다. (선불 이용권 구매 필요)';
    } else if (eligibilityReason) {
      reason = `${eligibilityReason} 보유 중인 선불 이용권도 없어 이용할 수 없습니다. (선불 이용권 구매 필요)`;
    } else {
      reason = 'STANDARD 플랜의 월 무료 5회 혜택 자격이 없으며, 보유 중인 선불 이용권이 없어 이용할 수 없습니다. (선불 이용권 구매 필요)';
    }
  } else {
    reason = `${planCode} 플랜은 월 무료 제공 횟수가 없으며(0회), 보유 중인 선불 이용권이 없어 이용할 수 없습니다. (선불 이용권 구매 필요)`;
  }

  return {
    canDeduct: false,
    reason,
    planCode,
    monthlyFreeQuota,
    targetYearMonth,
    monthlyFreeRemainingBefore: 0,
    purchasedTicketsRemainingBefore: 0,
    totalAvailableRemainingBefore: 0,
    caseId: maternityCase.id,
    companyId,
  };
}

/**
 * [R2-8 2/4-A-⑤-2] 차감 원장 데이터 페이로드 생성 명세
 * (※ 설계 명세 함수: 이번 단계에서는 실제 Firestore 저장을 수행하지 않고 객체 구조만 생성)
 */
export function createDeductionLedgerPayload(params: {
  companyId: string;
  maternityCaseId: string;
  source: MaternityDeductionSource;
  yearMonth: string;
  actorUid: string;
  actorRole: UserRole;
  actorName?: string;
  notes?: string;
}): {
  ledgerItem: MaternityDeductionLedgerItem;
  caseDeductionInfo: MaternityCaseDeductionInfo;
} {
  const { companyId, maternityCaseId, source, yearMonth, actorUid, actorRole, actorName, notes } = params;
  const now = new Date().toISOString();
  const ledgerId = buildDeductionLedgerDocId(companyId, maternityCaseId);
  const idempotencyKey = buildDeductionIdempotencyKey(companyId, maternityCaseId, source);

  const ledgerItem: MaternityDeductionLedgerItem = {
    id: ledgerId,
    deductionId: ledgerId,
    companyId,
    maternityCaseId,
    source,
    quantity: 1,
    status: 'DEDUCTED',
    yearMonth,
    deductedAt: now,
    actorUid,
    actorRole,
    actorName,
    idempotencyKey,
    notes,
    createdAt: now,
    updatedAt: now,
  };

  const caseDeductionInfo: MaternityCaseDeductionInfo = {
    deductionId: ledgerId,
    source,
    yearMonth,
    deductedAt: now,
  };

  return { ledgerItem, caseDeductionInfo };
}

/**
 * [R2-8 2/4-A-④] 모성보호 이용 횟수 순수 계산 로직
 * 
 * 중앙 config(MATERNITY_QUOTA_POLICY)를 단일 기준으로 사용하여 계산:
 * - STANDARD: 매월 무료 5회
 * - FREE, BASIC, OUTSOURCING, CUSTOM: 무료 0회
 * - 이월 금지: 이전 달의 미사용 무료 횟수는 합산/이월되지 않음
 * - 차감 우선순위: [1순위] 당월 무료 횟수 -> [2순위] 구매 선불 이용권
 */
export function calculateMaternityQuota(params: {
  planCode?: PlanCode;
  company?: Company;
  subscription?: CompanySubscription | null;
  monthlyFreeQuota?: number;
  referenceDateString?: string;
  targetYearMonth: string;
  monthCasesCount: number;
  purchasedTicketsRemaining?: number;
}): Omit<CompanyMaternityUsageSummary, 'companyId' | 'companyName'> {
  const {
    planCode: paramPlanCode,
    company,
    subscription,
    monthlyFreeQuota: explicitMonthlyFreeQuota,
    referenceDateString,
    targetYearMonth,
    monthCasesCount,
    purchasedTicketsRemaining = 0,
  } = params;

  // 1. [R2-8 2/4-C-⑨-2] 공통 fallback 헬퍼를 통해 자격 및 월 무료 한도 단일 산출 (Source of Truth: subscription)
  const quotaContext = resolveMaternityQuotaContext({
    company,
    subscription,
    explicitMonthlyFreeQuota,
    paramPlanCode,
    referenceDateString,
  });

  const monthlyFreeQuota = quotaContext.monthlyFreeQuota;
  const resolvedPlanCode = quotaContext.resolvedPlanCode;

  // 2. 당월 무료 사용 횟수 (해당 월 무료 한도 내에서 사용된 건수)
  const safeCasesCount = Math.max(0, monthCasesCount);
  const monthlyFreeUsed = Math.min(monthlyFreeQuota, safeCasesCount);

  // 3. 당월 무료 잔여 횟수 (이월 불가, 당월 한도 기준)
  const monthlyFreeRemaining = Math.max(0, monthlyFreeQuota - monthlyFreeUsed);

  // 4. 구매 선불 이용권 총 잔여 횟수 (실제 구매 내역이 없으면 0)
  const safePurchasedTickets = Math.max(0, purchasedTicketsRemaining);

  // 5. 현재 이용 가능한 총 잔여 횟수 = 당월 무료 잔여 횟수 + 구매 선불 이용권 잔여 횟수
  const totalAvailableRemaining = monthlyFreeRemaining + safePurchasedTickets;

  return {
    currentPlan: resolvedPlanCode,
    targetYearMonth,
    monthlyFreeQuota,
    monthlyFreeUsed,
    monthlyFreeRemaining,
    purchasedTicketsRemaining: safePurchasedTickets,
    totalAvailableRemaining,
    deductionPriority: MATERNITY_DEDUCTION_ORDER,
  };
}

/**
 * [R2-8 2/4-A-④] 보안 및 데이터 접근 권한 검증
 * 
 * - WORKER: 기업의 이용권 및 횟수 관리 정보 조회 전면 차단
 * - COMPANY: 본인 기업(userProfile.companyId) 정보만 조회 가능 (클라이언트 위조 방지)
 * - ADMIN: 관리 대상 기업(companyId) 조회 허용
 */
export function validateCallerCompanyAccess(
  callerProfile: UserProfile | null | undefined,
  requestedCompanyId?: string
): string {
  if (!callerProfile) {
    throw new Error('로그인이 필요합니다. (인증 정보 없음)');
  }

  // WORKER 차단
  if (callerProfile.role === 'WORKER') {
    throw new Error('근로자(WORKER) 계정은 기업의 모성보호 이용권 및 횟수 관리 정보에 접근할 수 없습니다.');
  }

  // COMPANY 권한 검증: 본인 소속 기업만 허용
  if (callerProfile.role === 'COMPANY') {
    const callerCompanyId = callerProfile.companyId;
    if (!callerCompanyId) {
      throw new Error('소속 기업 정보가 등록되지 않은 기업 담당자 계정입니다.');
    }
    // 클라이언트가 임의로 타사 companyId를 전달했더라도 본인 회사와 불일치 시 차단
    if (requestedCompanyId && requestedCompanyId !== callerCompanyId) {
      throw new Error('타 기업의 모성보호 이용권 정보는 조회할 수 없습니다. (데이터 격리 위반)');
    }
    return callerCompanyId;
  }

  // ADMIN 권한: 관리 대상 companyId 필수
  if (callerProfile.role === 'ADMIN') {
    if (!requestedCompanyId || requestedCompanyId.trim().length === 0) {
      throw new Error('조회할 대상 기업 ID(companyId)가 지정되지 않았습니다.');
    }
    return requestedCompanyId.trim();
  }

  throw new Error('유효하지 않은 사용자 역할입니다.');
}

/**
 * [R2-8 2/4-A-④ & ⑤-2 & ⑤-3] 모성보호 이용 횟수, 차감 기록 및 판정 서비스 인터페이스
 * 
 * 이번 단계는 판정 순수 함수 및 데이터 모델 구현 단계이며,
 * 실제 Firestore 쓰기, 횟수 차감, 결제 등은 수행하지 않습니다.
 */
/**
 * [R2-8 2/4-A-⑥-2] 업무 착수 간주 기본 상태 목록
 * - 노무사 검토(UNDER_REVIEW), 행정 처리(IN_PROGRESS), 완료(COMPLETED), 서류 보완요청(SUPPLEMENT_REQUESTED)
 */
export const DEFAULT_WORK_STARTED_STATUSES: MaternityStatus[] = [
  'UNDER_REVIEW',
  'IN_PROGRESS',
  'COMPLETED',
  'SUPPLEMENT_REQUESTED',
];

/**
 * [R2-8 2/4-A-⑥-2] 사건에 대한 실제 업무 착수 여부 판정 헬퍼
 */
export function hasMaternityWorkStarted(
  caseItem: MaternityCase,
  workStartedStatuses: MaternityStatus[] = DEFAULT_WORK_STARTED_STATUSES
): boolean {
  // 1. 현재 사건 상태가 착수 간주 상태인 경우
  if (workStartedStatuses.includes(caseItem.status)) {
    return true;
  }

  // 2. 담당 노무사가 배정되어 검토에 들어간 이력이 있는 경우
  if (caseItem.assignedAttorneyId && caseItem.assignedAttorneyId.trim().length > 0) {
    return true;
  }

  // 3. 서류 보완 요청(supplementRequest)이 발송된 이력이 있는 경우
  if (caseItem.supplementRequest && caseItem.supplementRequest.requestedAt) {
    return true;
  }

  // 4. 완료 일시 또는 완료자 ID가 존재하는 경우
  if (caseItem.completedAt || caseItem.completedById) {
    return true;
  }

  // 5. 사건 이력(history) 중 착수 간주 상태를 거쳐간 기록이 있는 경우
  if (Array.isArray(caseItem.history)) {
    for (const h of caseItem.history) {
      if (h.newStatus && workStartedStatuses.includes(h.newStatus)) {
        return true;
      }
      if (h.previousStatus && workStartedStatuses.includes(h.previousStatus)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * [R2-8 2/4-A-⑥-2] 모성보호 이용권 취소·반려 시 복구 판정 순수 함수 (Pure Decision Function)
 * 
 * 실제 Firestore 쓰기 없이, 취소·반려 건에 대한 이용권 복구 가능 여부와 복구 대상을 판정합니다:
 * 1. 기업별 데이터 격리: 사건/원장의 companyId와 요청 companyId 일치 확인 (타사 접근 원천 차단)
 * 2. 원장 무결성 및 중복 방지:
 *    - DEDUCTED 상태의 원장만 복구 판정 대상
 *    - RESTORED/CANCELLED 상태의 중복 복구 차단
 *    - 사건 deductionInfo와 원장 메타데이터(deductionId, source, yearMonth) 일치 확인
 * 3. 사건 취소 상태 확인:
 *    - 취소 완료(CANCELLED) 상태만 복구 가능
 *    - SUPPLEMENT_REQUESTED 등 진행 중 상태는 복구 불가
 * 4. 실제 업무 착수 여부 구분:
 *    - 노무사 검토(UNDER_REVIEW) 및 업무 진행(IN_PROGRESS) 등 착수 후 취소·반려 시:
 *      자동 복구 여부는 미확정으로 두고 'REQUIRES_ADMIN_REVIEW' (관리자 검토 대상)으로 분류
 *    - 착수 전 취소 시: 'AUTO_RESTORE' 자동 복구 대상
 * 5. 복구 출처별 복구 기준:
 *    - PREPAID_TICKET: 복구 가능 시 선불 이용권 1회 반환 (이월 제한 없음)
 *    - MONTHLY_FREE: 차감 연월과 취소 연월이 같을 때만 해당 월 무료 횟수 1회 복구
 *    - MONTHLY_FREE 익월 취소: 무료 횟수 이월 금지 정책에 따라 소멸 ('EXPIRED_MONTHLY_FREE', 복구 불가)
 */
export function evaluateMaternityRestorationEligibility(
  input: EvaluateMaternityRestorationInput
): MaternityRestorationEligibilityResult {
  const {
    maternityCase,
    ledgerItem,
    requestCompanyId,
    cancellationYearMonth,
    cancellationDate,
    workStartedStatuses = DEFAULT_WORK_STARTED_STATUSES,
    allowAdminOverride = false,
  } = input;

  const caseId = maternityCase.id;
  const companyId = maternityCase.companyId;

  // 취소 연월 산출 (입력값 -> 취소일시 -> 현재 시점 YYYY-MM)
  const resolvedCancellationYearMonth =
    cancellationYearMonth && /^\d{4}-\d{2}$/.test(cancellationYearMonth)
      ? cancellationYearMonth
      : cancellationDate?.slice(0, 7) || new Date().toISOString().slice(0, 7);

  // 1. 기업별 데이터 격리 검증 (사건 및 원장)
  if (companyId !== requestCompanyId) {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '사건의 소속 기업 ID와 요청 기업 ID가 일치하지 않습니다. (기업별 데이터 격리 위반)',
      caseId,
      companyId,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  if (ledgerItem && ledgerItem.companyId !== requestCompanyId) {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '차감 원장의 소속 기업 ID와 요청 기업 ID가 일치하지 않습니다. (기업별 데이터 격리 위반)',
      caseId,
      companyId,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  // 2. 원장 유무 및 상태 검증 (중복 복구 차단)
  if (!ledgerItem) {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '해당 사건에 대한 차감 원장(ledgerItem)이 존재하지 않아 복구할 수 없습니다.',
      caseId,
      companyId,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  if (ledgerItem.status === 'RESTORED') {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '이미 복구(RESTORED) 처리 완료된 원장입니다. (중복 복구 차단)',
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  if (ledgerItem.status === 'CANCELLED') {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '이미 취소 종결(CANCELLED)된 원장입니다. (복구 불가)',
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  if (ledgerItem.status !== 'DEDUCTED') {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: `차감 원장 상태가 DEDUCTED가 아니므로 복구할 수 없습니다. (현재 상태: ${ledgerItem.status})`,
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  // 3. 사건 메타데이터(deductionInfo)와 원장 정보 정합성 검증
  const deductionInfo = maternityCase.deductionInfo;
  if (!deductionInfo) {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '사건 문서에 차감 메타데이터(deductionInfo)가 존재하지 않습니다. (정합성 오류)',
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  if (deductionInfo.restoredAt) {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '사건 메타데이터에 이미 복구 일시(restoredAt)가 기록되어 있습니다. (중복 복구 차단)',
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  if (deductionInfo.deductionId !== ledgerItem.deductionId) {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '사건의 차감 ID와 원장의 차감 ID가 일치하지 않습니다. (데이터 불일치)',
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  if (deductionInfo.source !== ledgerItem.source) {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '사건의 차감 출처와 원장의 차감 출처가 일치하지 않습니다. (데이터 불일치)',
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  if (deductionInfo.yearMonth !== ledgerItem.yearMonth) {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: '사건의 차감 적용 연월과 원장의 차감 연월이 일치하지 않습니다. (데이터 불일치)',
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  // 4. 사건 상태 검증 (진행 중 상태 복구 불가)
  if (maternityCase.status !== 'CANCELLED') {
    return {
      canRestore: false,
      restorationType: 'NOT_ELIGIBLE',
      requiresAdminReview: false,
      reason: `취소되지 않은 진행 중 사건(현재 상태: ${maternityCase.status})은 이용권을 복구할 수 없습니다. (취소 완료 건만 복구 가능)`,
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  // 5. 실제 업무 착수 후 취소·반려 여부 검증 (관리자 검토 대상)
  const workStarted = hasMaternityWorkStarted(maternityCase, workStartedStatuses);
  if (workStarted && !allowAdminOverride) {
    return {
      canRestore: false,
      restorationType: 'REQUIRES_ADMIN_REVIEW',
      requiresAdminReview: true,
      reason: '노무사 검토 착수 또는 업무 진행 후 취소·반려된 사건으로 자동 복구가 불가하며, 관리자 검토가 필요합니다.',
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  // 6. 복구 출처별 복구 기준 판정
  const deductionSource = ledgerItem.source;

  // 6-1. PREPAID_TICKET: 선불 이용권 1회 반환 (이월 제한 없음)
  if (deductionSource === 'PREPAID_TICKET') {
    return {
      canRestore: true,
      restorationType: workStarted ? 'REQUIRES_ADMIN_REVIEW' : 'AUTO_RESTORE',
      requiresAdminReview: workStarted,
      reason: workStarted
        ? '관리자 검토 승인 완료: 구매 선불 이용권 1회 복구 가능'
        : '구매 선불 이용권 1회 복구 가능 (선불 이용권 반환)',
      restorableSource: 'PREPAID_TICKET',
      restoredQuantity: 1,
      caseId,
      companyId,
      deductionId: ledgerItem.deductionId,
      deductionYearMonth: ledgerItem.yearMonth,
      cancellationYearMonth: resolvedCancellationYearMonth,
    };
  }

  // 6-2. MONTHLY_FREE: 차감 연월과 취소 연월 비교
  if (deductionSource === 'MONTHLY_FREE') {
    const isSameMonth = ledgerItem.yearMonth === resolvedCancellationYearMonth;

    if (isSameMonth) {
      // 당월 취소: 당월 무료 횟수 1회 복구
      return {
        canRestore: true,
        restorationType: workStarted ? 'REQUIRES_ADMIN_REVIEW' : 'AUTO_RESTORE',
        requiresAdminReview: workStarted,
        reason: workStarted
          ? '관리자 검토 승인 완료: 당월 무료 횟수 1회 복구 가능'
          : '당월 내 취소 건으로 해당 월 무료 횟수 1회 복구 가능',
        restorableSource: 'MONTHLY_FREE',
        restoredQuantity: 1,
        caseId,
        companyId,
        deductionId: ledgerItem.deductionId,
        deductionYearMonth: ledgerItem.yearMonth,
        cancellationYearMonth: resolvedCancellationYearMonth,
      };
    } else {
      // 익월(또는 타 월) 취소: 무료 횟수 이월 금지 정책 적용 (소멸)
      return {
        canRestore: false,
        restorationType: 'EXPIRED_MONTHLY_FREE',
        requiresAdminReview: false,
        reason: `차감 연월(${ledgerItem.yearMonth})과 취소 연월(${resolvedCancellationYearMonth})이 상이하여 월 무료 횟수는 이월되지 않고 소멸됩니다. (복구 불가)`,
        caseId,
        companyId,
        deductionId: ledgerItem.deductionId,
        deductionYearMonth: ledgerItem.yearMonth,
        cancellationYearMonth: resolvedCancellationYearMonth,
      };
    }
  }

  // 예외 안전 가드
  return {
    canRestore: false,
    restorationType: 'NOT_ELIGIBLE',
    requiresAdminReview: false,
    reason: `알 수 없는 차감 출처입니다: ${deductionSource}`,
    caseId,
    companyId,
    deductionId: ledgerItem.deductionId,
    deductionYearMonth: ledgerItem.yearMonth,
    cancellationYearMonth: resolvedCancellationYearMonth,
  };
}

export const maternityUsageService = {
  /**
   * 기업별 모성보호 이용 횟수 요약 조회
   */
  async getCompanyMaternityUsageSummary(params: {
    callerProfile: UserProfile | null | undefined;
    companyId?: string;
    targetYearMonth?: string;
  }): Promise<CompanyMaternityUsageSummary> {
    const { callerProfile, companyId, targetYearMonth } = params;

    // 1. 호출자 권한 및 대상 기업 ID 보안 검증
    const verifiedCompanyId = validateCallerCompanyAccess(callerProfile, companyId);

    // 2. 기업 정보 조회
    const company = await firmService.getCompanyById(verifiedCompanyId);
    if (!company) {
      throw new Error(`기업 정보(${verifiedCompanyId})를 찾을 수 없습니다.`);
    }

    // 3. 조회 대상 연월 확정 (기본값: 현재 시스템 연월 'YYYY-MM')
    const resolvedYearMonth =
      targetYearMonth && /^\d{4}-\d{2}$/.test(targetYearMonth)
        ? targetYearMonth
        : new Date().toISOString().slice(0, 7);

    // 4. 해당 기업의 모성보호 신청 건 조회 및 당월 건수 산출
    let monthCasesCount = 0;
    try {
      const cases = await firmService.getMaternityCasesByCompany(verifiedCompanyId);
      if (Array.isArray(cases)) {
        // 취소(CANCELLED)된 건은 사용 횟수에서 제외
        const validMonthCases = cases.filter((c: MaternityCase) => {
          if (c.status === 'CANCELLED') return false;
          const caseDate = c.applicationDate || c.createdAt || '';
          return caseDate.startsWith(resolvedYearMonth);
        });
        monthCasesCount = validMonthCases.length;
      }
    } catch (casesErr) {
      monthCasesCount = 0;
    }

    // 5. 구매 선불 이용권 잔여 횟수 (실제 구매 내역이 없으면 0, 임의 레코드 미생성)
    const purchasedTicketsRemaining = company.purchasedMaternityTickets || 0;

    // 6. [R2-8 2/4-C-⑨-2 & ⑨-3] 모성보호 횟수 계산 실행 (calculateMaternityQuota 내부에서 단일 판정 수행)
    const calculation = calculateMaternityQuota({
      company,
      targetYearMonth: resolvedYearMonth,
      referenceDateString:
        resolvedYearMonth === new Date().toISOString().slice(0, 7)
          ? new Date().toISOString().slice(0, 10)
          : `${resolvedYearMonth}-01`,
      monthCasesCount,
      purchasedTicketsRemaining,
    });

    return {
      companyId: company.id,
      companyName: company.companyName,
      ...calculation,
    };
  },

  /**
   * [R2-8 2/4-C-⑨] 모성보호 STANDARD 월 5회 무료 자격 판정 함수 노출
   */
  getMonthlyFreeEligibility: getMaternityMonthlyFreeEligibility,

  /**
   * [R2-8 2/4-A-⑤-3] 차감 대상 판정 순수 함수 노출
   */
  evaluateEligibility: evaluateMaternityDeductionEligibility,

  /**
   * [R2-8 2/4-A-⑥-2] 취소·반려 시 복구 판정 순수 함수 노출
   */
  evaluateRestoration: evaluateMaternityRestorationEligibility,

  /**
   * [R2-8 2/4-A-⑥-2] 업무 착수 여부 판정 헬퍼 노출
   */
  hasWorkStarted: hasMaternityWorkStarted,

  /**
   * 순수 계산 로직 직접 노출
   */
  calculateQuota: calculateMaternityQuota,

  /**
   * 권한 검증 헬퍼 노출
   */
  validateAccess: validateCallerCompanyAccess,

  /**
   * 레거시 사건 식별기 노출
   */
  isLegacyCase: isLegacyMaternityCase,

  /**
   * 중복 방지 키 생성기 노출
   */
  buildIdempotencyKey: buildDeductionIdempotencyKey,

  /**
   * 원장 문서 ID 생성기 노출
   */
  buildLedgerDocId: buildDeductionLedgerDocId,

  /**
   * 상태 전이 유효성 검증기 노출
   */
  validateTransition: validateDeductionTransition,

  /**
   * 차감 원장 페이로드 빌더 노출
   */
  createPayload: createDeductionLedgerPayload,
};
