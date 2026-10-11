import React, { useState, useEffect, useCallback } from 'react';
import { Company, CompanyContact, CreateCompanyContactInput, UpdateCompanyContactInput, UserRole } from '../../../types';
import { companyContactService } from '../../../services/companyContactService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  UserCheck,
  Users,
  Plus,
  Star,
  Phone,
  Mail,
  Tag,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Power,
  RotateCcw,
  Building,
  Briefcase,
  Sparkles,
} from 'lucide-react';

interface CompanyContactsTabProps {
  company: Company;
  onCompanyUpdated?: () => void;
}

// 자주 쓰이는 실무 업무 태그 예시 (고정 enum이 아니며, 클릭 시 자유롭게 추가/제거 가능)
const PRESET_RESPONSIBILITIES = [
  '급여',
  '인사',
  '입퇴사',
  '자료제출',
  '대표자',
  '4대보험',
  '근태관리',
  '노무상담',
];

export const CompanyContactsTab: React.FC<CompanyContactsTabProps> = ({
  company,
  onCompanyUpdated,
}) => {
  const { userProfile } = useAuth();
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 등록/수정 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CompanyContact | null>(null);
  const [saving, setSaving] = useState(false);

  // 폼 입력 상태
  const [formName, setFormName] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formPosition, setFormPosition] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formResponsibilities, setFormResponsibilities] = useState<string[]>([]);
  const [customResponsibilityInput, setCustomResponsibilityInput] = useState('');
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formInternalNote, setFormInternalNote] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // 현재 실행 관리자 (Actor) 정보
  const getActor = useCallback(() => {
    return {
      uid: userProfile?.uid || 'admin_operator',
      name: userProfile?.displayName || '최고관리자',
      role: (userProfile?.role as UserRole) || 'ADMIN',
    };
  }, [userProfile]);

  // 담당자 목록 조회
  const loadContacts = useCallback(async () => {
    if (!company?.id) return;
    try {
      setLoading(true);
      setErrorMessage(null);
      const list = await companyContactService.getContactsByCompany(company.id, includeInactive);
      setContacts(list);
    } catch (err: any) {
      console.error('Failed to load company contacts:', err);
      setErrorMessage(err.message || '담당자 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [company?.id, includeInactive]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // 등록 모달 열기
  const handleOpenAddModal = () => {
    setEditingContact(null);
    setFormName('');
    setFormDepartment('');
    setFormPosition('');
    setFormPhone('');
    setFormEmail('');
    setFormResponsibilities([]);
    setCustomResponsibilityInput('');
    setFormIsPrimary(contacts.length === 0); // 첫 담당자 등록 시 기본 주 담당자 추천
    setFormInternalNote('');
    setFormIsActive(true);
    setIsModalOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // 수정 모달 열기
  const handleOpenEditModal = (contact: CompanyContact) => {
    setEditingContact(contact);
    setFormName(contact.name);
    setFormDepartment(contact.department || '');
    setFormPosition(contact.position || '');
    setFormPhone(contact.phone || '');
    setFormEmail(contact.email || '');
    setFormResponsibilities(contact.responsibilities || []);
    setCustomResponsibilityInput('');
    setFormIsPrimary(contact.isPrimary);
    setFormInternalNote(contact.internalNote || '');
    setFormIsActive(contact.isActive);
    setIsModalOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // 폼 닫기
  const handleCloseModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingContact(null);
  };

  // 업무 태그 토글 (프리셋)
  const handleTogglePresetTag = (tag: string) => {
    if (formResponsibilities.includes(tag)) {
      setFormResponsibilities(formResponsibilities.filter((r) => r !== tag));
    } else {
      setFormResponsibilities([...formResponsibilities, tag]);
    }
  };

  // 직접 입력 업무 태그 추가
  const handleAddCustomResponsibility = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customResponsibilityInput.trim();
    if (!trimmed) return;
    if (trimmed.length > 30) {
      setErrorMessage('업무 태그는 30자 이내로 입력해주세요.');
      return;
    }
    if (formResponsibilities.length >= 30) {
      setErrorMessage('업무 태그는 최대 30개까지 등록할 수 있습니다.');
      return;
    }
    if (!formResponsibilities.includes(trimmed)) {
      setFormResponsibilities([...formResponsibilities, trimmed]);
    }
    setCustomResponsibilityInput('');
  };

  // 업무 태그 삭제
  const handleRemoveResponsibility = (tag: string) => {
    setFormResponsibilities(formResponsibilities.filter((r) => r !== tag));
  };

  // 담당자 저장 (생성 또는 수정)
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setErrorMessage('담당자 이름은 필수 입력 항목이며 공백일 수 없습니다.');
      return;
    }
    if (trimmedName.length > 50) {
      setErrorMessage('담당자 이름은 50자 이내로 입력해주세요.');
      return;
    }

    const trimmedEmail = formEmail.trim();
    if (trimmedEmail) {
      if (trimmedEmail.length > 100) {
        setErrorMessage('이메일은 100자 이내로 입력해주세요.');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setErrorMessage('올바른 이메일 형식을 입력해주세요. (예: user@example.com)');
        return;
      }
    }

    const trimmedPhone = formPhone.trim();
    if (trimmedPhone && trimmedPhone.length > 30) {
      setErrorMessage('전화번호는 30자 이내로 입력해주세요.');
      return;
    }

    const trimmedDept = formDepartment.trim();
    if (trimmedDept && trimmedDept.length > 50) {
      setErrorMessage('부서명은 50자 이내로 입력해주세요.');
      return;
    }

    const trimmedPos = formPosition.trim();
    if (trimmedPos && trimmedPos.length > 50) {
      setErrorMessage('직책은 50자 이내로 입력해주세요.');
      return;
    }

    const trimmedNote = formInternalNote.trim();
    if (trimmedNote && trimmedNote.length > 2000) {
      setErrorMessage('내부 메모는 2000자 이내로 입력해주세요.');
      return;
    }

    // 중복 제거 및 공백 정제
    const cleanResponsibilities = Array.from(
      new Set(
        formResponsibilities
          .map((r) => r.trim())
          .filter((r) => r.length > 0 && r.length <= 30)
      )
    );

    try {
      setSaving(true);
      setErrorMessage(null);
      const actor = getActor();

      if (editingContact) {
        // 수정 (회사 격리 검증용 companyId 전달)
        const updateInput: UpdateCompanyContactInput = {
          companyId: company.id,
          name: trimmedName,
          department: trimmedDept || undefined,
          position: trimmedPos || undefined,
          phone: trimmedPhone || undefined,
          email: trimmedEmail || undefined,
          responsibilities: cleanResponsibilities,
          isPrimary: formIsPrimary,
          internalNote: trimmedNote || undefined,
          isActive: formIsActive,
        };

        await companyContactService.updateContact(editingContact.id, updateInput, actor);
        setSuccessMessage(`'${trimmedName}' 담당자 정보가 성공적으로 수정되었습니다.`);
      } else {
        // 등록
        const createInput: CreateCompanyContactInput = {
          companyId: company.id,
          name: trimmedName,
          department: trimmedDept || undefined,
          position: trimmedPos || undefined,
          phone: trimmedPhone || undefined,
          email: trimmedEmail || undefined,
          responsibilities: cleanResponsibilities,
          isPrimary: formIsPrimary,
          internalNote: trimmedNote || undefined,
          isActive: formIsActive,
        };

        await companyContactService.createContact(createInput, actor);
        setSuccessMessage(`'${trimmedName}' 담당자가 성공적으로 등록되었습니다.`);
      }

      setIsModalOpen(false);
      await loadContacts();
      if (onCompanyUpdated) onCompanyUpdated();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Failed to save company contact:', err);
      setErrorMessage(err.message || '담당자 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 주 담당자로 지정 (단독 트랜잭션 호출)
  const handleSetPrimary = async (contact: CompanyContact) => {
    if (contact.isPrimary) return;

    if (!confirm(`'${contact.name}' 님을 ${company.companyName}의 주 담당자로 지정하시겠습니까?\n(기존 주 담당자는 자동으로 해제됩니다)`)) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage(null);
      const actor = getActor();
      await companyContactService.setPrimaryContact(company.id, contact.id, actor);
      setSuccessMessage(`'${contact.name}' 님이 주 담당자로 지정되었습니다.`);
      await loadContacts();
      if (onCompanyUpdated) onCompanyUpdated();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Failed to set primary contact:', err);
      setErrorMessage(err.message || '주 담당자 지정 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 활성/비활성 상태 전환 (단독 호출)
  const handleToggleActive = async (contact: CompanyContact) => {
    const nextState = !contact.isActive;
    const actionWord = nextState ? '활성화' : '비활성화';
    const warningText = !nextState && contact.isPrimary
      ? '\n※ 주의: 주 담당자를 비활성화하면 주 담당자 자격도 함께 자동 해제됩니다.'
      : '';

    if (!confirm(`'${contact.name}' 담당자를 ${actionWord} 처리하시겠습니까?${warningText}`)) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage(null);
      const actor = getActor();
      await companyContactService.toggleContactActive(contact.id, nextState, actor, company.id);
      setSuccessMessage(`'${contact.name}' 담당자가 ${actionWord}되었습니다.`);
      await loadContacts();
      if (onCompanyUpdated) onCompanyUpdated();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Failed to toggle contact active status:', err);
      setErrorMessage(err.message || '상태 변경 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const activeContactsCount = contacts.filter((c) => c.isActive !== false).length;

  return (
    <div className="space-y-4">
      {/* 알림 메시지 */}
      {successMessage && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 헤더 및 툴바 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 rounded-2xl border border-slate-200 p-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-slate-700" />
              실무 담당자 목록
            </h4>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              활성 {activeContactsCount}명 / 전체 {contacts.length}명
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            급여, 인사, 입퇴사 등 노무법인 소통 담당자를 등록하고 관리합니다. (노무법인 내부용)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 비활성 포함 토글 */}
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
            />
            <span className="text-[11px] font-medium">비활성 담당자 포함</span>
          </label>

          {/* 담당자 추가 버튼 */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 shadow-2xs transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>담당자 추가</span>
          </button>
        </div>
      </div>

      {/* 담당자 목록 */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 mb-2" />
          <p>담당자 정보를 불러오는 중입니다...</p>
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-white space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">
              {includeInactive ? '등록된 담당자가 없습니다.' : '활성 상태인 실무 담당자가 없습니다.'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              [담당자 추가] 버튼을 눌러 첫 번째 실무 담당자를 등록해보세요.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>첫 담당자 등록하기</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`rounded-2xl border transition p-4 bg-white relative ${
                contact.isPrimary
                  ? 'border-amber-300 ring-2 ring-amber-100 bg-amber-50/20'
                  : !contact.isActive
                  ? 'border-slate-200 bg-slate-50/60 opacity-80'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                {/* 기본 인적/직책 정보 */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {contact.name}
                    </span>

                    {/* 부서 / 직책 */}
                    {(contact.department || contact.position) && (
                      <span className="text-xs text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                        {[contact.department, contact.position].filter(Boolean).join(' · ')}
                      </span>
                    )}

                    {/* 주 담당자 배지 (눈에 잘 띄게 강조) */}
                    {contact.isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 text-amber-950 px-2.5 py-0.5 text-[11px] font-bold shadow-2xs">
                        <Star className="h-3 w-3 fill-amber-950" />
                        주 담당자
                      </span>
                    )}

                    {/* 활성 / 비활성 배지 */}
                    {contact.isActive ? (
                      <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold">
                        활성
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 text-[10px] font-semibold">
                        비활성
                      </span>
                    )}
                  </div>

                  {/* 연락처 정보 */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-0.5">
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-mono hover:underline"
                        title="전화 걸기"
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        <span>{contact.phone}</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Phone className="h-3.5 w-3.5" />
                        연락처 없음
                      </span>
                    )}

                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-mono hover:underline"
                        title="이메일 보내기"
                      >
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span>{contact.email}</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Mail className="h-3.5 w-3.5" />
                        이메일 없음
                      </span>
                    )}
                  </div>

                  {/* 담당업무(responsibilities) 태그 배지 */}
                  <div className="pt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 mr-0.5">
                      <Tag className="h-3 w-3" />
                      담당업무:
                    </span>
                    {contact.responsibilities && contact.responsibilities.length > 0 ? (
                      contact.responsibilities.map((resp, idx) => (
                        <span
                          key={idx}
                          className="rounded-lg bg-slate-100 text-slate-800 border border-slate-200/80 px-2 py-0.5 text-[11px] font-medium"
                        >
                          {resp}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400">등록된 업무 구분 없음</span>
                    )}
                  </div>

                  {/* 내부 업무 메모 */}
                  {contact.internalNote && (
                    <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-xs text-slate-700 flex items-start gap-2">
                      <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 block mb-0.5">
                          노무법인 내부 메모
                        </span>
                        <p className="whitespace-pre-wrap leading-relaxed">{contact.internalNote}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 우측 조작 액션 버튼들 (삭제 버튼 없음) */}
                <div className="flex flex-row sm:flex-col items-center sm:items-end gap-1.5 pt-2 sm:pt-0 shrink-0 border-t sm:border-t-0 border-slate-100">
                  {/* 주 담당자 지정 버튼 */}
                  {!contact.isPrimary && contact.isActive && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSetPrimary(contact)}
                      className="inline-flex items-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition shadow-2xs disabled:opacity-50"
                      title="이 담당자를 대표 주 담당자로 지정합니다."
                    >
                      <Star className="h-3.5 w-3.5 text-amber-700" />
                      <span>주 담당자 지정</span>
                    </button>
                  )}

                  {/* 정보 수정 버튼 */}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleOpenEditModal(contact)}
                    className="inline-flex items-center gap-1 rounded-xl bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                    <span>정보 수정</span>
                  </button>

                  {/* 활성 / 비활성 토글 버튼 */}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleActive(contact)}
                    className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition shadow-2xs disabled:opacity-50 ${
                      contact.isActive
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    <span>{contact.isActive ? '비활성화' : '활성화 전환'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 담당자 등록 및 수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-slate-800" />
                {editingContact ? '기업 담당자 정보 수정' : '신규 실무 담당자 등록'}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              {/* 이름 (필수) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  담당자 성명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 홍길동"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* 부서 / 직책 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">부서</label>
                  <input
                    type="text"
                    placeholder="예: 경영지원팀, 인사팀"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">직책</label>
                  <input
                    type="text"
                    placeholder="예: 팀장, 과장, 대표"
                    value={formPosition}
                    onChange={(e) => setFormPosition(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* 연락처 / 이메일 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">전화번호</label>
                  <input
                    type="text"
                    placeholder="예: 010-1234-5678"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">이메일</label>
                  <input
                    type="email"
                    placeholder="예: hr@company.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* 담당업무(responsibilities) - 고정 enum 제한 없음 */}
              <div className="space-y-2 rounded-xl bg-slate-50/70 p-3 border border-slate-200/80">
                <label className="block text-xs font-semibold text-slate-800">
                  담당업무 (복수 선택 및 직접 입력 가능)
                </label>

                {/* 빠른 선택 프리셋 배지 */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_RESPONSIBILITIES.map((preset) => {
                    const isSelected = formResponsibilities.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleTogglePresetTag(preset)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium border transition ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? `✓ ${preset}` : `+ ${preset}`}
                      </button>
                    );
                  })}
                </div>

                {/* 직접 입력 인풋 */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="기타 업무 직접 입력 후 추가 (예: 안전보건, 정부지원금)"
                    value={customResponsibilityInput}
                    onChange={(e) => setCustomResponsibilityInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomResponsibility();
                      }
                    }}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomResponsibility()}
                    className="rounded-xl bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 transition"
                  >
                    추가
                  </button>
                </div>

                {/* 현재 선택된 업무 태그 목록 */}
                {formResponsibilities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 font-semibold self-center mr-1">
                      선택됨:
                    </span>
                    {formResponsibilities.map((resp) => (
                      <span
                        key={resp}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 text-xs font-medium"
                      >
                        <span>{resp}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveResponsibility(resp)}
                          className="text-blue-500 hover:text-blue-800"
                          title="삭제"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 주 담당자 지정 체크박스 */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-950">
                  <input
                    type="checkbox"
                    checked={formIsPrimary}
                    onChange={(e) => setFormIsPrimary(e.target.checked)}
                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                  />
                  <span>주 담당자로 지정</span>
                </label>
                <p className="text-[11px] text-amber-800 ml-6">
                  선택 시 이 기업의 대표 주 담당자로 등록되며, 기존에 지정되어 있던 주 담당자는 자동으로 해제됩니다.
                </p>
              </div>

              {/* 내부 업무 메모 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  내부 업무 메모 (선택)
                </label>
                <textarea
                  rows={2}
                  placeholder="노무법인 내부 소통 시 참고할 담당자 성향, 선호 연락 시간대, 특이사항 등 (기업 미노출)"
                  value={formInternalNote}
                  onChange={(e) => setFormInternalNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* 활성 여부 */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
                  />
                  <span>활성 상태 (체크 해제 시 비활성 처리)</span>
                </label>
              </div>

              {/* 푸터 액션 */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCloseModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {saving ? '저장 중...' : editingContact ? '수정 완료' : '등록 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
