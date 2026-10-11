import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '../../utils/authErrorHelper';
import {
  LogIn,
  Mail,
  Lock,
  AlertCircle,
  X,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRegister: () => void;
  onSuccess?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onOpenRegister,
  onSuccess,
}) => {
  const { loginWithEmail, signInWithGoogle, sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Password reset mode
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

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

  if (!isOpen) return null;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!email.trim() || !password) {
      setErrorMessage('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      await loginWithEmail(email.trim(), password);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'login'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage('');
    try {
      setIsSubmitting(true);
      await signInWithGoogle();
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'login'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setResetSuccessMessage('');

    if (!resetEmail.trim()) {
      setErrorMessage('비밀번호를 재설정할 이메일 주소를 입력해 주세요.');
      return;
    }

    try {
      setIsResetSubmitting(true);
      await sendPasswordReset(resetEmail.trim());
      setResetSuccessMessage(
        '비밀번호 재설정 메일이 전송되었습니다. 이메일 보관함을 확인하여 재설정을 완료해 주세요.'
      );
    } catch (err: any) {
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'reset'));
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const modalNode = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col my-auto border border-slate-200 animate-fadeIn"
        style={{ maxHeight: '92vh' }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 sm:px-6 py-4 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-base shadow-xs">
              9
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-slate-900">
                  {isResetMode ? '비밀번호 재설정 팝업' : '통합 노무실 로그인'}
                </h3>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-100">
                  인증 팝업
                </span>
              </div>
              <p className="text-[11px] text-slate-500">노무법인 나인 디지털 노무 포털</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            title="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {resetSuccessMessage && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{resetSuccessMessage}</span>
            </div>
          )}

          {isResetMode ? (
            /* Password Reset View */
            <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                가입하신 이메일 주소를 입력하시면 비밀번호를 안전하게 재설정할 수 있는 링크를 발송해
                드립니다.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  가입 이메일 주소
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isResetSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {isResetSubmitting ? '전송 중...' : '비밀번호 재설정 링크 발송'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(false);
                    setErrorMessage('');
                    setResetSuccessMessage('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  ← 로그인 화면으로 돌아가기
                </button>
              </div>
            </form>
          ) : (
            /* Email & Password Login View */
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  이메일 주소
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">비밀번호</label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true);
                      setResetEmail(email);
                      setErrorMessage('');
                      setResetSuccessMessage('');
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                  >
                    비밀번호 찾기
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    placeholder="비밀번호 입력"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                {isSubmitting ? '로그인 중...' : '로그인'}
              </button>

              {/* Divider */}
              <div className="relative my-3.5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-[11px] uppercase">
                  <span className="bg-white px-2 text-slate-400">또는</span>
                </div>
              </div>

              {/* Google Sign-in */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
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
                <span>Google 계정으로 계속하기</span>
              </button>
            </form>
          )}

          {/* Registration Entry */}
          <div className="mt-5 border-t border-slate-100 pt-4 text-center">
            <p className="text-xs text-slate-500">
              아직 회원이 아니신가요?{' '}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRegister();
                }}
                className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2 ml-1 inline-flex items-center gap-1"
              >
                <UserPlus className="h-3.5 w-3.5" />
                회원가입 팝업창 열기
              </button>
            </p>
          </div>
        </div>

        {/* Security badge footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 shrink-0">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
          <span>안전한 256비트 암호화 통신 및 데이터 격리 보호</span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};
