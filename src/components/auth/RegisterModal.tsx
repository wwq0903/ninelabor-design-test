import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { firmService } from '../../services/firmService';
import { policyService } from '../../services/policyService';
import { PolicyModal } from '../common/PolicyModal';
import { SignUpType } from '../../types';
import { getFirebaseAuthErrorMessage } from '../../utils/authErrorHelper';
import {
  Building2,
  User,
  Users,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  FileText,
  AlertCircle,
  Search,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
} from 'lucide-react';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLogin: () => void;
  onSuccess?: () => void;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({
  isOpen,
  onClose,
  onOpenLogin,
  onSuccess,
}) => {
  const { signUpWithEmail } = useAuth();

  // Stepper: 1: 유형 선택, 2: 정보 입력, 3: 약관 동의, 4: 완료
  const [step, setStep] = useState<number>(1);

  // Primary Role selection: null -> 'COMPANY' or 'WORKER'
  const [primaryRole, setPrimaryRole] = useState<'COMPANY' | 'WORKER' | null>(null);
  // If Worker: 'AFFILIATED' or 'INDIVIDUAL'
  const [workerType, setWorkerType] = useState<'AFFILIATED' | 'INDIVIDUAL' | null>(null);

  // Computed signup type
  const currentSignUpType: SignUpType | null =
    primaryRole === 'COMPANY'
      ? 'COMPANY_REP'
      : primaryRole === 'WORKER' && workerType === 'AFFILIATED'
      ? 'WORKER_AFFILIATED'
      : primaryRole === 'WORKER' && workerType === 'INDIVIDUAL'
      ? 'WORKER_INDIVIDUAL'
      : null;

  // Form Fields
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Company Rep Specific
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');

  // Worker Affiliated Specific
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>('');
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [companySearchResults, setCompanySearchResults] = useState<
    { id: string; companyName: string; businessNumberMasked: string }[]
  >([]);
  const [isSearchingCompanies, setIsSearchingCompanies] = useState(false);
  const [workerDepartment, setWorkerDepartment] = useState('');
  const [workerPosition, setWorkerPosition] = useState('');

  // Terms agreement
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [agreedMarketing, setAgreedMarketing] = useState(false);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setErrorMessage('');
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Company search debounce
  useEffect(() => {
    if (!companySearchTerm.trim()) {
      setCompanySearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingCompanies(true);
        const results = await firmService.searchPublicCompanies(companySearchTerm);
        setCompanySearchResults(results || []);
      } catch (err) {
        console.error('Failed to search companies', err);
      } finally {
        setIsSearchingCompanies(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [companySearchTerm]);

  if (!isOpen) return null;

  const handleAllAgreeToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setAgreedTerms(checked);
    setAgreedPrivacy(checked);
    setAgreedMarketing(checked);
  };

  const handleNextFromStep1 = () => {
    setErrorMessage('');
    if (!primaryRole) {
      setErrorMessage('가입하실 회원 유형(기업대표 또는 근로자)을 선택해 주세요.');
      return;
    }
    if (primaryRole === 'WORKER' && !workerType) {
      setErrorMessage('근로자 세부 유형(회사 소속 또는 비소속 개인)을 선택해 주세요.');
      return;
    }
    setStep(2);
  };

  const handleNextFromStep2 = () => {
    setErrorMessage('');
    if (!displayName.trim()) {
      setErrorMessage('이름(성명)을 입력해 주세요.');
      return;
    }
    if (!phone.trim()) {
      setErrorMessage('연락 가능한 휴대폰 번호를 입력해 주세요.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('유효한 이메일 주소를 입력해 주세요.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    if (currentSignUpType === 'COMPANY_REP') {
      if (!companyName.trim()) {
        setErrorMessage('기업명을 입력해 주세요.');
        return;
      }
    }

    if (currentSignUpType === 'WORKER_AFFILIATED') {
      if (!selectedCompanyId && !selectedCompanyName.trim()) {
        setErrorMessage('소속 기업을 검색하여 선택하거나 기업명을 입력해 주세요.');
        return;
      }
    }

    setStep(3);
  };

  const handleSubmitRegistration = async () => {
    if (!agreedTerms || !agreedPrivacy) {
      setErrorMessage('필수 약관(서비스 이용약관, 개인정보 수집·이용 동의)에 동의해 주세요.');
      return;
    }

    if (!currentSignUpType) return;

    try {
      setIsSubmitting(true);
      setErrorMessage('');

      await signUpWithEmail({
        signUpType: currentSignUpType,
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        phone: phone.trim() || undefined,
        role: currentSignUpType === 'COMPANY_REP' ? 'COMPANY' : 'WORKER',
        membershipType: currentSignUpType === 'WORKER_INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY_AFFILIATED',
        companyId: currentSignUpType === 'WORKER_AFFILIATED' ? selectedCompanyId || null : null,
        companyName:
          currentSignUpType === 'COMPANY_REP'
            ? companyName.trim()
            : currentSignUpType === 'WORKER_AFFILIATED'
            ? selectedCompanyName.trim()
            : undefined,
        businessNumber: currentSignUpType === 'COMPANY_REP' ? businessNumber.trim() : undefined,
        department: workerDepartment.trim() || undefined,
        position: workerPosition.trim() || undefined,
        agreedTerms,
        agreedPrivacy,
        agreedMarketing,
      });

      // ONLY advance to step 4 (가입 완료) when Auth, Profile, Linkage, and Consents all succeed
      setStep(4);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Registration failed', err);
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'signup'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalNode = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div
        className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl flex flex-col my-auto border border-slate-200 overflow-hidden animate-fadeIn"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 sm:px-6 py-4 bg-slate-50 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                회원가입 팝업
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {step} / 4 단계
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              노무법인 나인 신규 회원 등록
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            title="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="flex border-b border-slate-100 bg-white shrink-0">
          {[
            { num: 1, label: '유형 선택' },
            { num: 2, label: '정보 입력' },
            { num: 3, label: '약관 동의' },
            { num: 4, label: '가입 완료' },
          ].map((s) => (
            <div
              key={s.num}
              className={`flex-1 py-2.5 text-center text-xs font-medium border-b-2 transition ${
                step === s.num
                  ? 'border-slate-900 text-slate-900 font-bold bg-slate-50/50'
                  : step > s.num
                  ? 'border-emerald-600 text-emerald-600 font-medium'
                  : 'border-transparent text-slate-400'
              }`}
            >
              {s.num}. {s.label}
            </div>
          ))}
        </div>

        {/* Step Contents - Scrollable */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: 유형 선택 */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  회원가입 유형을 선택해 주세요
                </h4>
                <p className="text-xs text-slate-500">
                  원하시는 권한 및 목적에 따라 3가지 유형 중 하나로 가입하실 수 있습니다.
                </p>
              </div>

              {/* Primary Choice: 1) 기업대표, 2) 근로자 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPrimaryRole('COMPANY');
                    setWorkerType(null);
                    setErrorMessage('');
                  }}
                  className={`flex flex-col items-start p-4 rounded-xl border-2 text-left transition ${
                    primaryRole === 'COMPANY'
                      ? 'border-blue-600 bg-blue-50/50 shadow-sm ring-1 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div
                      className={`p-2.5 rounded-lg ${
                        primaryRole === 'COMPANY'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Building2 className="h-5 w-5" />
                    </div>
                    {primaryRole === 'COMPANY' && (
                      <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <span className="text-sm font-bold text-slate-900">① 기업대표</span>
                  <span className="text-xs text-slate-500 mt-1 leading-relaxed">
                    기업 대표자 또는 인사노무 담당자. 사업장 노무관리, 직원 급여, 4대보험 총괄.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPrimaryRole('WORKER');
                    setErrorMessage('');
                  }}
                  className={`flex flex-col items-start p-4 rounded-xl border-2 text-left transition ${
                    primaryRole === 'WORKER'
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div
                      className={`p-2.5 rounded-lg ${
                        primaryRole === 'WORKER'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <User className="h-5 w-5" />
                    </div>
                    {primaryRole === 'WORKER' && (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    )}
                  </div>
                  <span className="text-sm font-bold text-slate-900">② 근로자</span>
                  <span className="text-xs text-slate-500 mt-1 leading-relaxed">
                    회사 소속 근로자 또는 개인(비소속/프리랜서). 급여명세서, 서류, 1:1 상담.
                  </span>
                </button>
              </div>

              {/* Sub-choice for Worker */}
              {primaryRole === 'WORKER' && (
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Users className="h-4 w-4 text-emerald-600" />
                    <span>근로자 세부 구분을 선택해 주세요:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setWorkerType('AFFILIATED');
                        setErrorMessage('');
                      }}
                      className={`p-3 rounded-xl border-2 text-left transition flex items-start gap-2.5 ${
                        workerType === 'AFFILIATED'
                          ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                      }`}
                    >
                      <div
                        className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center ${
                          workerType === 'AFFILIATED'
                            ? 'border-emerald-600 bg-emerald-600'
                            : 'border-slate-300'
                        }`}
                      >
                        {workerType === 'AFFILIATED' && (
                          <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">회사 소속 근로자</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          소속 기업의 전자 급여명세서 및 인사 서류를 확인합니다.
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setWorkerType('INDIVIDUAL');
                        setErrorMessage('');
                      }}
                      className={`p-3 rounded-xl border-2 text-left transition flex items-start gap-2.5 ${
                        workerType === 'INDIVIDUAL'
                          ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                      }`}
                    >
                      <div
                        className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center ${
                          workerType === 'INDIVIDUAL'
                            ? 'border-emerald-600 bg-emerald-600'
                            : 'border-slate-300'
                        }`}
                      >
                        {workerType === 'INDIVIDUAL' && (
                          <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">비소속 (개인) 근로자</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          1인 근로자, 프리랜서, 구직자로서 노동법률 상담을 이용합니다.
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <span>
                  노무법인 나인의 최고관리자(ADMIN) 권한은 보안 규정에 의해 공개 회원가입으로 발급되지 않습니다.
                </span>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLogin();
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 font-medium"
                >
                  이미 계정이 있으신가요? <span className="text-blue-600 underline ml-1">로그인</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextFromStep1}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                >
                  다음 단계
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: 정보 입력 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {currentSignUpType === 'COMPANY_REP' && '기업대표 회원 정보 입력'}
                    {currentSignUpType === 'WORKER_AFFILIATED' && '소속 근로자 회원 정보 입력'}
                    {currentSignUpType === 'WORKER_INDIVIDUAL' && '비소속 개인 근로자 정보 입력'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    계정 생성 및 서비스 이용에 필요한 정보를 정확히 입력해 주세요.
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {currentSignUpType === 'COMPANY_REP' && '기업대표'}
                  {currentSignUpType === 'WORKER_AFFILIATED' && '회사 소속 근로자'}
                  {currentSignUpType === 'WORKER_INDIVIDUAL' && '비소속 개인 근로자'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    이름 (성명) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="홍길동"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    전화번호 <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="tel"
                      required
                      placeholder="010-0000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  이메일 주소 (로그인 ID) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    비밀번호 (6자 이상) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    비밀번호 확인 <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Inputs for Company Rep */}
              {currentSignUpType === 'COMPANY_REP' && (
                <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span>소속 기업 정보 등록</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      기업명 (법인/상호명) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="주식회사 예시기업"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      사업자등록번호 (선택)
                    </label>
                    <input
                      type="text"
                      placeholder="000-00-00000"
                      value={businessNumber}
                      onChange={(e) => setBusinessNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Additional Inputs for Affiliated Worker */}
              {currentSignUpType === 'WORKER_AFFILIATED' && (
                <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                    <span>소속 기업 검색 및 선택 <span className="text-rose-500">*</span></span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      등록된 기업명 검색
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="소속 회사명을 입력하세요 (예: 테크, 솔루션...)"
                        value={companySearchTerm}
                        onChange={(e) => {
                          setCompanySearchTerm(e.target.value);
                          setSelectedCompanyName(e.target.value);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    {isSearchingCompanies && (
                      <div className="mt-1 text-[11px] text-slate-400 px-1">검색 중...</div>
                    )}

                    {companySearchResults.length > 0 && (
                      <div className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md">
                        {companySearchResults.map((comp) => (
                          <button
                            key={comp.id}
                            type="button"
                            onClick={() => {
                              setSelectedCompanyId(comp.id);
                              setSelectedCompanyName(comp.companyName);
                              setCompanySearchTerm(comp.companyName);
                              setCompanySearchResults([]);
                            }}
                            className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-slate-50 transition text-xs"
                          >
                            <span className="font-semibold text-slate-900">
                              {comp.companyName}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              사업자: {comp.businessNumberMasked}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedCompanyId && (
                      <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 p-2 flex items-center justify-between text-xs text-emerald-800">
                        <span className="font-semibold">선택된 기업: {selectedCompanyName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCompanyId('');
                            setSelectedCompanyName('');
                            setCompanySearchTerm('');
                          }}
                          className="text-xs text-emerald-700 underline font-medium"
                        >
                          변경
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        부서 (선택)
                      </label>
                      <input
                        type="text"
                        placeholder="인사팀, 개발팀 등"
                        value={workerDepartment}
                        onChange={(e) => setWorkerDepartment(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        직위/직책 (선택)
                      </label>
                      <input
                        type="text"
                        placeholder="사원, 대리, 과장 등"
                        value={workerPosition}
                        onChange={(e) => setWorkerPosition(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setErrorMessage('');
                  }}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전 단계
                </button>
                <button
                  type="button"
                  onClick={handleNextFromStep2}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                >
                  다음 단계
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: 약관 동의 */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">약관 및 개인정보 처리방침 동의</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  노무법인 나인의 안전하고 신뢰할 수 있는 노무 서비스 이용을 위한 동의 항목입니다.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <label className="flex items-center gap-2.5 pb-2 border-b border-slate-200 cursor-pointer font-bold text-xs text-slate-900">
                  <input
                    type="checkbox"
                    checked={agreedTerms && agreedPrivacy && agreedMarketing}
                    onChange={handleAllAgreeToggle}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>전체 약관에 모두 동의합니다</span>
                </label>

                <div className="flex items-center justify-between text-xs text-slate-700">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={agreedTerms}
                      onChange={(e) => setAgreedTerms(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>[필수] 서비스 이용약관 동의</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePolicyId('terms-of-service')}
                    className="text-[11px] text-slate-400 hover:text-slate-700 underline"
                  >
                    전문보기
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-700">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={agreedPrivacy}
                      onChange={(e) => setAgreedPrivacy(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>[필수] 개인정보 수집 및 이용 동의</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePolicyId('privacy-policy')}
                    className="text-[11px] text-slate-400 hover:text-slate-700 underline"
                  >
                    전문보기
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-700">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedMarketing}
                      onChange={(e) => setAgreedMarketing(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-slate-500">[선택] 노무 뉴스레터 및 정책 알림 수신 동의</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePolicyId('privacy-policy')}
                    className="text-[11px] text-slate-400 hover:text-slate-700 underline"
                  >
                    전문보기
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setStep(2);
                    setErrorMessage('');
                  }}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전 단계
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmitRegistration}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isSubmitting ? '가입 진행 중...' : '회원가입 완료'}
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: 가입 완료 안내 */}
          {step === 4 && (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-2">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900">회원가입이 완료되었습니다</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                  {currentSignUpType === 'COMPANY_REP' ? '기업대표 가입 신청이 접수되었습니다. 관리자 확인 및 승인 후 기업 업무공간을 이용하실 수 있습니다.' : currentSignUpType === 'WORKER_AFFILIATED' ? '근로자 가입 신청이 접수되었습니다. 소속 승인 후 회사 관련 기능을 이용하실 수 있습니다.' : '노무법인 나인 통합 노무실 회원이 되신 것을 환영합니다.'}
                </p>
              </div>

              <div className="pt-4 max-w-xs mx-auto">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onSuccess) onSuccess();
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                >
                  통합 노무실 바로가기
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Policy Modal if user clicks view terms */}
      {activePolicyId && (
        <PolicyModal
          isOpen={true}
          initialPolicyId={activePolicyId}
          onClose={() => setActivePolicyId(null)}
        />
      )}
    </div>
  );

  return createPortal(modalNode, document.body);
};
