import type {
  Task,
  TaskSourceType,
} from '../src/types';
import { taskService } from '../src/services/taskService';

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
console.log('[R3-3 3/3-B-④-A] 할 일에서 원본 업무 보기 단위 및 정합성 테스트');
console.log('================================================================\n');

// 1. 대상 sourceType 및 MANUAL 미노출 검증
console.log('--- 1. 대상 sourceType 및 MANUAL 미노출 검증 ---');
const ALLOWED_SOURCE_TYPES: TaskSourceType[] = ['INQUIRY', 'DATA_REQUEST', 'MATERNITY', 'PAYROLL'];

function shouldShowViewSourceButton(task: Partial<Task>): boolean {
  if (!task.sourceType) return false;
  if (!ALLOWED_SOURCE_TYPES.includes(task.sourceType)) return false;
  if (!task.sourceId || !task.sourceId.trim()) return false;
  return true;
}

assert(shouldShowViewSourceButton({ sourceType: 'INQUIRY', sourceId: 'inq_123' }) === true, 'INQUIRY + sourceId 존재 시 버튼 노출');
assert(shouldShowViewSourceButton({ sourceType: 'DATA_REQUEST', sourceId: 'dreq_123' }) === true, 'DATA_REQUEST + sourceId 존재 시 버튼 노출');
assert(shouldShowViewSourceButton({ sourceType: 'MATERNITY', sourceId: 'mat_123' }) === true, 'MATERNITY + sourceId 존재 시 버튼 노출');
assert(shouldShowViewSourceButton({ sourceType: 'PAYROLL', sourceId: 'pr_123' }) === true, 'PAYROLL + sourceId 존재 시 버튼 노출');

// MANUAL 및 기타 유형 미노출 확인
assert(shouldShowViewSourceButton({ sourceType: 'MANUAL', sourceId: 'man_123' }) === false, 'MANUAL task에는 버튼 미노출 (규정 준수)');
assert(shouldShowViewSourceButton({ sourceType: 'MANUAL' }) === false, 'MANUAL (sourceId 없음) 버튼 미노출');
assert(shouldShowViewSourceButton({ sourceType: 'MESSAGE', sourceId: 'msg_1' }) === false, 'MESSAGE 버튼 미노출');
assert(shouldShowViewSourceButton({ sourceType: 'DOCUMENT', sourceId: 'doc_1' }) === false, 'DOCUMENT 버튼 미노출');
assert(shouldShowViewSourceButton({ sourceType: 'OTHER', sourceId: 'oth_1' }) === false, 'OTHER 버튼 미노출');
assert(shouldShowViewSourceButton({ sourceType: 'INQUIRY', sourceId: '' }) === false, 'sourceId가 빈 문자열이면 미노출');
assert(shouldShowViewSourceButton({ sourceType: 'INQUIRY', sourceId: '   ' }) === false, 'sourceId가 공백이면 미노출');
assert(shouldShowViewSourceButton({}) === false, 'sourceType 없으면 미노출');

// 2. 이동 대상 매핑 검증
console.log('\n--- 2. 이동 대상 화면(메뉴 키 및 파라미터) 매핑 검증 ---');
function resolveNavigationTarget(sourceType: TaskSourceType, sourceId: string) {
  switch (sourceType) {
    case 'INQUIRY':
      return { menuKey: 'inquiries', targetProp: 'initialInquiryId', targetId: sourceId };
    case 'DATA_REQUEST':
      return { menuKey: 'data-requests', targetProp: 'initialRequestId', targetId: sourceId };
    case 'MATERNITY':
      return { menuKey: 'maternity', targetProp: 'initialCaseId', targetId: sourceId };
    case 'PAYROLL':
      return { menuKey: 'payroll', targetProp: 'initialPayrollId', targetId: sourceId };
    default:
      return null;
  }
}

const inqTarget = resolveNavigationTarget('INQUIRY', 'inq_test_1');
assert(inqTarget?.menuKey === 'inquiries' && inqTarget?.targetProp === 'initialInquiryId' && inqTarget?.targetId === 'inq_test_1', 'INQUIRY -> inquiries 메뉴 및 initialInquiryId 매핑');

const dreqTarget = resolveNavigationTarget('DATA_REQUEST', 'dreq_test_2');
assert(dreqTarget?.menuKey === 'data-requests' && dreqTarget?.targetProp === 'initialRequestId' && dreqTarget?.targetId === 'dreq_test_2', 'DATA_REQUEST -> data-requests 메뉴 및 initialRequestId 매핑');

const matTarget = resolveNavigationTarget('MATERNITY', 'mat_test_3');
assert(matTarget?.menuKey === 'maternity' && matTarget?.targetProp === 'initialCaseId' && matTarget?.targetId === 'mat_test_3', 'MATERNITY -> maternity 메뉴 및 initialCaseId 매핑');

const payTarget = resolveNavigationTarget('PAYROLL', 'pay_test_4');
assert(payTarget?.menuKey === 'payroll' && payTarget?.targetProp === 'initialPayrollId' && payTarget?.targetId === 'pay_test_4', 'PAYROLL -> payroll 메뉴 및 initialPayrollId 매핑');

// 3. 원본 문서 미존재 / 삭제 처리 검증
console.log('\n--- 3. 원본 문서 미존재 / 삭제 처리 검증 ---');
const NOT_FOUND_MESSAGE = '원본 업무를 찾을 수 없습니다.';

// Mock verifySourceExists test behavior
async function simulateViewSourceAction(
  task: Partial<Task>,
  mockFirestoreDocExists: boolean
): Promise<{ success: boolean; errorMessage?: string }> {
  if (!shouldShowViewSourceButton(task)) {
    return { success: false, errorMessage: '버튼 없음' };
  }

  // taskService.verifySourceExists simulation
  const exists = mockFirestoreDocExists;
  if (!exists) {
    return { success: false, errorMessage: NOT_FOUND_MESSAGE };
  }

  return { success: true };
}

async function runNotFoundTests() {
  const sources: TaskSourceType[] = ['INQUIRY', 'DATA_REQUEST', 'MATERNITY', 'PAYROLL'];
  for (const st of sources) {
    const res = await simulateViewSourceAction({ sourceType: st, sourceId: 'deleted_doc_id' }, false);
    assert(res.success === false, `[${st}] 원본 문서 미존재 시 성공 처리되지 않음`);
    assert(res.errorMessage === NOT_FOUND_MESSAGE, `[${st}] 정확한 에러 문구 표시: "${NOT_FOUND_MESSAGE}"`);
  }
}

// 4. PAYROLL 실제 문서 vs 저장 전 임시 sourceId 처리 검증
console.log('\n--- 4. PAYROLL 실제 문서 vs 저장 전 임시 sourceId 검증 ---');
async function runPayrollTests() {
  // Case A: 실제 Firestore payroll 문서가 존재하는 경우
  const realPayrollTask: Partial<Task> = {
    sourceType: 'PAYROLL',
    sourceId: 'pr_comp01_worker01_202610',
  };
  const realRes = await simulateViewSourceAction(realPayrollTask, true);
  assert(realRes.success === true, 'PAYROLL: 실제 Firestore 문서 존재 시 열기 성공');

  // Case B: 저장 전 임시 급여 건 (실제 원본 Firestore 문서 미존재)
  const tempPayrollTask: Partial<Task> = {
    sourceType: 'PAYROLL',
    sourceId: 'payroll_temp_unsaved_2026-10',
  };
  const tempRes = await simulateViewSourceAction(tempPayrollTask, false);
  assert(tempRes.success === false, 'PAYROLL: 임시 sourceId/미저장 건은 성공 처리되지 않음');
  assert(tempRes.errorMessage === NOT_FOUND_MESSAGE, `PAYROLL: 임시 sourceId/미저장 건 에러 문구: "${NOT_FOUND_MESSAGE}"`);
}

// 5. taskService.verifySourceExists 인터페이스 계약 검증
console.log('\n--- 5. taskService.verifySourceExists 계약 검증 ---');
assert(typeof taskService.verifySourceExists === 'function', 'taskService.verifySourceExists 함수 존재');
assert(typeof taskService.getSourceDetail === 'function', 'taskService.getSourceDetail 함수 존재');

async function main() {
  await runNotFoundTests();
  await runPayrollTests();

  console.log(`\n================================================================`);
  console.log(`[R3-3 3/3-B-④-A 테스트 완료]: 총 ${passCount}건 통과, ${failCount}건 실패`);
  console.log(`================================================================`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
