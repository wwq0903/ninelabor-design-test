import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/firebase';
import { firmService } from '../../services/firmService';
import { policyService } from '../../services/policyService';
import { PolicyModal } from '../common/PolicyModal';
import { SignUpType } from '../../types';
import { getFirebaseAuthErrorMessage } from '../../utils/authErrorHelper';
import {
  LogIn,
  UserPlus,
  Building2,
  User,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'signup' | 'reset';
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const { loginWithEmail, signUpWithEmail, signInWithGoogle, sendPasswordReset } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode);

  // Login Form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Password Reset Form
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState(false);

  // Sign Up Flow State
  const [signupStep, setSignupStep] = useState<number>(1);
  const [signupType, setSignupType] = useState<SignUpType | null>(null);

  // Sign Up Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // RRN (Resident Registration Number) security handling
  const [rrnFront, setRrnFront] = useState('');
  const [rrnBackFirst, setRrnBackFirst] = useState('');
  const [rrnBackRest, setRrnBackRest] = useState('');

  // Company Search State
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [companySearchResults, setCompanySearchResults] = useState<
    { id: string; companyName: string; businessNumberMasked: string }[]
  >([]);
  const [isSearchingCompanies, setIsSearchingCompanies] = useState(false);

  // Terms Agreement
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);

  // Status
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  // Search Companies for Affiliated Worker
  const handleSearchCompanies = async (query: string) => {
    setCompanySearchQuery(query);
    if (!query.trim()) {
      setCompanySearchResults([]);
      return;
    }
    try {
      setIsSearchingCompanies(true);
      const results = await firmService.searchPublicCompanies(query);
      setCompanySearchResults(results || []);
    } catch (err) {
      console.error('Company search error', err);
    } finally {
      setIsSearchingCompanies(false);
    }
  };

  // Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;

    try {
      setIsLoading(true);
      setErrorMessage('');
      await loginWithEmail(loginEmail, loginPassword);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Login error', err);
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'login'));
    } finally {
      setIsLoading(false);
    }
  };

  // Google Login Submit
  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');
      await signInWithGoogle();
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Google sign-in error', err);
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'login'));
    } finally {
      setIsLoading(false);
    }
  };

  // Password Reset Submit
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;

    try {
      setIsLoading(true);
      setErrorMessage('');
      await sendPasswordReset(resetEmail);
      setResetSuccessMsg(true);
    } catch (err: any) {
      console.error('Reset password error', err);
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'reset'));
    } finally {
      setIsLoading(false);
    }
  };

  // Sign Up Next Step
  const handleSignupNext = () => {
    setErrorMessage('');
    if (signupStep === 1) {
      if (!signupType) {
        setErrorMessage('회원가입 유형을 선택해 주세요.');
        return;
      }
      setSignupStep(2);
    } else if (signupStep === 2) {
      // Validate step 2 inputs
      if (!name.trim()) {
        setErrorMessage('이름을 입력해 주세요.');
        return;
      }
      if (!email.trim()) {
        setErrorMessage('이메일을 입력해 주세요.');
        return;
      }
      if (!password || password.length < 6) {
        setErrorMessage('비밀번호는 최소 6자 이상이어야 합니다.');
        return;
      }
      if (password !== passwordConfirm) {
        setErrorMessage('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
        return;
      }
      if (!phone.trim()) {
        setErrorMessage('전화번호를 입력해 주세요.');
        return;
      }

      // Type-specific validations
      if (signupType === 'COMPANY_REP') {
        if (!companyName.trim()) {
          setErrorMessage('기업명을 입력해 주세요.');
          return;
        }
      } else if (signupType === 'WORKER_AFFILIATED') {
        if (!selectedCompanyId) {
          setErrorMessage('소속 회사를 검색하여 선택해 주세요.');
          return;
        }
        if (rrnFront.length !== 6 || rrnBackFirst.length !== 1) {
          setErrorMessage('주민등록번호 앞 6자리와 뒤 1자리를 정확히 입력해 주세요.');
          return;
        }
      }

      setSignupStep(3);
    }
  };

  // Final Sign Up Submission
  const handleFinalSignupSubmit = async () => {
    if (!agreeTerms || !agreePrivacy) {
      setErrorMessage('필수 약관(서비스 이용약관, 개인정보 처리방침)에 동의해 주세요.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage('');

      let finalRole: 'COMPANY' | 'WORKER' = 'WORKER';
      let finalMembershipType: 'COMPANY_AFFILIATED' | 'INDIVIDUAL' | undefined = undefined;
      let finalCompanyId: string | null = null;
      let finalCompanyName: string | undefined = undefined;
      let finalMaskedRrn: string | undefined = undefined;

      if (signupType === 'COMPANY_REP') {
        finalRole = 'COMPANY';
        // Create company record in Firestore
        const newComp = await firmService.createCompany({
          companyName: companyName.trim(),
          businessNumber: '000-00-00000', // Default pending business registration
          representativeName: name.trim(),
          contactEmail: email.trim(),
          contactPhone: phone.trim(),
          status: 'active',
        });
        finalCompanyId = newComp.id;
        finalCompanyName = newComp.companyName;
      } else if (signupType === 'WORKER_AFFILIATED') {
        finalRole = 'WORKER';
        finalMembershipType = 'COMPANY_AFFILIATED';
        finalCompanyId = selectedCompanyId;
        finalCompanyName = companyName;
        // Strictly masked (e.g. 950101-1******) without plain RRN storage in users profile
        finalMaskedRrn = `${rrnFront}-${rrnBackFirst}******`;
      } else {
        // WORKER_INDIVIDUAL
        finalRole = 'WORKER';
        finalMembershipType = 'INDIVIDUAL';
        finalCompanyId = null; // No company
        finalCompanyName = undefined;
      }

      // Execute Firebase Auth Sign Up and Firestore profile creation
      await signUpWithEmail({
        signUpType: signupType!,
        email: email.trim(),
        password,
        displayName: name.trim(),
        phone: phone.trim(),
        role: finalRole,
        membershipType: finalMembershipType,
        companyId: finalCompanyId,
        companyName: finalCompanyName,
        maskedRrn: finalMaskedRrn,
        hasRrn: !!finalMaskedRrn,
      });

      // Requirement 6: If worker submitted full 13 digits, encrypt and store via secure server endpoint
      if (
        signupType === 'WORKER_AFFILIATED' &&
        rrnFront.length === 6 &&
        rrnBackFirst.length === 1 &&
        rrnBackRest.length === 6
      ) {
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            const idToken = await currentUser.getIdToken();
            await fetch('/api/worker/submit-rrn', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                rrn: `${rrnFront}${rrnBackFirst}${rrnBackRest}`,
              }),
            });
          }
        } catch (rrnSubmitErr) {
          console.warn('[AuthModal] Worker RRN server submit error:', rrnSubmitErr);
        }
      }

      // Record consents
      try {
        const authUid = (useAuth as any)().currentUser?.uid;
        if (authUid) {
          await policyService.saveConsent(authUid, 'TERMS_OF_SERVICE', true);
          await policyService.saveConsent(authUid, 'PRIVACY_COLLECTION', true);
        }
      } catch (e) {
        console.warn('Consent save note', e);
      }

      setSignupStep(4); // Success step
    } catch (err: any) {
      console.error('Sign up error', err);
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'signup'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col border border-slate-100">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-xs">
                9
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {mode === 'login'
                    ? '노무법인 나인 통합 노무실 로그인'
                    : mode === 'reset'
                    ? '비밀번호 재설정'
                    : '노무법인 나인 회원가입'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {mode === 'login'
                    ? '인증된 계정으로 로그인하여 업무를 시작하세요.'
                    : mode === 'reset'
                    ? '가입하신 이메일로 비밀번호 재설정 링크를 보내드립니다.'
                    : '이용자 유형에 맞는 계정을 생성합니다.'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-4">
            {errorMessage && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 1. LOGIN MODE */}
            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    이메일 주소
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">비밀번호</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setErrorMessage('');
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline"
                    >
                      비밀번호 찾기
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="비밀번호 입력"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  {isLoading ? '로그인 중...' : '로그인'}
                </button>

                {/* Secondary Google Login */}
                <div className="relative pt-2">
                  <div className="absolute inset-0 flex items-center pt-2">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-[11px] uppercase">
                    <span className="bg-white px-2 text-slate-400 font-medium">또는</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      fill="#EA4335"
                    />
                  </svg>
                  Google 계정으로 계속하기
                </button>

                {/* Switch to Signup */}
                <div className="pt-2 text-center text-xs text-slate-500">
                  아직 회원이 아니신가요?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setSignupStep(1);
                      setErrorMessage('');
                    }}
                    className="font-bold text-blue-600 underline hover:text-blue-800 ml-1"
                  >
                    회원가입
                  </button>
                </div>
              </form>
            )}

            {/* 2. PASSWORD RESET MODE */}
            {mode === 'reset' && (
              <div className="space-y-4">
                {resetSuccessMsg ? (
                  <div className="py-4 text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">
                      비밀번호 재설정 이메일이 발송되었습니다.
                    </h4>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      수신함의 안내 링크를 통해 새 비밀번호를 설정하신 후 로그인해 주세요.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setResetSuccessMsg(false);
                      }}
                      className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      로그인 화면으로 돌아가기
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleResetSubmit} className="space-y-4">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      가입 시 등록하신 이메일 주소를 입력하시면 비밀번호를 재설정할 수 있는 링크를
                      전송해 드립니다.
                    </p>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        가입 이메일 주소
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="name@company.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4" />
                      {isLoading ? '발송 중...' : '비밀번호 재설정 링크 발송'}
                    </button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setErrorMessage('');
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 underline inline-flex items-center gap-1"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        로그인으로 돌아가기
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* 3. SIGN UP MODE */}
            {mode === 'signup' && (
              <div className="space-y-4">
                {/* Stepper Progress */}
                <div className="flex border-b border-slate-100 pb-2 text-[11px] font-semibold text-slate-400">
                  <div
                    className={`flex-1 text-center ${
                      signupStep === 1 ? 'text-slate-900 font-bold border-b-2 border-slate-900' : ''
                    }`}
                  >
                    1. 가입 유형
                  </div>
                  <div
                    className={`flex-1 text-center ${
                      signupStep === 2 ? 'text-slate-900 font-bold border-b-2 border-slate-900' : ''
                    }`}
                  >
                    2. 정보 입력
                  </div>
                  <div
                    className={`flex-1 text-center ${
                      signupStep === 3 ? 'text-slate-900 font-bold border-b-2 border-slate-900' : ''
                    }`}
                  >
                    3. 약관 동의
                  </div>
                  <div
                    className={`flex-1 text-center ${
                      signupStep === 4 ? 'text-emerald-600 font-bold' : ''
                    }`}
                  >
                    4. 완료
                  </div>
                </div>

                {/* SIGNUP STEP 1: Select Type */}
                {signupStep === 1 && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600 font-medium">
                      가입하실 이용자 유형을 선택해 주세요:
                    </p>

                    {/* Option 1: Company Representative */}
                    <button
                      type="button"
                      onClick={() => setSignupType('COMPANY_REP')}
                      className={`w-full flex items-start p-4 rounded-2xl border-2 text-left transition ${
                        signupType === 'COMPANY_REP'
                          ? 'border-blue-600 bg-blue-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Building2
                        className={`h-5 w-5 mt-0.5 mr-3 shrink-0 ${
                          signupType === 'COMPANY_REP' ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">① 기업대표</div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          사업장 대표자 또는 인사노무 책임자. 기업 노무관리, 급여대장, 모성보호 및
                          자문 업무 이용.
                        </p>
                      </div>
                    </button>

                    {/* Option 2: Affiliated Worker */}
                    <button
                      type="button"
                      onClick={() => setSignupType('WORKER_AFFILIATED')}
                      className={`w-full flex items-start p-4 rounded-2xl border-2 text-left transition ${
                        signupType === 'WORKER_AFFILIATED'
                          ? 'border-emerald-600 bg-emerald-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Users
                        className={`h-5 w-5 mt-0.5 mr-3 shrink-0 ${
                          signupType === 'WORKER_AFFILIATED' ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          ② 회사 소속 근로자
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          특정 회사에 재직 중인 근로자. 회사 검색 후 매칭되어 본인 급여명세서 및
                          근로계약 문서 조회.
                        </p>
                      </div>
                    </button>

                    {/* Option 3: Individual Worker */}
                    <button
                      type="button"
                      onClick={() => setSignupType('WORKER_INDIVIDUAL')}
                      className={`w-full flex items-start p-4 rounded-2xl border-2 text-left transition ${
                        signupType === 'WORKER_INDIVIDUAL'
                          ? 'border-indigo-600 bg-indigo-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <User
                        className={`h-5 w-5 mt-0.5 mr-3 shrink-0 ${
                          signupType === 'WORKER_INDIVIDUAL' ? 'text-indigo-600' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          ③ 비소속 (개인) 근로자
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          소속 회사 없이 개인 자격으로 1:1 노무 상담, 권리 구제 질의 및 자문 서비스를
                          이용하는 회원.
                        </p>
                      </div>
                    </button>

                    <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 border border-slate-200 flex items-start gap-2">
                      <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        최고관리자(ADMIN) 권한은 보안상 공개 회원가입을 통해 생성할 수 없으며 내부
                        공인노무사 심사를 통해서만 발급됩니다.
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        로그인으로 돌아가기
                      </button>
                      <button
                        type="button"
                        onClick={handleSignupNext}
                        disabled={!signupType}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        다음
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* SIGNUP STEP 2: Input Details */}
                {signupStep === 2 && (
                  <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                      <span className="text-xs font-bold text-blue-700">
                        {signupType === 'COMPANY_REP' && '기업대표 가입 정보'}
                        {signupType === 'WORKER_AFFILIATED' && '회사 소속 근로자 가입 정보'}
                        {signupType === 'WORKER_INDIVIDUAL' && '비소속 개인 근로자 가입 정보'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSignupStep(1)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                      >
                        유형 변경
                      </button>
                    </div>

                    {/* Common Field: Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        성명 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="홍길동"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    {/* Common Field: Phone */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        전화번호 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="010-0000-0000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    {/* COMPANY_REP Specific: Company Name */}
                    {signupType === 'COMPANY_REP' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          기업명 (상호) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="주식회사 나인"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-slate-900 focus:outline-none"
                        />
                      </div>
                    )}

                    {/* WORKER_AFFILIATED Specific: Real Company Search & Match */}
                    {signupType === 'WORKER_AFFILIATED' && (
                      <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                        <label className="block text-xs font-semibold text-slate-900">
                          소속 회사 검색 및 선택 <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="등록된 회사명 검색 (예: 나인)"
                            value={companySearchQuery}
                            onChange={(e) => handleSearchCompanies(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                          />
                        </div>

                        {selectedCompanyId ? (
                          <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                            <div className="flex items-center gap-1.5 font-bold">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              선택된 기업: {companyName}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCompanyId(null);
                                setCompanyName('');
                              }}
                              className="text-[11px] text-emerald-700 underline"
                            >
                              재선택
                            </button>
                          </div>
                        ) : companySearchResults.length > 0 ? (
                          <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-xs">
                            {companySearchResults.map((comp) => (
                              <button
                                key={comp.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCompanyId(comp.id);
                                  setCompanyName(comp.companyName);
                                  setCompanySearchResults([]);
                                }}
                                className="w-full text-left p-2.5 hover:bg-slate-50 transition flex items-center justify-between text-xs"
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
                        ) : companySearchQuery.trim() ? (
                          <div className="text-[11px] text-slate-500 py-1">
                            {isSearchingCompanies ? '검색 중...' : '일치하는 등록 기업이 없습니다.'}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">
                            ※ 회사가 노무법인 나인에 먼저 등록되어 있어야 소속 근로자 매칭이
                            가능합니다.
                          </div>
                        )}
                      </div>
                    )}

                    {/* WORKER_AFFILIATED Specific: Resident Registration Number with strict client masking */}
                    {signupType === 'WORKER_AFFILIATED' && (
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          주민등록번호 <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            required
                            placeholder="생년월일 (YYMMDD)"
                            value={rrnFront}
                            onChange={(e) => setRrnFront(e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono text-center"
                          />
                          <span className="text-slate-400">-</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              maxLength={1}
                              required
                              placeholder="1"
                              value={rrnBackFirst}
                              onChange={(e) =>
                                setRrnBackFirst(e.target.value.replace(/[^0-9]/g, ''))
                              }
                              className="w-10 rounded-xl border border-slate-200 px-2 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono text-center"
                            />
                            <input
                              type="password"
                              maxLength={6}
                              placeholder="•••••• (선택)"
                              value={rrnBackRest}
                              onChange={(e) =>
                                setRrnBackRest(e.target.value.replace(/[^0-9]/g, ''))
                              }
                              className="w-28 rounded-xl border border-slate-200 px-2.5 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono text-center tracking-widest"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          ※ 4대보험 취득/상실 신고 및 법정 서류 교부용. 일반 프로필에는 마스킹(900101-1******)만 저장되며, 뒷자리 입력 시 서버에서 AES-256-GCM으로 별도 암호화 보관됩니다.
                        </p>
                      </div>
                    )}

                    {/* Common Field: Email */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        로그인 이메일 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    {/* Common Field: Password & Confirm */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          비밀번호 <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="6자 이상 입력"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-slate-900 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          비밀번호 확인 <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="비밀번호 재입력"
                          value={passwordConfirm}
                          onChange={(e) => setPasswordConfirm(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-slate-900 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setSignupStep(1)}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        이전 단계
                      </button>
                      <button
                        type="button"
                        onClick={handleSignupNext}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                      >
                        다음 단계
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* SIGNUP STEP 3: Terms Agreement */}
                {signupStep === 3 && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      노무법인 나인 통합 노무실 이용을 위해 필수 약관 동의를 완료해 주세요.
                    </p>

                    <div className="space-y-2">
                      <div className="rounded-xl border border-slate-200 p-3.5 flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
                          <input
                            type="checkbox"
                            checked={agreeTerms}
                            onChange={(e) => setAgreeTerms(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                          />
                          <span>
                            <strong className="text-rose-600 font-bold">[필수]</strong> 서비스
                            이용약관 동의
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setActivePolicyId('terms-of-service')}
                          className="text-xs text-slate-500 underline hover:text-slate-800"
                        >
                          전문 보기
                        </button>
                      </div>

                      <div className="rounded-xl border border-slate-200 p-3.5 flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
                          <input
                            type="checkbox"
                            checked={agreePrivacy}
                            onChange={(e) => setAgreePrivacy(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                          />
                          <span>
                            <strong className="text-rose-600 font-bold">[필수]</strong> 개인정보
                            수집 및 이용 동의
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setActivePolicyId('privacy-collection')}
                          className="text-xs text-slate-500 underline hover:text-slate-800"
                        >
                          전문 보기
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setSignupStep(2)}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        이전 단계
                      </button>
                      <button
                        type="button"
                        disabled={isLoading || !agreeTerms || !agreePrivacy}
                        onClick={handleFinalSignupSubmit}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        {isLoading ? '가입 처리 중...' : '회원가입 완료'}
                      </button>
                    </div>
                  </div>
                )}

                {/* SIGNUP STEP 4: Success */}
                {signupStep === 4 && (
                  <div className="py-6 text-center space-y-3">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h4 className="text-base font-bold text-slate-900">
                      회원가입이 성공적으로 완료되었습니다!
                    </h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      노무법인 나인의 맞춤형 통합 노무실에서 서비스를 바로 이용하실 수 있습니다.
                    </p>
                    <div className="pt-2">
                      <button
                        onClick={() => {
                          onClose();
                          if (onSuccess) onSuccess();
                        }}
                        className="rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                      >
                        통합 노무실 입장하기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Policy Modal */}
      {activePolicyId && (
        <PolicyModal
          initialPolicyId={activePolicyId}
          isOpen={true}
          onClose={() => setActivePolicyId(null)}
        />
      )}
    </>
  );
};
