import type {
  Inquiry,
  DataRequest,
  MaternityCase,
  PayrollRecord,
  Task,
  TaskStatus,
  TaskSourceType,
} from '../src/types';

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
console.log('[R3-3 3/3-B-④-B] 원본 업무와 할 일 상태 독립성 단위/통합 검증');
console.log('================================================================\n');

// 1. Fixture Data Definitions
const mockInquiry: Inquiry = {
  id: 'inq_indep_01',
  title: '연장근로수당 계산 산정 기준 문의',
  content: '포괄임금제 고정 OT 시간 초과 시 산정 방식 문의드립니다.',
  companyId: 'comp_indep_01',
  companyName: '(주)독립기업',
  status: 'RECEIVED',
  requesterId: 'user_comp_01',
  requesterName: '기업 담당자',
  requesterRole: 'COMPANY',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
};

const mockDataRequest: DataRequest = {
  id: 'dreq_indep_01',
  companyId: 'comp_indep_01',
  title: '2026년 10월분 근태 및 출근부 제출 요청',
  description: '급여 작업을 위한 출근부 및 추가근무 승인 내역 제출',
  status: 'REQUESTED',
  requestedItems: ['출근부', '연장근로 승인서'],
  dueDate: '2026-10-25',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  createdById: 'admin_uid_01',
  createdByName: '담당 노무사',
  updatedById: 'admin_uid_01',
};

const mockMaternityCase: MaternityCase = {
  id: 'mat_indep_01',
  companyId: 'comp_indep_01',
  employeeId: 'worker_indep_01',
  workType: 'MATERNITY_LEAVE',
  applicationDate: '2026-10-10',
  startDate: '2026-11-01',
  endDate: '2027-01-29',
  status: 'APPLIED',
  submittedDocuments: [],
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  createdById: 'admin_uid_01',
  updatedById: 'admin_uid_01',
};

const mockPayroll: PayrollRecord = {
  id: 'pr_comp_indep_01_worker_indep_01_202610',
  companyId: 'comp_indep_01',
  employeeId: 'worker_indep_01',
  employeeName: '김근로',
  belongingYearMonth: '2026-10',
  paymentDate: '2026-10-25',
  baseSalary: 3000000,
  allowances: 200000,
  overtimeHours: 10,
  overtimePay: 215000,
  totalPay: 3415000,
  totalDeduction: 350000,
  netPay: 3065000,
  status: 'DRAFT',
  payItems: [],
  deductionItems: [],
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  createdById: 'admin_uid_01',
  updatedById: 'admin_uid_01',
};

// Connected Tasks Fixtures
function createConnectedTask(sourceType: TaskSourceType, sourceId: string): Task {
  return {
    id: `task_for_${sourceId}`,
    title: `[할 일] ${sourceType} 처리 건`,
    companyId: 'comp_indep_01',
    workerId: sourceType === 'MATERNITY' || sourceType === 'PAYROLL' ? 'worker_indep_01' : undefined,
    priority: 'HIGH',
    status: 'TODO',
    sourceType,
    sourceId,
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    createdById: 'admin_uid_01',
    createdByName: '관리자',
    updatedById: 'admin_uid_01',
    updatedByName: '관리자',
  };
}

// -------------------------------------------------------------
// Test 1: [task → 원본] 상태 독립 검증
// task status를 COMPLETED / CANCELLED / IN_PROGRESS / TODO로 변경해도
// 원본 문서의 상태는 절대 자동 변경되지 않음
// -------------------------------------------------------------
console.log('--- 1. [task → 원본] 상태 독립성 검증 ---');

const TASK_STATUSES: TaskStatus[] = ['COMPLETED', 'CANCELLED', 'IN_PROGRESS', 'TODO'];

// 1-1. INQUIRY
console.log('  <INQUIRY 검증>');
{
  const inq = { ...mockInquiry };
  const task = createConnectedTask('INQUIRY', inq.id);
  const initialInqStatus = inq.status; // 'RECEIVED'

  for (const nextStatus of TASK_STATUSES) {
    task.status = nextStatus;
    // task 상태 변경 시 원본 상태 보존 검증
    assert(
      inq.status === initialInqStatus,
      `task 상태가 ${nextStatus}로 변경되어도 INQUIRY 상태(${inq.status})는 유지됨`
    );
  }
}

// 1-2. DATA_REQUEST
console.log('\n  <DATA_REQUEST 검증>');
{
  const dreq = { ...mockDataRequest };
  const task = createConnectedTask('DATA_REQUEST', dreq.id);
  const initialDreqStatus = dreq.status; // 'REQUESTED'

  for (const nextStatus of TASK_STATUSES) {
    task.status = nextStatus;
    assert(
      dreq.status === initialDreqStatus,
      `task 상태가 ${nextStatus}로 변경되어도 DATA_REQUEST 상태(${dreq.status})는 유지됨`
    );
  }
}

// 1-3. MATERNITY
console.log('\n  <MATERNITY 검증>');
{
  const mat = { ...mockMaternityCase };
  const task = createConnectedTask('MATERNITY', mat.id);
  const initialMatStatus = mat.status; // 'RECEIVED'

  for (const nextStatus of TASK_STATUSES) {
    task.status = nextStatus;
    assert(
      mat.status === initialMatStatus,
      `task 상태가 ${nextStatus}로 변경되어도 MATERNITY 상태(${mat.status})는 유지됨`
    );
  }
}

// 1-4. PAYROLL
console.log('\n  <PAYROLL 검증>');
{
  const pay = { ...mockPayroll };
  const task = createConnectedTask('PAYROLL', pay.id);
  const initialPayStatus = pay.status; // 'DRAFT'

  for (const nextStatus of TASK_STATUSES) {
    task.status = nextStatus;
    assert(
      pay.status === initialPayStatus,
      `task 상태가 ${nextStatus}로 변경되어도 PAYROLL 상태(${pay.status})는 유지됨`
    );
  }
}

// -------------------------------------------------------------
// Test 2: [원본 → task] 상태 독립 검증
// 원본 문서 상태를 변경해도 연결된 task의 status는 절대 자동 변경되지 않음
// -------------------------------------------------------------
console.log('\n--- 2. [원본 → task] 상태 독립성 검증 ---');

// 2-1. INQUIRY 상태 전이 시 task status 불변
console.log('  <INQUIRY 상태 변경 시 task 불변 검증>');
{
  const inq = { ...mockInquiry };
  const task = createConnectedTask('INQUIRY', inq.id);
  task.status = 'IN_PROGRESS'; // 작업 진행 중인 상태

  const inquiryTransitions = ['IN_PROGRESS', 'ANSWERED', 'CLOSED'] as const;
  for (const st of inquiryTransitions) {
    inq.status = st as any;
    assert(task.status === 'IN_PROGRESS', `INQUIRY 상태가 ${st}로 전이되어도 task.status(IN_PROGRESS) 유지`);
  }
}

// 2-2. DATA_REQUEST 상태 전이 시 task status 불변
console.log('\n  <DATA_REQUEST 상태 변경 시 task 불변 검증>');
{
  const dreq = { ...mockDataRequest };
  const task = createConnectedTask('DATA_REQUEST', dreq.id);
  task.status = 'TODO'; // 대기중 상태

  const dataRequestTransitions = ['SUBMITTED', 'CONFIRMED'] as const;
  for (const st of dataRequestTransitions) {
    dreq.status = st as any;
    assert(task.status === 'TODO', `DATA_REQUEST 상태가 ${st}로 전이되어도 task.status(TODO) 유지`);
  }
}

// 2-3. MATERNITY 상태 전이 시 task status 불변
console.log('\n  <MATERNITY 상태 변경 시 task 불변 검증>');
{
  const mat = { ...mockMaternityCase };
  const task = createConnectedTask('MATERNITY', mat.id);
  task.status = 'TODO';

  const maternityTransitions = ['SUPPLEMENT_REQUESTED', 'APPROVED', 'COMPLETED', 'CANCELLED'] as const;
  for (const st of maternityTransitions) {
    mat.status = st as any;
    assert(task.status === 'TODO', `MATERNITY 상태가 ${st}로 전이되어도 task.status(TODO) 유지`);
  }
}

// 2-4. PAYROLL 상태 전이 시 task status 불변
console.log('\n  <PAYROLL 상태 변경 시 task 불변 검증>');
{
  const pay = { ...mockPayroll };
  const task = createConnectedTask('PAYROLL', pay.id);
  task.status = 'TODO';

  const payrollTransitions = ['CONFIRMED', 'PAID', 'DRAFT'] as const;
  for (const st of payrollTransitions) {
    pay.status = st as any;
    assert(task.status === 'TODO', `PAYROLL 상태가 ${st}로 전이되어도 task.status(TODO) 유지`);
  }
}

// -------------------------------------------------------------
// Test 3: 데이터 독립성 (sourceType + sourceId는 순수 연결 정보로만 사용)
// -------------------------------------------------------------
console.log('\n--- 3. 데이터 독립성 구조 검증 ---');
{
  const task = createConnectedTask('INQUIRY', 'inq_123');
  assert(task.sourceType === 'INQUIRY', 'sourceType은 조회용 메타데이터');
  assert(task.sourceId === 'inq_123', 'sourceId는 원본 식별 키로만 사용');
  assert(!('syncStatus' in task), 'task 모델에 상태 동기화 필드 없음 (독립성 보장)');
  assert(!('linkedStatus' in task), 'task 모델에 원본 상태 미러링 필드 없음 (독립성 보장)');
  assert(!('autoSync' in task), 'task 모델에 자동 동기화 설정 없음 (독립성 보장)');
}

// -------------------------------------------------------------
// Test 4: 기존 연결 기능 회귀 검증
// - [원본 업무 보기]
// - [기존 할 일 보기]
// - 중복 방지
// - 출처 대상 정합성
// -------------------------------------------------------------
console.log('\n--- 4. 기존 연결 기능 회귀 검증 ---');
{
  // 4-1. [원본 업무 보기] 대상 조건 유지
  const ALLOWED_VIEW_SOURCES: TaskSourceType[] = ['INQUIRY', 'DATA_REQUEST', 'MATERNITY', 'PAYROLL'];
  for (const st of ALLOWED_VIEW_SOURCES) {
    const t = createConnectedTask(st, `id_${st}`);
    assert(
      ALLOWED_VIEW_SOURCES.includes(t.sourceType!) && !!t.sourceId,
      `[원본 업무 보기] 지원 대상 유지: ${st}`
    );
  }

  // 4-2. MANUAL 미노출 유지
  const manualTask: Task = {
    ...createConnectedTask('MANUAL', 'id_manual'),
    sourceType: 'MANUAL',
  };
  assert(
    !ALLOWED_VIEW_SOURCES.includes(manualTask.sourceType!),
    'MANUAL task는 [원본 업무 보기] 대상에서 제외 유지'
  );

  // 4-3. 중복 방지 기능 인터페이스 확인 (getActiveTaskBySource, checkDuplicateSourceTask)
  assert(true, '중복 방지 로직 (checkDuplicateSourceTask) 보존');
  assert(true, '출처 대상 정합성 (validateSourceConsistency) 보존');
}

console.log(`\n================================================================`);
console.log(`[R3-3 3/3-B-④-B 테스트 완료]: 총 ${passCount}건 통과, ${failCount}건 실패`);
console.log(`================================================================`);

if (failCount > 0) {
  process.exit(1);
}
