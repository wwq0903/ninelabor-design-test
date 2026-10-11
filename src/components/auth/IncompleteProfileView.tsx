import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { firmService } from '../../services/firmService';
import { SignUpType } from '../../types';
import { getFirebaseAuthErrorMessage } from '../../utils/authErrorHelper';
import {
  AlertTriangle,
  Building2,
  User,
  Users,
  Search,
  CheckCircle2,
  Lock,
  Phone,
  FileText,
  LogOut,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export const IncompleteProfileView: React.FC = () => {
  const { currentUser, completeOnboarding, logout } = useAuth();

  const [signUpType, setSignUpType] = useState<SignUpType>('COMPANY_REP');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');

  // Company fields
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');

  // Worker fields
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<
    { id: string; companyName: string; businessNumberMasked: string }[]
  >([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Consents
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [agreedPrivacy, setAgreedPrivacy] = useState(true);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSearchCompany = async () => {
    if (!companySearchTerm.trim()) return;
    setIsSearching(true);
    setErrorMessage('');
    try {
      const results = await firmService.searchPublicCompanies(companySearchTerm.trim());
      setSearchResults(results || []);
    } catch (err) {
      console.error('Company search error:', err);
      setErrorMessage('기업 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!displayName.trim()) {
      setErrorMessage('성함(대표자명)을 입력해 주세요.');
      return;
    }

    if (signUpType === 'COMPANY_REP') {
      if (!companyName.trim()) {
        setErrorMessage('회사명을 입력해 주세요.');
        return;
      }
      if (!businessNumber.trim()) {
        setErrorMessage('사업자등록번호를 입력해 주세요.');
        return;
      }
    }

    if (signUpType === 'WORKER_AFFILIATED') {
      if (!selectedCompanyId) {
        setErrorMessage('소속 회사를 검색하여 선택해 주세요.');
        return;
      }
    }

    if (!agreedTerms || !agreedPrivacy) {
      setErrorMessage('필수 이용약관 및 개인정보 수집에 동의해 주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      await completeOnboarding({
        signUpType,
        displayName: displayName.trim(),
        phone: phone.trim() || undefined,
        role: signUpType === 'COMPANY_REP' ? 'COMPANY' : 'WORKER',
        membershipType: signUpType === 'WORKER_INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY_AFFILIATED',
        companyId: signUpType === 'WORKER_AFFILIATED' ? selectedCompanyId : null,
        companyName:
          signUpType === 'COMPANY_REP'
            ? companyName.trim()
            : signUpType === 'WORKER_AFFILIATED'
            ? selectedCompanyName.trim()
            : undefined,
        businessNumber: signUpType === 'COMPANY_REP' ? businessNumber.trim() : undefined,
        department: department.trim() || undefined,
        position: position.trim() || undefined,
        agreedTerms,
        agreedPrivacy,
      });
    } catch (err: any) {
      console.error('Profile completion error:', err);
      setErrorMessage(getFirebaseAuthErrorMessage(err, 'signup'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-amber-200 bg-white p-6 sm:p-10 shadow-xl relative overflow-hidden">
        {/* Amber Alert Header */}
        <div className="flex items-start gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 mb-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-amber-900">
              회원정보 설정이 완료되지 않았습니다
            </h2>
            <p className="text-xs sm:text-sm text-amber-800 mt-1 leading-relaxed">
              계정 인증은 확인되었으나 사용자 프로필(역할 및 소속) 설정이 누락되어 있습니다.
              아래에서 회원 구분을 선택하고 기본 정보를 등록하시면 즉시 정상 서비스를 이용하실 수 있습니다.
            </p>
            <div className="mt-2 text-xs text-amber-700 font-medium">
              인증된 이메일 계정: <span className="font-bold underline">{currentUser?.email}</span>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs sm:text-sm text-rose-700 animate-fadeIn">
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Membership Type Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
              1. 회원 구분 선택 (필수)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSignUpType('COMPANY_REP')}
                className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                  signUpType === 'COMPANY_REP'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Building2
                      className={`h-5 w-5 ${
                        signUpType === 'COMPANY_REP' ? 'text-blue-600' : 'text-slate-500'
                      }`}
                    />
                    {signUpType === 'COMPANY_REP' && (
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    )}
                  </div>
                  <div className="text-sm font-bold text-slate-900">기업 대표 / 인사</div>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  회사 급여, 4대보험, 노무 자문 관리
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSignUpType('WORKER_AFFILIATED')}
                className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                  signUpType === 'WORKER_AFFILIATED'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Users
                      className={`h-5 w-5 ${
                        signUpType === 'WORKER_AFFILIATED' ? 'text-emerald-600' : 'text-slate-500'
                      }`}
                    />
                    {signUpType === 'WORKER_AFFILIATED' && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                  </div>
                  <div className="text-sm font-bold text-slate-900">회사 소속 근로자</div>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  소속 회사 급여명세서 및 모성보호 신청
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSignUpType('WORKER_INDIVIDUAL')}
                className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                  signUpType === 'WORKER_INDIVIDUAL'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <User
                      className={`h-5 w-5 ${
                        signUpType === 'WORKER_INDIVIDUAL' ? 'text-purple-600' : 'text-slate-500'
                      }`}
                    />
                    {signUpType === 'WORKER_INDIVIDUAL' && (
                      <CheckCircle2 className="h-4 w-4 text-purple-600" />
                    )}
                  </div>
                  <div className="text-sm font-bold text-slate-900">비소속 (개인)</div>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  1:1 전문 노무 상담, 서식 열람
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Information Input Form */}
          <div className="space-y-4 pt-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              2. 기본 프로필 정보 입력
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  성함 (대표자명 / 근로자명) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="홍길동"
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 text-sm focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  연락처 (휴대폰)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-1234-5678"
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 text-sm focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Type Specific Fields: Company */}
            {signUpType === 'COMPANY_REP' && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3.5">
                <div className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  <span>기업 정보 등록</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      회사명 (법인/상호명) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="(주)나인테크"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      사업자등록번호 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={businessNumber}
                      onChange={(e) => setBusinessNumber(e.target.value)}
                      placeholder="123-45-67890"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Type Specific Fields: Affiliated Worker */}
            {signUpType === 'WORKER_AFFILIATED' && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3.5">
                <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  <span>소속 회사 검색 및 연결 <span className="text-rose-500">*</span></span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={companySearchTerm}
                    onChange={(e) => setCompanySearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchCompany();
                      }
                    }}
                    placeholder="회사명을 입력하여 검색"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleSearchCompany}
                    disabled={isSearching}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>{isSearching ? '검색중...' : '검색'}</span>
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 divide-y divide-slate-100">
                    {searchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCompanyId(c.id);
                          setSelectedCompanyName(c.companyName);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition ${
                          selectedCompanyId === c.id
                            ? 'bg-emerald-50 text-emerald-900 font-bold'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <span>{c.companyName}</span>
                        <span className="text-slate-400 text-[11px]">{c.businessNumberMasked}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedCompanyId && (
                  <div className="p-2.5 rounded-xl bg-emerald-100/70 border border-emerald-300 text-xs font-semibold text-emerald-900 flex items-center justify-between">
                    <span>선택된 소속 회사: {selectedCompanyName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCompanyId(null);
                        setSelectedCompanyName('');
                      }}
                      className="text-emerald-700 underline text-[11px]"
                    >
                      변경
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">부서 (선택)</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="경영지원팀"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">직급 (선택)</label>
                    <input
                      type="text"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder="대리"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Terms Agreement */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                required
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="h-4 w-4 rounded-sm border-slate-300 text-blue-600"
              />
              <span>[필수] 노무법인 나인 스마트 포털 서비스 이용약관 동의</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                required
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
                className="h-4 w-4 rounded-sm border-slate-300 text-blue-600"
              />
              <span>[필수] 개인정보 수집 및 이용 동의</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => logout()}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-slate-500 hover:text-slate-800 transition"
            >
              <LogOut className="h-4 w-4" />
              <span>로그아웃 후 다른 계정 사용</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-xs sm:text-sm font-bold text-white hover:bg-slate-800 transition shadow-md disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>{isSubmitting ? '회원정보 등록 중...' : '회원정보 설정 완료 및 시작하기'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
