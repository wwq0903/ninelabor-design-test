import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  runTransaction,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { OvertimeRecord, Worker } from '../types';

export interface OvertimeValidationResult {
  isValid: boolean;
  errors: string[];
}

// Stable, collision-resistant document identity for a logical overtime entry.
// All new clients must use this path; historical random-ID records remain readable.
export async function overtimeDocumentId(data: Pick<OvertimeRecord, 'companyId' | 'employeeId' | 'workDate' | 'workType'>): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('보안 연결(HTTPS)이 필요합니다. 추가근무를 저장할 수 없습니다.');
  const key = JSON.stringify([data.companyId, data.employeeId, data.workDate, data.workType]);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return `ot_v2_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

// A Firestore transaction retries when this metadata document changes. Unlike
// ISO timestamps, an integer revision cannot collide for same-millisecond edits.
function nextSourceVersion(snapshot: { exists(): boolean; data(): any }): number {
  const previous = snapshot.exists() ? snapshot.data()?.sourceVersion : undefined;
  if (previous !== undefined && (!Number.isSafeInteger(previous) || previous < 0)) {
    throw new Error('추가근무 원본 버전이 손상되었습니다. 관리자에게 문의해 주세요.');
  }
  if (previous === Number.MAX_SAFE_INTEGER) throw new Error('추가근무 원본 버전 한도를 초과했습니다.');
  return (previous ?? 0) + 1;
}

export const overtimeService = {
  // Requirement 1, 2, 3, 4: Strict validation function for overtime data
  validateOvertimeData(data: {
    companyId: string;
    employeeId: string;
    workDate: string;
    belongingYearMonth: string;
    workType: string;
    hours: any;
    expectedCompanyWorkers?: Worker[];
  }): OvertimeValidationResult {
    const errors: string[] = [];

    // 1. Company ID
    if (!data.companyId || typeof data.companyId !== 'string' || data.companyId.trim() === '') {
      errors.push('기업 ID(companyId)가 누락되었습니다.');
    }

    // 2. Employee ID & Worker Affiliation Check
    if (!data.employeeId || typeof data.employeeId !== 'string' || data.employeeId.trim() === '') {
      errors.push('근로자 ID(employeeId)가 누락되었습니다.');
    } else if (data.expectedCompanyWorkers) {
      const isAffiliated = data.expectedCompanyWorkers.some(
        (w) => w.id === data.employeeId && w.companyId === data.companyId
      );
      if (!isAffiliated) {
        errors.push(`선택한 근로자(사번: ${data.employeeId})는 현재 기업 소속이 아닙니다.`);
      }
    }

    // 3. Work Date Format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!data.workDate || !dateRegex.test(data.workDate)) {
      errors.push('근무일자는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.');
    } else {
      const parsedDate = new Date(`${data.workDate}T00:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== data.workDate) {
        errors.push('근무일자가 유효한 날짜가 아닙니다.');
      }
    }

    // 4. Belonging Year Month Format (YYYY-MM) & Work Date Strict Match (Requirement 1)
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!data.belongingYearMonth || !monthRegex.test(data.belongingYearMonth)) {
      errors.push('귀속연월은 YYYY-MM 형식이어야 합니다.');
    } else if (data.workDate && dateRegex.test(data.workDate)) {
      const derivedMonth = data.workDate.substring(0, 7);
      if (derivedMonth !== data.belongingYearMonth) {
        errors.push(
          `근무일자(${data.workDate})의 연월(${derivedMonth})이 선택된 귀속연월(${data.belongingYearMonth})과 일치하지 않습니다. 해당 월의 날짜만 저장할 수 있습니다.`
        );
      }
    }

    // 5. Work Type Validation (Requirement 3: OVERTIME, HOLIDAY only)
    if (!data.workType || (data.workType !== 'OVERTIME' && data.workType !== 'HOLIDAY')) {
      errors.push(
        `근무구분은 연장근무(OVERTIME) 또는 휴무일근무(HOLIDAY) 중 하나여야 합니다. (입력값: ${data.workType || '미지정'})`
      );
    }

    // 6. Hours Validation (Requirement 2: Number, > 0, no NaN, no null)
    if (
      data.hours === undefined ||
      data.hours === null ||
      data.hours === '' ||
      typeof data.hours !== 'number' ||
      isNaN(data.hours)
    ) {
      errors.push('근무시간은 유효한 숫자여야 합니다.');
    } else if (!Number.isFinite(data.hours)) {
      errors.push('근무시간은 유한한 숫자여야 합니다.');
    } else if (data.hours <= 0) {
      errors.push(`근무시간은 0보다 큰 양수여야 합니다. (입력값: ${data.hours})`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  // Requirement 5 & 6: Check for duplicate records
  async findDuplicateRecord({
    companyId,
    employeeId,
    workDate,
    workType,
    excludeRecordId,
  }: {
    companyId: string;
    employeeId: string;
    workDate: string;
    workType: string;
    excludeRecordId?: string;
  }): Promise<OvertimeRecord | null> {
    if (!companyId || !employeeId || !workDate || !workType) return null;

    const colRef = collection(db, 'overtime_records');
    try {
      const q = query(
        colRef,
        where('companyId', '==', companyId),
        where('employeeId', '==', employeeId),
        where('workDate', '==', workDate)
      );
      const snap = await getDocs(q);
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as OvertimeRecord))
        .filter((rec) => {
          if (excludeRecordId && rec.id === excludeRecordId) return false;
          return rec.workType === workType;
        });

      return matches.length > 0 ? matches[0] : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'overtime_records/duplicate-check');
      throw error;
    }
  },

  async getOvertimeByCompany(
    companyId: string,
    belongingYearMonth?: string
  ): Promise<OvertimeRecord[]> {
    if (!companyId) return [];
    const colRef = collection(db, 'overtime_records');
    try {
      const q = belongingYearMonth
        ? query(
            colRef,
            where('companyId', '==', companyId),
            where('belongingYearMonth', '==', belongingYearMonth)
          )
        : query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OvertimeRecord));
      return records.sort((a, b) => (b.workDate || '').localeCompare(a.workDate || ''));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `overtime_records?companyId=${companyId}`);
      throw error;
    }
  },

  async getOvertimeByEmployee(
    companyId: string,
    employeeId: string,
    belongingYearMonth?: string
  ): Promise<OvertimeRecord[]> {
    if (!companyId || !employeeId) return [];
    const colRef = collection(db, 'overtime_records');
    try {
      const q = belongingYearMonth
        ? query(
            colRef,
            where('companyId', '==', companyId),
            where('employeeId', '==', employeeId),
            where('belongingYearMonth', '==', belongingYearMonth)
          )
        : query(
            colRef,
            where('companyId', '==', companyId),
            where('employeeId', '==', employeeId)
          );
      const snap = await getDocs(q);
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OvertimeRecord));
      return records.sort((a, b) => (b.workDate || '').localeCompare(a.workDate || ''));
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.LIST,
        `overtime_records?companyId=${companyId}&employeeId=${employeeId}`
      );
      throw error;
    }
  },

  async createOvertimeRecord(
    data: Omit<OvertimeRecord, 'id' | 'createdAt' | 'updatedAt'>,
    expectedCompanyWorkers?: Worker[]
  ): Promise<OvertimeRecord> {
    // Requirement 4: Strict validation before creation
    const validation = this.validateOvertimeData({
      companyId: data.companyId,
      employeeId: data.employeeId,
      workDate: data.workDate,
      belongingYearMonth: data.belongingYearMonth,
      workType: data.workType,
      hours: data.hours,
      expectedCompanyWorkers,
    });
    if (!validation.isValid) {
      throw new Error(`추가근무 기록 검증 오류: ${validation.errors.join(' ')}`);
    }

    // Historical random-ID rows must be checked before creating a canonical row.
    // The canonical document check inside the transaction is the concurrency barrier
    // between clients running this version (legacy clients require migration).
    const legacy = await this.findDuplicateRecord(data);
    if (legacy) throw new Error('동일 근로자·근무일·근무구분의 추가근무 기록이 이미 존재합니다.');
    const oId = await overtimeDocumentId(data);
    const docRef = doc(db, 'overtime_records', oId);
    const now = new Date().toISOString();
    const record: OvertimeRecord = {
      ...data,
      id: oId,
      memo: data.memo ?? data.note,
      note: data.note ?? data.memo,
      createdById: data.createdById ?? data.authorId,
      updatedById: data.createdById ?? data.authorId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const syncId = `sync_${data.companyId}_${data.belongingYearMonth.replace('-', '')}`;
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(docRef);
        const syncRef = doc(db, 'overtime_sync_meta', syncId);
        const syncSnap = await tx.get(syncRef);
        if (existing.exists()) throw new Error('동일 추가근무 기록이 이미 존재합니다.');
        tx.set(docRef, record);
        tx.set(syncRef, {
          sourceVersion: nextSourceVersion(syncSnap),
          id: syncId, companyId: data.companyId, belongingYearMonth: data.belongingYearMonth,
          overtimeSourceUpdatedAt: now, lastAction: 'CREATED',
          updatedById: data.createdById || data.authorId || 'SYSTEM', updatedAt: now,
        }, { merge: true });
      });
      return record;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `overtime_records/${oId}`);
      throw error;
    }
  },

  async updateOvertimeRecord(
    id: string,
    data: Partial<Omit<OvertimeRecord, 'id' | 'createdAt'>>,
    actorUserId?: string,
    expectedCompanyWorkers?: Worker[]
  ): Promise<void> {
    if (!id?.trim()) throw new Error('수정할 추가근무 기록 ID가 필요합니다.');
    const docRef = doc(db, 'overtime_records', id);
    const now = new Date().toISOString();
    try {
      // Read and write atomically: never validate a partial patch without the persisted record.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists()) throw new Error('추가근무 기록을 찾을 수 없습니다.');
        const original = snap.data() as OvertimeRecord;
        if (data.companyId !== undefined && data.companyId !== original.companyId) {
          throw new Error('추가근무 기록의 소속 기업은 변경할 수 없습니다.');
        }
        if (data.employeeId !== undefined && data.employeeId !== original.employeeId) {
          throw new Error('추가근무 기록의 근로자는 변경할 수 없습니다.');
        }
        if (id.startsWith('ot_v2_') && ((data.workDate !== undefined && data.workDate !== original.workDate) || (data.workType !== undefined && data.workType !== original.workType))) {
          throw new Error('중복 방지를 위해 근무일자·근무구분 변경은 삭제 후 재등록해야 합니다.');
        }
        if (data.belongingYearMonth !== undefined && typeof data.belongingYearMonth !== 'string') {
          throw new Error('귀속연월은 문자열이어야 합니다.');
        }
        const merged = { ...original, ...data };
        const validation = this.validateOvertimeData({
          companyId: merged.companyId,
          employeeId: merged.employeeId,
          workDate: merged.workDate,
          belongingYearMonth: merged.belongingYearMonth,
          workType: merged.workType,
          hours: merged.hours,
          expectedCompanyWorkers,
        });
        if (!validation.isValid) throw new Error(validation.errors.join(' '));
        const payload: Record<string, unknown> = { ...data, updatedAt: now };
        delete payload.id;
        delete payload.createdAt;
        delete payload.createdById;
        delete payload.authorId;
        if (actorUserId) payload.updatedById = actorUserId;
        else delete payload.updatedById;
        if (data.memo !== undefined || data.note !== undefined) {
          payload.memo = data.memo ?? data.note;
          payload.note = data.memo ?? data.note;
        }
        // Read both affected metadata documents before ANY transaction write.
        const affectedMonths = [...new Set([merged.belongingYearMonth, original.belongingYearMonth])];
        const metaEntries = await Promise.all(affectedMonths.map(async month => {
          const syncId = `sync_${original.companyId}_${month.replace('-', '')}`;
          const ref = doc(db, 'overtime_sync_meta', syncId);
          return { month, syncId, ref, snap: await tx.get(ref) };
        }));
        tx.update(docRef, payload);
        // Keep source modification markers in the SAME Firestore transaction.
        const markMonth = (month: string) => {
          const syncId = `sync_${original.companyId}_${month.replace('-', '')}`;
          const meta = metaEntries.find(entry => entry.month === month)!;
          tx.set(meta.ref, {
            sourceVersion: nextSourceVersion(meta.snap),
            id: syncId,
            companyId: original.companyId,
            belongingYearMonth: month,
            overtimeSourceUpdatedAt: now,
            lastAction: 'UPDATED',
            updatedById: actorUserId || 'SYSTEM',
            updatedAt: now,
          }, { merge: true });
        };
        markMonth(merged.belongingYearMonth);
        if (original.belongingYearMonth !== merged.belongingYearMonth) markMonth(original.belongingYearMonth);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `overtime_records/${id}`);
    }
  },

  async deleteOvertimeRecord(
    id: string,
    actorUserId?: string
  ): Promise<{ companyId?: string; belongingYearMonth?: string }> {
    const docRef = doc(db, 'overtime_records', id);
    try {
      const deleted = await runTransaction(db, async (tx) => {
        const latest = await tx.get(docRef);
        if (!latest.exists()) throw new Error('삭제할 추가근무 기록을 찾을 수 없습니다.');
        const current = latest.data() as OvertimeRecord;
        const now = new Date().toISOString();
        const syncId = `sync_${current.companyId}_${current.belongingYearMonth.replace('-', '')}`;
        const syncRef = doc(db, 'overtime_sync_meta', syncId);
        const syncSnap = await tx.get(syncRef);
        tx.delete(docRef);
        tx.set(syncRef, {
          sourceVersion: nextSourceVersion(syncSnap),
          id: syncId, companyId: current.companyId, belongingYearMonth: current.belongingYearMonth,
          overtimeSourceUpdatedAt: now, lastAction: 'DELETED',
          updatedById: actorUserId || 'SYSTEM', updatedAt: now,
        }, { merge: true });
        return { companyId: current.companyId, belongingYearMonth: current.belongingYearMonth };
      });
      return deleted;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `overtime_records/${id}`);
    }
  },

  // Requirement 1: Record source modification timestamp in overtime_sync_meta
  async recordOvertimeSourceUpdate(
    companyId: string,
    belongingYearMonth: string,
    action: 'CREATED' | 'UPDATED' | 'DELETED',
    actorUserId?: string
  ): Promise<string> {
    if (!companyId?.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(belongingYearMonth)) {
      throw new Error('기업과 올바른 귀속연월이 필요합니다.');
    }
    const syncId = `sync_${companyId}_${belongingYearMonth.replace('-', '')}`;
    const docRef = doc(db, 'overtime_sync_meta', syncId);
    const now = new Date().toISOString();

    const payload = {
      id: syncId,
      companyId,
      belongingYearMonth,
      overtimeSourceUpdatedAt: now,
      lastAction: action,
      updatedById: actorUserId || 'SYSTEM',
      updatedAt: now,
    };

    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(docRef);
        tx.set(docRef, { ...payload, sourceVersion: nextSourceVersion(snap) }, { merge: true });
      });
      return now;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `overtime_sync_meta/${syncId}`);
    }
  },

  // Requirement 5: Save overtimeImportedAt upon re-sync completion to mark sync as up-to-date
  async recordOvertimeImport(
    companyId: string,
    belongingYearMonth: string,
    importedAt: string,
    actorUserId?: string
  ): Promise<void> {
    if (!companyId?.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(belongingYearMonth)) {
      throw new Error('기업과 올바른 귀속연월이 필요합니다.');
    }
    if (!Number.isFinite(Date.parse(importedAt)) || new Date(importedAt).toISOString() !== importedAt) {
      throw new Error('추가근무 반영 시각이 올바르지 않습니다.');
    }
    const syncId = `sync_${companyId}_${belongingYearMonth.replace('-', '')}`;
    const docRef = doc(db, 'overtime_sync_meta', syncId);

    const payload = {
      id: syncId,
      companyId,
      belongingYearMonth,
      overtimeImportedAt: importedAt,
      lastImportedById: actorUserId || 'SYSTEM',
      lastAction: 'IMPORTED',
      updatedAt: importedAt,
    };

    try {
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(docRef);
        const sourceUpdatedAt = existing.exists() ? existing.data()?.overtimeSourceUpdatedAt : null;
        // A source change made after the import began must never be acknowledged
        // as already imported. Firestore retries this read on concurrent writes.
        if (typeof sourceUpdatedAt === 'string' && sourceUpdatedAt > importedAt) {
          throw new Error('추가근무 기록이 급여 반영 중 변경되었습니다. 다시 불러와 반영해 주세요.');
        }
        tx.set(docRef, payload, { merge: true });
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('급여 반영 중 변경')) throw error;
      handleFirestoreError(error, OperationType.WRITE, `overtime_sync_meta/${syncId}`);
    }
  },

  // Requirement 2 & 3: Retrieve source modification and import timestamps
  async getOvertimeSyncMeta(
    companyId: string,
    belongingYearMonth: string
  ): Promise<{
    overtimeSourceUpdatedAt: string | null;
    overtimeImportedAt: string | null;
    lastAction?: string;
    sourceVersion?: number;
  }> {
    if (!companyId || !belongingYearMonth) {
      return { overtimeSourceUpdatedAt: null, overtimeImportedAt: null };
    }
    const syncId = `sync_${companyId}_${belongingYearMonth.replace('-', '')}`;
    const docRef = doc(db, 'overtime_sync_meta', syncId);

    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          overtimeSourceUpdatedAt: data.overtimeSourceUpdatedAt || null,
          overtimeImportedAt: data.overtimeImportedAt || null,
          lastAction: data.lastAction,
          sourceVersion: data.sourceVersion,
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `overtime_sync_meta/${syncId}`);
    }

    // Fallback: check overtime records max timestamp
    const sourceUpdatedAt = await this.getOvertimeSourceUpdatedAt(companyId, belongingYearMonth);
    return {
      overtimeSourceUpdatedAt: sourceUpdatedAt,
      overtimeImportedAt: null,
    };
  },

  // Retrieve source modification timestamp (with record fallback)
  async getOvertimeSourceUpdatedAt(
    companyId: string,
    belongingYearMonth: string
  ): Promise<string | null> {
    if (!companyId || !belongingYearMonth) return null;
    const syncId = `sync_${companyId}_${belongingYearMonth.replace('-', '')}`;
    const docRef = doc(db, 'overtime_sync_meta', syncId);

    try {
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data()?.overtimeSourceUpdatedAt) {
        return snap.data().overtimeSourceUpdatedAt as string;
      }

      // Fallback: Check max updatedAt from existing overtime records
      const records = await this.getOvertimeByCompany(companyId, belongingYearMonth);
      let maxTime: string | null = null;
      records.forEach((r) => {
        const time = r.updatedAt || r.createdAt;
        if (time && (!maxTime || time > maxTime)) {
          maxTime = time;
        }
      });
      return maxTime;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `overtime_sync_meta/${syncId}`);
    }
  },

  // Requirement 1 & 2: Batch creation with strict validation and source timestamp update
  async batchCreateOvertimeRecords(
    records: Array<Omit<OvertimeRecord, 'id' | 'createdAt' | 'updatedAt'>>,
    actorUserId: string,
    expectedCompanyWorkers?: Worker[]
  ): Promise<{
    createdCount: number;
    createdRecords: OvertimeRecord[];
  }> {
    if (records.length === 0) return { createdCount: 0, createdRecords: [] };

    // 1. Validate each record
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const validation = this.validateOvertimeData({
        companyId: rec.companyId,
        employeeId: rec.employeeId,
        workDate: rec.workDate,
        belongingYearMonth: rec.belongingYearMonth,
        workType: rec.workType,
        hours: rec.hours,
        expectedCompanyWorkers,
      });
      if (!validation.isValid) {
        throw new Error(`${i + 1}행 오류: ${validation.errors.join(' ')}`);
      }
    }

    // Reject duplicates inside the submitted batch before any Firestore write.
    // This check is independent of UI validation and protects other callers.
    if (records.length > 200) {
      throw new Error('한 번에 최대 200건의 추가근무 기록만 저장할 수 있습니다.');
    }
    const keys = new Set<string>();
    for (const rec of records) {
      const key = JSON.stringify([rec.companyId, rec.employeeId, rec.workDate, rec.workType]);
      if (keys.has(key)) throw new Error('일괄 등록에 동일 근로자·날짜·근무구분의 중복 기록이 있습니다.');
      keys.add(key);
    }

    // Check historical random-ID rows. This query alone is not a concurrency lock;
    // the transaction's canonical document reads provide that guarantee for v2 clients.
    for (const rec of records) {
      const legacy = await this.findDuplicateRecord(rec);
      if (legacy) throw new Error(`이미 등록된 추가근무가 있습니다: ${rec.workDate} / ${rec.employeeId}`);
    }
    const now = new Date().toISOString();
    const touchedMonths = new Map<string, { companyId: string; month: string }>();
    const entries = await Promise.all(records.map(async (data) => {
      const id = await overtimeDocumentId(data);
      const ref = doc(db, 'overtime_records', id);
      const record: OvertimeRecord = {
        ...data,
        id,
        memo: data.memo ?? data.note,
        note: data.note ?? data.memo,
        createdById: data.createdById ?? data.authorId ?? actorUserId,
        updatedById: actorUserId,
        createdAt: now,
        updatedAt: now,
      };
      touchedMonths.set(JSON.stringify([data.companyId, data.belongingYearMonth]), {
        companyId: data.companyId, month: data.belongingYearMonth,
      });
      return { ref, record };
    }));
    // Preserve caller row order regardless of asynchronous digest completion order.
    const createdRecords = entries.map(({ record }) => record);
    try {
      await runTransaction(db, async (tx) => {
        // Firestore requires ALL transaction reads before the first write.
        const snapshots = await Promise.all(entries.map(({ ref }) => tx.get(ref)));
        const monthMetas = await Promise.all([...touchedMonths.values()].map(async ({ companyId, month }) => {
          const syncId = `sync_${companyId}_${month.replace('-', '')}`;
          const ref = doc(db, 'overtime_sync_meta', syncId);
          return { companyId, month, syncId, ref, snap: await tx.get(ref) };
        }));
        if (snapshots.some(snap => snap.exists())) {
          throw new Error('동시에 등록되었거나 이미 존재하는 추가근무 기록이 있습니다. 새로고침 후 확인하세요.');
        }
        for (const { ref, record } of entries) tx.set(ref, record);
        for (const { companyId, month, syncId, ref, snap } of monthMetas) {
          tx.set(ref, {
            sourceVersion: nextSourceVersion(snap),
            id: syncId, companyId, belongingYearMonth: month,
            overtimeSourceUpdatedAt: now, lastAction: 'CREATED',
            updatedById: actorUserId, updatedAt: now,
          }, { merge: true });
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'overtime_records/batch');
      throw error;
    }

    return {
      createdCount: createdRecords.length,
      createdRecords,
    };
  },
};
