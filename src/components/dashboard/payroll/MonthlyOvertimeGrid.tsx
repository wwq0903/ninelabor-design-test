import React, { useState, useMemo } from 'react';
import { Worker, OvertimeRecord, UserRole } from '../../../types';
import { overtimeService } from '../../../services/overtimeService';
import { auditLogService } from '../../../services/auditLogService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Calendar,
  Save,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';

export interface MonthlyGridCellDraft {
  overtimeHours: number;
  holidayHours: number;
  memo: string;
}

interface MonthlyOvertimeGridProps {
  role: UserRole;
  companyId: string;
  companyName?: string;
  belongingYearMonth: string;
  workers: Worker[];
  records: OvertimeRecord[];
  loading: boolean;
  onRecordsUpdated: () => Promise<void>;
  onNavigatePrevMonth: () => void;
  onNavigateNextMonth: () => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (has: boolean) => void;
}

export const MonthlyOvertimeGrid: React.FC<MonthlyOvertimeGridProps> = ({
  role,
  companyId,
  companyName,
  belongingYearMonth,
  workers,
  records,
  loading,
  onRecordsUpdated,
  onNavigatePrevMonth,
  onNavigateNextMonth,
  hasUnsavedChanges,
  setHasUnsavedChanges,
}) => {
  const { currentUser, userProfile } = useAuth();

  // 1. Calculate days in currently selected belongingYearMonth (e.g. 1..31)
  const { year, month, daysInMonth, dayList } = useMemo(() => {
    const [yStr, mStr] = belongingYearMonth.split('-');
    const y = parseInt(yStr, 10) || 2026;
    const m = parseInt(mStr, 10) || 10;
    const totalDays = new Date(y, m, 0).getDate();
    const days: { day: number; dateStr: string; dayOfWeek: string; isWeekend: boolean }[] = [];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`;
      const dayObj = new Date(y, m - 1, d);
      const dayIdx = dayObj.getDay();
      days.push({
        day: d,
        dateStr,
        dayOfWeek: dayNames[dayIdx],
        isWeekend: dayIdx === 0 || dayIdx === 6,
      });
    }

    return {
      year: y,
      month: m,
      daysInMonth: totalDays,
      dayList: days,
    };
  }, [belongingYearMonth]);

  // 2. Map existing Firestore records by `${employeeId}_${workDate}`
  // Each cell can hold both OVERTIME and HOLIDAY records
  const existingCellMap = useMemo(() => {
    const map = new Map<
      string,
      {
        overtimeRecord?: OvertimeRecord;
        holidayRecord?: OvertimeRecord;
        overtimeHours: number;
        holidayHours: number;
        memo: string;
      }
    >();

    records.forEach((rec) => {
      const key = `${rec.employeeId}_${rec.workDate}`;
      const entry = map.get(key) || {
        overtimeHours: 0,
        holidayHours: 0,
        memo: '',
      };

      if (rec.workType === 'OVERTIME') {
        entry.overtimeRecord = rec;
        entry.overtimeHours = rec.hours;
      } else if (rec.workType === 'HOLIDAY') {
        entry.holidayRecord = rec;
        entry.holidayHours = rec.hours;
      }

      const recMemo = rec.memo || rec.note || '';
      if (recMemo && !entry.memo) {
        entry.memo = recMemo;
      } else if (recMemo && entry.memo && !entry.memo.includes(recMemo)) {
        entry.memo = `${entry.memo} / ${recMemo}`;
      }

      map.set(key, entry);
    });

    return map;
  }, [records]);

  // 3. Draft edits state: map of `${employeeId}_${workDate}` -> MonthlyGridCellDraft
  const [draftChanges, setDraftChanges] = useState<Map<string, MonthlyGridCellDraft>>(new Map());

  // Helper to get active value for cell (draft overrides existing)
  const getCellData = (employeeId: string, dateStr: string) => {
    const key = `${employeeId}_${dateStr}`;
    const draft = draftChanges.get(key);
    if (draft) {
      return {
        overtimeHours: draft.overtimeHours,
        holidayHours: draft.holidayHours,
        memo: draft.memo,
        isModified: true,
      };
    }
    const existing = existingCellMap.get(key);
    if (existing) {
      return {
        overtimeHours: existing.overtimeHours,
        holidayHours: existing.holidayHours,
        memo: existing.memo,
        isModified: false,
      };
    }
    return {
      overtimeHours: 0,
      holidayHours: 0,
      memo: '',
      isModified: false,
    };
  };

  // 4. Popover edit modal for a selected cell
  const [activeCellModal, setActiveCellModal] = useState<{
    worker: Worker;
    dayInfo: { day: number; dateStr: string; dayOfWeek: string; isWeekend: boolean };
    overtimeHours: number;
    holidayHours: number;
    memo: string;
  } | null>(null);

  // Status & saving indicators
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const [saveErrorNotice, setSaveErrorNotice] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState<(() => void) | null>(null);

  // Open Popover
  const handleOpenCellModal = (
    worker: Worker,
    dayInfo: { day: number; dateStr: string; dayOfWeek: string; isWeekend: boolean }
  ) => {
    const current = getCellData(worker.id, dayInfo.dateStr);
    setActiveCellModal({
      worker,
      dayInfo,
      overtimeHours: current.overtimeHours,
      holidayHours: current.holidayHours,
      memo: current.memo,
    });
  };

  // Apply cell modal edit into draftChanges
  const handleApplyCellEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCellModal) return;

    const { worker, dayInfo, overtimeHours, holidayHours, memo } = activeCellModal;
    const key = `${worker.id}_${dayInfo.dateStr}`;

    const existing = existingCellMap.get(key);
    const existingOT = existing?.overtimeHours || 0;
    const existingHol = existing?.holidayHours || 0;
    const existingMemo = existing?.memo || '';

    const newMap = new Map(draftChanges);

    // If matches existing exactly, remove from drafts
    if (
      overtimeHours === existingOT &&
      holidayHours === existingHol &&
      memo.trim() === existingMemo.trim()
    ) {
      newMap.delete(key);
    } else {
      newMap.set(key, {
        overtimeHours: Math.max(0, Number(overtimeHours) || 0),
        holidayHours: Math.max(0, Number(holidayHours) || 0),
        memo: memo.trim(),
      });
    }

    setDraftChanges(newMap);
    setHasUnsavedChanges(newMap.size > 0);
    setActiveCellModal(null);
  };

  // Clear single cell in modal
  const handleClearCellInModal = () => {
    if (!activeCellModal) return;
    setActiveCellModal({
      ...activeCellModal,
      overtimeHours: 0,
      holidayHours: 0,
      memo: '',
    });
  };

  // Discard all changes
  const handleDiscardAllChanges = () => {
    setDraftChanges(new Map());
    setHasUnsavedChanges(false);
    setShowDiscardConfirm(false);
    if (pendingNavigationAction) {
      pendingNavigationAction();
      setPendingNavigationAction(null);
    }
  };

  // Safe navigation with unsaved changes protection
  const handleSafePrevMonth = () => {
    if (hasUnsavedChanges) {
      setPendingNavigationAction(() => onNavigatePrevMonth);
      setShowDiscardConfirm(true);
    } else {
      onNavigatePrevMonth();
    }
  };

  const handleSafeNextMonth = () => {
    if (hasUnsavedChanges) {
      setPendingNavigationAction(() => onNavigateNextMonth);
      setShowDiscardConfirm(true);
    } else {
      onNavigateNextMonth();
    }
  };

  // Batch Save to Firestore (Real CRUD, Zero Mock, No fake success)
  const handleSaveAllChanges = async () => {
    if (!currentUser || draftChanges.size === 0) return;
    try {
      setIsSaving(true);
      setSaveErrorNotice(null);
      setSaveSuccessNotice(null);

      let savedRecordCount = 0;
      let deletedRecordCount = 0;

      // Iterate through all modified keys
      for (const [key, draft] of draftChanges.entries()) {
        const [empId, workDate] = key.split('_');
        const matchedWorker = workers.find((w) => w.id === empId);
        const existing = existingCellMap.get(key);

        // 1. Process OVERTIME
        if (draft.overtimeHours > 0) {
          if (existing?.overtimeRecord) {
            // Update existing
            await overtimeService.updateOvertimeRecord(
              existing.overtimeRecord.id,
              {
                hours: draft.overtimeHours,
                memo: draft.memo || undefined,
                updatedById: currentUser.uid,
              },
              currentUser.uid,
              workers
            );
            savedRecordCount++;
          } else {
            // Create new
            await overtimeService.createOvertimeRecord(
              {
                companyId,
                employeeId: empId,
                employeeName: matchedWorker?.name || empId,
                department: matchedWorker?.department,
                position: matchedWorker?.position,
                workDate,
                belongingYearMonth,
                workType: 'OVERTIME',
                hours: draft.overtimeHours,
                memo: draft.memo || undefined,
                createdById: currentUser.uid,
              },
              workers
            );
            savedRecordCount++;
          }
        } else if (existing?.overtimeRecord && draft.overtimeHours === 0) {
          // Deleted overtime
          await overtimeService.deleteOvertimeRecord(existing.overtimeRecord.id, currentUser.uid);
          deletedRecordCount++;
        }

        // 2. Process HOLIDAY
        if (draft.holidayHours > 0) {
          if (existing?.holidayRecord) {
            // Update existing
            await overtimeService.updateOvertimeRecord(
              existing.holidayRecord.id,
              {
                hours: draft.holidayHours,
                memo: draft.memo || undefined,
                updatedById: currentUser.uid,
              },
              currentUser.uid,
              workers
            );
            savedRecordCount++;
          } else {
            // Create new
            await overtimeService.createOvertimeRecord(
              {
                companyId,
                employeeId: empId,
                employeeName: matchedWorker?.name || empId,
                department: matchedWorker?.department,
                position: matchedWorker?.position,
                workDate,
                belongingYearMonth,
                workType: 'HOLIDAY',
                hours: draft.holidayHours,
                memo: draft.memo || undefined,
                createdById: currentUser.uid,
              },
              workers
            );
            savedRecordCount++;
          }
        } else if (existing?.holidayRecord && draft.holidayHours === 0) {
          // Deleted holiday work
          await overtimeService.deleteOvertimeRecord(existing.holidayRecord.id, currentUser.uid);
          deletedRecordCount++;
        }
      }

      // Record audit log
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: role,
        actorName: userProfile?.displayName || '기업 담당자',
        companyId,
        action: 'OVERTIME_BATCH_UPDATED',
        resourceType: 'overtime_records',
        resourceId: `grid_${belongingYearMonth}`,
        details: {
          belongingYearMonth,
          modifiedCellsCount: draftChanges.size,
          savedRecordCount,
          deletedRecordCount,
        },
      });

      // Clear drafts and trigger reload
      setDraftChanges(new Map());
      setHasUnsavedChanges(false);
      setSaveSuccessNotice(
        `월간 입력판의 변경사항이 정상 저장되었습니다. (저장/수정 ${savedRecordCount}건, 삭제 ${deletedRecordCount}건)`
      );
      setTimeout(() => setSaveSuccessNotice(null), 4000);

      await onRecordsUpdated();
    } catch (err: any) {
      console.error('Failed to save monthly grid changes', err);
      setSaveErrorNotice(
        err?.message || '월간 출근부 저장 중 오류가 발생했습니다. 권한 및 네트워크를 확인해주세요.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Row Totals for each worker (incorporates draft changes)
  const workerRowTotals = useMemo(() => {
    const map = new Map<
      string,
      { totalOT: number; totalHol: number; grandTotal: number; activeDays: number }
    >();

    workers.forEach((w) => {
      let totalOT = 0;
      let totalHol = 0;
      let activeDays = 0;

      dayList.forEach((d) => {
        const cell = getCellData(w.id, d.dateStr);
        if (cell.overtimeHours > 0 || cell.holidayHours > 0) {
          totalOT += cell.overtimeHours;
          totalHol += cell.holidayHours;
          activeDays++;
        }
      });

      map.set(w.id, {
        totalOT,
        totalHol,
        grandTotal: totalOT + totalHol,
        activeDays,
      });
    });

    return map;
  }, [workers, dayList, draftChanges, existingCellMap]);

  return (
    <div className="space-y-4">
      {/* 1. Month Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <Calendar className="h-4 w-4 text-slate-500" />
            <button
              type="button"
              onClick={handleSafePrevMonth}
              title="이전 달"
              className="p-1 rounded hover:bg-slate-200 text-slate-700 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-bold text-sm text-slate-900 px-2 font-mono">
              {year}년 {month}월
            </span>
            <button
              type="button"
              onClick={handleSafeNextMonth}
              title="다음 달"
              className="p-1 rounded hover:bg-slate-200 text-slate-700 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="text-xs text-slate-500 hidden md:inline">
            ※ 날짜 셀을 클릭하여 연장·휴일 근무시간과 메모를 바로 입력할 수 있습니다.
          </span>
        </div>

        {/* Save / Discard Actions */}
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl font-medium animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>미저장 변경 {draftChanges.size}건</span>
            </div>
          )}

          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={() => setShowDiscardConfirm(true)}
              disabled={isSaving}
              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl font-medium transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              변경 취소
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveAllChanges}
            disabled={!hasUnsavedChanges || isSaving}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs ${
              hasUnsavedChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            <Save className={`h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} />
            {isSaving ? '저장 중...' : '변경사항 저장'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccessNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          {saveSuccessNotice}
        </div>
      )}

      {saveErrorNotice && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          {saveErrorNotice}
        </div>
      )}

      {/* 2. Monthly Spreadsheet Grid View */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-400">출근부 데이터를 불러오는 중...</div>
        ) : workers.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-700 text-sm">등록된 근로자가 없습니다.</p>
            <p>[근로자 관리] 메뉴에서 먼저 직원을 등록해주세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full border-collapse text-left text-xs table-fixed">
              <thead>
                {/* Header Row: Worker column fixed on left, Days 1..31 across, and Totals */}
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-700 select-none">
                  <th className="sticky left-0 z-20 bg-slate-100/95 w-36 sm:w-44 px-3 py-3 font-bold border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    근로자 성명 (사번)
                  </th>

                  {/* Day Columns */}
                  {dayList.map((d) => (
                    <th
                      key={d.day}
                      className={`w-14 sm:w-16 min-w-[56px] px-1 py-2 text-center border-r border-slate-200/80 font-mono text-[11px] ${
                        d.isWeekend ? 'bg-amber-50/60 text-amber-900 font-semibold' : ''
                      }`}
                    >
                      <div className="font-bold">{d.day}</div>
                      <div className="text-[10px] text-slate-400 font-sans font-normal">
                        {d.dayOfWeek}
                      </div>
                    </th>
                  ))}

                  {/* Monthly Summary Column on Right */}
                  <th className="w-24 sm:w-28 px-3 py-3 text-center font-bold bg-slate-100/80 text-slate-800 border-l border-slate-200">
                    월 합계
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {workers.map((worker) => {
                  const summary = workerRowTotals.get(worker.id) || {
                    totalOT: 0,
                    totalHol: 0,
                    grandTotal: 0,
                    activeDays: 0,
                  };

                  return (
                    <tr key={worker.id} className="hover:bg-slate-50/60 transition group">
                      {/* Sticky Worker Name Column (Requirement 2 & 8) */}
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/90 px-3 py-2 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        <div className="font-bold text-slate-900 truncate" title={worker.name}>
                          {worker.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {worker.id.length > 8 ? `${worker.id.slice(0, 8)}…` : worker.id}
                          {worker.position && ` · ${worker.position}`}
                        </div>
                      </td>

                      {/* Day Cells (Requirement 3 & 4) */}
                      {dayList.map((d) => {
                        const cell = getCellData(worker.id, d.dateStr);
                        const hasData = cell.overtimeHours > 0 || cell.holidayHours > 0;
                        const hasMemo = !!cell.memo;

                        return (
                          <td
                            key={d.day}
                            onClick={() => handleOpenCellModal(worker, d)}
                            className={`p-1 text-center border-r border-slate-100 cursor-pointer transition select-none relative ${
                              d.isWeekend ? 'bg-amber-50/20' : ''
                            } ${
                              cell.isModified
                                ? 'bg-blue-50/80 hover:bg-blue-100/80 ring-1 ring-inset ring-blue-300'
                                : 'hover:bg-slate-100'
                            }`}
                          >
                            {hasData ? (
                              <div className="flex flex-col items-center justify-center min-h-[42px] leading-tight text-[10px]">
                                {cell.overtimeHours > 0 && (
                                  <span className="font-bold text-amber-700 bg-amber-50/90 border border-amber-200 rounded px-1 py-0.2 my-0.2">
                                    연장 {cell.overtimeHours}h
                                  </span>
                                )}
                                {cell.holidayHours > 0 && (
                                  <span className="font-bold text-purple-700 bg-purple-50/90 border border-purple-200 rounded px-1 py-0.2 my-0.2">
                                    휴일 {cell.holidayHours}h
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="min-h-[42px] flex items-center justify-center text-slate-200 group-hover:text-slate-300 text-xs">
                                ·
                              </div>
                            )}

                            {/* Memo indicator tag (Requirement 4) */}
                            {hasMemo && (
                              <span
                                className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-blue-500"
                                title={`메모: ${cell.memo}`}
                              />
                            )}

                            {/* Modified badge indicator */}
                            {cell.isModified && (
                              <span
                                className="absolute bottom-0.5 right-1 text-[8px] font-bold text-blue-600 font-mono"
                                title="미저장 변경 상태"
                              >
                                *
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Worker Monthly Total Column */}
                      <td className="px-2 py-2 text-center bg-slate-50/40 border-l border-slate-200 font-mono text-[11px]">
                        <div className="font-bold text-indigo-700">
                          {summary.grandTotal > 0 ? `${summary.grandTotal}h` : '-'}
                        </div>
                        {summary.grandTotal > 0 && (
                          <div className="text-[9px] text-slate-400 font-sans">
                            {summary.totalOT > 0 && `연장${summary.totalOT} `}
                            {summary.totalHol > 0 && `휴일${summary.totalHol}`}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Cell Edit Popover / Modal (Requirement 3 & 4) */}
      {activeCellModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-blue-600" />
                  근태·추가근무 입력
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {activeCellModal.worker.name} | {activeCellModal.dayInfo.dateStr} (
                  {activeCellModal.dayInfo.dayOfWeek})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCellModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleApplyCellEdit} className="space-y-3.5 text-xs">
              {/* Overtime Hours */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  연장근무 시간 (단위: 시간)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={activeCellModal.overtimeHours || ''}
                    onChange={(e) =>
                      setActiveCellModal({
                        ...activeCellModal,
                        overtimeHours: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:border-slate-800 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400">시간</span>
                </div>
              </div>

              {/* Holiday Hours */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  휴일근무 시간 (단위: 시간)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={activeCellModal.holidayHours || ''}
                    onChange={(e) =>
                      setActiveCellModal({
                        ...activeCellModal,
                        holidayHours: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:border-slate-800 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400">시간</span>
                </div>
              </div>

              {/* Memo */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  사유 및 메모 (선택)
                </label>
                <input
                  type="text"
                  placeholder="예: 프로젝트 마감 지원, 주말 비상 대응"
                  value={activeCellModal.memo}
                  onChange={(e) =>
                    setActiveCellModal({
                      ...activeCellModal,
                      memo: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClearCellInModal}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-800"
                >
                  초기화 (0시간)
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveCellModal(null)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition shadow-2xs"
                  >
                    적용하기
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Discard Changes Warning Modal (Requirement 6) */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
              <AlertTriangle className="h-5 w-5" />
              <span>저장되지 않은 변경사항이 있습니다</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              월간 입력판에 저장하지 않은 변경내역({draftChanges.size}건)이 있습니다.
              저장하지 않고 이동하거나 취소하시면 수정한 내용이 초기화됩니다. 계속 진행하시겠습니까?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  setPendingNavigationAction(null);
                }}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium"
              >
                계속 편집하기
              </button>
              <button
                type="button"
                onClick={handleDiscardAllChanges}
                className="rounded-xl bg-rose-600 px-4 py-1.5 text-xs text-white font-bold hover:bg-rose-700"
              >
                변경 취소하고 이동
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
