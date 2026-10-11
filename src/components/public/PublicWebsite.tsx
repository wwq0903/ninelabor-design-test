import React, { useEffect, useState } from 'react';
import { FirmInfo } from '../../types';
import { firmService } from '../../services/firmService';
import { useAuth } from '../../contexts/AuthContext';
import { handleNaverReservation } from '../../lib/reservation';
import { PolicyModal } from '../common/PolicyModal';
import {
  ShieldCheck,
  Building,
  FileText,
  Scale,
  Users,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

interface PublicWebsiteProps {
  onGoToPortal: () => void;
}

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({ onGoToPortal }) => {
  const { currentUser, signInWithGoogle } = useAuth();
  const [firmInfo, setFirmInfo] = useState<FirmInfo | null>(null);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);

  useEffect(() => {
    const loadFirmInfo = async () => {
      try {
        const info = await firmService.getFirmInfo();
        setFirmInfo(info);
      } catch (_err) {
        setFirmInfo(null);
      }
    };
    loadFirmInfo();
  }, []);

  const handlePortalAccess = () => {
    onGoToPortal();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 py-20 sm:py-28 text-white">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/80 px-3.5 py-1 text-xs font-medium text-slate-300 backdrop-blur-sm mb-6">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              신뢰받는 인사노무 종합 파트너
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-white">
              기업의 성장과 안정을 위한 <br className="hidden sm:inline" />
              <span className="text-blue-400">노무법인 나인</span>의 전문 솔루션
            </h1>
            <p className="mt-6 text-base sm:text-lg text-slate-300 leading-relaxed">
              정확한 법률 해석과 체계적인 노무 자문, 그리고 편리한 온라인 노무관리 시스템으로
              기업 고객과 근로자 모두에게 안전한 인사노무 환경을 제공합니다.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={handlePortalAccess}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                통합 노무실 바로가기
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleNaverReservation(firmInfo?.naverReservationUrl)}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-6 py-3.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
              >
                <Calendar className="h-4 w-4 text-emerald-400" />
                상담 예약
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Core Services Section */}
      <section id="services" className="py-20 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-xs font-semibold tracking-wider text-blue-600 uppercase">
              Core Expertise
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              노무법인 나인 전문 노무 서비스
            </p>
            <p className="mt-4 text-sm text-slate-600">
              기업 특성에 맞춘 맞춤형 솔루션을 통해 인사노무 리스크를 선제적으로 예방합니다.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white mb-5 shadow-sm">
                <Building className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900">기업 상시 자문</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                인사관리 전반에 대한 상시 법률 자문, 취업규칙 및 근로계약서 적법성 진단, 인사제도 개편을 지원합니다.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white mb-5 shadow-sm">
                <FileText className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900">급여 및 4대보험</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                복잡한 통상임금, 연장·야간수당의 정확한 산정, 급여명세서 교부 의무화 대응 및 4대보험 사무대행을 수행합니다.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white mb-5 shadow-sm">
                <Scale className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900">노동사건 대리</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                노동위원회 부당해고·징계 구제신청, 고용노동부 임금체불 진정 및 산업재해 보상 청구를 전문적으로 대리합니다.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white mb-5 shadow-sm">
                <ShieldCheck className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900">중대재해 및 안전보건</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                중대재해처벌법 및 산업안전보건법에 부합하는 안전보건관리체계 구축 컨설팅과 현장 점검을 제공합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Online labor management features */}
      <section className="py-20 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  <Users className="h-3.5 w-3.5" />
                  스마트 통합 노무실 시스템
                </span>
                <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  기업, 근로자, 담당 노무사가 <br />
                  하나의 시스템에서 신속하게 소통합니다
                </h2>
                <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                  불필요하게 흩어져 있던 인사자료, 급여명세서, 증명서 신청, 노무 상담 요청을
                  역할별 보안 체계(RBAC)와 철저한 기업 데이터 격리(Tenant Isolation)를 바탕으로 안전하게 처리합니다.
                </p>

                <div className="mt-6 space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">철저한 데이터 격리</h4>
                      <p className="text-xs text-slate-500">다른 회사의 직원 및 노무 정보가 교차 노출되지 않도록 엄격한 보안을 적용합니다.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">역할별 맞춤 업무 화면</h4>
                      <p className="text-xs text-slate-500">최고관리자, 담당 노무사, 기업 대표/인사담당자, 근로자에게 꼭 필요한 정보만 제공합니다.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <button
                    onClick={handlePortalAccess}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 transition"
                  >
                    통합 노무실 바로 접속
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                  업무 처리 프로세스
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">1. 기업 회원 등록 및 전담 노무사 매칭</span>
                      <span className="text-[11px] text-blue-600 font-medium">기반 구축</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      회사 기본정보 및 근로자 명부 등록 후 전담 공인노무사가 배정됩니다.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">2. 상시 노무관리 및 요청사항 처리</span>
                      <span className="text-[11px] text-blue-600 font-medium">안정적 운영</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      인사노무 질의, 서식 검토, 증명서 발급 등 요청사항을 실시간으로 확인하고 처리합니다.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">3. 리스크 예방 및 정기 진단</span>
                      <span className="text-[11px] text-blue-600 font-medium">지속 점검</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      개정 노동법령에 맞춘 취업규칙 갱신과 정기 인사진단을 통해 법적 분쟁을 방지합니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Official Firm Information / Footer Area */}
      <footer className="border-t border-slate-200 bg-white py-12 text-slate-600">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-sm">
                  9
                </div>
                <span className="text-lg font-bold text-slate-900">노무법인 나인</span>
                <span className="text-[11px] text-slate-400">| NINELABOR</span>
              </div>
              <p className="mt-3 text-xs text-slate-500 leading-relaxed max-w-md">
                {firmInfo?.description || '기업과 근로자의 상생을 지향하며 공정하고 신뢰받는 노무 서비스를 제공합니다.'}
              </p>
            </div>

            {/* Firm Details with Clean Placeholders if not yet configured in Firestore */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-xs">
              <div className="font-semibold text-slate-900 mb-2">노무법인 기본정보</div>
              <div className="space-y-1.5 text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-20 shrink-0">대표 노무사</span>
                  <span className="font-medium text-slate-800">
                    {firmInfo?.representative || '정보 등록 준비 중 (최고관리자 설정 가능)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-20 shrink-0">사업자등록번호</span>
                  <span className="font-medium text-slate-800">
                    {firmInfo?.businessNumber || '정보 등록 준비 중'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-400 w-16 shrink-0">소재지</span>
                  <span className="font-medium text-slate-800">
                    {firmInfo?.address || '주소 등록 준비 중'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-400 w-16 shrink-0">대표전화</span>
                  <span className="font-medium text-slate-800">
                    {firmInfo?.phone || '연락처 등록 준비 중'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-400 w-16 shrink-0">이메일</span>
                  <span className="font-medium text-slate-800">
                    {firmInfo?.email || '이메일 등록 준비 중'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Links */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500 border-t border-slate-200/80 pt-6">
            <button
              onClick={() => setActivePolicyId('terms-of-service')}
              className="hover:text-slate-900 transition font-medium"
            >
              서비스 이용약관
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setActivePolicyId('privacy-policy')}
              className="hover:text-slate-900 transition font-bold text-slate-700"
            >
              개인정보처리방침
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setActivePolicyId('paid-service-terms')}
              className="hover:text-slate-900 transition font-medium"
            >
              유료서비스 이용약관
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setActivePolicyId('refund-policy')}
              className="hover:text-slate-900 transition font-medium"
            >
              취소·환불정책
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setActivePolicyId('subscription-cancellation')}
              className="hover:text-slate-900 transition font-medium"
            >
              구독 해지 안내
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setActivePolicyId('withdrawal-policy')}
              className="hover:text-slate-900 transition font-medium"
            >
              회원탈퇴 및 이용종료
            </button>
          </div>

          <div className="mt-4 text-center text-xs text-slate-400">
            &copy; {new Date().getFullYear()} 노무법인 나인. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Policy Modal */}
      {activePolicyId && (
        <PolicyModal
          initialPolicyId={activePolicyId}
          isOpen={true}
          onClose={() => setActivePolicyId(null)}
        />
      )}
    </div>
  );
};
