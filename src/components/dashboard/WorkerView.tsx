import React, { useEffect, useState } from 'react';
import { Company, Worker } from '../../types';
import { firmService } from '../../services/firmService';
import { useAuth } from '../../contexts/AuthContext';
import { InquiriesView } from './common/InquiriesView';
import { PayslipsView } from './payroll/PayslipsView';
import { DocumentsView } from './documents/DocumentsView';
import { NotificationsView } from './notifications/NotificationsView';
import { WorkerOvertimeView } from './worker/WorkerOvertimeView';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { ModulePlaceholder } from './common/ModulePlaceholder';
import {
  getMaternityWorkTypeLabel,
  getMaternityStatusConfig,
} from '../../config/maternity';
import {
  Home,
  Receipt,
  FolderOpen,
  Bell,
  MessageSquare,
  User,
  Building2,
  Calendar,
  Briefcase,
  HeartHandshake,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';

type WorkerTab = 'home' | 'payslips' | 'overtime' | 'documents' | 'notifications' | 'inquiries' | 'profile';

export const WorkerView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkerTab>('home');
  const [company, setCompany] = useState<Company | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [maternityCases, setMaternityCases] = useState<import('../../types').MaternityCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkerData = async () => {
      if (!userProfile) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        if (userProfile.companyId) {
          try {
            const comp = await firmService.getCompanyById(userProfile.companyId);
            setCompany(comp);
          } catch (compErr) {
            console.warn('Company fetch note:', compErr);
          }
        }

        // 1. Direct targeted check: worker record linked directly to this user ID or employee ID
        let currentWorker: Worker | null = null;
        if (userProfile.employeeId) {
          try {
            currentWorker = await firmService.getWorkerById(userProfile.employeeId);
          } catch (idErr) {
            console.warn('Worker by employeeId fetch note:', idErr);
          }
        }
        if (!currentWorker && userProfile.uid) {
          try {
            currentWorker = await firmService.getWorkerByUserId(userProfile.uid);
          } catch (uidErr) {
            console.warn('Worker by userId fetch note:', uidErr);
          }
        }

        if (currentWorker) {
          setWorker(currentWorker);
          try {
            const mCases = await firmService.getMaternityCasesByEmployee(currentWorker.id);
            setMaternityCases(mCases || []);
          } catch (mErr) {
            console.warn('Maternity cases note:', mErr);
          }
        }
      } catch (err) {
        console.warn('Worker info fetch notice:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkerData();
  }, [userProfile]);

  const isPendingVerification = userProfile?.membershipStatus === 'PENDING_COMPANY_VERIFICATION';

  // R2-5 1/3-A Requirement 3 & 4:
  // 회사 소속 WORKER: membershipType === 'COMPANY_AFFILIATED' or companyId or requestedCompanyId or PENDING
  // 비소속 개인 WORKER: membershipType === 'INDIVIDUAL' and !companyId and !requestedCompanyId
  const isAffiliatedWorker =
    userProfile?.membershipType === 'COMPANY_AFFILIATED' ||
    Boolean(userProfile?.companyId) ||
    Boolean(userProfile?.requestedCompanyId) ||
    isPendingVerification;

  const isIndividualWorker = !isAffiliatedWorker && userProfile?.membershipType === 'INDIVIDUAL';

  const navItems: { key: WorkerTab; label: string; icon: React.ElementType }[] = [
    { key: 'home', label: '홈', icon: Home },
    { key: 'payslips', label: '내 급여명세서', icon: Receipt },
    { key: 'overtime', label: '내 추가근무', icon: Clock },
    { key: 'documents', label: '내 문서', icon: FolderOpen },
    { key: 'notifications', label: '알림', icon: Bell },
    ...(isIndividualWorker ? [{ key: 'inquiries' as WorkerTab, label: '문의하기', icon: MessageSquare }] : []),
    { key: 'profile', label: '내 정보', icon: User },
  ];

  return (
    <div className="space-y-6">
      {/* Pending Affiliation Banner */}
      {isPendingVerification && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-start gap-3 shadow-xs">
          <div className="rounded-lg bg-amber-500 text-white p-1.5 shrink-0 mt-0.5">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-amber-900 text-sm">
              소속 기업 승인 대기 중 ({userProfile?.requestedCompanyName || '소속 기업'})
            </p>
            <p className="mt-1 leading-relaxed text-amber-700">
              최고관리자의 소속 승인 검토가 진행 중입니다. 승인이 완료되면 기업 내부 급여명세서, 서식 문서 보관함 및 모성보호 지원 현황에 정상적으로 접근하실 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            근로자 업무공간
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
            {isPendingVerification
              ? '소속 승인 대기'
              : userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
              ? '비소속 개인 근로자 모드'
              : '회사 소속 근로자'}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          근로자 노무 포털
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {isPendingVerification
            ? `신청하신 기업 (${userProfile?.requestedCompanyName || '확인 중'})의 관리자 승인 완료 후 기업 내부 데이터가 동기화됩니다.`
            : userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
            ? '1인 근로자, 프리랜서, 구직자를 위한 전문 노동법률 1:1 상담, 표준 서식 및 권익 보호 포털입니다.'
            : `소속 기업 (${company?.companyName || '확인 중'})의 본인 급여명세서, 근로계약 문서 및 1:1 노무 문의를 확인합니다.`}
        </p>
      </div>

      {/* Worker Simple Menu Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-px">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                isActive
                  ? 'border-emerald-600 text-emerald-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Tab: 홈 */}
      {activeTab === 'home' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                    ? '회원 유형'
                    : '소속 기업'}
                </span>
                <Building2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-slate-900 truncate">
                {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                  ? '비소속 개인 근로자'
                  : company?.companyName || '소속 확인 대기'}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                  ? '1인 근로자 / 프리랜서 / 구직자'
                  : company ? `사업자: ${company.businessNumber}` : '인사담당자 등록 확인 필요'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                    ? '노무 지원 서비스'
                    : '직무 및 부서'}
                </span>
                <Briefcase className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                  ? '1:1 노동법률 상담'
                  : `${worker?.department || '-'} / ${worker?.position || '일반'}`}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                  ? '공인노무사 직접 검토 및 답변'
                  : '재직 현황'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                    ? '서식 및 권리보호'
                    : '입사일자'}
                </span>
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                  ? '표준 계약 서식 지원'
                  : worker?.joinDate || '등록 대기'}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {userProfile?.membershipType === 'INDIVIDUAL' || !userProfile?.companyId
                  ? '내 권리 찾기 가이드'
                  : '근속 관리'}
              </p>
            </div>

            {/* Quick Overtime Summary Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">내 추가근무</span>
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <div className="mt-2 text-xl font-bold text-slate-900">
                  출근부 실적 조회
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  연장근무·휴무일근무 시간
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('overtime')}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
              >
                상세 근무시간 조회
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 모성보호 등 개인 해당 업무 상태 카드 준비 (확장 가능 구조) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 text-rose-500" />
                모성보호 및 일·가정 양립 지원
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">개인 맞춤 지원</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              임신 근로자 근로시간 단축, 출산전후휴가, 배우자 출산휴가, 육아휴직 및 육아기 근로시간 단축 등
              해당 근로자에게 적용되는 지원 제도 진행 현황을 확인할 수 있습니다.
            </p>
            {maternityCases.length > 0 ? (
              <div className="space-y-2">
                {maternityCases.map((c) => {
                  const statusConf = getMaternityStatusConfig(c.status);
                  const typeLabel = getMaternityWorkTypeLabel(c.workType);
                  return (
                    <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{typeLabel}</span>
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${statusConf.badge}`}>
                          {statusConf.label}
                        </span>
                      </div>
                      <div className="text-slate-600 font-mono text-[11px]">
                        기간: {c.startDate} ~ {c.endDate}
                        {c.returnDate && <span className="ml-2 text-emerald-700">(복직예정: {c.returnDate})</span>}
                      </div>
                      {/* Worker Supplement Notice: Only user-facing supplement request notice, no internal notes */}
                      {c.supplementRequest?.content && (
                        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">
                          <span className="font-bold">보완요청 안내: </span>
                          <span>{c.supplementRequest.content}</span>
                          {c.supplementRequest.requestedAt && (
                            <span className="block text-[10px] text-rose-600 font-mono mt-0.5">
                              요청일시: {new Date(c.supplementRequest.requestedAt).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-600 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>현재 진행 중인 모성보호 신청 건이 없습니다. 필요 시 인사담당자 또는 1:1 문의를 통해 신청하세요.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: 내 급여명세서 */}
      {activeTab === 'payslips' && (
        <ErrorBoundary fallbackTitle="내 급여명세서 로딩 오류">
          <PayslipsView
            role="WORKER"
            employeeId={worker?.id || currentUser?.uid}
            companyId={company?.id}
          />
        </ErrorBoundary>
      )}

      {/* Tab: 내 추가근무 (Requirement 4: 월별 추가근무 현황 - 근무시간 중심) */}
      {activeTab === 'overtime' && (
        <ErrorBoundary fallbackTitle="내 추가근무 화면 로딩 오류">
          <WorkerOvertimeView
            worker={worker}
            company={company}
            employeeId={worker?.id || currentUser?.uid}
          />
        </ErrorBoundary>
      )}

      {/* Tab: 내 문서 */}
      {activeTab === 'documents' && (
        <ErrorBoundary fallbackTitle="내 문서 보관함 로딩 오류">
          <DocumentsView
            role="WORKER"
            companyId={company?.id}
            employeeId={worker?.id || currentUser?.uid}
          />
        </ErrorBoundary>
      )}

      {/* Tab: 알림 */}
      {activeTab === 'notifications' && (
        <ErrorBoundary fallbackTitle="알림함 로딩 오류">
          <NotificationsView role="WORKER" />
        </ErrorBoundary>
      )}

      {/* Tab: 문의하기 (비소속 개인 근로자 전용) */}
      {activeTab === 'inquiries' && isIndividualWorker && (
        <InquiriesView
          role="WORKER"
          title="1:1 노무 문의"
          description="근로조건, 연차유급휴가, 급여 등 궁금한 사항을 전담 노무사에게 1:1로 비공개 질의합니다."
        />
      )}

      {/* Tab: 내 정보 */}
      {activeTab === 'profile' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs max-w-2xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-600" />
            근로자 기본 정보
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex border-b border-slate-100 pb-2.5">
              <span className="w-28 text-slate-400 font-medium">성명</span>
              <span className="font-semibold text-slate-800">
                {worker?.name || userProfile?.displayName || '-'}
              </span>
            </div>
            <div className="flex border-b border-slate-100 pb-2.5">
              <span className="w-28 text-slate-400 font-medium">계정 이메일</span>
              <span className="text-slate-800">{userProfile?.email || '-'}</span>
            </div>
            <div className="flex border-b border-slate-100 pb-2.5">
              <span className="w-28 text-slate-400 font-medium">휴대전화</span>
              <span className="text-slate-800">{worker?.phone || '-'}</span>
            </div>
            <div className="flex border-b border-slate-100 pb-2.5">
              <span className="w-28 text-slate-400 font-medium">소속 회사</span>
              <span className="text-slate-800 font-semibold">{company?.companyName || '-'}</span>
            </div>
            <div className="flex border-b border-slate-100 pb-2.5">
              <span className="w-28 text-slate-400 font-medium">부서 / 직책</span>
              <span className="text-slate-800">
                {worker?.department || '-'} / {worker?.position || '-'}
              </span>
            </div>
            <div className="flex pt-1">
              <span className="w-28 text-slate-400 font-medium">보안 등급</span>
              <span className="text-emerald-700 font-semibold">
                개인정보 철저 보호 (타 근로자 열람 불가)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
