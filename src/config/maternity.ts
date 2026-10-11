import { MaternityStatus, MaternityWorkType } from '../types';

export interface MaternityWorkTypeConfig {
  type: MaternityWorkType;
  label: string;
  category: '휴가' | '휴직' | '단축근무' | '기타';
  statutoryPeriod: string;
  description: string;
  requiredDocuments: string[];
}

/**
 * Centralized registry of supported Maternity Protection work types.
 * Easily extensible for statutory revisions without altering core UI components.
 */
export const MATERNITY_WORK_TYPES: Record<MaternityWorkType, MaternityWorkTypeConfig> = {
  MATERNITY_LEAVE: {
    type: 'MATERNITY_LEAVE',
    label: '출산전후휴가',
    category: '휴가',
    statutoryPeriod: '출산 전후 90일 (다태아 120일), 출산 후 45일 이상 배정 필수',
    description: '임신 중인 여성 근로자의 출산 전후 회복 및 건강 보호를 위한 필수 휴가',
    requiredDocuments: ['출산(예정)증명서 / 진단서', '출산전후휴가 신청서', '통상임금 확인 서류'],
  },
  PATERNITY_LEAVE: {
    type: 'PATERNITY_LEAVE',
    label: '배우자 출산휴가',
    category: '휴가',
    statutoryPeriod: '10일 (유급, 출산일로부터 90일 이내 청구)',
    description: '배우자 출산 시 남성 근로자의 가사 및 육아 참여 지원 휴가',
    requiredDocuments: ['주민등록등본 또는 가족관계증명서', '배우자 출산휴가 신청서'],
  },
  MISCARRIAGE_LEAVE: {
    type: 'MISCARRIAGE_LEAVE',
    label: '유산·사산휴가',
    category: '휴가',
    statutoryPeriod: '임신 주수에 따라 5일 ~ 90일 차등 부여',
    description: '임신 중 유산 또는 사산한 여성 근로자의 신체적·정신적 회복 지원 휴가',
    requiredDocuments: ['의사 진단서 (임신 주수 및 유산/사산 사실 명시)'],
  },
  PARENTAL_LEAVE: {
    type: 'PARENTAL_LEAVE',
    label: '육아휴직',
    category: '휴직',
    statutoryPeriod: '자녀 1명당 최대 1년 (부모 각각 1년 가능)',
    description: '만 8세 이하 또는 초등학교 2학년 이하의 자녀 양육을 위한 휴직',
    requiredDocuments: ['주민등록등본 또는 가족관계증명서', '육아휴직 신청서'],
  },
  PARENTAL_REDUCED_HOURS: {
    type: 'PARENTAL_REDUCED_HOURS',
    label: '육아기 근로시간 단축',
    category: '단축근무',
    statutoryPeriod: '자녀 1명당 최대 1년 (육아휴직 미사용 기간 가산 가능, 주 15~35시간)',
    description: '퇴직 없이 일과 육아를 병행할 수 있도록 소정근로시간을 단축하여 근무',
    requiredDocuments: ['단축근무 신청서', '자녀 가족관계증명서', '근로조건 변경합의서'],
  },
  PREGNANCY_REDUCED_HOURS: {
    type: 'PREGNANCY_REDUCED_HOURS',
    label: '임신기 근로시간 단축',
    category: '단축근무',
    statutoryPeriod: '임신 12주 이내 또는 36주 이후 (1일 2시간 단축, 임금 삭감 불가)',
    description: '조기 유산 위험 및 만삭 부담 경감을 위한 1일 2시간 근로시간 단축',
    requiredDocuments: ['임신 확인서 / 의사 진단서', '임신기 근로시간 단축 신청서'],
  },
  INFERTILITY_TREATMENT_LEAVE: {
    type: 'INFERTILITY_TREATMENT_LEAVE',
    label: '난임치료휴가',
    category: '휴가',
    statutoryPeriod: '연간 3일 (최초 1일 유급, 2일 무급)',
    description: '인공수정 등 난임치료 시술을 받기 위한 근로자 지원 휴가',
    requiredDocuments: ['난임치료 시술 확인서 / 진료확인서'],
  },
  OTHER_MATERNITY: {
    type: 'OTHER_MATERNITY',
    label: '기타',
    category: '기타',
    statutoryPeriod: '사내 규정 및 법령 개정 사항 준용',
    description: '수유시간 보장, 야간·휴일근로 제한 등 기타 모성보호 법정 노무 관리',
    requiredDocuments: ['관련 증빙 서류'],
  },
};

export interface MaternityStatusConfig {
  label: string;
  badge: string;
  stepOrder: number;
  type: 'PRIMARY' | 'ADDITIONAL';
  description: string;
}

export const MATERNITY_STATUS_CONFIG: Record<MaternityStatus, MaternityStatusConfig> = {
  APPLIED: {
    label: '신청',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    stepOrder: 1,
    type: 'PRIMARY',
    description: '모성보호 업무 신청이 접수되었습니다.',
  },
  DOCS_COLLECTING: {
    label: '서류수집',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    stepOrder: 2,
    type: 'PRIMARY',
    description: '법정 필수 서류를 수집 및 확인 중입니다.',
  },
  UNDER_REVIEW: {
    label: '검토',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    stepOrder: 3,
    type: 'PRIMARY',
    description: '공인노무사가 법정 기준 적합 여부를 검토 중입니다.',
  },
  IN_PROGRESS: {
    label: '처리중',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    stepOrder: 4,
    type: 'PRIMARY',
    description: '기업 내부 승인 및 행정 절차가 진행 중입니다.',
  },
  COMPLETED: {
    label: '완료',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    stepOrder: 5,
    type: 'PRIMARY',
    description: '모성보호 업무 처리가 완료되었습니다.',
  },
  SUPPLEMENT_REQUESTED: {
    label: '보완요청',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    stepOrder: 0,
    type: 'ADDITIONAL',
    description: '서류 또는 신청 내용의 보완이 요청되었습니다.',
  },
  CANCELLED: {
    label: '취소',
    badge: 'bg-gray-100 text-gray-500 border-gray-200',
    stepOrder: -1,
    type: 'ADDITIONAL',
    description: '신청이 취소 또는 종결되었습니다.',
  },
};

export const PRIMARY_STATUS_FLOW: MaternityStatus[] = [
  'APPLIED',
  'DOCS_COLLECTING',
  'UNDER_REVIEW',
  'IN_PROGRESS',
  'COMPLETED',
];

export const ADDITIONAL_STATUS_FLOW: MaternityStatus[] = [
  'SUPPLEMENT_REQUESTED',
  'CANCELLED',
];

/**
 * Backward-compatible helper to safely resolve Korean label for any workType code or legacy value.
 */
export function getMaternityWorkTypeLabel(workType: string | undefined | null): string {
  if (!workType) return '기타';
  if (MATERNITY_WORK_TYPES[workType as MaternityWorkType]) {
    return MATERNITY_WORK_TYPES[workType as MaternityWorkType].label;
  }
  // Check if string matches any label
  for (const item of Object.values(MATERNITY_WORK_TYPES)) {
    if (item.label === workType) return item.label;
  }
  return workType;
}

/**
 * Backward-compatible helper to safely resolve status configuration for any status string or legacy value.
 */
export function getMaternityStatusConfig(status: string | undefined | null): MaternityStatusConfig {
  if (!status) {
    return MATERNITY_STATUS_CONFIG.APPLIED;
  }
  if (MATERNITY_STATUS_CONFIG[status as MaternityStatus]) {
    return MATERNITY_STATUS_CONFIG[status as MaternityStatus];
  }
  const upper = status.toUpperCase();
  if (MATERNITY_STATUS_CONFIG[upper as MaternityStatus]) {
    return MATERNITY_STATUS_CONFIG[upper as MaternityStatus];
  }
  for (const item of Object.values(MATERNITY_STATUS_CONFIG)) {
    if (item.label === status) return item;
  }
  return {
    label: status,
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    stepOrder: 0,
    type: 'ADDITIONAL',
    description: status,
  };
}
