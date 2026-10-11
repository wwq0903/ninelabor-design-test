import React, { useEffect, useState, useMemo } from 'react';
import { Company, OvertimeRecord, Worker } from '../../../types';
import { overtimeService } from '../../../services/overtimeService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Building2,
  User,
  Info,
} from 'lucide-react';

interface WorkerOvertimeViewProps {
  worker: Worker | null;
  company: Company | null;
  employeeId?: string;
}

export const WorkerOvertimeView: React.FC<WorkerOvertimeViewProps> = ({
  worker,
  company,
  employeeId,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Current year-month (default e.g. 2026-10)
  const [belongingYearMonth, setBelongingYearMonth] = useState<string>('2026-10');
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Requirement 3: Strictly match by employeeId linked to authenticated user, NEVER by worker name
  const effectiveEmployeeId = useMemo(() => {
    return worker?.id || employeeId || userProfile?.employeeId || currentUser?.uid || '';
  }, [worker?.id, employeeId, userProfile?.employeeId, currentUser?.uid]);

  const effectiveCompanyId = useMemo(() => {
    return company?.id || userProfile?.companyId || '';
  }, [company?.id, userProfile?.companyId]);

  const fetchWorkerOvertime = async () => {
    if (!effectiveCompanyId || !effectiveEmployeeId) {
      setRecords([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Query overtime strictly for this company + employeeId + belongingYearMonth
      const list = await overtimeService.getOvertimeByEmployee(
        effectiveCompanyId,
        effectiveEmployeeId,
        belongingYearMonth
      );

      // Secondary client-side zero-trust defense: ensure employeeId matches exactly
      const isolated = list.filter((r) => r.employeeId === effectiveEmployeeId);
      setRecords(isolated);
    } catch (err: any) {
      console.error('Failed to fetch worker overtime records', err);
      setError('추가근무 기록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkerOvertime();
  }, [effectiveCompanyId, effectiveEmployeeId, belongingYearMonth]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [year, month] = belongingYearMonth.split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    setBelongingYearMonth(`${yStr}-${mStr}`);
  };

  const handleNextMonth = () => {
    const [year, month] = belongingYearMonth.split('-').map(Number);
    const date = new Date(year, month, 1);
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    setBelongingYearMonth(`${yStr}-${mStr}`);
  };

  // Requirement 4: Calculate monthly overtime hours summary (근무시간 중심)
  const totals = useMemo(() => {
    let overtimeHours = 0;
    let holidayHours = 0;

    records.forEach((r) => {
      if (r.workType === 'OVERTIME') {
        overtimeHours += r.hours;
      } else if (r.workType === 'HOLIDAY') {
        holidayHours += r.hours;
      }
    });

    return {
      recordCount: records.length,
      overtimeHours,
      holidayHours,
      totalHours: overtimeHours + holidayHours,
    };
  }, [records]);

  if (!effectiveEmployeeId) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-amber-600 mx-auto" />
        <h3 className="text-sm font-bold text-amber-950">근로자 사번 연결 확인 필요</h3>
        <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
          로그인된 계정에 근로자 고유 식별자(사번/ID)가 연결되지 않았습니다. 소속 회사의 인사담당자 또는 노무 관리자에게 사번 연동을 요청해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              내 근무 및 출근부
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              귀속 {belongingYearMonth}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              조회 전용 (등록·수정·삭제 불가)
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Clock className="h-6 w-6 text-emerald-600" />
            내 추가근무 현황
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            소속 기업 출근부에 등록된 본인의 연장근무 및 휴무일근무 실적을 근무시간 중심으로 확인합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Belonging Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-700 mr-1">귀속:</span>
            <button
              type="button"
              onClick={handlePrevMonth}
              title="이전 달"
              className="p-1 rounded hover:bg-slate-200 text-slate-600 transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <input
              type="month"
              value={belongingYearMonth}
              onChange={(e) => setBelongingYearMonth(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleNextMonth}
              title="다음 달"
              className="p-1 rounded hover:bg-slate-200 text-slate-600 transition"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={fetchWorkerOvertime}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* Worker Identity Badge */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-slate-700">
            <User className="h-4 w-4 text-emerald-600" />
            <span className="text-slate-400">성명:</span>
            <strong className="text-slate-900">{worker?.name || userProfile?.displayName || '근로자'}</strong>
            <span className="text-slate-400 font-mono text-[11px]">(사번: {effectiveEmployeeId})</span>
          </div>
          {company && (
            <div className="flex items-center gap-1.5 text-slate-700 border-l border-slate-200 pl-4">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span className="text-slate-400">소속:</span>
              <strong className="text-slate-900">{company.companyName}</strong>
              {worker?.department && (
                <span className="text-slate-500">· {worker.department}</span>
              )}
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-500">
          ※ 출근부 정정 및 누락 건은 소속 기업 인사담당자에게 수정을 요청하세요.
        </div>
      </div>

      {/* Requirement 4: Hours-centric Summary Cards (근무시간 중심 표시 - 급여액 혼동 방지) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-amber-800">연장근무 총시간</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-amber-700">
              {totals.overtimeHours}시간
            </div>
            <div className="text-[10px] text-amber-600 font-medium">기준근로 초과시간</div>
          </div>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-purple-800">휴무일근무 총시간</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-purple-700">
              {totals.holidayHours}시간
            </div>
            <div className="text-[10px] text-purple-600 font-medium">휴무일·주휴일 근무</div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-emerald-800">월 추가근무 합계 시간</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-emerald-700">
              {totals.totalHours}시간
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">총 {totals.recordCount}건 인정</div>
          </div>
        </div>
      </div>

      {/* Clarification Notice: Hours vs Payslip differentiation */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <span className="font-bold">근무시간 중심 안내:</span> 본 화면은 근태 출근부에 기록된 <strong>실제 추가근무 시간(hours)</strong> 현황입니다.
          통상임금 1.5배 가산에 따른 수당 계산 및 차인지급액은 <strong>[내 급여명세서]</strong> 메뉴의 확정 대장을 통해 확인하실 수 있습니다.
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          {error}
        </div>
      )}

      {/* Requirement 4: Date-by-date Records Table (날짜별 기록) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" />
            <h3 className="text-xs font-bold text-slate-800">
              {belongingYearMonth} 일자별 추가근무 내역
            </h3>
            <span className="text-[11px] text-slate-400 font-normal">
              (총 {records.length}건)
            </span>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-slate-500">
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                기록을 불러오는 중입니다...
              </div>
            ) : (
              <div>
                해당 귀속월({belongingYearMonth})에 등록된 추가근무 출근부 내역이 없습니다.
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-bold">근무일자</th>
                  <th className="py-2.5 px-4 font-bold">근무구분</th>
                  <th className="py-2.5 px-4 text-right font-bold">근무시간</th>
                  <th className="py-2.5 px-4 font-bold">사유 및 비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {rec.workDate}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                          rec.workType === 'OVERTIME'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {rec.workType === 'OVERTIME' ? '연장근무' : '휴무일근무'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {rec.hours}시간
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {rec.memo || rec.note || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-800">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    월 합계 ({records.length}건)
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700">
                    {totals.totalHours}시간
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-[11px] font-normal">
                    (연장 {totals.overtimeHours}시간 / 휴무일 {totals.holidayHours}시간)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
