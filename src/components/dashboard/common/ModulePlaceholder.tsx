import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ModulePlaceholderProps {
  title: string;
  description: string;
  category?: string;
  icon: LucideIcon;
  badge?: string;
  readyMessage?: string;
  actionButton?: React.ReactNode;
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({
  title,
  description,
  category,
  icon: Icon,
  badge,
  readyMessage,
  actionButton,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          {category && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {category}
              </span>
              {badge && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                  {badge}
                </span>
              )}
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Icon className="h-6 w-6 text-slate-700" />
            {title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        {actionButton && <div>{actionButton}</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 mb-4">
          <Icon className="h-7 w-7 text-slate-700" />
        </div>
        <h3 className="text-base font-bold text-slate-900">{title} 모듈</h3>
        <p className="mt-2 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          {readyMessage ||
            '데이터베이스 및 전용 관리 업무 구조가 준비되었습니다. 순차적 개발 절차에 따라 다음 단계에서 상세 처리 로직이 연동됩니다.'}
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-1.5 text-xs text-slate-600">
          <span className="flex h-2 w-2 rounded-full bg-blue-500"></span>
          <span>테넌트 격리 및 보안 규칙 적용 완료 (실제 데이터 연동 준비)</span>
        </div>
      </div>
    </div>
  );
};
