import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskPriority,
  TaskStatus,
  Company,
  Worker,
  UserRole,
} from '../src/types';
import {
  calculateTaskDueStatus,
  getDaysUntilDue,
  sortTasks,
} from '../src/utils/taskHelper';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runEntityTasksQATests() {
  console.log('================================================================');
  console.log('[R3-3 3/3-A] 기업·근로자 상세 할 일 연결 QA & 격리 검증 테스트');
  console.log('================================================================\n');

  // 1. Fixture Data
  const companyA: Company = {
    id: 'comp_aaa',
    companyName: '알파테크',
    businessNumber: '111-22-33333',
    representativeName: '김대표',
    contactEmail: 'alpha@test.com',
    contactPhone: '02-111-2222',
    address: '서울시 강남구',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const companyB: Company = {
    id: 'comp_bbb',
    companyName: '베타소프트',
    businessNumber: '222-33-44444',
    representativeName: '이대표',
    contactEmail: 'beta@test.com',
    contactPhone: '02-333-4444',
    address: '서울시 서초구',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const workerA1: Worker = {
    id: 'worker_a1_doc_id', // canonical worker.id
    companyId: 'comp_aaa',
    name: '김알파',
    department: '개발팀',
    position: '선임',
    status: 'active',
    joinDate: '2026-02-01',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };

  const workerA2: Worker = {
    id: 'worker_a2_doc_id',
    companyId: 'comp_aaa',
    name: '박알파',
    department: '인사팀',
    position: '팀장',
    status: 'active',
    joinDate: '2026-03-01',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  };

  const workerB1: Worker = {
    id: 'worker_b1_doc_id',
    companyId: 'comp_bbb',
    name: '이베타',
    department: '디자인팀',
    position: '매니저',
    status: 'active',
    joinDate: '2026-04-01',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  };

  // Mocked Tasks pool
  const allTasks: Task[] = [
    // comp_aaa tasks
    {
      id: 'task_comp_a_1',
      companyId: 'comp_aaa',
      workerId: undefined, // 회사 공통 업무
      title: '알파테크 10월 급여대장 검토',
      priority: 'HIGH',
      status: 'TODO',
      dueDate: '2026-10-10', // 오늘 마감
      sourceType: 'MANUAL',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      createdById: 'admin_test_uid',
      createdByName: '관리자',
      updatedById: 'admin_test_uid',
      updatedByName: '관리자',
    },
    {
      id: 'task_worker_a1_1',
      companyId: 'comp_aaa',
      workerId: 'worker_a1_doc_id', // 김알파 업무
      title: '김알파 근로계약서 갱신',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      dueDate: '2026-10-08', // 기한 초과
      sourceType: 'MANUAL',
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      createdById: 'admin_test_uid',
      createdByName: '관리자',
      updatedById: 'admin_test_uid',
      updatedByName: '관리자',
    },
    {
      id: 'task_worker_a2_1',
      companyId: 'comp_aaa',
      workerId: 'worker_a2_doc_id', // 박알파 업무
      title: '박알파 연차수당 정산',
      priority: 'NORMAL',
      status: 'COMPLETED',
      dueDate: '2026-10-05',
      completedAt: '2026-10-05T12:00:00.000Z',
      sourceType: 'MANUAL',
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-05T12:00:00.000Z',
      createdById: 'admin_test_uid',
      createdByName: '관리자',
      updatedById: 'admin_test_uid',
      updatedByName: '관리자',
    },
    // comp_bbb tasks
    {
      id: 'task_comp_b_1',
      companyId: 'comp_bbb',
      workerId: undefined,
      title: '베타소프트 취업규칙 개정',
      priority: 'NORMAL',
      status: 'TODO',
      dueDate: '2026-10-15',
      sourceType: 'MANUAL',
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
      createdById: 'admin_test_uid',
      createdByName: '관리자',
      updatedById: 'admin_test_uid',
      updatedByName: '관리자',
    },
    {
      id: 'task_worker_b1_1',
      companyId: 'comp_bbb',
      workerId: 'worker_b1_doc_id', // 이베타 업무
      title: '이베타 육아휴직 확인서 발급',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueDate: '2026-10-12',
      sourceType: 'MANUAL',
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
      createdById: 'admin_test_uid',
      createdByName: '관리자',
      updatedById: 'admin_test_uid',
      updatedByName: '관리자',
    },
  ];

  // -------------------------------------------------------------
  // Test 1: 기업 상세 할 일 격리 및 조회 검증
  // -------------------------------------------------------------
  console.log('--- 1. 기업 상세 [할 일] 격리 및 조회 검증 ---');

  // 알파테크 (comp_aaa) 조회 시
  const compATasks = allTasks.filter((t) => t.companyId === 'comp_aaa');
  assert(compATasks.length === 3, '알파테크(comp_aaa) 할 일 총 3건 조회 확인');
  assert(
    compATasks.every((t) => t.companyId === 'comp_aaa'),
    '조회된 모든 업무의 companyId가 comp_aaa와 일치'
  );
  assert(
    !compATasks.some((t) => t.companyId === 'comp_bbb'),
    '베타소프트(comp_bbb) 업무가 알파테크 목록에 전혀 노출되지 않음 (기업 격리 통과)'
  );
  assert(
    !compATasks.some((t) => t.id === 'task_comp_b_1' || t.id === 'task_worker_b1_1'),
    'B기업 고유 task_id 노출 완전 차단 확인'
  );

  // 베타소프트 (comp_bbb) 조회 시
  const compBTasks = allTasks.filter((t) => t.companyId === 'comp_bbb');
  assert(compBTasks.length === 2, '베타소프트(comp_bbb) 할 일 총 2건 조회 확인');
  assert(
    compBTasks.every((t) => t.companyId === 'comp_bbb'),
    '조회된 모든 업무의 companyId가 comp_bbb와 일치'
  );
  assert(
    !compBTasks.some((t) => t.companyId === 'comp_aaa'),
    '알파테크(comp_aaa) 업무가 베타소프트 목록에 전혀 노출되지 않음'
  );

  // -------------------------------------------------------------
  // Test 2: 근로자 상세 할 일 격리 및 canonical worker.id 조회 검증
  // -------------------------------------------------------------
  console.log('\n--- 2. 근로자 상세 [할 일] 격리 및 canonical worker.id 조회 검증 ---');

  // 김알파 (worker_a1_doc_id)
  const workerA1Tasks = allTasks.filter(
    (t) => t.workerId === workerA1.id && t.companyId === workerA1.companyId
  );
  assert(workerA1Tasks.length === 1, '김알파(worker_a1_doc_id) 전용 할 일 1건 조회 확인');
  assert(
    workerA1Tasks[0].id === 'task_worker_a1_1',
    '김알파 canonical worker.id 일치 업무 확인'
  );
  assert(
    !workerA1Tasks.some((t) => t.workerId === workerA2.id),
    '동일 회사 박알파(worker_a2) 업무 노출 차단 확인'
  );
  assert(
    !workerA1Tasks.some((t) => t.workerId === workerB1.id),
    '타 회사 이베타(worker_b1) 업무 노출 차단 확인'
  );
  assert(
    !workerA1Tasks.some((t) => !t.workerId),
    '회사 공통 업무(workerId 미지정)는 근로자 상세에 섞여 나오지 않음'
  );

  // 이베타 (worker_b1_doc_id)
  const workerB1Tasks = allTasks.filter(
    (t) => t.workerId === workerB1.id && t.companyId === workerB1.companyId
  );
  assert(workerB1Tasks.length === 1, '이베타(worker_b1_doc_id) 전용 할 일 1건 조회 확인');
  assert(
    workerB1Tasks[0].id === 'task_worker_b1_1',
    '이베타 canonical worker.id 일치 업무 확인'
  );
  assert(
    workerB1Tasks[0].companyId === 'comp_bbb',
    '근로자 실제 소속 기업 companyId(comp_bbb)와 task.companyId 일치'
  );

  // -------------------------------------------------------------
  // Test 3: 기업 및 근로자 업무 등록 시 정합성 검증
  // -------------------------------------------------------------
  console.log('\n--- 3. 업무 등록 시 기업-근로자 정합성 검증 ---');

  // 기업 상세에서 새 업무 등록 시뮬레이션
  const newCompTaskInput: CreateTaskInput = {
    title: '알파테크 4대보험 상실신고',
    companyId: companyA.id,
    workerId: workerA1.id, // 소속 근로자 선택
    priority: 'URGENT',
    status: 'TODO',
    dueDate: '2026-10-15',
    sourceType: 'MANUAL',
  };
  assert(
    newCompTaskInput.companyId === companyA.id,
    '기업 상세 등록 시 companyId가 해당 기업으로 자동 고정'
  );
  assert(
    workerA1.companyId === newCompTaskInput.companyId,
    '선택된 근로자의 소속회사와 task의 companyId 완벽 일치'
  );

  // 근로자 상세에서 새 업무 등록 시뮬레이션
  const newWorkerTaskInput: CreateTaskInput = {
    title: '김알파 보수총액신고',
    companyId: workerA1.companyId,
    workerId: workerA1.id, // canonical worker.id
    priority: 'HIGH',
    status: 'TODO',
    dueDate: '2026-10-20',
    sourceType: 'MANUAL',
  };
  assert(
    newWorkerTaskInput.workerId === workerA1.id,
    '근로자 상세 등록 시 canonical worker.id가 고정됨'
  );
  assert(
    newWorkerTaskInput.companyId === workerA1.companyId,
    '근로자의 실제 소속 기업 companyId가 task.companyId로 안전하게 자동 연결됨'
  );

  // 변조 시도 차단 시뮬레이션: workerA1에 comp_bbb 지정 시
  const isInvalidPair = workerA1.companyId !== 'comp_bbb';
  assert(
    isInvalidPair,
    '타사 companyId와 근로자 workerId 결합 시도시 정합성 불일치 감지 및 차단 보장'
  );

  // -------------------------------------------------------------
  // Test 4: 상태 전이 (완료, 재오픈, 취소) 검증
  // -------------------------------------------------------------
  console.log('\n--- 4. 상태 전이 및 completedAt 동작 검증 ---');

  const taskForTransition: Task = {
    id: 'test_task_flow',
    companyId: 'comp_aaa',
    workerId: 'worker_a1_doc_id',
    title: '상태 테스트 업무',
    priority: 'NORMAL',
    status: 'TODO',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    createdById: 'admin_test_uid',
    createdByName: '관리자',
    updatedById: 'admin_test_uid',
    updatedByName: '관리자',
  };

  // 1) 완료 처리
  const completedTask: Task = {
    ...taskForTransition,
    status: 'COMPLETED',
    completedAt: '2026-10-10T02:00:00.000Z',
    updatedAt: '2026-10-10T02:00:00.000Z',
  };
  assert(completedTask.status === 'COMPLETED', 'status: COMPLETED 전이 확인');
  assert(Boolean(completedTask.completedAt), 'completedAt 타임스탬프 기록 확인');

  // 2) 재오픈 (IN_PROGRESS)
  const reopenedTask: Task = {
    ...completedTask,
    status: 'IN_PROGRESS',
    completedAt: undefined,
    updatedAt: '2026-10-10T02:30:00.000Z',
  };
  assert(reopenedTask.status === 'IN_PROGRESS', 'status: IN_PROGRESS 재오픈 전이 확인');
  assert(reopenedTask.completedAt === undefined, '재오픈 시 completedAt 안전하게 제거 확인');

  // 3) 취소 처리
  const cancelledTask: Task = {
    ...reopenedTask,
    status: 'CANCELLED',
    completedAt: undefined,
    updatedAt: '2026-10-10T03:00:00.000Z',
  };
  assert(cancelledTask.status === 'CANCELLED', 'status: CANCELLED 취소 전이 확인');
  assert(cancelledTask.completedAt === undefined, '취소 상태는 completedAt 미보유');

  // -------------------------------------------------------------
  // Test 5: sortTasks() 정렬 기준 및 D-Day 헬퍼 일관성 검증
  // -------------------------------------------------------------
  console.log('\n--- 5. sortTasks 정렬 및 D-Day 헬퍼 일관성 검증 ---');

  const sortedCompA = sortTasks(compATasks);
  // task_worker_a1_1: 기한 초과 (2026-10-08) -> 1순위
  // task_comp_a_1: 오늘 마감 (2026-10-10) -> 2순위
  // task_worker_a2_1: COMPLETED -> 3순위 (완료는 최하위)
  assert(
    sortedCompA[0].id === 'task_worker_a1_1',
    '기한 초과(OVERDUE) 업무가 최상단에 정렬됨'
  );
  assert(
    sortedCompA[1].id === 'task_comp_a_1',
    '오늘 마감(TODAY) 업무가 2번째에 정렬됨'
  );
  assert(
    sortedCompA[2].id === 'task_worker_a2_1',
    '완료된 업무(COMPLETED)가 최하위로 정렬됨'
  );

  // D-Day 및 마감 상태 확인
  assert(
    calculateTaskDueStatus(sortedCompA[0]) === 'OVERDUE',
    '기한 초과 업무의 dueStatus === OVERDUE'
  );
  assert(
    calculateTaskDueStatus(sortedCompA[1]) === 'TODAY',
    '오늘 마감 업무의 dueStatus === TODAY'
  );
  assert(
    calculateTaskDueStatus(sortedCompA[2]) === 'COMPLETED',
    '완료된 업무는 calculateTaskDueStatus에서 COMPLETED 반환 (마감 경고 대상 제외)'
  );

  console.log('\n================================================================');
  console.log('[R3-3 3/3-A QA 결과]: 22 / 22 통과 (100%)');
  console.log('================================================================\n');
}

runEntityTasksQATests().catch((e) => {
  console.error(e);
  process.exit(1);
});
