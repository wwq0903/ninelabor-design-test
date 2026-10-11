import React, { useEffect, useState } from 'react';
import {
  Company,
  CompanyStatus,
  CompanySubscription,
  PlanCode,
  SubscriptionRequest,
  SubscriptionRequestStatus,
  SubscriptionStatus,
  UserRole,
} from '../../../types';
import { PLANS } from '../../../config/plans';
import { firmService } from '../../../services/firmService';
import { subscriptionRequestService } from '../../../services/subscriptionRequestService';
import { getSubscriptionEntitlement } from '../../../utils/subscriptionEntitlement';
import { useAuth } from '../../../contexts/AuthContext';
import { isValidPlanDate } from '../../../utils/planDates';
import {
  CreditCard,
  Receipt,
  Building2,
  Tag,
  ShieldAlert,
  Calendar,
  AlertCircle,
  X,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
  Clock3,
  Check,
  Ban,
  Send,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';

interface AdminSubscriptionsViewProps {
  companies: Company[];
  onRefreshCompanies: () => Promise<void>;
  mode: 'subscriptions';
}

const VALID_PLAN_CODES: { code: PlanCode; name: string; desc: string }[] = [
  { code: 'FREE', name: '무료 체험 (FREE)', desc: '기본 인사노무 시스템 무료 이용' },
  { code: 'BASIC', name: '베이직 (BASIC)', desc: '월 15,000원 / 문서, 자료요청, 근로자관리' },
  { code: 'STANDARD', name: '스탠다드 (STANDARD)', desc: '월 30,000원 / 1:1 노무문의 + 모성보호 월 5회 무료' },
  { code: 'CUSTOM', name: '맞춤형 (CUSTOM)', desc: '기업 맞춤형 자문 컨설팅' },
  { code: 'OUTSOURCING', name: '급여 아웃소싱 (OUTSOURCING)', desc: '급여산정 및 4대보험 위탁 전용' },
];

const VALID_STATUSES: { status: SubscriptionStatus; label: string; color: string }[] = [
  { status: 'ACTIVE', label: '정상 이용 (ACTIVE)', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { status: 'PENDING', label: '승인 대기 (PENDING)', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { status: 'EXPIRED', label: '구독 만료 (EXPIRED)', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  { status: 'CANCELLED', label: '구독 해지 (CANCELLED)', color: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const LEGACY_REQUESTS_ENABLED = false; // Existing records remain readable; new applications are disabled.

export const AdminSubscriptionsView: React.FC<AdminSubscriptionsViewProps> = ({
  companies,
  onRefreshCompanies,
  mode,
}) => {
  const { userProfile } = useAuth();

  // Sub-tab: 'requests' (플랜 변경 신청) vs 'companies' (기업별 구독 설정)
  const [subViewTab, setSubViewTab] = useState<'requests' | 'companies'>('companies');

  const [updatingCompanyId, setUpdatingCompanyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNSET' | SubscriptionStatus>('ALL');

  // Subscription Edit Modal State
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [modalPlanCode, setModalPlanCode] = useState<PlanCode>('STANDARD');
  const [modalStatus, setModalStatus] = useState<SubscriptionStatus>('ACTIVE');
  const [modalStartDate, setModalStartDate] = useState<string>('');
  const [modalEndDate, setModalEndDate] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSavingSubscription, setIsSavingSubscription] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // [R2-8 2/4-C-⑥] 플랜 변경 신청(subscription_requests) 관리 상태
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestSearchQuery, setRequestSearchQuery] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | SubscriptionRequestStatus>('ALL');

  // 신청 상세 및 심사 모달 상태
  const [selectedRequest, setSelectedRequest] = useState<SubscriptionRequest | null>(null);
  const [reviewCommentInput, setReviewCommentInput] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewModalError, setReviewModalError] = useState<string | null>(null);
  const [requestActionNotice, setRequestActionNotice] = useState<string | null>(null);

  // [R2-8 2/4-C-⑦] 승인 신청 실제 구독 적용 모달 상태
  const [applyingRequest, setApplyingRequest] = useState<SubscriptionRequest | null>(null);
  const [applyStartDate, setApplyStartDate] = useState<string>('');
  const [applyEndDate, setApplyEndDate] = useState<string>('');
  const [isApplyingSubscription, setIsApplyingSubscription] = useState(false);
  const [applyModalError, setApplyModalError] = useState<string | null>(null);

  const fetchSubscriptionRequests = async () => {
    try {
      setIsLoadingRequests(true);
      const reqs = await subscriptionRequestService.getAllSubscriptionRequests();
      setSubscriptionRequests(reqs);
    } catch (err) {
      console.error('Failed to load subscription requests', err);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (LEGACY_REQUESTS_ENABLED && mode === 'subscriptions') {
      fetchSubscriptionRequests();
    }
  }, [mode]);

  const pendingRequestsCount = subscriptionRequests.filter(
    (r) => r.status === 'REQUESTED' || r.status === 'UNDER_REVIEW'
  ).length;

  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return isoString;
    }
  };

  const getRequestStatusBadge = (status: SubscriptionRequestStatus) => {
    switch (status) {
      case 'REQUESTED':
        return {
          label: '접수',
          color: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      case 'UNDER_REVIEW':
        return {
          label: '검토중',
          color: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'APPROVED':
        return {
          label: '승인',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'REJECTED':
        return {
          label: '반려',
          color: 'bg-rose-50 text-rose-700 border-rose-200',
        };
      case 'CANCELLED':
        return {
          label: '취소',
          color: 'bg-slate-100 text-slate-600 border-slate-300',
        };
      default:
        return {
          label: status,
          color: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  };

  // Open Edit Modal for a Company
  const handleOpenEditModal = (c: Company) => {
    setEditingCompany(c);
    setModalError(null);
    if (c.subscription) {
      setModalPlanCode(c.subscription.planCode);
      setModalStatus(c.subscription.status);
      setModalStartDate(c.subscription.startDate || '');
      setModalEndDate(c.subscription.endDate || '');
    } else {
      // Existing company without subscription:
      // Prefill with existing currentPlanId if valid, otherwise STANDARD, and default status PENDING
      const fallbackPlan = (c.currentPlanId && ['FREE', 'BASIC', 'STANDARD', 'CUSTOM', 'OUTSOURCING'].includes(c.currentPlanId)
        ? c.currentPlanId
        : 'STANDARD') as PlanCode;
      setModalPlanCode(fallbackPlan);
      setModalStatus('ACTIVE');
      setModalStartDate(new Date().toISOString().slice(0, 10));
      setModalEndDate('');
    }
  };

  const handleCloseEditModal = () => {
    if (isSavingSubscription) return;
    setEditingCompany(null);
    setModalError(null);
  };

  // Submit Subscription Update
  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    // Validation 1: planCode
    if (!VALID_PLAN_CODES.some((p) => p.code === modalPlanCode)) {
      setModalError('유효한 플랜을 선택해주세요.');
      return;
    }

    // Validation 2: status
    if (!VALID_STATUSES.some((s) => s.status === modalStatus)) {
      setModalError('유효한 구독 상태를 선택해주세요.');
      return;
    }

    // Validation 3: Date range check (종료일이 시작일보다 이전이면 저장을 차단)
    const cleanStart = modalStartDate.trim();
    const cleanEnd = modalEndDate.trim();
    // Reject malformed dates instead of storing strings that break Firestore rule parsing.
    if ((cleanStart && !isValidPlanDate(cleanStart)) || (cleanEnd && !isValidPlanDate(cleanEnd))) {
      setModalError('날짜를 올바른 YYYY-MM-DD 형식으로 입력해주세요.');
      return;
    }
    if (cleanStart && cleanEnd && cleanEnd < cleanStart) {
      setModalError('종료일은 시작일보다 이전일 수 없습니다.');
      return;
    }

    try {
      setIsSavingSubscription(true);
      setModalError(null);

      const subscriptionPayload: CompanySubscription = {
        planCode: modalPlanCode,
        status: modalStatus,
      };
      if (cleanStart) subscriptionPayload.startDate = cleanStart;
      if (cleanEnd) subscriptionPayload.endDate = cleanEnd;

      // Update companies/{companyId}.subscription and sync currentPlanId atomically with Audit Log
      await firmService.updateCompanySubscription(
        editingCompany.id,
        subscriptionPayload,
        true, // sync legacy currentPlanId
        {
          uid: userProfile?.uid || 'admin',
          name: userProfile?.displayName || '최고관리자',
          role: userProfile?.role || 'ADMIN',
        }
      );

      await onRefreshCompanies();
      setSaveSuccessNotice(`[${editingCompany.companyName}] 구독 정보가 성공적으로 저장되었습니다.`);
      setTimeout(() => setSaveSuccessNotice(null), 4000);
      setEditingCompany(null);
    } catch (err: any) {
      console.error('Failed to update company subscription', err);
      setModalError(err?.message || '구독 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingSubscription(false);
    }
  };

  // Company Account Status Update (Company.status ≠ Company.subscription.status)
  const handleAccountStatusChange = async (companyId: string, status: CompanyStatus) => {
    try {
      setUpdatingCompanyId(companyId);
      await firmService.updateCompanyStatus(companyId, status);
      await onRefreshCompanies();
    } catch (err) {
      console.error('Failed to update company account status', err);
      alert('기업 계정 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingCompanyId(null);
    }
  };

  // Filter companies
  const filteredCompanies = companies.filter((c) => {
    const query = searchQuery.trim().toLowerCase();
    const matchQuery =
      !query ||
      c.companyName.toLowerCase().includes(query) ||
      c.businessNumber.toLowerCase().includes(query) ||
      (c.representativeName && c.representativeName.toLowerCase().includes(query));

    if (!matchQuery) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'UNSET') return !c.subscription;
    return c.subscription?.status === statusFilter;
  });

  // Filter subscription requests
  const filteredRequests = subscriptionRequests.filter((req) => {
    const query = requestSearchQuery.trim().toLowerCase();
    const matchQuery =
      !query ||
      req.companyName.toLowerCase().includes(query) ||
      req.requestedPlanCode.toLowerCase().includes(query) ||
      (req.note && req.note.toLowerCase().includes(query)) ||
      (req.requesterId && req.requesterId.toLowerCase().includes(query));

    if (!matchQuery) return false;

    if (requestStatusFilter === 'ALL') return true;
    return req.status === requestStatusFilter;
  });

  // Open Request Detail & Review Modal
  const handleOpenRequestModal = (req: SubscriptionRequest) => {
    setSelectedRequest(req);
    setReviewCommentInput(req.reviewComment || '');
    setReviewModalError(null);
  };

  const handleCloseRequestModal = () => {
    if (isSubmittingReview) return;
    setSelectedRequest(null);
    setReviewModalError(null);
    setReviewCommentInput('');
  };

  // Handle Admin Status Update for a Request
  const handleProcessRequestStatus = async (newStatus: SubscriptionRequestStatus) => {
    if (!selectedRequest) return;

    // Validation: 역방향 상태 전이 방지
    const currentStatus = selectedRequest.status;
    if (currentStatus === 'APPROVED' || currentStatus === 'REJECTED' || currentStatus === 'CANCELLED') {
      setReviewModalError('이미 심사가 완료된 종료 상태의 신청 건입니다. 상태를 변경할 수 없습니다.');
      return;
    }

    if (currentStatus === 'UNDER_REVIEW' && newStatus === 'REQUESTED') {
      setReviewModalError('검토 진행 중인 신청을 접수 상태로 되돌릴 수 없습니다.');
      return;
    }

    // 반려(REJECTED) 처리 시 반려 사유(심사 의견) 필수 입력 검증
    if (newStatus === 'REJECTED' && !reviewCommentInput.trim()) {
      setReviewModalError('반려 처리 시에는 반려 사유(심사 의견)를 반드시 입력해야 합니다.');
      return;
    }

    setIsSubmittingReview(true);
    setReviewModalError(null);

    const actor = {
      uid: userProfile?.uid || 'admin',
      role: (userProfile?.role || 'ADMIN') as UserRole,
      name: userProfile?.displayName || userProfile?.email || '관리자',
    };

    try {
      await subscriptionRequestService.updateSubscriptionRequestStatus({
        requestId: selectedRequest.id,
        newStatus,
        actor,
        reviewComment: reviewCommentInput.trim() || undefined,
      });

      // 안내 문구 설정 (승인 시 실제 구독 활성화는 별도임을 명시)
      if (newStatus === 'APPROVED') {
        setRequestActionNotice(
          `[${selectedRequest.companyName}] 플랜 변경 신청이 승인되었습니다. (신청 승인과 실제 구독 활성화는 별도 처리됩니다. [기업별 구독 설정]에서 필요한 경우 시작일/종료일을 반영하세요.)`
        );
      } else if (newStatus === 'REJECTED') {
        setRequestActionNotice(
          `[${selectedRequest.companyName}] 플랜 변경 신청이 반려되었습니다.`
        );
      } else {
        setRequestActionNotice(
          `[${selectedRequest.companyName}] 플랜 변경 신청이 '검토중' 상태로 전환되었습니다.`
        );
      }

      setTimeout(() => setRequestActionNotice(null), 5000);
      setSelectedRequest(null);
      setReviewCommentInput('');

      // 목록 새로고침 & 회사 락 해제 반영을 위한 회사 목록 새로고침
      await fetchSubscriptionRequests();
      await onRefreshCompanies();
    } catch (err: any) {
      console.error('Failed to update subscription request status', err);
      setReviewModalError(err?.message || '신청 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // [R2-8 2/4-C-⑦] 승인된 신청 실제 구독 적용 모달 핸들러
  const handleOpenApplyModal = (req: SubscriptionRequest) => {
    if (req.status !== 'APPROVED') {
      alert('승인(APPROVED) 상태의 신청만 실제 구독에 적용할 수 있습니다.');
      return;
    }
    if (req.appliedAt) {
      alert('이미 실제 구독에 적용 완료된 신청 건입니다.');
      return;
    }
    setApplyingRequest(req);
    // 기본 시작일: 오늘 날짜
    setApplyStartDate(new Date().toISOString().slice(0, 10));
    setApplyEndDate('');
    setApplyModalError(null);
  };

  const handleCloseApplyModal = () => {
    if (isApplyingSubscription) return;
    setApplyingRequest(null);
    setApplyModalError(null);
  };

  const handleExecuteApplySubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingRequest) return;

    const cleanStart = applyStartDate.trim();
    const cleanEnd = applyEndDate.trim();

    if (!cleanStart) {
      setApplyModalError('적용 시작일을 지정해주세요.');
      return;
    }

    if (cleanEnd && cleanEnd < cleanStart) {
      setApplyModalError('적용 종료일은 시작일보다 이전일 수 없습니다.');
      return;
    }

    setIsApplyingSubscription(true);
    setApplyModalError(null);

    const actor = {
      uid: userProfile?.uid || 'admin',
      role: (userProfile?.role || 'ADMIN') as UserRole,
      name: userProfile?.displayName || userProfile?.email || '관리자',
    };

    try {
      const result = await subscriptionRequestService.applyApprovedSubscriptionRequest({
        requestId: applyingRequest.id,
        startDate: cleanStart,
        endDate: cleanEnd || undefined,
        actor,
      });

      setRequestActionNotice(
        `[${applyingRequest.companyName}] 플랜(${result.newSubscription.planCode})이 실제 구독에 정상 적용되었습니다. (상태: ACTIVE, 시작일: ${result.newSubscription.startDate})`
      );
      setTimeout(() => setRequestActionNotice(null), 6000);

      setApplyingRequest(null);

      // 상세 모달이 열려있다면 최신 적용 데이터로 갱신
      if (selectedRequest && selectedRequest.id === applyingRequest.id) {
        setSelectedRequest(result.request);
      }

      await fetchSubscriptionRequests();
      await onRefreshCompanies();
    } catch (err: any) {
      console.error('Failed to apply subscription request', err);
      setApplyModalError(err?.message || '실제 구독 적용 중 오류가 발생했습니다.');
    } finally {
      setIsApplyingSubscription(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            서비스 관리
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
            총 {companies.length}개사 등록
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
          <CreditCard className="h-6 w-6 text-slate-700" />
          기업 플랜 수동 관리
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          오프라인 결제·계약을 확인한 후 관리자가 기업별 플랜, 이용 상태 및 기간을 직접 지정합니다. 온라인 결제는 제공하지 않습니다.
        </p>
      </div>

      {/* Success / Action Notice */}
      {saveSuccessNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessNotice}</span>
        </div>
      )}
      {requestActionNotice && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs font-semibold text-indigo-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
          <span>{requestActionNotice}</span>
        </div>
      )}

      {/* Sub-tab Navigation: legacy request UI retired */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        {LEGACY_REQUESTS_ENABLED && <button
          type="button"
          onClick={() => setSubViewTab('requests')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            subViewTab === 'requests'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/70 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>플랜 변경 신청 접수함</span>
          {pendingRequestsCount > 0 ? (
            <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-bold">
              대기 {pendingRequestsCount}건
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-medium border border-slate-200">
              {subscriptionRequests.length}건
            </span>
          )}
        </button>}
        <button
          type="button"
          onClick={() => setSubViewTab('companies')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            subViewTab === 'companies'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/70 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>기업별 플랜 지정</span>
          <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-medium border border-slate-200">
            {companies.length}개사
          </span>
        </button>
      </div>

      {/* Tab 1: 플랜 변경 신청 관리 영역 (R2-8 2/4-C-⑥) */}
      {LEGACY_REQUESTS_ENABLED && subViewTab === 'requests' && (
        <div className="space-y-4">
          {/* Requests Operation Notice Card */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-950 space-y-1.5">
            <div className="font-bold flex items-center gap-2 text-amber-950">
              <ShieldAlert className="h-4 w-4 text-amber-700" />
              플랜 변경 신청 접수 및 심사 중요 정책 (ADMIN)
            </div>
            <ul className="list-disc list-inside text-amber-900 space-y-0.5 pl-1 leading-relaxed text-[11px]">
              <li>
                <strong>승인과 실제 구독 분리 원칙:</strong> 플랜 변경 신청의 <code>승인(APPROVED)</code> 처리는 <strong>"신청을 승인했다"</strong>는 의미일 뿐이며, 회사의 실제 <code>companies/{'{companyId}'}.subscription</code>을 자동 변경하거나 <code>ACTIVE</code>로 만들지 않습니다.
              </li>
              <li>
                <strong>신청 승인과 실제 구독 활성화는 별도 처리됩니다:</strong> 승인 후 실제 플랜 반영 및 서비스 활성화는 <strong>[기업별 구독 설정]</strong> 탭에서 기업 협의 또는 증빙 확인 후 수동으로 설정해야 합니다.
              </li>
              <li>
                <strong>반려 사유 필수:</strong> <code>반려(REJECTED)</code> 처리 시에는 신청 기업이 사유를 즉시 확인할 수 있도록 <strong>심사 의견(반려 사유)을 필수로 입력</strong>해야 합니다.
              </li>
              <li>
                <strong>종료 시 락 해제:</strong> 신청 건이 <code>승인(APPROVED)</code>, <code>반려(REJECTED)</code>, <code>취소(CANCELLED)</code> 종료 상태가 되면 회사의 동시성 락(<code>activeSubscriptionRequestId</code>)이 정상 해제되어 기업이 새로운 신청을 진행할 수 있습니다.
              </li>
            </ul>
          </div>

          {/* Requests Table Card */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs p-5 space-y-4">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="기업명, 플랜, 메모, 신청자 검색..."
                  value={requestSearchQuery}
                  onChange={(e) => setRequestSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-slate-800 focus:outline-none transition"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap mr-1">
                  상태 필터:
                </span>
                <button
                  type="button"
                  onClick={() => setRequestStatusFilter('ALL')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    requestStatusFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  전체 ({subscriptionRequests.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestStatusFilter('REQUESTED')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    requestStatusFilter === 'REQUESTED'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  접수 ({subscriptionRequests.filter((r) => r.status === 'REQUESTED').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestStatusFilter('UNDER_REVIEW')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    requestStatusFilter === 'UNDER_REVIEW'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  검토중 ({subscriptionRequests.filter((r) => r.status === 'UNDER_REVIEW').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestStatusFilter('APPROVED')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    requestStatusFilter === 'APPROVED'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  승인 ({subscriptionRequests.filter((r) => r.status === 'APPROVED').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestStatusFilter('REJECTED')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    requestStatusFilter === 'REJECTED'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                  }`}
                >
                  반려 ({subscriptionRequests.filter((r) => r.status === 'REJECTED').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestStatusFilter('CANCELLED')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    requestStatusFilter === 'CANCELLED'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  취소 ({subscriptionRequests.filter((r) => r.status === 'CANCELLED').length})
                </button>

                <button
                  type="button"
                  onClick={fetchSubscriptionRequests}
                  disabled={isLoadingRequests}
                  className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition disabled:opacity-50"
                  title="목록 새로고침"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingRequests ? 'animate-spin' : ''}`} />
                  새로고침
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">기업명</th>
                    <th className="px-4 py-3">현재 이용 플랜</th>
                    <th className="px-4 py-3">신청 플랜</th>
                    <th className="px-4 py-3">신청일</th>
                    <th className="px-4 py-3">신청 상태</th>
                    <th className="px-4 py-3">신청자</th>
                    <th className="px-4 py-3">신청 메모</th>
                    <th className="px-4 py-3 text-center">심사 / 상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                        {isLoadingRequests ? '신청 목록을 불러오는 중입니다...' : '접수된 플랜 변경 신청 내역이 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req) => {
                      const matchedCompany = companies.find((c) => c.id === req.companyId);
                      const currentPlan =
                        matchedCompany?.subscription?.planCode || matchedCompany?.currentPlanId || '구독 미설정';
                      const statusBadge = getRequestStatusBadge(req.status);

                      return (
                        <tr key={req.id} className="hover:bg-slate-50/70 transition">
                          {/* 1. 기업명 */}
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-900">{req.companyName}</div>
                            {matchedCompany?.businessNumber && (
                              <div className="text-[10px] font-mono text-slate-500">
                                {matchedCompany.businessNumber}
                              </div>
                            )}
                          </td>

                          {/* 2. 현재 이용 플랜 */}
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {currentPlan}
                            </span>
                          </td>

                          {/* 3. 신청 플랜 */}
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Tag className="h-3 w-3 text-indigo-600" />
                              {req.requestedPlanCode}
                            </span>
                          </td>

                          {/* 4. 신청일 */}
                          <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                            {formatDate(req.createdAt)}
                          </td>

                          {/* 5. 신청 상태 */}
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col gap-1 items-start">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.color}`}
                              >
                                {statusBadge.label}
                              </span>
                              {req.status === 'APPROVED' && req.appliedAt && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  구독 적용 완료
                                </span>
                              )}
                              {req.status === 'APPROVED' && !req.appliedAt && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  적용 대기
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 6. 신청자 */}
                          <td className="px-4 py-3.5 font-mono text-xs text-slate-600 max-w-[120px] truncate" title={req.requesterId}>
                            {req.requesterId}
                          </td>

                          {/* 7. 신청 메모 */}
                          <td className="px-4 py-3.5 text-slate-600 max-w-[180px] truncate" title={req.note || ''}>
                            {req.note || <span className="text-slate-400">-</span>}
                          </td>

                          {/* 8. 심사 / 상세 및 구독 적용 버튼 */}
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {req.status === 'APPROVED' && !req.appliedAt && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenApplyModal(req)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 text-xs font-semibold shadow-xs transition"
                                  title="승인된 신청을 실제 구독에 적용"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  구독 적용
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenRequestModal(req)}
                                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1.5 text-xs font-semibold shadow-xs transition"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {req.status === 'APPROVED' && req.appliedAt ? '적용 정보' : '심사 및 상세'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: 기업별 구독 설정 관리 영역 */}
      {subViewTab === 'companies' && (
        <div className="space-y-4">
          {/* Operation Notice Card */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-900 space-y-1.5">
            <div className="font-bold flex items-center gap-2 text-indigo-950">
              <Layers className="h-4 w-4 text-indigo-600" />
              기업 구독 데이터 관리 정책 (Source of Truth: companies/{'{companyId}'}.subscription)
            </div>
            <ul className="list-disc list-inside text-indigo-800 space-y-0.5 pl-1 leading-relaxed text-[11px]">
              <li>
                <strong>하위 호환성 동기화:</strong> 구독 설정 저장 시 <code>companies/{'{companyId}'}.subscription</code>에 기록되며 기존 <code>currentPlanId</code>도 동일 플랜으로 자동 동기화됩니다.
              </li>
              <li>
                <strong>기존 기업 보존:</strong> 구독 데이터가 없는 기업은 시스템이 임의로 FREE를 저장하지 않으며, <strong>"구독 미설정"</strong> 상태로 명확히 표시됩니다.
              </li>
              <li>
                <strong>상태 분리 원칙:</strong> 기업 계정 상태(<code>Company.status</code>: 정상/승인대기/이용정지)와 구독 상태(<code>Company.subscription.status</code>: PENDING/ACTIVE/EXPIRED/CANCELLED)는 독립적으로 운영됩니다.
              </li>
            </ul>
          </div>

          {/* Table Card */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs p-5 space-y-4">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="기업명, 사업자번호 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-slate-800 focus:outline-none transition"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap mr-1">
                  상태 필터:
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    statusFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  전체 ({companies.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('UNSET')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    statusFilter === 'UNSET'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  구독 미설정 ({companies.filter((c) => !c.subscription).length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  정상 ({companies.filter((c) => c.subscription?.status === 'ACTIVE').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('PENDING')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    statusFilter === 'PENDING'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  대기 ({companies.filter((c) => c.subscription?.status === 'PENDING').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('EXPIRED')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    statusFilter === 'EXPIRED'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  만료 ({companies.filter((c) => c.subscription?.status === 'EXPIRED').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('CANCELLED')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    statusFilter === 'CANCELLED'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                  }`}
                >
                  해지 ({companies.filter((c) => c.subscription?.status === 'CANCELLED').length})
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">기업명</th>
                    <th className="px-4 py-3">현재 플랜</th>
                    <th className="px-4 py-3">구독 상태</th>
                    <th className="px-4 py-3">시작일</th>
                    <th className="px-4 py-3">종료일</th>
                    <th className="px-4 py-3 text-center">기업 계정 상태</th>
                    <th className="px-4 py-3 text-center">구독 설정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCompanies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        일치하는 기업이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredCompanies.map((c) => {
                      const isUpdating = updatingCompanyId === c.id;
                      const hasSub = Boolean(c.subscription);
                      const subPlan = c.subscription?.planCode;
                      const compEntitlement = getSubscriptionEntitlement(c);
                      const subStatus = c.subscription?.status;

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition">
                          {/* 1. 기업명 */}
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-900">{c.companyName}</div>
                            <div className="text-[10px] font-mono text-slate-500">
                              {c.businessNumber} {c.representativeName ? `· ${c.representativeName}` : ''}
                            </div>
                          </td>

                          {/* 2. 현재 플랜 */}
                          <td className="px-4 py-3.5">
                            {hasSub && subPlan ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                                <Tag className="h-3 w-3 text-purple-600" />
                                {subPlan}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                구독 미설정
                              </span>
                            )}
                          </td>

                          {/* 3. 구독 상태 (세부 생명주기 반영: 정상/이용기간 만료/이용 시작 전/대기/만료/해지) */}
                          <td className="px-4 py-3.5">
                            {hasSub && subStatus ? (
                              compEntitlement.displayStatus === 'ACTIVE' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                                  정상 (ACTIVE)
                                </span>
                              ) : compEntitlement.displayStatus === 'PERIOD_EXPIRED' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-rose-50 text-rose-700 border-rose-200" title={`종료일: ${c.subscription?.endDate}`}>
                                  이용기간 만료
                                </span>
                              ) : compEntitlement.displayStatus === 'BEFORE_START' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-amber-50 text-amber-700 border-amber-200" title={`시작일: ${c.subscription?.startDate}`}>
                                  이용 시작 전
                                </span>
                              ) : compEntitlement.displayStatus === 'PENDING' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-amber-50 text-amber-700 border-amber-200">
                                  대기 (PENDING)
                                </span>
                              ) : compEntitlement.displayStatus === 'EXPIRED' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-slate-100 text-slate-600 border-slate-300">
                                  만료 (EXPIRED)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-rose-50 text-rose-700 border-rose-200">
                                  해지 (CANCELLED)
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                구독 미설정
                              </span>
                            )}
                          </td>

                          {/* 4. 시작일 */}
                          <td className="px-4 py-3.5 text-slate-700 font-mono text-xs">
                            {c.subscription?.startDate || <span className="text-slate-400 font-sans">-</span>}
                          </td>

                          {/* 5. 종료일 */}
                          <td className="px-4 py-3.5 text-slate-700 font-mono text-xs">
                            {c.subscription?.endDate || <span className="text-slate-400 font-sans">-</span>}
                          </td>

                          {/* 기업 계정 자체 상태 (Company.status - 계정 관리용) */}
                          <td className="px-4 py-3.5 text-center">
                            <select
                              disabled={isUpdating}
                              value={c.status}
                              onChange={(e) => handleAccountStatusChange(c.id, e.target.value as CompanyStatus)}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold focus:outline-none transition ${
                                c.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : c.status === 'pending'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                              title="기업 계정 상태 (Company.status)"
                            >
                              <option value="active">계정 정상</option>
                              <option value="pending">계정 승인대기</option>
                              <option value="suspended">계정 이용정지</option>
                            </select>
                          </td>

                          {/* 관리 버튼 */}
                          <td className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(c)}
                              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              {hasSub ? '구독 변경' : '구독 설정'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* [R2-8 2/4-C-⑥] 플랜 변경 신청 상세 및 심사 모달 (ADMIN) */}
      {LEGACY_REQUESTS_ENABLED && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700 border border-indigo-100">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    플랜 변경 신청 상세 및 심사
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    신청 ID: {selectedRequest.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmittingReview}
                onClick={handleCloseRequestModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {/* Critical Policy Banner (Requirement 5) */}
              <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 space-y-1">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
                  <span>신청 승인과 실제 구독 활성화는 별도 처리됩니다</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  [신청 승인]은 관리자가 플랜 변경 신청건을 검토 후 승인했음을 기록하는 것이며, 회사의 실제 구독(<code>companies/{'{companyId}'}.subscription</code>)이 자동으로 변경되거나 <code>ACTIVE</code>로 활성화되지 않습니다. 실제 구독 적용은 [기업별 구독 설정] 탭에서 시작일/종료일과 함께 설정해야 합니다.
                </p>
              </div>

              {/* Error Banner */}
              {reviewModalError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{reviewModalError}</span>
                </div>
              )}

              {/* Company & Current Subscription Info */}
              {(() => {
                const matchedCompany = companies.find((c) => c.id === selectedRequest.companyId);
                const currentSubPlan =
                  matchedCompany?.subscription?.planCode || matchedCompany?.currentPlanId || '구독 미설정';
                const currentSubStatus = matchedCompany?.subscription?.status || '구독 미설정';

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Left: 기업 정보 */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 text-slate-600" />
                        신청 기업 정보
                      </div>
                      <div className="space-y-1 text-slate-700">
                        <div className="flex justify-between">
                          <span className="text-slate-500">기업명:</span>
                          <span className="font-semibold">{selectedRequest.companyName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">사업자번호:</span>
                          <span className="font-mono">{matchedCompany?.businessNumber || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">현재 이용 플랜:</span>
                          <span className="font-semibold text-indigo-700">{currentSubPlan}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">현재 구독 상태:</span>
                          <span className="font-bold">{currentSubStatus}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: 신청 상세 */}
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-2">
                      <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                        <Tag className="h-4 w-4 text-indigo-600" />
                        플랜 변경 신청 내용
                      </div>
                      <div className="space-y-1 text-slate-700">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">신청 플랜:</span>
                          <span className="font-bold text-sm text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                            {selectedRequest.requestedPlanCode}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">신청 일시:</span>
                          <span className="font-mono">{formatDate(selectedRequest.createdAt)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">신청자:</span>
                          <span className="font-mono max-w-[120px] truncate" title={selectedRequest.requesterId}>
                            {selectedRequest.requesterId}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">현재 신청 상태:</span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              getRequestStatusBadge(selectedRequest.status).color
                            }`}
                          >
                            {getRequestStatusBadge(selectedRequest.status).label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* [R2-8 2/4-C-⑦] 실제 구독 적용 현황 안내 */}
              {selectedRequest.status === 'APPROVED' && (
                selectedRequest.appliedAt ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 space-y-1.5">
                    <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>실제 구독 적용 완료 내역</span>
                    </div>
                    <div className="text-[11px] text-emerald-900 space-y-0.5">
                      <div>
                        적용 일시: <span className="font-mono">{formatDate(selectedRequest.appliedAt)}</span>
                      </div>
                      <div>
                        적용 처리자:{' '}
                        <span className="font-semibold">
                          {selectedRequest.appliedByName || selectedRequest.appliedById || '-'}
                        </span>
                      </div>
                      <div>
                        적용 플랜:{' '}
                        <span className="font-bold text-indigo-700">
                          {selectedRequest.appliedSubscriptionPlanCode || selectedRequest.requestedPlanCode}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-700 mt-0.5">
                      본 신청은 회사의 실제 구독(<code>companies/{'{companyId}'}.subscription</code>)에 ACTIVE 상태로 정상 반영되었습니다.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 space-y-1.5">
                    <div className="font-bold text-blue-950 flex items-center gap-1.5">
                      <Clock3 className="h-4 w-4 text-blue-600 shrink-0" />
                      <span>실제 구독 활성화 대기 중</span>
                    </div>
                    <p className="text-[11px] text-blue-900 leading-relaxed">
                      본 신청은 심사 승인(APPROVED)되었으나, 회사의 실제 구독에는 아직 반영되지 않았습니다. 관리자가 실제 계약/입금 등 필요한 확인을 완료한 후 하단의 <strong>[실제 구독에 적용]</strong>을 눌러 수동 적용할 수 있습니다.
                    </p>
                  </div>
                )
              )}

              {/* Note / Request Memo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  신청 메모
                </label>
                <div className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-slate-800 text-xs min-h-[50px] leading-relaxed">
                  {selectedRequest.note || <span className="text-slate-400">작성된 신청 메모가 없습니다.</span>}
                </div>
              </div>

              {/* Review History (if already reviewed) */}
              {(selectedRequest.reviewerName || selectedRequest.reviewedAt) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-800">이전 심사 기록</div>
                  <div className="text-[11px] space-y-0.5">
                    <div>
                      심사자: <span className="font-medium text-slate-900">{selectedRequest.reviewerName || selectedRequest.reviewerId || '-'}</span>
                    </div>
                    <div>
                      심사일시: <span className="font-mono text-slate-700">{formatDate(selectedRequest.reviewedAt)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Review Comment / Reason Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>심사 의견 / 반려 사유</span>
                  {selectedRequest.status !== 'APPROVED' &&
                    selectedRequest.status !== 'REJECTED' &&
                    selectedRequest.status !== 'CANCELLED' && (
                      <span className="text-[10px] font-normal text-rose-500">
                        ※ 반려 처리 시 필수 입력
                      </span>
                    )}
                </label>

                {selectedRequest.status === 'APPROVED' ||
                selectedRequest.status === 'REJECTED' ||
                selectedRequest.status === 'CANCELLED' ? (
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800 text-xs min-h-[60px] leading-relaxed">
                    {selectedRequest.reviewComment || (
                      <span className="text-slate-400">등록된 심사 의견이 없습니다.</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    rows={3}
                    value={reviewCommentInput}
                    onChange={(e) => setReviewCommentInput(e.target.value)}
                    placeholder="승인 또는 반려 사유를 입력하세요. (반려 시 필수)"
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 focus:border-slate-800 focus:outline-none"
                  />
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
              <button
                type="button"
                disabled={isSubmittingReview}
                onClick={handleCloseRequestModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
              >
                닫기
              </button>

              <div className="flex items-center gap-2">
                {/* 1. 종료 상태인 경우 안내 및 실제 구독 적용 버튼 */}
                {selectedRequest.status === 'APPROVED' && (
                  <div className="flex items-center gap-2">
                    {selectedRequest.appliedAt ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        실제 구독 적용 완료 ({formatDate(selectedRequest.appliedAt)})
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isSubmittingReview}
                        onClick={() => {
                          const req = selectedRequest;
                          handleCloseRequestModal();
                          handleOpenApplyModal(req);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold shadow-xs transition"
                        title="승인된 신청을 실제 구독에 수동 적용"
                      >
                        <Check className="h-3.5 w-3.5" />
                        실제 구독에 적용
                      </button>
                    )}
                  </div>
                )}

                {(selectedRequest.status === 'REJECTED' || selectedRequest.status === 'CANCELLED') && (
                  <span className="text-xs text-slate-500 font-medium">
                    심사가 완료된 종료 상태 건입니다.
                  </span>
                )}

                {/* 2. REQUESTED 상태인 경우 */}
                {selectedRequest.status === 'REQUESTED' && (
                  <>
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => handleProcessRequestStatus('UNDER_REVIEW')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50"
                    >
                      <Clock3 className="h-3.5 w-3.5" />
                      검토중으로 변경
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => handleProcessRequestStatus('REJECTED')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50"
                      title="반려 시 심사 의견 입력 필수"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      신청 반려
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => handleProcessRequestStatus('APPROVED')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-semibold shadow-xs transition disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      신청 승인
                    </button>
                  </>
                )}

                {/* 3. UNDER_REVIEW 상태인 경우 */}
                {selectedRequest.status === 'UNDER_REVIEW' && (
                  <>
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => handleProcessRequestStatus('REJECTED')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50"
                      title="반려 시 심사 의견 입력 필수"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      신청 반려
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => handleProcessRequestStatus('APPROVED')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-semibold shadow-xs transition disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      신청 승인
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Edit Modal */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700 border border-indigo-100">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    기업 구독 설정 (ADMIN)
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingCompany.companyName} ({editingCompany.businessNumber})
                  </p>
                </div>
              </div>
              <button
                disabled={isSavingSubscription}
                onClick={handleCloseEditModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveSubscription} className="p-6 space-y-5">
              {/* Current Status Callout */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs space-y-1">
                <div className="font-semibold text-slate-700 flex items-center justify-between">
                  <span>현재 구독 저장 상태:</span>
                  {editingCompany.subscription ? (
                    <span className="font-bold text-indigo-700">
                      {editingCompany.subscription.planCode} ({editingCompany.subscription.status})
                    </span>
                  ) : (
                    <span className="font-bold text-amber-700">구독 미설정</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  저장 시 <code>companies/{editingCompany.id}.subscription</code>에 반영되며, 하위 호환성을 위해 <code>currentPlanId</code>도 동일 플랜으로 자동 동기화됩니다.
                </p>
              </div>

              {/* Error Banner */}
              {modalError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 1. Plan Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  적용 플랜 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={modalPlanCode}
                  onChange={(e) => setModalPlanCode(e.target.value as PlanCode)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-slate-800 focus:outline-none"
                >
                  {VALID_PLAN_CODES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} - {p.desc}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Subscription Status Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  구독 상태 (Subscription Status) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as SubscriptionStatus)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-slate-800 focus:outline-none"
                >
                  {VALID_STATUSES.map((s) => (
                    <option key={s.status} value={s.status}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  ※ 기업 계정 상태(Company.status: 계정 정상/승인대기/이용정지)와는 별개로 구독 권한 상태를 지정합니다.
                </p>
              </div>

              {/* 3. Date Range (Start Date / End Date) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    구독 시작일 (선택)
                  </label>
                  <input
                    type="date"
                    value={modalStartDate}
                    onChange={(e) => setModalStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    구독 종료일 (선택)
                  </label>
                  <input
                    type="date"
                    value={modalEndDate}
                    onChange={(e) => setModalEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Real-time Validation Message for Dates */}
              {modalStartDate && modalEndDate && modalEndDate < modalStartDate && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  종료일은 시작일보다 이전일 수 없습니다. 저장이 차단됩니다.
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingSubscription}
                  onClick={handleCloseEditModal}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={
                    isSavingSubscription ||
                    Boolean(modalStartDate && modalEndDate && modalEndDate < modalStartDate)
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingSubscription ? '저장 중...' : '구독 정보 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* [R2-8 2/4-C-⑦] 승인 신청 실제 구독 적용 확인 모달 (ADMIN 수동 적용) */}
      {LEGACY_REQUESTS_ENABLED && applyingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700 border border-indigo-100">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    플랜 변경 신청 실제 구독 적용
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {applyingRequest.companyName} (신청 ID: {applyingRequest.id})
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isApplyingSubscription}
                onClick={handleCloseApplyModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleExecuteApplySubscription} className="p-6 space-y-5">
              {/* Critical Operation Notice (Requirement 10) */}
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 space-y-1">
                <div className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                  <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
                  <span>결제 자동 확인 기능이 아닙니다</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  본 기능은 관리자가 실제 계약/입금 등 필요한 확인을 외부에서 완료했다고 판단한 뒤 수동으로 적용하는 운영 기능입니다. 시스템이 결제가 완료됐다고 자동 판단하는 기능이 아닙니다.
                </p>
              </div>

              {/* Error Banner */}
              {applyModalError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{applyModalError}</span>
                </div>
              )}

              {/* Comparison Details */}
              {(() => {
                const matchedCompany = companies.find((c) => c.id === applyingRequest.companyId);
                const currentSubPlan =
                  matchedCompany?.subscription?.planCode || matchedCompany?.currentPlanId || '구독 미설정';
                const currentSubStatus = matchedCompany?.subscription?.status || '구독 미설정';

                return (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3 text-xs">
                    <div className="font-bold text-slate-900">구독 변경 내용 확인</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-0.5">기업명</span>
                        <span className="font-bold text-slate-900">{applyingRequest.companyName}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-0.5">사업자번호</span>
                        <span className="font-mono text-slate-700">{matchedCompany?.businessNumber || '-'}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-0.5">현재 이용 플랜</span>
                        <span className="font-semibold text-slate-700">{currentSubPlan}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-0.5">현재 구독 상태</span>
                        <span className="font-bold text-slate-700">{currentSubStatus}</span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-indigo-900 block font-semibold">적용할 플랜 (신청 플랜)</span>
                          <span className="text-sm font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 inline-block mt-0.5">
                            {applyingRequest.requestedPlanCode}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-emerald-900 block font-semibold">적용 후 상태</span>
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 inline-block mt-0.5">
                            ACTIVE (정상 이용)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Date Inputs (Requirement 3) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    적용 시작일 (startDate) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={applyStartDate}
                    onChange={(e) => setApplyStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-800 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    관리자가 직접 지정 (자동 30일/1개월 계산 없음)
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    적용 종료일 (endDate, 선택)
                  </label>
                  <input
                    type="date"
                    value={applyEndDate}
                    onChange={(e) => setApplyEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-800 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    선택 사항 (미지정 시 무기한 운영)
                  </p>
                </div>
              </div>

              {/* Date validation error */}
              {applyStartDate && applyEndDate && applyEndDate < applyStartDate && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  종료일은 시작일보다 이전일 수 없습니다. 저장이 차단됩니다.
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isApplyingSubscription}
                  onClick={handleCloseApplyModal}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={
                    isApplyingSubscription ||
                    !applyStartDate.trim() ||
                    Boolean(applyStartDate && applyEndDate && applyEndDate < applyStartDate)
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="h-4 w-4" />
                  {isApplyingSubscription ? '구독 적용 중...' : '구독 적용'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
