export interface PolicyDocument {
  id: string;
  type: string;
  title: string;
  version: string;
  required: boolean;
  summary: string;
  lastUpdated: string;
}

export const CURRENT_TERMS_VERSION = 'v1.0.0';

export const POLICY_DOCUMENTS: PolicyDocument[] = [
  {
    id: 'terms-of-service',
    type: 'TERMS_OF_SERVICE',
    title: '서비스 이용약관',
    version: CURRENT_TERMS_VERSION,
    required: true,
    summary: '노무법인 나인 온라인 노무관리 서비스 이용에 관한 권리와 의무 및 기본 운영 규정입니다.',
    lastUpdated: '2026-03-01',
  },
  {
    id: 'privacy-collection',
    type: 'PRIVACY_COLLECTION',
    title: '개인정보 수집·이용 동의',
    version: CURRENT_TERMS_VERSION,
    required: true,
    summary: '회원가입, 기업 및 근로자 노무관리, 본인 확인을 위한 최소한의 개인정보 수집 및 처리 동의입니다.',
    lastUpdated: '2026-03-01',
  },
  {
    id: 'marketing-consent',
    type: 'MARKETING_CONSENT',
    title: '선택적 마케팅 정보 수신 동의',
    version: CURRENT_TERMS_VERSION,
    required: false,
    summary: '노동법 개정 안내, 신규 노무 컨설팅 세미나 및 프로모션 안내 수신 동의입니다 (미동의 시에도 가입 가능).',
    lastUpdated: '2026-03-01',
  },
  {
    id: 'privacy-policy',
    type: 'PRIVACY_POLICY',
    title: '개인정보처리방침',
    version: CURRENT_TERMS_VERSION,
    required: false,
    summary: '개인정보보호법에 의거하여 고객의 소중한 개인정보를 안전하게 처리하고 보호하기 위한 방침입니다.',
    lastUpdated: '2026-03-01',
  },
  {
    id: 'paid-service-terms',
    type: 'PAID_SERVICE_TERMS',
    title: '유료서비스 이용 안내',
    version: CURRENT_TERMS_VERSION,
    required: false,
    summary: '오프라인 계약·결제 확인 후 관리자가 이용 플랜과 기간을 지정하는 운영 안내입니다.',
    lastUpdated: '2026-03-01',
  },
  {
    id: 'refund-policy',
    type: 'REFUND_POLICY',
    title: '취소·환불정책',
    version: CURRENT_TERMS_VERSION,
    required: false,
    summary: '오프라인 계약에 따른 취소·환불 조건은 개별 계약 및 적용 법령에 따라 안내합니다.',
    lastUpdated: '2026-03-01',
  },
  {
    id: 'subscription-cancellation',
    type: 'SUBSCRIPTION_CANCELLATION',
    title: '서비스 이용 종료 안내',
    version: CURRENT_TERMS_VERSION,
    required: false,
    summary: '자동결제 없이 운영되는 플랜의 종료·변경 및 잔여 이용기간에 관한 안내입니다.',
    lastUpdated: '2026-03-01',
  },
  {
    id: 'withdrawal-policy',
    type: 'WITHDRAWAL_POLICY',
    title: '회원탈퇴 및 서비스 이용종료 정책',
    version: CURRENT_TERMS_VERSION,
    required: false,
    summary: '계정 탈퇴 시 소속 기업 데이터 격리, 법정 보존 서류 관리 및 서비스 이용 종료 절차입니다.',
    lastUpdated: '2026-03-01',
  },
];
