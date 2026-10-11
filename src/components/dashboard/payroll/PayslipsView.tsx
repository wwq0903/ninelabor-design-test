import React, { useEffect, useState } from 'react';
import { PayrollRecord, UserRole } from '../../../types';
import { payrollService } from '../../../services/payrollService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Receipt,
  Calendar,
  Printer,
  X,
  Building2,
  CheckCircle2,
  AlertCircle,
  FileText,
  BadgeCheck,
} from 'lucide-react';

interface PayslipsViewProps {
  role: UserRole;
  employeeId?: string;
  companyId?: string;
}

export const PayslipsView: React.FC<PayslipsViewProps> = ({
  role,
  employeeId,
  companyId,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<PayrollRecord | null>(null);
  const [belongingYearMonth, setBelongingYearMonth] = useState<string>('2026-10');

  // Helper to extract named item amount safely
  const getItemAmount = (
    payroll: PayrollRecord,
    type: 'pay' | 'deduction',
    name: string
  ): number => {
    if (type === 'pay') {
      if (name === '기본급' && payroll.baseSalary !== undefined) return payroll.baseSalary;
      if (name === '각종 수당' && payroll.allowances !== undefined) return payroll.allowances;
      if (name === '연장근로수당' && payroll.overtimePay !== undefined) return payroll.overtimePay;
      if (name === '휴일근로수당' && payroll.holidayPay !== undefined) return payroll.holidayPay;
      if (name === '기타 지급' && payroll.otherPay !== undefined) return payroll.otherPay;
      return payroll.payItems?.find((p) => p.name === name)?.amount || 0;
    } else {
      if (name === '국민연금' && payroll.nationalPension !== undefined) return payroll.nationalPension;
      if (name === '건강보험' && payroll.healthInsurance !== undefined) return payroll.healthInsurance;
      if (name === '장기요양보험' && payroll.longTermCare !== undefined) return payroll.longTermCare;
      if (name === '고용보험' && payroll.employmentInsurance !== undefined) return payroll.employmentInsurance;
      if (name === '소득세' && payroll.incomeTax !== undefined) return payroll.incomeTax;
      if (name === '지방소득세' && payroll.localIncomeTax !== undefined) return payroll.localIncomeTax;
      if (name === '기타 공제' && payroll.otherDeduction !== undefined) return payroll.otherDeduction;
      return payroll.deductionItems?.find((d) => d.name === name)?.amount || 0;
    }
  };

  const fetchPayslips = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Requirement 8 & 9: WORKER can ONLY view their own CONFIRMED or PAID payslips (never DRAFT, never others)
      if (role === 'WORKER') {
        const targetEmpId = employeeId || userProfile?.employeeId || currentUser?.uid;
        if (!targetEmpId) {
          setPayrolls([]);
          return;
        }

        const authorizedCompanyId = userProfile?.companyId;
        if (!authorizedCompanyId || userProfile?.membershipStatus !== 'ACTIVE') {
          setPayrolls([]);
          return;
        }
        const list = await payrollService.getPayrollsForWorker(targetEmpId, authorizedCompanyId);
        // Strict client-side check to guarantee only CONFIRMED or PAID
        const validSlips = (list || []).filter(
          (p) => p.status === 'CONFIRMED' || p.status === 'PAID'
        );

        // If worker has separate uid and employeeId, verify cross matches
        if (
          userProfile?.employeeId &&
          currentUser?.uid &&
          userProfile.employeeId !== currentUser.uid &&
          !employeeId
        ) {
          const listUid = await payrollService.getPayrollsForWorker(currentUser.uid, authorizedCompanyId);
          const combined = [
            ...validSlips,
            ...listUid.filter(
              (u) =>
                (u.status === 'CONFIRMED' || u.status === 'PAID') &&
                !validSlips.some((l) => l.id === u.id)
            ),
          ];
          setPayrolls(combined);
        } else {
          setPayrolls(validSlips);
        }
      } else if (companyId || userProfile?.companyId) {
        // Requirement 10: COMPANY can only access its own companyId
        const cId = companyId || userProfile?.companyId || '';
        const list = await payrollService.getPayrollsByCompany(cId, belongingYearMonth);
        setPayrolls(list.filter((p) => p.status === 'CONFIRMED' || p.status === 'PAID'));
      }
    } catch (err: any) {
      console.error('Failed to fetch payslips', err);
      setErrorMsg('급여명세서를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayslips();
  }, [role, employeeId, companyId, currentUser, userProfile?.employeeId, userProfile?.companyId, userProfile?.membershipStatus, belongingYearMonth]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              전자 급여명세서
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              확정 발행 {payrolls.length}건
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Receipt className="h-6 w-6 text-slate-700" />
            급여명세서 조회
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            노무법인 나인을 통해 확정 발행된 전자 급여명세서 내역입니다. 세부 항목 확인 및 정식 인쇄가 가능합니다.
          </p>
        </div>

        {/* Company Month Selector */}
        {role !== 'WORKER' && (
          <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-700">귀속연월:</span>
            <input
              type="month"
              value={belongingYearMonth}
              onChange={(e) => setBelongingYearMonth(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Error Message Display */}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Slip List */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">명세서 목록 로딩 중...</div>
        ) : payrolls.length === 0 ? (
          /* Requirement 13: Clear Empty State (No sample mock data) */
          <div className="p-16 text-center space-y-3">
            <Receipt className="mx-auto h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-800">발행된 급여명세서가 없습니다.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              담당 관리자 및 노무사가 당월 급여대장을 검토 후 <strong>[급여 확정]</strong>을 완료하면 전자 급여명세서가 자동으로 생성되어 여기에 표시됩니다.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payrolls.map((slip) => (
              <div
                key={slip.id}
                className="p-5 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-indigo-600" />
                      {slip.belongingYearMonth} 귀속 전자 급여명세서
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        slip.status === 'PAID'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {slip.status === 'PAID' ? '지급완료' : '급여확정'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      사원: <strong>{slip.employeeName}</strong>
                    </span>
                    {slip.companyName && (
                      <span>
                        소속: <strong>{slip.companyName}</strong>
                      </span>
                    )}
                    <span>
                      부서/직책: {slip.department || '-'} / {slip.position || '-'}
                    </span>
                    {slip.paymentDate && (
                      <span>
                        지급일: <strong>{slip.paymentDate}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400">실수령액 (차인지급액)</span>
                    <div className="text-base font-bold font-mono text-emerald-700">
                      {slip.netPay.toLocaleString()}원
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSlip(slip)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                  >
                    <Printer className="h-4 w-4 text-slate-500" />
                    명세서 보기 / 인쇄
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Requirement 7 & 12: Detailed Printable Payslip Modal */}
      {selectedSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-sm">
                  9
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">
                    {selectedSlip.belongingYearMonth} 귀속 전자 급여명세서
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    근로기준법 제48조에 따른 전자 임금명세서
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlip(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Requirement 7: Company, Employee, Payment Date, Belonging Month (Strictly NO full RRN) */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <div>
                  <span className="text-slate-500">성명:</span>{' '}
                  <strong className="text-slate-900">{selectedSlip.employeeName}</strong>
                </div>
                <div>
                  <span className="text-slate-500">사번/식별자:</span>{' '}
                  <span className="font-mono text-slate-700">{selectedSlip.employeeId}</span>
                </div>
                <div>
                  <span className="text-slate-500">부서 / 직책:</span>{' '}
                  <span className="text-slate-700">
                    {selectedSlip.department || '-'} / {selectedSlip.position || '-'}
                  </span>
                </div>
              </div>
              <div className="space-y-1 text-right">
                <div>
                  <span className="text-slate-500">소속 회사:</span>{' '}
                  <strong className="text-slate-900">
                    {selectedSlip.companyName || userProfile?.companyName || '소속 회사'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">귀속연월:</span>{' '}
                  <strong className="font-mono text-slate-900">
                    {selectedSlip.belongingYearMonth}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">지급일:</span>{' '}
                  <span className="font-mono text-slate-700">
                    {selectedSlip.paymentDate || `${selectedSlip.belongingYearMonth}-25`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  발행 위탁: 노무법인 나인
                </div>
              </div>
            </div>

            {/* Requirement 7: All Pay Items & Deduction Items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              {/* 지급 내역 */}
              <div className="space-y-2">
                <h4 className="font-bold border-b border-slate-200 pb-1.5 text-indigo-950 flex items-center justify-between">
                  <span>지급 항목</span>
                  <span className="text-[11px] font-normal text-slate-400">금액 (원)</span>
                </h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">기본급</span>
                    <span className="font-mono font-medium">
                      {getItemAmount(selectedSlip, 'pay', '기본급').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">각종 수당</span>
                    <span className="font-mono font-medium">
                      {getItemAmount(selectedSlip, 'pay', '각종 수당').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">연장근로수당</span>
                    <span className="font-mono font-medium">
                      {getItemAmount(selectedSlip, 'pay', '연장근로수당').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">휴일근로수당</span>
                    <span className="font-mono font-medium">
                      {getItemAmount(selectedSlip, 'pay', '휴일근로수당').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">기타 지급</span>
                    <span className="font-mono font-medium">
                      {getItemAmount(selectedSlip, 'pay', '기타 지급').toLocaleString()}원
                    </span>
                  </div>

                  {/* Custom pay items */}
                  {selectedSlip.payItems
                    ?.filter(
                      (p) =>
                        ![
                          '기본급',
                          '각종 수당',
                          '연장근로수당',
                          '휴일근로수당',
                          '기타 지급',
                        ].includes(p.name)
                    )
                    .map((custom) => (
                      <div key={custom.id} className="flex justify-between">
                        <span className="text-slate-600">{custom.name}</span>
                        <span className="font-mono font-medium">
                          {custom.amount.toLocaleString()}원
                        </span>
                      </div>
                    ))}

                  <div className="border-t border-slate-200 pt-2 font-bold flex justify-between text-indigo-900 text-sm">
                    <span>지급총액</span>
                    <span className="font-mono">
                      {selectedSlip.totalPay.toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>

              {/* 공제 내역 */}
              <div className="space-y-2">
                <h4 className="font-bold border-b border-slate-200 pb-1.5 text-rose-900 flex items-center justify-between">
                  <span>공제 항목</span>
                  <span className="text-[11px] font-normal text-slate-400">금액 (원)</span>
                </h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">국민연금</span>
                    <span className="font-mono text-rose-600">
                      {getItemAmount(selectedSlip, 'deduction', '국민연금').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">건강보험</span>
                    <span className="font-mono text-rose-600">
                      {getItemAmount(selectedSlip, 'deduction', '건강보험').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">장기요양보험</span>
                    <span className="font-mono text-rose-600">
                      {getItemAmount(selectedSlip, 'deduction', '장기요양보험').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">고용보험</span>
                    <span className="font-mono text-rose-600">
                      {getItemAmount(selectedSlip, 'deduction', '고용보험').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">소득세</span>
                    <span className="font-mono text-rose-600">
                      {getItemAmount(selectedSlip, 'deduction', '소득세').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">지방소득세</span>
                    <span className="font-mono text-rose-600">
                      {getItemAmount(selectedSlip, 'deduction', '지방소득세').toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">기타 공제</span>
                    <span className="font-mono text-rose-600">
                      {getItemAmount(selectedSlip, 'deduction', '기타 공제').toLocaleString()}원
                    </span>
                  </div>

                  {/* Custom deduction items */}
                  {selectedSlip.deductionItems
                    ?.filter(
                      (d) =>
                        ![
                          '국민연금',
                          '건강보험',
                          '장기요양보험',
                          '고용보험',
                          '소득세',
                          '지방소득세',
                          '기타 공제',
                        ].includes(d.name)
                    )
                    .map((custom) => (
                      <div key={custom.id} className="flex justify-between">
                        <span className="text-slate-600">{custom.name}</span>
                        <span className="font-mono text-rose-600">
                          {custom.amount.toLocaleString()}원
                        </span>
                      </div>
                    ))}

                  <div className="border-t border-slate-200 pt-2 font-bold flex justify-between text-rose-700 text-sm">
                    <span>공제총액</span>
                    <span className="font-mono">
                      -{selectedSlip.totalDeduction.toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Total (실수령액) */}
            <div className="border-t border-slate-200 pt-4 flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl">
              <div>
                <span className="text-[11px] text-slate-400">실지급액 (차인지급액)</span>
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {selectedSlip.netPay.toLocaleString()}원
                </div>
              </div>
              <div className="text-right text-xs text-slate-400 space-y-0.5">
                <div>지급총액: +{selectedSlip.totalPay.toLocaleString()}원</div>
                <div className="text-rose-400">
                  공제총액: -{selectedSlip.totalDeduction.toLocaleString()}원
                </div>
              </div>
            </div>

            {/* Confirmation & Status Info */}
            <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  상태: <strong>{selectedSlip.status === 'PAID' ? '지급완료' : '급여확정'}</strong>
                </span>
                {selectedSlip.confirmedAt && (
                  <span>
                    (확정일시: {selectedSlip.confirmedAt.substring(0, 16).replace('T', ' ')})
                  </span>
                )}
              </div>
              <div>본 명세서는 위탁 노무법인 나인을 통해 공인 검토·발행되었습니다.</div>
            </div>

            {/* Requirement 12: Browser Print */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedSlip(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
              >
                <Printer className="h-4 w-4" />
                인쇄하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
