import React, { useEffect, useState } from 'react';
import { SUBSCRIPTION_PLANS } from '../../../config/plans';
import { useAuth } from '../../../contexts/AuthContext';
import { firmService } from '../../../services/firmService';
import { getSubscriptionEntitlement } from '../../../utils/subscriptionEntitlement';
import type { CompanySubscription } from '../../../types';

interface PricingViewProps { onBack?: () => void }

/** 온라인 결제 및 셀프 플랜 신청을 제공하지 않는 안내 전용 화면. */
export const PricingView: React.FC<PricingViewProps> = () => {
  const { userProfile } = useAuth();
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  useEffect(() => {
    let mounted = true;
    if (userProfile?.role === 'COMPANY' && userProfile.companyId) {
      firmService.getCompanySubscription(userProfile.companyId)
        .then((value) => { if (mounted) setSubscription(value); })
        .catch(() => { if (mounted) setSubscription(null); });
    }
    return () => { mounted = false; };
  }, [userProfile?.role, userProfile?.companyId]);
  // 근로자에게는 기업의 구독 상태나 플랜 관리 정보를 노출하지 않음.
  if (userProfile?.role === 'WORKER') return null;
  const entitlement = getSubscriptionEntitlement(subscription);
  return (
    <main className="space-y-6 max-w-6xl mx-auto pb-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">서비스 이용 플랜 안내</h1>
        <p className="text-sm text-slate-600">노무법인 나인의 서비스 이용료는 오프라인으로 안내 및 결제합니다. 홈페이지에서는 카드 등록, 자동결제, 온라인 결제를 제공하지 않습니다.</p>
      </header>
      {userProfile?.role === 'COMPANY' && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5" aria-label="현재 이용 플랜">
          <h2 className="font-semibold text-blue-950">현재 이용 플랜</h2>
          <p className="mt-2 text-sm text-blue-900">{entitlement.isActive ? entitlement.activePlanCode : '활성화된 플랜이 없습니다.'}</p>
          <p className="mt-1 text-xs text-blue-800">이용 플랜의 지정·변경은 노무법인 나인 관리자가 직접 처리합니다.</p>
        </section>
      )}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="플랜 종류">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <article key={plan.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-bold text-lg text-slate-900">{plan.name}</h2>
            <p className="text-xl font-semibold text-blue-700">{typeof plan.price === 'number' ? `${plan.price.toLocaleString('ko-KR')}원 / 월` : plan.price}</p>
            <p className="text-sm text-slate-600 leading-relaxed">{plan.description}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2">
        <h2 className="font-semibold text-slate-900">별도 서비스</h2>
        <p className="text-sm text-slate-700">급여 아웃소싱과 모성보호 이용권 등은 별도 상담 및 오프라인 결제 후 관리자가 이용 권한을 설정합니다.</p>
        <p className="text-xs text-slate-500">서비스별 제공 범위와 요금은 계약 및 상담 내용을 기준으로 합니다.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <h2 className="font-semibold text-slate-900">이용 절차</h2>
        <p className="text-sm text-slate-700">① 노무법인 나인에 상담·문의 → ② 오프라인 결제 및 계약 확인 → ③ 관리자가 기업 플랜과 이용기간 지정 → ④ 해당 플랜 기능 이용</p>
        <p className="text-xs text-slate-500">온라인 결제나 자동 갱신은 이루어지지 않습니다. 이용기간 만료 시 담당자에게 문의해 주세요.</p>
      </section>
    </main>
  );
};
