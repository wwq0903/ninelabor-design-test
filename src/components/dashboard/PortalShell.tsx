import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminView } from './AdminView';
import { CompanyView } from './CompanyView';
import { WorkerView } from './WorkerView';
import { LoginModal } from '../auth/LoginModal';
import { RegisterModal } from '../auth/RegisterModal';
import { IncompleteProfileView } from '../auth/IncompleteProfileView';
import { getFirebaseAuthErrorMessage } from '../../utils/authErrorHelper';
import {
  LogIn,
  UserPlus,
  ShieldCheck,
  Building2,
  Users,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';

export const PortalShell: React.FC = () => {
  const {
    currentUser,
    userProfile,
    authState,
    loading,
    isProfileIncomplete,
    signInWithGoogle,
  } = useAuth();

  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [googleError, setGoogleError] = useState<string>('');

  const handleGoogleSignIn = async () => {
    try {
      setGoogleError('');
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setGoogleError(getFirebaseAuthErrorMessage(err, 'login'));
    }
  };

  return (
    <>
      {loading ? (
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-500 text-xs">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800"></div>
            <span>보안 프로필 및 권한을 확인하는 중입니다...</span>
          </div>
        </div>
      ) : !currentUser ? (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 sm:p-10 shadow-lg text-center relative overflow-hidden">
            {/* Subtle background decoration */}
            <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-blue-50/60 blur-2xl"></div>
            <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-emerald-50/60 blur-2xl"></div>

            <div className="relative">
              {/* Brand Logo & Pill */}
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold text-2xl mb-4 shadow-sm">
                9
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-100 mb-3">
                <Sparkles className="h-3.5 w-3.5" />
                <span>노무법인 나인 전용 통합 노무실</span>
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                스마트 인사노무 포털 로그인
              </h2>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
                기업 대표, 인사노무 담당자, 소속 근로자 및 개인 회원을 위한 전용 업무 공간입니다. 아래 팝업창을 열어 안전하게 시작하세요.
              </p>

              {/* Primary Action Buttons (Opens Popups) */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => setIsLoginOpen(true)}
                  className="w-full sm:w-1/2 flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-slate-800 transition active:scale-[0.99]"
                >
                  <LogIn className="h-4 w-4" />
                  <span>로그인 팝업 열기</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(true)}
                  className="w-full sm:w-1/2 flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-xs sm:text-sm font-semibold text-slate-800 shadow-xs hover:bg-slate-50 transition active:scale-[0.99]"
                >
                  <UserPlus className="h-4 w-4 text-blue-600" />
                  <span>회원가입 팝업 열기</span>
                </button>
              </div>

              {/* Google Fast Connect */}
              <div className="mt-6 pt-6 border-t border-slate-100 max-w-md mx-auto">
                {googleError && (
                  <div className="mb-3.5 flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 text-left">
                    <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>{googleError}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.67v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.16z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Google 계정으로 바로 계속하기</span>
                </button>
              </div>

              {/* Feature Highlights */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span>기업대표 모드</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    급여대장 승인, 근로계약서, 4대보험 및 노무자문
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1">
                    <Users className="h-4 w-4 text-emerald-600" />
                    <span>소속 근로자</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    본인 전자 급여명세서 및 모성보호 신청
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                    <span>비소속 개인</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    1인 근로자·프리랜서 노동상담 및 표준 서식
                  </p>
                </div>
              </div>

              {/* Security note */}
              <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-400">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Firebase 보안 인증 및 기업별 Tenant Isolation 데이터 격리 적용</span>
              </div>
            </div>
          </div>
        </div>
      ) : isProfileIncomplete || !userProfile ? (
        <IncompleteProfileView />
      ) : (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {userProfile.role === 'ADMIN' && <AdminView />}
          {userProfile.role === 'COMPANY' && <CompanyView />}
          {userProfile.role === 'WORKER' && <WorkerView />}
        </div>
      )}

      {/* Popups remain safely mounted and controllable regardless of auth transition */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onOpenRegister={() => {
          setIsLoginOpen(false);
          setIsRegisterOpen(true);
        }}
      />

      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onOpenLogin={() => {
          setIsRegisterOpen(false);
          setIsLoginOpen(true);
        }}
      />
    </>
  );
};
