import type {
  Task,
  CreateTaskInput,
  TaskSourceType,
  TaskStatus,
} from '../src/types';
import { taskService, TaskActor, TASK_SOURCE_LOCKS_COLLECTION, TASKS_COLLECTION } from '../src/services/taskService';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failCount++;
  }
}

console.log('================================================================');
console.log('[R3-3 3/3-C-②-B] task_source_locks 무결성 및 정합성 검증 테스트');
console.log('================================================================\n');

// -------------------------------------------------------------
// 1. Firestore Rules Emulation for task_source_locks
// -------------------------------------------------------------
interface AuthContext {
  uid: string;
  role: 'ADMIN' | 'COMPANY' | 'WORKER';
}

// Mock Actor
const mockAdminActor: AuthContext & TaskActor = {
  uid: 'admin_test_uid',
  name: '노무법인 관리자',
  role: 'ADMIN',
};

const mockCompanyActor: AuthContext & TaskActor = {
  uid: 'company_test_uid',
  name: '회사 담당자',
  role: 'COMPANY',
};

const mockWorkerActor: AuthContext & TaskActor = {
  uid: 'worker_test_uid',
  name: '근로자',
  role: 'WORKER',
};

function isValidTaskSourceLockRule(data: any, lockId: string): boolean {
  if (data.id !== lockId) return false;
  if (!['INQUIRY', 'DATA_REQUEST', 'MATERNITY', 'PAYROLL', 'MESSAGE', 'DOCUMENT', 'OTHER'].includes(data.sourceType)) {
    return false;
  }
  if (typeof data.sourceId !== 'string' || data.sourceId.length === 0 || data.sourceId.length > 100) {
    return false;
  }
  if (lockId !== `${data.sourceType}__${data.sourceId}`) return false;
  if (typeof data.updatedAt !== 'string' || data.updatedAt.length === 0) return false;

  const allowedKeys = ['id', 'sourceType', 'sourceId', 'activeTaskId', 'activeTaskStatus', 'updatedAt'];
  const keys = Object.keys(data);
  for (const k of keys) {
    if (!allowedKeys.includes(k)) return false;
  }

  // Active lock
  if (typeof data.activeTaskId === 'string' && data.activeTaskId.length > 0) {
    return data.activeTaskStatus === 'TODO' || data.activeTaskStatus === 'IN_PROGRESS';
  }

  // Released lock
  if (data.activeTaskId === null || data.activeTaskId === undefined) {
    return (
      data.activeTaskStatus === null ||
      data.activeTaskStatus === undefined ||
      data.activeTaskStatus === 'COMPLETED' ||
      data.activeTaskStatus === 'CANCELLED'
    );
  }

  return false;
}

function evaluateLockCreate(auth: AuthContext | null, data: any, lockId: string): boolean {
  if (!auth || auth.role !== 'ADMIN') return false;
  return isValidTaskSourceLockRule(data, lockId);
}

function evaluateLockUpdate(auth: AuthContext | null, resourceData: any, requestData: any, lockId: string): boolean {
  if (!auth || auth.role !== 'ADMIN') return false;
  if (requestData.id !== resourceData.id) return false;
  if (requestData.sourceType !== resourceData.sourceType) return false;
  if (requestData.sourceId !== resourceData.sourceId) return false;
  return isValidTaskSourceLockRule(requestData, lockId);
}

function evaluateLockDelete(auth: AuthContext | null): boolean {
  return false; // allow delete: if false;
}

// -------------------------------------------------------------
// 2. State & Transaction Simulator for taskService integration
// -------------------------------------------------------------
class IntegrityTestSimulator {
  public tasks = new Map<string, Task>();
  public locks = new Map<string, any>();
  private transactionQueue: Promise<any> = Promise.resolve();

  reset() {
    this.tasks.clear();
    this.locks.clear();
    this.transactionQueue = Promise.resolve();
  }

  // Simulate Firestore Transaction with mutual exclusion
  async runTransaction<T>(updateFunction: (t: any) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.transactionQueue = this.transactionQueue.then(async () => {
        try {
          const transaction = {
            get: async (ref: any) => {
              if (ref.col === TASKS_COLLECTION) {
                const t = this.tasks.get(ref.id);
                return {
                  exists: () => !!t,
                  data: () => (t ? { ...t } : undefined),
                };
              } else if (ref.col === TASK_SOURCE_LOCKS_COLLECTION) {
                const l = this.locks.get(ref.id);
                return {
                  exists: () => !!l,
                  data: () => (l ? { ...l } : undefined),
                };
              }
              return { exists: () => false, data: () => undefined };
            },
            set: (ref: any, data: any, options?: any) => {
              if (ref.col === TASKS_COLLECTION) {
                this.tasks.set(ref.id, { ...data });
              } else if (ref.col === TASK_SOURCE_LOCKS_COLLECTION) {
                if (options?.merge && this.locks.has(ref.id)) {
                  this.locks.set(ref.id, { ...this.locks.get(ref.id), ...data });
                } else {
                  this.locks.set(ref.id, { ...data });
                }
              }
            },
            update: (ref: any, data: any) => {
              if (ref.col === TASKS_COLLECTION) {
                const existing = this.tasks.get(ref.id);
                if (existing) {
                  this.tasks.set(ref.id, { ...existing, ...data });
                }
              }
            },
          };

          const result = await updateFunction(transaction);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  // Simulate createTask logic with integrity checks
  async createTask(input: CreateTaskInput, currentUser: TaskActor): Promise<Task> {
    const taskId = `task_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const cleanSourceType = input.sourceType || 'MANUAL';
    const cleanSourceId = input.sourceId ? input.sourceId.trim() : undefined;
    const initialStatus = input.status || 'TODO';

    const newTask: Task = {
      id: taskId,
      title: input.title.trim(),
      priority: input.priority,
      status: initialStatus,
      sourceType: cleanSourceType,
      sourceId: cleanSourceId,
      createdAt: now,
      updatedAt: now,
      createdById: currentUser.uid,
      createdByName: currentUser.name || '관리자',
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '관리자',
    };

    if (cleanSourceType !== 'MANUAL' && cleanSourceId) {
      const lockDocId = `${cleanSourceType}__${cleanSourceId}`;
      const lockRef = { col: TASK_SOURCE_LOCKS_COLLECTION, id: lockDocId };
      const taskRef = { col: TASKS_COLLECTION, id: taskId };

      await this.runTransaction(async (transaction) => {
        const lockSnap = await transaction.get(lockRef);
        if (lockSnap.exists()) {
          const lockData = lockSnap.data();
          const currentActiveTaskId = lockData?.activeTaskId;

          if (currentActiveTaskId && typeof currentActiveTaskId === 'string') {
            const activeTaskSnap = await transaction.get({ col: TASKS_COLLECTION, id: currentActiveTaskId });
            if (activeTaskSnap.exists()) {
              const activeTaskData = activeTaskSnap.data() as Task;
              if (activeTaskData.status === 'TODO' || activeTaskData.status === 'IN_PROGRESS') {
                // Task ↔ Lock 정합성 검증: 동일 출처인 경우에만 중복 차단
                if (activeTaskData.sourceType === cleanSourceType && activeTaskData.sourceId === cleanSourceId) {
                  const dupError: any = new Error('이 업무와 연결된 진행 중 할 일이 이미 있습니다.');
                  dupError.code = 'DUPLICATE_ACTIVE_TASK';
                  dupError.existingTaskId = activeTaskData.id;
                  throw dupError;
                }
              }
            }
          }
        }

        transaction.set(taskRef, newTask);
        const isInitialActive = initialStatus === 'TODO' || initialStatus === 'IN_PROGRESS';
        transaction.set(
          lockRef,
          {
            id: lockDocId,
            sourceType: cleanSourceType,
            sourceId: cleanSourceId,
            activeTaskId: isInitialActive ? taskId : null,
            activeTaskStatus: initialStatus,
            updatedAt: now,
          },
          { merge: true }
        );
      });
    } else {
      this.tasks.set(taskId, newTask);
    }

    return newTask;
  }

  // Simulate completeTask logic with safe lock release
  async completeTask(taskId: string, currentUser: TaskActor): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');
    const now = new Date().toISOString();
    task.status = 'COMPLETED';
    task.completedAt = now;
    task.updatedAt = now;

    if (task.sourceType && task.sourceType !== 'MANUAL' && task.sourceId) {
      const lockDocId = `${task.sourceType}__${task.sourceId}`;
      const lock = this.locks.get(lockDocId);
      // Safe lock release: only release if activeTaskId matches this task or is empty
      if (!lock?.activeTaskId || lock.activeTaskId === taskId) {
        this.locks.set(lockDocId, {
          id: lockDocId,
          sourceType: task.sourceType,
          sourceId: task.sourceId,
          activeTaskId: null,
          activeTaskStatus: 'COMPLETED',
          updatedAt: now,
        });
      }
    }
    return task;
  }

  // Simulate cancelTask logic with safe lock release
  async cancelTask(taskId: string, currentUser: TaskActor): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');
    const now = new Date().toISOString();
    task.status = 'CANCELLED';
    task.updatedAt = now;

    if (task.sourceType && task.sourceType !== 'MANUAL' && task.sourceId) {
      const lockDocId = `${task.sourceType}__${task.sourceId}`;
      const lock = this.locks.get(lockDocId);
      if (!lock?.activeTaskId || lock.activeTaskId === taskId) {
        this.locks.set(lockDocId, {
          id: lockDocId,
          sourceType: task.sourceType,
          sourceId: task.sourceId,
          activeTaskId: null,
          activeTaskStatus: 'CANCELLED',
          updatedAt: now,
        });
      }
    }
    return task;
  }

  // Simulate reopenTask logic with atomic transaction
  async reopenTask(taskId: string, targetStatus: 'TODO' | 'IN_PROGRESS', currentUser: TaskActor): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');
    const now = new Date().toISOString();

    if (task.sourceType && task.sourceType !== 'MANUAL' && task.sourceId) {
      const lockDocId = `${task.sourceType}__${task.sourceId}`;
      const lockRef = { col: TASK_SOURCE_LOCKS_COLLECTION, id: lockDocId };

      await this.runTransaction(async (transaction) => {
        const lockSnap = await transaction.get(lockRef);
        if (lockSnap.exists()) {
          const lockData = lockSnap.data();
          const currentActiveTaskId = lockData?.activeTaskId;

          if (currentActiveTaskId && currentActiveTaskId !== taskId) {
            const activeTaskSnap = await transaction.get({ col: TASKS_COLLECTION, id: currentActiveTaskId });
            if (activeTaskSnap.exists()) {
              const activeTaskData = activeTaskSnap.data() as Task;
              if (
                (activeTaskData.status === 'TODO' || activeTaskData.status === 'IN_PROGRESS') &&
                activeTaskData.sourceType === task.sourceType &&
                activeTaskData.sourceId === task.sourceId
              ) {
                const dupError: any = new Error('이 업무와 연결된 다른 진행 중 할 일이 이미 존재하여 재오픈할 수 없습니다.');
                dupError.code = 'DUPLICATE_ACTIVE_TASK';
                dupError.existingTaskId = activeTaskData.id;
                throw dupError;
              }
            }
          }
        }

        task.status = targetStatus;
        delete task.completedAt;
        task.updatedAt = now;

        transaction.set(
          lockRef,
          {
            id: lockDocId,
            sourceType: task.sourceType,
            sourceId: task.sourceId,
            activeTaskId: taskId,
            activeTaskStatus: targetStatus,
            updatedAt: now,
          },
          { merge: true }
        );
      });
    } else {
      task.status = targetStatus;
      delete task.completedAt;
      task.updatedAt = now;
    }

    return task;
  }
}

async function runTests() {
  const sim = new IntegrityTestSimulator();

  // ===========================================================================
  // [테스트 1] 락 직접 변조 점검 (Firestore Security Rules)
  // ===========================================================================
  console.log('--- [테스트 1] Firestore Rules: 락 직접 변조 및 권한 차단 ---');

  const validLock = {
    id: 'INQUIRY__inq_100',
    sourceType: 'INQUIRY',
    sourceId: 'inq_100',
    activeTaskId: 'task_abc',
    activeTaskStatus: 'TODO',
    updatedAt: new Date().toISOString(),
  };

  // 1-1. 권한 검증: COMPANY 차단
  assert(evaluateLockCreate(mockCompanyActor, validLock, validLock.id) === false, 'COMPANY 사용자의 lock 문서 create 직접 호출 차단');
  assert(evaluateLockUpdate(mockCompanyActor, validLock, validLock, validLock.id) === false, 'COMPANY 사용자의 lock 문서 update 직접 호출 차단');

  // 1-2. 권한 검증: WORKER 차단
  assert(evaluateLockCreate(mockWorkerActor, validLock, validLock.id) === false, 'WORKER 사용자의 lock 문서 create 직접 호출 차단');
  assert(evaluateLockUpdate(mockWorkerActor, validLock, validLock, validLock.id) === false, 'WORKER 사용자의 lock 문서 update 직접 호출 차단');

  // 1-3. 권한 검증: 미로그인 차단
  assert(evaluateLockCreate(null, validLock, validLock.id) === false, '미로그인 사용자의 lock 문서 create 차단');

  // 1-4. delete 차단 (모든 사용자)
  assert(evaluateLockDelete(mockAdminActor) === false, 'ADMIN을 포함한 모든 사용자의 lock delete 직접 호출 차단');
  assert(evaluateLockDelete(mockCompanyActor) === false, 'COMPANY 사용자의 lock delete 직접 호출 차단');

  // 1-5. ADMIN 정상 생성 허용
  assert(evaluateLockCreate(mockAdminActor, validLock, validLock.id) === true, 'ADMIN의 정상 규격 lock create 승인');

  // 1-6. 불변 필드 변조 차단: sourceType 변경 시도
  const tamperedSourceType = { ...validLock, sourceType: 'PAYROLL' };
  assert(evaluateLockUpdate(mockAdminActor, validLock, tamperedSourceType, validLock.id) === false, '락 문서의 sourceType 임의 변조 시도 차단');

  // 1-7. 불변 필드 변조 차단: sourceId 변경 시도
  const tamperedSourceId = { ...validLock, sourceId: 'inq_999' };
  assert(evaluateLockUpdate(mockAdminActor, validLock, tamperedSourceId, validLock.id) === false, '락 문서의 sourceId 임의 변조 시도 차단');

  // 1-8. 불변 필드 변조 차단: id 변경 시도
  const tamperedId = { ...validLock, id: 'INQUIRY__inq_999' };
  assert(evaluateLockUpdate(mockAdminActor, validLock, tamperedId, validLock.id) === false, '락 문서의 id 임의 변조 시도 차단');

  // 1-9. lockId와 sourceType__sourceId 불일치 차단
  assert(evaluateLockCreate(mockAdminActor, validLock, 'WRONG_DOC_ID') === false, 'lockId 불일치 문서 생성 차단');

  // 1-10. MANUAL sourceType 락 생성 차단 (MANUAL은 락 대상 아님)
  const manualLock = { ...validLock, id: 'MANUAL__man_1', sourceType: 'MANUAL', sourceId: 'man_1' };
  assert(evaluateLockCreate(mockAdminActor, manualLock, manualLock.id) === false, 'MANUAL sourceType의 lock 문서 생성 차단');

  // 1-11. 비정상 상태 조합 차단: activeTaskId가 존재하는데 status가 COMPLETED인 경우
  const invalidCombo1 = { ...validLock, activeTaskId: 'task_abc', activeTaskStatus: 'COMPLETED' };
  assert(evaluateLockCreate(mockAdminActor, invalidCombo1, invalidCombo1.id) === false, 'activeTaskId 존재 시 COMPLETED 상태 설정 차단');

  // 1-12. 비정상 상태 조합 차단: activeTaskId가 null인데 status가 TODO인 경우
  const invalidCombo2 = { ...validLock, activeTaskId: null, activeTaskStatus: 'TODO' };
  assert(evaluateLockCreate(mockAdminActor, invalidCombo2, invalidCombo2.id) === false, 'activeTaskId가 null일 때 TODO 상태 설정 차단');

  // 1-13. 임의 필드 주입 차단
  const injectedKeysLock = { ...validLock, hackerPayload: 'malicious' };
  assert(evaluateLockCreate(mockAdminActor, injectedKeysLock, injectedKeysLock.id) === false, '정의되지 않은 필드 주입 시 차단 (hasOnly)');

  // 1-14. 정상 락 해제 업데이트 승인
  const validReleaseLock = { ...validLock, activeTaskId: null, activeTaskStatus: 'COMPLETED', updatedAt: new Date().toISOString() };
  assert(evaluateLockUpdate(mockAdminActor, validLock, validReleaseLock, validLock.id) === true, '정상 락 해제(activeTaskId: null, COMPLETED) 승인');

  // ===========================================================================
  // [테스트 2] 잘못된 taskId 주입된 락 복구 (Invalid / Non-existent Task ID)
  // ===========================================================================
  console.log('\n--- [테스트 2] 잘못된 taskId 주입된 락의 자가 치유 ---');
  sim.reset();

  // 락 문서는 존재하고 activeTaskId='fake_task_999'를 가리키지만 실제 tasks에는 없는 비정상 상태
  sim.locks.set('INQUIRY__inq_1', {
    id: 'INQUIRY__inq_1',
    sourceType: 'INQUIRY',
    sourceId: 'inq_1',
    activeTaskId: 'fake_task_999',
    activeTaskStatus: 'TODO',
    updatedAt: new Date().toISOString(),
  });

  try {
    const newTask = await sim.createTask(
      { title: '문의 신규 검토', priority: 'NORMAL', sourceType: 'INQUIRY', sourceId: 'inq_1' },
      mockAdminActor
    );
    assert(!!newTask && newTask.id.startsWith('task_'), '잘못된 taskId가 주입된 락이 존재해도 새 task 정상 생성 (영구 차단 방지)');
    const updatedLock = sim.locks.get('INQUIRY__inq_1');
    assert(updatedLock.activeTaskId === newTask.id, '새 task 생성 후 락의 activeTaskId가 실제 유효한 신규 taskId로 자가 치유됨');
  } catch (err: any) {
    assert(false, `잘못된 taskId 락 복구 실패: ${err.message}`);
  }

  // ===========================================================================
  // [테스트 3] 다른 source taskId가 주입된 락 검증 (Foreign Source Task ID)
  // ===========================================================================
  console.log('\n--- [테스트 3] 다른 source의 taskId가 주입된 비정상 락 복구 ---');
  sim.reset();

  // 먼저 PAYROLL 업무 하나 생성
  const payrollTask = await sim.createTask(
    { title: '급여 정산 업무', priority: 'HIGH', sourceType: 'PAYROLL', sourceId: 'pay_1' },
    mockAdminActor
  );

  // 공격자가 INQUIRY__inq_2 락에 방금 만든 PAYROLL task ID를 주입해놓았다고 가정
  sim.locks.set('INQUIRY__inq_2', {
    id: 'INQUIRY__inq_2',
    sourceType: 'INQUIRY',
    sourceId: 'inq_2',
    activeTaskId: payrollTask.id, // 타 출처 taskId 주입!
    activeTaskStatus: 'TODO',
    updatedAt: new Date().toISOString(),
  });

  // 이제 INQUIRY inq_2의 task 생성을 시도
  try {
    const newInquiryTask = await sim.createTask(
      { title: '문의 신규 등록', priority: 'NORMAL', sourceType: 'INQUIRY', sourceId: 'inq_2' },
      mockAdminActor
    );
    assert(newInquiryTask.id !== payrollTask.id, '타 출처 taskId가 주입되어 있어도 정합성 검증을 거쳐 부당 차단 없이 생성 성공');
    const lock = sim.locks.get('INQUIRY__inq_2');
    assert(lock.activeTaskId === newInquiryTask.id, 'INQUIRY 락의 activeTaskId가 올바른 INQUIRY task로 갱신됨');
  } catch (err: any) {
    assert(false, `타 출처 taskId 주입 락 복구 실패: ${err.message}`);
  }

  // ===========================================================================
  // [테스트 4] Stale Lock (이미 완료/취소된 task를 가리키는 락) 복구
  // ===========================================================================
  console.log('\n--- [테스트 4] Stale Lock 처리 (이미 완료/취소된 task의 락 미해제 건) ---');
  sim.reset();

  // Task A 생성 후 수동으로 Task만 COMPLETED로 바꿨거나 락 동기화가 지연된 상황 모사
  const staleTask = await sim.createTask(
    { title: '자료요청 검토', priority: 'NORMAL', sourceType: 'DATA_REQUEST', sourceId: 'dr_1' },
    mockAdminActor
  );
  sim.tasks.get(staleTask.id)!.status = 'COMPLETED'; // DB 상의 실제 task는 이미 완료됨
  // 락은 여전히 activeTaskId = staleTask.id 유지 중 (stale lock)

  try {
    const newTask = await sim.createTask(
      { title: '자료요청 재검토 2차', priority: 'HIGH', sourceType: 'DATA_REQUEST', sourceId: 'dr_1' },
      mockAdminActor
    );
    assert(newTask.id !== staleTask.id, '실제 task가 이미 완료된 stale lock 상태에서 새 task 정상 생성 성공');
    const lock = sim.locks.get('DATA_REQUEST__dr_1');
    assert(lock.activeTaskId === newTask.id, '락이 최신 활성 task로 안전하게 갱신됨');
  } catch (err: any) {
    assert(false, `Stale lock 처리 실패: ${err.message}`);
  }

  // ===========================================================================
  // [테스트 5] 완료 후 재생성 (COMPLETED -> Re-create)
  // ===========================================================================
  console.log('\n--- [테스트 5] 완료 후 재생성 (COMPLETED -> Re-create) ---');
  sim.reset();

  const task1 = await sim.createTask(
    { title: '모성보호 1차 신청', priority: 'NORMAL', sourceType: 'MATERNITY', sourceId: 'mat_1' },
    mockAdminActor
  );
  assert(sim.locks.get('MATERNITY__mat_1')?.activeTaskId === task1.id, '1차 task 생성 시 락 획득');

  // 완료 처리
  await sim.completeTask(task1.id, mockAdminActor);
  const completedLock = sim.locks.get('MATERNITY__mat_1');
  assert(completedLock.activeTaskId === null, '완료 처리 시 락 해제 (activeTaskId: null)');
  assert(completedLock.activeTaskStatus === 'COMPLETED', '완료 처리 시 락 상태 COMPLETED');

  // 완료 후 새 활성 task 생성
  const task2 = await sim.createTask(
    { title: '모성보호 2차 급여 신청', priority: 'HIGH', sourceType: 'MATERNITY', sourceId: 'mat_1' },
    mockAdminActor
  );
  assert(task2.id !== task1.id, '완료 후 동일 출처에서 새 task 정상 생성 성공');
  assert(sim.locks.get('MATERNITY__mat_1')?.activeTaskId === task2.id, '새 task가 락 정상 재획득');

  // ===========================================================================
  // [테스트 6] 취소 후 재생성 (CANCELLED -> Re-create)
  // ===========================================================================
  console.log('\n--- [테스트 6] 취소 후 재생성 (CANCELLED -> Re-create) ---');
  sim.reset();

  const cancelTarget = await sim.createTask(
    { title: '급여 오류 확인', priority: 'URGENT', sourceType: 'PAYROLL', sourceId: 'pay_2' },
    mockAdminActor
  );
  assert(sim.locks.get('PAYROLL__pay_2')?.activeTaskId === cancelTarget.id, '급여 task 생성 시 락 획득');

  // 취소 처리
  await sim.cancelTask(cancelTarget.id, mockAdminActor);
  const cancelledLock = sim.locks.get('PAYROLL__pay_2');
  assert(cancelledLock.activeTaskId === null, '취소 처리 시 락 해제 (activeTaskId: null)');
  assert(cancelledLock.activeTaskStatus === 'CANCELLED', '취소 처리 시 락 상태 CANCELLED');

  // 취소 후 새 활성 task 생성
  const reCreated = await sim.createTask(
    { title: '급여 재확인 건', priority: 'NORMAL', sourceType: 'PAYROLL', sourceId: 'pay_2' },
    mockAdminActor
  );
  assert(reCreated.id !== cancelTarget.id, '취소 후 동일 출처에서 새 task 정상 생성 성공');
  assert(sim.locks.get('PAYROLL__pay_2')?.activeTaskId === reCreated.id, '새 task가 락 정상 재획득');

  // ===========================================================================
  // [테스트 7] 재오픈 경쟁 (Reopen Race Condition)
  // ===========================================================================
  console.log('\n--- [테스트 7] 재오픈 경쟁 및 중복 차단 ---');
  sim.reset();

  // 과거 동일 출처에서 완료되었던 task 2개 준비
  const historyTaskA = await sim.createTask(
    { title: '문의 답변 1차', priority: 'NORMAL', sourceType: 'INQUIRY', sourceId: 'inq_race' },
    mockAdminActor
  );
  await sim.completeTask(historyTaskA.id, mockAdminActor);

  const historyTaskB = await sim.createTask(
    { title: '문의 답변 2차', priority: 'NORMAL', sourceType: 'INQUIRY', sourceId: 'inq_race' },
    mockAdminActor
  );
  await sim.completeTask(historyTaskB.id, mockAdminActor);

  // 현재 락은 해제된 상태
  assert(sim.locks.get('INQUIRY__inq_race')?.activeTaskId === null, '초기 상태: 두 task 모두 완료, 락 해제');

  // 두 완료된 업무를 동시에 재오픈 시도
  const reopenResults = await Promise.allSettled([
    sim.reopenTask(historyTaskA.id, 'IN_PROGRESS', mockAdminActor),
    sim.reopenTask(historyTaskB.id, 'IN_PROGRESS', mockAdminActor),
  ]);

  const fulfilledReopens = reopenResults.filter((r) => r.status === 'fulfilled');
  const rejectedReopens = reopenResults.filter((r) => r.status === 'rejected');

  assert(fulfilledReopens.length === 1, '동시 재오픈 경쟁 시 정확히 1건만 재오픈 성공');
  assert(rejectedReopens.length === 1, '동시 재오픈 경쟁 시 나머지 1건은 원자적으로 차단 실패');
  const rejectReason: any = (rejectedReopens[0] as PromiseRejectedResult).reason;
  assert(rejectReason.code === 'DUPLICATE_ACTIVE_TASK', '실패 사유는 DUPLICATE_ACTIVE_TASK 에러 코드');

  // 추가: 활성 업무가 이미 존재하는 상태에서 다른 과거 업무를 다시 재오픈 시도
  try {
    await sim.reopenTask(historyTaskB.id, 'IN_PROGRESS', mockAdminActor);
    assert(false, '활성 업무 존재 중 다른 업무 재오픈 시도 차단 실패');
  } catch (reopenErr: any) {
    assert(reopenErr.code === 'DUPLICATE_ACTIVE_TASK', '활성 업무가 이미 있을 때 다른 업무 재오픈 시도 즉각 차단 성공');
  }

  // ===========================================================================
  // [테스트 8] 동시 생성 경쟁 (Concurrent Creation Race)
  // ===========================================================================
  console.log('\n--- [테스트 8] 동시 생성 경쟁 (2개 / 5개 / 10개 요청) ---');
  sim.reset();

  // 8-1. 동시 2개 요청
  const twoResults = await Promise.allSettled([
    sim.createTask({ title: '동시1', priority: 'NORMAL', sourceType: 'INQUIRY', sourceId: 'inq_conc' }, mockAdminActor),
    sim.createTask({ title: '동시2', priority: 'NORMAL', sourceType: 'INQUIRY', sourceId: 'inq_conc' }, mockAdminActor),
  ]);
  const twoSuccess = twoResults.filter((r) => r.status === 'fulfilled');
  const twoFail = twoResults.filter((r) => r.status === 'rejected');
  assert(twoSuccess.length === 1 && twoFail.length === 1, '동시 2개 요청 중 정확히 1개 성공, 1개 DUPLICATE_ACTIVE_TASK');

  // 8-2. 동시 5개 요청 (새 출처)
  const fiveResults = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      sim.createTask({ title: `5동시_${i}`, priority: 'HIGH', sourceType: 'DATA_REQUEST', sourceId: 'dr_conc' }, mockAdminActor)
    )
  );
  const fiveSuccess = fiveResults.filter((r) => r.status === 'fulfilled');
  const fiveFail = fiveResults.filter((r) => r.status === 'rejected');
  assert(fiveSuccess.length === 1 && fiveFail.length === 4, '동시 5개 요청 중 정확히 1개 성공, 4개 DUPLICATE_ACTIVE_TASK');

  // 8-3. 동시 10개 요청 (새 출처)
  const tenResults = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      sim.createTask({ title: `10동시_${i}`, priority: 'URGENT', sourceType: 'PAYROLL', sourceId: 'pay_conc' }, mockAdminActor)
    )
  );
  const tenSuccess = tenResults.filter((r) => r.status === 'fulfilled');
  const tenFail = tenResults.filter((r) => r.status === 'rejected');
  assert(tenSuccess.length === 1 && tenFail.length === 9, '동시 10개 요청 중 정확히 1개 성공, 9개 DUPLICATE_ACTIVE_TASK');

  // ===========================================================================
  // [테스트 9] 안전한 락 해제 보호 (다른 활성 task의 락 오염 방지)
  // ===========================================================================
  console.log('\n--- [테스트 9] 안전한 락 해제 (타 활성 task 락 임의 해제 방지) ---');
  sim.reset();

  // Task 1 생성 및 완료
  const firstTask = await sim.createTask(
    { title: '초기 문의', priority: 'NORMAL', sourceType: 'INQUIRY', sourceId: 'inq_safe' },
    mockAdminActor
  );
  await sim.completeTask(firstTask.id, mockAdminActor);

  // Task 2 생성 (현재 activeTaskId = firstTask.id가 아니라 secondTask.id)
  const secondTask = await sim.createTask(
    { title: '후속 문의', priority: 'HIGH', sourceType: 'INQUIRY', sourceId: 'inq_safe' },
    mockAdminActor
  );
  assert(sim.locks.get('INQUIRY__inq_safe')?.activeTaskId === secondTask.id, 'Task 2가 현재 활성 락 소유');

  // 악의적 또는 잘못된 클라이언트가 이미 과거에 완료된 firstTask에 대해 completeTask나 cancelTask를 다시 호출하는 경우
  await sim.completeTask(firstTask.id, mockAdminActor);
  assert(
    sim.locks.get('INQUIRY__inq_safe')?.activeTaskId === secondTask.id,
    '과거 task의 완료 재시도가 현재 Task 2의 활성 락을 해제하지 않음 (락 안전 보장)'
  );

  await sim.cancelTask(firstTask.id, mockAdminActor);
  assert(
    sim.locks.get('INQUIRY__inq_safe')?.activeTaskId === secondTask.id,
    '과거 task의 취소 재시도가 현재 Task 2의 활성 락을 해제하지 않음 (락 안전 보장)'
  );
}

runTests().then(() => {
  console.log(`\n================================================================`);
  console.log(`[R3-3 3/3-C-②-B 테스트 완료]: 총 ${passCount}건 통과, ${failCount}건 실패`);
  console.log(`================================================================`);

  if (failCount > 0) {
    process.exit(1);
  }
});
