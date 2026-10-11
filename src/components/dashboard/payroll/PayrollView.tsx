import React, { useEffect, useState, useMemo } from 'react';
import {
  Company,
  DeductionItem,
  PayItem,
  PayrollRecord,
  PayrollStatus,
  UserRole,
  Worker,
} from '../../../types';
import {
  payrollService,
  OvertimeAnalysisResult,
  OvertimeImportExecutionResult,
  PayrollValidationIssue,
} from '../../../services/payrollService';
import { firmService } from '../../../services/firmService';
import { useAuth } from '../../../contexts/AuthContext';
import { auditLogService } from '../../../services/auditLogService';
import { overtimeService } from '../../../services/overtimeService';
import {
  DollarSign,
  Calendar,
  Building2,
  Users,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  ChevronRight,
  AlertCircle,
  Plus,
  Trash2,
  X,
  HeartHandshake,
  ChevronLeft,
  RefreshCw,
  Save,
  Lock,
  Unlock,
  CheckCheck,
  AlertTriangle,
  ArrowDownToLine,
  Calculator,
  RotateCcw,
  BadgeCheck,
  CreditCard,
  CheckSquare,
} from 'lucide-react';
import { CreateTaskFromSourceModal } from '../admin/CreateTaskFromSourceModal';
import { TaskSourceType } from '../../../types';

interface PayrollViewProps {
  role: UserRole;
  companyId?: string;
  initialCompanyId?: string;
  initialWorkerId?: string;
  initialPayrollId?: string;
  onNavigateToSource?: (
    sourceType: TaskSourceType,
    sourceId: string,
    companyId?: string,
    workerId?: string
  ) => void;
}

// Requirement 3 & 9: Standard payroll items defined with ZERO mock data.
export const STANDARD_PAY_ITEMS = [
  { name: '기본급', isTaxable: true },
  { name: '각종 수당', isTaxable: true },
  { name: '연장근로수당', isTaxable: true },
  { name: '휴일근로수당', isTaxable: true },
  { name: '기타 지급', isTaxable: false },
];

export const STANDARD_DEDUCTION_ITEMS = [
  { name: '국민연금' },
  { name: '건강보험' },
  { name: '장기요양보험' },
  { name: '고용보험' },
  { name: '소득세' },
  { name: '지방소득세' },
  { name: '기타 공제' },
];

export const PayrollView: React.FC<PayrollViewProps> = ({
  role,
  companyId,
  initialCompanyId,
  initialWorkerId,
  initialPayrollId,
  onNavigateToSource,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Company Selection & Month State (Requirement 1 & 4)
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(initialCompanyId || companyId || '');
  const [belongingYearMonth, setBelongingYearMonth] = useState<string>('2026-10');

  // Task Integration Modal State (R3-3 3/3-B)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalSource, setTaskModalSource] = useState<{
    sourceType: TaskSourceType;
    sourceId: string;
    sourceTitle: string;
    companyId: string;
    workerId?: string;
    defaultTitle: string;
    defaultDescription: string;
    defaultDueDate?: string;
  } | null>(null);

  // Worker Data & Payrolls State (Strictly isolated by companyId & belongingYearMonth)
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Requirement 1, 2, 3: Overtime Source Modification & Desync Detection States
  const [overtimeSourceUpdatedAt, setOvertimeSourceUpdatedAt] = useState<string | null>(null);
  const [syncMetaImportedAt, setSyncMetaImportedAt] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resigned'>('active');

  // Modal / Detail Editor State
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [activePayroll, setActivePayroll] = useState<PayrollRecord | null>(null);
  const [payItems, setPayItems] = useState<PayItem[]>([]);
  const [deductionItems, setDeductionItems] = useState<DeductionItem[]>([]);
  const [maternityNote, setMaternityNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Individual Worker Overtime & Hourly Wage State in Modal
  const [modalOvertimeHours, setModalOvertimeHours] = useState<number>(0);
  const [modalHolidayWorkHours, setModalHolidayWorkHours] = useState<number>(0);
  const [modalHourlyWage, setModalHourlyWage] = useState<number>(0);

  // Overtime Import States
  const [isOvertimeConfirmModalOpen, setIsOvertimeConfirmModalOpen] = useState(false);
  const [isAnalyzingOvertime, setIsAnalyzingOvertime] = useState(false);
  const [isImportingOvertime, setIsImportingOvertime] = useState(false);
  const [overtimeAnalysis, setOvertimeAnalysis] = useState<OvertimeAnalysisResult | null>(null);
  const [showExcludedDetails, setShowExcludedDetails] = useState(false);

  // Requirement 2 & 3: Ledger Confirmation Modal State
  const [isLedgerConfirmModalOpen, setIsLedgerConfirmModalOpen] = useState(false);
  const [isConfirmingLedger, setIsConfirmingLedger] = useState(false);
  const [ledgerPaymentDate, setLedgerPaymentDate] = useState<string>('2026-10-25');
  const [validationIssues, setValidationIssues] = useState<PayrollValidationIssue[]>([]);

  // Requirement 5: Cancellation of Confirmation Modal State (Mandatory Reason)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellingPayrollId, setCancellingPayrollId] = useState<string | null>(null);
  const [isCancellingLedger, setIsCancellingLedger] = useState<boolean>(false);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Requirement 11: Mark Paid Action State
  const [isProcessingPaid, setIsProcessingPaid] = useState(false);

  // 1. Load Companies list for ADMIN
  useEffect(() => {
    let isMounted = true;
    const loadCompanies = async () => {
      try {
        if (role === 'ADMIN') {
          const list = await firmService.getAllCompanies();
          if (!isMounted) return;
          setCompanies(list);
          if (list.length > 0 && !selectedCompanyId) {
            setSelectedCompanyId(list[0].id);
          }
        } else if (companyId) {
          setSelectedCompanyId(companyId);
        } else if (userProfile?.companyId) {
          setSelectedCompanyId(userProfile.companyId);
        }
      } catch (err) {
        console.error('Failed to load companies for payroll', err);
      }
    };
    loadCompanies();
    return () => {
      isMounted = false;
    };
  }, [role, companyId, userProfile?.companyId]);

  // 2. Load Workers & Payrolls when selectedCompanyId or belongingYearMonth changes
  const fetchPayrollData = async () => {
    if (!selectedCompanyId || !belongingYearMonth) return;
    try {
      setLoading(true);
      setSaveError(null);
      const [workerList, payrollList, syncMeta] = await Promise.all([
        firmService.getWorkersByCompany(selectedCompanyId),
        payrollService.getPayrollsByCompany(selectedCompanyId, belongingYearMonth),
        overtimeService.getOvertimeSyncMeta(selectedCompanyId, belongingYearMonth),
      ]);

      // Strict client-side isolation guarantee: enforce w.companyId === selectedCompanyId
      const isolatedWorkers = workerList.filter((w) => w.companyId === selectedCompanyId);
      const isolatedPayrolls = payrollList.filter(
        (p) => p.companyId === selectedCompanyId && p.belongingYearMonth === belongingYearMonth
      );

      setWorkers(isolatedWorkers);
      setPayrolls(isolatedPayrolls);
      setOvertimeSourceUpdatedAt(syncMeta.overtimeSourceUpdatedAt);
      setSyncMetaImportedAt(syncMeta.overtimeImportedAt);
    } catch (err) {
      console.error('Failed to fetch payroll list', err);
      setWorkers([]);
      setPayrolls([]);
      setOvertimeSourceUpdatedAt(null);
      setSyncMetaImportedAt(null);
      setSaveError(err instanceof Error ? err.message : '급여 데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [selectedCompanyId, belongingYearMonth]);

  // Requirement 2 & 3: Compare overtimeSourceUpdatedAt with overtimeImportedAt
  const effectiveImportedAt = useMemo(() => {
    let maxTime = syncMetaImportedAt || '';
    payrolls.forEach((p) => {
      if (p.overtimeImportedAt && p.overtimeImportedAt > maxTime) {
        maxTime = p.overtimeImportedAt;
      }
    });
    return maxTime || null;
  }, [syncMetaImportedAt, payrolls]);

  // Requirement 3: Condition overtimeSourceUpdatedAt > overtimeImportedAt
  const isOvertimeDesynced = useMemo(() => {
    if (!overtimeSourceUpdatedAt) return false;
    if (!effectiveImportedAt) return false;
    return overtimeSourceUpdatedAt > effectiveImportedAt;
  }, [overtimeSourceUpdatedAt, effectiveImportedAt]);

  // Requirement 6 & 7: Check count of CONFIRMED or PAID records affected when desynced
  const confirmedCountWhenDesynced = useMemo(() => {
    if (!isOvertimeDesynced) return 0;
    return payrolls.filter((p) => p.status === 'CONFIRMED').length;
  }, [isOvertimeDesynced, payrolls]);

  const paidCountWhenDesynced = useMemo(() => {
    if (!isOvertimeDesynced) return 0;
    return payrolls.filter((p) => p.status === 'PAID').length;
  }, [isOvertimeDesynced, payrolls]);

  const draftCountWhenDesynced = useMemo(() => {
    if (!isOvertimeDesynced) return 0;
    return payrolls.filter((p) => p.status === 'DRAFT').length;
  }, [isOvertimeDesynced, payrolls]);

  // Current Selected Company Details
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [year, month] = belongingYearMonth.split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    setBelongingYearMonth(`${yStr}-${mStr}`);
    setLedgerPaymentDate(`${yStr}-${mStr}-25`);
  };

  const handleNextMonth = () => {
    const [year, month] = belongingYearMonth.split('-').map(Number);
    const date = new Date(year, month, 1);
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    setBelongingYearMonth(`${yStr}-${mStr}`);
    setLedgerPaymentDate(`${yStr}-${mStr}-25`);
  };

  // Helper to extract named item amount from PayrollRecord
  const getItemAmount = (
    payroll: PayrollRecord | undefined,
    type: 'pay' | 'deduction',
    name: string
  ): number => {
    if (!payroll) return 0;
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

  // Trigger Overtime Import Analysis
  const handleOpenOvertimeImport = async () => {
    if (!selectedCompanyId || !belongingYearMonth) return;
    try {
      setIsAnalyzingOvertime(true);
      const analysis = await payrollService.analyzeOvertimeForCompany(
        selectedCompanyId,
        belongingYearMonth,
        workers
      );
      setOvertimeAnalysis(analysis);
      setShowExcludedDetails(false);
      setIsOvertimeConfirmModalOpen(true);
    } catch (err: any) {
      console.error('Failed to analyze overtime records', err);
      alert('추가근무 기록 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzingOvertime(false);
    }
  };

  // Execute Overtime Import
  const handleExecuteOvertimeImport = async () => {
    if (!overtimeAnalysis || !currentUser) return;
    try {
      setIsImportingOvertime(true);
      const result: OvertimeImportExecutionResult =
        await payrollService.importOvertimeToPayrolls({
          companyId: selectedCompanyId,
          belongingYearMonth,
          registeredWorkers: workers,
          analysis: overtimeAnalysis,
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '관리자',
        });

      setIsOvertimeConfirmModalOpen(false);

      const excludedNotice =
        result.excludedCount > 0 ? ` (제외 ${result.excludedCount}건)` : '';
      setSaveSuccessMsg(
        `${result.updatedWorkersCount}명의 추가근무 기록을 급여대장에 반영했습니다.${excludedNotice}`
      );
      setTimeout(() => setSaveSuccessMsg(null), 5000);

      await fetchPayrollData();
    } catch (err: any) {
      console.error('Failed to import overtime to payroll', err);
      alert(err?.message || '추가근무 급여 연동 중 오류가 발생했습니다.');
    } finally {
      setIsImportingOvertime(false);
    }
  };

  // Requirement 2 & 3: Open Ledger Confirmation Modal with Warnings
  const handleOpenLedgerConfirm = () => {
    const issues = payrollService.validatePayrollLedgerForConfirmation(
      filteredWorkers,
      payrolls
    );
    setValidationIssues(issues);
    setLedgerPaymentDate(`${belongingYearMonth}-25`);
    setIsLedgerConfirmModalOpen(true);
  };

  // Requirement 2 & 4: Execute Ledger Confirmation
  const handleExecuteLedgerConfirm = async () => {
    if (!currentUser || !selectedCompanyId) return;
    try {
      setIsConfirmingLedger(true);
      const res = await payrollService.confirmPayrollLedger({
        companyId: selectedCompanyId,
        belongingYearMonth,
        companyName: selectedCompany?.companyName,
        paymentDate: ledgerPaymentDate,
        actorUserId: currentUser.uid,
        actorRole: role,
        actorName: userProfile?.displayName || '관리자',
      });

      setIsLedgerConfirmModalOpen(false);
      setSaveSuccessMsg(
        `${belongingYearMonth} 귀속 급여대장(${res.confirmedCount}건)이 성공적으로 확정되었습니다.`
      );
      setTimeout(() => setSaveSuccessMsg(null), 5000);
      await fetchPayrollData();
    } catch (err: any) {
      console.error('Failed to confirm payroll ledger', err);
      alert(err?.message || '급여 확정 처리 중 오류가 발생했습니다.');
    } finally {
      setIsConfirmingLedger(false);
    }
  };

  // Requirement 5: Open Cancel Confirmation Modal
  const handleOpenCancelConfirmation = (payrollId?: string, isLedger: boolean = false) => {
    setCancellingPayrollId(payrollId || null);
    setIsCancellingLedger(isLedger);
    setCancellationReason('');
    setCancelError(null);
    setIsCancelModalOpen(true);
  };

  // Requirement 5: Execute Cancel Confirmation (CONFIRMED -> DRAFT)
  const handleExecuteCancelConfirmation = async () => {
    if (!currentUser) return;
    if (!cancellationReason.trim()) {
      setCancelError('확정 취소 사유를 반드시 입력해야 합니다.');
      return;
    }

    try {
      setIsCancelling(true);
      setCancelError(null);

      if (isCancellingLedger) {
        const res = await payrollService.cancelPayrollLedgerConfirmation({
          companyId: selectedCompanyId,
          belongingYearMonth,
          cancellationReason: cancellationReason.trim(),
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '관리자',
        });
        setSaveSuccessMsg(
          `${belongingYearMonth} 귀속 급여대장(${res.cancelledCount}건)의 확정이 취소되었습니다. (작성중 상태 전환)`
        );
      } else if (cancellingPayrollId) {
        await payrollService.cancelPayrollConfirmation({
          payrollId: cancellingPayrollId,
          cancellationReason: cancellationReason.trim(),
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '관리자',
        });
        setSaveSuccessMsg(
          '해당 근로자의 급여 확정이 취소되어 작성중(DRAFT) 상태로 전환되었습니다.'
        );
      }

      setIsCancelModalOpen(false);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
      await fetchPayrollData();
    } catch (err: any) {
      console.error('Failed to cancel payroll confirmation', err);
      setCancelError(err?.message || '확정 취소 처리 중 오류가 발생했습니다.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Requirement 11: Mark Payroll Paid
  const handleMarkPaid = async (payrollId?: string, isLedger: boolean = false) => {
    if (!currentUser) return;
    if (
      !confirm(
        isLedger
          ? `현재 확정된 ${belongingYearMonth} 급여를 [지급완료] 상태로 변경하시겠습니까?`
          : '해당 급여를 [지급완료] 상태로 변경하시겠습니까?'
      )
    ) {
      return;
    }

    try {
      setIsProcessingPaid(true);
      if (isLedger) {
        const res = await payrollService.markPayrollLedgerPaid({
          companyId: selectedCompanyId,
          belongingYearMonth,
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '관리자',
        });
        setSaveSuccessMsg(
          `${belongingYearMonth} 급여 ${res.paidCount}건이 [지급완료] 처리되었습니다.`
        );
      } else if (payrollId) {
        await payrollService.markPayrollPaid({
          payrollId,
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '관리자',
        });
        setSaveSuccessMsg('급여가 [지급완료] 처리되었습니다.');
      }
      setTimeout(() => setSaveSuccessMsg(null), 5000);
      await fetchPayrollData();
    } catch (err: any) {
      console.error('Failed to mark payroll paid', err);
      alert(err?.message || '지급완료 처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessingPaid(false);
    }
  };

  // Open Worker Detail for Edit
  const handleOpenDetail = async (worker: Worker, overridePayroll?: PayrollRecord) => {
    setSelectedWorker(worker);
    setSaveError(null);

    // Strictly match by employeeId === worker.id (never by name!)
    const existing =
      overridePayroll ||
      payrolls.find(
        (p) =>
          p.companyId === selectedCompanyId &&
          p.employeeId === worker.id &&
          p.belongingYearMonth === belongingYearMonth
      );

    // Set hourly wage and overtime hours
    setModalHourlyWage(worker.hourlyWage || existing?.hourlyWage || 0);
    setModalOvertimeHours(existing?.overtimeHours || 0);
    setModalHolidayWorkHours(
      existing?.holidayWorkHours || existing?.holidayHours || 0
    );

    // Check connected Maternity records for this worker
    let foundMaternityNote = '';
    try {
      const maternityCases = await firmService.getMaternityCasesByEmployee(worker.id);
      const activeCase = maternityCases.find(
        (c) => c.status !== 'CANCELLED' && c.status !== 'COMPLETED'
      );
      if (activeCase) {
        foundMaternityNote = `[모성보호 연계] ${activeCase.workType} 적용중 (${activeCase.startDate} ~ ${activeCase.endDate})`;
      }
    } catch (err) {
      console.warn('Failed to check maternity cases', err);
    }

    if (existing) {
      setActivePayroll(existing);
      // Ensure all standard pay items are present
      const pItems: PayItem[] = STANDARD_PAY_ITEMS.map((std, idx) => {
        const found = existing.payItems?.find((p) => p.name === std.name);
        return (
          found || {
            id: `pi_${idx}_${Date.now()}`,
            name: std.name,
            amount: 0,
            isTaxable: std.isTaxable,
          }
        );
      });
      // Append any custom pay items user added
      const customPay = (existing.payItems || []).filter(
        (p) => !STANDARD_PAY_ITEMS.some((s) => s.name === p.name)
      );
      setPayItems([...pItems, ...customPay]);

      // Ensure all standard deduction items are present
      const dItems: DeductionItem[] = STANDARD_DEDUCTION_ITEMS.map((std, idx) => {
        const found = existing.deductionItems?.find((d) => d.name === std.name);
        return (
          found || {
            id: `di_${idx}_${Date.now()}`,
            name: std.name,
            amount: 0,
          }
        );
      });
      const customDed = (existing.deductionItems || []).filter(
        (d) => !STANDARD_DEDUCTION_ITEMS.some((s) => s.name === d.name)
      );
      setDeductionItems([...dItems, ...customDed]);

      setMaternityNote(existing.maternityNote || foundMaternityNote);
    } else {
      // New payroll starts with 0 for all items (NO mock numbers)
      setActivePayroll(null);
      setPayItems(
        STANDARD_PAY_ITEMS.map((std, idx) => ({
          id: `pi_${idx}_${Date.now()}`,
          name: std.name,
          amount: 0,
          isTaxable: std.isTaxable,
        }))
      );
      setDeductionItems(
        STANDARD_DEDUCTION_ITEMS.map((std, idx) => ({
          id: `di_${idx}_${Date.now()}`,
          name: std.name,
          amount: 0,
        }))
      );
      setMaternityNote(foundMaternityNote);
    }
  };

  // Auto select company if initialCompanyId provided (R3-3 3/3-B)
  useEffect(() => {
    if (initialCompanyId && initialCompanyId !== selectedCompanyId) {
      setSelectedCompanyId(initialCompanyId);
    }
  }, [initialCompanyId]);

  // Auto select worker if initialWorkerId provided (R3-3 3/3-B)
  useEffect(() => {
    if (initialWorkerId && workers.length > 0) {
      const match = workers.find((w) => w.id === initialWorkerId);
      if (match) {
        handleOpenDetail(match);
      }
    }
  }, [initialWorkerId, workers]);

  // [R3-3 3/3-B-④-A] 할 일에서 원본 급여 상세 이동 시 자동 오픈
  // 실제 Firestore payroll 문서가 존재하는 경우에만 정확히 해당 급여 상세 오픈
  // 임시 급여 건처럼 실제 원본 문서가 존재하지 않는 sourceId는 오픈하지 않음
  const autoOpenedPayrollRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!initialPayrollId) {
      autoOpenedPayrollRef.current = null;
      return;
    }
    if (autoOpenedPayrollRef.current === initialPayrollId) return;

    let isCancelled = false;
    const loadAndOpenPayroll = async () => {
      try {
        const record = await payrollService.getPayrollById(initialPayrollId);
        if (!record || isCancelled) return;

        autoOpenedPayrollRef.current = initialPayrollId;

        if (record.companyId && record.companyId !== selectedCompanyId) {
          setSelectedCompanyId(record.companyId);
        }
        if (record.belongingYearMonth && record.belongingYearMonth !== belongingYearMonth) {
          setBelongingYearMonth(record.belongingYearMonth);
        }

        let targetWorker = workers.find((w) => w.id === record.employeeId);
        if (!targetWorker) {
          const compWorkers = await firmService.getWorkersByCompany(record.companyId);
          targetWorker = compWorkers.find((w) => w.id === record.employeeId);
        }

        if (!targetWorker && record.employeeId) {
          targetWorker = {
            id: record.employeeId,
            companyId: record.companyId,
            name: record.employeeName || '근로자',
            hourlyWage: record.hourlyWage || 0,
            status: 'active',
          } as Worker;
        }

        if (targetWorker && !isCancelled) {
          handleOpenDetail(targetWorker, record);
        }
      } catch (err) {
        console.warn('Failed to auto-open initial payroll:', err);
      }
    };

    loadAndOpenPayroll();
    return () => {
      isCancelled = true;
    };
  }, [initialPayrollId]);

  // Requirement 5: Is current modal locked?
  const isModalLocked =
    activePayroll?.status === 'CONFIRMED' || activePayroll?.status === 'PAID';

  // Task Integration Helper (R3-3 3/3-B-②-B)
  const handleOpenTaskModalForPayroll = (
    payroll?: PayrollRecord | null,
    worker?: Worker | null
  ) => {
    const comp = companies.find((c) => c.id === selectedCompanyId);
    const compName = comp?.companyName || selectedCompanyId;

    // 1. sourceType: 항상 'PAYROLL'
    const sourceType: TaskSourceType = 'PAYROLL';

    // 2. canonical employeeId (workerId):
    // 급여 문서가 특정 근로자의 개별 급여 레코드이고 canonical employeeId가 명확한 경우에만: workerId = payroll.employeeId
    // 근로자가 명확하지 않은 회사 전체 급여 업무에는 workerId를 임의로 넣지 않음.
    // auth.uid나 이름으로 근로자를 매칭하지 않음.
    const canonicalEmployeeId =
      payroll?.employeeId?.trim() ||
      (worker?.id?.trim() ? worker.id.trim() : undefined);

    const isIndividualWorkerRecord = Boolean(canonicalEmployeeId);

    // 3. sourceId
    const sourceId =
      payroll?.id ||
      (isIndividualWorkerRecord
        ? `pr_${selectedCompanyId}_${canonicalEmployeeId}_${belongingYearMonth.replace('-', '')}`
        : `payroll_${selectedCompanyId}_${belongingYearMonth}`);

    // 4. companyId
    const targetCompanyId = payroll?.companyId || selectedCompanyId;

    // 5. workerId: 개별 근로자 레코드인 경우에만 설정
    const targetWorkerId = isIndividualWorkerRecord ? canonicalEmployeeId : undefined;

    // 6. 근로자명 (제목 표시용)
    const workerName =
      worker?.name ||
      payroll?.employeeName ||
      (canonicalEmployeeId ? workers.find((w) => w.id === canonicalEmployeeId)?.name : undefined);

    // 7. defaultTitle: 귀속월과 근로자를 알아볼 수 있도록 자동 입력 (예: [급여] 2026-10 홍길동)
    const defaultTitle = isIndividualWorkerRecord && workerName
      ? `[급여] ${belongingYearMonth} ${workerName}`
      : `[급여] ${belongingYearMonth} ${compName} 급여관리`;

    const sourceTitle = isIndividualWorkerRecord && workerName
      ? `개별급여: ${workerName} (${belongingYearMonth})`
      : `급여대장: ${compName} (${belongingYearMonth})`;

    const defaultDescription = isIndividualWorkerRecord
      ? `기업: ${compName}\n근로자: ${workerName || canonicalEmployeeId} (${canonicalEmployeeId})\n귀속연월: ${belongingYearMonth}\n지급예정일: ${payroll?.paymentDate || `${belongingYearMonth}-25`}\n지급총액: ${Number(payroll?.totalPay || 0).toLocaleString()}원\n상태: ${payroll?.status || '작성중'}`
      : `기업: ${compName}\n귀속연월: ${belongingYearMonth}\n총 대상 근로자: ${filteredWorkers.length}명\n확정 인원: ${ledgerTotals.confirmedCount}명`;

    const defaultDueDate = payroll?.paymentDate || `${belongingYearMonth}-25`;

    setTaskModalSource({
      sourceType,
      sourceId,
      sourceTitle,
      companyId: targetCompanyId,
      workerId: targetWorkerId,
      defaultTitle,
      defaultDescription,
      defaultDueDate,
    });
    setIsTaskModalOpen(true);
  };

  // Apply Overtime Multipliers in Modal
  const handleApplyOvertimeMultipliersInModal = () => {
    if (!modalHourlyWage || modalHourlyWage <= 0) {
      alert('통상시급을 먼저 입력해 주세요. (1원 이상)');
      return;
    }
    const otPay = Math.round(modalOvertimeHours * modalHourlyWage * 1.5);
    const holPay = Math.round(modalHolidayWorkHours * modalHourlyWage * 1.5);

    setPayItems((prev) =>
      prev.map((item) => {
        if (item.name === '연장근로수당') {
          return { ...item, amount: otPay };
        }
        if (item.name === '휴일근로수당') {
          return { ...item, amount: holPay };
        }
        return item;
      })
    );
  };

  // Add custom pay / deduction item
  const handleAddPayItem = () => {
    if (isModalLocked) return;
    const newItem: PayItem = {
      id: `pi_custom_${Date.now()}`,
      name: '추가 수당',
      amount: 0,
      isTaxable: true,
    };
    setPayItems((prev) => [...prev, newItem]);
  };

  const handleAddDeductionItem = () => {
    if (isModalLocked) return;
    const newItem: DeductionItem = {
      id: `di_custom_${Date.now()}`,
      name: '기타 공제',
      amount: 0,
    };
    setDeductionItems((prev) => [...prev, newItem]);
  };

  const handleRemovePayItem = (index: number) => {
    if (isModalLocked) return;
    setPayItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveDeductionItem = (index: number) => {
    if (isModalLocked) return;
    setDeductionItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculation Formulas
  const modalTotalPay = useMemo(
    () => payItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
    [payItems]
  );
  const modalTotalDeduction = useMemo(
    () => deductionItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
    [deductionItems]
  );
  const modalNetPay = modalTotalPay - modalTotalDeduction;

  // Requirement 4 & 6: Save or Confirm Payroll in Modal
  const handleSavePayroll = async (status: PayrollStatus = 'DRAFT') => {
    if (!selectedWorker || !currentUser) return;
    if (isModalLocked && status === 'DRAFT') {
      alert('확정 또는 지급완료된 급여는 편집이 잠겨 있습니다. [확정 취소] 후 수정하세요.');
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      const hasUnsetWage =
        (modalOvertimeHours > 0 || modalHolidayWorkHours > 0) &&
        (!modalHourlyWage || modalHourlyWage === 0);

      const now = new Date().toISOString();
      const saved = await payrollService.savePayroll({
        companyId: selectedCompanyId,
        companyName: selectedCompany?.companyName,
        employeeId: selectedWorker.id,
        employeeName: selectedWorker.name,
        department: selectedWorker.department,
        position: selectedWorker.position,
        belongingYearMonth,
        paymentDate: `${belongingYearMonth}-25`,
        payItems,
        deductionItems,
        totalPay: modalTotalPay,
        totalDeduction: modalTotalDeduction,
        netPay: modalNetPay,
        overtimeHours: modalOvertimeHours,
        holidayHours: modalHolidayWorkHours,
        holidayWorkHours: modalHolidayWorkHours,
        hourlyWage: modalHourlyWage > 0 ? modalHourlyWage : undefined,
        wageStatus: hasUnsetWage ? 'NEEDS_CONFIRMATION' : 'CONFIRMED',
        status,
        confirmedAt: status === 'CONFIRMED' ? now : activePayroll?.confirmedAt,
        confirmedById: status === 'CONFIRMED' ? currentUser.uid : activePayroll?.confirmedById,
        maternityNote,
        createdById: currentUser.uid,
        updatedById: currentUser.uid,
        createdAt: activePayroll?.createdAt,
      });

      // Audit Log (Requirement 4)
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: role,
        actorName: userProfile?.displayName || '관리자',
        companyId: selectedCompanyId,
        action: status === 'CONFIRMED' ? 'PAYROLL_CONFIRMED' : 'PAYROLL_SAVED',
        resourceType: 'PAYROLL',
        resourceId: saved.id,
        details: {
          employeeId: selectedWorker.id,
          employeeName: selectedWorker.name,
          belongingYearMonth,
          totalPay: modalTotalPay,
          totalDeduction: modalTotalDeduction,
          netPay: modalNetPay,
          status,
        },
      });

      setSaveSuccessMsg(
        `${selectedWorker.name} 님의 ${belongingYearMonth} 급여가 ${
          status === 'CONFIRMED' ? '확정' : '저장'
        }되었습니다.`
      );
      setTimeout(() => setSaveSuccessMsg(null), 3500);

      setSelectedWorker(null);
      await fetchPayrollData();
    } catch (err: any) {
      console.error('Failed to save payroll', err);
      setSaveError(err?.message || '급여 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered workers list
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      // Status filter
      if (statusFilter === 'active' && w.status === 'resigned') return false;
      if (statusFilter === 'resigned' && w.status !== 'resigned') return false;

      // Search query: Name, ID, Department, Position
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = w.name?.toLowerCase().includes(query);
        const matchId = w.id?.toLowerCase().includes(query);
        const matchDept = w.department?.toLowerCase().includes(query);
        const matchPos = w.position?.toLowerCase().includes(query);
        if (!matchName && !matchId && !matchDept && !matchPos) return false;
      }
      return true;
    });
  }, [workers, statusFilter, searchQuery]);

  // Aggregate Totals across listed workers for the Ledger Footer
  const ledgerTotals = useMemo(() => {
    let sumBase = 0;
    let sumAllowances = 0;
    let sumOvertime = 0;
    let sumHoliday = 0;
    let sumOtherPay = 0;
    let sumTotalPay = 0;

    let sumPension = 0;
    let sumHealth = 0;
    let sumCare = 0;
    let sumEmp = 0;
    let sumIncomeTax = 0;
    let sumLocalTax = 0;
    let sumOtherDed = 0;
    let sumTotalDeduction = 0;

    let sumNetPay = 0;
    let confirmedCount = 0;
    let paidCount = 0;
    let draftCount = 0;
    let unwrittenCount = 0;

    filteredWorkers.forEach((w) => {
      const p = payrolls.find((pr) => pr.employeeId === w.id);
      if (p) {
        sumBase += getItemAmount(p, 'pay', '기본급');
        sumAllowances += getItemAmount(p, 'pay', '각종 수당');
        sumOvertime += getItemAmount(p, 'pay', '연장근로수당');
        sumHoliday += getItemAmount(p, 'pay', '휴일근로수당');
        sumOtherPay += getItemAmount(p, 'pay', '기타 지급');
        sumTotalPay += p.totalPay || 0;

        sumPension += getItemAmount(p, 'deduction', '국민연금');
        sumHealth += getItemAmount(p, 'deduction', '건강보험');
        sumCare += getItemAmount(p, 'deduction', '장기요양보험');
        sumEmp += getItemAmount(p, 'deduction', '고용보험');
        sumIncomeTax += getItemAmount(p, 'deduction', '소득세');
        sumLocalTax += getItemAmount(p, 'deduction', '지방소득세');
        sumOtherDed += getItemAmount(p, 'deduction', '기타 공제');
        sumTotalDeduction += p.totalDeduction || 0;

        sumNetPay += p.netPay || 0;

        if (p.status === 'PAID') paidCount++;
        else if (p.status === 'CONFIRMED') confirmedCount++;
        else draftCount++;
      } else {
        unwrittenCount++;
      }
    });

    return {
      sumBase,
      sumAllowances,
      sumOvertime,
      sumHoliday,
      sumOtherPay,
      sumTotalPay,
      sumPension,
      sumHealth,
      sumCare,
      sumEmp,
      sumIncomeTax,
      sumLocalTax,
      sumOtherDed,
      sumTotalDeduction,
      sumNetPay,
      confirmedCount,
      paidCount,
      draftCount,
      unwrittenCount,
    };
  }, [filteredWorkers, payrolls]);

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              아웃소싱 관리
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              귀속 {belongingYearMonth}
            </span>
            {selectedCompany && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                {selectedCompany.companyName}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <DollarSign className="h-6 w-6 text-slate-700" />
            급여관리
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            기업별 귀속연월 급여대장을 산정하고, [급여 확정]을 통해 근로자 전자 급여명세서와 안전하게 연계합니다.
          </p>
        </div>

        {/* Global Action Toolbar (Requirement 1, 2, 5, 11) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 할 일로 추가 (급여대장 / 월별 급여) */}
          {role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => handleOpenTaskModalForPayroll(null, null)}
              disabled={loading || !selectedCompanyId}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs disabled:opacity-50"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              할 일로 추가
            </button>
          )}

          {/* 추가근무 불러오기 (Requirement 8: employeeId + companyId + 귀속연월 기준) */}
          {(role === 'ADMIN' || role === 'COMPANY') && (
            <button
              type="button"
              onClick={handleOpenOvertimeImport}
              disabled={loading || isAnalyzingOvertime || !selectedCompanyId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs disabled:opacity-50"
            >
              <Clock className={`h-3.5 w-3.5 ${isAnalyzingOvertime ? 'animate-spin' : ''}`} />
              {isAnalyzingOvertime ? '분석 중...' : '추가근무 불러오기'}
            </button>
          )}

          {/* 전체 급여 확정 (Requirement 2) */}
          <button
            type="button"
            onClick={handleOpenLedgerConfirm}
            disabled={loading || filteredWorkers.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-2xs disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
            급여 확정
          </button>

          {/* 전체 지급완료 (Requirement 11) */}
          {ledgerTotals.confirmedCount > 0 && (
            <button
              type="button"
              onClick={() => handleMarkPaid(undefined, true)}
              disabled={loading || isProcessingPaid}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-2xs disabled:opacity-50"
            >
              <CreditCard className="h-3.5 w-3.5" />
              전체 지급완료 ({ledgerTotals.confirmedCount})
            </button>
          )}

          {/* 전체 확정 취소 (Requirement 5) */}
          {ledgerTotals.confirmedCount > 0 && (
            <button
              type="button"
              onClick={() => handleOpenCancelConfirmation(undefined, true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              확정 취소
            </button>
          )}

          <button
            onClick={() => fetchPayrollData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {saveSuccessMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          {saveSuccessMsg}
        </div>
      )}

      {/* Requirement 3, 4, 6, 7: 추가근무 변경 감지 및 급여 재동기화 안내 경고 배너 */}
      {isOvertimeDesynced && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500 text-white p-2 shrink-0 mt-0.5 shadow-xs">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-amber-950 text-sm">
                    추가근무 기록이 변경되었습니다. 다시 불러오기가 필요합니다.
                  </h3>
                  <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                    재동기화 필요
                  </span>
                </div>
                <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                  마지막 급여 반영 시각({effectiveImportedAt ? new Date(effectiveImportedAt).toLocaleString('ko-KR') : '미반영'}) 이후,
                  출근부 추가근무 원본({overtimeSourceUpdatedAt ? new Date(overtimeSourceUpdatedAt).toLocaleString('ko-KR') : '확인 중'})이 수정되었습니다.
                  급여대장에 최신 추가근무 시간을 반영하려면 아래 [추가근무 다시 불러오기]를 실행하세요.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 pl-11 sm:pl-0">
              <button
                type="button"
                onClick={handleOpenOvertimeImport}
                disabled={loading || isAnalyzingOvertime || !selectedCompanyId}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs disabled:opacity-50"
              >
                <Clock className={`h-4 w-4 ${isAnalyzingOvertime ? 'animate-spin' : ''}`} />
                {isAnalyzingOvertime ? '분석 중...' : '추가근무 다시 불러오기'}
              </button>
            </div>
          </div>

          {/* Requirement 6 & 7: CONFIRMED 또는 PAID 급여 보호 경고 */}
          {(confirmedCountWhenDesynced > 0 || paidCountWhenDesynced > 0) && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-900 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-rose-950 text-xs">
                  확정된 급여의 추가근무 원본이 변경되었습니다.
                </p>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  현재 해당 월에 <strong>확정(CONFIRMED) {confirmedCountWhenDesynced}건</strong>
                  {paidCountWhenDesynced > 0 && <>, <strong>지급완료(PAID) {paidCountWhenDesynced}건</strong></>}의 급여가 있습니다.
                  출근부가 변경되었다고 <strong>확정되거나 지급된 급여액을 자동으로 수정하지 않으며</strong>, 최고관리자(ADMIN)가 직접 확인해야 합니다.
                  <br />
                  확정된 급여를 수정해야 한다면 기존 <strong>[확정 취소]</strong> 절차를 거쳐 DRAFT로 변경한 뒤 다시 불러오도록 해주세요. (PAID 급여는 자동 수정되지 않습니다.)
                </p>
                {role === 'ADMIN' && confirmedCountWhenDesynced > 0 && (
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenCancelConfirmation(undefined, true)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 underline underline-offset-2"
                    >
                      <RotateCcw className="h-3 w-3" />
                      확정된 급여 일괄 확정 취소하기 ({confirmedCountWhenDesynced}건)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Requirement 5: 동기화 완료 상태 안내 */}
      {!isOvertimeDesynced && effectiveImportedAt && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-medium">
              출근부 추가근무가 급여대장과 최신 상태로 동기화되어 있습니다. (동기화 완료)
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 font-mono">
            최근 반영: {new Date(effectiveImportedAt).toLocaleString('ko-KR')}
          </span>
        </div>
      )}

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">총 대상 근로자</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-slate-900">
              {filteredWorkers.length}명
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              확정 <strong className="text-emerald-700">{ledgerTotals.confirmedCount}</strong> / 지급 <strong className="text-blue-700">{ledgerTotals.paidCount}</strong> / 작성중 {ledgerTotals.draftCount}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">지급총액 합계</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-indigo-700">
              {ledgerTotals.sumTotalPay.toLocaleString()}원
            </div>
            <div className="text-[11px] text-indigo-500 font-medium">전체 지급</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">공제총액 합계</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-rose-600">
              -{ledgerTotals.sumTotalDeduction.toLocaleString()}원
            </div>
            <div className="text-[11px] text-rose-500 font-medium">4대보험·세액</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">실지급액 (실수령액) 합계</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-emerald-700">
              {ledgerTotals.sumNetPay.toLocaleString()}원
            </div>
            <div className="text-[11px] text-emerald-600 font-medium">차인지급액</div>
          </div>
        </div>
      </div>

      {/* 3. Selectors & Filters Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Company Selector (ADMIN role only, strictly companyId based) */}
            {role === 'ADMIN' && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-700 shrink-0">대상 기업:</span>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-800 focus:outline-none min-w-[200px]"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.businessNumber || '사업자번호 미등록'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Year-Month Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700 mr-1">귀속연월:</span>
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
                onChange={(e) => {
                  setBelongingYearMonth(e.target.value);
                  setLedgerPaymentDate(`${e.target.value}-25`);
                }}
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

            {/* Employment Status Filter */}
            <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === 'active'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                재직중
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('resigned')}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === 'resigned'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                퇴사자
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                전체
              </button>
            </div>
          </div>

          {/* Worker Search (Name, Employee ID, Dept, Pos) */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="근로자명, 사번, 부서 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs focus:border-slate-800 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 4. 종합 급여대장 테이블 */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              {belongingYearMonth} 귀속 급여대장 (
              {selectedCompany ? selectedCompany.companyName : '회사 선택'})
            </h2>
            <span className="text-xs text-slate-400">
              ※ 확정(CONFIRMED) 시 근로자 명세서가 발행되며 편집이 안전하게 잠깁니다.
            </span>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-3">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <BadgeCheck className="h-3.5 w-3.5" />
              급여확정: 근로자 열람 가능
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <Lock className="h-3 w-3" />
              잠금 보호
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            <span>급여대장 로딩 중...</span>
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">해당 조건의 근로자가 없습니다.</p>
            <p className="text-[11px] text-slate-400">
              선택된 회사에 등록된 근로자가 없거나 검색 조건과 일치하지 않습니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                {/* Header Group Row */}
                <tr>
                  <th
                    colSpan={3}
                    className="px-3 py-2 text-center border-r border-slate-200 bg-slate-100/70"
                  >
                    근로자 기본정보
                  </th>
                  <th
                    colSpan={6}
                    className="px-3 py-2 text-center border-r border-slate-200 bg-indigo-50/60 text-indigo-900"
                  >
                    지급 내역 (과세 / 비과세)
                  </th>
                  <th
                    colSpan={8}
                    className="px-3 py-2 text-center border-r border-slate-200 bg-rose-50/60 text-rose-900"
                  >
                    공제 내역 (4대보험 / 제세공과금)
                  </th>
                  <th
                    colSpan={3}
                    className="px-3 py-2 text-center bg-emerald-50/60 text-emerald-900"
                  >
                    정산 결과
                  </th>
                </tr>
                {/* Specific Columns Row (Requirement 3) */}
                <tr className="border-t border-slate-200 bg-slate-50">
                  {/* 1. 기본 정보 */}
                  <th className="px-3 py-2.5 font-bold">근로자명</th>
                  <th className="px-3 py-2.5">사번/ID</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">부서 / 직책</th>

                  {/* 2. 지급 항목 */}
                  <th className="px-3 py-2.5 text-right font-medium">기본급</th>
                  <th className="px-3 py-2.5 text-right font-medium">각종 수당</th>
                  <th className="px-3 py-2.5 text-right font-medium">연장근로수당</th>
                  <th className="px-3 py-2.5 text-right font-medium">휴일근로수당</th>
                  <th className="px-3 py-2.5 text-right font-medium">기타 지급</th>
                  <th className="px-3 py-2.5 text-right font-bold text-indigo-700 bg-indigo-50/40 border-r border-slate-200">
                    지급총액
                  </th>

                  {/* 3. 공제 항목 */}
                  <th className="px-3 py-2.5 text-right font-medium">국민연금</th>
                  <th className="px-3 py-2.5 text-right font-medium">건강보험</th>
                  <th className="px-3 py-2.5 text-right font-medium">장기요양보험</th>
                  <th className="px-3 py-2.5 text-right font-medium">고용보험</th>
                  <th className="px-3 py-2.5 text-right font-medium">소득세</th>
                  <th className="px-3 py-2.5 text-right font-medium">지방소득세</th>
                  <th className="px-3 py-2.5 text-right font-medium">기타 공제</th>
                  <th className="px-3 py-2.5 text-right font-bold text-rose-700 bg-rose-50/40 border-r border-slate-200">
                    공제총액
                  </th>

                  {/* 4. 실수령액 및 상태 */}
                  <th className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/40">
                    실수령액
                  </th>
                  <th className="px-3 py-2.5 text-center">상태</th>
                  <th className="px-3 py-2.5 text-center">급여 작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWorkers.map((worker) => {
                  const payroll = payrolls.find((p) => p.employeeId === worker.id);
                  const status = payroll?.status || '미작성';
                  const isLocked = status === 'CONFIRMED' || status === 'PAID';

                  const baseSalary = getItemAmount(payroll, 'pay', '기본급');
                  const allowances = getItemAmount(payroll, 'pay', '각종 수당');
                  const overtimePay = getItemAmount(payroll, 'pay', '연장근로수당');
                  const holidayPay = getItemAmount(payroll, 'pay', '휴일근로수당');
                  const otherPay = getItemAmount(payroll, 'pay', '기타 지급');
                  const totalPay = payroll?.totalPay || 0;

                  const pension = getItemAmount(payroll, 'deduction', '국민연금');
                  const health = getItemAmount(payroll, 'deduction', '건강보험');
                  const care = getItemAmount(payroll, 'deduction', '장기요양보험');
                  const emp = getItemAmount(payroll, 'deduction', '고용보험');
                  const tax = getItemAmount(payroll, 'deduction', '소득세');
                  const localTax = getItemAmount(payroll, 'deduction', '지방소득세');
                  const otherDed = getItemAmount(payroll, 'deduction', '기타 공제');
                  const totalDeduction = payroll?.totalDeduction || 0;

                  const netPay = payroll?.netPay || 0;

                  const otHours = payroll?.overtimeHours || 0;
                  const holHours =
                    payroll?.holidayWorkHours || payroll?.holidayHours || 0;
                  const hasUnsetWage =
                    (otHours > 0 || holHours > 0) &&
                    (!payroll?.hourlyWage ||
                      payroll?.wageStatus === 'NEEDS_CONFIRMATION');

                  return (
                    <tr key={worker.id} className="hover:bg-slate-50/80 transition font-mono">
                      {/* 1. 기본 정보 */}
                      <td className="px-3 py-2.5 font-sans font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{worker.name}</span>
                          {worker.status === 'resigned' && (
                            <span className="text-[10px] text-rose-500 font-normal">
                              (퇴사)
                            </span>
                          )}
                          {isLocked && (
                            <span title="확정/지급완료되어 편집 잠금됨">
                              <Lock className="h-3 w-3 text-slate-400" />
                            </span>
                          )}
                        </div>
                        {hasUnsetWage && (
                          <div className="mt-0.5">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 font-sans">
                              통상시급 확인 필요
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 font-mono">
                        {worker.id.length > 12 ? `${worker.id.slice(0, 10)}…` : worker.id}
                      </td>
                      <td className="px-3 py-2.5 font-sans text-slate-600 border-r border-slate-200">
                        {worker.department || '-'} / {worker.position || '-'}
                      </td>

                      {/* 2. 지급 항목 */}
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        {payroll ? baseSalary.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        {payroll ? allowances.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        <div>{payroll ? overtimePay.toLocaleString() : '-'}</div>
                        {otHours > 0 && (
                          <div className="text-[10px] text-indigo-600 font-semibold font-sans">
                            {otHours}h
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        <div>{payroll ? holidayPay.toLocaleString() : '-'}</div>
                        {holHours > 0 && (
                          <div className="text-[10px] text-indigo-600 font-semibold font-sans">
                            {holHours}h
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        {payroll ? otherPay.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-indigo-700 bg-indigo-50/20 border-r border-slate-200">
                        {payroll ? totalPay.toLocaleString() : '-'}
                      </td>

                      {/* 3. 공제 항목 */}
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {payroll ? pension.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {payroll ? health.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {payroll ? care.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {payroll ? emp.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {payroll ? tax.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {payroll ? localTax.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {payroll ? otherDed.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-rose-600 bg-rose-50/20 border-r border-slate-200">
                        {payroll ? totalDeduction.toLocaleString() : '-'}
                      </td>

                      {/* 4. 실수령액 및 상태 */}
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/20">
                        {payroll ? netPay.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center font-sans">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                            status === 'PAID'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : status === 'CONFIRMED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : status === 'DRAFT'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          {isLocked && <Lock className="h-2.5 w-2.5" />}
                          {status === 'PAID'
                            ? '지급완료'
                            : status === 'CONFIRMED'
                            ? '급여확정'
                            : status === 'DRAFT'
                            ? '작성중'
                            : '미작성'}
                        </span>
                        {/* Requirement 3, 6, 7: Desync tags per worker row */}
                        {isOvertimeDesynced && (
                          <div className="mt-0.5">
                            {status === 'CONFIRMED' ? (
                              <span
                                className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 inline-block"
                                title="출근부 추가근무 원본이 변경되었으나 확정되어 자동 수정되지 않습니다."
                              >
                                출근부 변경 (확정 보호)
                              </span>
                            ) : status === 'PAID' ? (
                              <span
                                className="text-[9px] font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 inline-block"
                                title="출근부 추가근무 원본이 변경되었으나 이미 지급완료되어 보호됩니다."
                              >
                                출근부 변경 (지급완료)
                              </span>
                            ) : (
                              <span
                                className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 inline-block"
                                title="출근부 추가근무가 변경되어 다시 불러오기가 필요합니다."
                              >
                                재반영 필요
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center font-sans">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(worker)}
                            className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                              isLocked
                                ? 'text-slate-700 hover:text-slate-900'
                                : 'text-blue-600 hover:text-blue-800'
                            }`}
                          >
                            {isLocked ? '명세서/상세' : payroll ? '수정/산정' : '급여입력'}
                            <ChevronRight className="h-3 w-3" />
                          </button>

                          {/* Requirement 5 & 11: Action dropdown/buttons for confirmed status */}
                          {status === 'CONFIRMED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMarkPaid(payroll?.id)}
                                title="지급완료 처리"
                                className="text-[10px] font-bold text-blue-600 hover:underline px-1"
                              >
                                [지급]
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCancelConfirmation(payroll?.id, false)}
                                title="확정 취소"
                                className="text-[10px] font-bold text-rose-500 hover:underline px-1"
                              >
                                [취소]
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer: Column-by-column 합계 */}
              <tfoot className="bg-slate-100/90 border-t-2 border-slate-300 text-[11px] font-mono font-bold text-slate-900">
                <tr>
                  <td className="px-3 py-3 font-sans">
                    합계 ({filteredWorkers.length}명)
                  </td>
                  <td className="px-3 py-3 text-slate-400">-</td>
                  <td className="px-3 py-3 border-r border-slate-300 text-slate-400">-</td>

                  {/* 지급 합계 */}
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumBase.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumAllowances.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumOvertime.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumHoliday.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumOtherPay.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right text-indigo-700 bg-indigo-100/50 border-r border-slate-300">
                    {ledgerTotals.sumTotalPay.toLocaleString()}
                  </td>

                  {/* 공제 합계 */}
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumPension.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumHealth.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumCare.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumEmp.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumIncomeTax.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumLocalTax.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ledgerTotals.sumOtherDed.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right text-rose-700 bg-rose-100/50 border-r border-slate-300">
                    {ledgerTotals.sumTotalDeduction.toLocaleString()}
                  </td>

                  {/* 실수령 합계 */}
                  <td className="px-3 py-3 text-right text-emerald-800 bg-emerald-100/50">
                    {ledgerTotals.sumNetPay.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-center font-sans text-[10px] text-slate-500">
                    확정 {ledgerTotals.confirmedCount} / 지급 {ledgerTotals.paidCount}
                  </td>
                  <td className="px-3 py-3 text-center">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 5. Requirement 2 & 3: 급여대장 일괄 확정 확인 모달 */}
      {isLedgerConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                  <BadgeCheck className="h-4 w-4" />
                  월별 급여대장 확정 (CONFIRMED)
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {belongingYearMonth} 귀속 급여를 최종 확정하시겠습니까?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLedgerConfirmModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Requirement 2: Confirmation Summary Details */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">기업명</span>
                  <div className="font-bold text-slate-800 truncate">
                    {selectedCompany?.companyName || selectedCompanyId}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">귀속연월</span>
                  <div className="font-bold text-slate-800 font-mono">
                    {belongingYearMonth}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">대상 근로자 수</span>
                  <div className="font-bold text-slate-800 font-mono">
                    {filteredWorkers.length}명
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">지급총액</span>
                  <div className="font-bold text-indigo-700 font-mono">
                    {ledgerTotals.sumTotalPay.toLocaleString()}원
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">공제총액</span>
                  <div className="font-bold text-rose-600 font-mono">
                    -{ledgerTotals.sumTotalDeduction.toLocaleString()}원
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">실수령 총액</span>
                  <div className="font-bold text-emerald-700 font-mono">
                    {ledgerTotals.sumNetPay.toLocaleString()}원
                  </div>
                </div>
              </div>

              {/* Payment Date Input */}
              <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">급여 지급 예정일:</span>
                <input
                  type="date"
                  value={ledgerPaymentDate}
                  onChange={(e) => setLedgerPaymentDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div className="text-[11px] text-slate-500">
                ※ 확정 완료 시 근로자(WORKER)는 자신의 계정에서 전자 급여명세서를 실시간으로 열람 및 출력할 수 있으며, 급여대장 편집은 실수 방지를 위해 자동으로 잠깁니다.
              </div>
            </div>

            {/* Requirement 3: Pre-confirmation Validation Warnings */}
            {validationIssues.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  급여 확정 전 유의/경고 사항 ({validationIssues.length}건)
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-amber-100 text-[11px]">
                  {validationIssues.map((issue, idx) => (
                    <div key={idx} className="py-1.5 first:pt-0 last:pb-0 flex items-start justify-between gap-2">
                      <span className="text-amber-950 font-medium">
                        [{issue.workerName}] {issue.message}
                      </span>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 shrink-0">
                        {issue.type === 'UNSET_WAGE'
                          ? '시급미설정'
                          : issue.type === 'MISSING_DATA'
                          ? '미작성'
                          : '계산불일치'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-amber-700">
                  ※ 위 경고를 확인하셨으며 현재 상태로 확정을 진행하시려면 아래 [급여 확정 실행]을 클릭하세요.
                </p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsLedgerConfirmModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isConfirmingLedger}
                onClick={handleExecuteLedgerConfirm}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                {isConfirmingLedger ? '급여 확정 중...' : '급여 확정 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Requirement 5: 확정 취소 사유 입력 모달 (Mandatory Cancellation Reason) */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                  <RotateCcw className="h-3.5 w-3.5" />
                  급여 확정 취소 (CONFIRMED → DRAFT)
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {isCancellingLedger
                    ? `${belongingYearMonth} 전체 급여 확정을 취소하시겠습니까?`
                    : '해당 근로자의 급여 확정을 취소하시겠습니까?'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {cancelError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                {cancelError}
              </div>
            )}

            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-700">
                확정 취소 사유 <span className="text-rose-500">*필수 입력</span>
              </label>
              <textarea
                rows={3}
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="예: 근태 추가근무 시간 재조정에 따른 급여액 재산정 필요"
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-slate-800 focus:outline-none resize-none"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ※ 확정 취소 시 급여는 다시 작성중(DRAFT) 상태로 전환되어 자유롭게 수정할 수 있으며, 근로자 화면의 급여명세서는 노출이 즉시 중단됩니다. 취소 사유와 담당자 정보는 감사 로그(PAYROLL_CONFIRMATION_CANCELLED)에 영구 기록됩니다.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={isCancelling || !cancellationReason.trim()}
                onClick={handleExecuteCancelConfirmation}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition disabled:opacity-50"
              >
                {isCancelling ? '취소 처리 중...' : '확정 취소 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. 출근부 연동 확인 모달 */}
      {isOvertimeConfirmModalOpen && overtimeAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                  출근부 ↔ 급여대장 연동
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {belongingYearMonth} 추가근무 기록을 급여대장에 반영하시겠습니까?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOvertimeConfirmModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">대상 기업</span>
                  <div className="font-bold text-slate-800 truncate">
                    {selectedCompany?.companyName || selectedCompanyId}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">귀속연월</span>
                  <div className="font-bold text-slate-800 font-mono">
                    {belongingYearMonth}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">대상 근로자 수</span>
                  <div className="font-bold text-indigo-700 font-mono">
                    {overtimeAnalysis.matchedWorkersCount}명
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">연장근무 총 시간</span>
                  <div className="font-bold text-slate-800 font-mono">
                    {overtimeAnalysis.totalOvertimeHours}시간
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">휴무일근무 총 시간</span>
                  <div className="font-bold text-slate-800 font-mono">
                    {overtimeAnalysis.totalHolidayHours}시간
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">제외된 기록 수</span>
                  <div
                    className={`font-bold font-mono ${
                      overtimeAnalysis.excludedRecords.length > 0
                        ? 'text-rose-600'
                        : 'text-slate-600'
                    }`}
                  >
                    {overtimeAnalysis.excludedRecords.length}건
                  </div>
                </div>
              </div>
            </div>

            {/* Excluded Records Details */}
            {overtimeAnalysis.excludedRecords.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    제외된 출근부 기록 사유 확인 ({overtimeAnalysis.excludedRecords.length}건)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowExcludedDetails((prev) => !prev)}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    {showExcludedDetails ? '접기' : '사유 목록 보기'}
                  </button>
                </div>

                {showExcludedDetails && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 max-h-48 overflow-y-auto divide-y divide-rose-100 text-xs">
                    {overtimeAnalysis.excludedRecords.map((item, idx) => (
                      <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900">
                            {item.employeeName || '성명 미상'}{' '}
                            <span className="font-mono text-slate-500 font-normal">
                              ({item.employeeId || '사번 없음'})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            근무일: {item.workDate || '-'} | 구분:{' '}
                            {item.workType === 'OVERTIME'
                              ? '연장근무'
                              : item.workType === 'HOLIDAY'
                              ? '휴무일근무'
                              : item.workType || '미지정'}{' '}
                            | {item.hours}시간
                          </div>
                        </div>
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 shrink-0">
                          {item.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Requirement 6 & 7: Confirmation on DRAFT modification vs CONFIRMED/PAID protection */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                추가근무 반영 처리 원칙 안내
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600">
                <li>
                  <strong className="text-slate-800">작성중(DRAFT) 급여:</strong> 분석된 출근부 기록에 맞춰 연장·휴일근로 시간과 수당이 자동으로 갱신됩니다.
                </li>
                <li>
                  <strong className="text-slate-800">확정(CONFIRMED) 및 지급완료(PAID) 급여:</strong> 출근부가 변경되어도 자동으로 수정되지 않고 안전하게 보호되며 건너뜁니다.
                  {confirmedCountWhenDesynced > 0 && (
                    <span className="text-rose-600 font-semibold ml-1">
                      (현재 확정된 {confirmedCountWhenDesynced}건 보호됨)
                    </span>
                  )}
                </li>
                <li>
                  확정된 급여를 수정하려면 먼저 <strong>[확정 취소]</strong>를 진행하여 DRAFT 상태로 변경한 후 다시 불러오세요.
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsOvertimeConfirmModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isImportingOvertime}
                onClick={handleExecuteOvertimeImport}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                {isImportingOvertime ? '급여대장 반영 중...' : '급여대장에 반영하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. 근로자 급여 상세 산정 / 수정 모달 (Locking & Actions) */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl space-y-5 max-h-[94vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 uppercase">
                    {belongingYearMonth} 귀속 급여대장 산정
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    사번/ID: {selectedWorker.id}
                  </span>
                  {isModalLocked && (
                    <span className="rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                      <Lock className="h-2.5 w-2.5" />
                      {activePayroll?.status === 'PAID' ? '지급완료 (잠금)' : '확정됨 (잠금)'}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedWorker.name} ({selectedWorker.department || '부서미지정'} /{' '}
                  {selectedWorker.position || '직급미지정'})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => handleOpenTaskModalForPayroll(activePayroll, selectedWorker)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition shadow-2xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    할 일로 추가
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedWorker(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Locked Notice (Requirement 5) */}
            {isModalLocked && (
              <div className="rounded-xl border border-slate-200 bg-slate-100/80 p-3 text-xs text-slate-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-500 shrink-0" />
                  <span>
                    본 급여는 <strong>{activePayroll?.status === 'PAID' ? '지급완료' : '급여확정'}</strong>되어 수정이 잠겨 있습니다. (읽기 전용 모드)
                  </span>
                </div>
                {activePayroll?.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWorker(null);
                      handleOpenCancelConfirmation(activePayroll?.id, false);
                    }}
                    className="rounded-lg bg-rose-600 text-white px-3 py-1 text-xs font-bold hover:bg-rose-700 transition"
                  >
                    확정 취소 후 수정
                  </button>
                )}
              </div>
            )}

            {/* Error Message */}
            {saveError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                {saveError}
              </div>
            )}

            {/* Requirement 3, 6, 7: Overtime Desync warning in worker modal */}
            {isOvertimeDesynced && (
              <div>
                {activePayroll?.status === 'CONFIRMED' ? (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-950">
                        확정된 급여의 추가근무 원본이 변경되었습니다.
                      </p>
                      <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                        본 근로자의 출근부 추가근무 기록이 최근 변경되었으나, 이미 급여가 확정되어 자동으로 급여액이 수정되지 않았습니다.
                        최신 근무시간을 반영하여 급여를 수정하시려면 상단의 <strong>[확정 취소 후 수정]</strong> 버튼을 눌러 DRAFT로 전환한 후 다시 불러오기를 실행하세요.
                      </p>
                    </div>
                  </div>
                ) : activePayroll?.status === 'PAID' ? (
                  <div className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-xs text-slate-800 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-900">
                        확정된 급여의 추가근무 원본이 변경되었습니다.
                      </p>
                      <p className="text-[11px] text-slate-700 mt-0.5 leading-relaxed">
                        출근부 기록이 변경되었으나 본 급여는 이미 <strong>지급완료(PAID)</strong>되어 자동으로 수정되지 않으며 보호됩니다. (ADMIN 직접 확인 필요)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-950">
                        추가근무 기록이 변경되었습니다. 다시 불러오기가 필요합니다.
                      </p>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                        현재 작성중(DRAFT) 상태이므로, 급여대장 메인의 <strong>[추가근무 다시 불러오기]</strong> 버튼을 통해 최신 근무시간과 가산 수당을 바로 반영할 수 있습니다.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 출근부 추가근무 연계 및 통상시급 카드 */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                  <Clock className="h-4 w-4 text-indigo-600" />
                  출근부 추가근무 연계 (가산 1.5배율 기준)
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-indigo-900">
                  <span>
                    연장근무: <strong>{modalOvertimeHours}</strong>시간
                  </span>
                  <span>
                    휴무일근무: <strong>{modalHolidayWorkHours}</strong>시간
                  </span>
                </div>
              </div>

              {/* 통상시급 입력 및 계산 바 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-indigo-100">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">통상시급:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="10"
                      disabled={isModalLocked}
                      value={modalHourlyWage || ''}
                      placeholder="시급 미설정"
                      onChange={(e) =>
                        setModalHourlyWage(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                      }
                      className="w-28 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-right text-xs font-mono font-bold text-indigo-950 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <span className="text-slate-500 font-sans">원/시간</span>
                  </div>
                </div>

                {!isModalLocked && (
                  <button
                    type="button"
                    onClick={handleApplyOvertimeMultipliersInModal}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                  >
                    <Calculator className="h-3.5 w-3.5" />
                    1.5배율 가산 수당 적용
                  </button>
                )}
              </div>
            </div>

            {/* Pay & Deduction Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 지급 항목 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-indigo-900">지급 항목 (과세/비과세)</span>
                  <span className="text-xs font-bold text-indigo-700 font-mono">
                    {modalTotalPay.toLocaleString()}원
                  </span>
                </div>

                <div className="space-y-2">
                  {payItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-xs bg-white p-2 rounded-lg border border-slate-200"
                    >
                      <input
                        type="text"
                        disabled={isModalLocked}
                        value={item.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPayItems(
                            payItems.map((pi, i) => (i === idx ? { ...pi, name: val } : pi))
                          );
                        }}
                        className="font-medium text-slate-700 focus:outline-none flex-1 truncate bg-transparent disabled:text-slate-500"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="100"
                          disabled={isModalLocked}
                          value={item.amount || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setPayItems(
                              payItems.map((pi, i) => (i === idx ? { ...pi, amount: val } : pi))
                            );
                          }}
                          className="w-28 rounded-md border border-slate-200 px-2 py-1 text-right text-xs font-mono font-medium focus:border-slate-800 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        />
                        <span className="text-slate-400 text-[11px]">원</span>
                        {!isModalLocked && !STANDARD_PAY_ITEMS.some((s) => s.name === item.name) && (
                          <button
                            type="button"
                            onClick={() => handleRemovePayItem(idx)}
                            className="text-slate-400 hover:text-rose-500 p-0.5 ml-1"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!isModalLocked && (
                  <button
                    type="button"
                    onClick={handleAddPayItem}
                    className="w-full py-1.5 border border-dashed border-slate-300 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-white hover:border-slate-400 transition flex items-center justify-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    지급 항목 추가
                  </button>
                )}
              </div>

              {/* 공제 항목 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-rose-900">공제 항목 (4대보험/세액)</span>
                  <span className="text-xs font-bold text-rose-700 font-mono">
                    -{modalTotalDeduction.toLocaleString()}원
                  </span>
                </div>

                <div className="space-y-2">
                  {deductionItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-xs bg-white p-2 rounded-lg border border-slate-200"
                    >
                      <input
                        type="text"
                        disabled={isModalLocked}
                        value={item.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDeductionItems(
                            deductionItems.map((di, i) => (i === idx ? { ...di, name: val } : di))
                          );
                        }}
                        className="font-medium text-slate-700 focus:outline-none flex-1 truncate bg-transparent disabled:text-slate-500"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="10"
                          disabled={isModalLocked}
                          value={item.amount || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setDeductionItems(
                              deductionItems.map((di, i) =>
                                i === idx ? { ...di, amount: val } : di
                              )
                            );
                          }}
                          className="w-28 rounded-md border border-slate-200 px-2 py-1 text-right text-xs font-mono font-medium text-rose-700 focus:border-slate-800 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        />
                        <span className="text-slate-400 text-[11px]">원</span>
                        {!isModalLocked && !STANDARD_DEDUCTION_ITEMS.some((s) => s.name === item.name) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDeductionItem(idx)}
                            className="text-slate-400 hover:text-rose-500 p-0.5 ml-1"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!isModalLocked && (
                  <button
                    type="button"
                    onClick={handleAddDeductionItem}
                    className="w-full py-1.5 border border-dashed border-slate-300 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-white hover:border-slate-400 transition flex items-center justify-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    공제 항목 추가
                  </button>
                )}
              </div>
            </div>

            {/* Summary Bar */}
            <div className="rounded-xl bg-slate-900 p-4 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400">차인지급액 (실수령액)</span>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {modalNetPay.toLocaleString()}원
                </div>
              </div>
              <div className="text-right text-xs text-slate-400 space-y-1 font-mono">
                <div>지급총액: +{modalTotalPay.toLocaleString()}원</div>
                <div className="text-rose-400">공제총액: -{modalTotalDeduction.toLocaleString()}원</div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Printer className="h-4 w-4" />
                  명세서 미리보기
                </button>
                {role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => handleOpenTaskModalForPayroll(activePayroll, selectedWorker)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    할 일로 추가
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedWorker(null)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  닫기
                </button>

                {!isModalLocked && (
                  <>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSavePayroll('DRAFT')}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                    >
                      임시저장
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSavePayroll('CONFIRMED')}
                      className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isSaving ? '저장 중...' : '급여 확정'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. Requirement 7 & 12: Printable Payslip Modal */}
      {isPrintModalOpen && selectedWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-sm">
                  9
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">
                    {belongingYearMonth} 귀속 전자 급여명세서
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    근로기준법 제48조에 따른 전자 임금명세서
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Employee & Company Info (Requirement 7: NO full RRN) */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <div>
                  <span className="text-slate-500">성명:</span>{' '}
                  <strong className="text-slate-900">{selectedWorker.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500">사번/식별자:</span>{' '}
                  <span className="font-mono text-slate-700">{selectedWorker.id}</span>
                </div>
                <div>
                  <span className="text-slate-500">부서 / 직책:</span>{' '}
                  <span className="text-slate-700">
                    {selectedWorker.department || '-'} / {selectedWorker.position || '-'}
                  </span>
                </div>
              </div>
              <div className="space-y-1 text-right">
                <div>
                  <span className="text-slate-500">소속 회사:</span>{' '}
                  <strong className="text-slate-900">
                    {selectedCompany?.companyName || '소속 회사'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">귀속연월:</span>{' '}
                  <strong className="font-mono text-slate-900">{belongingYearMonth}</strong>
                </div>
                <div>
                  <span className="text-slate-500">지급일:</span>{' '}
                  <span className="font-mono text-slate-700">
                    {activePayroll?.paymentDate || `${belongingYearMonth}-25`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">발행 위탁: 노무법인 나인</div>
              </div>
            </div>

            {/* Breakdown table */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              <div>
                <h4 className="font-bold border-b border-slate-200 pb-1.5 mb-2 text-indigo-950 flex items-center justify-between">
                  <span>지급 항목</span>
                  <span className="text-[11px] font-normal text-slate-400">금액 (원)</span>
                </h4>
                <div className="space-y-1.5">
                  {payItems.map((p) => (
                    <div key={p.id} className="flex justify-between">
                      <span className="text-slate-600">{p.name}</span>
                      <span className="font-mono font-medium">{p.amount.toLocaleString()}원</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-200 pt-2 font-bold flex justify-between text-indigo-900 text-sm">
                    <span>지급 합계</span>
                    <span className="font-mono">{modalTotalPay.toLocaleString()}원</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold border-b border-slate-200 pb-1.5 mb-2 text-rose-900 flex items-center justify-between">
                  <span>공제 항목</span>
                  <span className="text-[11px] font-normal text-slate-400">금액 (원)</span>
                </h4>
                <div className="space-y-1.5">
                  {deductionItems.map((d) => (
                    <div key={d.id} className="flex justify-between">
                      <span className="text-slate-600">{d.name}</span>
                      <span className="font-mono text-rose-600">
                        {d.amount.toLocaleString()}원
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-slate-200 pt-2 font-bold flex justify-between text-rose-700 text-sm">
                    <span>공제 합계</span>
                    <span className="font-mono">
                      -{modalTotalDeduction.toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Total */}
            <div className="border-t border-slate-200 pt-4 flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl">
              <div>
                <span className="text-[11px] text-slate-400">실지급액 (차인지급액)</span>
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {modalNetPay.toLocaleString()}원
                </div>
              </div>
              <div className="text-right text-xs text-slate-400 space-y-0.5">
                <div>지급총액: +{modalTotalPay.toLocaleString()}원</div>
                <div className="text-rose-400">
                  공제총액: -{modalTotalDeduction.toLocaleString()}원
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
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

      {/* Task Creation from Payroll Modal (R3-3 3/3-B) */}
      {taskModalSource && isTaskModalOpen && (
        <CreateTaskFromSourceModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setTaskModalSource(null);
          }}
          sourceType={taskModalSource.sourceType}
          sourceId={taskModalSource.sourceId}
          sourceTitle={taskModalSource.sourceTitle}
          companyId={taskModalSource.companyId}
          workerId={taskModalSource.workerId}
          defaultTitle={taskModalSource.defaultTitle}
          defaultDescription={taskModalSource.defaultDescription}
          defaultDueDate={taskModalSource.defaultDueDate}
          initialCompanies={companies}
          initialWorkers={workers}
          onTaskCreated={() => {
            setSaveSuccessMsg('급여 업무가 할 일로 성공적으로 등록되었습니다.');
            setTimeout(() => setSaveSuccessMsg(null), 3500);
          }}
          onNavigateToSource={onNavigateToSource}
        />
      )}
    </div>
  );
};
