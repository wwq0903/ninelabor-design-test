import { Company, CompanySubscription, PlanCode, PlatformFeatureKey } from '../types';
import { planFeatureMatrix } from '../config/plans';
import { isValidPlanDate } from './planDates';

/**
 * [R2-8 2/4-B-④ & C-⑧] 중앙 플랜/구독 권한 판정 결과 인터페이스
 */
export interface SubscriptionEntitlement {
  /** 실제 업무/플랜 기능 이용 가능 여부 (ACTIVE 상태 및 기간 조건 충족 시 true) */
  isActive: boolean;
  /** 활성 플랜 코드 (비활성/미설정인 경우 null) */
  activePlanCode: PlanCode | null;
  /** 등록된 원본 플랜 코드 (비활성이라도 subscription 객체에 기록된 값) */
  rawPlanCode: PlanCode | null;
  /** 원본 구독 저장 상태 (ACTIVE, PENDING, EXPIRED, CANCELLED, 미설정 시 null) */
  status: CompanySubscription['status'] | null;
  /** 시작일 (YYYY-MM-DD) */
  startDate?: string;
  /** 종료일 (YYYY-MM-DD) */
  endDate?: string;
  /**
   * [R2-8 2/4-C-⑧] UI 및 표시용 세부 구독 상태
   * - UNSET: 구독 미설정
   * - ACTIVE: 정상 이용 중 (status == 'ACTIVE' && 시작일 지남/시작일 없음 && 종료일 전/종료일 없음)
   * - BEFORE_START: 이용 시작 전 (status == 'ACTIVE' && 시작일이 현재 날짜보다 미래)
   * - PERIOD_EXPIRED: 이용기간 만료 (status == 'ACTIVE' && 종료일이 현재 날짜보다 과거)
   * - PENDING: 승인/처리 대기
   * - EXPIRED: 저장 상태 자체가 만료
   * - CANCELLED: 구독 해지
   */
  displayStatus:
    | 'UNSET'
    | 'ACTIVE'
    | 'BEFORE_START'
    | 'PERIOD_EXPIRED'
    | 'PENDING'
    | 'EXPIRED'
    | 'CANCELLED';
  /** 사용자 친화적 한글 안내 레이블 */
  displayStatusLabel: string;
  /** 플랜 기능 매트릭스에 따른 허용 기능 키 목록 */
  allowedFeatures: PlatformFeatureKey[];
  /** 특정 플랫폼 기능 사용 가능 여부 판정 함수 */
  hasFeature: (featureKey: PlatformFeatureKey) => boolean;
}

/**
 * [R2-8 2/4-C-⑧] 안전한 날짜(YYYY-MM-DD) 기준 문자열 반환
 * - KST/로컬 기준 하루 어긋남 방지를 위해 현재 시각의 YYYY-MM-DD 문자열을 추출
 */
export function getReferenceDateString(baseDate: Date = new Date()): string {
  // Business plan periods are defined by the Korean calendar day, regardless
  // of the browser/server timezone. Avoid toISOString() (UTC day rollover).
  if (Number.isNaN(baseDate.getTime())) throw new Error('Invalid reference date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(baseDate);
  const read = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/**
 * [R2-8 2/4-B-④ & C-⑧] 중앙 구독 권한 판정 헬퍼
 * 
 * Source of Truth: companies/{companyId}.subscription
 * 
 * ACTIVE 유효 조건:
 * 1. sub.status === 'ACTIVE'
 * 2. startDate가 존재하면 현재 날짜(referenceDate) >= startDate
 * 3. endDate가 존재하면 현재 날짜(referenceDate) <= endDate
 * 4. startDate/endDate가 없는 기존 ACTIVE 구독은 운영 호환성을 위해 유효(ACTIVE)로 인정
 * 
 * 중요 정책:
 * - 날짜가 지났다고 Firestore의 status 값을 자동으로 EXPIRED로 변경하지 않습니다.
 * - 저장 상태가 ACTIVE이더라도 endDate가 지난 경우 권한 판정에서는 이용기간 만료(isActive = false)로 차단합니다.
 * - CANCELLED는 endDate와 관계없이 즉시 모든 일반 업무 기능 접근 불가
 * - PENDING / EXPIRED: 기존과 동일하게 업무 기능 접근 불가
 */
export function getSubscriptionEntitlement(
  companyOrSubscription?: Company | CompanySubscription | null,
  referenceDateString?: string
): SubscriptionEntitlement {
  // 인자가 Company 객체인 경우 subscription 필드 추출, 아니면 그대로 사용
  let sub: CompanySubscription | undefined;
  if (companyOrSubscription) {
    if ('planCode' in companyOrSubscription) {
      sub = companyOrSubscription as CompanySubscription;
    } else if ('subscription' in companyOrSubscription) {
      sub = companyOrSubscription.subscription;
    }
  }

  const rawPlanCode = sub?.planCode || null;
  const status = sub?.status || null;
  const startDate = sub?.startDate?.trim() || undefined;
  const endDate = sub?.endDate?.trim() || undefined;

  const todayStr = referenceDateString && isValidPlanDate(referenceDateString)
    ? referenceDateString : getReferenceDateString();
  const hasInvalidPeriod = Boolean(
    (startDate && !isValidPlanDate(startDate)) ||
    (endDate && !isValidPlanDate(endDate)) ||
    (startDate && endDate && startDate > endDate)
  );

  let isActive = false;
  let displayStatus: SubscriptionEntitlement['displayStatus'] = 'UNSET';
  let displayStatusLabel = '구독 미설정';

  if (!sub || !status || !rawPlanCode) {
    displayStatus = 'UNSET';
    displayStatusLabel = '구독 미설정';
    isActive = false;
  } else if (status === 'CANCELLED') {
    // CANCELLED: endDate와 무관하게 즉시 업무 기능 접근 차단
    displayStatus = 'CANCELLED';
    displayStatusLabel = '구독 해지';
    isActive = false;
  } else if (status === 'PENDING') {
    displayStatus = 'PENDING';
    displayStatusLabel = '승인 대기';
    isActive = false;
  } else if (status === 'EXPIRED') {
    displayStatus = 'EXPIRED';
    displayStatusLabel = '구독 만료';
    isActive = false;
  } else if (status === 'ACTIVE' && hasInvalidPeriod) {
    // Corrupted dates must not silently grant paid-plan entitlements.
    displayStatus = 'EXPIRED';
    displayStatusLabel = '이용기간 확인 필요';
    isActive = false;
  } else if (status === 'ACTIVE') {
    // 시작일 미래 체크
    const isBeforeStart = Boolean(startDate && startDate > todayStr);
    // 종료일 과거 체크
    const isPeriodExpired = Boolean(endDate && endDate < todayStr);

    if (isBeforeStart) {
      displayStatus = 'BEFORE_START';
      displayStatusLabel = '이용 시작 전';
      isActive = false;
    } else if (isPeriodExpired) {
      displayStatus = 'PERIOD_EXPIRED';
      displayStatusLabel = '이용기간 만료';
      isActive = false;
    } else {
      // startDate/endDate 없거나 기간 내 유효한 ACTIVE
      displayStatus = 'ACTIVE';
      displayStatusLabel = '정상 이용 중';
      isActive = true;
    }
  }

  const activePlanCode = isActive ? rawPlanCode : null;

  // 비활성 또는 구독 미설정 시 기본 메뉴 3종 (대시보드, 기업정보, 플랜 안내)
  const defaultInactiveFeatures: PlatformFeatureKey[] = [
    'DASHBOARD',
    'COMPANY_INFO',
    'PLAN_INFO',
  ];

  let allowedFeatures: PlatformFeatureKey[] = [];
  if (isActive && activePlanCode && planFeatureMatrix[activePlanCode]) {
    allowedFeatures = planFeatureMatrix[activePlanCode];
  } else {
    allowedFeatures = defaultInactiveFeatures;
  }

  const hasFeature = (featureKey: PlatformFeatureKey): boolean => {
    return allowedFeatures.includes(featureKey);
  };

  return {
    isActive,
    activePlanCode,
    rawPlanCode,
    status,
    startDate,
    endDate,
    displayStatus,
    displayStatusLabel,
    allowedFeatures,
    hasFeature,
  };
}

/**
 * [R2-8 2/4-C-⑨] 모성보호 STANDARD 월 5회 무료 혜택 자격 판정 결과 인터페이스
 */
export interface MaternityMonthlyFreeEligibility {
  /** STANDARD 월 5회 무료 제공 자격 적격 여부 */
  isEligibleForMonthlyFree: boolean;
  /** 제공되는 월 무료 횟수 (STANDARD 자격 충족 시 5회, 미충족 시 0회) */
  monthlyFreeQuota: number;
  /** 유효 활성 플랜 코드 (비활성/미설정인 경우 null 또는 기본 플랜) */
  effectivePlanCode: PlanCode;
  /** 자격 상세 사유 */
  reason: string;
}

/**
 * [R2-8 2/4-C-⑨] 모성보호 STANDARD 월 5회 무료 혜택 자격 공통 판정 함수
 * 
 * Source of Truth: companies/{companyId}.subscription
 * 
 * STANDARD 월 5회 무료 혜택 부여 조건:
 * companies/{companyId}.subscription이
 * - planCode === 'STANDARD'
 * - status === 'ACTIVE'
 * - 현재 날짜(referenceDateString)가 startDate / endDate 유효기간 안
 * 인 경우에만 5회 제공.
 * (startDate/endDate가 없는 기존 ACTIVE STANDARD는 하위 호환성을 위해 유효하게 인정)
 * 
 * 다음 상황에서는 절대 월 5회 무료를 제공하지 않음 (monthlyFreeQuota = 0):
 * - FREE, BASIC, CUSTOM, OUTSOURCING
 * - 구독 미설정 (subscription 부재 또는 미설정)
 * - PENDING, EXPIRED, CANCELLED
 * - 이용 시작 전 (startDate가 미래)
 * - 이용기간 만료 (endDate가 과거)
 * - currentPlanId와 subscription 불일치 (Source of Truth는 subscription만 인정)
 * 
 * 중요 정책:
 * - 권한 판단 Source of Truth로 currentPlanId를 사용하지 않음 (subscription 필드 단일 기준)
 * - 일반 구독이 만료/비활성 상태이더라도 선불 이용권(purchasedMaternityTickets)은 별도로 사용 가능 (모성보호 전체 차단 아님)
 */
export function getMaternityMonthlyFreeEligibility(
  companyOrSubscription?: Company | CompanySubscription | null,
  referenceDateString?: string
): MaternityMonthlyFreeEligibility {
  const entitlement = getSubscriptionEntitlement(companyOrSubscription, referenceDateString);

  // STANDARD 월 5회 무료 자격 판정:
  // entitlement.isActive === true 이고 entitlement.activePlanCode === 'STANDARD' 인 경우에만 충족
  if (entitlement.isActive && entitlement.activePlanCode === 'STANDARD') {
    return {
      isEligibleForMonthlyFree: true,
      monthlyFreeQuota: 5,
      effectivePlanCode: 'STANDARD',
      reason: 'ACTIVE STANDARD 구독으로 모성보호 월 5회 무료 혜택이 제공됩니다.',
    };
  }

  // 자격 미충족 사유 분석
  let reason = 'STANDARD 플랜 활성 구독이 아니므로 모성보호 월 무료 혜택이 제공되지 않습니다. (선불 이용권만 사용 가능)';
  if (!entitlement.status || entitlement.displayStatus === 'UNSET') {
    reason = '구독이 설정되지 않아 모성보호 월 무료 혜택이 제공되지 않습니다. (선불 이용권만 사용 가능)';
  } else if (entitlement.status === 'CANCELLED') {
    reason = '구독이 해지(CANCELLED)되어 STANDARD 월 무료 혜택이 제공되지 않습니다. (선불 이용권만 사용 가능)';
  } else if (entitlement.status === 'PENDING') {
    reason = '구독이 승인 대기(PENDING) 상태로 STANDARD 월 무료 혜택이 제공되지 않습니다. (선불 이용권만 사용 가능)';
  } else if (entitlement.status === 'EXPIRED') {
    reason = '구독이 만료(EXPIRED)되어 STANDARD 월 무료 혜택이 제공되지 않습니다. (선불 이용권만 사용 가능)';
  } else if (entitlement.displayStatus === 'BEFORE_START') {
    reason = `구독 시작일(${entitlement.startDate}) 전이므로 STANDARD 월 무료 혜택이 아직 제공되지 않습니다. (선불 이용권만 사용 가능)`;
  } else if (entitlement.displayStatus === 'PERIOD_EXPIRED') {
    reason = `구독 이용기간(${entitlement.endDate})이 만료되어 STANDARD 월 무료 혜택이 제공되지 않습니다. (선불 이용권만 사용 가능)`;
  } else if (entitlement.activePlanCode && entitlement.activePlanCode !== 'STANDARD') {
    reason = `${entitlement.activePlanCode} 플랜은 모성보호 월 무료 혜택이 제공되지 않는 플랜입니다. (선불 이용권만 사용 가능)`;
  }

  const effectivePlanCode: PlanCode = entitlement.activePlanCode || entitlement.rawPlanCode || 'FREE';

  return {
    isEligibleForMonthlyFree: false,
    monthlyFreeQuota: 0,
    effectivePlanCode,
    reason,
  };
}

/**
 * COMPANY 메뉴 탭 키를 PlatformFeatureKey로 매핑
 * ※ 모성보호('maternity')는 일반 planFeatureMatrix 기준이 아닌 별도 entitlement 대상이므로
 *    플랜 매트릭스 필터링에서 제외하거나 항상 true 유지
 */
export const COMPANY_TAB_TO_FEATURE: Record<string, PlatformFeatureKey | 'MATERNITY_SEPARATE'> = {
  'dashboard': 'DASHBOARD',
  'company-info': 'COMPANY_INFO',
  'plan': 'PLAN_INFO',
  'messages': 'MESSAGES',
  'data-submissions': 'DATA_REQUESTS',
  'documents': 'DOCUMENTS',
  'workers': 'WORKERS',
  'inquiries': 'LABOR_INQUIRIES',
  'payroll': 'PAYROLL',
  'payslips': 'PAYSLIPS',
  'attendance': 'ATTENDANCE',
  'overtime': 'OVERTIME',
  'maternity': 'MATERNITY_SEPARATE',
};

/**
 * COMPANY 메뉴 탭이 현재 구독 권한상 노출 가능한지 판정하는 헬퍼
 */
export function isCompanyTabVisible(
  tabKey: string,
  companyOrSubscription?: Company | CompanySubscription | null
): boolean {
  // 1. 모성보호(maternity):
  //    "모성보호는 일반 planFeatureMatrix의 메뉴 노출 기준으로 처리하지 마세요.
  //     모성보호는 무료 횟수/선불 이용권이라는 별도 entitlement가 있으므로 이번 단계에서는 기존 노출 상태를 유지해주세요."
  if (tabKey === 'maternity') {
    return true;
  }

  const entitlement = getSubscriptionEntitlement(companyOrSubscription);

  // 2. 비활성 또는 미설정 상태:
  //    "대시보드, 기업정보, 이용 플랜 안내는 접근 가능하도록 유지해주세요."
  if (!entitlement.isActive) {
    return tabKey === 'dashboard' || tabKey === 'company-info' || tabKey === 'plan';
  }

  // 3. ACTIVE 상태: planFeatureMatrix 기준으로 메뉴 노출
  const featureKey = COMPANY_TAB_TO_FEATURE[tabKey];
  if (!featureKey || featureKey === 'MATERNITY_SEPARATE') {
    return true;
  }

  return entitlement.hasFeature(featureKey);
}
