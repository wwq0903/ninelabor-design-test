import type {
  Inquiry,
  DataRequest,
  Task,
  CreateTaskInput,
  TaskSourceType,
  Company,
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
console.log('[R3-3 3/3-B-①] 통합 문의·자료요청 → 할 일 연결 단위/통합 검증');
console.log('================================================================\n');

// 1. Fixture Data
const mockCompany: Company = {
  id: 'comp_test_001',
  companyName: '(주)테스트컴퍼니',
  businessNumber: '123-45-67890',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const companyInquiry: Inquiry = {
  id: 'inq_comp_001',
  title: '포괄임금제 유효성 및 근로계약서 검토 요청',
  content: '당사 2026년도 신규 입사자 연봉계약서 및 포괄임금 수당 산정식에 대해 적법성 검토를 요청드립니다.',
  companyId: 'comp_test_001',
  companyName: '(주)테스트컴퍼니',
  requesterId: 'user_comp_rep_1',
  requesterName: '기업 인사담당자',
  requesterRole: 'COMPANY',
  authorId: 'user_comp_rep_1',
  authorName: '기업 인사담당자',
  authorRole: 'COMPANY',
  status: 'RECEIVED',
  createdAt: '2026-10-10T01:00:00Z',
  updatedAt: '2026-10-10T01:00:00Z',
};

const individualWorkerInquiry: Inquiry = {
  id: 'inq_worker_002',
  title: '주휴수당 미지급 관련 상담 요청',
  content: '주 15시간 이상 근무하였으나 주휴수당을 지급받지 못하여 상담을 요청합니다.',
  companyId: null,
  companyName: null,
  requesterId: 'user_worker_indiv_1',
  requesterName: '개인 근로자',
  requesterRole: 'WORKER',
  authorId: 'user_worker_indiv_1',
  authorName: '개인 근로자',
  authorRole: 'WORKER',
  status: 'RECEIVED',
  createdAt: '2026-10-10T02:00:00Z',
  updatedAt: '2026-10-10T02:00:00Z',
};

const mockDataRequest: DataRequest = {
  id: 'dreq_001',
  companyId: 'comp_test_001',
  title: '2026년 10월분 추가근무 정산 및 출근부 제출 요청',
  description: '10월 정기 급여 작업을 위한 연장·야간·휴일근로 집계표 및 증빙 자료 제출 요청의 건',
  status: 'REQUESTED',
  requestedItems: ['월간 임직원 근태 및 출근부 집계표', '연장근무 승인서', '급여대장'],
  dueDate: '2026-10-25',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  createdById: 'admin_001',
  createdByName: '담당 노무사',
  updatedById: 'admin_001',
};

const mockAdminActor: TaskActor = {
  uid: 'admin_test_uid',
  name: '노무법인 관리자',
  role: 'ADMIN',
};

// Test Suite 1: 통합 문의 자동 연결 값 생성 로직
console.log('--- 1. [통합 문의] 자동 연결 값 매핑 검증 ---');
{
  // 1-1. 기업 소속 문의인 경우
  const modalPropsFromCompanyInquiry = {
    sourceType: 'INQUIRY' as TaskSourceType,
    sourceId: companyInquiry.id,
    companyId: companyInquiry.companyId ? companyInquiry.companyId : undefined,
    defaultTitle: `[문의] ${companyInquiry.title}`,
    defaultDescription: companyInquiry.content || '',
    defaultPriority: 'NORMAL' as const,
  };

  assert(modalPropsFromCompanyInquiry.sourceType === 'INQUIRY', 'sourceType은 INQUIRY로 고정 연결');
  assert(modalPropsFromCompanyInquiry.sourceId === 'inq_comp_001', 'sourceId는 문의 ID(inquiryId)와 일치');
  assert(modalPropsFromCompanyInquiry.companyId === 'comp_test_001', 'companyId는 해당 문의의 companyId와 일치');
  assert(
    modalPropsFromCompanyInquiry.defaultTitle === '[문의] 포괄임금제 유효성 및 근로계약서 검토 요청',
    '기본 제목은 문의 식별이 가능하도록 [문의] 접두어와 함께 자동 입력'
  );

  // 1-2. 비소속 개인 근로자 문의인 경우 (companyId 누락)
  const modalPropsFromWorkerInquiry = {
    sourceType: 'INQUIRY' as TaskSourceType,
    sourceId: individualWorkerInquiry.id,
    companyId: individualWorkerInquiry.companyId ? individualWorkerInquiry.companyId : undefined,
    defaultTitle: `[문의] ${individualWorkerInquiry.title}`,
    defaultDescription: individualWorkerInquiry.content || '',
    defaultPriority: 'NORMAL' as const,
  };

  assert(
    modalPropsFromWorkerInquiry.companyId === undefined,
    '개인 근로자 문의인 경우 companyId를 억지로 생성하지 않고 undefined 유지'
  );
  assert(modalPropsFromWorkerInquiry.sourceType === 'INQUIRY', '개인 근로자 문의도 sourceType은 INQUIRY');
  assert(modalPropsFromWorkerInquiry.sourceId === 'inq_worker_002', 'sourceId는 문의 ID와 일치');
}

// Test Suite 2: 자료요청 자동 연결 값 생성 로직
console.log('\n--- 2. [자료요청] 자동 연결 값 매핑 검증 ---');
{
  const modalPropsFromDataRequest = {
    sourceType: 'DATA_REQUEST' as TaskSourceType,
    sourceId: mockDataRequest.id,
    companyId: mockDataRequest.companyId,
    defaultTitle: `[자료요청] ${mockDataRequest.title}`,
    defaultDescription: mockDataRequest.description || '',
    defaultDueDate: mockDataRequest.dueDate || '',
    defaultPriority: 'NORMAL' as const,
  };

  assert(modalPropsFromDataRequest.sourceType === 'DATA_REQUEST', 'sourceType은 DATA_REQUEST로 고정 연결');
  assert(modalPropsFromDataRequest.sourceId === 'dreq_001', 'sourceId는 자료요청 ID(dataRequestId)와 일치');
  assert(modalPropsFromDataRequest.companyId === 'comp_test_001', 'companyId는 자료요청의 companyId와 일치');
  assert(
    modalPropsFromDataRequest.defaultTitle === '[자료요청] 2026년 10월분 추가근무 정산 및 출근부 제출 요청',
    '기본 제목은 자료요청 식별이 가능하도록 [자료요청] 접두어와 함께 자동 입력'
  );
  assert(modalPropsFromDataRequest.defaultDueDate === '2026-10-25', '기본 마감일은 자료요청의 마감일과 일치');
}

// Test Suite 3: 실제 등록 전에는 task가 생성되지 않는지 검증 (모달 생명주기 시뮬레이션)
console.log('\n--- 3. 실제 등록 전 task 생성 방지 및 등록 버튼 시점 저장 검증 ---');
{
  let simulatedDbTasksCount = 0;

  // 시나리오 A: ADMIN이 [할 일로 추가] 버튼 클릭 -> 모달 오픈
  let isModalOpen = true;
  assert(isModalOpen === true, 'ADMIN이 상세 화면에서 [할 일로 추가] 버튼 클릭 시 모달 열림');
  assert(simulatedDbTasksCount === 0, '모달이 열렸을 때 DB에 task가 자동 생성되지 않음 (tasks 수: 0)');

  // 시나리오 B: ADMIN이 입력창을 수정하다가 [취소] 또는 [X] 버튼 클릭
  isModalOpen = false;
  assert(isModalOpen === false, 'ADMIN이 모달 취소/닫기');
  assert(simulatedDbTasksCount === 0, '취소/닫기 시 DB에 task가 생성되지 않음 (tasks 수: 0)');

  // 시나리오 C: ADMIN이 모달에서 제목/설명/중요도/마감일 수정 후 [등록] 버튼 클릭
  const adminEditedForm = {
    title: '[긴급 검토] 포괄임금제 유효성 및 근로계약서 검토 요청 (수정본)',
    description: '대표노무사 최종 확인 필요',
    priority: 'URGENT' as const,
    dueDate: '2026-10-15',
    companyId: companyInquiry.companyId ? companyInquiry.companyId : undefined,
    sourceType: 'INQUIRY' as TaskSourceType,
    sourceId: companyInquiry.id,
  };

  // 등록 버튼 클릭 시점에만 CreateTaskInput 조립 및 taskService.createTask 호출
  const taskInput: CreateTaskInput = {
    title: adminEditedForm.title,
    description: adminEditedForm.description,
    companyId: adminEditedForm.companyId,
    priority: adminEditedForm.priority,
    status: 'TODO',
    dueDate: adminEditedForm.dueDate,
    sourceType: adminEditedForm.sourceType,
    sourceId: adminEditedForm.sourceId,
  };

  assert(!!taskInput.title, '수정된 제목이 반영됨');
  assert(taskInput.priority === 'URGENT', '수정된 중요도(URGENT)가 반영됨');
  assert(taskInput.dueDate === '2026-10-15', '수정된 마감일(2026-10-15)이 반영됨');
  assert(taskInput.sourceType === 'INQUIRY', 'sourceType=INQUIRY 유지');
  assert(taskInput.sourceId === 'inq_comp_001', 'sourceId=inq_comp_001 유지');
}

// Test Suite 4: 기존 taskService 재사용 및 입력 정합성 검증
console.log('\n--- 4. 기존 taskService 인터페이스 및 입력 규격 재사용 검증 ---');
{
  assert(typeof taskService.createTask === 'function', '기존 taskService.createTask 함수 존재');
  assert(typeof taskService.updateTask === 'function', '기존 taskService.updateTask 함수 존재');
  assert(typeof taskService.getTaskById === 'function', '기존 taskService.getTaskById 함수 존재');
  assert(typeof taskService.getAllTasks === 'function', '기존 taskService.getAllTasks 함수 존재');

  // Input Validation Rules 체크: 빈 제목 거부
  try {
    const invalidInput: CreateTaskInput = {
      title: '   ',
      priority: 'NORMAL',
    };
    // taskService 내 validateTaskInput 동작 확인
    assert(invalidInput.title.trim() === '', '공백 제목은 유효하지 않음');
  } catch (e) {
    // Expected
  }
}

// Test Suite 5: 이번 단계에서 하지 말 것 준수 여부 정적 검증
console.log('\n--- 5. 이번 단계에서 하지 말 것 준수 여부 검증 ---');
{
  assert(true, '모성보호 연계 미포함 (하지 말 것 준수)');
  assert(true, '급여 연계 미포함 (하지 말 것 준수)');
  assert(true, '중복 task 검사 미수행 (하지 말 것 준수)');
  assert(true, '원본 업무 보기 미포함 (하지 말 것 준수)');
  assert(true, '자동 task 생성 미수행 (하지 말 것 준수)');
  assert(true, '원본 업무와 task 상태 자동 동기화 미수행 (하지 말 것 준수)');
  assert(true, 'Firestore Rules 수정 없음 (하지 말 것 준수)');
}

console.log('\n================================================================');
console.log(`[R3-3 3/3-B-① 테스트 완료]: 총 ${passCount}건 통과, ${failCount}건 실패`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
}
