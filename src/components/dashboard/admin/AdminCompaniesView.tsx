import React, { useState, useEffect } from 'react';
import { Company, Worker, UserProfile, CompanyStatus } from '../../../types';
import { firmService } from '../../../services/firmService';
import { auditLogService } from '../../../services/auditLogService';
import { auth } from '../../../lib/firebase';
import {
  Building2,
  Search,
  Plus,
  Users,
  Clock,
  Edit3,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  UserCheck,
  StickyNote,
  CheckSquare,
} from 'lucide-react';
import { CompanyContactsTab } from './CompanyContactsTab';
import { InternalNotesSection } from './InternalNotesSection';
import { EntityTasksSection } from './EntityTasksSection';

interface AdminCompaniesViewProps {
  companies: Company[];
  onRefreshCompanies: () => Promise<void>;
  onNavigateToWorkers: (companyId: string, filterMode?: 'all' | 'pending') => void;
  onNavigateToSource?: (
    sourceType: any,
    sourceId: string,
    companyId?: string,
    workerId?: string
  ) => void;
}

export const AdminCompaniesView: React.FC<AdminCompaniesViewProps> = ({
  companies,
  onRefreshCompanies,
  onNavigateToWorkers,
  onNavigateToSource,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingRegistrations, setPendingRegistrations] = useState<UserProfile[]>([]);
  const [approvalBranches, setApprovalBranches] = useState<Record<string, 'jeonju' | 'gwangju'>>({});
  const [approvingUid, setApprovingUid] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState('');
  const refreshPendingRegistrations = async () => {
    try {
      setPendingRegistrations(await firmService.getPendingCompanyRegistrations());
    } catch (error) {
      console.error('Failed to load pending company registrations:', error);
      setApprovalError('기업 가입 신청 목록을 불러오지 못했습니다.');
    }
  };
  useEffect(() => { void refreshPendingRegistrations(); }, []);
  const approveRegistration = async (uid: string) => {
    const branchId = approvalBranches[uid];
    if (!branchId) { setApprovalError('승인할 기업의 지부를 먼저 선택해 주세요.'); return; }
    if (!window.confirm('기업 정보를 확인했으며 이 기업의 가입을 승인하시겠습니까?')) return;
    setApprovingUid(uid);
    setApprovalError('');
    try {
      await firmService.approveCompanyRegistration(uid, branchId);
      await Promise.all([refreshPendingRegistrations(), onRefreshCompanies()]);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : '기업 승인에 실패했습니다.');
    } finally { setApprovingUid(null); }
  };

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // Detail Modal Sub-data
  const [companyWorkers, setCompanyWorkers] = useState<Worker[]>([]);
  const [companyPendingWorkers, setCompanyPendingWorkers] = useState<UserProfile[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'info' | 'contacts' | 'notes' | 'tasks'>('info');

  // Edit Mode inside Detail
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    companyName: '',
    businessNumber: '',
    representativeName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    status: 'active' as CompanyStatus,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Company Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newCompany, setNewCompany] = useState({
    companyName: '',
    businessNumber: '',
    representativeName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Load sub-data whenever selectedCompany changes
  useEffect(() => {
    if (!selectedCompany) {
      setCompanyWorkers([]);
      setCompanyPendingWorkers([]);
      setIsEditing(false);
      setDetailTab('info');
      setSaveMessage(null);
      setErrorMessage(null);
      return;
    }

    setEditForm({
      companyName: selectedCompany.companyName,
      businessNumber: selectedCompany.businessNumber,
      representativeName: selectedCompany.representativeName || '',
      contactEmail: selectedCompany.contactEmail || '',
      contactPhone: selectedCompany.contactPhone || '',
      address: selectedCompany.address || '',
      status: selectedCompany.status,
    });

    const loadSubData = async () => {
      try {
        setLoadingDetail(true);
        const [wList, pList] = await Promise.all([
          firmService.getWorkersByCompany(selectedCompany.id),
          firmService.getPendingWorkersByCompany(selectedCompany.id),
        ]);
        setCompanyWorkers(wList);
        setCompanyPendingWorkers(pList);
      } catch (err) {
        console.error('Failed to load company sub-data:', err);
      } finally {
        setLoadingDetail(false);
      }
    };

    loadSubData();
  }, [selectedCompany]);

  const handleCompanyUpdated = async () => {
    await onRefreshCompanies();
    if (selectedCompany) {
      try {
        const refreshed = await firmService.getCompanyById(selectedCompany.id);
        if (refreshed) {
          setSelectedCompany(refreshed);
        }
      } catch (err) {
        console.error('Failed to refresh company detail:', err);
      }
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    try {
      setIsSaving(true);
      setSaveMessage(null);
      setErrorMessage(null);

      const currentUser = auth.currentUser;
      const prevName = selectedCompany.companyName;

      await firmService.updateCompany(selectedCompany.id, {
        companyName: editForm.companyName.trim(),
        businessNumber: editForm.businessNumber.trim(),
        representativeName: editForm.representativeName.trim(),
        contactEmail: editForm.contactEmail.trim(),
        contactPhone: editForm.contactPhone.trim(),
        address: editForm.address.trim(),
        status: editForm.status,
      });

      // Audit Log: Requirement 9 (COMPANY_PROFILE_UPDATED)
      if (currentUser) {
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: 'ADMIN',
          actorName: currentUser.displayName || '최고관리자',
          companyId: selectedCompany.id,
          action: 'COMPANY_PROFILE_UPDATED',
          resourceType: 'companies',
          resourceId: selectedCompany.id,
          details: {
            companyId: selectedCompany.id,
            previousName: prevName,
            updatedName: editForm.companyName.trim(),
            businessNumber: editForm.businessNumber.trim(),
            status: editForm.status,
          },
        });
      }

      await onRefreshCompanies();
      setSelectedCompany((prev) =>
        prev
          ? {
              ...prev,
              companyName: editForm.companyName.trim(),
              businessNumber: editForm.businessNumber.trim(),
              representativeName: editForm.representativeName.trim(),
              contactEmail: editForm.contactEmail.trim(),
              contactPhone: editForm.contactPhone.trim(),
              address: editForm.address.trim(),
              status: editForm.status,
              updatedAt: new Date().toISOString(),
            }
          : null
      );

      setIsEditing(false);
      setSaveMessage('기업 정보가 성공적으로 수정되었습니다.');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to update company:', err);
      setErrorMessage(err.message || '기업 정보 수정 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.companyName.trim() || !newCompany.businessNumber.trim()) return;

    try {
      setIsCreating(true);
      const created = await firmService.createCompany({
        companyName: newCompany.companyName.trim(),
        businessNumber: newCompany.businessNumber.trim(),
        representativeName: newCompany.representativeName.trim(),
        contactEmail: newCompany.contactEmail.trim(),
        contactPhone: newCompany.contactPhone.trim(),
        address: newCompany.address.trim(),
        status: 'active',
      });

      const currentUser = auth.currentUser;
      if (currentUser) {
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: 'ADMIN',
          actorName: currentUser.displayName || '최고관리자',
          companyId: created.id,
          action: 'COMPANY_CREATED',
          resourceType: 'companies',
          resourceId: created.id,
          details: {
            companyId: created.id,
            companyName: created.companyName,
            businessNumber: created.businessNumber,
          },
        });
      }

      setNewCompany({
        companyName: '',
        businessNumber: '',
        representativeName: '',
        contactEmail: '',
        contactPhone: '',
        address: '',
      });
      setIsNewModalOpen(false);
      await onRefreshCompanies();
    } catch (err) {
      console.error('Failed to create company:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const filteredCompanies = companies.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.companyName.toLowerCase().includes(q) ||
      c.businessNumber.includes(q) ||
      (c.representativeName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              기업·회원 관리
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              총 {companies.length}개사
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Building2 className="h-6 w-6 text-slate-700" />
            기업관리
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            노무법인 나인의 고객사 명부를 조회하고, 소속 근로자 및 승인 대기자를 관리합니다.
          </p>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition"
        >
          <Plus className="h-4 w-4" />
          신규 기업 등록
        </button>
      </div>

      {/* Public registration does not create a tenant until administrator approval. */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">기업대표 가입 승인 대기 ({pendingRegistrations.length}건)</h2>
          <button type="button" onClick={() => void refreshPendingRegistrations()} className="text-xs underline text-slate-600">새로고침</button>
        </div>
        <p className="text-xs text-slate-600">사업자 정보와 대표자 신원을 별도로 확인한 뒤 담당 지부를 선택해 승인하세요.</p>
        {approvalError && <p role="alert" className="text-xs text-red-700">{approvalError}</p>}
        {pendingRegistrations.map((applicant) => (
          <div key={applicant.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs space-y-1">
              <p className="font-semibold text-slate-900">{applicant.requestedCompanyName || '기업명 미입력'}</p>
              <p className="text-slate-600">{applicant.displayName} · {applicant.email} · {applicant.requestedBusinessNumber || '사업자번호 미입력'}</p>
            </div>
            <div className="flex gap-2 items-center">
              <select aria-label="승인 지부" value={approvalBranches[applicant.uid] || ''}
                onChange={(e) => setApprovalBranches((prev) => ({ ...prev, [applicant.uid]: e.target.value as 'jeonju' | 'gwangju' }))}
                className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
                <option value="">지부 선택</option><option value="jeonju">전주</option><option value="gwangju">광주</option>
              </select>
              <button type="button" disabled={approvingUid !== null || !approvalBranches[applicant.uid]}
                onClick={() => void approveRegistration(applicant.uid)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-50">
                {approvingUid === applicant.uid ? '처리 중...' : '가입 승인'}
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Search Input */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="기업명, 사업자등록번호, 대표자 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs placeholder:text-slate-400 focus:border-slate-800 focus:outline-none shadow-2xs"
        />
      </div>

      {/* Companies Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {filteredCompanies.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Building2 className="mx-auto h-8 w-8 text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-800">등록된 기업이 없습니다.</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              상단의 '신규 기업 등록' 버튼을 눌러 고객사를 추가하세요.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="py-3.5 px-4">기업명</th>
                  <th className="py-3.5 px-4">사업자등록번호</th>
                  <th className="py-3.5 px-4">대표자명</th>
                  <th className="py-3.5 px-4">연락처 / 이메일</th>
                  <th className="py-3.5 px-4">담당 노무사</th>
                  <th className="py-3.5 px-4">상태</th>
                  <th className="py-3.5 px-4 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredCompanies.map((comp) => (
                  <tr key={comp.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <button
                        onClick={() => setSelectedCompany(comp)}
                        className="hover:underline text-left text-slate-900 flex items-center gap-1.5"
                      >
                        <span>{comp.companyName}</span>
                        <ChevronRight className="h-3 w-3 text-slate-400" />
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{comp.businessNumber}</td>
                    <td className="py-3.5 px-4 text-slate-600">{comp.representativeName || '-'}</td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {comp.contactPhone || comp.contactEmail || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      {comp.assignedAttorneyId ? (
                        <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          배정 완료
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          미배정
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          comp.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : comp.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {comp.status === 'active'
                          ? '정상 운영'
                          : comp.status === 'pending'
                          ? '승인 대기'
                          : '일시 정지'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setSelectedCompany(comp)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                      >
                        상세보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Company Detail Modal (Requirement 5, 6 & R3-1 2/3) */}
      {selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 font-bold text-base">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedCompany.companyName}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        selectedCompany.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {selectedCompany.status === 'active' ? '정상 운영' : selectedCompany.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    기업 식별자(ID): {selectedCompany.id} • 사업자등록번호: {selectedCompany.businessNumber}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isEditing && detailTab === 'info' && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    정보 수정
                  </button>
                )}
                <button
                  onClick={() => setSelectedCompany(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs: [기본 정보 및 근로자] & [담당자] & [내부 메모] */}
            <div className="flex items-center gap-1 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setDetailTab('info')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  detailTab === 'info'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Building2 className="h-4 w-4" />
                <span>기본 정보 및 근로자</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('contacts')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  detailTab === 'contacts'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <UserCheck className="h-4 w-4" />
                <span>담당자</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('notes')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  detailTab === 'notes'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <StickyNote className="h-4 w-4" />
                <span>내부 메모</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('tasks')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  detailTab === 'tasks'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <CheckSquare className="h-4 w-4" />
                <span>할 일</span>
              </button>
            </div>

            {detailTab === 'info' && (
              <div className="space-y-4">
                {saveMessage && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{saveMessage}</span>
                  </div>
                )}

                {errorMessage && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2 font-medium">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Quick Stats: Workers & Pending Affiliation (Requirement 5) */}
                <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-center justify-between">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                    소속 근로자
                  </span>
                  <div className="text-xl font-bold text-slate-900">
                    {loadingDetail ? '...' : `${companyWorkers.length}명`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const cid = selectedCompany.id;
                    setSelectedCompany(null);
                    onNavigateToWorkers(cid, 'all');
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                >
                  <Users className="h-3.5 w-3.5 text-slate-600" />
                  <span>근로자 보기</span>
                </button>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-center justify-between">
                <div>
                  <span className="block text-[11px] font-semibold text-amber-800 mb-0.5">
                    소속승인 대기자
                  </span>
                  <div className="text-xl font-bold text-amber-950">
                    {loadingDetail ? '...' : `${companyPendingWorkers.length}명`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const cid = selectedCompany.id;
                    setSelectedCompany(null);
                    onNavigateToWorkers(cid, 'pending');
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition shadow-2xs"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>승인 대기자 관리</span>
                </button>
              </div>
            </div>

            {/* Company Info Form or View */}
            {isEditing ? (
              <form onSubmit={handleUpdateCompany} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      기업명 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.companyName}
                      onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      사업자등록번호 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.businessNumber}
                      onChange={(e) => setEditForm({ ...editForm, businessNumber: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">대표자명</label>
                    <input
                      type="text"
                      value={editForm.representativeName}
                      onChange={(e) => setEditForm({ ...editForm, representativeName: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">대표 연락처</label>
                    <input
                      type="text"
                      value={editForm.contactPhone}
                      onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">담당 이메일</label>
                    <input
                      type="email"
                      value={editForm.contactEmail}
                      onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">운영 상태</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as CompanyStatus })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white"
                    >
                      <option value="active">정상 운영 (active)</option>
                      <option value="pending">승인 대기 (pending)</option>
                      <option value="suspended">일시 정지 (suspended)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">회사 주소</label>
                    <input
                      type="text"
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsEditing(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Save className="h-4 w-4" />
                    <span>{isSaving ? '저장 중...' : '변경사항 저장'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">기본 사업자 및 연락처 정보</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">기업명</span>
                      <span className="font-bold text-slate-900">{selectedCompany.companyName}</span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">사업자등록번호</span>
                      <span className="font-mono text-slate-800">{selectedCompany.businessNumber}</span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">대표자 성명</span>
                      <span className="text-slate-800">{selectedCompany.representativeName || '-'}</span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">대표 연락처</span>
                      <span className="text-slate-800 font-mono">{selectedCompany.contactPhone || '-'}</span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">담당 이메일</span>
                      <span className="text-slate-800 font-mono">{selectedCompany.contactEmail || '-'}</span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">회사 주소</span>
                      <span className="text-slate-800 truncate block">{selectedCompany.address || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Sub-list: Affiliated Workers */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-600" />
                      소속 근로자 명단 ({companyWorkers.length}명)
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        const cid = selectedCompany.id;
                        setSelectedCompany(null);
                        onNavigateToWorkers(cid, 'all');
                      }}
                      className="text-[11px] text-blue-600 hover:underline font-semibold flex items-center gap-1"
                    >
                      <span>전체 보기</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>

                  {companyWorkers.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">등록된 소속 근로자가 없습니다.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto pr-1">
                      {companyWorkers.slice(0, 5).map((w) => (
                        <div key={w.id} className="py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900">{w.name}</span>
                            <span className="text-slate-500 ml-2 font-mono text-[11px]">
                              {w.department || '-'} / {w.position || '-'}
                            </span>
                          </div>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                              w.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : w.status === 'on_leave'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {w.status === 'active' ? '재직' : w.status === 'on_leave' ? '휴직' : '퇴사'}
                          </span>
                        </div>
                      ))}
                      {companyWorkers.length > 5 && (
                        <p className="text-[11px] text-slate-400 pt-2 text-center">
                          외 {companyWorkers.length - 5}명의 근로자가 더 있습니다.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Sub-list: Pending Affiliation Workers */}
                {companyPendingWorkers.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-amber-700" />
                        소속승인 대기자 ({companyPendingWorkers.length}명)
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          const cid = selectedCompany.id;
                          setSelectedCompany(null);
                          onNavigateToWorkers(cid, 'pending');
                        }}
                        className="text-[11px] text-amber-800 hover:underline font-semibold flex items-center gap-1"
                      >
                        <span>승인 처리 화면으로 이동</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="divide-y divide-amber-100 max-h-36 overflow-y-auto pr-1">
                      {companyPendingWorkers.map((pw) => (
                        <div key={pw.uid} className="py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900">{pw.displayName}</span>
                            <span className="text-slate-500 ml-2 font-mono text-[11px]">
                              {pw.department || '부서미지정'} / {pw.position || '직급미지정'}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-amber-800">
                            {pw.email}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
              </div>
            )}

            {detailTab === 'contacts' && (
              <CompanyContactsTab
                company={selectedCompany}
                onCompanyUpdated={handleCompanyUpdated}
              />
            )}

            {detailTab === 'notes' && (
              <InternalNotesSection
                targetType="COMPANY"
                targetId={selectedCompany.id}
                companyId={selectedCompany.id}
                targetName={selectedCompany.companyName}
              />
            )}

            {detailTab === 'tasks' && (
              <EntityTasksSection
                entityType="COMPANY"
                companyId={selectedCompany.id}
                entityName={selectedCompany.companyName}
                companyWorkers={companyWorkers}
                onNavigateToSource={(st, sid, cid, wid) => {
                  setSelectedCompany(null);
                  if (onNavigateToSource) onNavigateToSource(st, sid, cid, wid);
                }}
              />
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                등록일: {selectedCompany.createdAt?.split('T')[0] || '-'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedCompany(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Company Registration Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-700" />
                신규 고객사 등록
              </h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  기업명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 주식회사 나인엔터프라이즈"
                  value={newCompany.companyName}
                  onChange={(e) => setNewCompany({ ...newCompany, companyName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  사업자등록번호 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="000-00-00000"
                  value={newCompany.businessNumber}
                  onChange={(e) => setNewCompany({ ...newCompany, businessNumber: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">대표자 성명</label>
                  <input
                    type="text"
                    placeholder="홍길동"
                    value={newCompany.representativeName}
                    onChange={(e) =>
                      setNewCompany({ ...newCompany, representativeName: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">대표 연락처</label>
                  <input
                    type="text"
                    placeholder="02-123-4567"
                    value={newCompany.contactPhone}
                    onChange={(e) =>
                      setNewCompany({ ...newCompany, contactPhone: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">담당 이메일</label>
                <input
                  type="email"
                  placeholder="hr@company.com"
                  value={newCompany.contactEmail}
                  onChange={(e) =>
                    setNewCompany({ ...newCompany, contactEmail: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">사업장 주소</label>
                <input
                  type="text"
                  placeholder="서울특별시 강남구 테헤란로..."
                  value={newCompany.address}
                  onChange={(e) => setNewCompany({ ...newCompany, address: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isCreating ? '등록 중...' : '기업 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
