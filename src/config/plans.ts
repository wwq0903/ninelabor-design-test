import { Plan, SeparateService, PlatformFeatureKey, FeatureDefinition, GeneralPlanCode, PlanCode, MaternityQuotaPolicyItem } from '../types';

/**
 * [R2-8 2/4-A-①] 중앙 요금제 및 기능 정책 설정 (Central Pricing & Feature Matrix Configuration)
 * 
 * 1. 일반 구독 플랜 (4종):
 * - FREE: 무료 (0원)
 * - BASIC: 월 15,000원
 * - STANDARD: 월 30,000원
 * - CUSTOM: 기업 맞춤형 (별도 견적)
 *
 * 2. 플랜별 확정 기능 정책 (planFeatureMatrix):
 * - FREE:
 *   * 대시보드 (DASHBOARD)
 *   * 기업정보 관리 (COMPANY_INFO)
 *   * 메시지함 (MESSAGES)
 *   * 이용 플랜 안내 (PLAN_INFO)
 * 
 * - BASIC (월 15,000원):
 *   * FREE 기능 전체 +
 *   * 자료요청 (DATA_REQUESTS)
 *   * 문서관리 (DOCUMENTS)
 *   * 근로자관리 (WORKERS)
 * 
 * - STANDARD (월 30,000원):
 *   * FREE + BASIC 기능 전체 +
 *   * 1:1 노무 문의 (LABOR_INQUIRIES)
 *   * (제외: 급여관리, 급여명세서, 근태관리, 추가근무 출근부 -> 아웃소싱 전용)
 *   * (제외: 모성보호 -> 선불 이용권 전용)
 * 
 * - CUSTOM (기업 맞춤형):
 *   * 일반 구독 기능(STANDARD 전체) 기반 기업 맞춤형 컨설팅
 *
 * 3. 별도 유료서비스 (아웃소싱 & 모성보호 선불 이용권):
 * - OUTSOURCING: 급여 아웃소싱 (별도 견적)
 *   * 전용 기능: 급여관리, 급여명세서, 근태관리, 추가근무 출근부
 * - MATERNITY_5: 모성보호 5회 이용권 (가격 별도 안내, 선불 횟수 차감형)
 * - MATERNITY_10: 모성보호 10회 이용권 (가격 별도 안내, 선불 횟수 차감형)
 *   * 전용 기능: 모성보호 관리
 *
 * * 정책 원칙 준수:
 * - 메뉴 숨김, route 차단, Firestore Rules 변경 금지
 * - 결제 기능 및 모성보호 횟수 차감/복구 로직 미구현 (정책 정의만 수행)
 * - 기존 기능 일체 보존
 */

// 1. 전체 플랫폼 기능 정의 레지스트리
export const FEATURE_DEFINITIONS: Record<PlatformFeatureKey, FeatureDefinition> = {
  DASHBOARD: {
    key: 'DASHBOARD',
    name: '대시보드',
    description: '기업 노무관리 통합 현황 및 통계 조회',
    category: 'GENERAL',
  },
  COMPANY_INFO: {
    key: 'COMPANY_INFO',
    name: '기업정보 관리',
    description: '기업 기본정보, 사업자등록번호 및 담당자 관리',
    category: 'GENERAL',
  },
  MESSAGES: {
    key: 'MESSAGES',
    name: '메시지함',
    description: '노무법인 전담 노무사와의 실시간 업무 메시지 수발신',
    category: 'GENERAL',
  },
  PLAN_INFO: {
    key: 'PLAN_INFO',
    name: '이용 플랜 안내',
    description: '현재 이용 중인 멤버십 및 요금제 안내 조회',
    category: 'GENERAL',
  },
  DATA_REQUESTS: {
    key: 'DATA_REQUESTS',
    name: '자료요청',
    description: '노무법인 요청 노무 증빙 자료 제출 및 검토',
    category: 'GENERAL',
  },
  DOCUMENTS: {
    key: 'DOCUMENTS',
    name: '문서관리',
    description: '기업 노무 서식, 취업규칙, 계약서 등 기업 문서 보관',
    category: 'GENERAL',
  },
  WORKERS: {
    key: 'WORKERS',
    name: '근로자관리',
    description: '소속 근로자 명부 등록, 부서·직위 및 재직 현황 관리',
    category: 'GENERAL',
  },
  LABOR_INQUIRIES: {
    key: 'LABOR_INQUIRIES',
    name: '1:1 노무 문의',
    description: '공인노무사 전담 1:1 전문 노동법률 상담 질의',
    category: 'GENERAL',
  },
  PAYROLL: {
    key: 'PAYROLL',
    name: '급여관리',
    description: '급여 대장 관리 및 급여 산정 (아웃소싱 전용)',
    category: 'OUTSOURCING',
  },
  PAYSLIPS: {
    key: 'PAYSLIPS',
    name: '급여명세서',
    description: '전자 급여명세서 작성 및 교부 (아웃소싱 전용)',
    category: 'OUTSOURCING',
  },
  ATTENDANCE: {
    key: 'ATTENDANCE',
    name: '근태관리',
    description: '근로시간 및 출퇴근 기록 관리 (아웃소싱 전용)',
    category: 'OUTSOURCING',
  },
  OVERTIME: {
    key: 'OVERTIME',
    name: '추가근무 출근부',
    description: '연장·야간·휴일근로 집계 및 승인 (아웃소싱 전용)',
    category: 'OUTSOURCING',
  },
  MATERNITY: {
    key: 'MATERNITY',
    name: '모성보호 관리',
    description: '출산휴가·육아휴직·단축근무 사건 관리 (선불 이용권 전용)',
    category: 'PREPAID_TICKET',
  },
};

// 2. 일반 구독 플랜 (4종)
export const SUBSCRIPTION_PLANS: Plan[] = [
  {
    id: 'FREE',
    planCode: 'FREE',
    planName: 'FREE',
    name: 'FREE',
    price: 0,
    billingType: 'free',
    description: '기본 인사노무 시스템 무료 이용 (대시보드, 기업정보 관리, 메시지함)',
  },
  {
    id: 'BASIC',
    planCode: 'BASIC',
    planName: 'BASIC',
    name: 'BASIC',
    price: 15000,
    billingType: 'monthly',
    description: '초기 스타트업 및 소기업을 위한 기본 노무관리 플랜 (FREE 기능 + 자료요청, 문서관리, 근로자관리)',
  },
  {
    id: 'STANDARD',
    planCode: 'STANDARD',
    planName: 'STANDARD',
    name: 'STANDARD',
    price: 30000,
    billingType: 'monthly',
    description: '체계적인 인사관리 및 정기 노무자문을 위한 플랜 (FREE + BASIC 기능 + 1:1 노무 문의 + 모성보호 월 5회 무료 / 이월 불가)',
  },
  {
    id: 'CUSTOM',
    planCode: 'CUSTOM',
    planName: '기업 맞춤형',
    name: '기업 맞춤형',
    price: '별도 견적',
    billingType: 'custom',
    description: '기업 규모와 특성에 맞춘 맞춤형 인사노무 컨설팅',
  },
];

export const PLANS = SUBSCRIPTION_PLANS;

// 3. [R2-8 2/4-A-① & ②] 중앙 기능 매트릭스 (Plan Feature Matrix)
export const planFeatureMatrix: Record<PlanCode, PlatformFeatureKey[]> = {
  // FREE: 대시보드, 기업정보 관리, 메시지함, 플랜 안내
  FREE: [
    'DASHBOARD',
    'COMPANY_INFO',
    'MESSAGES',
    'PLAN_INFO',
  ],

  // BASIC: FREE 전체 + 자료요청, 문서관리, 근로자관리
  BASIC: [
    'DASHBOARD',
    'COMPANY_INFO',
    'MESSAGES',
    'PLAN_INFO',
    'DATA_REQUESTS',
    'DOCUMENTS',
    'WORKERS',
  ],

  // STANDARD: FREE + BASIC 전체 + 1:1 노무 문의
  // (제외: 급여관리, 급여명세서, 근태관리, 추가근무 출근부 -> 아웃소싱 전용)
  // (제외: 모성보호 -> 선불 이용권 전용)
  STANDARD: [
    'DASHBOARD',
    'COMPANY_INFO',
    'MESSAGES',
    'PLAN_INFO',
    'DATA_REQUESTS',
    'DOCUMENTS',
    'WORKERS',
    'LABOR_INQUIRIES',
  ],

  // CUSTOM: 일반 구독 기능 전체 기반 기업 맞춤형 구성
  CUSTOM: [
    'DASHBOARD',
    'COMPANY_INFO',
    'MESSAGES',
    'PLAN_INFO',
    'DATA_REQUESTS',
    'DOCUMENTS',
    'WORKERS',
    'LABOR_INQUIRIES',
  ],

  // [R2-8 2/4-A-②] OUTSOURCING: 별도 견적 플랜
  // - FREE 기능 전체 +
  // - BASIC 기능 전체 +
  // - STANDARD 일반 기능 전체 +
  // - 아웃소싱 전용 기능 (급여관리, 급여명세서, 근태관리, 추가근무 출근부)
  // ※ 모성보호(MATERNITY) 제외: 월 5회 무료 등 기본 제공 혜택 없음 (별도 선불 이용권 전용)
  OUTSOURCING: [
    // FREE 기능 전체
    'DASHBOARD',
    'COMPANY_INFO',
    'MESSAGES',
    'PLAN_INFO',
    // BASIC 기능 전체
    'DATA_REQUESTS',
    'DOCUMENTS',
    'WORKERS',
    // STANDARD 일반 기능 전체
    'LABOR_INQUIRIES',
    // 아웃소싱 전용 기능
    'PAYROLL',
    'PAYSLIPS',
    'ATTENDANCE',
    'OVERTIME',
    // ※ 모성보호(MATERNITY)는 기본 제공에 포함되지 않음
  ],
};

// 4. 아웃소싱 전용 기능 목록
export const OUTSOURCING_DEDICATED_FEATURES: PlatformFeatureKey[] = [
  'PAYROLL',      // 급여관리
  'PAYSLIPS',     // 급여명세서
  'ATTENDANCE',   // 근태관리
  'OVERTIME',     // 추가근무 출근부
];

// 5. 모성보호 선불 이용권 전용 기능 목록
export const PREPAID_TICKET_DEDICATED_FEATURES: PlatformFeatureKey[] = [
  'MATERNITY',    // 모성보호 관리
];

// 6. 별도 유료서비스 (급여 아웃소싱 & 모성보호 선불 이용권)
export const SEPARATE_SERVICES: SeparateService[] = [
  {
    serviceCode: 'OUTSOURCING',
    serviceName: '급여 아웃소싱',
    pricingType: 'quote',
    price: '별도 견적',
    description: '전문 공인노무사 위탁 급여산정 및 4대보험 대행 (급여관리, 급여명세서, 근태관리, 추가근무 출근부)',
  },
  {
    serviceCode: 'MATERNITY_5',
    serviceName: '모성보호 5회 이용권',
    pricingType: 'prepaid_ticket',
    price: '가격 별도 안내',
    description: '출산휴가·육아휴직·단축근무 등 모성보호 사건 선불 이용권 (5회)',
    ticketCount: 5,
  },
  {
    serviceCode: 'MATERNITY_10',
    serviceName: '모성보호 10회 이용권',
    pricingType: 'prepaid_ticket',
    price: '가격 별도 안내',
    description: '출산휴가·육아휴직·단축근무 등 모성보호 사건 선불 이용권 (10회)',
    ticketCount: 10,
  },
];

// 7. [R2-8 2/4-A-③] STANDARD 모성보호 월 5회 무료 이용 정책 (Maternity Quota Policy)
// - STANDARD: 모성보호 업무 월 5회 무료 (당월 잔여 횟수 익월 이월 불가)
// - FREE / BASIC / OUTSOURCING: 월 무료 횟수 없음 (0회)
// - CUSTOM: 임의 혜택 미부여 (0회 / 기업별 맞춤 협의)
// - 별도 이용권(MATERNITY_5, MATERNITY_10) 연계: STANDARD 월 5회 소진 후 별도 이용권 구매 가능
// - 향후 차감 순서: [1순위] 당월 무료 횟수(월 5회) -> [2순위] 구매 선불 이용권
export const MATERNITY_QUOTA_POLICY: Record<PlanCode, MaternityQuotaPolicyItem> = {
  FREE: {
    monthlyFreeQuota: 0,
    allowRollover: false,
    description: '월 무료 횟수 없음 (별도 선불 이용권 구매 후 이용)',
  },
  BASIC: {
    monthlyFreeQuota: 0,
    allowRollover: false,
    description: '월 무료 횟수 없음 (별도 선불 이용권 구매 후 이용)',
  },
  STANDARD: {
    monthlyFreeQuota: 5,
    allowRollover: false,
    description: '모성보호 업무 월 5회 무료 제공 (당월 미사용분 익월 이월 불가 / 소진 시 별도 이용권 구매 가능)',
  },
  CUSTOM: {
    monthlyFreeQuota: 0,
    allowRollover: false,
    description: '임의 혜택 없음 (0회 / 기업별 맞춤 협의)',
  },
  OUTSOURCING: {
    monthlyFreeQuota: 0,
    allowRollover: false,
    description: '월 무료 횟수 없음 (별도 선불 이용권 구매 후 이용)',
  },
};

// 8. 모성보호 차감 순서 정책 (향후 구현 예정 차감 우선순위)
export const MATERNITY_DEDUCTION_ORDER = [
  'MONTHLY_FREE_QUOTA',       // 1순위: STANDARD 월 5회 무료 횟수
  'PREPAID_PURCHASED_TICKET', // 2순위: 구매 선불 이용권 (MATERNITY_5, MATERNITY_10)
] as const;

// 9. 대시보드 탭 키와 플랫폼 기능 키 간 매핑 테이블
export const TAB_TO_FEATURE_KEY: Record<string, PlatformFeatureKey> = {
  dashboard: 'DASHBOARD',
  'company-info': 'COMPANY_INFO',
  messages: 'MESSAGES',
  plan: 'PLAN_INFO',
  'data-submissions': 'DATA_REQUESTS',
  documents: 'DOCUMENTS',
  workers: 'WORKERS',
  inquiries: 'LABOR_INQUIRIES',
  payroll: 'PAYROLL',
  payslips: 'PAYSLIPS',
  attendance: 'ATTENDANCE',
  overtime: 'OVERTIME',
  maternity: 'MATERNITY',
};

/**
 * 플랜별 기능 포함 여부 확인 헬퍼
 * (※ 주의: 이번 단계에서는 실제 메뉴 숨김이나 접근 차단을 적용하지 않습니다)
 */
export function isFeatureIncludedInPlan(planCode: PlanCode, featureKey: PlatformFeatureKey): boolean {
  const allowedFeatures = planFeatureMatrix[planCode];
  return allowedFeatures ? allowedFeatures.includes(featureKey) : false;
}

/**
 * 플랜 검색 헬퍼
 */
export function getPlan(planIdOrCode?: string): Plan {
  if (!planIdOrCode) return SUBSCRIPTION_PLANS[0];
  if (planIdOrCode === 'OUTSOURCING' || planIdOrCode === 'plan_outsourcing') {
    return {
      id: 'OUTSOURCING',
      planCode: 'OUTSOURCING' as any,
      planName: '급여 아웃소싱',
      name: '급여 아웃소싱',
      price: '별도 견적',
      billingType: 'quote',
      description: '전문 공인노무사 위탁 급여산정 및 4대보험 대행',
    };
  }
  const found = SUBSCRIPTION_PLANS.find(
    (p) =>
      p.planCode === planIdOrCode ||
      p.id === planIdOrCode ||
      (p.planCode === 'BASIC' && (planIdOrCode === 'basic_15k' || planIdOrCode === 'plan_basic')) ||
      (p.planCode === 'STANDARD' && (planIdOrCode === 'standard_30k' || planIdOrCode === 'plan_standard')) ||
      (p.planCode === 'CUSTOM' && (planIdOrCode === 'custom_enterprise' || planIdOrCode === 'plan_custom')) ||
      (p.planCode === 'FREE' && planIdOrCode === 'plan_free')
  );
  return found || SUBSCRIPTION_PLANS[0];
}

/**
 * 플랜 접근 검사 인터페이스 (이번 단계에서는 실제 기능 접근제어를 적용하지 않음)
 */
export function checkFeatureAccess(): { allowed: boolean; message?: string } {
  return { allowed: true };
}

/**
 * 별도 전문 상담 서비스 안내 (정기구독 플랜과 분리된 일회성 사건 대리/대면 자문)
 */
export const ADDITIONAL_SERVICES = [
  {
    id: 'consultation_30m',
    name: '30분 전문 노무 상담',
    priceText: '70,000원',
    billingNotice: '사전 예약 정책 (정기구독 요금제와 분리)',
    description: '특정 현안(징계, 해고, 임금체불 등)에 대한 공인노무사 심층 대면/유선 자문',
    category: '상담 서비스',
  },
  {
    id: 'special_consultation',
    name: '별도 전문 서비스',
    priceText: '별도 협의',
    billingNotice: '정밀 자문/사건 수임 계약 (정기구독 요금제와 분리)',
    description: '취업규칙 정밀 제·개정, 노동위원회 구제신청 대리 등 고도화된 전문 사건 대리',
    category: '상담 서비스',
  },
];
