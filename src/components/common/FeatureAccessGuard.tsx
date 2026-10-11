import React from 'react';
import { Lock, ArrowRight } from 'lucide-react';

interface FeatureAccessGuardProps {
  featureName?: string;
  onGoToPricing?: () => void;
}

export const FeatureAccessGuard: React.FC<FeatureAccessGuardProps> = ({
  featureName,
  onGoToPricing,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center max-w-lg mx-auto my-6 shadow-xs">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4 border border-amber-100">
        <Lock className="h-6 w-6" />
      </div>
      <h3 className="text-base font-bold text-slate-900">플랜 업그레이드 안내</h3>
      <p className="mt-2 text-xs text-slate-600 leading-relaxed">
        {featureName ? `[${featureName}] 기능은 ` : ''}
        이 기능은 현재 이용 중인 플랜에 포함되어 있지 않습니다.
      </p>

      {onGoToPricing && (
        <div className="mt-6">
          <button
            onClick={onGoToPricing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
          >
            요금제 확인
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
