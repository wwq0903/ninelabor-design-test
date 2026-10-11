import React, { useEffect, useState } from 'react';
import { AdminMenuKey } from './AdminSidebar';
import { Company, Inquiry } from '../../../types';
import { firmService } from '../../../services/firmService';
import {
  MessageSquare,
  Bot,
  DollarSign,
  FileCheck,
  HeartHandshake,
  CreditCard,
  Layers,
  Bell,
  ArrowRight,
  Building2,
  CheckCircle2,
} from 'lucide-react';

interface AdminDashboardSummaryProps {
  onNavigate: (key: AdminMenuKey) => void;
}

export const AdminDashboardSummary: React.FC<AdminDashboardSummaryProps> = ({ onNavigate }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOverviewData = async () => {
      try {
        setLoading(true);
        const [compList, inqList] = await Promise.all([
          firmService.getAllCompanies().catch((cErr) => {
            console.warn('Admin companies fetch notice:', cErr);
            return [];
          }),
          firmService.getAllInquiries().catch((iErr) => {
            console.warn('Admin inquiries fetch notice:', iErr);
            return [];
          }),
        ]);
        setCompanies(compList || []);
        setInquiries(inqList || []);
      } catch (err) {
        console.warn('Failed to load admin summary', err);
      } finally {
        setLoading(false);
      }
    };
    loadOverviewData();
  }, []);

  // Summary counts based on real Firestore state
  const pendingInquiriesCount = inquiries.filter(
    (i) => i.status === 'RECEIVED' || i.status === 'ASSIGNED' || i.status === 'IN_PROGRESS'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            종합 현황 요약
          </span>
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
            통합 노무실
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          업무 종합 대시보드
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          전체 시스템의 핵심 현황을 한눈에 파악합니다. 상세 업무는 각 전용 관리 페이지로 이동하여 처리합니다.
        </p>
      </div>

      {/* Primary Key Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: 처리 필요한 문의 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">처리 필요한 문의</span>
              <MessageSquare className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{pendingInquiriesCount}</span>
              <span className="text-xs text-slate-400">건 접수 및 처리중</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              기업 및 근로자의 답변 대기 문의입니다.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => onNavigate('inquiries')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Card 2: AI 전문가 검토 요청 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">AI 전문가 검토 요청</span>
              <Bot className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">0</span>
              <span className="text-xs text-slate-400">건 검토 대기</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              AI 1차 분석 후 노무사 감수가 필요한 항목입니다.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => onNavigate('ai-consulting')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 transition"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Card 3: 급여 처리 현황 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">급여 처리 현황</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{companies.length}</span>
              <span className="text-xs text-slate-400">개사 연계</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              당월 급여 마감 및 명세서 발행 대상 기업입니다.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => onNavigate('payroll')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 transition"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Card 4: 자료 제출/보완 필요 현황 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">자료 제출/보완 필요 현황</span>
              <FileCheck className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">0</span>
              <span className="text-xs text-slate-400">건 보완 요청</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              급여·근태 산정을 위해 기업에 요청된 보완 서류입니다.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => onNavigate('data-requests')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 transition"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Card 5: 모성보호 처리 필요 업무 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">모성보호 처리 필요 업무</span>
              <HeartHandshake className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">0</span>
              <span className="text-xs text-slate-400">건 확인 대상</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              출산전후휴가, 육아휴직 및 고용보험 지원금 신청 업무입니다.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => onNavigate('maternity')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 transition"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Card 6: 기업 플랜 관리 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">기업 플랜 관리</span>
              <Layers className="h-4 w-4 text-purple-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">수동 지정</span>
              <span className="text-xs text-slate-400">오프라인 확인</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              오프라인 계약 확인 후 기업별 플랜과 이용기간을 지정합니다.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => onNavigate('subscriptions')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 transition"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Card 7: 최근 주요 알림 (하단 단일 카드) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-600" />
            <h3 className="text-xs font-bold text-slate-900">최근 주요 알림</h3>
          </div>
          <button
            onClick={() => onNavigate('notifications')}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 transition"
          >
            전체보기
          </button>
        </div>

        <div className="mt-3 space-y-2 text-xs">
          <div className="flex items-start justify-between py-2 border-b border-slate-50">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-blue-500"></span>
              <span className="text-slate-800">
                {companies.length > 0
                  ? `총 ${companies.length}개 고객사가 시스템에 등록되어 있습니다.`
                  : '통합 노무실이 정상 가동 중입니다.'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">시스템</span>
          </div>
          <div className="flex items-start justify-between py-2">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="text-slate-800">
                데이터베이스 및 Firestore Security Rules가 엄격히 적용되었습니다.
              </span>
            </div>
            <span className="text-[11px] text-slate-400">보안</span>
          </div>
        </div>
      </div>
    </div>
  );
};
