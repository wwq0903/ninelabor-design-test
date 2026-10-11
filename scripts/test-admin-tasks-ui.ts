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
} from '../src/types';
import {
  calculateTaskDueStatus,
  getDaysUntilDue,
  sortTasks,
  getTaskSummaryStats,
} from '../src/utils/taskHelper';
import { ADMIN_SECTIONS } from '../src/components/dashboard/admin/AdminSidebar';

console.log('================================================================');
console.log('[R3-3 2/3] ADMIN 통합 할 일·마감일 관리 UI 및 연동 테스트');
console.log('================================================================\n');

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

// 1. Sidebar Menu Verification
console.log('--- 1. 사이드바 메뉴 구성 및 순서 검증 ---');
const integratedSection = ADMIN_SECTIONS.find((s) => s.title === '통합 노무실');
assert(!!integratedSection, '통합 노무실 메뉴 섹션 존재');
if (integratedSection) {
  const itemKeys = integratedSection.items.map((i) => i.key);
  assert(itemKeys[0] === 'dashboard', '1번째: 대시보드 (dashboard)');
  assert(itemKeys[1] === 'inquiries', '2번째: 통합 문의 (inquiries)');
  assert(itemKeys[2] === 'tasks', '3번째: 할 일·마감일 (tasks)');
  assert(itemKeys[3] === 'ai-consulting', '4번째: AI 상담관리 (ai-consulting)');

  const taskItem = integratedSection.items.find((i) => i.key === 'tasks');
  assert(taskItem?.label === '할 일·마감일', "메뉴 라벨: '할 일·마감일'");
  assert(!!taskItem?.icon, '메뉴 아이콘 지정 완료');
}

// 2. Dummy Data for UI filtering & stats verification
console.log('\n--- 2. 상단 요약 통계 계산 검증 (getTaskSummaryStats) ---');
const sampleTasks: Task[] = [
  {
    id: 't1',
    title: 'A사 10월 급여 대장 검토',
    companyId: 'comp_001',
    priority: 'HIGH',
    status: 'TODO',
    dueDate: '2026-10-10', // TODAY
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    createdById: 'admin1',
    createdByName: '관리자',
    updatedById: 'admin1',
    updatedByName: '관리자',
  },
  {
    id: 't2',
    title: 'B사 모성보호 지원금 신청 서류 확인',
    companyId: 'comp_002',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    dueDate: '2026-10-08', // OVERDUE
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    createdById: 'admin1',
    createdByName: '관리자',
    updatedById: 'admin1',
    updatedByName: '관리자',
  },
  {
    id: 't3',
    title: 'C사 취업규칙 개정 자문',
    priority: 'NORMAL',
    status: 'IN_PROGRESS',
    dueDate: '2026-10-14', // UPCOMING (4 days later)
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    createdById: 'admin1',
    createdByName: '관리자',
    updatedById: 'admin1',
    updatedByName: '관리자',
  },
  {
    id: 't4',
    title: '내부 노무자료 정기 업데이트',
    priority: 'LOW',
    status: 'COMPLETED',
    dueDate: '2026-10-05',
    completedAt: '2026-10-05T12:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-05T12:00:00Z',
    createdById: 'admin1',
    createdByName: '관리자',
    updatedById: 'admin1',
    updatedByName: '관리자',
  },
  {
    id: 't5',
    title: '취소된 예비 업무',
    priority: 'NORMAL',
    status: 'CANCELLED',
    dueDate: '2026-10-09',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
    createdById: 'admin1',
    createdByName: '관리자',
    updatedById: 'admin1',
    updatedByName: '관리자',
  },
];

const refDate = '2026-10-10';
const stats = getTaskSummaryStats(sampleTasks, refDate);

assert(stats.total === 5, '전체 업무 5건');
assert(stats.incomplete === 3, '미완료 업무 3건 (t1, t2, t3)');
assert(stats.dueToday === 1, '오늘 마감 1건 (t1)');
assert(stats.overdue === 1, '기한 초과 1건 (t2)');
assert(stats.upcoming === 1, '예정 (7일내) 1건 (t3)');
assert(stats.completed === 1, '완료 1건 (t4)');
assert(stats.cancelled === 1, '취소 1건 (t5)');

// 3. Sorting Verification (sortTasks)
console.log('\n--- 3. 정렬 순서 검증 (sortTasks) ---');
const sorted = sortTasks(sampleTasks, refDate);
assert(sorted[0].id === 't2', '1위: 기한 초과(OVERDUE) 업무 t2');
assert(sorted[1].id === 't1', '2위: 오늘 마감(TODAY) 업무 t1');
assert(sorted[2].id === 't3', '3위: 예정(UPCOMING) 업무 t3');
assert(sorted[3].status === 'COMPLETED' || sorted[3].status === 'CANCELLED', '4~5위: 완료/취소 업무');
assert(sorted[4].status === 'COMPLETED' || sorted[4].status === 'CANCELLED', '4~5위: 완료/취소 업무');

// 4. Quick Filter Simulation
console.log('\n--- 4. 빠른 필터 시뮬레이션 ---');
// TODAY
const todayFilter = sampleTasks.filter(
  (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && calculateTaskDueStatus(t, refDate) === 'TODAY'
);
assert(todayFilter.length === 1 && todayFilter[0].id === 't1', '오늘 필터: t1');

// OVERDUE
const overdueFilter = sampleTasks.filter(
  (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && calculateTaskDueStatus(t, refDate) === 'OVERDUE'
);
assert(overdueFilter.length === 1 && overdueFilter[0].id === 't2', '기한 초과 필터: t2');

// UPCOMING
const upcomingFilter = sampleTasks.filter(
  (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && calculateTaskDueStatus(t, refDate) === 'UPCOMING'
);
assert(upcomingFilter.length === 1 && upcomingFilter[0].id === 't3', '예정 필터: t3');

// IN_PROGRESS
const inProgressFilter = sampleTasks.filter((t) => t.status === 'IN_PROGRESS');
assert(inProgressFilter.length === 2, '진행 중 필터: 2건 (t2, t3)');

// COMPLETED
const completedFilter = sampleTasks.filter((t) => t.status === 'COMPLETED');
assert(completedFilter.length === 1 && completedFilter[0].id === 't4', '완료 필터: t4');

// 5. Search Filtering Simulation
console.log('\n--- 5. 내부 검색 (제목, 기업명, 근로자명) 시뮬레이션 ---');
const companyNames: Record<string, string> = {
  comp_001: '(주)알파인더스트리',
  comp_002: '(주)베타소프트',
};

function searchTasks(tasks: Task[], keyword: string): Task[] {
  const kw = keyword.toLowerCase().trim();
  return tasks.filter((t) => {
    const titleMatch = t.title.toLowerCase().includes(kw);
    const compName = t.companyId ? companyNames[t.companyId] || '' : '노무법인 내부';
    const compMatch = compName.toLowerCase().includes(kw);
    return titleMatch || compMatch;
  });
}

const resTitle = searchTasks(sampleTasks, '급여 대장');
assert(resTitle.length === 1 && resTitle[0].id === 't1', "제목 검색 '급여 대장' -> t1 검색 성공");

const resCompany = searchTasks(sampleTasks, '베타소프트');
assert(resCompany.length === 1 && resCompany[0].id === 't2', "기업명 검색 '베타소프트' -> t2 검색 성공");

const resInternal = searchTasks(sampleTasks, '노무법인 내부');
assert(resInternal.length === 3, "내부 업무 검색 '노무법인 내부' -> 3건 검색 성공");

// 6. D-Day calculation
console.log('\n--- 6. D-Day 계산 헬퍼 검증 ---');
assert(getDaysUntilDue('2026-10-10', refDate) === 0, '오늘 마감은 D-0 (D-Day)');
assert(getDaysUntilDue('2026-10-08', refDate) === -2, '2일 지난 마감일은 -2 (D+2 기한초과)');
assert(getDaysUntilDue('2026-10-14', refDate) === 4, '4일 후 마감일은 4 (D-4)');
assert(getDaysUntilDue(undefined, refDate) === null, '마감일 미지정 시 null');

console.log(`\n================================================================`);
console.log(`[R3-3 2/3 UI 테스트 결과]: ${passCount} 통과, ${failCount} 실패`);
console.log(`================================================================`);

if (failCount > 0) {
  process.exit(1);
}
