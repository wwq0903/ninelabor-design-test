import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  runTransaction,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { sanitizeAuditDetails } from '../utils/sanitizeAuditDetails';
import {
  PayrollRecord,
  PayrollStatus,
  PayItem,
  DeductionItem,
  Worker,
  UserRole,
} from '../types';
import { overtimeService } from './overtimeService';
import { auditLogService } from './auditLogService';

// Central computation policy constants (Extensible, not scattered)
export const PAYROLL_POLICY = {
  OVERTIME_MULTIPLIER: 1.5,
  HOLIDAY_MULTIPLIER: 1.5,
  DEFAULT_BASE_HOURLY_WAGE: 0, // Never infer a statutory hourly wage for an employee
};

export interface ExcludedOvertimeItem {
  recordId?: string;
  workDate?: string;
  employeeId?: string;
  employeeName?: string;
  workType?: string;
  hours?: number;
  reason: string;
}

export interface OvertimeAnalysisResult {
  /** Source revision observed before and after analysis; null for legacy untracked data. */
  sourceRevision?: string | null;
  /** Monotonic source revision. Undefined means legacy data, not a validated revision. */
  sourceVersion?: number;
  companyId: string;
  belongingYearMonth: string;
  totalRecordsFound: number;
  validRecordsCount: number;
  totalOvertimeHours: number;
  totalHolidayHours: number;
  matchedWorkersCount: number;
  aggregatedByWorker: Record<
    string,
    {
      employeeId: string;
      employeeName: string;
      overtimeHours: number;
      holidayWorkHours: number;
    }
  >;
  excludedRecords: ExcludedOvertimeItem[];
}

export interface OvertimeImportExecutionResult {
  updatedWorkersCount: number;
  skippedLockedCount: number;
  skippedLockedEmployees: string[];
  excludedCount: number;
  importedAt: string;
  details: {
    employeeId: string;
    employeeName: string;
    overtimeHours: number;
    holidayWorkHours: number;
    overtimePay: number;
    holidayPay: number;
    wageStatus?: 'CONFIRMED' | 'NEEDS_CONFIRMATION';
    skippedLocked?: boolean;
  }[];
}

export interface PayrollValidationIssue {
  employeeId: string;
  workerName: string;
  type: 'UNSET_WAGE' | 'MISSING_DATA' | 'CALCULATION_MISMATCH';
  message: string;
}

/** Single validation and normalization path for individual and bulk payroll writes. */
function preparePayrollRecord(
  data: Omit<PayrollRecord, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string },
  pId: string,
  now: string
): PayrollRecord {
    // Ensure strict calculation: totalPay = sum of payItems, totalDeduction = sum of deductionItems, netPay = totalPay - totalDeduction
    if (!Array.isArray(data.payItems) || !Array.isArray(data.deductionItems)) {
      throw new Error('급여·공제 항목은 배열이어야 합니다.');
    }
    for (const item of [...data.payItems, ...data.deductionItems]) {
      if (!item || typeof item.name !== 'string' || !item.name.trim() ||
          typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount < 0) {
        throw new Error('급여 항목과 공제 항목은 0 이상의 유한한 숫자여야 합니다.');
      }
    }
    if (!data.companyId?.trim() || !data.employeeId?.trim() ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.belongingYearMonth)) {
      throw new Error('급여 저장에 필요한 기업·근로자·귀속연월이 올바르지 않습니다.');
    }
    const totalPay = data.payItems.reduce((acc, curr) => acc + curr.amount, 0);
    const totalDeduction = data.deductionItems.reduce((acc, curr) => acc + curr.amount, 0);
    const netPay = totalPay - totalDeduction;
    if (![totalPay, totalDeduction, netPay].every(Number.isFinite)) {
      throw new Error('급여 합계가 유효한 숫자 범위를 초과했습니다.');
    }

    // Helper to extract named item amount
    const getPayAmount = (name: string) =>
      data.payItems.find((p) => p.name === name)?.amount ?? 0;
    const getDeductionAmount = (name: string) =>
      data.deductionItems.find((d) => d.name === name)?.amount ?? 0;

    const record: PayrollRecord = {
      ...data,
      id: pId,
      totalPay,
      totalDeduction,
      netPay,
      // Standard item synchronization
      baseSalary: data.baseSalary ?? getPayAmount('기본급'),
      allowances: data.allowances ?? getPayAmount('각종 수당'),
      overtimePay: data.overtimePay ?? getPayAmount('연장근로수당'),
      holidayPay: data.holidayPay ?? getPayAmount('휴일근로수당'),
      otherPay: data.otherPay ?? getPayAmount('기타 지급'),

      nationalPension: data.nationalPension ?? getDeductionAmount('국민연금'),
      healthInsurance: data.healthInsurance ?? getDeductionAmount('건강보험'),
      longTermCare: data.longTermCare ?? getDeductionAmount('장기요양보험'),
      employmentInsurance: data.employmentInsurance ?? getDeductionAmount('고용보험'),
      incomeTax: data.incomeTax ?? getDeductionAmount('소득세'),
      localIncomeTax: data.localIncomeTax ?? getDeductionAmount('지방소득세'),
      otherDeduction: data.otherDeduction ?? getDeductionAmount('기타 공제'),

      createdAt: data.createdAt || now,
      updatedAt: now,
    };

    return record;
}

export const payrollService = {
  async getPayrollsByCompany(
    companyId: string,
    belongingYearMonth: string
  ): Promise<PayrollRecord[]> {
    if (!companyId || !belongingYearMonth) return [];
    const colRef = collection(db, 'payrolls');
    try {
      const q = query(
        colRef,
        where('companyId', '==', companyId),
        where('belongingYearMonth', '==', belongingYearMonth)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollRecord));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `payrolls?companyId=${companyId}`);
    }
  },

  async getPayrollById(id: string): Promise<PayrollRecord | null> {
    if (!id || !id.trim()) return null;
    const cleanId = id.trim();
    try {
      const snap = await getDoc(doc(db, 'payrolls', cleanId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as PayrollRecord;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `payrolls/${cleanId}`);
      return null;
    }
  },

  async getPayrollsForWorker(employeeId: string, companyId: string): Promise<PayrollRecord[]> {
    if (!employeeId?.trim() || !companyId?.trim()) return [];
    const colRef = collection(db, 'payrolls');
    try {
      const q = query(
        colRef,
        where('employeeId', '==', employeeId),
        where('companyId', '==', companyId),
        where('status', 'in', ['CONFIRMED', 'PAID'])
      );
      const snap = await getDocs(q);
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollRecord));
      return records.filter(p => p.companyId === companyId && (p.status === 'CONFIRMED' || p.status === 'PAID')).sort((a, b) => b.belongingYearMonth.localeCompare(a.belongingYearMonth));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `payrolls?employeeId=${employeeId}`);
    }
  },

  async savePayroll(
    data: Omit<PayrollRecord, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string },
    customId?: string
  ): Promise<PayrollRecord> {
    const pId =
      customId ||
      `pr_${data.companyId}_${data.employeeId}_${data.belongingYearMonth.replace('-', '')}`;
    const docRef = doc(db, 'payrolls', pId);
    const now = new Date().toISOString();
    const record = preparePayrollRecord(data, pId, now);

    try {
      await runTransaction(db, async (tx) => {
        const current = await tx.get(docRef);
        if (current.exists()) {
          const previous = current.data() as PayrollRecord;
          if (previous.companyId !== record.companyId || previous.employeeId !== record.employeeId || previous.belongingYearMonth !== record.belongingYearMonth) {
            throw new Error('급여 기록의 기업·근로자·귀속연월을 변경할 수 없습니다.');
          }
          if (previous.status !== 'DRAFT') throw new Error('확정 또는 지급 완료된 급여는 수정할 수 없습니다.');
          if (record.status !== 'DRAFT') throw new Error('급여 상태 변경은 별도 확정 절차로 처리해야 합니다.');
          record.createdAt = previous.createdAt;
          tx.update(docRef, { ...record });
        } else {
          if (record.status !== 'DRAFT') throw new Error('신규 급여는 임시저장 상태로 생성해야 합니다.');
          tx.set(docRef, record);
        }
      });
      return record;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `payrolls/${pId}`);
    }
  },

  // Compatibility entrypoint: all confirmations MUST use the same atomic
  // payroll + audit-log transition as the ledger confirmation flow.
  // The former implementation wrote only status/updatedById, which is rejected
  // by firestore.rules (confirmedById is mandatory) and had no audit entry.
  async confirmPayroll(id: string, actorId: string): Promise<void> {
    await this.transitionPayrollStatus({
      payrollIds: [id],
      expectedStatus: 'DRAFT',
      nextStatus: 'CONFIRMED',
      actorUserId: actorId,
      actorRole: 'ADMIN',
      actorName: auth.currentUser?.displayName || '관리자',
    });
  },

  // CRITICAL [추가근무 불러오기]:
  // 1. Same companyId
  // 2. Same belongingYearMonth
  // 3. Same employeeId (matched strictly by employeeId)
  // 4. Valid workType (OVERTIME / HOLIDAY)
  async loadOvertimeForPayroll(
    companyId: string,
    employeeId: string,
    belongingYearMonth: string,
    baseHourlyWage: number
  ): Promise<{
    overtimeHours: number;
    holidayHours: number;
    overtimePay: number;
    holidayPay: number;
  }> {
    if (!companyId?.trim() || !employeeId?.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(belongingYearMonth)) {
      throw new Error('추가근무 급여 계산에 필요한 기업·근로자·귀속연월이 올바르지 않습니다.');
    }
    if (typeof baseHourlyWage !== 'number' || !Number.isFinite(baseHourlyWage) || baseHourlyWage <= 0) {
      throw new Error('추가근무 수당 계산 전에 유효한 시급을 확인해야 합니다.');
    }
    const records = await overtimeService.getOvertimeByEmployee(
      companyId,
      employeeId,
      belongingYearMonth
    );

    let overtimeHours = 0;
    let holidayHours = 0;

    for (const rec of records) {
      if (
        Number.isFinite(rec.hours) && rec.hours > 0 &&
        rec.companyId === companyId &&
        rec.belongingYearMonth === belongingYearMonth &&
        rec.employeeId === employeeId
      ) {
        if (rec.workType === 'OVERTIME') {
          overtimeHours += rec.hours;
        } else if (rec.workType === 'HOLIDAY') {
          holidayHours += rec.hours;
        }
      }
    }

    const overtimePay = Math.round(
      overtimeHours * baseHourlyWage * PAYROLL_POLICY.OVERTIME_MULTIPLIER
    );
    const holidayPay = Math.round(
      holidayHours * baseHourlyWage * PAYROLL_POLICY.HOLIDAY_MULTIPLIER
    );

    return {
      overtimeHours,
      holidayHours,
      overtimePay,
      holidayPay,
    };
  },

  // Requirement 1, 2, 3, 4, 9, 10: Analyze and validate company overtime records
  async analyzeOvertimeForCompany(
    companyId: string,
    belongingYearMonth: string,
    registeredWorkers: Worker[]
  ): Promise<OvertimeAnalysisResult> {
    if (!companyId || !belongingYearMonth) {
      return {
        companyId,
        belongingYearMonth,
        totalRecordsFound: 0,
        validRecordsCount: 0,
        totalOvertimeHours: 0,
        totalHolidayHours: 0,
        matchedWorkersCount: 0,
        aggregatedByWorker: {},
        excludedRecords: [],
      };
    }

    // Bracket the read with source metadata. If a writer changes overtime during
    // analysis, do not present a potentially mixed snapshot as a valid result.
    const beforeMeta = await overtimeService.getOvertimeSyncMeta(companyId, belongingYearMonth);
    const allRecords = await overtimeService.getOvertimeByCompany(companyId);
    const afterMeta = await overtimeService.getOvertimeSyncMeta(companyId, belongingYearMonth);
    if (beforeMeta.sourceVersion !== afterMeta.sourceVersion ||
        beforeMeta.overtimeSourceUpdatedAt !== afterMeta.overtimeSourceUpdatedAt) {
      throw new Error('추가근무 분석 중 원본이 변경되었습니다. 다시 분석해 주세요.');
    }
    const workerMap = new Map<string, Worker>();
    registeredWorkers.forEach((w) => workerMap.set(w.id, w));

    const aggregatedByWorker: OvertimeAnalysisResult['aggregatedByWorker'] = {};
    const excludedRecords: ExcludedOvertimeItem[] = [];
    let validRecordsCount = 0;
    let totalOvertimeHours = 0;
    let totalHolidayHours = 0;

    for (const rec of allRecords) {
      // 1. Company check (Requirement 1: 타사 기록 절대 배제)
      if (rec.companyId !== companyId) {
        excludedRecords.push({
          recordId: rec.id,
          workDate: rec.workDate,
          employeeId: rec.employeeId,
          employeeName: rec.employeeName,
          workType: rec.workType,
          hours: rec.hours,
          reason: '해당 기업 근로자 아님 (companyId 불일치)',
        });
        continue;
      }

      // 2. Year-Month check (Requirement 1: 다른 귀속연월 기록 배제)
      if (rec.belongingYearMonth !== belongingYearMonth) {
        excludedRecords.push({
          recordId: rec.id,
          workDate: rec.workDate,
          employeeId: rec.employeeId,
          employeeName: rec.employeeName,
          workType: rec.workType,
          hours: rec.hours,
          reason: `귀속연월 불일치 (${rec.belongingYearMonth || '미지정'} != ${belongingYearMonth})`,
        });
        continue;
      }

      // 3. Employee ID check (Requirement 2: 반드시 employeeId 기준)
      if (!rec.employeeId || rec.employeeId.trim() === '') {
        excludedRecords.push({
          recordId: rec.id,
          workDate: rec.workDate,
          employeeId: rec.employeeId,
          employeeName: rec.employeeName,
          workType: rec.workType,
          hours: rec.hours,
          reason: 'employeeId 없음',
        });
        continue;
      }

      const matchedWorker = workerMap.get(rec.employeeId);
      if (!matchedWorker || matchedWorker.companyId !== companyId) {
        excludedRecords.push({
          recordId: rec.id,
          workDate: rec.workDate,
          employeeId: rec.employeeId,
          employeeName: rec.employeeName,
          workType: rec.workType,
          hours: rec.hours,
          reason: `해당 기업 소속 근로자 명단에 없음 (사번: ${rec.employeeId})`,
        });
        continue;
      }

      // 4. Work Type check (Requirement 3: 연장근무, 휴무일근무 대상만 허용)
      if (rec.workType !== 'OVERTIME' && rec.workType !== 'HOLIDAY') {
        excludedRecords.push({
          recordId: rec.id,
          workDate: rec.workDate,
          employeeId: rec.employeeId,
          employeeName: rec.employeeName,
          workType: rec.workType,
          hours: rec.hours,
          reason: `근무 구분 미지정 또는 제외 대상 구분 (${rec.workType || '없음'})`,
        });
        continue;
      }

      // 5. Hours check
      if (typeof rec.hours !== 'number' || !Number.isFinite(rec.hours) || rec.hours <= 0) {
        excludedRecords.push({
          recordId: rec.id,
          workDate: rec.workDate,
          employeeId: rec.employeeId,
          employeeName: rec.employeeName,
          workType: rec.workType,
          hours: rec.hours,
          reason: `근무 시간 0 이하 (${rec.hours}시간)`,
        });
        continue;
      }

      // Valid record: Aggregate strictly by employeeId (Requirement 4)
      validRecordsCount++;
      if (!aggregatedByWorker[rec.employeeId]) {
        aggregatedByWorker[rec.employeeId] = {
          employeeId: rec.employeeId,
          employeeName: matchedWorker.name,
          overtimeHours: 0,
          holidayWorkHours: 0,
        };
      }

      if (rec.workType === 'OVERTIME') {
        aggregatedByWorker[rec.employeeId].overtimeHours += rec.hours;
        totalOvertimeHours += rec.hours;
      } else if (rec.workType === 'HOLIDAY') {
        aggregatedByWorker[rec.employeeId].holidayWorkHours += rec.hours;
        totalHolidayHours += rec.hours;
      }
    }

    return {
      companyId,
      belongingYearMonth,
      sourceRevision: afterMeta.overtimeSourceUpdatedAt,
      sourceVersion: afterMeta.sourceVersion,
      totalRecordsFound: allRecords.length,
      validRecordsCount,
      totalOvertimeHours,
      totalHolidayHours,
      matchedWorkersCount: Object.keys(aggregatedByWorker).length,
      aggregatedByWorker,
      excludedRecords,
    };
  },

  // Requirement 7, 8, 11, 12, 13, 14: Batch synchronize attendance records into payrolls
  async importOvertimeToPayrolls({
    companyId,
    belongingYearMonth,
    registeredWorkers,
    analysis,
    actorUserId,
    actorRole,
    actorName,
  }: {
    companyId: string;
    belongingYearMonth: string;
    registeredWorkers: Worker[];
    analysis: OvertimeAnalysisResult;
    actorUserId: string;
    actorRole: UserRole;
    actorName: string;
  }): Promise<OvertimeImportExecutionResult> {
    // The synchronization marker is ADMIN-write-only under firestore.rules.
    // Reject an unauthorized role before preparing any payroll writes.
    if (actorRole !== 'ADMIN') {
      throw new Error('추가근무 급여 일괄 반영은 관리자만 실행할 수 있습니다.');
    }
    if (!auth.currentUser || auth.currentUser.uid !== actorUserId) {
      throw new Error('로그인한 관리자와 급여 반영 요청자가 일치하지 않습니다.');
    }
    if (!companyId?.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(belongingYearMonth)) {
      throw new Error('기업과 올바른 귀속연월이 필요합니다.');
    }
    if (!actorUserId?.trim() || !Array.isArray(registeredWorkers) || !analysis ||
        analysis.companyId !== companyId || analysis.belongingYearMonth !== belongingYearMonth) {
      throw new Error('급여 반영 요청과 분석 결과의 기업·귀속연월이 일치하지 않습니다.');
    }
    const workerIds = new Set<string>();
    for (const worker of registeredWorkers) {
      if (!worker.id?.trim() || workerIds.has(worker.id) || worker.companyId !== companyId) {
        throw new Error('근로자 목록에 중복되거나 다른 기업의 근로자가 포함되어 있습니다.');
      }
      workerIds.add(worker.id);
    }
    if (Object.keys(analysis.aggregatedByWorker).some(id => !workerIds.has(id))) {
      throw new Error('분석 결과에 소속이 확인되지 않은 근로자가 포함되어 있습니다.');
    }
    const existingPayrolls = await this.getPayrollsByCompany(companyId, belongingYearMonth);
    const existingMap = new Map<string, PayrollRecord>();
    existingPayrolls.forEach((p) => {
      if (p.companyId !== companyId || p.belongingYearMonth !== belongingYearMonth ||
          !p.employeeId?.trim() || existingMap.has(p.employeeId)) {
        throw new Error('급여대장에 다른 기업·귀속연월 또는 중복 근로자 기록이 있습니다. 먼저 정리해 주세요.');
      }
      existingMap.set(p.employeeId, p);
    });

    // Workers that need synchronization: either have attendance records or previously had overtime recorded
    const targetWorkers = registeredWorkers.filter(
      (w) =>
        analysis.aggregatedByWorker[w.id] !== undefined ||
        existingMap.get(w.id)?.overtimeHours ||
        existingMap.get(w.id)?.holidayWorkHours
    );

    const importedAt = new Date().toISOString();
    const details: OvertimeImportExecutionResult['details'] = [];
    const skippedLockedEmployees: string[] = [];
    const pendingPayrolls: PayrollRecord[] = [];

    for (const worker of targetWorkers) {
      const agg = analysis.aggregatedByWorker[worker.id] || {
        overtimeHours: 0,
        holidayWorkHours: 0,
      };
      const existing = existingMap.get(worker.id);

      // Requirement 6 & 7: DRAFT is imported normally, but CONFIRMED or PAID must NEVER be auto-modified!
      if (existing && (existing.status === 'CONFIRMED' || existing.status === 'PAID')) {
        skippedLockedEmployees.push(worker.name);
        details.push({
          employeeId: worker.id,
          employeeName: worker.name,
          overtimeHours: agg.overtimeHours,
          holidayWorkHours: agg.holidayWorkHours,
          overtimePay: existing.overtimePay || 0,
          holidayPay: existing.holidayPay || 0,
          wageStatus: existing.wageStatus,
          skippedLocked: true,
        });
        continue;
      }

      // Hourly wage resolution (Requirement 5 & 6)
      const hourlyWage = worker.hourlyWage || existing?.hourlyWage;
      let overtimePay = 0;
      let holidayPay = 0;
      let wageStatus: 'CONFIRMED' | 'NEEDS_CONFIRMATION' | undefined = undefined;

      if (hourlyWage && hourlyWage > 0) {
        // Requirement 5: 1.5 multiplier
        overtimePay = Math.round(agg.overtimeHours * hourlyWage * PAYROLL_POLICY.OVERTIME_MULTIPLIER);
        holidayPay = Math.round(
          agg.holidayWorkHours * hourlyWage * PAYROLL_POLICY.HOLIDAY_MULTIPLIER
        );
        wageStatus = 'CONFIRMED';
      } else if (agg.overtimeHours > 0 || agg.holidayWorkHours > 0) {
        // Requirement 6: Do not calculate arbitrary amount if hourly wage not set
        overtimePay = 0;
        holidayPay = 0;
        wageStatus = 'NEEDS_CONFIRMATION';
      }

      // Requirement 14: Preserve existing manually entered pay items and deductions!
      let payItems: PayItem[] = [];
      let deductionItems: DeductionItem[] = [];

      if (existing && existing.payItems && existing.payItems.length > 0) {
        payItems = existing.payItems.map((item) => {
          if (item.name === '연장근로수당') {
            return { ...item, amount: overtimePay };
          }
          if (item.name === '휴일근로수당') {
            return { ...item, amount: holidayPay };
          }
          return item;
        });

        // If standard items were not present, append them
        if (!payItems.some((p) => p.name === '연장근로수당')) {
          payItems.push({
            id: `pi_ot_${Date.now()}`,
            name: '연장근로수당',
            amount: overtimePay,
            isTaxable: true,
          });
        }
        if (!payItems.some((p) => p.name === '휴일근로수당')) {
          payItems.push({
            id: `pi_hol_${Date.now()}`,
            name: '휴일근로수당',
            amount: holidayPay,
            isTaxable: true,
          });
        }
        deductionItems = existing.deductionItems || [];
      } else {
        // Brand new payroll record for this worker
        payItems = [
          { id: `pi_0_${Date.now()}`, name: '기본급', amount: 0, isTaxable: true },
          { id: `pi_1_${Date.now()}`, name: '각종 수당', amount: 0, isTaxable: true },
          { id: `pi_2_${Date.now()}`, name: '연장근로수당', amount: overtimePay, isTaxable: true },
          { id: `pi_3_${Date.now()}`, name: '휴일근로수당', amount: holidayPay, isTaxable: true },
          { id: `pi_4_${Date.now()}`, name: '기타 지급', amount: 0, isTaxable: false },
        ];
        deductionItems = [
          { id: `di_0_${Date.now()}`, name: '국민연금', amount: 0 },
          { id: `di_1_${Date.now()}`, name: '건강보험', amount: 0 },
          { id: `di_2_${Date.now()}`, name: '장기요양보험', amount: 0 },
          { id: `di_3_${Date.now()}`, name: '고용보험', amount: 0 },
          { id: `di_4_${Date.now()}`, name: '소득세', amount: 0 },
          { id: `di_5_${Date.now()}`, name: '지방소득세', amount: 0 },
          { id: `di_6_${Date.now()}`, name: '기타 공제', amount: 0 },
        ];
      }

      // Requirement 13: Strict validation of companyId, employeeId, belongingYearMonth
      if (companyId !== worker.companyId) {
        throw new Error(`근로자 ${worker.name}(${worker.id})의 소속 회사 ID가 일치하지 않습니다.`);
      }

      // Save updated payroll with requirement 12 fields
      const payrollData: Parameters<typeof preparePayrollRecord>[0] = {
        companyId,
        employeeId: worker.id,
        employeeName: worker.name,
        department: worker.department,
        position: worker.position,
        belongingYearMonth,
        payItems,
        deductionItems,
        totalPay: payItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
        totalDeduction: deductionItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
        netPay:
          payItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) -
          deductionItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
        overtimeHours: agg.overtimeHours,
        holidayHours: agg.holidayWorkHours,
        holidayWorkHours: agg.holidayWorkHours,
        overtimePay,
        holidayPay,
        hourlyWage: hourlyWage || undefined,
        wageStatus,
        overtimeImportedAt: importedAt,
        status: existing?.status || 'DRAFT',
        maternityNote: existing?.maternityNote,
        createdById: existing?.createdById || actorUserId,
        updatedById: actorUserId,
        createdAt: existing?.createdAt,
      };

      const payrollId = `pr_${companyId}_${worker.id}_${belongingYearMonth.replace('-', '')}`;
      pendingPayrolls.push(preparePayrollRecord(payrollData, payrollId, importedAt));

      details.push({
        employeeId: worker.id,
        employeeName: worker.name,
        overtimeHours: agg.overtimeHours,
        holidayWorkHours: agg.holidayWorkHours,
        overtimePay,
        holidayPay,
        wageStatus,
      });
    }

    if (skippedLockedEmployees.length > 0) {
      throw new Error(`확정·지급완료 급여 ${skippedLockedEmployees.length}건이 있어 전체 반영을 중단했습니다. 잠긴 급여를 확인해 주세요.`);
    }
    const unconfirmedWages = details.filter(d => d.wageStatus === 'NEEDS_CONFIRMATION');
    if (unconfirmedWages.length > 0) {
      throw new Error(`시급 미확인 근로자 ${unconfirmedWages.length}명의 추가근무수당을 계산할 수 없습니다. 시급을 확인한 뒤 다시 반영해 주세요.`);
    }

    // A single transaction commits every DRAFT payroll and the synchronization marker.
    // Never acknowledge a partial import or a source change during processing.
    // Keep a conservative limit to avoid Firestore transaction request-size limits.
    if (pendingPayrolls.length > 100) {
      throw new Error('한 번에 반영할 수 있는 근로자는 최대 100명입니다. 나누어 처리하지 말고 관리자에게 문의해 주세요.');
    }
    const syncId = `sync_${companyId}_${belongingYearMonth.replace('-', '')}`;
    const syncRef = doc(db, 'overtime_sync_meta', syncId);
    // Create the audit document before retryable transaction callback. It is
    // committed together with payrolls and the sync marker, never afterwards.
    const auditRef = doc(collection(db, 'audit_logs'));
    const auditDetails = sanitizeAuditDetails({
      companyId, belongingYearMonth, updatedWorkersCount: pendingPayrolls.length,
      excludedCount: analysis.excludedRecords.length,
      totalOvertimeHours: analysis.totalOvertimeHours,
      totalHolidayHours: analysis.totalHolidayHours,
      importedAt,
    });
    const auditRecord = {
      id: auditRef.id, actorUserId, actorRole, actorName, companyId,
      action: '추가근무_급여연동', resourceType: 'PAYROLL',
      resourceId: `import_${companyId}_${belongingYearMonth}`,
      timestamp: importedAt,
      details: auditDetails && typeof auditDetails === 'object' ? auditDetails : {},
    };
    await runTransaction(db, async tx => {
      const syncSnap = await tx.get(syncRef);
      const payrollRefs = pendingPayrolls.map(p => doc(db, 'payrolls', p.id));
      // Firestore requires all reads before the first write.
      const payrollSnaps = await Promise.all(payrollRefs.map(ref => tx.get(ref)));
      const sourceUpdatedAt = syncSnap.exists() ? syncSnap.data()?.overtimeSourceUpdatedAt : null;
      const currentSourceVersion = syncSnap.exists() ? syncSnap.data()?.sourceVersion : undefined;
      // Reject analyses from old clients or unversioned metadata: timestamps
      // alone cannot detect multiple edits within the same millisecond.
      if (!Number.isSafeInteger(analysis.sourceVersion) || analysis.sourceVersion! < 0 ||
          currentSourceVersion !== analysis.sourceVersion) {
        throw new Error('추가근무 원본 버전이 없거나 변경되었습니다. 다시 분석해 주세요.');
      }
      // Compare with the revision used for analysis, not with the later import
      // timestamp: the old comparison accepted edits made after analysis.
      if (analysis.sourceRevision !== undefined &&
          (sourceUpdatedAt ?? null) !== analysis.sourceRevision) {
        throw new Error('추가근무 분석 이후 원본이 변경되었습니다. 다시 분석해 주세요.');
      }
      if (analysis.sourceRevision === undefined && sourceUpdatedAt != null) {
        throw new Error('추가근무 원본 변경 검증을 위한 분석 버전이 없습니다. 다시 분석해 주세요.');
      }
      for (let i = 0; i < pendingPayrolls.length; i++) {
        const record = pendingPayrolls[i];
        const snap = payrollSnaps[i];
        if (snap.exists()) {
          const old = snap.data() as PayrollRecord;
          if (old.status !== 'DRAFT' || old.companyId !== companyId ||
              old.employeeId !== record.employeeId || old.belongingYearMonth !== belongingYearMonth ||
              old.updatedAt !== existingMap.get(record.employeeId)?.updatedAt) {
            throw new Error('급여가 다른 사용자에 의해 확정되거나 변경되었습니다. 다시 불러와 주세요.');
          }
          record.createdAt = old.createdAt;
          tx.update(payrollRefs[i], { ...record });
        } else {
          tx.set(payrollRefs[i], record);
        }
      }
      tx.set(syncRef, {
        id: syncId, companyId, belongingYearMonth,
        overtimeImportedAt: importedAt, lastImportedById: actorUserId,
        lastAction: 'IMPORTED', updatedAt: importedAt,
      }, { merge: true });
      tx.set(auditRef, auditRecord);
    });

    return {
      updatedWorkersCount: details.filter((d) => !d.skippedLocked).length,
      skippedLockedCount: skippedLockedEmployees.length,
      skippedLockedEmployees,
      excludedCount: analysis.excludedRecords.length,
      importedAt,
      details,
    };
  },

  // Requirement 3: Pre-confirmation validation warnings
  validatePayrollLedgerForConfirmation(
    registeredWorkers: Worker[],
    payrolls: PayrollRecord[]
  ): PayrollValidationIssue[] {
    const issues: PayrollValidationIssue[] = [];
    const payrollMap = new Map<string, PayrollRecord>();
    payrolls.forEach((p) => payrollMap.set(p.employeeId, p));

    for (const worker of registeredWorkers) {
      if (worker.status === 'resigned') continue;

      const payroll = payrollMap.get(worker.id);
      if (!payroll) {
        issues.push({
          employeeId: worker.id,
          workerName: worker.name,
          type: 'MISSING_DATA',
          message: '급여 데이터가 작성되지 않았습니다. (미작성 상태)',
        });
        continue;
      }

      // Check unset hourly wage
      const otHours = payroll.overtimeHours || 0;
      const holHours = payroll.holidayWorkHours || payroll.holidayHours || 0;
      if (
        (otHours > 0 || holHours > 0) &&
        (!payroll.hourlyWage || payroll.wageStatus === 'NEEDS_CONFIRMATION')
      ) {
        issues.push({
          employeeId: worker.id,
          workerName: worker.name,
          type: 'UNSET_WAGE',
          message: `출근부 추가근무(${otHours + holHours}시간)가 있으나 통상시급이 설정되지 않았습니다. (통상시급 확인 필요)`,
        });
      }

      // Check calculation values
      const calculatedPay = (payroll.payItems || []).reduce(
        (acc, curr) => acc + (Number(curr.amount) || 0),
        0
      );
      const calculatedDeduction = (payroll.deductionItems || []).reduce(
        (acc, curr) => acc + (Number(curr.amount) || 0),
        0
      );
      const calculatedNet = calculatedPay - calculatedDeduction;

      if (
        payroll.totalPay !== calculatedPay ||
        payroll.totalDeduction !== calculatedDeduction ||
        payroll.netPay !== calculatedNet
      ) {
        issues.push({
          employeeId: worker.id,
          workerName: worker.name,
          type: 'CALCULATION_MISMATCH',
          message: `급여 계산값 불일치 (기록된 실수령 ${payroll.netPay.toLocaleString()}원 != 계산값 ${calculatedNet.toLocaleString()}원)`,
        });
      }
    }

    return issues;
  },

  // Atomic status transitions: the payroll records and audit trail are committed
  // together. A concurrent status change aborts the entire ledger operation.
  async transitionPayrollStatus({
    payrollIds, companyId, belongingYearMonth, expectedStatus, nextStatus,
    actorUserId, actorRole, actorName, cancellationReason, companyName, paymentDate,
  }: {
    payrollIds: string[];
    companyId?: string;
    belongingYearMonth?: string;
    expectedStatus: PayrollStatus;
    nextStatus: PayrollStatus;
    actorUserId: string;
    actorRole: UserRole;
    actorName: string;
    cancellationReason?: string;
    companyName?: string;
    paymentDate?: string;
  }): Promise<number> {
    if (actorRole !== 'ADMIN' || auth.currentUser?.uid !== actorUserId) {
      throw new Error('급여 상태 변경은 로그인한 관리자만 수행할 수 있습니다.');
    }
    if (!Array.isArray(payrollIds)) throw new Error('급여 목록이 올바르지 않습니다.');
    if (payrollIds.length === 0) return 0;
    if (payrollIds.length > 100 || new Set(payrollIds).size !== payrollIds.length ||
        payrollIds.some(id => typeof id !== 'string' || !id.trim())) {
      throw new Error('급여 상태 변경은 중복 없이 최대 100건까지 가능합니다.');
    }
    const allowed = (expectedStatus === 'DRAFT' && nextStatus === 'CONFIRMED') ||
      (expectedStatus === 'CONFIRMED' && (nextStatus === 'DRAFT' || nextStatus === 'PAID'));
    if (!allowed) throw new Error('허용되지 않는 급여 상태 변경입니다.');
    const reason = cancellationReason?.trim();
    if (nextStatus === 'DRAFT' && !reason) throw new Error('확정 취소 사유를 반드시 입력해야 합니다.');
    if (belongingYearMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(belongingYearMonth)) {
      throw new Error('올바른 귀속연월이 필요합니다.');
    }
    if (paymentDate && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(paymentDate)) {
      throw new Error('올바른 지급일 형식이 필요합니다.');
    }
    const now = new Date().toISOString();
    const payrollRefs = payrollIds.map(id => doc(db, 'payrolls', id));
    const auditRefs = payrollIds.map(() => doc(collection(db, 'audit_logs')));
    await runTransaction(db, async tx => {
      // All transaction reads must finish before any write.
      const snapshots = await Promise.all(payrollRefs.map(ref => tx.get(ref)));
      for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        if (!snap.exists()) throw new Error('급여 기록을 찾을 수 없습니다. 다시 조회해 주세요.');
        const record = snap.data() as PayrollRecord;
        if (record.status !== expectedStatus) {
          throw new Error('급여 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
        }
        if ((companyId && record.companyId !== companyId) ||
            (belongingYearMonth && record.belongingYearMonth !== belongingYearMonth)) {
          throw new Error('다른 기업 또는 귀속연월의 급여가 포함되어 있습니다.');
        }
      }
      for (let i = 0; i < snapshots.length; i++) {
        const record = snapshots[i].data() as PayrollRecord;
        const patch: Record<string, unknown> = {
          status: nextStatus, updatedAt: now, updatedById: actorUserId,
        };
        if (nextStatus === 'CONFIRMED') {
          patch.confirmedAt = now;
          patch.confirmedById = actorUserId;
          if (companyName) patch.companyName = companyName;
          if (paymentDate) patch.paymentDate = paymentDate;
        } else if (nextStatus === 'DRAFT') {
          patch.cancelledAt = now;
          patch.cancelledById = actorUserId;
          patch.cancellationReason = reason;
        } else {
          patch.paidAt = now;
          patch.paidById = actorUserId;
        }
        tx.update(payrollRefs[i], patch);
        const details = sanitizeAuditDetails({
          employeeId: record.employeeId,
          employeeName: record.employeeName,
          belongingYearMonth: record.belongingYearMonth,
          previousStatus: expectedStatus,
          nextStatus,
          cancellationReason: reason,
        });
        tx.set(auditRefs[i], {
          id: auditRefs[i].id, actorUserId, actorRole, actorName,
          companyId: record.companyId,
          action: nextStatus === 'CONFIRMED' ? 'PAYROLL_CONFIRMED' :
            nextStatus === 'PAID' ? 'PAYROLL_MARKED_PAID' : 'PAYROLL_CONFIRMATION_CANCELLED',
          resourceType: 'PAYROLL', resourceId: payrollIds[i], timestamp: now,
          details: details && typeof details === 'object' ? details : {},
        });
      }
    });
    return payrollIds.length;
  },

  async confirmPayrollLedger(args: {
    companyId: string; belongingYearMonth: string; companyName?: string; paymentDate?: string;
    actorUserId: string; actorRole: UserRole; actorName: string;
  }): Promise<{ confirmedCount: number }> {
    const list = await this.getPayrollsByCompany(args.companyId, args.belongingYearMonth);
    // Never silently skip locked records when confirming a complete ledger.
    if (list.some(p => p.status !== 'DRAFT')) {
      throw new Error('확정 또는 지급완료 급여가 포함되어 있습니다. 급여대장을 다시 확인해 주세요.');
    }
    const confirmedCount = await this.transitionPayrollStatus({
      ...args, paymentDate: args.paymentDate || `${args.belongingYearMonth}-25`,
      payrollIds: list.map(p => p.id), expectedStatus: 'DRAFT', nextStatus: 'CONFIRMED',
    });
    return { confirmedCount };
  },

  async confirmSinglePayroll(args: {
    payrollId: string; companyName?: string; paymentDate?: string;
    actorUserId: string; actorRole: UserRole; actorName: string;
  }): Promise<void> {
    await this.transitionPayrollStatus({
      ...args, payrollIds: [args.payrollId], expectedStatus: 'DRAFT', nextStatus: 'CONFIRMED',
    });
  },

  async cancelPayrollConfirmation(args: {
    payrollId: string; cancellationReason: string;
    actorUserId: string; actorRole: UserRole; actorName: string;
  }): Promise<void> {
    await this.transitionPayrollStatus({
      ...args, payrollIds: [args.payrollId], expectedStatus: 'CONFIRMED', nextStatus: 'DRAFT',
    });
  },

  async cancelPayrollLedgerConfirmation(args: {
    companyId: string; belongingYearMonth: string; cancellationReason: string;
    actorUserId: string; actorRole: UserRole; actorName: string;
  }): Promise<{ cancelledCount: number }> {
    if (!args.cancellationReason?.trim()) throw new Error('확정 취소 사유를 반드시 입력해야 합니다.');
    const list = await this.getPayrollsByCompany(args.companyId, args.belongingYearMonth);
    if (list.some(p => p.status === 'PAID')) {
      throw new Error('지급완료 급여가 포함되어 있어 일괄 확정 취소할 수 없습니다.');
    }
    const cancelledCount = await this.transitionPayrollStatus({
      ...args, payrollIds: list.filter(p => p.status === 'CONFIRMED').map(p => p.id),
      expectedStatus: 'CONFIRMED', nextStatus: 'DRAFT',
    });
    return { cancelledCount };
  },

  async markPayrollPaid(args: {
    payrollId: string; actorUserId: string; actorRole: UserRole; actorName: string;
  }): Promise<void> {
    await this.transitionPayrollStatus({
      ...args, payrollIds: [args.payrollId], expectedStatus: 'CONFIRMED', nextStatus: 'PAID',
    });
  },

  async markPayrollLedgerPaid(args: {
    companyId: string; belongingYearMonth: string;
    actorUserId: string; actorRole: UserRole; actorName: string;
  }): Promise<{ paidCount: number }> {
    const list = await this.getPayrollsByCompany(args.companyId, args.belongingYearMonth);
    if (list.some(p => p.status === 'DRAFT')) {
      throw new Error('작성중 급여가 포함되어 있어 일괄 지급완료할 수 없습니다.');
    }
    const paidCount = await this.transitionPayrollStatus({
      ...args, payrollIds: list.filter(p => p.status === 'CONFIRMED').map(p => p.id),
      expectedStatus: 'CONFIRMED', nextStatus: 'PAID',
    });
    return { paidCount };
  },
};
