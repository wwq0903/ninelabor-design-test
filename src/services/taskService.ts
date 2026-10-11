import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteField,
  runTransaction,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  TaskPriority,
  TaskSourceType,
  TaskFilters,
  UserRole,
} from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreHelper';
import { normalizeDateOnlyString, sortTasks, calculateTaskDueStatus } from '../utils/taskHelper';
import { auditLogService } from './auditLogService';

export const TASKS_COLLECTION = 'tasks';
export const TASK_SOURCE_LOCKS_COLLECTION = 'task_source_locks';

const MAX_TITLE_LENGTH = 200;
const MAX_DESC_LENGTH = 5000;
const MAX_ID_LENGTH = 128;

const VALID_PRIORITIES: TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const VALID_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const VALID_SOURCE_TYPES: TaskSourceType[] = [
  'MANUAL',
  'INQUIRY',
  'DATA_REQUEST',
  'MATERNITY',
  'PAYROLL',
  'MESSAGE',
  'DOCUMENT',
  'OTHER',
];

export interface TaskActor {
  uid: string;
  name?: string;
  role?: UserRole;
}

/**
 * [R3-3 1/3] 업무 입력값 유효성 검증 Helper
 */
function validateTaskInput(
  params: {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    dueDate?: string | null;
    sourceType?: TaskSourceType | null;
    sourceId?: string | null;
    companyId?: string | null;
    workerId?: string | null;
  },
  isCreate: boolean
): void {
  // 1. 제목(title) 검증
  if (isCreate || params.title !== undefined) {
    if (!params.title || !params.title.trim()) {
      throw new Error('업무 제목을 입력해주세요. (공백만 입력할 수 없습니다.)');
    }
    const trimmedTitle = params.title.trim();
    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      throw new Error(`업무 제목은 최대 ${MAX_TITLE_LENGTH}자까지 입력할 수 있습니다.`);
    }
  }

  // 2. 설명(description) 검증
  if (params.description !== undefined && params.description !== null) {
    const trimmedDesc = params.description.trim();
    if (trimmedDesc.length > MAX_DESC_LENGTH) {
      throw new Error(`업무 상세 설명은 최대 ${MAX_DESC_LENGTH}자까지 입력할 수 있습니다.`);
    }
  }

  // 3. 중요도(priority) 검증
  if (isCreate || params.priority !== undefined) {
    if (!params.priority || !VALID_PRIORITIES.includes(params.priority)) {
      throw new Error(`유효하지 않은 우선순위 값입니다: ${params.priority}`);
    }
  }

  // 4. 상태(status) 검증
  if (params.status !== undefined) {
    if (!VALID_STATUSES.includes(params.status)) {
      throw new Error(`유효하지 않은 업무 상태 값입니다: ${params.status}`);
    }
  }

  // 5. 마감일(dueDate) 형식 검증
  if (params.dueDate !== undefined && params.dueDate !== null && params.dueDate !== '') {
    const norm = normalizeDateOnlyString(params.dueDate);
    if (!norm) {
      throw new Error(`유효하지 않은 마감일 형식입니다: ${params.dueDate}`);
    }
  }

  // 6. 식별자 길이 검증
  if (params.companyId && params.companyId.trim().length > MAX_ID_LENGTH) {
    throw new Error(`기업 식별자 길이는 ${MAX_ID_LENGTH}자 이내여야 합니다.`);
  }
  if (params.workerId && params.workerId.trim().length > MAX_ID_LENGTH) {
    throw new Error(`근로자 식별자 길이는 ${MAX_ID_LENGTH}자 이내여야 합니다.`);
  }

  // 7. 출처 연결 정합성 (sourceType, sourceId)
  if (params.sourceType !== undefined && params.sourceType !== null) {
    if (!VALID_SOURCE_TYPES.includes(params.sourceType)) {
      throw new Error(`유효하지 않은 출처 유형입니다: ${params.sourceType}`);
    }
  }
  // sourceId만 있고 sourceType이 없거나 MANUAL인 경우 불완전 연결 방지
  if (params.sourceId && params.sourceId.trim()) {
    if (!params.sourceType || params.sourceType === 'MANUAL') {
      throw new Error('출처 ID(sourceId)가 있는 경우 유효한 출처 유형(sourceType)을 지정해야 합니다.');
    }
  }
  // sourceType이 MANUAL이 아닌데 sourceId가 누락된 경우 방지
  if (params.sourceType && params.sourceType !== 'MANUAL' && (!params.sourceId || !params.sourceId.trim())) {
    throw new Error(`출처 유형이 '${params.sourceType}'인 경우 출처 식별자(sourceId)가 필요합니다.`);
  }
}

/**
 * [R3-3 1/3] 기업 및 근로자 대상 정합성 검증 Helper
 * - companyId가 있으면 실제 companies/{companyId} 문서 존재 확인
 * - workerId가 있으면 canonical workers/{workerId} 문서 존재 확인
 * - 둘 다 있으면 workers/{workerId}.companyId === companyId 일치 검증
 * - 둘 다 없는 일반 노무법인 내부 업무도 허용
 */
async function validateTaskTargets(
  companyId?: string | null,
  workerId?: string | null
): Promise<{ companyName?: string; workerName?: string }> {
  let resolvedCompanyName: string | undefined;
  let resolvedWorkerName: string | undefined;

  const cleanCompanyId = companyId && companyId.trim() ? companyId.trim() : undefined;
  const cleanWorkerId = workerId && workerId.trim() ? workerId.trim() : undefined;

  // 1. 기업 확인
  if (cleanCompanyId) {
    const compDocRef = doc(db, 'companies', cleanCompanyId);
    const compSnap = await getDoc(compDocRef);
    if (!compSnap.exists()) {
      throw new Error(`존재하지 않는 기업입니다. (companyId: ${cleanCompanyId})`);
    }
    resolvedCompanyName = compSnap.data()?.companyName || '기업';
  }

  // 2. 근로자 확인
  if (cleanWorkerId) {
    const workerDocRef = doc(db, 'workers', cleanWorkerId);
    const workerSnap = await getDoc(workerDocRef);
    if (!workerSnap.exists()) {
      throw new Error(`존재하지 않는 근로자입니다. (workerId: ${cleanWorkerId})`);
    }
    const workerData = workerSnap.data();
    resolvedWorkerName = workerData?.name || '근로자';

    // 3. 근로자와 기업 동시 지정 시 소속 기업 일치 검증
    if (cleanCompanyId && workerData?.companyId !== cleanCompanyId) {
      throw new Error(
        `근로자의 실제 소속 기업(companyId: ${workerData?.companyId})과 지정된 기업 ID(${cleanCompanyId})가 일치하지 않습니다.`
      );
    }
  }

  return { companyName: resolvedCompanyName, workerName: resolvedWorkerName };
}

export const taskService = {
  /**
   * [R3-3 1/3] 새 업무 생성 (ADMIN 전용)
   * - 제목, 중요도 필수
   * - 기업/근로자 정합성 검증 (없을 경우 일반 내부 업무 허용)
   * - Audit Log(TASK_CREATED) 기록 (description 제외)
   */
  async createTask(input: CreateTaskInput, currentUser: TaskActor): Promise<Task> {
    // 1. 기본 입력 유효성 검증
    validateTaskInput(input, true);

    const cleanCompanyId = input.companyId && input.companyId.trim() ? input.companyId.trim() : undefined;
    const cleanWorkerId = input.workerId && input.workerId.trim() ? input.workerId.trim() : undefined;

    // 2. 대상 정합성 검증
    await validateTaskTargets(cleanCompanyId, cleanWorkerId);

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const cleanDueDate = input.dueDate ? normalizeDateOnlyString(input.dueDate) || undefined : undefined;
    const cleanDescription = input.description && input.description.trim() ? input.description.trim() : undefined;
    const cleanSourceType: TaskSourceType = input.sourceType || 'MANUAL';
    const cleanSourceId = input.sourceId && input.sourceId.trim() ? input.sourceId.trim() : undefined;
    const initialStatus: TaskStatus = input.status || 'TODO';

    // 2-1. [R3-3 3/3-B-③-B] 출처와 기업·근로자 대상 정합성 검증 (중앙 차단)
    // sourceType/sourceId가 있는 task는 원본 업무가 가진 실제 companyId/workerId와 다른 대상으로 저장될 수 없음
    if (cleanSourceType && cleanSourceType !== 'MANUAL' && cleanSourceId) {
      await this.validateSourceConsistency(
        cleanSourceType,
        cleanSourceId,
        cleanCompanyId,
        cleanWorkerId
      );
    }

    // 3. [R3-3 3/3-B-③-A] 출처 기반 중복 할 일 방지 (사전 검사)
    // 동일한 sourceType + sourceId 조합을 가진 task 중 TODO 또는 IN_PROGRESS 상태가 이미 존재하면 빠른 차단
    if (cleanSourceType && cleanSourceType !== 'MANUAL' && cleanSourceId) {
      const { isDuplicate, existingTask } = await this.checkDuplicateSourceTask(cleanSourceType, cleanSourceId);
      if (isDuplicate && existingTask) {
        const dupError: any = new Error('이 업무와 연결된 진행 중 할 일이 이미 있습니다.');
        dupError.code = 'DUPLICATE_ACTIVE_TASK';
        dupError.existingTaskId = existingTask.id;
        dupError.existingTask = existingTask;
        throw dupError;
      }
    }

    const newTask: Task = {
      id: taskId,
      companyId: cleanCompanyId,
      workerId: cleanWorkerId,
      title: input.title.trim(),
      description: cleanDescription,
      priority: input.priority,
      status: initialStatus,
      dueDate: cleanDueDate,
      completedAt: initialStatus === 'COMPLETED' ? now : undefined,
      sourceType: cleanSourceType,
      sourceId: cleanSourceId,
      createdAt: now,
      updatedAt: now,
      createdById: currentUser.uid,
      createdByName: currentUser.name || '노무법인 관리자',
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    try {
      const docRef = doc(db, TASKS_COLLECTION, taskId);

      // [R3-3 3/3-C-②-A] Firestore Transaction을 통한 출처 task 중복 생성 원자적 차단
      // MANUAL이 아닌 원본 업무 연결 task의 경우 task_source_locks 문서를 트랜잭션으로 확인 및 갱신하여 동시 요청 시 1건만 생성 보장
      if (cleanSourceType && cleanSourceType !== 'MANUAL' && cleanSourceId) {
        const lockDocId = `${cleanSourceType}__${cleanSourceId}`;
        const lockDocRef = doc(db, TASK_SOURCE_LOCKS_COLLECTION, lockDocId);

        await runTransaction(db, async (transaction) => {
          // 1. 트랜잭션 내부에서 해당 출처의 락 문서 조회
          const lockSnap = await transaction.get(lockDocRef);

          if (lockSnap.exists()) {
            const lockData = lockSnap.data();
            const currentActiveTaskId = lockData?.activeTaskId;

            if (currentActiveTaskId && typeof currentActiveTaskId === 'string') {
              // 2. 현재 활성으로 기록된 task 문서를 트랜잭션 내에서 직접 확인
              const activeTaskDocRef = doc(db, TASKS_COLLECTION, currentActiveTaskId);
              const activeTaskSnap = await transaction.get(activeTaskDocRef);

              if (activeTaskSnap.exists()) {
                const activeTaskData = activeTaskSnap.data() as Task;
                // 활성 상태(TODO 또는 IN_PROGRESS)가 아직 유지되고 있는 경우 중복 생성 원자적 차단
                if (activeTaskData.status === 'TODO' || activeTaskData.status === 'IN_PROGRESS') {
                  // [R3-3 3/3-C-②-B] task ↔ lock 정합성 검증:
                  // 락의 sourceType 및 sourceId와 실제 task의 sourceType 및 sourceId가 일치하는 정상 활성 task인 경우에만 중복 차단
                  if (activeTaskData.sourceType === cleanSourceType && activeTaskData.sourceId === cleanSourceId) {
                    const dupError: any = new Error('이 업무와 연결된 진행 중 할 일이 이미 있습니다.');
                    dupError.code = 'DUPLICATE_ACTIVE_TASK';
                    dupError.existingTaskId = activeTaskData.id;
                    dupError.existingTask = activeTaskData;
                    throw dupError;
                  }
                  // 만약 다른 출처의 task ID가 주입된 비정상 락인 경우, 해당 출처의 업무 생성을 부당하게 막지 않고 새 task로 자가 치유(self-heal)
                }
              }
              // 만약 activeTaskId에 해당하는 task가 실제로 없거나(삭제 등), 이미 COMPLETED 또는 CANCELLED인 비정상/stale 락인 경우
              // 영구 차단되지 않고 아래에서 새 task 생성 및 락 최신화(self-heal) 진행
            }
          }

          // 3. 신규 task 문서 원자적 저장
          transaction.set(docRef, sanitizeFirestoreData(newTask));

          // 4. 출처 락 문서 원자적 갱신
          const isInitialActive = initialStatus === 'TODO' || initialStatus === 'IN_PROGRESS';
          transaction.set(
            lockDocRef,
            sanitizeFirestoreData({
              id: lockDocId,
              sourceType: cleanSourceType,
              sourceId: cleanSourceId,
              activeTaskId: isInitialActive ? taskId : null,
              activeTaskStatus: initialStatus,
              updatedAt: now,
            }),
            { merge: true }
          );
        });
      } else {
        // MANUAL task: 출처 중복 제약 대상이 아니므로 기존과 동일하게 단독 생성
        await setDoc(docRef, sanitizeFirestoreData(newTask));
      }

      // Audit Log 기록 (성공 시에만 기록, 실패 시 롤백되어 기록되지 않음)
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: currentUser.role || 'ADMIN',
        actorName: currentUser.name || '노무법인 관리자',
        companyId: cleanCompanyId,
        action: 'TASK_CREATED',
        resourceType: TASKS_COLLECTION,
        resourceId: taskId,
        details: {
          taskId,
          companyId: cleanCompanyId,
          workerId: cleanWorkerId,
          sourceType: cleanSourceType,
          sourceId: cleanSourceId,
          priority: newTask.priority,
          status: newTask.status,
          dueDate: cleanDueDate,
          operation: 'CREATE',
        },
      });

      return newTask;
    } catch (error: any) {
      if (error?.code === 'DUPLICATE_ACTIVE_TASK') {
        throw error;
      }
      handleFirestoreError(error, OperationType.CREATE, `${TASKS_COLLECTION}/${taskId}`);
      throw error;
    }
  },

  /**
   * [R3-3 1/3] 단일 업무 상세 조회 (ADMIN 전용)
   */
  async getTaskById(taskId: string): Promise<Task | null> {
    if (!taskId || !taskId.trim()) return null;
    const cleanTaskId = taskId.trim();

    try {
      const snap = await getDoc(doc(db, TASKS_COLLECTION, cleanTaskId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Task;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${TASKS_COLLECTION}/${cleanTaskId}`);
      throw error;
    }
  },

  /**
   * [R3-3 1/3] 전체 업무 목록 조회 및 중앙 정렬 (ADMIN 전용)
   */
  async getAllTasks(filters?: TaskFilters): Promise<Task[]> {
    const colRef = collection(db, TASKS_COLLECTION);

    try {
      const snap = await getDocs(colRef);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));

      // 필터 적용
      if (filters?.companyId) {
        list = list.filter((t) => t.companyId === filters.companyId);
      }
      if (filters?.workerId) {
        list = list.filter((t) => t.workerId === filters.workerId);
      }
      if (filters?.priority) {
        list = list.filter((t) => t.priority === filters.priority);
      }
      if (filters?.sourceType) {
        list = list.filter((t) => t.sourceType === filters.sourceType);
      }
      if (filters?.status) {
        if (filters.status === 'ALL_ACTIVE') {
          list = list.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
        } else if (filters.status !== 'ALL') {
          list = list.filter((t) => t.status === filters.status);
        }
      }
      if (filters?.dueStatus) {
        list = list.filter((t) => calculateTaskDueStatus(t) === filters.dueStatus);
      }

      // 중앙 헬퍼를 통한 우선순위 기준 정렬
      return sortTasks(list);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, TASKS_COLLECTION);
      throw error;
    }
  },

  /**
   * [R3-3 1/3] 기업별 업무 목록 조회 (ADMIN 전용)
   */
  async getTasksByCompany(companyId: string, filters?: TaskFilters): Promise<Task[]> {
    if (!companyId || !companyId.trim()) return [];
    const cleanCompanyId = companyId.trim();
    const colRef = collection(db, TASKS_COLLECTION);

    try {
      const q = query(colRef, where('companyId', '==', cleanCompanyId));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));

      if (filters?.status) {
        if (filters.status === 'ALL_ACTIVE') {
          list = list.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
        } else if (filters.status !== 'ALL') {
          list = list.filter((t) => t.status === filters.status);
        }
      }
      if (filters?.priority) {
        list = list.filter((t) => t.priority === filters.priority);
      }
      if (filters?.dueStatus) {
        list = list.filter((t) => calculateTaskDueStatus(t) === filters.dueStatus);
      }

      return sortTasks(list);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `${TASKS_COLLECTION}?companyId=${cleanCompanyId}`);
      throw error;
    }
  },

  /**
   * [R3-3 1/3] 근로자별 업무 목록 조회 (ADMIN 전용)
   */
  async getTasksByWorker(workerId: string, filters?: TaskFilters): Promise<Task[]> {
    if (!workerId || !workerId.trim()) return [];
    const cleanWorkerId = workerId.trim();
    const colRef = collection(db, TASKS_COLLECTION);

    try {
      const q = query(colRef, where('workerId', '==', cleanWorkerId));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));

      if (filters?.companyId) {
        list = list.filter((t) => t.companyId === filters.companyId);
      }
      if (filters?.status) {
        if (filters.status === 'ALL_ACTIVE') {
          list = list.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
        } else if (filters.status !== 'ALL') {
          list = list.filter((t) => t.status === filters.status);
        }
      }
      if (filters?.priority) {
        list = list.filter((t) => t.priority === filters.priority);
      }
      if (filters?.dueStatus) {
        list = list.filter((t) => calculateTaskDueStatus(t) === filters.dueStatus);
      }

      return sortTasks(list);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `${TASKS_COLLECTION}?workerId=${cleanWorkerId}`);
      throw error;
    }
  },

  /**
   * [R3-3 1/3] 업무 내용 및 속성 수정 (ADMIN 전용)
   */
  async updateTask(taskId: string, input: UpdateTaskInput, currentUser: TaskActor): Promise<Task> {
    if (!taskId || !taskId.trim()) throw new Error('수정할 업무 식별자(taskId)가 필요합니다.');
    const cleanTaskId = taskId.trim();

    validateTaskInput(input, false);

    const docRef = doc(db, TASKS_COLLECTION, cleanTaskId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`수정할 업무를 찾을 수 없습니다. (taskId: ${cleanTaskId})`);
    }

    const existing = snap.data() as Task;
    const now = new Date().toISOString();

    // 회사/근로자 대상 변경 시 정합성 검증
    const nextCompanyId = input.companyId !== undefined ? (input.companyId?.trim() || undefined) : existing.companyId;
    const nextWorkerId = input.workerId !== undefined ? (input.workerId?.trim() || undefined) : existing.workerId;
    if (input.companyId !== undefined || input.workerId !== undefined) {
      await validateTaskTargets(nextCompanyId, nextWorkerId);
    }

    const changedFieldNames: string[] = [];
    const updates: Record<string, any> = {
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    if (input.title !== undefined) {
      updates.title = input.title.trim();
      changedFieldNames.push('title');
    }
    if (input.description !== undefined) {
      updates.description = input.description && input.description.trim() ? input.description.trim() : deleteField();
      changedFieldNames.push('description');
    }
    if (input.priority !== undefined) {
      updates.priority = input.priority;
      changedFieldNames.push('priority');
    }
    if (input.status !== undefined) {
      updates.status = input.status;
      changedFieldNames.push('status');
      if (input.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
        updates.completedAt = now;
      } else if (input.status !== 'COMPLETED' && existing.status === 'COMPLETED') {
        updates.completedAt = deleteField();
      }
    }
    if (input.dueDate !== undefined) {
      updates.dueDate = input.dueDate ? normalizeDateOnlyString(input.dueDate) || deleteField() : deleteField();
      changedFieldNames.push('dueDate');
    }
    if (input.companyId !== undefined) {
      updates.companyId = nextCompanyId || deleteField();
      changedFieldNames.push('companyId');
    }
    if (input.workerId !== undefined) {
      updates.workerId = nextWorkerId || deleteField();
      changedFieldNames.push('workerId');
    }
    if (input.sourceType !== undefined) {
      updates.sourceType = input.sourceType || 'MANUAL';
      changedFieldNames.push('sourceType');
    }
    if (input.sourceId !== undefined) {
      updates.sourceId = input.sourceId ? input.sourceId.trim() : deleteField();
      changedFieldNames.push('sourceId');
    }

    try {
      await updateDoc(docRef, sanitizeFirestoreData(updates));

      const updatedTask: Task = {
        ...existing,
        ...updates,
        completedAt:
          updates.completedAt === undefined
            ? existing.completedAt
            : updates.completedAt === deleteField()
            ? undefined
            : updates.completedAt,
        description:
          updates.description === deleteField() ? undefined : updates.description || existing.description,
        dueDate: updates.dueDate === deleteField() ? undefined : updates.dueDate || existing.dueDate,
        companyId: updates.companyId === deleteField() ? undefined : updates.companyId || existing.companyId,
        workerId: updates.workerId === deleteField() ? undefined : updates.workerId || existing.workerId,
        sourceId: updates.sourceId === deleteField() ? undefined : updates.sourceId || existing.sourceId,
      };

      // [R3-3 3/3-C-②-A] 출처 락 문서 동기화
      const finalSourceType = updatedTask.sourceType;
      const finalSourceId = updatedTask.sourceId;
      if (finalSourceType && finalSourceType !== 'MANUAL' && finalSourceId) {
        try {
          const lockDocRef = doc(db, TASK_SOURCE_LOCKS_COLLECTION, `${finalSourceType}__${finalSourceId}`);
          const isFinalActive = updatedTask.status === 'TODO' || updatedTask.status === 'IN_PROGRESS';
          const lockSnap = await getDoc(lockDocRef);
          if (lockSnap.exists()) {
            const lockData = lockSnap.data();
            // [R3-3 3/3-C-②-B] 비활성(COMPLETED/CANCELLED)으로 변경할 경우,
            // 다른 활성 task의 락을 임의로 해제하지 않도록 이 task가 락의 주체일 때만 activeTaskId를 null로 설정
            if (!isFinalActive) {
              if (!lockData?.activeTaskId || lockData.activeTaskId === cleanTaskId) {
                await setDoc(
                  lockDocRef,
                  sanitizeFirestoreData({
                    id: `${finalSourceType}__${finalSourceId}`,
                    sourceType: finalSourceType,
                    sourceId: finalSourceId,
                    activeTaskId: null,
                    activeTaskStatus: updatedTask.status,
                    updatedAt: now,
                  }),
                  { merge: true }
                );
              }
            } else {
              // 활성 상태(TODO/IN_PROGRESS)로 변경
              await setDoc(
                lockDocRef,
                sanitizeFirestoreData({
                  id: `${finalSourceType}__${finalSourceId}`,
                  sourceType: finalSourceType,
                  sourceId: finalSourceId,
                  activeTaskId: updatedTask.id,
                  activeTaskStatus: updatedTask.status,
                  updatedAt: now,
                }),
                { merge: true }
              );
            }
          }
        } catch (lockErr) {
          console.warn('task_source_locks update warning on updateTask:', lockErr);
        }
      }

      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: currentUser.role || 'ADMIN',
        actorName: currentUser.name || '노무법인 관리자',
        companyId: updatedTask.companyId,
        action: 'TASK_UPDATED',
        resourceType: TASKS_COLLECTION,
        resourceId: cleanTaskId,
        details: {
          taskId: cleanTaskId,
          companyId: updatedTask.companyId,
          workerId: updatedTask.workerId,
          sourceType: updatedTask.sourceType,
          sourceId: updatedTask.sourceId,
          priority: updatedTask.priority,
          status: updatedTask.status,
          dueDate: updatedTask.dueDate,
          changedFields: changedFieldNames,
          operation: 'UPDATE',
        },
      });

      return updatedTask;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COLLECTION}/${cleanTaskId}`);
      throw error;
    }
  },

  /**
   * [R3-3 1/3] 업무 상태 변경 (ADMIN 전용)
   */
  async updateTaskStatus(taskId: string, status: TaskStatus, currentUser: TaskActor): Promise<Task> {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`유효하지 않은 상태 값입니다: ${status}`);
    }
    return this.updateTask(taskId, { status }, currentUser);
  },

  /**
   * [R3-3 1/3] 업무 완료 처리 (COMPLETED 전환 + completedAt 기록)
   */
  async completeTask(taskId: string, currentUser: TaskActor): Promise<Task> {
    if (!taskId || !taskId.trim()) throw new Error('완료 처리할 업무 식별자가 필요합니다.');
    const cleanTaskId = taskId.trim();
    const docRef = doc(db, TASKS_COLLECTION, cleanTaskId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error(`업무를 찾을 수 없습니다. (ID: ${cleanTaskId})`);

    const existing = snap.data() as Task;
    const now = new Date().toISOString();

    const updates = {
      status: 'COMPLETED' as TaskStatus,
      completedAt: now,
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    try {
      await updateDoc(docRef, sanitizeFirestoreData(updates));
      const updatedTask: Task = { ...existing, ...updates };

      // [R3-3 3/3-C-②-B] 완료 처리 시 출처 락 문서 해제 (새 활성 task 재생성 허용)
      // 단, 정상 활성 task가 있는데 임의로 락을 해제해서 중복 생성되는 구조를 방지하기 위해,
      // 락 문서의 activeTaskId가 현재 완료 대상 task이거나 이미 비어있는 경우에만 락 해제
      if (existing.sourceType && existing.sourceType !== 'MANUAL' && existing.sourceId) {
        try {
          const lockDocRef = doc(db, TASK_SOURCE_LOCKS_COLLECTION, `${existing.sourceType}__${existing.sourceId}`);
          const lockSnap = await getDoc(lockDocRef);
          if (lockSnap.exists()) {
            const lockData = lockSnap.data();
            if (!lockData?.activeTaskId || lockData.activeTaskId === cleanTaskId) {
              await setDoc(
                lockDocRef,
                sanitizeFirestoreData({
                  id: `${existing.sourceType}__${existing.sourceId}`,
                  sourceType: existing.sourceType,
                  sourceId: existing.sourceId,
                  activeTaskId: null,
                  activeTaskStatus: 'COMPLETED',
                  updatedAt: now,
                }),
                { merge: true }
              );
            }
          }
        } catch (lockErr) {
          console.warn('task_source_locks update warning on completeTask:', lockErr);
        }
      }

      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: currentUser.role || 'ADMIN',
        actorName: currentUser.name || '노무법인 관리자',
        companyId: updatedTask.companyId,
        action: 'TASK_COMPLETED',
        resourceType: TASKS_COLLECTION,
        resourceId: cleanTaskId,
        details: {
          taskId: cleanTaskId,
          companyId: updatedTask.companyId,
          workerId: updatedTask.workerId,
          sourceType: updatedTask.sourceType,
          sourceId: updatedTask.sourceId,
          priority: updatedTask.priority,
          status: 'COMPLETED',
          dueDate: updatedTask.dueDate,
          operation: 'COMPLETE',
        },
      });

      return updatedTask;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COLLECTION}/${cleanTaskId}`);
      throw error;
    }
  },

  /**
   * [R3-3 1/3] 업무 완료 취소 / 재오픈 (COMPLETED -> TODO/IN_PROGRESS, completedAt 제거)
   */
  async reopenTask(
    taskId: string,
    targetStatus: 'TODO' | 'IN_PROGRESS' = 'IN_PROGRESS',
    currentUser: TaskActor
  ): Promise<Task> {
    if (!taskId || !taskId.trim()) throw new Error('재오픈할 업무 식별자가 필요합니다.');
    const cleanTaskId = taskId.trim();
    const docRef = doc(db, TASKS_COLLECTION, cleanTaskId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error(`업무를 찾을 수 없습니다. (ID: ${cleanTaskId})`);

    const existing = snap.data() as Task;
    const now = new Date().toISOString();

    const updates: Record<string, any> = {
      status: targetStatus,
      completedAt: deleteField(),
      updatedAt: now,
    };

    // [R3-3 3/3-C-②-B] 출처가 있는 업무를 재오픈할 때 원자적 Firestore Transaction으로 재오픈 경쟁 및 중복 방지
    if (existing.sourceType && existing.sourceType !== 'MANUAL' && existing.sourceId) {
      const lockDocId = `${existing.sourceType}__${existing.sourceId}`;
      const lockDocRef = doc(db, TASK_SOURCE_LOCKS_COLLECTION, lockDocId);

      try {
        await runTransaction(db, async (transaction) => {
          // 1. 트랜잭션 내에서 락 문서 조회
          const lockSnap = await transaction.get(lockDocRef);

          if (lockSnap.exists()) {
            const lockData = lockSnap.data();
            const currentActiveTaskId = lockData?.activeTaskId;

            if (currentActiveTaskId && typeof currentActiveTaskId === 'string' && currentActiveTaskId !== cleanTaskId) {
              const activeTaskDocRef = doc(db, TASKS_COLLECTION, currentActiveTaskId);
              const activeTaskSnap = await transaction.get(activeTaskDocRef);

              if (activeTaskSnap.exists()) {
                const activeTaskData = activeTaskSnap.data() as Task;
                // [R3-3 3/3-C-②-B] 정합성 검증: 동일 출처의 실제 활성 업무가 이미 존재하는 경우 재오픈 차단
                if (
                  (activeTaskData.status === 'TODO' || activeTaskData.status === 'IN_PROGRESS') &&
                  activeTaskData.sourceType === existing.sourceType &&
                  activeTaskData.sourceId === existing.sourceId
                ) {
                  const dupError: any = new Error('이 업무와 연결된 다른 진행 중 할 일이 이미 존재하여 재오픈할 수 없습니다.');
                  dupError.code = 'DUPLICATE_ACTIVE_TASK';
                  dupError.existingTaskId = activeTaskData.id;
                  dupError.existingTask = activeTaskData;
                  throw dupError;
                }
              }
              // 만약 activeTaskId의 실제 task가 없거나, 이미 COMPLETED/CANCELLED이거나, 다른 출처가 주입된 비정상/stale 락인 경우
              // 영구 차단되지 않고 현재 task의 재오픈으로 락을 정상 재획득(self-heal)
            }
          }

          // 2. 업무 문서 상태를 재오픈으로 원자적 업데이트
          transaction.update(docRef, sanitizeFirestoreData(updates));

          // 3. 출처 락 문서 원자적 갱신
          transaction.set(
            lockDocRef,
            sanitizeFirestoreData({
              id: lockDocId,
              sourceType: existing.sourceType,
              sourceId: existing.sourceId,
              activeTaskId: cleanTaskId,
              activeTaskStatus: targetStatus,
              updatedAt: now,
            }),
            { merge: true }
          );
        });
      } catch (error: any) {
        if (error?.code === 'DUPLICATE_ACTIVE_TASK') {
          throw error;
        }
        handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COLLECTION}/${cleanTaskId}`);
        throw error;
      }
    } else {
      // MANUAL 업무의 경우 단독 업데이트
      try {
        await updateDoc(docRef, sanitizeFirestoreData(updates));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COLLECTION}/${cleanTaskId}`);
        throw error;
      }
    }

    const updatedTask: Task = { ...existing, status: targetStatus, completedAt: undefined, updatedAt: now };

    await auditLogService.logAction({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: updatedTask.companyId,
      action: 'TASK_REOPENED',
      resourceType: TASKS_COLLECTION,
      resourceId: cleanTaskId,
      details: {
        taskId: cleanTaskId,
        companyId: updatedTask.companyId,
        workerId: updatedTask.workerId,
        sourceType: updatedTask.sourceType,
        sourceId: updatedTask.sourceId,
        priority: updatedTask.priority,
        status: targetStatus,
        dueDate: updatedTask.dueDate,
        operation: 'REOPEN',
      },
    });

    return updatedTask;
  },

  /**
   * [R3-3 1/3] 업무 취소 처리 (CANCELLED 전환, completedAt 제거)
   */
  async cancelTask(taskId: string, currentUser: TaskActor): Promise<Task> {
    if (!taskId || !taskId.trim()) throw new Error('취소할 업무 식별자가 필요합니다.');
    const cleanTaskId = taskId.trim();
    const docRef = doc(db, TASKS_COLLECTION, cleanTaskId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error(`업무를 찾을 수 없습니다. (ID: ${cleanTaskId})`);

    const existing = snap.data() as Task;
    const now = new Date().toISOString();

    const updates = {
      status: 'CANCELLED' as TaskStatus,
      completedAt: deleteField(),
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    try {
      await updateDoc(docRef, sanitizeFirestoreData(updates));
      const updatedTask: Task = { ...existing, status: 'CANCELLED', completedAt: undefined, updatedAt: now };

      // [R3-3 3/3-C-②-B] 취소 처리 시 출처 락 문서 해제 (새 활성 task 재생성 허용)
      // 락 문서의 activeTaskId가 현재 취소 대상 task이거나 이미 비어있는 경우에만 락 해제
      if (existing.sourceType && existing.sourceType !== 'MANUAL' && existing.sourceId) {
        try {
          const lockDocRef = doc(db, TASK_SOURCE_LOCKS_COLLECTION, `${existing.sourceType}__${existing.sourceId}`);
          const lockSnap = await getDoc(lockDocRef);
          if (lockSnap.exists()) {
            const lockData = lockSnap.data();
            if (!lockData?.activeTaskId || lockData.activeTaskId === cleanTaskId) {
              await setDoc(
                lockDocRef,
                sanitizeFirestoreData({
                  id: `${existing.sourceType}__${existing.sourceId}`,
                  sourceType: existing.sourceType,
                  sourceId: existing.sourceId,
                  activeTaskId: null,
                  activeTaskStatus: 'CANCELLED',
                  updatedAt: now,
                }),
                { merge: true }
              );
            }
          }
        } catch (lockErr) {
          console.warn('task_source_locks update warning on cancelTask:', lockErr);
        }
      }

      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: currentUser.role || 'ADMIN',
        actorName: currentUser.name || '노무법인 관리자',
        companyId: updatedTask.companyId,
        action: 'TASK_CANCELLED',
        resourceType: TASKS_COLLECTION,
        resourceId: cleanTaskId,
        details: {
          taskId: cleanTaskId,
          companyId: updatedTask.companyId,
          workerId: updatedTask.workerId,
          sourceType: updatedTask.sourceType,
          sourceId: updatedTask.sourceId,
          priority: updatedTask.priority,
          status: 'CANCELLED',
          dueDate: updatedTask.dueDate,
          operation: 'CANCEL',
        },
      });

      return updatedTask;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COLLECTION}/${cleanTaskId}`);
      throw error;
    }
  },

  /**
   * [R3-3 3/3-B-③-A] 출처(sourceType, sourceId) 기반 활성 할 일 중복 검사
   * - 동일 sourceType + sourceId 조합의 업무 중 TODO 또는 IN_PROGRESS 상태가 존재하면 { isDuplicate: true, existingTask } 반환
   * - 기존 업무가 없거나 모든 업무가 COMPLETED 또는 CANCELLED 상태인 경우 { isDuplicate: false, existingTask: null } 반환
   */
  async checkDuplicateSourceTask(
    sourceType: TaskSourceType,
    sourceId: string
  ): Promise<{ isDuplicate: boolean; existingTask: Task | null }> {
    if (!sourceType || !sourceId || !sourceId.trim() || sourceType === 'MANUAL') {
      return { isDuplicate: false, existingTask: null };
    }
    const activeTask = await this.getActiveTaskBySource(sourceType, sourceId);
    return {
      isDuplicate: Boolean(activeTask),
      existingTask: activeTask,
    };
  },

  /**
   * [R3-3 3/3-B] 특정 출처(sourceType, sourceId)와 연결된 진행 중(미완료) 업무 단건 조회
   * - status === 'TODO' | 'IN_PROGRESS' 인 업무가 있으면 반환
   * - COMPLETED 또는 CANCELLED만 있다면 null 반환
   */
  async getActiveTaskBySource(sourceType: TaskSourceType, sourceId: string): Promise<Task | null> {
    if (!sourceType || !sourceId || !sourceId.trim() || sourceType === 'MANUAL') return null;
    const cleanSourceId = sourceId.trim();
    const colRef = collection(db, TASKS_COLLECTION);

    try {
      const q = query(
        colRef,
        where('sourceType', '==', sourceType),
        where('sourceId', '==', cleanSourceId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
      const active = list.find((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
      return active || null;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.LIST,
        `${TASKS_COLLECTION}?sourceType=${sourceType}&sourceId=${cleanSourceId}`
      );
      throw error;
    }
  },

  /**
   * [R3-3 3/3-B] 특정 출처와 연결된 전체 업무 이력 목록 조회
   */
  async getTasksBySource(sourceType: TaskSourceType, sourceId: string): Promise<Task[]> {
    if (!sourceType || !sourceId || !sourceId.trim()) return [];
    const cleanSourceId = sourceId.trim();
    const colRef = collection(db, TASKS_COLLECTION);

    try {
      const q = query(
        colRef,
        where('sourceType', '==', sourceType),
        where('sourceId', '==', cleanSourceId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
      return sortTasks(list);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.LIST,
        `${TASKS_COLLECTION}?sourceType=${sourceType}&sourceId=${cleanSourceId}`
      );
      throw error;
    }
  },

  /**
   * [R3-3 3/3-B] 원본 업무 문서 존재 여부 검증 Helper
   * - 존재하지 않거나 삭제된 경우 false 반환
   */
  async verifySourceExists(sourceType: TaskSourceType, sourceId: string): Promise<boolean> {
    if (!sourceType || !sourceId || !sourceId.trim() || sourceType === 'MANUAL') return false;
    const cleanId = sourceId.trim();

    try {
      switch (sourceType) {
        case 'INQUIRY': {
          const snap = await getDoc(doc(db, 'inquiries', cleanId));
          return snap.exists();
        }
        case 'DATA_REQUEST': {
          const snap = await getDoc(doc(db, 'data_requests', cleanId));
          return snap.exists();
        }
        case 'MATERNITY': {
          const snap = await getDoc(doc(db, 'maternity_cases', cleanId));
          return snap.exists();
        }
        case 'PAYROLL': {
          // [R3-3 3/3-B-④-A] 실제 Firestore payroll 문서가 존재하는 경우에만 true 반환
          // 임시 급여 건이나 저장 전 sourceId(실제 payrolls 문서 없음)는 false 반환
          const snap = await getDoc(doc(db, 'payrolls', cleanId));
          return snap.exists();
        }
        default:
          return false;
      }
    } catch (err) {
      console.warn('verifySourceExists lookup failed:', err);
      return false;
    }
  },

  /**
   * [R3-3 3/3-B-④-A] 원본 업무 문서 단건 조회
   * - 실제 Firestore 원본 문서가 존재하면 반환, 없으면 null 반환
   */
  async getSourceDetail(sourceType: TaskSourceType, sourceId: string): Promise<any | null> {
    if (!sourceType || !sourceId || !sourceId.trim() || sourceType === 'MANUAL') return null;
    const cleanId = sourceId.trim();

    try {
      switch (sourceType) {
        case 'INQUIRY': {
          const snap = await getDoc(doc(db, 'inquiries', cleanId));
          return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        }
        case 'DATA_REQUEST': {
          const snap = await getDoc(doc(db, 'data_requests', cleanId));
          return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        }
        case 'MATERNITY': {
          const snap = await getDoc(doc(db, 'maternity_cases', cleanId));
          return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        }
        case 'PAYROLL': {
          const snap = await getDoc(doc(db, 'payrolls', cleanId));
          return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        }
        default:
          return null;
      }
    } catch (err) {
      console.warn('getSourceDetail lookup failed:', err);
      return null;
    }
  },

  /**
   * [R3-3 3/3-B-③-B] 출처(sourceType, sourceId) 기반 task의 대상(companyId, workerId) 정합성 검증
   * - 원본 업무가 가진 실제 companyId/workerId와 다른 대상으로 저장될 수 없음
   * - 적용 대상: INQUIRY, DATA_REQUEST, MATERNITY, PAYROLL
   * - 원본 업무에 companyId가 존재하면 원본 companyId를 그대로 사용 (임의 변경 및 변조 차단)
   * - 비소속 개인 문의 등 원본에 companyId가 없으면 가짜 companyId 생성 차단 (companyId 미지정 유지)
   * - MATERNITY: maternityCase.employeeId의 canonical worker.id를 반드시 유지 (auth.uid, 이름 기반 ID, 타 근로자 차단)
   * - 개별 PAYROLL: payroll.employeeId의 canonical worker.id를 반드시 유지 (auth.uid, 이름 기반 ID, 타 근로자 차단)
   * - 원본에 workerId가 없는 업무: workerId 임의 생성/전달 차단
   */
  async validateSourceConsistency(
    sourceType: TaskSourceType,
    sourceId: string,
    targetCompanyId?: string,
    targetWorkerId?: string
  ): Promise<{ expectedCompanyId?: string; expectedWorkerId?: string }> {
    if (!sourceType || sourceType === 'MANUAL' || !sourceId || !sourceId.trim()) {
      return {};
    }

    const cleanSourceId = sourceId.trim();
    const cleanCompanyId = targetCompanyId && targetCompanyId.trim() ? targetCompanyId.trim() : undefined;
    const cleanWorkerId = targetWorkerId && targetWorkerId.trim() ? targetWorkerId.trim() : undefined;

    switch (sourceType) {
      case 'INQUIRY': {
        const snap = await getDoc(doc(db, 'inquiries', cleanSourceId));
        if (!snap.exists()) {
          throw new Error(`존재하지 않는 원본 문의입니다. (id: ${cleanSourceId})`);
        }
        const data = snap.data();
        const actualCompanyId = data?.companyId && String(data.companyId).trim() ? String(data.companyId).trim() : undefined;

        // 기업 정합성 검증
        if (actualCompanyId) {
          if (cleanCompanyId !== actualCompanyId) {
            throw new Error(
              `원본 문의의 기업(companyId: ${actualCompanyId})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
            );
          }
        } else {
          // 비소속 개인 문의: 원본에 companyId가 없는 경우 가짜 companyId 생성 차단
          if (cleanCompanyId) {
            throw new Error(`비소속 개인 문의에는 기업을 임의로 지정할 수 없습니다. (전달된 companyId: ${cleanCompanyId})`);
          }
        }

        // 근로자 정합성 검증: 원본에 workerId가 없는 문의 업무에는 임의 workerId 생성 차단
        if (cleanWorkerId) {
          throw new Error(`원본 문의에는 근로자를 임의로 지정할 수 없습니다. (전달된 workerId: ${cleanWorkerId})`);
        }

        return { expectedCompanyId: actualCompanyId, expectedWorkerId: undefined };
      }

      case 'DATA_REQUEST': {
        const snap = await getDoc(doc(db, 'data_requests', cleanSourceId));
        if (!snap.exists()) {
          throw new Error(`존재하지 않는 원본 자료요청입니다. (id: ${cleanSourceId})`);
        }
        const data = snap.data();
        const actualCompanyId = data?.companyId && String(data.companyId).trim() ? String(data.companyId).trim() : undefined;

        // 기업 정합성 검증
        if (!actualCompanyId || cleanCompanyId !== actualCompanyId) {
          throw new Error(
            `원본 자료요청의 기업(companyId: ${actualCompanyId || '없음'})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
          );
        }

        // 근로자 정합성 검증: 자료요청은 기업 단위 업무이므로 workerId 임의 생성 차단
        if (cleanWorkerId) {
          throw new Error(`원본 자료요청에는 근로자를 임의로 지정할 수 없습니다. (전달된 workerId: ${cleanWorkerId})`);
        }

        return { expectedCompanyId: actualCompanyId, expectedWorkerId: undefined };
      }

      case 'MATERNITY': {
        const snap = await getDoc(doc(db, 'maternity_cases', cleanSourceId));
        if (!snap.exists()) {
          throw new Error(`존재하지 않는 원본 모성보호 신청입니다. (id: ${cleanSourceId})`);
        }
        const data = snap.data();
        const actualCompanyId = data?.companyId && String(data.companyId).trim() ? String(data.companyId).trim() : undefined;
        const actualWorkerId = data?.employeeId && String(data.employeeId).trim() ? String(data.employeeId).trim() : undefined;

        // 기업 정합성 검증
        if (!actualCompanyId || cleanCompanyId !== actualCompanyId) {
          throw new Error(
            `원본 모성보호 신청의 기업(companyId: ${actualCompanyId || '없음'})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
          );
        }

        // 근로자 정합성 검증: maternityCase.employeeId의 canonical worker.id 유지
        if (!actualWorkerId || cleanWorkerId !== actualWorkerId) {
          throw new Error(
            `원본 모성보호 신청의 대상 근로자(workerId: ${actualWorkerId || '없음'})와 일치하지 않는 근로자(workerId: ${cleanWorkerId || '없음'})입니다.`
          );
        }

        return { expectedCompanyId: actualCompanyId, expectedWorkerId: actualWorkerId };
      }

      case 'PAYROLL': {
        const snap = await getDoc(doc(db, 'payrolls', cleanSourceId));
        if (snap.exists()) {
          const data = snap.data();
          const actualCompanyId = data?.companyId && String(data.companyId).trim() ? String(data.companyId).trim() : undefined;
          const actualWorkerId = data?.employeeId && String(data.employeeId).trim() ? String(data.employeeId).trim() : undefined;

          // 기업 정합성 검증
          if (!actualCompanyId || cleanCompanyId !== actualCompanyId) {
            throw new Error(
              `원본 급여 레코드의 기업(companyId: ${actualCompanyId || '없음'})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
            );
          }

          // 근로자 정합성 검증: 개별 급여 레코드는 payroll.employeeId 유지, 없으면 workerId 차단
          if (actualWorkerId) {
            if (cleanWorkerId !== actualWorkerId) {
              throw new Error(
                `개별 급여 레코드의 대상 근로자(workerId: ${actualWorkerId})와 일치하지 않는 근로자(workerId: ${cleanWorkerId || '없음'})입니다.`
              );
            }
          } else {
            if (cleanWorkerId) {
              throw new Error(`회사 전체 급여 업무에는 근로자를 임의로 지정할 수 없습니다. (전달된 workerId: ${cleanWorkerId})`);
            }
          }

          return { expectedCompanyId: actualCompanyId, expectedWorkerId: actualWorkerId };
        }

        // Firestore payrolls에 아직 저장되지 않은 가상 ID 또는 대장 ID 패턴 검증
        if (cleanSourceId.startsWith('payroll_')) {
          const rest = cleanSourceId.substring('payroll_'.length);
          const lastIdx = rest.lastIndexOf('_');
          const compId = lastIdx > 0 ? rest.substring(0, lastIdx) : rest;
          if (!compId || cleanCompanyId !== compId) {
            throw new Error(
              `급여대장 업무의 기업(companyId: ${compId || '없음'})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
            );
          }
          if (cleanWorkerId) {
            throw new Error(`회사 전체 급여대장 업무에는 근로자를 임의로 지정할 수 없습니다. (전달된 workerId: ${cleanWorkerId})`);
          }
          return { expectedCompanyId: compId, expectedWorkerId: undefined };
        }

        if (cleanSourceId.startsWith('pr_')) {
          const rest = cleanSourceId.substring(3); // after 'pr_'
          const lastIdx = rest.lastIndexOf('_'); // before yearMonth
          const body = lastIdx > 0 ? rest.substring(0, lastIdx) : rest;

          if (cleanCompanyId && cleanWorkerId && body === `${cleanCompanyId}_${cleanWorkerId}`) {
            return { expectedCompanyId: cleanCompanyId, expectedWorkerId: cleanWorkerId };
          }

          throw new Error(
            `개별 급여 업무의 대상 정보와 일치하지 않는 기업 또는 근로자입니다. (전달된 companyId: ${cleanCompanyId || '없음'}, workerId: ${cleanWorkerId || '없음'})`
          );
        }

        throw new Error(`존재하지 않는 원본 급여 업무입니다. (id: ${cleanSourceId})`);
      }

      default:
        return {};
    }
  },
};
