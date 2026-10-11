import React, { useState } from 'react';
import { INSTITUTIONAL_INTEGRATIONS } from '../../../services/integrationService';
import { IntegrationServiceItem, IntegrationStatus } from '../../../types';
import {
  Network,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  KeyRound,
  FileCheck,
} from 'lucide-react';

const STATUS_BADGES: Record<
  IntegrationStatus,
  { label: string; bg: string; text: string; border: string; icon: React.ElementType }
> = {
  CONNECTED: {
    label: '정상 연동',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  SETUP_REQUIRED: {
    label: '설정 필요',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: KeyRound,
  },
  DISCONNECTED: {
    label: '미연동',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    icon: AlertTriangle,
  },
  ERROR: {
    label: '연동 오류',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    icon: XCircle,
  },
};

export const IntegrationsView: React.FC = () => {
  const [integrations, setIntegrations] = useState<IntegrationServiceItem[]>(
    INSTITUTIONAL_INTEGRATIONS
  );
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleTestConnection = (id: string) => {
    setTestingId(id);
    setTimeout(() => {
      setTestingId(null);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              시스템 관리
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              총 {integrations.length}개 기관
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Network className="h-6 w-6 text-slate-700" />
            외부서비스 연동 상태관리
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            국세청 홈택스, 4대사회보험 연계센터, 고용산재보험 토탈서비스 등 주요 노동·세무 유관기관
            행정 시스템과의 실시간 연동 현황을 모니터링합니다.
          </p>
        </div>
      </div>

      {/* Security notice */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <strong>공동인증서 및 전산 보안 안내:</strong> 기관 연동은 공인노무사의 사무대행 및 회원사의
          위임에 따라 인가된 공동인증서 기반으로 암호화 통신됩니다. 비밀번호나 개인키는 서버에 절대 평문
          저장되지 않습니다.
        </div>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((item) => {
          const badge = STATUS_BADGES[item.status] || STATUS_BADGES.DISCONNECTED;
          const BadgeIcon = badge.icon;
          const isTesting = testingId === item.id;

          return (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {item.category}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
                  >
                    <BadgeIcon className="h-3 w-3" />
                    {badge.label}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">{item.statusDetail}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => handleTestConnection(item.id)}
                  disabled={isTesting}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  {isTesting ? '연동 상태 확인 중...' : '연동 상태 점검'}
                </button>

                {item.linkUrl && (
                  <a
                    href={item.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                  >
                    기관 포털 바로가기
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
