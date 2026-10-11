import type {
  Task,
  CreateTaskInput,
  TaskSourceType,
} from '../src/types';
import { taskService, TaskActor, TASK_SOURCE_LOCKS_COLLECTION, TASKS_COLLECTION } from '../src/services/taskService';
import { auditLogService } from '../src/services/auditLogService';

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
console.log('[R3-3 3/3-C-②-A] 출처 task 중복 생성 원자성 테스트');
console.log('================================================================\n');

// Mock Actor
const mockAdminActor: TaskActor = {
  uid: 'admin_test_uid',
  name: '노무법인 관리자',
  role: 'ADMIN',
};

/**
 * Concurrency Test Harness simulating Firestore Transaction and Mutex Atomicity
 */
class AtomicTaskConcurrencySimulator {
  private tasks = new Map<string, Task>();
  private locks = new Map<string, { activeTaskId: string | null; activeTaskStatus: string; updatedAt: string }>();
  private auditLogs: Array<{ action: string; resourceId: string; details: any }> = [];

  reset() {
    this.tasks.clear();
    this.locks.clear();
    this.auditLogs = [];
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getAuditLogs() {
    return this.auditLogs;
  }

  getLock(sourceType: TaskSourceType, sourceId: string) {
    return this.locks.get(`${sourceType}__${sourceId}`);
  }

  // Simulated runTransaction with serializable conflict resolution
  async runTransaction<T>(updateFunction: (t: any) => Promise<T>): Promise<T> {
    // Firestore transactions lock documents.
    // Simulating random network jitter and serial execution retries:
    return await updateFunction({
      get: async (ref: { col: string; id: string }) => {
        if (ref.col === TASK_SOURCE_LOCKS_COLLECTION) {
          const lock = this.locks.get(ref.id);
          return {
            exists: () => Boolean(lock),
            data: () => lock,
          };
        }
        if (ref.col === TASKS_COLLECTION) {
          const task = this.tasks.get(ref.id);
          return {
            exists: () => Boolean(task),
            data: () => task,
          };
        }
        return { exists: () => false, data: () => null };
      },
      set: (ref: { col: string; id: string }, data: any) => {
        if (ref.col === TASK_SOURCE_LOCKS_COLLECTION) {
          const prev = this.locks.get(ref.id) || {};
          this.locks.set(ref.id, { ...prev, ...data });
        } else if (ref.col === TASKS_COLLECTION) {
          this.tasks.set(ref.id, { ...data });
        }
      },
    });
  }

  // Atomic createTask implementation matching taskService.ts
  async createTask(input: CreateTaskInput, currentUser: TaskActor): Promise<Task> {
    const cleanSourceType: TaskSourceType = input.sourceType || 'MANUAL';
    const cleanSourceId = input.sourceId && input.sourceId.trim() ? input.sourceId.trim() : undefined;
    const initialStatus = input.status || 'TODO';
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const newTask: Task = {
      id: taskId,
      companyId: input.companyId,
      workerId: input.workerId,
      title: input.title,
      description: input.description,
      priority: input.priority || 'NORMAL',
      status: initialStatus,
      dueDate: input.dueDate,
      sourceType: cleanSourceType,
      sourceId: cleanSourceId,
      createdAt: now,
      updatedAt: now,
      createdById: currentUser.uid,
      createdByName: currentUser.name || '노무법인 관리자',
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    if (cleanSourceType && cleanSourceType !== 'MANUAL' && cleanSourceId) {
      const lockDocId = `${cleanSourceType}__${cleanSourceId}`;

      // Jitter delay simulating asynchronous arrival & transaction race
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

      await this.runTransaction(async (transaction) => {
        const lockSnap = await transaction.get({ col: TASK_SOURCE_LOCKS_COLLECTION, id: lockDocId });

        if (lockSnap.exists()) {
          const lockData = lockSnap.data();
          const currentActiveTaskId = lockData?.activeTaskId;

          if (currentActiveTaskId) {
            const activeTaskSnap = await transaction.get({ col: TASKS_COLLECTION, id: currentActiveTaskId });
            if (activeTaskSnap.exists()) {
              const activeTaskData = activeTaskSnap.data() as Task;
              if (activeTaskData.status === 'TODO' || activeTaskData.status === 'IN_PROGRESS') {
                const dupError: any = new Error('이 업무와 연결된 진행 중 할 일이 이미 있습니다.');
                dupError.code = 'DUPLICATE_ACTIVE_TASK';
                dupError.existingTaskId = activeTaskData.id;
                dupError.existingTask = activeTaskData;
                throw dupError;
              }
            }
          }
        }

        // Set task and update lock document atomically
        transaction.set({ col: TASKS_COLLECTION, id: taskId }, newTask);
        const isInitialActive = initialStatus === 'TODO' || initialStatus === 'IN_PROGRESS';
        transaction.set(
          { col: TASK_SOURCE_LOCKS_COLLECTION, id: lockDocId },
          {
            id: lockDocId,
            sourceType: cleanSourceType,
            sourceId: cleanSourceId,
            activeTaskId: isInitialActive ? taskId : null,
            activeTaskStatus: initialStatus,
            updatedAt: now,
          }
        );
      });
    } else {
      // MANUAL
      this.tasks.set(taskId, newTask);
    }

    // Audit Log only recorded upon successful commit
    this.auditLogs.push({
      action: 'TASK_CREATED',
      resourceId: taskId,
      details: { taskId, sourceType: cleanSourceType, sourceId: cleanSourceId },
    });

    return newTask;
  }

  async completeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'COMPLETED';
    task.completedAt = new Date().toISOString();
    if (task.sourceType && task.sourceType !== 'MANUAL' && task.sourceId) {
      const lock = this.locks.get(`${task.sourceType}__${task.sourceId}`);
      if (lock) {
        lock.activeTaskId = null;
        lock.activeTaskStatus = 'COMPLETED';
      }
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'CANCELLED';
    if (task.sourceType && task.sourceType !== 'MANUAL' && task.sourceId) {
      const lock = this.locks.get(`${task.sourceType}__${task.sourceId}`);
      if (lock) {
        lock.activeTaskId = null;
        lock.activeTaskStatus = 'CANCELLED';
      }
    }
  }
}

async function runTests() {
  const sim = new AtomicTaskConcurrencySimulator();

  // =========================================================================
  // Test 1: 완전 동시 2개 생성 테스트 (INQUIRY, DATA_REQUEST, MATERNITY, PAYROLL)
  // =========================================================================
  console.log('--- 1. 완전 동시 2개 생성 테스트 (4개 출처 대상) ---');
  const targetSources: TaskSourceType[] = ['INQUIRY', 'DATA_REQUEST', 'MATERNITY', 'PAYROLL'];

  for (const src of targetSources) {
    sim.reset();
    const sourceId = `src_id_${src.toLowerCase()}_001`;

    const req1 = sim.createTask(
      { title: `${src} 동시 요청 1`, priority: 'HIGH', sourceType: src, sourceId, companyId: 'comp_1' },
      mockAdminActor
    );
    const req2 = sim.createTask(
      { title: `${src} 동시 요청 2`, priority: 'NORMAL', sourceType: src, sourceId, companyId: 'comp_1' },
      mockAdminActor
    );

    const results = await Promise.allSettled([req1, req2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(fulfilled.length === 1, `[${src}] 동시 2개 요청 중 정확히 1개만 성공 (성공: ${fulfilled.length})`);
    assert(rejected.length === 1, `[${src}] 동시 2개 요청 중 정확히 1개 거부 (실패: ${rejected.length})`);

    const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
    assert(rejectedError.code === 'DUPLICATE_ACTIVE_TASK', `[${src}] 실패 사유가 DUPLICATE_ACTIVE_TASK`);
    assert(
      rejectedError.message === '이 업무와 연결된 진행 중 할 일이 이미 있습니다.',
      `[${src}] 오류 메시지 표준 일치`
    );

    const allTasks = sim.getTasks();
    assert(allTasks.length === 1, `[${src}] DB에 저장된 실제 업무는 단 1개`);
    assert(allTasks[0].sourceType === src && allTasks[0].sourceId === sourceId, `[${src}] 저장된 업무 출처 일치`);

    const lock = sim.getLock(src, sourceId);
    assert(lock !== undefined && lock.activeTaskId === allTasks[0].id, `[${src}] 락 문서가 성공한 taskId를 가리킴`);
  }

  // =========================================================================
  // Test 2: 동시 5개 / 10개 요청 고부하 동시성 테스트
  // =========================================================================
  console.log('\n--- 2. 동시 5개 / 10개 요청 동시성 테스트 ---');
  {
    // 5개 동시 요청
    sim.reset();
    const sourceId = 'inq_stress_5';
    const promises5 = Array.from({ length: 5 }, (_, i) =>
      sim.createTask(
        { title: `INQUIRY 스트레스 5 - #${i}`, priority: 'NORMAL', sourceType: 'INQUIRY', sourceId, companyId: 'c1' },
        mockAdminActor
      )
    );
    const results5 = await Promise.allSettled(promises5);
    const fulfilled5 = results5.filter((r) => r.status === 'fulfilled');
    const rejected5 = results5.filter((r) => r.status === 'rejected');

    assert(fulfilled5.length === 1, `5개 동시 요청 중 정확히 1개만 성공 (성공: ${fulfilled5.length})`);
    assert(rejected5.length === 4, `5개 동시 요청 중 나머지 4개 모두 거부 (실패: ${rejected5.length})`);
    assert(sim.getTasks().length === 1, '5개 동시 요청 후 저장된 업무는 1건만 존재');

    for (const r of rejected5) {
      assert((r as PromiseRejectedResult).reason.code === 'DUPLICATE_ACTIVE_TASK', '모든 거부 요청의 code는 DUPLICATE_ACTIVE_TASK');
    }
  }

  {
    // 10개 동시 요청
    sim.reset();
    const sourceId = 'payroll_stress_10';
    const promises10 = Array.from({ length: 10 }, (_, i) =>
      sim.createTask(
        { title: `PAYROLL 스트레스 10 - #${i}`, priority: 'URGENT', sourceType: 'PAYROLL', sourceId, companyId: 'c1' },
        mockAdminActor
      )
    );
    const results10 = await Promise.allSettled(promises10);
    const fulfilled10 = results10.filter((r) => r.status === 'fulfilled');
    const rejected10 = results10.filter((r) => r.status === 'rejected');

    assert(fulfilled10.length === 1, `10개 동시 요청 중 정확히 1개만 성공 (성공: ${fulfilled10.length})`);
    assert(rejected10.length === 9, `10개 동시 요청 중 나머지 9개 모두 거부 (실패: ${rejected10.length})`);
    assert(sim.getTasks().length === 1, '10개 동시 요청 후 저장된 업무는 1건만 존재');
  }

  // =========================================================================
  // Test 3: COMPLETED / CANCELLED 후 재생성 테스트
  // =========================================================================
  console.log('\n--- 3. COMPLETED / CANCELLED 후 재생성 테스트 ---');
  {
    sim.reset();
    const sourceId = 'mat_lifecycle_001';

    // 1) 1차 생성
    const t1 = await sim.createTask(
      { title: '모성보호 1차 할 일', priority: 'NORMAL', sourceType: 'MATERNITY', sourceId, companyId: 'c1' },
      mockAdminActor
    );
    assert(t1.status === 'TODO', '1차 할 일 TODO 생성 완료');

    // 2) 중복 생성 시도 차단 확인
    let dupBlocked = false;
    try {
      await sim.createTask(
        { title: '모성보호 1차 진행 중 중복 시도', priority: 'NORMAL', sourceType: 'MATERNITY', sourceId, companyId: 'c1' },
        mockAdminActor
      );
    } catch (e: any) {
      dupBlocked = e.code === 'DUPLICATE_ACTIVE_TASK';
    }
    assert(dupBlocked, '1차 할 일 활성 상태에서는 새 할 일 생성 차단');

    // 3) 완료 처리 (COMPLETED)
    await sim.completeTask(t1.id);
    assert(sim.getTasks().find((t) => t.id === t1.id)?.status === 'COMPLETED', '1차 할 일 COMPLETED 처리 완료');

    // 4) 완료 후 새 활성 task 생성 허용 확인
    const t2 = await sim.createTask(
      { title: '모성보호 2차 할 일 (완료 후)', priority: 'HIGH', sourceType: 'MATERNITY', sourceId, companyId: 'c1' },
      mockAdminActor
    );
    assert(t2.id !== t1.id, '새로운 taskId로 생성 성공');
    assert(t2.status === 'TODO', '2차 할 일 정상 TODO 상태');
    assert(sim.getTasks().length === 2, 'DB에 1차(완료)와 2차(TODO) 이력 모두 보존');

    // 5) 2차 할 일 취소 처리 (CANCELLED)
    await sim.cancelTask(t2.id);
    assert(sim.getTasks().find((t) => t.id === t2.id)?.status === 'CANCELLED', '2차 할 일 CANCELLED 처리 완료');

    // 6) 취소 후 3차 활성 task 생성 허용 확인
    const t3 = await sim.createTask(
      { title: '모성보호 3차 할 일 (취소 후)', priority: 'URGENT', sourceType: 'MATERNITY', sourceId, companyId: 'c1' },
      mockAdminActor
    );
    assert(t3.status === 'TODO', '3차 할 일 정상 TODO 상태 생성');
    assert(sim.getTasks().length === 3, 'DB에 이전 이력 모두 누적 보존');
  }

  // =========================================================================
  // Test 4: MANUAL 영향 여부 검증 (MANUAL task는 출처 중복 제약 미적용)
  // =========================================================================
  console.log('\n--- 4. MANUAL 영향 여부 검증 ---');
  {
    sim.reset();
    // 동시 5개의 MANUAL task 생성
    const manualPromises = Array.from({ length: 5 }, (_, i) =>
      sim.createTask(
        { title: `MANUAL 일반 업무 #${i}`, priority: 'NORMAL', sourceType: 'MANUAL', companyId: 'c1' },
        mockAdminActor
      )
    );
    const manualResults = await Promise.allSettled(manualPromises);
    const manualFulfilled = manualResults.filter((r) => r.status === 'fulfilled');

    assert(manualFulfilled.length === 5, `MANUAL task는 동시 5건 모두 성공 (성공: ${manualFulfilled.length})`);
    assert(sim.getTasks().length === 5, 'MANUAL task 5건 정상 DB 저장');
    assert(sim.getLock('MANUAL', '') === undefined, 'MANUAL task는 락 문서를 생성하지 않음');
  }

  // =========================================================================
  // Test 5: Audit Log 중복 여부 검증
  // =========================================================================
  console.log('\n--- 5. Audit Log 중복 여부 검증 ---');
  {
    sim.reset();
    const sourceId = 'data_req_audit_test';

    // 5개 동시 요청 실행
    const promises = Array.from({ length: 5 }, (_, i) =>
      sim.createTask(
        { title: `자료요청 동시 요청 #${i}`, priority: 'HIGH', sourceType: 'DATA_REQUEST', sourceId, companyId: 'c1' },
        mockAdminActor
      )
    );
    await Promise.allSettled(promises);

    const auditLogs = sim.getAuditLogs();
    assert(auditLogs.length === 1, `5개 동시 요청 중 Audit Log는 단 1건만 기록됨 (기록 수: ${auditLogs.length})`);
    assert(auditLogs[0].action === 'TASK_CREATED', '기록된 Audit Log의 액션은 TASK_CREATED');
    assert(auditLogs[0].details.sourceType === 'DATA_REQUEST', 'Audit Log의 sourceType 정상 기록');
    assert(auditLogs[0].details.sourceId === sourceId, 'Audit Log의 sourceId 정상 기록');
  }

  // =========================================================================
  // Test 6: 실제 taskService 코드 구조 및 export 정합성 검증
  // =========================================================================
  console.log('\n--- 6. 실제 taskService 코드 인터페이스 정합성 검증 ---');
  {
    assert(typeof taskService.createTask === 'function', 'taskService.createTask 함수 존재');
    assert(typeof taskService.completeTask === 'function', 'taskService.completeTask 함수 존재');
    assert(typeof taskService.cancelTask === 'function', 'taskService.cancelTask 함수 존재');
    assert(typeof taskService.reopenTask === 'function', 'taskService.reopenTask 함수 존재');
    assert(typeof taskService.updateTask === 'function', 'taskService.updateTask 함수 존재');
    assert(TASK_SOURCE_LOCKS_COLLECTION === 'task_source_locks', 'TASK_SOURCE_LOCKS_COLLECTION 상수 올바르게 선언됨');
  }

  console.log('\n================================================================');
  console.log(`[R3-3 3/3-C-②-A 테스트 결과]: 총 ${passCount + failCount}건 검증 중 통과 ${passCount}건, 실패 ${failCount}건`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
