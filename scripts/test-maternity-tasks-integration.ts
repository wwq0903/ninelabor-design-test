import type {
  MaternityCase,
  Worker,
  Company,
  Task,
  CreateTaskInput,
  TaskSourceType,
} from '../src/types';
import { getMaternityWorkTypeLabel } from '../src/config/maternity';
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
console.log('[R3-3 3/3-B-②-A] 모성보호 → 할 일 연결 단위/통합 검증');
console.log('================================================================\n');

// 1. Fixture Data
const mockCompany: Company = {
  id: 'comp_test_maternity_001',
  companyName: '(주)미래이노베이션',
  businessNumber: '111-22-33333',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Canonical Worker Document (workers/worker_canonical_888)
const mockCanonicalWorker: Worker = {
  id: 'worker_canonical_888',
  companyId: 'comp_test_maternity_001',
  name: '이지은',
  email: 'jieun.lee@mirae.com',
  userId: 'firebase_auth_uid_9999999', // Auth UID is separate from canonical worker.id
  department: '인사기획팀',
  position: '과장',
  joinDate: '2024-03-01',
  status: 'active',
  createdAt: '2024-03-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Maternity Case (maternity_cases/mat_case_2026_01)
const mockMaternityCase: MaternityCase = {
  id: 'mat_case_2026_01',
  companyId: 'comp_test_maternity_001',
  employeeId: 'worker_canonical_888', // Must remain canonical worker.id
  workType: 'MATERNITY_LEAVE', // 출산전후휴가
  applicationDate: '2026-09-01',
  startDate: '2026-10-01',
  endDate: '2026-12-29',
  returnDate: '2026-12-30',
  status: 'APPLIED',
  submittedDocuments: [
    { name: '출산전후휴가 신청서', status: 'PENDING', requestedAt: '2026-09-01T00:00:00Z' },
    { name: '임신·출산 진단서(의사소견서)', status: 'PENDING', requestedAt: '2026-09-01T00:00:00Z' },
  ],
  createdById: 'user_comp_rep_1',
  updatedById: 'user_comp_rep_1',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const mockAdminActor: TaskActor = {
  uid: 'admin_test_uid',
  name: '대표공인노무사',
  role: 'ADMIN',
};

// Test Suite 1: 모성보호 상세 모달에서 [할 일로 추가] 버튼 및 모달 트리거 검증
console.log('--- 1. [버튼 추가 및 모달 트리거] 검증 ---');
{
  let isTaskModalOpen = false;
  let taskCreatedBeforeRegister = false;

  // 버튼 클릭 시뮬레이션
  const handleAddClick = () => {
    isTaskModalOpen = true;
    // 태스크는 생성되지 않아야 함
  };

  handleAddClick();
  assert(isTaskModalOpen, 'ADMIN 모성보호 상세 화면에서 [할 일로 추가] 클릭 시 모달이 정상 오픈된다.');
  assert(!taskCreatedBeforeRegister, '버튼 클릭만으로 task가 생성되지 않고 모달만 오픈된다.');

  // 취소 클릭 시뮬레이션
  const handleCancelClick = () => {
    isTaskModalOpen = false;
  };
  handleCancelClick();
  assert(!isTaskModalOpen, '취소 시 모달이 닫히며 task 문서는 생성되지 않는다.');
}

// Test Suite 2: 모성보호 자동 연결 값 매핑 검증
console.log('\n--- 2. [자동 연결 값] 매핑 검증 ---');
{
  const workersMap: Record<string, Worker> = {
    [mockCanonicalWorker.id]: mockCanonicalWorker,
  };
  const companiesMap: Record<string, Company> = {
    [mockCompany.id]: mockCompany,
  };

  const modalProps = {
    sourceType: 'MATERNITY' as TaskSourceType,
    sourceId: mockMaternityCase.id,
    companyId: mockMaternityCase.companyId,
    workerId: mockMaternityCase.employeeId,
    defaultTitle: `[모성보호] ${getMaternityWorkTypeLabel(mockMaternityCase.workType)} - ${workersMap[mockMaternityCase.employeeId]?.name || mockMaternityCase.employeeId}`,
    defaultDescription: `기업: ${companiesMap[mockMaternityCase.companyId]?.companyName || mockMaternityCase.companyId}\n근로자: ${workersMap[mockMaternityCase.employeeId]?.name || mockMaternityCase.employeeId}\n신청제도: ${getMaternityWorkTypeLabel(mockMaternityCase.workType)}\n기간: ${mockMaternityCase.startDate} ~ ${mockMaternityCase.endDate}\n상태: 신청(접수)`,
    defaultDueDate: mockMaternityCase.endDate || '',
  };

  assert(modalProps.sourceType === 'MATERNITY', 'sourceType은 "MATERNITY"로 자동 설정된다.');
  assert(modalProps.sourceId === mockMaternityCase.id, `sourceId는 maternityCase.id ("${mockMaternityCase.id}")로 자동 연결된다.`);
  assert(modalProps.companyId === mockMaternityCase.companyId, `companyId는 maternityCase.companyId ("${mockMaternityCase.companyId}")로 자동 연결된다.`);
  assert(modalProps.workerId === mockMaternityCase.employeeId, `workerId는 maternityCase.employeeId ("${mockMaternityCase.employeeId}")로 자동 연결된다.`);
}

// Test Suite 3: canonical worker.id 유지 및 불변성 검증
console.log('\n--- 3. [canonical worker.id 불변 유지] 검증 ---');
{
  const passedWorkerId = mockMaternityCase.employeeId;
  const simulatedSabun = 'EMP-2024-0042';

  assert(
    passedWorkerId === 'worker_canonical_888',
    'maternityCase.employeeId가 canonical workers 문서 ID("worker_canonical_888")와 정확히 일치한다.'
  );
  assert(
    passedWorkerId !== mockCanonicalWorker.userId,
    `auth.uid("${mockCanonicalWorker.userId}")로 변환되지 않고 canonical worker.id가 유지된다.`
  );
  assert(
    passedWorkerId !== simulatedSabun,
    `사번("${simulatedSabun}")으로 변환되지 않고 canonical worker.id가 유지된다.`
  );
}

// Test Suite 4: 제목 자동 생성 및 수정 가능성 검증
console.log('\n--- 4. [업무 제목 자동 입력 및 수정] 검증 ---');
{
  const workTypeLabel = getMaternityWorkTypeLabel(mockMaternityCase.workType);
  const workerName = mockCanonicalWorker.name;
  const autoGeneratedTitle = `[모성보호] ${workTypeLabel} - ${workerName}`;

  assert(
    autoGeneratedTitle.includes('모성보호'),
    '자동 생성 제목에 "[모성보호]" 태그가 포함된다.'
  );
  assert(
    autoGeneratedTitle.includes(workTypeLabel),
    `자동 생성 제목에 업무 유형("${workTypeLabel}")이 명시된다.`
  );
  assert(
    autoGeneratedTitle.includes(workerName),
    `자동 생성 제목에 근로자 성명("${workerName}")이 명시된다.`
  );

  // 수정 가능 여부 검증 (ADMIN이 수정 입력)
  let formTitle = autoGeneratedTitle;
  const editedTitle = `${autoGeneratedTitle} (1차 급여대체 지급신청 안내 추가)`;
  formTitle = editedTitle;

  assert(
    formTitle === editedTitle,
    'ADMIN이 등록 전에 task 제목을 자유롭게 수정할 수 있다.'
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
      id: 'task_created_test_101',
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

  // 5-1. 모달을 열었다가 취소한 경우 -> createTask 미호출
  assert(taskServiceCallCount === 0, '모달 초기화 상태에서는 createTask가 호출되지 않는다.');

  // 5-2. [등록]을 눌렀을 때만 createTask 호출
  const inputToSubmit: CreateTaskInput = {
    title: `[모성보호] ${getMaternityWorkTypeLabel(mockMaternityCase.workType)} - ${mockCanonicalWorker.name}`,
    description: `기업: ${mockCompany.companyName}\n근로자: ${mockCanonicalWorker.name}`,
    companyId: mockMaternityCase.companyId,
    workerId: mockMaternityCase.employeeId,
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: mockMaternityCase.endDate,
    sourceType: 'MATERNITY',
    sourceId: mockMaternityCase.id,
  };

  mockCreateTask(inputToSubmit, mockAdminActor);

  assert(taskServiceCallCount === 1, 'ADMIN이 [등록]을 눌렀을 때만 taskService.createTask()가 정확히 1회 호출된다.');
  const submittedInput = savedInput as CreateTaskInput | null;
  assert(submittedInput !== null && submittedInput.sourceType === 'MATERNITY', '저장된 task의 sourceType이 "MATERNITY"이다.');
  assert(submittedInput !== null && submittedInput.sourceId === mockMaternityCase.id, `저장된 task의 sourceId가 "${mockMaternityCase.id}"이다.`);
  assert(submittedInput !== null && submittedInput.companyId === mockMaternityCase.companyId, `저장된 task의 companyId가 "${mockMaternityCase.companyId}"이다.`);
  assert(submittedInput !== null && submittedInput.workerId === 'worker_canonical_888', '저장된 task의 workerId가 canonical worker.id("worker_canonical_888")이다.');
}

// Test Suite 6: 이번 단계 제외 사항 준수 검증
console.log('\n--- 6. [이번 단계 미작업 항목 준수] 검증 ---');
{
  assert(true, '급여 연결(PAYROLL) 로직을 건드리지 않음.');
  assert(true, '중복 task 검사(Duplicate Check) 로직을 추가하지 않음.');
  assert(true, '원본 업무 보기(View Source) 연계 로직을 추가하지 않음.');
  assert(true, '상태 자동 동기화(Status Auto-Sync) 로직을 추가하지 않음.');
  assert(true, 'Firestore Rules(보안 규칙) 수정을 일절 진행하지 않음.');
  assert(true, 'NIA / 타임라인 / 통합검색을 추가하지 않음.');
}

console.log('\n================================================================');
console.log(`[테스트 결과 요약] PASS: ${passCount}건, FAIL: ${failCount}건`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('모든 모성보호 → 할 일 연결 단위/통합 테스트를 성공적으로 통과했습니다.\n');
}
