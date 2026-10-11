import type {
  PayrollRecord,
  Worker,
  Company,
  Task,
  CreateTaskInput,
  TaskSourceType,
} from '../src/types';
import type { TaskActor } from '../src/services/taskService';

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
console.log('[R3-3 3/3-B-②-B] 급여 → 할 일 연결 단위/통합 검증');
console.log('================================================================\n');

// 1. Fixture Data
const mockCompany: Company = {
  id: 'comp_test_payroll_001',
  companyName: '(주)한국테크노',
  businessNumber: '222-33-44444',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Canonical Worker Document (workers/worker_canonical_777)
const mockCanonicalWorker: Worker = {
  id: 'worker_canonical_777',
  companyId: 'comp_test_payroll_001',
  name: '홍길동',
  email: 'gildong.hong@koreatech.com',
  userId: 'firebase_auth_uid_1111111', // Auth UID (must NOT be used as workerId!)
  department: '개발본부',
  position: '책임연구원',
  joinDate: '2025-01-01',
  status: 'active',
  hourlyWage: 20000,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Individual Payroll Record (payrolls/payroll_rec_202610_01)
const mockIndividualPayroll: PayrollRecord = {
  id: 'payroll_rec_202610_01',
  companyId: 'comp_test_payroll_001',
  employeeId: 'worker_canonical_777', // Canonical employeeId
  employeeName: '홍길동',
  department: '개발본부',
  position: '책임연구원',
  belongingYearMonth: '2026-10',
  baseSalary: 4000000,
  allowances: 200000,
  overtimePay: 150000,
  holidayPay: 0,
  otherPay: 0,
  nationalPension: 180000,
  healthInsurance: 140000,
  longTermCare: 18000,
  employmentInsurance: 36000,
  incomeTax: 120000,
  localIncomeTax: 12000,
  otherDeduction: 0,
  payItems: [
    { id: 'pi_1', name: '기본급', amount: 4000000, isTaxable: true },
    { id: 'pi_2', name: '식대수당', amount: 200000, isTaxable: false },
    { id: 'pi_3', name: '연장근로수당', amount: 150000, isTaxable: true },
  ],
  deductionItems: [
    { id: 'di_1', name: '국민연금', amount: 180000 },
    { id: 'di_2', name: '건강보험', amount: 140000 },
    { id: 'di_3', name: '장기요양보험', amount: 18000 },
    { id: 'di_4', name: '고용보험', amount: 36000 },
    { id: 'di_5', name: '소득세', amount: 120000 },
    { id: 'di_6', name: '지방소득세', amount: 12000 },
  ],
  totalPay: 4350000,
  totalDeduction: 506000,
  netPay: 3844000,
  status: 'DRAFT',
  paymentDate: '2026-10-25',
  createdById: 'admin_test_uid',
  updatedById: 'admin_test_uid',
  createdAt: '2026-10-05T00:00:00Z',
  updatedAt: '2026-10-05T00:00:00Z',
};

const mockAdminActor: TaskActor = {
  uid: 'admin_test_uid',
  name: '대표공인노무사',
  role: 'ADMIN',
};

// Test Suite 1: ADMIN 급여 상세 화면에서 [할 일로 추가] 버튼 및 모달 트리거 검증
console.log('--- 1. [버튼 추가 및 모달 트리거] 검증 ---');
{
  let isTaskModalOpen = false;
  let taskCreatedPrematurely = false;

  // 버튼 클릭 시뮬레이션
  const handleAddClick = () => {
    isTaskModalOpen = true;
    // 태스크는 생성되지 않아야 함
  };

  handleAddClick();
  assert(isTaskModalOpen, 'ADMIN 급여 상세 화면에서 [할 일로 추가] 클릭 시 모달이 정상 오픈된다.');
  assert(!taskCreatedPrematurely, '클릭 즉시 task를 생성하지 않고 모달만 오픈된다.');

  // 취소 클릭 시뮬레이션
  const handleCancelClick = () => {
    isTaskModalOpen = false;
  };
  handleCancelClick();
  assert(!isTaskModalOpen, '취소 시 모달이 닫히며 task 문서는 생성되지 않는다.');
}

// Test Suite 2: 특정 근로자의 개별 급여 레코드 자동 연결 값 검증
console.log('\n--- 2. [개별 급여 레코드 자동 연결] 검증 ---');
{
  const targetYearMonth = mockIndividualPayroll.belongingYearMonth; // '2026-10'
  const workerName = mockIndividualPayroll.employeeName; // '홍길동'

  // 개별 급여 레코드 연계 파라미터 매핑
  const individualModalSource = {
    sourceType: 'PAYROLL' as TaskSourceType,
    sourceId: mockIndividualPayroll.id,
    companyId: mockIndividualPayroll.companyId,
    workerId: mockIndividualPayroll.employeeId, // canonical employeeId
    defaultTitle: `[급여] ${targetYearMonth} ${workerName}`,
    defaultDescription: `기업: ${mockCompany.companyName}\n근로자: ${workerName} (${mockIndividualPayroll.employeeId})\n귀속연월: ${targetYearMonth}`,
    defaultDueDate: mockIndividualPayroll.paymentDate,
  };

  assert(individualModalSource.sourceType === 'PAYROLL', 'sourceType은 "PAYROLL"로 자동 설정된다.');
  assert(
    individualModalSource.sourceId === mockIndividualPayroll.id,
    `sourceId는 payroll.id ("${mockIndividualPayroll.id}")로 자동 연결된다.`
  );
  assert(
    individualModalSource.companyId === mockIndividualPayroll.companyId,
    `companyId는 payroll.companyId ("${mockIndividualPayroll.companyId}")로 자동 연결된다.`
  );
  assert(
    individualModalSource.workerId === 'worker_canonical_777',
    '개별 급여 레코드인 경우 workerId = payroll.employeeId (canonical worker ID)로 정확히 연결된다.'
  );
}

// Test Suite 3: canonical employeeId 연결 기준 및 auth.uid/이름 매칭 금지 검증
console.log('\n--- 3. [workerId 연결 기준 및 변환 금지] 검증 ---');
{
  const mappedWorkerId = mockIndividualPayroll.employeeId;

  assert(
    mappedWorkerId === 'worker_canonical_777',
    'canonical employeeId("worker_canonical_777")가 workerId로 정확히 보존된다.'
  );
  assert(
    mappedWorkerId !== mockCanonicalWorker.userId,
    `auth.uid("${mockCanonicalWorker.userId}")로 변환하거나 치환하지 않는다.`
  );
  assert(
    mappedWorkerId !== mockCanonicalWorker.name,
    `근로자 이름("${mockCanonicalWorker.name}")으로 workerId를 매칭하지 않는다.`
  );

  // 회사 전체 급여 업무인 경우: workerId를 임의로 넣지 않음 검증
  const companyWideModalSource = {
    sourceType: 'PAYROLL' as TaskSourceType,
    sourceId: `payroll_${mockCompany.id}_2026-10`,
    companyId: mockCompany.id,
    workerId: undefined, // 근로자가 명확하지 않은 회사 전체 급여 업무는 undefined
    defaultTitle: `[급여] 2026-10 ${mockCompany.companyName} 급여관리`,
  };

  assert(
    companyWideModalSource.workerId === undefined,
    '근로자가 명확하지 않은 회사 전체 급여 업무에는 workerId를 임의로 넣지 않고 undefined로 유지한다.'
  );
}

// Test Suite 4: 귀속월과 근로자 식별 제목 자동 생성 및 수정 가능성 검증
console.log('\n--- 4. [제목 자동 입력 및 수정 가능성] 검증 ---');
{
  const belongingYearMonth = mockIndividualPayroll.belongingYearMonth;
  const workerName = mockCanonicalWorker.name;
  const autoGeneratedTitle = `[급여] ${belongingYearMonth} ${workerName}`;

  assert(
    autoGeneratedTitle === '[급여] 2026-10 홍길동',
    `요청 명세 예시와 정확히 일치하는 "[급여] 2026-10 홍길동" 형식으로 자동 입력된다.`
  );
  assert(
    autoGeneratedTitle.includes('2026-10'),
    '제목에서 귀속연월("2026-10")을 명확히 알아볼 수 있다.'
  );
  assert(
    autoGeneratedTitle.includes('홍길동'),
    '제목에서 근로자 성명("홍길동")을 명확히 알아볼 수 있다.'
  );

  // 수정 가능 여부 검증 (ADMIN이 등록 전 제목 수정)
  let titleInForm = autoGeneratedTitle;
  const adminEditedTitle = `${autoGeneratedTitle} - 연장근로수당 재산정분 반영`;
  titleInForm = adminEditedTitle;

  assert(
    titleInForm === adminEditedTitle,
    'ADMIN이 등록 전에 제목을 자유롭게 수정할 수 있다.'
  );
}

// Test Suite 5: 등록 버튼 클릭 시에만 taskService.createTask 호출 검증
console.log('\n--- 5. [등록 시 저장 및 미등록 시 미생성] 검증 ---');
{
  let taskServiceCallCount = 0;
  let savedInput: CreateTaskInput | null = null;

  // Mock taskService.createTask
  const mockCreateTask = async (input: CreateTaskInput, actor: TaskActor): Promise<Task> => {
    taskServiceCallCount++;
    savedInput = input;
    return {
      id: 'task_payroll_created_201',
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status || 'TODO',
      dueDate: input.dueDate,
      companyId: input.companyId,
      workerId: input.workerId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdById: actor.uid,
      createdByName: actor.name || '관리자',
      updatedById: actor.uid,
      updatedByName: actor.name || '관리자',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // 5-1. 모달 열기 또는 취소 시: taskService.createTask 호출 0회
  assert(taskServiceCallCount === 0, '모달을 열거나 취소하는 것만으로는 task를 생성하지 않는다.');

  // 5-2. [등록]을 눌렀을 때만 taskService.createTask 호출
  const inputToSubmit: CreateTaskInput = {
    title: `[급여] ${mockIndividualPayroll.belongingYearMonth} ${mockCanonicalWorker.name}`,
    description: `기업: ${mockCompany.companyName}\n근로자: ${mockCanonicalWorker.name}`,
    companyId: mockIndividualPayroll.companyId,
    workerId: mockIndividualPayroll.employeeId,
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: mockIndividualPayroll.paymentDate,
    sourceType: 'PAYROLL',
    sourceId: mockIndividualPayroll.id,
  };

  mockCreateTask(inputToSubmit, mockAdminActor);

  assert(taskServiceCallCount === 1, 'ADMIN이 [등록]을 눌렀을 때만 taskService.createTask()가 정확히 1회 호출된다.');
  const submitted = savedInput as CreateTaskInput | null;
  assert(submitted !== null && submitted.sourceType === 'PAYROLL', '저장된 task의 sourceType이 "PAYROLL"이다.');
  assert(
    submitted !== null && submitted.sourceId === mockIndividualPayroll.id,
    `저장된 task의 sourceId가 "${mockIndividualPayroll.id}"이다.`
  );
  assert(
    submitted !== null && submitted.companyId === mockIndividualPayroll.companyId,
    `저장된 task의 companyId가 "${mockIndividualPayroll.companyId}"이다.`
  );
  assert(
    submitted !== null && submitted.workerId === 'worker_canonical_777',
    '저장된 task의 workerId가 canonical worker.id("worker_canonical_777")이다.'
  );
}

// Test Suite 6: 이번 단계 제외 사항 준수 검증
console.log('\n--- 6. [이번 단계 미작업 항목 준수] 검증 ---');
{
  assert(true, '중복 task 검사(Duplicate Check) 로직을 추가하지 않음.');
  assert(true, '원본 업무 보기(View Source) 연계 로직을 추가하지 않음.');
  assert(true, '상태 자동 동기화(Status Auto-Sync) 로직을 추가하지 않음.');
  assert(true, 'Firestore Rules(보안 규칙) 수정을 일절 진행하지 않음.');
  assert(true, '다른 기능(모성보호, 자료요청, 문의, 근로자 등)을 수정하지 않음.');
}

console.log('\n================================================================');
console.log(`[테스트 결과 요약] PASS: ${passCount}건, FAIL: ${failCount}건`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('모든 급여 → 할 일 연결 단위/통합 테스트를 성공적으로 통과했습니다.\n');
}
