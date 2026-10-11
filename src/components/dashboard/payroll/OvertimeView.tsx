import React, { useEffect, useState, useMemo } from 'react';
import {
  Company,
  OvertimeRecord,
  OvertimeWorkType,
  UserRole,
  Worker,
} from '../../../types';
import { overtimeService } from '../../../services/overtimeService';
import { firmService } from '../../../services/firmService';
import { useAuth } from '../../../contexts/AuthContext';
import { auditLogService } from '../../../services/auditLogService';
import {
  generateOvertimeCsvTemplate,
  parseOvertimeCsv,
  ParsedOvertimeCsvRow,
} from '../../../utils/csvOvertimeHelper';
import {
  Clock,
  Plus,
  Calendar,
  Building2,
  Users,
  Search,
  Trash2,
  Edit2,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Filter,
  Table,
  FileSpreadsheet,
  Download,
  Upload,
  ListPlus,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowDownToLine,
  FileText,
} from 'lucide-react';

interface OvertimeViewProps {
  role: UserRole;
  companyId?: string;
  employeeId?: string;
  title?: string;
  description?: string;
}

export interface BatchRow {
  tempId: string;
  employeeId: string;
  workDate: string;
  workType: OvertimeWorkType;
  hours: number | string;
  memo: string;
}

export interface BatchValidationError {
  rowIndex: number;
  field?: string;
  message: string;
}

// Requirement 3: Extensible work types definition (OVERTIME: 연장근무, HOLIDAY: 휴일근무)
export const OVERTIME_WORK_TYPES: {
  value: OvertimeWorkType;
  label: string;
  badgeClass: string;
  description: string;
}[] = [
  {
    value: 'OVERTIME',
    label: '연장근무',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    description: '법정 기준 근로시간 초과 근무 (통상시급 × 1.5 가산)',
  },
  {
    value: 'HOLIDAY',
    label: '휴일근무',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    description: '주휴일 또는 약정 휴일 근무 (통상시급 × 1.5 가산)',
  },
];

export const OvertimeView: React.FC<OvertimeViewProps> = ({
  role,
  companyId,
  employeeId,
  title,
  description,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Requirement 3: Strictly match employeeId for WORKER, never by name
  const workerEffectiveEmployeeId = useMemo(() => {
    if (role !== 'WORKER') return null;
    return employeeId || userProfile?.employeeId || currentUser?.uid || null;
  }, [role, employeeId, userProfile?.employeeId, currentUser?.uid]);

  // 1. Company Selection & Belonging Month (Requirement 1)
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companyId || '');
  const [belongingYearMonth, setBelongingYearMonth] = useState<string>('2026-10');

  // 2. Data State (strictly isolated by companyId + belongingYearMonth)
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 3. Filters (Requirement 6)
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('ALL');
  const [filterWorkType, setFilterWorkType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 4. Modal State (Create & Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<OvertimeRecord | null>(null);

  // Form Fields
  const [formEmployeeId, setFormEmployeeId] = useState<string>('');
  const [formWorkDate, setFormWorkDate] = useState<string>('2026-10-15');
  const [formWorkType, setFormWorkType] = useState<OvertimeWorkType>('OVERTIME');
  const [formHours, setFormHours] = useState<number>(2);
  const [formMemo, setFormMemo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Requirement 5 & 6: Duplicate Record Detection & Confirmation States
  const [duplicateWarning, setDuplicateWarning] = useState<{
    record: OvertimeRecord;
    message: string;
  } | null>(null);
  const [confirmDuplicateOverride, setConfirmDuplicateOverride] = useState<boolean>(false);

  // Requirement 1 & 2: Batch Input State (일괄 입력)
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [batchValidationErrors, setBatchValidationErrors] = useState<BatchValidationError[]>([]);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  // Requirement 3 & 4: CSV/XLSX Upload State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvParsedRows, setCsvParsedRows] = useState<ParsedOvertimeCsvRow[]>([]);
  const [csvNotice, setCsvNotice] = useState<{
    type: 'info' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Requirement 5 & 6: Monthly Summary & Worker Totals Display State
  const [isMonthlySummaryExpanded, setIsMonthlySummaryExpanded] = useState(true);
  const [workerSummaryOnlyOvertime, setWorkerSummaryOnlyOvertime] = useState(false);

  // Requirement 1: Min and Max date bounds for current belongingYearMonth
  const { minDate, maxDate } = useMemo(() => {
    if (!belongingYearMonth) return { minDate: '', maxDate: '' };
    const [y, m] = belongingYearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      minDate: `${belongingYearMonth}-01`,
      maxDate: `${belongingYearMonth}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [belongingYearMonth]);

  // Load Companies for ADMIN
  useEffect(() => {
    let isMounted = true;
    const loadCompanies = async () => {
      try {
        if (role === 'ADMIN') {
          const list = await firmService.getAllCompanies();
          if (!isMounted) return;
          setCompanies(list);
          if (!selectedCompanyId && list.length > 0) {
            setSelectedCompanyId(list[0].id);
          }
        } else if (companyId) {
          setSelectedCompanyId(companyId);
        } else if (userProfile?.companyId) {
          setSelectedCompanyId(userProfile.companyId);
        }
      } catch (err) {
        console.error('Failed to load companies for overtime', err);
      }
    };
    loadCompanies();
    return () => {
      isMounted = false;
    };
  }, [role, companyId, userProfile?.companyId]);

  // Load Overtime Records & Company Workers (Strict isolation by companyId + belongingYearMonth + employeeId for WORKER)
  const fetchRecords = async () => {
    if (!selectedCompanyId) return;
    try {
      setLoading(true);
      setFeedbackMsg(null);

      if (role === 'WORKER') {
        if (!workerEffectiveEmployeeId) {
          setRecords([]);
          setWorkers([]);
          return;
        }
        const workerRecords = await overtimeService.getOvertimeByEmployee(
          selectedCompanyId,
          workerEffectiveEmployeeId,
          belongingYearMonth
        );
        const isolated = workerRecords.filter(
          (r) =>
            r.companyId === selectedCompanyId &&
            r.employeeId === workerEffectiveEmployeeId &&
            r.belongingYearMonth === belongingYearMonth
        );
        setRecords(isolated);
        setWorkers([]);
        return;
      }

      const [recordsList, workerList] = await Promise.all([
        overtimeService.getOvertimeByCompany(selectedCompanyId, belongingYearMonth),
        firmService.getWorkersByCompany(selectedCompanyId),
      ]);

      // Strict client-side isolation guarantee: enforce companyId match
      const isolatedRecords = recordsList.filter(
        (r) => r.companyId === selectedCompanyId && r.belongingYearMonth === belongingYearMonth
      );
      const isolatedWorkers = workerList.filter((w) => w.companyId === selectedCompanyId);

      setRecords(isolatedRecords);
      setWorkers(isolatedWorkers);
    } catch (err: any) {
      console.error('Failed to fetch overtime records', err);
      setFeedbackMsg({
        type: 'error',
        message: '추가근무 기록을 불러오는 중 오류가 발생했습니다.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedCompanyId, belongingYearMonth]);

  // Current Selected Company Details
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

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

  // Open Create Modal (Requirement 4)
  const handleOpenCreateModal = () => {
    setEditingRecord(null);
    setFormEmployeeId(workers.length > 0 ? workers[0].id : '');
    setFormWorkDate(`${belongingYearMonth}-15`);
    setFormWorkType('OVERTIME');
    setFormHours(2);
    setFormMemo('');
    setFormError(null);
    setDuplicateWarning(null);
    setConfirmDuplicateOverride(false);
    setIsModalOpen(true);
  };

  // Open Edit Modal (Requirement 4)
  const handleOpenEditModal = (rec: OvertimeRecord) => {
    setEditingRecord(rec);
    setFormEmployeeId(rec.employeeId);
    setFormWorkDate(rec.workDate);
    setFormWorkType(rec.workType);
    setFormHours(rec.hours);
    setFormMemo(rec.memo || rec.note || '');
    setFormError(null);
    setDuplicateWarning(null);
    setConfirmDuplicateOverride(false);
    setIsModalOpen(true);
  };

  // Save (Create or Edit) Record (Requirement 1, 2, 3, 4, 5, 6, 7)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedCompanyId) return;

    // 1. Employee selection validation (Requirement 4)
    if (!formEmployeeId) {
      setFormError('근로자를 선택해주세요.');
      return;
    }

    const matchedWorker = workers.find((w) => w.id === formEmployeeId);
    if (!matchedWorker || matchedWorker.companyId !== selectedCompanyId) {
      setFormError(
        `선택한 근로자는 현재 기업(${selectedCompany?.companyName || selectedCompanyId}) 소속이 아닙니다.`
      );
      return;
    }

    // 2. Date validation (Requirement 1: Strict month match between belongingYearMonth & workDate)
    if (!formWorkDate) {
      setFormError('근무 일자를 입력해주세요.');
      return;
    }

    const workDateMonth = formWorkDate.substring(0, 7);
    if (workDateMonth !== belongingYearMonth) {
      setFormError(
        `근무일자(${formWorkDate})가 현재 선택된 귀속연월(${belongingYearMonth})과 일치하지 않습니다. ${minDate} ~ ${maxDate} 사이의 날짜만 저장할 수 있습니다. (귀속연월을 workDate 기준으로 임의 변경하지 않습니다)`
      );
      return;
    }

    // 3. Hours validation (Requirement 2: Number, > 0, no NaN, no negative/zero)
    const parsedHours = Number(formHours);
    if (
      formHours === undefined ||
      formHours === null ||
      formHours === ('' as any) ||
      typeof parsedHours !== 'number' ||
      isNaN(parsedHours) ||
      parsedHours <= 0
    ) {
      setFormError(
        `근무시간은 0보다 큰 숫자여야 합니다. 0, 음수, 빈값, NaN 등은 저장이 불가합니다. (현재 입력값: ${formHours || '빈값'})`
      );
      return;
    }

    // 4. WorkType validation (Requirement 3: OVERTIME or HOLIDAY only)
    if (formWorkType !== 'OVERTIME' && formWorkType !== 'HOLIDAY') {
      setFormError('근무구분은 연장근무(OVERTIME) 또는 휴무일근무(HOLIDAY) 중 하나여야 합니다.');
      return;
    }

    // 5. Duplicate check (Requirement 5 & 6)
    // companyId + employeeId + workDate + workType
    const duplicate = await overtimeService.findDuplicateRecord({
      companyId: selectedCompanyId,
      employeeId: matchedWorker.id,
      workDate: formWorkDate,
      workType: formWorkType,
      excludeRecordId: editingRecord?.id,
    });

    if (duplicate && !confirmDuplicateOverride) {
      setDuplicateWarning({
        record: duplicate,
        message: '같은 근로자의 동일 날짜·근무구분 기록이 이미 있습니다.',
      });
      setFormError(
        '같은 근로자의 동일 날짜·근무구분 기록이 이미 등록되어 있습니다. 아래의 기존 등록 내역을 확인해 주세요.'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      if (editingRecord) {
        // Update existing record (Requirement 4)
        // Important: belongingYearMonth is kept strictly as belongingYearMonth
        await overtimeService.updateOvertimeRecord(
          editingRecord.id,
          {
            companyId: selectedCompanyId,
            employeeId: matchedWorker.id,
            employeeName: matchedWorker.name,
            department: matchedWorker.department,
            position: matchedWorker.position,
            workDate: formWorkDate,
            belongingYearMonth: belongingYearMonth,
            workType: formWorkType,
            hours: parsedHours,
            memo: formMemo.trim() || undefined,
            note: formMemo.trim() || undefined,
          },
          currentUser.uid,
          workers
        );

        // Audit Log
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '관리자',
          companyId: selectedCompanyId,
          action: 'OVERTIME_RECORD_UPDATED',
          resourceType: 'OVERTIME_RECORD',
          resourceId: editingRecord.id,
          details: {
            employeeId: matchedWorker.id,
            employeeName: matchedWorker.name,
            belongingYearMonth,
            workDate: formWorkDate,
            workType: formWorkType,
            hours: parsedHours,
          },
        });

        setFeedbackMsg({
          type: 'success',
          message: `${matchedWorker.name} 님의 추가근무 기록이 수정되었습니다.`,
        });
      } else {
        // Create new record (Requirement 4)
        // Important: belongingYearMonth is kept strictly as belongingYearMonth
        const created = await overtimeService.createOvertimeRecord(
          {
            companyId: selectedCompanyId,
            employeeId: matchedWorker.id,
            employeeName: matchedWorker.name,
            department: matchedWorker.department,
            position: matchedWorker.position,
            workDate: formWorkDate,
            belongingYearMonth: belongingYearMonth,
            workType: formWorkType,
            hours: parsedHours,
            memo: formMemo.trim() || undefined,
            note: formMemo.trim() || undefined,
            createdById: currentUser.uid,
            updatedById: currentUser.uid,
            authorId: currentUser.uid,
          },
          workers
        );

        // Audit Log
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '관리자',
          companyId: selectedCompanyId,
          action: 'OVERTIME_RECORD_CREATED',
          resourceType: 'OVERTIME_RECORD',
          resourceId: created.id,
          details: {
            employeeId: matchedWorker.id,
            employeeName: matchedWorker.name,
            belongingYearMonth,
            workDate: formWorkDate,
            workType: formWorkType,
            hours: parsedHours,
          },
        });

        setFeedbackMsg({
          type: 'success',
          message: `${matchedWorker.name} 님의 추가근무 기록이 등록되었습니다.`,
        });
      }

      setIsModalOpen(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
      await fetchRecords();
    } catch (err: any) {
      console.error('Failed to save overtime record', err);
      setFormError(err?.message || '추가근무 기록 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Record (Requirement 4 & 7)
  const handleDeleteRecord = async (rec: OvertimeRecord) => {
    if (
      !window.confirm(
        `${rec.employeeName} 님의 ${rec.workDate} 추가근무 기록(${rec.hours}시간)을 삭제하시겠습니까?`
      )
    ) {
      return;
    }

    try {
      await overtimeService.deleteOvertimeRecord(rec.id);

      if (currentUser) {
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '관리자',
          companyId: selectedCompanyId,
          action: 'OVERTIME_RECORD_DELETED',
          resourceType: 'OVERTIME_RECORD',
          resourceId: rec.id,
          details: {
            employeeId: rec.employeeId,
            employeeName: rec.employeeName,
            belongingYearMonth: rec.belongingYearMonth,
            workDate: rec.workDate,
            workType: rec.workType,
            hours: rec.hours,
          },
        });
      }

      setFeedbackMsg({
        type: 'success',
        message: '추가근무 기록이 삭제되었습니다.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      await fetchRecords();
    } catch (err: any) {
      console.error('Failed to delete overtime record', err);
      alert('추가근무 기록 삭제 중 오류가 발생했습니다.');
    }
  };

  // Filtered Records (Requirement 5 & 6)
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // 1. Specific Employee Filter (Requirement 3 & 6: WORKER is strictly isolated to their own employeeId)
      if (role === 'WORKER') {
        if (workerEffectiveEmployeeId && rec.employeeId !== workerEffectiveEmployeeId) {
          return false;
        }
      } else if (filterEmployeeId !== 'ALL' && rec.employeeId !== filterEmployeeId) {
        return false;
      }

      // 2. Work Type Filter
      if (filterWorkType !== 'ALL' && rec.workType !== filterWorkType) {
        return false;
      }

      // 3. Search Query (Worker Name, ID, Department, Position, Memo)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = rec.employeeName?.toLowerCase().includes(query);
        const matchId = rec.employeeId?.toLowerCase().includes(query);
        const matchDept = rec.department?.toLowerCase().includes(query);
        const matchPos = rec.position?.toLowerCase().includes(query);
        const matchMemo = (rec.memo || rec.note)?.toLowerCase().includes(query);

        if (!matchName && !matchId && !matchDept && !matchPos && !matchMemo) {
          return false;
        }
      }

      return true;
    });
  }, [records, filterEmployeeId, filterWorkType, searchQuery]);

  // Aggregate Totals
  const totals = useMemo(() => {
    let totalOvertimeHours = 0;
    let totalHolidayHours = 0;
    const workerSet = new Set<string>();

    filteredRecords.forEach((r) => {
      workerSet.add(r.employeeId);
      if (r.workType === 'OVERTIME') {
        totalOvertimeHours += r.hours;
      } else if (r.workType === 'HOLIDAY') {
        totalHolidayHours += r.hours;
      }
    });

    return {
      totalRecords: filteredRecords.length,
      workerCount: workerSet.size,
      totalOvertimeHours,
      totalHolidayHours,
      grandTotalHours: totalOvertimeHours + totalHolidayHours,
    };
  }, [filteredRecords]);

  // Requirement 5: Monthly overall summary for current company & belongingYearMonth
  const monthlySummary = useMemo(() => {
    let totalOvertimeHours = 0;
    let totalHolidayHours = 0;
    const workerSet = new Set<string>();

    records.forEach((r) => {
      workerSet.add(r.employeeId);
      if (r.workType === 'OVERTIME') {
        totalOvertimeHours += r.hours;
      } else if (r.workType === 'HOLIDAY') {
        totalHolidayHours += r.hours;
      }
    });

    return {
      recordedWorkerCount: workerSet.size,
      totalRegisteredWorkers: workers.length,
      totalRecordCount: records.length,
      totalOvertimeHours,
      totalHolidayHours,
      grandTotalHours: totalOvertimeHours + totalHolidayHours,
    };
  }, [records, workers]);

  // Requirement 6: Worker monthly totals (근로자별 연장/휴무일/총합계 현황)
  const workerMonthlySummaries = useMemo(() => {
    return workers
      .map((worker) => {
        const workerRecords = records.filter((r) => r.employeeId === worker.id);
        let overtimeHours = 0;
        let holidayHours = 0;

        workerRecords.forEach((r) => {
          if (r.workType === 'OVERTIME') overtimeHours += r.hours;
          else if (r.workType === 'HOLIDAY') holidayHours += r.hours;
        });

        return {
          worker,
          recordCount: workerRecords.length,
          overtimeHours,
          holidayHours,
          totalHours: overtimeHours + holidayHours,
        };
      })
      .sort((a, b) => {
        if (b.totalHours !== a.totalHours) {
          return b.totalHours - a.totalHours;
        }
        return a.worker.name.localeCompare(b.worker.name);
      });
  }, [workers, records]);

  const workersWithOvertimeCount = useMemo(() => {
    return workerMonthlySummaries.filter((ws) => ws.totalHours > 0).length;
  }, [workerMonthlySummaries]);

  const displayedWorkerSummaries = useMemo(() => {
    if (workerSummaryOnlyOvertime) {
      return workerMonthlySummaries.filter((ws) => ws.totalHours > 0);
    }
    return workerMonthlySummaries;
  }, [workerMonthlySummaries, workerSummaryOnlyOvertime]);

  // Requirement 1 & 2: Batch Input Handlers
  const handleOpenBatchModal = () => {
    const initialRows: BatchRow[] = [];
    const count = Math.min(5, Math.max(3, workers.length));
    for (let i = 0; i < count; i++) {
      initialRows.push({
        tempId: `batch_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        employeeId: workers[i % (workers.length || 1)]?.id || '',
        workDate: `${belongingYearMonth}-15`,
        workType: 'OVERTIME',
        hours: 2,
        memo: '',
      });
    }
    setBatchRows(initialRows);
    setBatchValidationErrors([]);
    setShowBatchConfirm(false);
    setIsBatchModalOpen(true);
  };

  const handleAddBatchRow = () => {
    setBatchRows((prev) => [
      ...prev,
      {
        tempId: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        employeeId: workers[0]?.id || '',
        workDate: `${belongingYearMonth}-15`,
        workType: 'OVERTIME',
        hours: 2,
        memo: '',
      },
    ]);
  };

  const handleAddBatchRows = (count: number) => {
    const newRows: BatchRow[] = [];
    for (let i = 0; i < count; i++) {
      newRows.push({
        tempId: `batch_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        employeeId: workers[i % (workers.length || 1)]?.id || '',
        workDate: `${belongingYearMonth}-15`,
        workType: 'OVERTIME',
        hours: 2,
        memo: '',
      });
    }
    setBatchRows((prev) => [...prev, ...newRows]);
  };

  const handleAddAllWorkersBatchRows = () => {
    const newRows: BatchRow[] = workers.map((w, idx) => ({
      tempId: `batch_all_${Date.now()}_${idx}_${w.id}`,
      employeeId: w.id,
      workDate: `${belongingYearMonth}-15`,
      workType: 'OVERTIME',
      hours: 2,
      memo: '',
    }));
    setBatchRows((prev) => [...prev, ...newRows]);
  };

  const handleRemoveBatchRow = (tempId: string) => {
    setBatchRows((prev) => prev.filter((r) => r.tempId !== tempId));
    setBatchValidationErrors([]);
  };

  const handleBatchFieldChange = (tempId: string, field: keyof BatchRow, value: any) => {
    setBatchRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r))
    );
    setBatchValidationErrors([]);
  };

  // Requirement 2: Strict Batch Validation with Row Index Indicators
  const validateBatchRows = (): { isValid: boolean; errors: BatchValidationError[] } => {
    const errors: BatchValidationError[] = [];
    if (batchRows.length === 0) {
      errors.push({
        rowIndex: 0,
        message: '입력할 추가근무 행이 없습니다. [행 추가] 버튼을 눌러주세요.',
      });
      return { isValid: false, errors };
    }

    if (batchRows.length > 200) {
      errors.push({ rowIndex: 0, message: '일괄 저장은 최대 200행까지 가능합니다. 입력 행을 나누어 저장해주세요.' });
      return { isValid: false, errors };
    }

    const seenInBatch = new Set<string>();

    batchRows.forEach((row, idx) => {
      const rowNum = idx + 1;

      // 1. Employee Check & Affiliation
      if (!row.employeeId || row.employeeId.trim() === '') {
        errors.push({
          rowIndex: rowNum,
          field: 'employeeId',
          message: `${rowNum}행: 근로자를 선택해주세요.`,
        });
      } else {
        const matched = workers.find((w) => w.id === row.employeeId);
        if (!matched || matched.companyId !== selectedCompanyId) {
          errors.push({
            rowIndex: rowNum,
            field: 'employeeId',
            message: `${rowNum}행: 선택한 근로자는 현재 회사 소속이 아닙니다.`,
          });
        }
      }

      // 2. Work Date Format & Month Match
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!row.workDate || !dateRegex.test(row.workDate)) {
        errors.push({
          rowIndex: rowNum,
          field: 'workDate',
          message: `${rowNum}행: 근무일자는 YYYY-MM-DD 형식이어야 합니다.`,
        });
      } else {
        const parsed = new Date(row.workDate);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== row.workDate) {
          errors.push({
            rowIndex: rowNum,
            field: 'workDate',
            message: `${rowNum}행: 유효한 날짜가 아닙니다.`,
          });
        } else {
          const derivedMonth = row.workDate.substring(0, 7);
          if (derivedMonth !== belongingYearMonth) {
            errors.push({
              rowIndex: rowNum,
              field: 'workDate',
              message: `${rowNum}행: 근무일자(${row.workDate})의 연월이 귀속연월(${belongingYearMonth})과 일치하지 않습니다.`,
            });
          }
        }
      }

      // 3. Work Type Check
      if (row.workType !== 'OVERTIME' && row.workType !== 'HOLIDAY') {
        errors.push({
          rowIndex: rowNum,
          field: 'workType',
          message: `${rowNum}행: 근무구분은 연장근무(OVERTIME) 또는 휴무일근무(HOLIDAY)여야 합니다.`,
        });
      }

      // 4. Hours Check (positive number)
      const numHours = typeof row.hours === 'string' && row.hours.trim() !== '' ? Number(row.hours) : row.hours;
      if (typeof numHours !== 'number' || !Number.isFinite(numHours) || numHours <= 0) {
        errors.push({
          rowIndex: rowNum,
          field: 'hours',
          message: `${rowNum}행: 근무시간은 0보다 큰 양수여야 합니다.`,
        });
      }

      // 5. Duplicate Check (within batch and against existing DB records)
      if (row.employeeId && row.workDate && row.workType) {
        const batchKey = `${row.employeeId}_${row.workDate}_${row.workType}`;
        if (seenInBatch.has(batchKey)) {
          const matchedWorker = workers.find((w) => w.id === row.employeeId);
          errors.push({
            rowIndex: rowNum,
            field: 'duplicate',
            message: `${rowNum}행: [${matchedWorker?.name || row.employeeId}] ${row.workDate} ${
              row.workType === 'OVERTIME' ? '연장근무' : '휴무일근무'
            }는 입력표 내 다른 행과 중복됩니다.`,
          });
        }
        seenInBatch.add(batchKey);

        const existingDup = records.find(
          (r) =>
            r.employeeId === row.employeeId &&
            r.workDate === row.workDate &&
            r.workType === row.workType
        );
        if (existingDup) {
          const matchedWorker = workers.find((w) => w.id === row.employeeId);
          errors.push({
            rowIndex: rowNum,
            field: 'duplicate',
            message: `${rowNum}행: [${matchedWorker?.name || row.employeeId}] ${row.workDate} ${
              row.workType === 'OVERTIME' ? '연장근무' : '휴무일근무'
            }는 이미 출근부에 등록된 기록입니다. (중복 불가)`,
          });
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  // Requirement 2: Execute Batch Save (Save all only when completely valid)
  const handleExecuteBatchSave = async () => {
    if (!currentUser || !selectedCompanyId) return;

    const validation = validateBatchRows();
    if (!validation.isValid) {
      setBatchValidationErrors(validation.errors);
      setShowBatchConfirm(false);
      return;
    }

    try {
      setIsBatchSubmitting(true);

      const recordsToCreate = batchRows.map((row) => {
        const matchedWorker = workers.find((w) => w.id === row.employeeId);
        const parsedHours = typeof row.hours === 'string' ? Number(row.hours) : row.hours;

        return {
          companyId: selectedCompanyId,
          employeeId: row.employeeId,
          employeeName: matchedWorker?.name || '근로자',
          department: matchedWorker?.department,
          position: matchedWorker?.position,
          workDate: row.workDate,
          belongingYearMonth: belongingYearMonth,
          workType: row.workType,
          hours: parsedHours,
          memo: row.memo.trim() || undefined,
          note: row.memo.trim() || undefined,
          createdById: currentUser.uid,
          updatedById: currentUser.uid,
          authorId: currentUser.uid,
        };
      });

      const result = await overtimeService.batchCreateOvertimeRecords(
        recordsToCreate,
        currentUser.uid,
        workers
      );

      // Audit Log for batch creation
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: role,
        actorName: userProfile?.displayName || '관리자',
        companyId: selectedCompanyId,
        action: 'OVERTIME_RECORD_CREATED',
        resourceType: 'OVERTIME_RECORD_BATCH',
        resourceId: `batch_${Date.now()}`,
        details: {
          companyId: selectedCompanyId,
          belongingYearMonth,
          createdCount: result.createdCount,
          totalHours: recordsToCreate.reduce((sum, r) => sum + r.hours, 0),
        },
      });

      setFeedbackMsg({
        type: 'success',
        message: `${result.createdCount}건의 추가근무 기록이 일괄 등록되었습니다. (급여 재동기화 필요 감지됨)`,
      });
      setTimeout(() => setFeedbackMsg(null), 5000);

      setIsBatchModalOpen(false);
      setShowBatchConfirm(false);
      await fetchRecords();
    } catch (err: any) {
      console.error('Failed to batch save overtime records', err);
      alert(err?.message || '일괄 저장 중 오류가 발생했습니다.');
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  // Requirement 3 & 4: CSV/XLSX Modal and Parsing Handlers
  const handleOpenCsvModal = () => {
    setCsvParsedRows([]);
    setCsvNotice(null);
    setIsCsvModalOpen(true);
  };

  const handleDownloadCsvTemplate = () => {
    const csvContent = generateOvertimeCsvTemplate(workers, belongingYearMonth);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `출근부_추가근무_서식_${belongingYearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Requirement 4: Explicit notice for XLSX files
    const filename = file.name.toLowerCase();
    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      setCsvNotice({
        type: 'warning',
        message:
          'XLSX 파일 가져오기 기능 준비중입니다. 현재 프로젝트는 표준 CSV(.csv) 파일을 지원하오니, [표준 CSV 서식 다운로드]를 통해 CSV 파일로 저장 후 업로드해주세요.',
      });
      e.target.value = '';
      return;
    }

    if (!filename.endsWith('.csv')) {
      setCsvNotice({
        type: 'error',
        message: '지원하지 않는 파일 형식입니다. .csv 확장자의 파일을 선택해주세요.',
      });
      e.target.value = '';
      return;
    }

    setCsvNotice(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setCsvNotice({ type: 'error', message: '파일 내용이 비어 있습니다.' });
        return;
      }

      try {
        const result = parseOvertimeCsv(text, workers, belongingYearMonth);
        setCsvParsedRows(result.rows);
        if (result.rows.length === 0) {
          setCsvNotice({
            type: 'warning',
            message: 'CSV 파일에서 유효한 데이터 행을 찾을 수 없습니다.',
          });
        } else if (result.needsReviewCount > 0) {
          setCsvNotice({
            type: 'warning',
            message: `총 ${result.totalRows}건 중 ${result.matchedCount}건 정상 매칭 완료, ${result.needsReviewCount}건은 고유 식별자(사번) 미일치로 검토가 필요합니다.`,
          });
        } else {
          setCsvNotice({
            type: 'info',
            message: `총 ${result.totalRows}건의 모든 행이 회사 소속 근로자 사번과 정상 매칭되었습니다.`,
          });
        }
      } catch (err: any) {
        setCsvNotice({
          type: 'error',
          message: `CSV 파일 파싱 중 오류가 발생했습니다: ${err?.message || ''}`,
        });
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleUpdateParsedRowWorker = (rowIndex: number, workerId: string) => {
    const matched = workers.find((w) => w.id === workerId);
    setCsvParsedRows((prev) =>
      prev.map((r) =>
        r.rawRowIndex === rowIndex
          ? {
              ...r,
              employeeId: workerId,
              employeeName: matched?.name || r.employeeName,
              matchStatus: matched ? 'MATCHED' : 'NEEDS_REVIEW',
              matchError: matched ? undefined : '근로자를 선택해주세요.',
              matchedWorker: matched,
            }
          : r
      )
    );
  };

  const handleRemoveParsedRow = (rowIndex: number) => {
    setCsvParsedRows((prev) => prev.filter((r) => r.rawRowIndex !== rowIndex));
  };

  // Transfer matched CSV rows into Batch Input table
  const handleTransferCsvToBatch = () => {
    const validRows = csvParsedRows.filter((r) => r.matchStatus === 'MATCHED');
    if (validRows.length === 0) {
      alert('정상 매칭된 행이 없습니다. 검토 필요 행의 사번/근로자를 지정해주세요.');
      return;
    }

    const newBatchRows: BatchRow[] = validRows.map((r, idx) => ({
      tempId: `csv_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      employeeId: r.employeeId,
      workDate: r.workDate,
      workType: r.workType,
      hours: r.hours,
      memo: r.memo || '',
    }));

    setBatchRows(newBatchRows);
    setBatchValidationErrors([]);
    setShowBatchConfirm(false);
    setIsCsvModalOpen(false);
    setIsBatchModalOpen(true);
    setFeedbackMsg({
      type: 'success',
      message: `CSV에서 ${newBatchRows.length}건을 일괄 입력표로 가져왔습니다. 내용을 검토한 뒤 저장하세요.`,
    });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Batch Calculation Memos (Requirement 1, 2, 5)
  const batchTotals = useMemo(() => {
    let otHours = 0;
    let holHours = 0;
    batchRows.forEach((r) => {
      const h = typeof r.hours === 'string' ? parseFloat(r.hours) || 0 : r.hours || 0;
      if (r.workType === 'OVERTIME') otHours += h;
      else if (r.workType === 'HOLIDAY') holHours += h;
    });
    return {
      otHours,
      holHours,
      totalHours: otHours + holHours,
    };
  }, [batchRows]);

  const batchErrorsByRow = useMemo(() => {
    const map = new Map<number, BatchValidationError[]>();
    batchValidationErrors.forEach((err) => {
      const list = map.get(err.rowIndex) || [];
      list.push(err);
      map.set(err.rowIndex, list);
    });
    return map;
  }, [batchValidationErrors]);

  const handleInitiateBatchSave = () => {
    const validation = validateBatchRows();
    if (!validation.isValid) {
      setBatchValidationErrors(validation.errors);
      setShowBatchConfirm(false);
      return;
    }
    setBatchValidationErrors([]);
    setShowBatchConfirm(true);
  };

  const csvMatchedCount = useMemo(() => {
    return csvParsedRows.filter((r) => r.matchStatus === 'MATCHED').length;
  }, [csvParsedRows]);

  const csvNeedsReviewCount = useMemo(() => {
    return csvParsedRows.filter((r) => r.matchStatus === 'NEEDS_REVIEW').length;
  }, [csvParsedRows]);

  // Helper to get work type label and badge
  const getWorkTypeMeta = (type: OvertimeWorkType) => {
    const found = OVERTIME_WORK_TYPES.find((w) => w.value === type);
    if (found) return found;
    return {
      value: type,
      label: type,
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      description: '기타 근무',
    };
  };

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
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
            <Clock className="h-6 w-6 text-slate-700" />
            {title || (role === 'COMPANY' ? '근태·추가근무' : '추가근무 출근부')}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {description || '기업별 귀속연월 추가근무(연장·휴무일근무) 실적을 등록 및 관리하며, 급여관리(1.5배 가산)와 직접 연계됩니다.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* CSV/XLSX 파일 가져오기 (Requirement 1 & 5: ADMIN 전용 기능) */}
          {role === 'ADMIN' && (
            <button
              type="button"
              onClick={handleOpenCsvModal}
              disabled={!selectedCompanyId || workers.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs disabled:opacity-50"
              title="CSV 파일 업로드 및 XLSX 연동 (관리자 전용)"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              CSV/XLSX 가져오기
            </button>
          )}

          {/* 일괄 입력 (Requirement 1 & 2: ADMIN, COMPANY 허용 / WORKER 금지) */}
          {role !== 'WORKER' && (
            <button
              type="button"
              onClick={handleOpenBatchModal}
              disabled={!selectedCompanyId || workers.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 transition shadow-2xs disabled:opacity-50"
              title="여러 근로자의 추가근무 기록을 표 형태로 연속 입력"
            >
              <Table className="h-4 w-4 text-indigo-600" />
              일괄 입력
            </button>
          )}

          <button
            type="button"
            onClick={fetchRecords}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            새로고침
          </button>

          {/* 개별 등록 (Requirement 1 & 2: ADMIN, COMPANY 허용 / WORKER 금지) */}
          {role !== 'WORKER' && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              disabled={!selectedCompanyId || workers.length === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              개별 등록
            </button>
          )}
        </div>
      </div>

      {/* Feedback Notification */}
      {feedbackMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center gap-2 ${
            feedbackMsg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          )}
          {feedbackMsg.message}
        </div>
      )}

      {/* 2. Requirement 5 & 6: 월별 요약 및 근로자별 월 합계 영역 (ADMIN 및 COMPANY 전용, WORKER 화면에서는 숨김) */}
      {role !== 'WORKER' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    {belongingYearMonth} 출근부 월별 요약 및 근로자별 월 합계
                  </h2>
                  <span className="rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 text-[10px] font-bold">
                    {selectedCompany?.companyName || '선택 기업'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  기업별 귀속연월 총 추가근무 실적 및 근로자 1인당 연장·휴무일 합계 현황입니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWorkerSummaryOnlyOvertime((prev) => !prev)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition ${
                  workerSummaryOnlyOvertime
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {workerSummaryOnlyOvertime
                  ? `추가근무 발생자만 표시 (${workersWithOvertimeCount}명)`
                  : `전체 근로자 표시 (${workers.length}명)`}
              </button>
              <button
                type="button"
                onClick={() => setIsMonthlySummaryExpanded((prev) => !prev)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                title={isMonthlySummaryExpanded ? '요약 접기' : '요약 펼치기'}
              >
                {isMonthlySummaryExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {isMonthlySummaryExpanded && (
            <div className="space-y-4">
              {/* Requirement 5: 월별 요약 핵심 영역 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">기록된 근로자 수</div>
                  <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                    {monthlySummary.recordedWorkerCount}
                    <span className="text-xs font-sans text-slate-500 font-normal"> / {workers.length}명</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">전체 기록 건수</div>
                  <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                    {monthlySummary.totalRecordCount}
                    <span className="text-xs font-sans text-slate-500 font-normal">건</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-amber-700">연장근무 총시간</div>
                  <div className="text-xl font-bold font-mono text-amber-700 mt-0.5">
                    {monthlySummary.totalOvertimeHours}
                    <span className="text-xs font-sans text-amber-600 font-normal">시간</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-purple-700">휴무일근무 총시간</div>
                  <div className="text-xl font-bold font-mono text-purple-700 mt-0.5">
                    {monthlySummary.totalHolidayHours}
                    <span className="text-xs font-sans text-purple-600 font-normal">시간</span>
                  </div>
                </div>
              </div>

              {/* Requirement 6: 근로자별 월 합계 영역 (예: 홍길동 연장 12시간 / 휴무일 8시간) */}
              <div>
                <div className="text-xs font-bold text-slate-700 mb-2.5 flex items-center justify-between">
                  <span>근로자별 월 누적 합계 ({displayedWorkerSummaries.length}명)</span>
                  {filterEmployeeId !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setFilterEmployeeId('ALL')}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      필터 해제 (전체 보기)
                    </button>
                  )}
                </div>

                {displayedWorkerSummaries.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
                    {workerSummaryOnlyOvertime
                      ? '해당 귀속월에 등록된 추가근무 발생 근로자가 없습니다.'
                      : '등록된 근로자가 없습니다.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-72 overflow-y-auto pr-1">
                    {displayedWorkerSummaries.map((item) => {
                      const isSelected = filterEmployeeId === item.worker.id;
                      return (
                        <div
                          key={item.worker.id}
                          className={`rounded-xl border p-3 transition space-y-2 ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-500'
                              : item.totalHours > 0
                              ? 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                              : 'border-slate-100 bg-slate-50/50 opacity-70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-900 truncate">
                                {item.worker.name}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono truncate">
                                {item.worker.id}
                                {item.worker.department ? ` · ${item.worker.department}` : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setFilterEmployeeId(isSelected ? 'ALL' : item.worker.id)
                              }
                              className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition shrink-0 ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {isSelected ? '선택됨' : '기록 조회'}
                            </button>
                          </div>

                          {/* Requirement 6: Format: 홍길동 - 연장 12시간 / 휴무일 8시간 */}
                          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100 font-mono">
                            <div className="space-x-1.5">
                              <span className="text-amber-700 font-semibold">
                                연장 {item.overtimeHours}시간
                              </span>
                              <span className="text-purple-700 font-semibold">
                                휴무일 {item.holidayHours}시간
                              </span>
                            </div>
                            <span className="font-bold text-indigo-700">
                              총 {item.totalHours}h
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">기록 건수 / 대상 근로자</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-slate-900">
              {totals.totalRecords}건
            </div>
            <div className="text-xs text-slate-500 font-medium">
              근로자 <strong className="text-slate-800">{totals.workerCount}명</strong>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">연장근무 총 시간</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-amber-700">
              {totals.totalOvertimeHours}시간
            </div>
            <div className="text-[10px] text-amber-600 font-medium">통상시급 × 1.5</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">휴무일근무 총 시간</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-purple-700">
              {totals.totalHolidayHours}시간
            </div>
            <div className="text-[10px] text-purple-600 font-medium">통상시급 × 1.5</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">총 추가근무 합계 시간</div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-indigo-700">
              {totals.grandTotalHours}시간
            </div>
            <div className="text-[10px] text-indigo-600 font-medium">출근부 반영 시간</div>
          </div>
        </div>
      </div>

      {/* 3. Company & Month Selectors & Filter Bar (Requirement 1 & 6) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Company Selector (ADMIN, strictly companyId) */}
            {role === 'ADMIN' && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-700 shrink-0">대상 기업:</span>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => {
                    setSelectedCompanyId(e.target.value);
                    setFilterEmployeeId('ALL');
                  }}
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

            {/* Belonging Year Month Selector */}
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

            {/* Requirement 6: Specific Worker Filter (기업 + 귀속연월 + employeeId, WORKER는 본인 고정이므로 숨김) */}
            {role !== 'WORKER' && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-700 shrink-0">근로자 필터:</span>
                <select
                  value={filterEmployeeId}
                  onChange={(e) => setFilterEmployeeId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-800 focus:outline-none max-w-[200px]"
                >
                  <option value="ALL">전체 근로자 ({workers.length}명)</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.department || '부서미지정'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Work Type Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={filterWorkType}
                onChange={(e) => setFilterWorkType(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-800 focus:outline-none"
              >
                <option value="ALL">근무구분 전체</option>
                <option value="OVERTIME">연장근무</option>
                <option value="HOLIDAY">휴무일근무</option>
              </select>
            </div>
          </div>

          {/* Search query input */}
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="근로자, 사번, 메모 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs focus:border-slate-800 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 4. Overtime Records Table (Requirement 5: 날짜, 근로자, 부서/직책, 근무구분, 시간, 메모, 수정, 삭제) */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              {belongingYearMonth} 추가근무 출근부 내역 (
              {selectedCompany ? selectedCompany.companyName : '회사 선택'})
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {filteredRecords.length}건 표시
            </span>
          </div>
          <span className="text-xs text-slate-400">
            ※ 급여관리 화면에서 [추가근무 불러오기] 클릭 시 본 출근부 기록이 자동 연동됩니다.
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            <span>추가근무 내역 로딩 중...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Clock className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">
              등록된 추가근무 기록이 없습니다.
            </p>
            <p className="text-[11px] text-slate-400">
              상단의 [추가근무 등록] 버튼으로 연장근무 또는 휴무일근무를 등록하세요.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">근무일자</th>
                  <th className="px-4 py-3">근로자</th>
                  <th className="px-4 py-3">부서 / 직책</th>
                  <th className="px-4 py-3 text-center">근무구분</th>
                  <th className="px-4 py-3 text-right">근무시간</th>
                  <th className="px-4 py-3">메모 / 사유</th>
                  {role !== 'WORKER' && <th className="px-4 py-3 text-center">작업</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((rec) => {
                  const meta = getWorkTypeMeta(rec.workType);
                  const matchedWorker = workers.find((w) => w.id === rec.employeeId);
                  const dept = rec.department || matchedWorker?.department || '-';
                  const pos = rec.position || matchedWorker?.position || '-';

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70 transition">
                      {/* 날짜 */}
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">
                        {rec.workDate}
                      </td>

                      {/* 근로자 */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{rec.employeeName}</span>
                          <span className="text-[10px] font-mono text-slate-400 font-normal">
                            ({rec.employeeId.length > 10 ? `${rec.employeeId.slice(0, 8)}…` : rec.employeeId})
                          </span>
                        </div>
                      </td>

                      {/* 부서/직책 */}
                      <td className="px-4 py-3 text-slate-600">
                        {dept} / {pos}
                      </td>

                      {/* 근무구분 */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badgeClass}`}
                          title={meta.description}
                        >
                          {meta.label}
                        </span>
                      </td>

                      {/* 시간 */}
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {rec.hours}시간
                      </td>

                      {/* 메모 */}
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                        {rec.memo || rec.note || '-'}
                      </td>

                      {/* 수정 / 삭제 (ADMIN 및 COMPANY 허용, WORKER 금지) */}
                      {role !== 'WORKER' && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(rec)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition"
                              title="기록 수정"
                            >
                              <Edit2 className="h-3 w-3" />
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(rec)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/50 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-100 transition"
                              title="기록 삭제"
                            >
                              <Trash2 className="h-3 w-3" />
                              삭제
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-800">
                <tr>
                  <td className="px-4 py-3" colSpan={4}>
                    합계: {totals.totalRecords}건 (근로자 {totals.workerCount}명)
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-700">
                    {totals.grandTotalHours}시간
                  </td>
                  <td className="px-4 py-3 text-slate-400" colSpan={role !== 'WORKER' ? 2 : 1}>
                    (연장 {totals.totalOvertimeHours}h / 휴무일 {totals.totalHolidayHours}h)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 5. Create / Edit Modal (Requirement 4: 신규 등록 및 수정) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-700" />
                {editingRecord ? '추가근무 기록 수정' : '추가근무 기록 신규 등록'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3.5">
              {/* Requirement 5 & 6: Duplicate Warning Alert */}
              {duplicateWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 space-y-2 text-xs text-amber-950">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{duplicateWarning.message}</span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-lg border border-amber-200/80 text-[11px] space-y-1">
                    <div className="font-semibold text-slate-700">기존 등록된 기록:</div>
                    <div className="flex flex-wrap gap-x-3 text-slate-600">
                      <span>
                        근무일자: <strong>{duplicateWarning.record.workDate}</strong>
                      </span>
                      <span>
                        구분:{' '}
                        <strong>
                          {duplicateWarning.record.workType === 'OVERTIME' ? '연장근무' : '휴무일근무'}
                        </strong>
                      </span>
                      <span>
                        시간: <strong>{duplicateWarning.record.hours}시간</strong>
                      </span>
                    </div>
                    {duplicateWarning.record.memo && (
                      <div className="text-slate-500">메모: {duplicateWarning.record.memo}</div>
                    )}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer pt-1 text-slate-700">
                    <input
                      type="checkbox"
                      checked={confirmDuplicateOverride}
                      onChange={(e) => {
                        setConfirmDuplicateOverride(e.target.checked);
                        if (e.target.checked) setFormError(null);
                      }}
                      className="rounded border-slate-300 text-slate-900 mt-0.5 focus:ring-slate-800"
                    />
                    <span className="text-[11px] font-medium leading-tight">
                      기존 기록을 확인하였으며, 정당한 사유(분할 근무 등)로 인해 추가 등록을 계속 진행합니다.
                    </span>
                  </label>
                </div>
              )}

              {/* 소속 회사 표시 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  소속 회사
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800">
                  {selectedCompany?.companyName || selectedCompanyId}
                </div>
              </div>

              {/* Requirement 4: 해당 companyId에 소속된 근로자만 선택 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  대상 근로자 <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formEmployeeId}
                  onChange={(e) => {
                    setFormEmployeeId(e.target.value);
                    setDuplicateWarning(null);
                    setConfirmDuplicateOverride(false);
                    setFormError(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white font-medium"
                >
                  <option value="">근로자를 선택하세요</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} (사번: {w.id.slice(0, 8)} | 부서: {w.department || '-'})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  ※ 선택된 회사({selectedCompany?.companyName})에 등록된 근로자만 표시됩니다.
                </p>
              </div>

              {/* 근무 일자 & 구분 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    근무 일자 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={minDate}
                    max={maxDate}
                    value={formWorkDate}
                    onChange={(e) => {
                      setFormWorkDate(e.target.value);
                      setDuplicateWarning(null);
                      setConfirmDuplicateOverride(false);
                      setFormError(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">
                    허용 범위: {minDate} ~ {maxDate}
                  </div>
                </div>

                {/* Requirement 3: 근무구분 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    근무 구분 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formWorkType}
                    onChange={(e) => {
                      setFormWorkType(e.target.value as OvertimeWorkType);
                      setDuplicateWarning(null);
                      setConfirmDuplicateOverride(false);
                      setFormError(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white font-medium"
                  >
                    {OVERTIME_WORK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label} (×1.5)
                      </option>
                    ))}
                  </select>
                  <div className="text-[10px] text-slate-400 mt-1">
                    급여대장 가산 산정 기준
                  </div>
                </div>
              </div>

              {/* 근무 시간 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  근무 시간 (단위: 시간) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="24"
                    required
                    value={formHours || ''}
                    onChange={(e) => setFormHours(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono"
                    placeholder="예: 2.5"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">
                    시간
                  </span>
                </div>
              </div>

              {/* 메모 / 비고 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  사유 및 메모
                </label>
                <input
                  type="text"
                  placeholder="예: 월말 결산 회계 마감 지원"
                  value={formMemo}
                  onChange={(e) => setFormMemo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isSubmitting ? '저장 중...' : editingRecord ? '수정 내용 저장' : '기록 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Requirement 1 & 2: Batch Input Modal (추가근무 출근부 표 형태 일괄 입력) */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Table className="h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    추가근무 출근부 일괄 입력
                    <span className="rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 text-[10px] font-bold">
                      {selectedCompany?.companyName || '선택 기업'}
                    </span>
                    <span className="rounded-full bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 text-[10px] font-semibold">
                      귀속 {belongingYearMonth}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    표 형태에서 여러 근로자의 추가근무(연장·휴무일)를 연속으로 입력하고 일괄 검증 후 등록합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsBatchModalOpen(false);
                  setShowBatchConfirm(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Toolbar Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddBatchRow}
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs transition"
                >
                  <Plus className="h-3.5 w-3.5 text-indigo-600" />
                  + 1행 추가
                </button>
                <button
                  type="button"
                  onClick={() => handleAddBatchRows(5)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs transition"
                >
                  <ListPlus className="h-3.5 w-3.5 text-indigo-600" />
                  + 5행 추가
                </button>
                {workers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAddAllWorkersBatchRows}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                  >
                    <Users className="h-3.5 w-3.5" />
                    전체 근로자 1행씩 추가 ({workers.length}명)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const validation = validateBatchRows();
                    if (validation.isValid) {
                      setBatchValidationErrors([]);
                      alert('모든 입력 행이 정상입니다. [일괄 저장 확인]을 진행하세요.');
                    } else {
                      setBatchValidationErrors(validation.errors);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs transition"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  입력 검증
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  표준 CSV 서식 다운로드
                </button>
              </div>
            </div>

            {/* Requirement 2: Validation Errors Banner with Row Index & Partial Save Prevention Notice */}
            {batchValidationErrors.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/95 p-3.5 text-xs text-rose-900 shrink-0 space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>
                    총 {batchRows.length}행 중 {batchErrorsByRow.size}개 행에서 오류가 발견되었습니다.
                    (정상 행과 오류 행이 섞여 있을 때 임의로 일부만 저장되지 않습니다.)
                  </span>
                </div>
                <div className="max-h-28 overflow-y-auto pl-6 pr-2 space-y-1 text-[11px] list-disc">
                  {batchValidationErrors.map((err, idx) => (
                    <div key={idx} className="text-rose-700 font-medium">
                      • <strong>[{err.rowIndex}행]</strong> {err.message}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-rose-600 pl-6">
                  ※ 표에서 붉은색으로 표시된 오류 행을 모두 수정한 후 [일괄 저장 확인]을 진행해주세요.
                </p>
              </div>
            )}

            {/* Batch Table Container */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-600 border-collapse">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="py-2.5 px-2.5 text-center w-12 font-bold">#</th>
                    <th className="py-2.5 px-3 w-56 font-bold">
                      근로자 <span className="text-rose-500">*</span>
                    </th>
                    <th className="py-2.5 px-3 w-40 font-bold">
                      근무일자 <span className="text-rose-500">*</span>
                    </th>
                    <th className="py-2.5 px-3 w-36 font-bold">
                      근무구분 <span className="text-rose-500">*</span>
                    </th>
                    <th className="py-2.5 px-3 w-28 font-bold">
                      시간(h) <span className="text-rose-500">*</span>
                    </th>
                    <th className="py-2.5 px-3 font-bold">사유 및 메모</th>
                    <th className="py-2.5 px-2 text-center w-12 font-bold">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {batchRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 text-xs">
                        입력할 행이 없습니다. 상단의 [+ 1행 추가] 또는 [전체 근로자 1행씩 추가]를 클릭하세요.
                      </td>
                    </tr>
                  ) : (
                    batchRows.map((row, idx) => {
                      const rowNum = idx + 1;
                      const rowErrors = batchErrorsByRow.get(rowNum);
                      const hasRowError = Boolean(rowErrors && rowErrors.length > 0);

                      return (
                        <tr
                          key={row.tempId}
                          className={`transition ${
                            hasRowError
                              ? 'bg-rose-50/60 hover:bg-rose-50'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* Row Index */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-500">
                            {hasRowError ? (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-rose-600 text-white text-[10px]">
                                {rowNum}
                              </span>
                            ) : (
                              rowNum
                            )}
                          </td>

                          {/* Employee Select */}
                          <td className="py-2 px-3">
                            <select
                              value={row.employeeId}
                              onChange={(e) =>
                                handleBatchFieldChange(row.tempId, 'employeeId', e.target.value)
                              }
                              className={`w-full rounded-lg border px-2 py-1.5 text-xs font-medium focus:outline-none ${
                                hasRowError && rowErrors?.some((e) => e.field === 'employeeId')
                                  ? 'border-rose-400 bg-white text-rose-900 focus:border-rose-600'
                                  : 'border-slate-300 bg-white text-slate-800 focus:border-slate-900'
                              }`}
                            >
                              <option value="">근로자 선택</option>
                              {workers.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name} ({w.id.slice(0, 8)} | {w.department || '-'})
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Work Date */}
                          <td className="py-2 px-3">
                            <input
                              type="date"
                              min={minDate}
                              max={maxDate}
                              value={row.workDate}
                              onChange={(e) =>
                                handleBatchFieldChange(row.tempId, 'workDate', e.target.value)
                              }
                              className={`w-full rounded-lg border px-2 py-1 text-xs focus:outline-none font-mono ${
                                hasRowError && rowErrors?.some((e) => e.field === 'workDate')
                                  ? 'border-rose-400 bg-white text-rose-900 focus:border-rose-600'
                                  : 'border-slate-300 bg-white text-slate-800 focus:border-slate-900'
                              }`}
                            />
                          </td>

                          {/* Work Type */}
                          <td className="py-2 px-3">
                            <select
                              value={row.workType}
                              onChange={(e) =>
                                handleBatchFieldChange(
                                  row.tempId,
                                  'workType',
                                  e.target.value as OvertimeWorkType
                                )
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
                            >
                              {OVERTIME_WORK_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label} (×1.5)
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Hours */}
                          <td className="py-2 px-3">
                            <div className="relative">
                              <input
                                type="number"
                                step="0.5"
                                min="0.5"
                                max="24"
                                value={row.hours}
                                onChange={(e) =>
                                  handleBatchFieldChange(row.tempId, 'hours', e.target.value)
                                }
                                className={`w-full rounded-lg border px-2 py-1 text-xs font-mono focus:outline-none pr-6 ${
                                  hasRowError && rowErrors?.some((e) => e.field === 'hours')
                                    ? 'border-rose-400 bg-white text-rose-900 focus:border-rose-600'
                                    : 'border-slate-300 bg-white text-slate-800 focus:border-slate-900'
                                }`}
                              />
                              <span className="absolute right-2 top-1 text-[10px] text-slate-400">
                                h
                              </span>
                            </div>
                          </td>

                          {/* Memo */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="사유 및 메모"
                              value={row.memo}
                              onChange={(e) =>
                                handleBatchFieldChange(row.tempId, 'memo', e.target.value)
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-900 focus:outline-none"
                            />
                            {hasRowError && (
                              <div className="text-[10px] text-rose-600 font-semibold mt-1">
                                {rowErrors?.map((e) => e.message).join(' ')}
                              </div>
                            )}
                          </td>

                          {/* Delete Row */}
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveBatchRow(row.tempId)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                              title="행 삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Batch Table Summary & Footer Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 shrink-0">
              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                <span className="font-semibold text-slate-900">
                  입력 목록 요약: 총 {batchRows.length}행
                </span>
                <span className="text-amber-700 font-mono">
                  연장 <strong>{batchTotals.otHours}h</strong>
                </span>
                <span className="text-purple-700 font-mono">
                  휴무일 <strong>{batchTotals.holHours}h</strong>
                </span>
                <span className="text-indigo-700 font-mono font-bold">
                  합계 <strong>{batchTotals.totalHours}시간</strong>
                </span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsBatchModalOpen(false);
                    setShowBatchConfirm(false);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleInitiateBatchSave}
                  disabled={batchRows.length === 0 || isBatchSubmitting}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  일괄 저장 확인 ({batchRows.length}건)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Batch Save (Requirement 2: 결과 명확히 확인 후 실행) */}
      {showBatchConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">
                추가근무 출근부 일괄 저장 최종 확인
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p className="leading-relaxed">
                정상 검증된 총 <strong className="text-indigo-700 font-bold">{batchRows.length}건</strong>의
                추가근무 기록을 출근부에 등록하시겠습니까?
              </p>

              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-1.5 font-medium text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">소속 기업:</span>
                  <span className="font-bold text-slate-800">{selectedCompany?.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">귀속연월:</span>
                  <span className="font-mono font-bold text-slate-800">{belongingYearMonth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">저장 대상 행:</span>
                  <span className="font-mono font-bold text-slate-800">{batchRows.length}건</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">연장근무 합계:</span>
                  <span className="font-mono font-bold text-amber-700">{batchTotals.otHours}시간</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">휴무일근무 합계:</span>
                  <span className="font-mono font-bold text-purple-700">{batchTotals.holHours}시간</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-700 font-bold">총 추가근무 시간:</span>
                  <span className="font-mono font-bold text-indigo-700">{batchTotals.totalHours}시간</span>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 p-2.5 border border-amber-200 text-[10px] text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  급여 재동기화 안내
                </div>
                <p>
                  저장 즉시 출근부 원본 변경시각이 갱신되어, 급여관리 화면에 [추가근무 변경 감지 및 다시 불러오기 안내]가 활성화됩니다.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isBatchSubmitting}
                onClick={() => setShowBatchConfirm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                돌아가서 수정
              </button>
              <button
                type="button"
                disabled={isBatchSubmitting}
                onClick={handleExecuteBatchSave}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isBatchSubmitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  '최종 일괄 저장 실행'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Requirement 3 & 4: CSV / XLSX Upload Modal */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    출근부 CSV / XLSX 가져오기
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                      {selectedCompany?.companyName}
                    </span>
                    <span className="rounded-full bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 text-[10px] font-semibold">
                      귀속 {belongingYearMonth}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    외부 출근부 엑셀/CSV 데이터를 고유 식별자(사번) 기준으로 안전하게 매핑하여 일괄 등록합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Requirement 3: Template Download & Column Structure Instructions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    표준 서식 열 구성 안내
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-emerald-700 transition shadow-2xs"
                  >
                    <Download className="h-3 w-3" />
                    표준 CSV 서식 다운로드
                  </button>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-600 space-y-1">
                  <div>근로자 식별자(사번), 근로자명, 근무일자, 근무구분, 근무시간, 메모</div>
                </div>
                <div className="text-[10px] text-slate-500 leading-tight">
                  ※ <strong>근로자 식별자(사번/ID)</strong> 열이 필수이며, 한글 깨짐 방지 UTF-8 BOM 서식이 적용됩니다.
                </div>
              </div>

              {/* Requirement 3 & 4: Upload Area & Highlighting Strict employeeId Matching */}
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3.5 space-y-2 text-xs flex flex-col justify-center">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Upload className="h-4 w-4 text-slate-600" />
                  <span>파일 선택 (.csv / .xlsx)</span>
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleCsvFileChange}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
                />
                <div className="rounded-md bg-amber-50 p-2 border border-amber-200 text-[10px] text-amber-800">
                  ⚠️ <strong>중요 매칭 원칙:</strong> 동명이인 오적용 방지를 위해 <strong>근로자명만으로는 자동 매칭되지 않으며</strong> 고유 식별자(사번)를 기준으로 연결됩니다.
                </div>
              </div>
            </div>

            {/* Requirement 4: Explicit Notification for XLSX Preparation or Status Notice */}
            {csvNotice && (
              <div
                className={`rounded-xl border p-3.5 text-xs font-medium shrink-0 flex items-start gap-2.5 ${
                  csvNotice.type === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : csvNotice.type === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-900'
                    : 'border-blue-200 bg-blue-50 text-blue-900'
                }`}
              >
                {csvNotice.type === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                ) : csvNotice.type === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">
                    {csvNotice.type === 'warning'
                      ? '주의 / 안내'
                      : csvNotice.type === 'error'
                      ? '오류'
                      : '안내'}
                  </div>
                  <div className="mt-0.5 leading-relaxed">{csvNotice.message}</div>
                </div>
              </div>
            )}

            {/* Parsed CSV Data Mapping Preview Table */}
            {csvParsedRows.length > 0 && (
              <div className="flex-1 flex flex-col min-h-0 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <span>파싱된 데이터 ({csvParsedRows.length}건)</span>
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 text-[10px]">
                      정상 매칭 {csvMatchedCount}건
                    </span>
                    {csvNeedsReviewCount > 0 && (
                      <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 text-[10px]">
                        검토 필요 {csvNeedsReviewCount}건
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-normal">
                    ※ 검토 필요 행은 사번을 확인하고 근로자를 수동 매칭하거나 제외하세요.
                  </div>
                </div>

                <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-600 border-collapse">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                      <tr>
                        <th className="py-2 px-2 text-center w-10">행</th>
                        <th className="py-2 px-3 w-28">식별자(사번)</th>
                        <th className="py-2 px-3 w-24">입력 근로자명</th>
                        <th className="py-2 px-3 w-24">근무일자</th>
                        <th className="py-2 px-3 w-24">구분</th>
                        <th className="py-2 px-2 text-right w-16">시간</th>
                        <th className="py-2 px-3">메모</th>
                        <th className="py-2 px-3 w-56">매칭 상태 및 근로자 연결</th>
                        <th className="py-2 px-2 text-center w-10">제외</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {csvParsedRows.map((r) => {
                        const isMatched = r.matchStatus === 'MATCHED';
                        return (
                          <tr
                            key={r.rawRowIndex}
                            className={`transition ${
                              isMatched ? 'hover:bg-slate-50' : 'bg-amber-50/40 hover:bg-amber-50/70'
                            }`}
                          >
                            <td className="py-2 px-2 text-center font-mono font-semibold text-slate-500">
                              {r.rawRowIndex}
                            </td>
                            <td className="py-2 px-3 font-mono font-medium text-slate-900">
                              {r.employeeId || <span className="text-rose-500 text-[10px]">미기재</span>}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              {r.employeeName}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600">{r.workDate}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                                  r.workType === 'OVERTIME'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-purple-50 text-purple-700 border-purple-200'
                                }`}
                              >
                                {r.workType === 'OVERTIME' ? '연장근무' : '휴무일근무'}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                              {r.hours}h
                            </td>
                            <td className="py-2 px-3 text-slate-500 truncate max-w-[120px]" title={r.memo}>
                              {r.memo || '-'}
                            </td>
                            <td className="py-2 px-3">
                              {isMatched ? (
                                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                  <span>
                                    {r.matchedWorker?.name} ({r.matchedWorker?.department || '소속일치'})
                                  </span>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 text-amber-700 font-bold text-[10px]">
                                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                                    <span>검토 필요 ({r.matchError || '사번 불일치'})</span>
                                  </div>
                                  <select
                                    value={r.employeeId}
                                    onChange={(e) =>
                                      handleUpdateParsedRowWorker(r.rawRowIndex, e.target.value)
                                    }
                                    className="w-full text-[11px] rounded border border-amber-300 bg-white px-1.5 py-0.5 text-slate-800"
                                  >
                                    <option value="">수동 매칭할 근로자 선택</option>
                                    {workers.map((w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.name} ({w.id.slice(0, 8)} | {w.department || '-'})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveParsedRow(r.rawRowIndex)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded"
                                title="이 행 제외"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CSV Modal Footer */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 shrink-0">
              <div className="text-xs text-slate-500">
                {csvParsedRows.length > 0 ? (
                  <span>
                    가져오기 시 정상 매칭된 {csvMatchedCount}건만 일괄 입력표로 전송됩니다.
                  </span>
                ) : (
                  <span>.csv 파일을 선택하여 데이터를 불러오세요.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCsvModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleTransferCsvToBatch}
                  disabled={csvMatchedCount === 0}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  일괄 입력표로 가져오기 ({csvMatchedCount}건)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
