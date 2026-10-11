import { Task, TaskDueStatus, TaskPriority, TaskStatus } from '../types';

/**
 * [R3-3 1/3] 날짜 문자열을 YYYY-MM-DD 형식으로 안전하게 정규화
 * - "2026-10-10", "2026-10-10T12:00:00.000Z" 등 다양한 입력 지원
 */
export function normalizeDateOnlyString(dateInput?: string | Date | null): string | null {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return null;
    // YYYY-MM-DD 형식인 경우 바로 반환
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * [R3-3 1/3] 기준일 (기본: 오늘) YYYY-MM-DD 문자열 반환
 */
export function getReferenceDateOnlyString(refDate?: Date | string): string {
  if (refDate) {
    const norm = normalizeDateOnlyString(refDate);
    if (norm) return norm;
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * [R3-3 1/3] 마감 상태 계산 중앙 Helper (DB 저장 금지, 파생 계산)
 * - COMPLETED / CANCELLED: 마감 경고 대상 제외
 * - dueDate 미지정: NORMAL
 * - 완료되지 않았고 dueDate < 오늘: OVERDUE
 * - 완료되지 않았고 dueDate = 오늘: TODAY
 * - 완료되지 않았고 1~7일 이내 마감: UPCOMING
 * - 그 외 미래 마감일: NORMAL
 */
export function calculateTaskDueStatus(
  task: Pick<Task, 'status' | 'dueDate'>,
  referenceDate?: Date | string,
  upcomingDaysThreshold: number = 7
): TaskDueStatus {
  if (task.status === 'COMPLETED') return 'COMPLETED';
  if (task.status === 'CANCELLED') return 'CANCELLED';

  const dueDateStr = normalizeDateOnlyString(task.dueDate);
  if (!dueDateStr) return 'NORMAL';

  const todayStr = getReferenceDateOnlyString(referenceDate);

  if (dueDateStr < todayStr) {
    return 'OVERDUE';
  }

  if (dueDateStr === todayStr) {
    return 'TODAY';
  }

  // 미래 날짜: 오늘과의 일수 차이 계산
  const todayDate = new Date(`${todayStr}T00:00:00`);
  const dueDate = new Date(`${dueDateStr}T00:00:00`);
  const diffTime = dueDate.getTime() - todayDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= upcomingDaysThreshold) {
    return 'UPCOMING';
  }

  return 'NORMAL';
}

/**
 * 마감일까지 남은 일수 계산 (기한 초과인 경우 음수, 마감일 미지정 시 null)
 */
export function getDaysUntilDue(dueDate?: string, referenceDate?: Date | string): number | null {
  const dueDateStr = normalizeDateOnlyString(dueDate);
  if (!dueDateStr) return null;

  const todayStr = getReferenceDateOnlyString(referenceDate);
  const todayDate = new Date(`${todayStr}T00:00:00`);
  const dDate = new Date(`${dueDateStr}T00:00:00`);
  const diffTime = dDate.getTime() - todayDate.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 우선순위(Priority) 수치화 점수 헬퍼 (URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1)
 */
export function getPriorityScore(priority: TaskPriority): number {
  switch (priority) {
    case 'URGENT':
      return 4;
    case 'HIGH':
      return 3;
    case 'NORMAL':
      return 2;
    case 'LOW':
      return 1;
    default:
      return 2;
  }
}

/**
 * [R3-3 1/3] 통합 업무 목록 정렬 Helper
 *
 * 기본 우선순위 (진행 중 업무):
 * 1. 기한 초과 (OVERDUE)
 * 2. 오늘 마감 (TODAY)
 * 3. URGENT (긴급)
 * 4. HIGH (높음)
 * 5. 가까운 마감일 (UPCOMING)
 * 6. NORMAL (보통)
 * 7. LOW (낮음)
 *
 * 보조 정렬:
 * - OVERDUE 내부: 마감일 오름차순 (가장 오래 지체된 업무 우선), 우선순위 내림차순
 * - TODAY 내부: 우선순위 내림차순 (URGENT > HIGH > NORMAL > LOW)
 * - URGENT/HIGH 내부: 마감일 오름차순, 최신 생성순
 * - UPCOMING 내부: 마감일 오름차순 (임박한 날짜 우선), 우선순위 내림차순
 * - NORMAL/LOW 내부: 마감일 오름차순 (마감일 있는 것 우선), 최신 생성순
 *
 * COMPLETED / CANCELLED:
 * - 진행 중 업무보다 무조건 아래로 배치
 * - 완료일(completedAt) 또는 수정일(updatedAt) 최신순
 */
export function sortTasks(tasks: Task[], referenceDate?: Date | string): Task[] {
  const refDateStr = getReferenceDateOnlyString(referenceDate);

  // 진행 중 업무 판별 티어 계산
  function getActiveTier(task: Task, dueStatus: TaskDueStatus): number {
    if (dueStatus === 'OVERDUE') return 1;
    if (dueStatus === 'TODAY') return 2;
    if (task.priority === 'URGENT') return 3;
    if (task.priority === 'HIGH') return 4;
    if (dueStatus === 'UPCOMING') return 5;
    if (task.priority === 'NORMAL') return 6;
    return 7; // LOW
  }

  return [...tasks].sort((a, b) => {
    const isAClosed = a.status === 'COMPLETED' || a.status === 'CANCELLED';
    const isBClosed = b.status === 'COMPLETED' || b.status === 'CANCELLED';

    // 1. 종료 업무는 무조건 진행 중 업무 아래로 배치
    if (!isAClosed && isBClosed) return -1;
    if (isAClosed && !isBClosed) return 1;

    // 2. 둘 다 종료 업무인 경우
    if (isAClosed && isBClosed) {
      if (a.status === 'COMPLETED' && b.status === 'CANCELLED') return -1;
      if (a.status === 'CANCELLED' && b.status === 'COMPLETED') return 1;
      const timeA = new Date(a.completedAt || a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.completedAt || b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    }

    // 3. 둘 다 진행 중 업무인 경우: 우선순위 티어 비교
    const dueStatusA = calculateTaskDueStatus(a, refDateStr);
    const dueStatusB = calculateTaskDueStatus(b, refDateStr);
    const tierA = getActiveTier(a, dueStatusA);
    const tierB = getActiveTier(b, dueStatusB);

    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // 같은 티어 내 보조 정렬
    const dueA = normalizeDateOnlyString(a.dueDate);
    const dueB = normalizeDateOnlyString(b.dueDate);

    // 마감일이 있는 경우 마감일 오름차순 (빠른 마감일 우선)
    if (dueA && dueB && dueA !== dueB) {
      return dueA.localeCompare(dueB);
    }
    if (dueA && !dueB) return -1;
    if (!dueA && dueB) return 1;

    // 우선순위 비교 (높은 우선순위 우선)
    const prioScoreA = getPriorityScore(a.priority);
    const prioScoreB = getPriorityScore(b.priority);
    if (prioScoreA !== prioScoreB) {
      return prioScoreB - prioScoreA;
    }

    // 최종: 최신 수정일/생성일 내림차순
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

/**
 * [R3-3 1/3 & 향후 NIA용] 미완료 업무 필터링 (TODO, IN_PROGRESS)
 */
export function filterIncompleteTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
}

/**
 * [R3-3 1/3 & 향후 NIA용] 기한 초과 업무 필터링 (OVERDUE)
 */
export function filterOverdueTasks(tasks: Task[], referenceDate?: Date | string): Task[] {
  return tasks.filter((t) => calculateTaskDueStatus(t, referenceDate) === 'OVERDUE');
}

/**
 * [R3-3 1/3 & 향후 NIA용] 오늘 마감 업무 필터링 (TODAY)
 */
export function filterTodayDueTasks(tasks: Task[], referenceDate?: Date | string): Task[] {
  return tasks.filter((t) => calculateTaskDueStatus(t, referenceDate) === 'TODAY');
}

/**
 * [R3-3 1/3 & 향후 NIA용] 임박한 마감 업무 필터링 (UPCOMING)
 */
export function filterUpcomingTasks(tasks: Task[], referenceDate?: Date | string): Task[] {
  return tasks.filter((t) => calculateTaskDueStatus(t, referenceDate) === 'UPCOMING');
}

/**
 * [R3-3 1/3 & 향후 NIA용] 우선 처리 대상 업무 필터링 (기한초과, 오늘마감, URGENT, HIGH)
 */
export function filterPriorityTasks(tasks: Task[], referenceDate?: Date | string): Task[] {
  const incomplete = filterIncompleteTasks(tasks);
  return incomplete.filter((t) => {
    const dueStatus = calculateTaskDueStatus(t, referenceDate);
    return (
      dueStatus === 'OVERDUE' ||
      dueStatus === 'TODAY' ||
      t.priority === 'URGENT' ||
      t.priority === 'HIGH'
    );
  });
}

/**
 * [R3-3 1/3 & 향후 NIA용] 완료된 업무 필터링 (COMPLETED)
 */
export function filterCompletedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === 'COMPLETED');
}

/**
 * [R3-3 1/3 & 향후 NIA용] 업무 종합 요약 통계 계산
 */
export function getTaskSummaryStats(tasks: Task[], referenceDate?: Date | string) {
  let incomplete = 0;
  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;
  let highPriority = 0;
  let completed = 0;
  let cancelled = 0;

  for (const t of tasks) {
    if (t.status === 'COMPLETED') {
      completed++;
      continue;
    }
    if (t.status === 'CANCELLED') {
      cancelled++;
      continue;
    }

    incomplete++;
    const dueStatus = calculateTaskDueStatus(t, referenceDate);
    if (dueStatus === 'OVERDUE') overdue++;
    if (dueStatus === 'TODAY') dueToday++;
    if (dueStatus === 'UPCOMING') upcoming++;
    if (t.priority === 'URGENT' || t.priority === 'HIGH') highPriority++;
  }

  return {
    total: tasks.length,
    incomplete,
    overdue,
    dueToday,
    upcoming,
    highPriority,
    completed,
    cancelled,
  };
}
