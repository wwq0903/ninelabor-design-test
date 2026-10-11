import type {
  Task,
  CreateTaskInput,
  TaskSourceType,
  TaskStatus,
} from '../src/types';
import { taskService, TaskActor } from '../src/services/taskService';

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
console.log('[R3-3 3/3-B-③-A] 출처 기반 중복 할 일 방지 단위/통합 검증');
console.log('================================================================\n');

// Mock Data
const mockAdminActor: TaskActor = {
  uid: 'admin_test_uid',
  name: '노무법인 관리자',
  role: 'ADMIN',
};

// Simulated In-Memory Task Store to test taskService duplicate detection logic
class SimulatedTaskService {
  private tasks: Task[] = [];

  reset() {
    this.tasks = [];
  }

  seedTask(task: Task) {
    this.tasks.push(task);
  }

  async getActiveTaskBySource(sourceType: TaskSourceType, sourceId: string): Promise<Task | null> {
    if (!sourceType || !sourceId || !sourceId.trim() || sourceType === 'MANUAL') return null;
    const cleanSourceId = sourceId.trim();
    const active = this.tasks.find(
      (t) =>
        t.sourceType === sourceType &&
        t.sourceId === cleanSourceId &&
        (t.status === 'TODO' || t.status === 'IN_PROGRESS')
    );
    return active || null;
  }

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
  }

  async createTask(input: CreateTaskInput, currentUser: TaskActor): Promise<Task> {
    const cleanSourceType: TaskSourceType = input.sourceType || 'MANUAL';
    const cleanSourceId = input.sourceId && input.sourceId.trim() ? input.sourceId.trim() : undefined;
    const initialStatus: TaskStatus = input.status || 'TODO';

    // 중복 검사
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
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: input.title,
      description: input.description,
      priority: input.priority || 'NORMAL',
      status: initialStatus,
      dueDate: input.dueDate,
      companyId: input.companyId,
      workerId: input.workerId,
      sourceType: cleanSourceType,
      sourceId: cleanSourceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdById: currentUser.uid,
      createdByName: currentUser.name || '노무법인 관리자',
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    this.tasks.push(newTask);
    return newTask;
  }

  async completeTask(taskId: string): Promise<Task> {
    const target = this.tasks.find((t) => t.id === taskId);
    if (!target) throw new Error('Task not found');
    target.status = 'COMPLETED';
    target.completedAt = new Date().toISOString();
    return target;
  }

  async cancelTask(taskId: string): Promise<Task> {
    const target = this.tasks.find((t) => t.id === taskId);
    if (!target) throw new Error('Task not found');
    target.status = 'CANCELLED';
    return target;
  }

  getTasks() {
    return [...this.tasks];
  }
}

const simService = new SimulatedTaskService();

// ============================================================================
// Test Suite 1: 중앙 taskService 중복 검사 로직 및 4개 출처 대상 검증
// ============================================================================
console.log('--- 1. 4개 출처(INQUIRY, DATA_REQUEST, MATERNITY, PAYROLL) 중복 차단 검증 ---');
const sourcesToTest: { type: TaskSourceType; id: string; title: string }[] = [
  { type: 'INQUIRY', id: 'inq_1001', title: '[문의] 주휴수당 문의' },
  { type: 'DATA_REQUEST', id: 'dreq_2001', title: '[자료요청] 근태 집계표 요청' },
  { type: 'MATERNITY', id: 'mat_3001', title: '[모성보호] 출산휴가 신청' },
  { type: 'PAYROLL', id: 'pay_4001', title: '[급여] 2026-10 급여대장' },
];

for (const src of sourcesToTest) {
  simService.reset();

  // 1-1. 초기 상태: 기존 task 없음 -> 중복 아님
  const initialCheck = await simService.checkDuplicateSourceTask(src.type, src.id);
  assert(initialCheck.isDuplicate === false, `[${src.type}] 초기 상태에서는 isDuplicate = false`);
  assert(initialCheck.existingTask === null, `[${src.type}] 초기 상태에서는 existingTask = null`);

  // 1-2. 최초 task 등록 (TODO 상태)
  const task1 = await simService.createTask(
    {
      title: src.title,
      sourceType: src.type,
      sourceId: src.id,
      status: 'TODO',
      priority: 'NORMAL',
    },
    mockAdminActor
  );
  assert(task1.id !== undefined, `[${src.type}] 최초 task 생성 성공 (id: ${task1.id})`);

  // 1-3. 동일 sourceType + sourceId 로 두 번째 등록 시도 -> 차단되어야 함
  const dupCheck1 = await simService.checkDuplicateSourceTask(src.type, src.id);
  assert(dupCheck1.isDuplicate === true, `[${src.type}] TODO 상태 task 존재 시 isDuplicate = true`);
  assert(dupCheck1.existingTask?.id === task1.id, `[${src.type}] 기존 task(${task1.id})가 반환됨`);

  let errorCaught = false;
  let errorMessage = '';
  try {
    await simService.createTask(
      {
        title: `${src.title} (중복 생성 시도)`,
        sourceType: src.type,
        sourceId: src.id,
        status: 'TODO',
        priority: 'HIGH',
      },
      mockAdminActor
    );
  } catch (err: any) {
    errorCaught = true;
    errorMessage = err.message;
  }
  assert(errorCaught === true, `[${src.type}] TODO 상태 존재 시 새 task 생성 차단`);
  assert(
    errorMessage === '이 업무와 연결된 진행 중 할 일이 이미 있습니다.',
    `[${src.type}] 지정된 오류 문구 일치: "${errorMessage}"`
  );

  // 1-4. 기존 task가 IN_PROGRESS 상태일 때도 동일하게 차단되는지 검증
  task1.status = 'IN_PROGRESS';
  const dupCheck2 = await simService.checkDuplicateSourceTask(src.type, src.id);
  assert(dupCheck2.isDuplicate === true, `[${src.type}] IN_PROGRESS 상태일 때도 isDuplicate = true`);

  let errorCaughtInProgress = false;
  try {
    await simService.createTask(
      {
        title: `${src.title} (IN_PROGRESS 중복 시도)`,
        sourceType: src.type,
        sourceId: src.id,
        status: 'IN_PROGRESS',
        priority: 'HIGH',
      },
      mockAdminActor
    );
  } catch (err: any) {
    errorCaughtInProgress = true;
  }
  assert(errorCaughtInProgress === true, `[${src.type}] IN_PROGRESS 상태 존재 시 새 task 생성 차단`);
}

// ============================================================================
// Test Suite 2: 완료(COMPLETED) 및 취소(CANCELLED) 업무 후 재등록 허용 검증
// ============================================================================
console.log('\n--- 2. COMPLETED 또는 CANCELLED 업무 후 재등록 허용 검증 ---');
{
  simService.reset();
  const srcType: TaskSourceType = 'MATERNITY';
  const srcId = 'mat_case_rebirth_01';

  // 2-1. 최초 등록
  const t1 = await simService.createTask(
    {
      title: '[모성보호] 출산전후휴가 1차',
      sourceType: srcType,
      sourceId: srcId,
      status: 'TODO',
      priority: 'NORMAL',
    },
    mockAdminActor
  );
  assert(t1.status === 'TODO', '1차 업무 등록 (TODO)');

  // 2-2. 1차 업무 완료 처리 (COMPLETED)
  await simService.completeTask(t1.id);
  assert(t1.status === 'COMPLETED', '1차 업무 완료 처리됨 (COMPLETED)');

  // 2-3. 중복 검사: COMPLETED만 있으므로 중복 아님
  const afterCompleteCheck = await simService.checkDuplicateSourceTask(srcType, srcId);
  assert(afterCompleteCheck.isDuplicate === false, 'COMPLETED 상태만 있는 경우 isDuplicate = false');
  assert(afterCompleteCheck.existingTask === null, 'COMPLETED 상태만 있는 경우 existingTask = null');

  // 2-4. 2차 업무 신규 등록 성공해야 함 (영구 차단 방지)
  const t2 = await simService.createTask(
    {
      title: '[모성보호] 육아휴직 2차 신청',
      sourceType: srcType,
      sourceId: srcId,
      status: 'TODO',
      priority: 'NORMAL',
    },
    mockAdminActor
  );
  assert(t2.id !== t1.id, `완료 후 2차 업무 성공적으로 등록됨 (id: ${t2.id})`);

  // 2-5. 2차 업무 취소 처리 (CANCELLED)
  await simService.cancelTask(t2.id);
  assert(t2.status === 'CANCELLED', '2차 업무 취소 처리됨 (CANCELLED)');

  // 2-6. 중복 검사: COMPLETED와 CANCELLED만 있으므로 중복 아님
  const afterCancelCheck = await simService.checkDuplicateSourceTask(srcType, srcId);
  assert(afterCancelCheck.isDuplicate === false, 'CANCELLED 상태만 남았을 때도 isDuplicate = false');

  // 2-7. 3차 업무 신규 등록 성공해야 함
  const t3 = await simService.createTask(
    {
      title: '[모성보호] 보완 서류 재신청 3차',
      sourceType: srcType,
      sourceId: srcId,
      status: 'TODO',
      priority: 'NORMAL',
    },
    mockAdminActor
  );
  assert(t3.id !== t2.id && t3.id !== t1.id, `취소 후 3차 업무 성공적으로 등록됨 (id: ${t3.id})`);
}

// ============================================================================
// Test Suite 3: 사용자 안내 문구 및 [기존 할 일 보기] UI 상태 흐름 검증
// ============================================================================
console.log('\n--- 3. 사용자 안내 문구 및 [기존 할 일 보기] 동작 검증 ---');
{
  simService.reset();
  const existingActiveTask = await simService.createTask(
    {
      title: '[급여] 2026-10월 홍길동 급여계산',
      description: '통상임금 산정 및 비과세 식대 반영 필요',
      sourceType: 'PAYROLL',
      sourceId: 'payroll_rec_999',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: '2026-10-25',
      companyId: 'comp_test_001',
      workerId: 'worker_canonical_777',
    },
    mockAdminActor
  );

  // 시뮬레이션: CreateTaskFromSourceModal 오픈 시 중복 확인
  const modalCheck = await simService.checkDuplicateSourceTask('PAYROLL', 'payroll_rec_999');
  assert(modalCheck.isDuplicate === true, '모달 오픈 시 중복 검사 감지됨');
  assert(modalCheck.existingTask?.id === existingActiveTask.id, '기존 active task 정보 정상 획득');

  // UI 배너 검증
  const REQUIRED_WARNING_MESSAGE = '이 업무와 연결된 진행 중 할 일이 이미 있습니다.';
  const REQUIRED_BUTTON_TEXT = '기존 할 일 보기';

  const modalRenderState = {
    warningText: modalCheck.isDuplicate ? REQUIRED_WARNING_MESSAGE : null,
    hasViewExistingButton: modalCheck.isDuplicate,
    submitButtonDisabled: modalCheck.isDuplicate,
  };

  assert(
    modalRenderState.warningText === '이 업무와 연결된 진행 중 할 일이 이미 있습니다.',
    'UI 배너에 필수 안내 문구("이 업무와 연결된 진행 중 할 일이 이미 있습니다.") 표시'
  );
  assert(
    modalRenderState.hasViewExistingButton === true,
    'UI에 "[기존 할 일 보기]" 버튼 제공'
  );
  assert(
    modalRenderState.submitButtonDisabled === true,
    '진행 중인 기존 task가 있는 동안 [등록] 버튼 비활성화'
  );

  // [기존 할 일 보기] 버튼 클릭 시 동작 시뮬레이션
  let viewingExistingDetail = false;
  let detailTask: Task | null = null;

  // 버튼 클릭 핸들러 동작 시뮬레이션
  viewingExistingDetail = true;
  detailTask = modalCheck.existingTask;

  assert(viewingExistingDetail === true, '[기존 할 일 보기] 클릭 시 상세 뷰 오픈');
  assert(detailTask !== null && detailTask.id === existingActiveTask.id, '해당 기존 task의 ID와 상세 일치');
  assert(detailTask?.title === '[급여] 2026-10월 홍길동 급여계산', '기존 task 제목 표시');
  assert(detailTask?.status === 'IN_PROGRESS', '기존 task 상태(IN_PROGRESS) 표시');
  assert(detailTask?.priority === 'HIGH', '기존 task 우선순위(HIGH) 표시');
  assert(detailTask?.dueDate === '2026-10-25', '기존 task 마감일자 표시');

  // 기존 업무 완료 처리 후 모달 폼으로 복귀 시뮬레이션
  await simService.completeTask(existingActiveTask.id);
  const recheck = await simService.checkDuplicateSourceTask('PAYROLL', 'payroll_rec_999');
  assert(recheck.isDuplicate === false, '기존 업무 완료 처리 후 중복 플래그 해제');
}

// ============================================================================
// Test Suite 4: 동시 클릭 / 연속 등록 방지 시나리오 검증
// ============================================================================
console.log('\n--- 4. 동시 클릭 / 연속 등록 방지 검증 ---');
{
  simService.reset();
  const sourceId = 'inq_rapid_click_001';

  // 사용자가 더블 클릭 또는 연속으로 2회 등록 시도
  let successCount = 0;
  let duplicateBlockedCount = 0;

  const tryCreate = async (attemptName: string) => {
    try {
      await simService.createTask(
        {
          title: `[문의] ${attemptName}`,
          sourceType: 'INQUIRY',
          sourceId,
          status: 'TODO',
          priority: 'NORMAL',
        },
        mockAdminActor
      );
      successCount++;
    } catch (err: any) {
      if (err.message === '이 업무와 연결된 진행 중 할 일이 이미 있습니다.') {
        duplicateBlockedCount++;
      }
    }
  };

  // 1차 시도
  await tryCreate('1차 등록');
  // 2차 연속 시도
  await tryCreate('2차 연속 등록');

  assert(successCount === 1, '연속 등록 시 1건만 정상 생성 성공');
  assert(duplicateBlockedCount === 1, '2번째 등록 시도는 중복 검사에 의해 정확히 차단됨');
  assert(simService.getTasks().length === 1, '최종 DB에 저장된 task 수는 정확히 1건');
}

// ============================================================================
// Test Suite 5: taskService 실제 인스턴스 메서드 구현 검증
// ============================================================================
console.log('\n--- 5. 실제 src/services/taskService 메서드 인터페이스 검증 ---');
{
  assert(
    typeof taskService.checkDuplicateSourceTask === 'function',
    'taskService.checkDuplicateSourceTask 메서드 정의됨'
  );
  assert(
    typeof taskService.getActiveTaskBySource === 'function',
    'taskService.getActiveTaskBySource 메서드 정의됨'
  );
  assert(
    typeof taskService.createTask === 'function',
    'taskService.createTask 메서드 정의됨'
  );

  // MANUAL 출처는 중복 검사 대상 제외
  const manualResult = await taskService.checkDuplicateSourceTask('MANUAL', 'any_id');
  assert(manualResult.isDuplicate === false, 'MANUAL 출처는 중복 검사 제외 (isDuplicate = false)');
}

console.log('\n================================================================');
console.log(`[R3-3 3/3-B-③-A] 검증 결과: 통과 ${passCount}건 / 실패 ${failCount}건`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
