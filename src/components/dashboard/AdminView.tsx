import React, { useEffect, useState } from 'react';
import { AdminMenuKey, AdminSidebar } from './admin/AdminSidebar';
import { AdminDashboardSummary } from './admin/AdminDashboardSummary';
import { InquiriesView } from './common/InquiriesView';
import { MaternityView } from './maternity/MaternityView';
import { PricingView } from './pricing/PricingView';
import { DataRequestsView } from './requests/DataRequestsView';
import { MessagesView } from './messages/MessagesView';
import { MessageTemplatesView } from './messages/MessageTemplatesView';
import { DocumentsView } from './documents/DocumentsView';
import { NotificationsView } from './notifications/NotificationsView';
import { IntegrationsView } from './integrations/IntegrationsView';
import { PayrollView } from './payroll/PayrollView';
import { OvertimeView } from './payroll/OvertimeView';
import { AIConsultingView } from './ai/AIConsultingView';
import { AuditLogView } from './audit/AuditLogView';
import { AdminWorkersView } from './admin/AdminWorkersView';
import { AdminSubscriptionsView } from './admin/AdminSubscriptionsView';
import { AdminCompaniesView } from './admin/AdminCompaniesView';
import { AdminTasksView } from './admin/AdminTasksView';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { ModulePlaceholder } from './common/ModulePlaceholder';
import { Company, FirmInfo, TaskSourceType } from '../../types';
import { firmService } from '../../services/firmService';
import {
  Bot,
  DollarSign,
  Clock,
  CalendarCheck,
  FileCheck,
  HeartHandshake,
  Users,
  UserCheck,
  Tag,
  CreditCard,
  Receipt,
  Mail,
  FileText,
  FolderOpen,
  Bell,
  Network,
  Activity,
  Building2,
  Plus,
  MoreVertical,
  Search,
  Settings,
  Save,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';

export const AdminView: React.FC = () => {
  const [activeKey, setActiveKey] = useState<AdminMenuKey>('dashboard');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [workerCompanyFilter, setWorkerCompanyFilter] = useState<string>('all');
  const [workerViewMode, setWorkerViewMode] = useState<'all' | 'pending'>('all');

  // [R3-3 3/3-B-④-A] 원본 업무 보기 연계 상태
  const [navigatedInquiryId, setNavigatedInquiryId] = useState<string | undefined>(undefined);
  const [navigatedRequestId, setNavigatedRequestId] = useState<string | undefined>(undefined);
  const [navigatedCaseId, setNavigatedCaseId] = useState<string | undefined>(undefined);
  const [navigatedPayrollId, setNavigatedPayrollId] = useState<string | undefined>(undefined);
  const [navigatedPayrollCompanyId, setNavigatedPayrollCompanyId] = useState<string | undefined>(undefined);
  const [navigatedPayrollWorkerId, setNavigatedPayrollWorkerId] = useState<string | undefined>(undefined);

  const handleNavigateToSource = (
    sourceType: TaskSourceType,
    sourceId: string,
    companyId?: string,
    workerId?: string
  ) => {
    switch (sourceType) {
      case 'INQUIRY':
        setNavigatedInquiryId(sourceId);
        setActiveKey('inquiries');
        break;
      case 'DATA_REQUEST':
        setNavigatedRequestId(sourceId);
        setActiveKey('data-requests');
        break;
      case 'MATERNITY':
        setNavigatedCaseId(sourceId);
        setActiveKey('maternity');
        break;
      case 'PAYROLL':
        setNavigatedPayrollId(sourceId);
        setNavigatedPayrollCompanyId(companyId);
        setNavigatedPayrollWorkerId(workerId);
        setActiveKey('payroll');
        break;
      default:
        break;
    }
  };

  const handleSelectMenu = (key: AdminMenuKey) => {
    if (key !== 'inquiries') setNavigatedInquiryId(undefined);
    if (key !== 'data-requests') setNavigatedRequestId(undefined);
    if (key !== 'maternity') setNavigatedCaseId(undefined);
    if (key !== 'payroll') {
      setNavigatedPayrollId(undefined);
      setNavigatedPayrollCompanyId(undefined);
      setNavigatedPayrollWorkerId(undefined);
    }
    setActiveKey(key);
  };

  // Firm Info Setting State
  const [firmInfo, setFirmInfo] = useState<FirmInfo>({
    firmName: '노무법인 나인',
    representative: '',
    businessNumber: '',
    address: '',
    phone: '',
    email: '',
    description: '',
    naverReservationUrl: '',
  });
  const [isSavingFirmInfo, setIsSavingFirmInfo] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const list = await firmService.getAllCompanies();
      setCompanies(list);
    } catch (err) {
      console.error('Failed to fetch companies', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFirmInfo = async () => {
    try {
      const data = await firmService.getFirmInfo();
      if (data) {
        setFirmInfo({
          ...data,
          naverReservationUrl: data.naverReservationUrl || '',
        });
      }
    } catch (err) {
      console.error('Failed to fetch firm info', err);
    }
  };

  useEffect(() => {
    fetchCompanies();
    fetchFirmInfo();
  }, []);

  const handleSaveFirmInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingFirmInfo(true);
      await firmService.updateFirmInfo(firmInfo);
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 3000);
    } catch (err) {
      console.error('Failed to update firm info', err);
    } finally {
      setIsSavingFirmInfo(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Sidebar with collapsible sections */}
      <AdminSidebar activeKey={activeKey} onSelect={handleSelectMenu} />

      {/* Main Content Area */}
      <div className="flex-1 w-full min-w-0">
        {activeKey === 'dashboard' && <AdminDashboardSummary onNavigate={setActiveKey} />}

        {activeKey === 'inquiries' && (
          <InquiriesView
            role="ADMIN"
            title="통합 문의 관리"
            description="기업 및 근로자의 문의를 5단계(접수, 담당자 배정, 처리중, 답변완료, 종결)로 체계적으로 관리합니다."
            initialInquiryId={navigatedInquiryId}
          />
        )}

        {activeKey === 'tasks' && (
          <ErrorBoundary fallbackTitle="할 일·마감일 화면 로딩 오류">
            <AdminTasksView
              companies={companies}
              onNavigateToSource={handleNavigateToSource}
            />
          </ErrorBoundary>
        )}

        {activeKey === 'ai-consulting' && (
          <ErrorBoundary fallbackTitle="AI 상담관리 화면 로딩 오류">
            <AIConsultingView role="ADMIN" />
          </ErrorBoundary>
        )}

        {activeKey === 'payroll' && (
          <ErrorBoundary fallbackTitle="급여관리 화면 로딩 오류">
            <PayrollView
              role="ADMIN"
              initialPayrollId={navigatedPayrollId}
              initialCompanyId={navigatedPayrollCompanyId}
              initialWorkerId={navigatedPayrollWorkerId}
              onNavigateToSource={handleNavigateToSource}
            />
          </ErrorBoundary>
        )}

        {activeKey === 'overtime' && (
          <ErrorBoundary fallbackTitle="추가근무 화면 로딩 오류">
            <OvertimeView role="ADMIN" />
          </ErrorBoundary>
        )}

        {activeKey === 'attendance' && (
          <ErrorBoundary fallbackTitle="출근부 화면 로딩 오류">
            <OvertimeView role="ADMIN" />
          </ErrorBoundary>
        )}

        {activeKey === 'data-requests' && (
          <DataRequestsView
            role="ADMIN"
            initialRequestId={navigatedRequestId}
          />
        )}

        {activeKey === 'maternity' && (
          <ErrorBoundary fallbackTitle="모성보호 업무 화면 로딩 오류">
            <MaternityView
              role="ADMIN"
              initialCaseId={navigatedCaseId}
              onNavigateToSource={handleNavigateToSource}
            />
          </ErrorBoundary>
        )}

        {/* 기업관리 (Requirement 5) */}
        {activeKey === 'companies' && (
          <ErrorBoundary fallbackTitle="기업 관리 화면 로딩 오류">
            <AdminCompaniesView
              companies={companies}
              onRefreshCompanies={fetchCompanies}
              onNavigateToWorkers={(companyId, mode) => {
                setWorkerCompanyFilter(companyId);
                setWorkerViewMode(mode || 'all');
                setActiveKey('workers');
              }}
              onNavigateToSource={handleNavigateToSource}
            />
          </ErrorBoundary>
        )}

        {/* 근로자관리 (Requirement 1, 2, 3, 4, 6, 7, 8) */}
        {activeKey === 'workers' && (
          <ErrorBoundary fallbackTitle="근로자 관리 화면 로딩 오류">
            <AdminWorkersView
              companies={companies}
              initialCompanyFilter={workerCompanyFilter}
              initialViewMode={workerViewMode}
              onNavigateToSource={handleNavigateToSource}
            />
          </ErrorBoundary>
        )}

        {activeKey === 'pricing' && <PricingView />}

        {activeKey === 'subscriptions' && (
          <ErrorBoundary fallbackTitle="구독 관리 화면 로딩 오류">
            <AdminSubscriptionsView
              companies={companies}
              onRefreshCompanies={fetchCompanies}
              mode="subscriptions"
            />
          </ErrorBoundary>
        )}


        {activeKey === 'messages' && <MessagesView role="ADMIN" />}

        {activeKey === 'templates' && <MessageTemplatesView />}

        {activeKey === 'documents' && <DocumentsView role="ADMIN" />}

        {activeKey === 'notifications' && <NotificationsView role="ADMIN" />}

        {activeKey === 'integrations' && <IntegrationsView />}

        {activeKey === 'audit-logs' && (
          <ErrorBoundary fallbackTitle="활동기록 화면 로딩 오류">
            <AuditLogView />
          </ErrorBoundary>
        )}

        {/* 설정 (노무법인 기본정보 & 네이버 예약 설정) */}
        {activeKey === 'settings' && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  시스템 관리
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                  기본 설정
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
                <Settings className="h-6 w-6 text-slate-700" />
                노무법인 기본정보 및 예약 설정
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                홈페이지, 푸터 및 서비스 전반에 적용되는 노무법인 나인의 기본정보와 네이버 예약 URL을 관리합니다.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs max-w-3xl">
              {saveSuccessMsg && (
                <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  설정 정보가 안전하게 저장되었습니다.
                </div>
              )}

              <form onSubmit={handleSaveFirmInfo} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      법인명 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={firmInfo.firmName}
                      onChange={(e) => setFirmInfo({ ...firmInfo, firmName: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                      placeholder="노무법인 나인"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      대표 공인노무사
                    </label>
                    <input
                      type="text"
                      value={firmInfo.representative || ''}
                      onChange={(e) => setFirmInfo({ ...firmInfo, representative: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                      placeholder="홍길동 대표노무사"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      사업자등록번호
                    </label>
                    <input
                      type="text"
                      value={firmInfo.businessNumber || ''}
                      onChange={(e) => setFirmInfo({ ...firmInfo, businessNumber: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                      placeholder="000-00-00000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      대표 전화번호
                    </label>
                    <input
                      type="text"
                      value={firmInfo.phone || ''}
                      onChange={(e) => setFirmInfo({ ...firmInfo, phone: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                      placeholder="02-000-0000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      대표 이메일
                    </label>
                    <input
                      type="email"
                      value={firmInfo.email || ''}
                      onChange={(e) => setFirmInfo({ ...firmInfo, email: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                      placeholder="contact@ninelabor.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      사업장 주소
                    </label>
                    <input
                      type="text"
                      value={firmInfo.address || ''}
                      onChange={(e) => setFirmInfo({ ...firmInfo, address: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                      placeholder="서울특별시 강남구 테헤란로..."
                    />
                  </div>
                </div>

                {/* Naver Reservation URL Configuration as required by spec */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <label className="block text-xs font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
                    네이버 예약 공식 링크 URL
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                    자체 예약 시스템을 운영하지 않고 공식 네이버 예약 페이지로 연결합니다. 설정된 URL은 홈페이지의 '상담 예약' 버튼에 일괄 적용됩니다.
                  </p>
                  <input
                    type="url"
                    value={firmInfo.naverReservationUrl || ''}
                    onChange={(e) =>
                      setFirmInfo({ ...firmInfo, naverReservationUrl: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                    placeholder="https://booking.naver.com/booking/..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    법인 소개 문구
                  </label>
                  <textarea
                    rows={3}
                    value={firmInfo.description || ''}
                    onChange={(e) => setFirmInfo({ ...firmInfo, description: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                    placeholder="홈페이지 하단 등에 노출될 법인 소개글"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingFirmInfo}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-medium text-white hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {isSavingFirmInfo ? '저장 중...' : '설정 저장하기'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
