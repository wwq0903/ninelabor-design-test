import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  TaskPriority,
  TaskSourceType,
  Company,
  Worker,
  UserRole,
  AuditLog,
} from '../src/types';
import {
  calculateTaskDueStatus,
  normalizeDateOnlyString,
  getReferenceDateOnlyString,
  getDaysUntilDue,
  sortTasks,
  filterIncompleteTasks,
  filterOverdueTasks,
  filterTodayDueTasks,
  filterUpcomingTasks,
  filterPriorityTasks,
  getTaskSummaryStats,
} from '../src/utils/taskHelper';

// Simulation store mirroring taskService, auditLogService and firestore.rules
class MockTaskStore {
  companies: Map<string, Company> = new Map();
  workers: Map<string, Worker> = new Map();
  tasks: Map<string, Task> = new Map();
  auditLogs: AuditLog[] = [];

  constructor() {
    this.companies.set('comp_001', {
      id: 'comp_001',
      companyName: '(주)알파인더스트리',
      businessNumber: '111-22-33333',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    this.companies.set('comp_002', {
      id: 'comp_002',
      companyName: '(주)베타소프트',
      businessNumber: '222-33-44444',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    this.workers.set('worker_canon_001', {
      id: 'worker_canon_001',
      companyId: 'comp_001',
      name: '김철수',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    this.workers.set('worker_canon_002', {
      id: 'worker_canon_002',
      companyId: 'comp_002',
      name: '이영희',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }

  logAudit(entry: {
    actorUserId: string;
    actorRole: UserRole;
    actorName: string;
    companyId?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, any>;
  }) {
    const sanitizedDetails = entry.details ? { ...entry.details } : {};
    delete sanitizedDetails.residentNumber;
    delete sanitizedDetails.password;
    delete sanitizedDetails.ssn;
    delete sanitizedDetails.rrn;
    delete sanitizedDetails.rrnEncrypted;
    delete sanitizedDetails.maskedRrn;
    delete sanitizedDetails.contentSnippet;
    delete sanitizedDetails.content;
    delete sanitizedDetails.noteContent;
    delete sanitizedDetails.snippet;
    delete sanitizedDetails.description;
    delete sanitizedDetails.taskDescription;

    this.auditLogs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      actorName: entry.actorName,
      companyId: entry.companyId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      timestamp: new Date().toISOString(),
      details: Object.keys(sanitizedDetails).length > 0 ? sanitizedDetails : undefined,
    });
  }

  validateTaskTargets(companyId?: string, workerId?: string) {
    if (companyId) {
      if (!this.companies.has(companyId)) {
        throw new Error(`존재하지 않는 기업입니다. (companyId: ${companyId})`);
      }
    }
    if (workerId) {
      const worker = this.workers.get(workerId);
      if (!worker) {
        throw new Error(`존재하지 않는 근로자입니다. (workerId: ${workerId})`);
      }
      if (companyId && worker.companyId !== companyId) {
        throw new Error(
          `근로자의 실제 소속 기업(companyId: ${worker.companyId})과 지정된 기업 ID(${companyId})가 일치하지 않습니다.`
        );
      }
    }
  }

  validateTaskInput(
    params: {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      status?: TaskStatus;
      dueDate?: string | null;
      sourceType?: TaskSourceType | null;
      sourceId?: string | null;
    },
    isCreate: boolean
  ) {
    if (isCreate || params.title !== undefined) {
      if (!params.title || !params.title.trim()) {
        throw new Error('업무 제목을 입력해주세요. (공백만 입력할 수 없습니다.)');
      }
      if (params.title.trim().length > 200) {
        throw new Error('업무 제목은 최대 200자까지 입력할 수 있습니다.');
      }
    }

    if (params.description !== undefined && params.description !== null) {
      if (params.description.trim().length > 5000) {
        throw new Error('업무 상세 설명은 최대 5000자까지 입력할 수 있습니다.');
      }
    }

    const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    if (isCreate || params.priority !== undefined) {
      if (!params.priority || !VALID_PRIORITIES.includes(params.priority)) {
        throw new Error(`유효하지 않은 우선순위 값입니다: ${params.priority}`);
      }
    }

    const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (params.status !== undefined) {
      if (!VALID_STATUSES.includes(params.status)) {
        throw new Error(`유효하지 않은 업무 상태 값입니다: ${params.status}`);
      }
    }

    if (params.dueDate !== undefined && params.dueDate !== null && params.dueDate !== '') {
      if (!normalizeDateOnlyString(params.dueDate)) {
        throw new Error(`유효하지 않은 마감일 형식입니다: ${params.dueDate}`);
      }
    }

    if (params.sourceId && (!params.sourceType || params.sourceType === 'MANUAL')) {
      throw new Error('출처 ID(sourceId)가 있는 경우 유효한 출처 유형(sourceType)을 지정해야 합니다.');
    }
    if (params.sourceType && params.sourceType !== 'MANUAL' && (!params.sourceId || !params.sourceId.trim())) {
      throw new Error(`출처 유형이 '${params.sourceType}'인 경우 출처 식별자(sourceId)가 필요합니다.`);
    }
  }

  createTask(
    input: CreateTaskInput,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): Task {
    if (currentUser.role !== 'ADMIN') throw new Error('ADMIN만 업무를 생성할 수 있습니다.');
    this.validateTaskInput(input, true);
    this.validateTaskTargets(input.companyId, input.workerId);

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const cleanDueDate = input.dueDate ? normalizeDateOnlyString(input.dueDate) || undefined : undefined;
    const initialStatus: TaskStatus = input.status || 'TODO';

    const newTask: Task = {
      id: taskId,
      companyId: input.companyId?.trim() || undefined,
      workerId: input.workerId?.trim() || undefined,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      priority: input.priority,
      status: initialStatus,
      dueDate: cleanDueDate,
      completedAt: initialStatus === 'COMPLETED' ? now : undefined,
      sourceType: input.sourceType || 'MANUAL',
      sourceId: input.sourceId?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdById: currentUser.uid,
      createdByName: currentUser.name || '노무법인 관리자',
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    this.tasks.set(taskId, newTask);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: newTask.companyId,
      action: 'TASK_CREATED',
      resourceType: 'tasks',
      resourceId: taskId,
      details: {
        taskId,
        companyId: newTask.companyId,
        workerId: newTask.workerId,
        sourceType: newTask.sourceType,
        sourceId: newTask.sourceId,
        priority: newTask.priority,
        status: newTask.status,
        dueDate: newTask.dueDate,
        operation: 'CREATE',
      },
    });

    return newTask;
  }

  updateTask(
    taskId: string,
    input: UpdateTaskInput,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): Task {
    if (currentUser.role !== 'ADMIN') throw new Error('ADMIN만 업무를 수정할 수 있습니다.');
    const existing = this.tasks.get(taskId);
    if (!existing) throw new Error('수정할 업무를 찾을 수 없습니다.');

    this.validateTaskInput(input, false);

    const nextComp = input.companyId !== undefined ? (input.companyId?.trim() || undefined) : existing.companyId;
    const nextWorker = input.workerId !== undefined ? (input.workerId?.trim() || undefined) : existing.workerId;
    this.validateTaskTargets(nextComp, nextWorker);

    const now = new Date().toISOString();
    const updated: Task = {
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      description: input.description !== undefined ? (input.description?.trim() || undefined) : existing.description,
      priority: input.priority !== undefined ? input.priority : existing.priority,
      status: input.status !== undefined ? input.status : existing.status,
      dueDate: input.dueDate !== undefined ? (normalizeDateOnlyString(input.dueDate) || undefined) : existing.dueDate,
      companyId: nextComp,
      workerId: nextWorker,
      sourceType: input.sourceType !== undefined ? (input.sourceType || 'MANUAL') : existing.sourceType,
      sourceId: input.sourceId !== undefined ? (input.sourceId?.trim() || undefined) : existing.sourceId,
      completedAt:
        input.status === 'COMPLETED'
          ? existing.completedAt || now
          : input.status !== undefined
          ? undefined
          : existing.completedAt,
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    this.tasks.set(taskId, updated);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: updated.companyId,
      action: 'TASK_UPDATED',
      resourceType: 'tasks',
      resourceId: taskId,
      details: {
        taskId,
        companyId: updated.companyId,
        workerId: updated.workerId,
        sourceType: updated.sourceType,
        sourceId: updated.sourceId,
        priority: updated.priority,
        status: updated.status,
        dueDate: updated.dueDate,
        operation: 'UPDATE',
      },
    });

    return updated;
  }

  completeTask(taskId: string, currentUser: { uid: string; name?: string; role?: UserRole }): Task {
    const existing = this.tasks.get(taskId);
    if (!existing) throw new Error('업무를 찾을 수 없습니다.');
    const now = new Date().toISOString();
    const updated: Task = {
      ...existing,
      status: 'COMPLETED',
      completedAt: now,
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };
    this.tasks.set(taskId, updated);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: updated.companyId,
      action: 'TASK_COMPLETED',
      resourceType: 'tasks',
      resourceId: taskId,
      details: {
        taskId,
        companyId: updated.companyId,
        status: 'COMPLETED',
        operation: 'COMPLETE',
      },
    });

    return updated;
  }

  reopenTask(
    taskId: string,
    targetStatus: 'TODO' | 'IN_PROGRESS' = 'IN_PROGRESS',
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): Task {
    const existing = this.tasks.get(taskId);
    if (!existing) throw new Error('업무를 찾을 수 없습니다.');
    const now = new Date().toISOString();
    const updated: Task = {
      ...existing,
      status: targetStatus,
      completedAt: undefined,
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };
    this.tasks.set(taskId, updated);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: updated.companyId,
      action: 'TASK_REOPENED',
      resourceType: 'tasks',
      resourceId: taskId,
      details: {
        taskId,
        companyId: updated.companyId,
        status: targetStatus,
        operation: 'REOPEN',
      },
    });

    return updated;
  }

  cancelTask(taskId: string, currentUser: { uid: string; name?: string; role?: UserRole }): Task {
    const existing = this.tasks.get(taskId);
    if (!existing) throw new Error('업무를 찾을 수 없습니다.');
    const now = new Date().toISOString();
    const updated: Task = {
      ...existing,
      status: 'CANCELLED',
      completedAt: undefined,
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };
    this.tasks.set(taskId, updated);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: updated.companyId,
      action: 'TASK_CANCELLED',
      resourceType: 'tasks',
      resourceId: taskId,
      details: {
        taskId,
        companyId: updated.companyId,
        status: 'CANCELLED',
        operation: 'CANCEL',
      },
    });

    return updated;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' [R3-3 1/3] ADMIN 통합 할 일·마감일 관리 기반 구축 QA 테스트');
  console.log('================================================================\n');

  const store = new MockTaskStore();
  const adminActor = { uid: 'admin_01', name: '김대표노무사', role: 'ADMIN' as UserRole };
  const companyActor = { uid: 'comp_ceo_01', name: '알파대표', role: 'COMPANY' as UserRole };
  const workerActor = { uid: 'worker_01', name: '김철수', role: 'WORKER' as UserRole };

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  const fixedRefDate = '2026-10-10';

  // -------------------------------------------------------------
  // [1] 마감 상태 계산 Helper 검증 (calculateTaskDueStatus)
  // -------------------------------------------------------------
  console.log('--- 1. 마감 상태 계산 Helper 테스트 (DB 미저장, 동적 계산) ---');

  // OVERDUE: dueDate < 오늘 (2026-10-09 < 2026-10-10)
  const overdueStatus = calculateTaskDueStatus({ status: 'TODO', dueDate: '2026-10-09' }, fixedRefDate);
  assert(overdueStatus === 'OVERDUE', '2026-10-09 마감일은 2026-10-10 기준 OVERDUE 판정');

  // TODAY: dueDate = 오늘 (2026-10-10)
  const todayStatus = calculateTaskDueStatus({ status: 'IN_PROGRESS', dueDate: '2026-10-10' }, fixedRefDate);
  assert(todayStatus === 'TODAY', '2026-10-10 마감일은 2026-10-10 기준 TODAY 판정');

  // UPCOMING: dueDate > 오늘 (2026-10-13, 3일 후)
  const upcomingStatus = calculateTaskDueStatus({ status: 'TODO', dueDate: '2026-10-13' }, fixedRefDate);
  assert(upcomingStatus === 'UPCOMING', '2026-10-13 마감일은 2026-10-10 기준 UPCOMING 판정 (3일 후)');

  // NORMAL: 10일 후 미래 (2026-10-25)
  const futureNormalStatus = calculateTaskDueStatus({ status: 'TODO', dueDate: '2026-10-25' }, fixedRefDate);
  assert(futureNormalStatus === 'NORMAL', '2026-10-25 마감일은 여유 있는 미래로 NORMAL 판정');

  // NORMAL: dueDate 미지정
  const noDueStatus = calculateTaskDueStatus({ status: 'TODO' }, fixedRefDate);
  assert(noDueStatus === 'NORMAL', '마감일 미지정 업무는 NORMAL 판정');

  // COMPLETED: 과거 날짜라도 COMPLETED는 마감 경고 제외
  const completedDueStatus = calculateTaskDueStatus(
    { status: 'COMPLETED', dueDate: '2026-09-01' },
    fixedRefDate
  );
  assert(completedDueStatus === 'COMPLETED', '완료된 업무(COMPLETED)는 마감 경고 대상에서 제외');

  // CANCELLED: 과거 날짜라도 CANCELLED는 마감 경고 제외
  const cancelledDueStatus = calculateTaskDueStatus(
    { status: 'CANCELLED', dueDate: '2026-09-01' },
    fixedRefDate
  );
  assert(cancelledDueStatus === 'CANCELLED', '취소된 업무(CANCELLED)는 마감 경고 대상에서 제외');

  // -------------------------------------------------------------
  // [2] 우선순위 정렬 기준 Helper 검증 (sortTasks)
  // -------------------------------------------------------------
  console.log('\n--- 2. 우선순위 정렬 Helper 테스트 ---');
  // 1. 기한 초과 (OVERDUE)
  // 2. 오늘 마감 (TODAY)
  // 3. URGENT
  // 4. HIGH
  // 5. 가까운 마감일 (UPCOMING)
  // 6. NORMAL
  // 7. LOW
  // COMPLETED / CANCELLED는 진행 중 업무보다 아래로

  const tOverdue: Task = {
    id: 't_overdue',
    title: '기한 초과 업무',
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: '2026-10-08',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const tToday: Task = {
    id: 't_today',
    title: '오늘 마감 업무',
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: '2026-10-10',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const tUrgent: Task = {
    id: 't_urgent',
    title: '긴급 업무',
    priority: 'URGENT',
    status: 'TODO',
    dueDate: '2026-10-25',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const tHigh: Task = {
    id: 't_high',
    title: '높음 업무',
    priority: 'HIGH',
    status: 'TODO',
    dueDate: '2026-10-25',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const tUpcoming: Task = {
    id: 't_upcoming',
    title: '임박한 업무',
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: '2026-10-13',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const tNormal: Task = {
    id: 't_normal',
    title: '보통 업무',
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: '2026-10-25',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const tLow: Task = {
    id: 't_low',
    title: '낮음 업무',
    priority: 'LOW',
    status: 'TODO',
    dueDate: '2026-10-25',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const tCompleted: Task = {
    id: 't_completed',
    title: '완료된 업무',
    priority: 'URGENT',
    status: 'COMPLETED',
    completedAt: '2026-10-10T10:00:00.000Z',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-10',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const tCancelled: Task = {
    id: 't_cancelled',
    title: '취소된 업무',
    priority: 'HIGH',
    status: 'CANCELLED',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-10',
    createdById: 'a',
    createdByName: 'a',
    updatedById: 'a',
    updatedByName: 'a',
  };

  const rawList = [tLow, tCompleted, tNormal, tUpcoming, tHigh, tUrgent, tToday, tCancelled, tOverdue];
  const sorted = sortTasks(rawList, fixedRefDate);

  const sortedIds = sorted.map((t) => t.id);
  assert(sortedIds[0] === 't_overdue', '1순위: 기한 초과(OVERDUE) 업무가 최상단에 배치');
  assert(sortedIds[1] === 't_today', '2순위: 오늘 마감(TODAY) 업무가 2번째에 배치');
  assert(sortedIds[2] === 't_urgent', '3순위: URGENT 업무 배치');
  assert(sortedIds[3] === 't_high', '4순위: HIGH 업무 배치');
  assert(sortedIds[4] === 't_upcoming', '5순위: 가까운 마감일(UPCOMING) 업무 배치');
  assert(sortedIds[5] === 't_normal', '6순위: NORMAL 업무 배치');
  assert(sortedIds[6] === 't_low', '7순위: LOW 업무 배치');
  assert(
    sortedIds[7] === 't_completed' && sortedIds[8] === 't_cancelled',
    '종료 업무(COMPLETED, CANCELLED)는 진행 중 업무보다 무조건 아래로 배치'
  );

  // -------------------------------------------------------------
  // [3] 기업 및 근로자 정합성 검증 (validateTaskTargets)
  // -------------------------------------------------------------
  console.log('\n--- 3. 기업/근로자 정합성 및 내부 일반 업무 허용 테스트 ---');

  // 정상 기업 업무
  const compTask = store.createTask(
    {
      companyId: 'comp_001',
      title: 'A기업 급여자료 요청',
      priority: 'HIGH',
      dueDate: '2026-10-15',
    },
    adminActor
  );
  assert(compTask.companyId === 'comp_001', '기업 지정 업무 정상 생성');

  // 정상 근로자 업무 (canonical worker.id)
  const workerTask = store.createTask(
    {
      companyId: 'comp_001',
      workerId: 'worker_canon_001',
      title: '김철수 모성보호 보완서류 확인',
      priority: 'URGENT',
    },
    adminActor
  );
  assert(
    workerTask.workerId === 'worker_canon_001' && workerTask.companyId === 'comp_001',
    '근로자 지정 업무 정상 생성'
  );

  // 노무법인 내부 일반 업무 (companyId, workerId 모두 없음)
  const internalGeneralTask = store.createTask(
    {
      title: '노무법인 주간 운영회의 자료 준비',
      priority: 'NORMAL',
    },
    adminActor
  );
  assert(
    internalGeneralTask.companyId === undefined && internalGeneralTask.workerId === undefined,
    '회사/근로자 없는 노무법인 내부 일반 업무 생성 허용'
  );

  // 존재하지 않는 companyId 차단
  try {
    store.createTask({ companyId: 'comp_ghost', title: '유령 회사 업무', priority: 'NORMAL' }, adminActor);
    assert(false, '존재하지 않는 companyId 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('존재하지 않는 기업'), '존재하지 않는 companyId 차단 성공');
  }

  // 존재하지 않는 workerId 차단
  try {
    store.createTask({ workerId: 'worker_ghost', title: '유령 근로자 업무', priority: 'NORMAL' }, adminActor);
    assert(false, '존재하지 않는 workerId 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('존재하지 않는 근로자'), '존재하지 않는 workerId 차단 성공');
  }

  // 타사 근로자 + 타사 기업 불일치 조합 차단 (comp_002 + worker_canon_001(comp_001 소속))
  try {
    store.createTask(
      {
        companyId: 'comp_002',
        workerId: 'worker_canon_001',
        title: '소속 불일치 조합 업무',
        priority: 'NORMAL',
      },
      adminActor
    );
    assert(false, '소속 불일치 조합 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('일치하지 않습니다'), '근로자-소속기업 불일치 조합 차단 성공');
  }

  // -------------------------------------------------------------
  // [4] 완료 처리 및 상태 전이 검증 (completedAt 원자성)
  // -------------------------------------------------------------
  console.log('\n--- 4. 완료 처리 / 재오픈 / 취소 상태 전이 및 completedAt 검증 ---');

  // 완료 처리 (COMPLETED)
  const completedTask = store.completeTask(compTask.id, adminActor);
  assert(completedTask.status === 'COMPLETED', 'status: COMPLETED 전환 확인');
  assert(Boolean(completedTask.completedAt), 'completedAt 타임스탬프 기록 확인');

  // 재오픈 처리 (COMPLETED -> IN_PROGRESS)
  const reopenedTask = store.reopenTask(compTask.id, 'IN_PROGRESS', adminActor);
  assert(reopenedTask.status === 'IN_PROGRESS', 'status: IN_PROGRESS 재오픈 확인');
  assert(reopenedTask.completedAt === undefined, 'completedAt 안전하게 제거 확인');

  // 취소 처리 (CANCELLED)
  const cancelledTask = store.cancelTask(compTask.id, adminActor);
  assert(cancelledTask.status === 'CANCELLED', 'status: CANCELLED 취소 확인');
  assert(cancelledTask.completedAt === undefined, 'CANCELLED는 completedAt 미보유 확인');

  // -------------------------------------------------------------
  // [5] 입력값 유효성 검증 (validateTaskInput)
  // -------------------------------------------------------------
  console.log('\n--- 5. 입력값 유효성 검증 테스트 ---');

  // 빈 제목 차단
  try {
    store.createTask({ title: '', priority: 'NORMAL' }, adminActor);
    assert(false, '빈 제목 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('공백만 입력할 수 없습니다'), '빈 제목 차단 성공');
  }

  // 공백 제목 차단
  try {
    store.createTask({ title: '   \n \t ', priority: 'NORMAL' }, adminActor);
    assert(false, '공백 제목 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('공백만 입력할 수 없습니다'), '공백 제목 차단 성공');
  }

  // 200자 초과 제목 차단
  try {
    store.createTask({ title: 'a'.repeat(201), priority: 'NORMAL' }, adminActor);
    assert(false, '200자 초과 제목 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('최대 200자'), '200자 초과 제목 차단 성공');
  }

  // 5000자 초과 설명 차단
  try {
    store.createTask({ title: '설명초과', description: 'b'.repeat(5001), priority: 'NORMAL' }, adminActor);
    assert(false, '5000자 초과 설명 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('최대 5000자'), '5000자 초과 설명 차단 성공');
  }

  // 잘못된 priority 값 차단
  try {
    store.createTask({ title: '우선순위오류', priority: 'SUPER_URGENT' as any }, adminActor);
    assert(false, '잘못된 priority 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('유효하지 않은 우선순위'), '잘못된 priority 차단 성공');
  }

  // 잘못된 status 값 차단
  try {
    store.createTask({ title: '상태오류', priority: 'NORMAL', status: 'DELETED' as any }, adminActor);
    assert(false, '잘못된 status 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('유효하지 않은 업무 상태'), '잘못된 status 차단 성공');
  }

  // 잘못된 마감일 형식 차단
  try {
    store.createTask({ title: '마감일오류', priority: 'NORMAL', dueDate: 'not-a-date' }, adminActor);
    assert(false, '잘못된 마감일 형식 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('유효하지 않은 마감일 형식'), '잘못된 마감일 형식 차단 성공');
  }

  // sourceId만 있고 sourceType이 없거나 MANUAL인 경우 불완전 연결 차단
  try {
    store.createTask(
      { title: '불완전연결', priority: 'NORMAL', sourceId: 'inquiry_123', sourceType: 'MANUAL' },
      adminActor
    );
    assert(false, 'sourceId 존재 시 MANUAL/미지정 sourceType 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('유효한 출처 유형'), '불완전 출처 연결 차단 성공');
  }

  // sourceType이 MATERNITY인데 sourceId 누락된 경우 차단
  try {
    store.createTask(
      { title: '출처누락', priority: 'NORMAL', sourceType: 'MATERNITY' },
      adminActor
    );
    assert(false, 'sourceId 누락 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('출처 식별자(sourceId)가 필요합니다'), '출처 식별자 누락 차단 성공');
  }

  // -------------------------------------------------------------
  // [6] 권한 차단 검증 (ADMIN 전용)
  // -------------------------------------------------------------
  console.log('\n--- 6. 역할 권한 차단 검증 (ADMIN 전용 데이터) ---');
  try {
    store.createTask({ title: '기업대표가생성시도', priority: 'NORMAL' }, companyActor);
    assert(false, 'COMPANY 권한 생성 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('ADMIN만'), 'COMPANY 권한 생성 차단 성공');
  }

  try {
    store.createTask({ title: '근로자가생성시도', priority: 'NORMAL' }, workerActor);
    assert(false, 'WORKER 권한 생성 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('ADMIN만'), 'WORKER 권한 생성 차단 성공');
  }

  // -------------------------------------------------------------
  // [7] Audit Log 보안: description 일절 미저장 검증
  // -------------------------------------------------------------
  console.log('\n--- 7. Audit Log 보안 및 description 미저장 검증 ---');
  const secretDesc = '노무법인 특급 비밀 지시사항: 타사 노무사 배석 전 대표 인터뷰 요망';
  const taskWithSecretDesc = store.createTask(
    {
      title: '비밀 지시 업무',
      description: secretDesc,
      priority: 'HIGH',
      companyId: 'comp_001',
    },
    adminActor
  );

  store.updateTask(
    taskWithSecretDesc.id,
    { title: '비밀 지시 업무 수정', description: '수정된 비밀 지시 내용' },
    adminActor
  );

  const logs = store.auditLogs;
  assert(logs.length >= 6, `감사 로그 기록 건수 확인 (${logs.length}건)`);

  for (const log of logs) {
    const rawString = JSON.stringify(log);
    assert(!rawString.includes(secretDesc), 'Audit Log에 상세 설명(description) 원문 미포함 확인');
    assert(!rawString.includes('수정된 비밀 지시 내용'), 'Audit Log에 수정된 설명 원문 미포함 확인');

    if (log.details) {
      assert(!('description' in log.details), `Audit Log (${log.action}) details에 description 없음`);
      assert(!('taskDescription' in log.details), `Audit Log (${log.action}) details에 taskDescription 없음`);
      assert(!('content' in log.details), `Audit Log (${log.action}) details에 content 없음`);
    }
  }

  // -------------------------------------------------------------
  // [8] 향후 NIA용 요약 통계 Helper 검증
  // -------------------------------------------------------------
  console.log('\n--- 8. 향후 NIA용 요약 통계 및 필터 Helper 검증 ---');
  const summary = getTaskSummaryStats(rawList, fixedRefDate);
  assert(summary.total === 9, '전체 업무 수 9건');
  assert(summary.incomplete === 7, '미완료 업무 수 7건');
  assert(summary.overdue === 1, '기한 초과 업무 수 1건');
  assert(summary.dueToday === 1, '오늘 마감 업무 수 1건');
  assert(summary.upcoming === 1, '임박 마감 업무 수 1건');
  assert(summary.completed === 1, '완료 업무 수 1건');
  assert(summary.cancelled === 1, '취소 업무 수 1건');

  const overdueList = filterOverdueTasks(rawList, fixedRefDate);
  assert(overdueList.length === 1 && overdueList[0].id === 't_overdue', '기한 초과 필터 정상');

  const todayList = filterTodayDueTasks(rawList, fixedRefDate);
  assert(todayList.length === 1 && todayList[0].id === 't_today', '오늘 마감 필터 정상');

  const priorityList = filterPriorityTasks(rawList, fixedRefDate);
  assert(priorityList.some((t) => t.id === 't_overdue'), '우선 처리 목록에 기한 초과 포함');
  assert(priorityList.some((t) => t.id === 't_today'), '우선 처리 목록에 오늘 마감 포함');
  assert(priorityList.some((t) => t.id === 't_urgent'), '우선 처리 목록에 URGENT 포함');
  assert(priorityList.some((t) => t.id === 't_high'), '우선 처리 목록에 HIGH 포함');

  console.log(`\n================================================================`);
  console.log(` [R3-3 1/3 QA 테스트 완료]: ${passed}/${total} 항목 전부 PASS (100%)`);
  console.log(`================================================================`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
