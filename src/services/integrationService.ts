import { IntegrationServiceItem } from '../types';

export const INSTITUTIONAL_INTEGRATIONS: IntegrationServiceItem[] = [
  {
    id: 'hometax',
    name: '국세청 홈택스 (HomeTax)',
    category: '세무·원천세',
    status: 'SETUP_REQUIRED',
    statusDetail: '사업자 공동인증서(법인/개인) 등록 및 원천세 연동 설정 필요',
    isExternalLink: true,
    linkUrl: 'https://www.hometax.go.kr',
  },
  {
    id: '4insur',
    name: '4대사회보험 연계센터',
    category: '4대보험 총괄',
    status: 'CONNECTED',
    statusDetail: '자격 취득·상실 및 전산 일괄 신고 대행 연계 정상',
    isExternalLink: true,
    linkUrl: 'https://www.4insur.or.kr',
  },
  {
    id: 'comwel',
    name: '고용·산재보험 토탈서비스 (근로복지공단)',
    category: '모성보호·산재',
    status: 'CONNECTED',
    statusDetail: '출산전후휴가·육아휴직 확인서 및 보수총액신고 연계 정상',
    isExternalLink: true,
    linkUrl: 'https://total.comwel.or.kr',
  },
  {
    id: 'nhis',
    name: '국민건강보험 EDI 시스템',
    category: '건강보험',
    status: 'SETUP_REQUIRED',
    statusDetail: '건강보험 피부양자 자격취득 및 고지내역 EDI 연동 대기중',
    isExternalLink: true,
    linkUrl: 'https://edi.nhis.or.kr',
  },
  {
    id: 'nps',
    name: '국민연금 EDI 포털',
    category: '국민연금',
    status: 'DISCONNECTED',
    statusDetail: '국민연금 사업장 가입자 증명 및 통보서 연계 미설정',
    isExternalLink: true,
    linkUrl: 'https://edi.nps.or.kr',
  },
];

export const integrationService = {
  getIntegrations(): IntegrationServiceItem[] {
    return INSTITUTIONAL_INTEGRATIONS;
  },
};
