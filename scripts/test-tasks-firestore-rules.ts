/**
 * [R3-3 3/3-C-①] tasks Firestore Security Rules 정밀 에뮬레이션 및 검증 테스트 러너
 */

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

interface AuthContext {
  uid: string;
  role: 'ADMIN' | 'COMPANY' | 'WORKER';
}

// -------------------------------------------------------------
// Emulate the exact evaluation semantics of firestore.rules
// -------------------------------------------------------------
function isAdmin(auth: AuthContext | null): boolean {
  return auth !== null && auth.role === 'ADMIN';
}

function isValidTaskPriority(priority: any): boolean {
  return ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority);
}

function isValidTaskStatus(status: any): boolean {
  return ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status);
}

function isValidTaskSourceType(sourceType: any): boolean {
  return [
    'MANUAL',
    'INQUIRY',
    'DATA_REQUEST',
    'MATERNITY',
    'PAYROLL',
    'MESSAGE',
    'DOCUMENT',
    'OTHER',
  ].includes(sourceType);
}

function isValidTaskSource(data: any): boolean {
  return data.sourceType === 'MANUAL'
    ? (!('sourceId' in data) || data.sourceId === null || data.sourceId === '')
    : ('sourceId' in data && typeof data.sourceId === 'string' && data.sourceId.length > 0);
}

function isValidTaskCompletedAt(data: any): boolean {
  return data.status === 'COMPLETED'
    ? (!('completedAt' in data) || (typeof data.completedAt === 'string' && data.completedAt.length > 0))
    : (!('completedAt' in data) || data.completedAt === null || data.completedAt === '');
}

function isValidTaskBaseFields(data: any): boolean {
  return (
    typeof data.title === 'string' &&
    data.title.length > 0 &&
    data.title.length <= 200 &&
    isValidTaskPriority(data.priority) &&
    isValidTaskStatus(data.status) &&
    isValidTaskSourceType(data.sourceType) &&
    isValidTaskSource(data) &&
    isValidTaskCompletedAt(data) &&
    typeof data.createdAt === 'string' &&
    data.createdAt.length > 0 &&
    typeof data.updatedAt === 'string' &&
    data.updatedAt.length > 0 &&
    typeof data.createdById === 'string' &&
    data.createdById.length > 0 &&
    typeof data.createdByName === 'string' &&
    data.createdByName.length > 0 &&
    typeof data.updatedById === 'string' &&
    data.updatedById.length > 0 &&
    typeof data.updatedByName === 'string' &&
    data.updatedByName.length > 0 &&
    (!('description' in data) || data.description === null || typeof data.description === 'string') &&
    (!('companyId' in data) || data.companyId === null || (typeof data.companyId === 'string' && data.companyId.length > 0)) &&
    (!('workerId' in data) || data.workerId === null || (typeof data.workerId === 'string' && data.workerId.length > 0)) &&
    (!('dueDate' in data) || data.dueDate === null || (typeof data.dueDate === 'string' && data.dueDate.length > 0))
  );
}

function evaluateRead(auth: AuthContext | null): boolean {
  return isAdmin(auth);
}

function evaluateCreate(auth: AuthContext | null, taskId: string, incomingData: any): boolean {
  return (
    isAdmin(auth) &&
    incomingData.id === taskId &&
    isValidTaskBaseFields(incomingData)
  );
}

function evaluateUpdate(auth: AuthContext | null, existingData: any, incomingData: any): boolean {
  return (
    isAdmin(auth) &&
    incomingData.id === existingData.id &&
    incomingData.createdAt === existingData.createdAt &&
    incomingData.createdById === existingData.createdById &&
    incomingData.createdByName === existingData.createdByName &&
    isValidTaskBaseFields(incomingData)
  );
}

function evaluateDelete(_auth: AuthContext | null): boolean {
  return false;
}

// -------------------------------------------------------------
// Test Suites
// -------------------------------------------------------------

console.log('================================================================');
console.log('[R3-3 3/3-C-①] tasks Firestore Security Rules 검증');
console.log('================================================================\n');

const adminUser: AuthContext = { uid: 'admin_1', role: 'ADMIN' };
const companyUser: AuthContext = { uid: 'comp_1', role: 'COMPANY' };
const workerUser: AuthContext = { uid: 'work_1', role: 'WORKER' };

const validTaskData = {
  id: 'task_001',
  title: '10월 정기 급여 검토',
  priority: 'HIGH',
  status: 'TODO',
  sourceType: 'MANUAL',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  createdById: 'admin_1',
  createdByName: '노무법인 관리자',
  updatedById: 'admin_1',
  updatedByName: '노무법인 관리자',
  companyId: 'comp_test',
  workerId: 'worker_test',
  dueDate: '2026-10-25',
};

// 1. 기본 권한 검증 (ADMIN / COMPANY / WORKER / 미로그인 / delete)
console.log('--- 1. [기본 권한] ADMIN 전용 및 타 역할 차단 검증 ---');
{
  // Read
  assert(evaluateRead(adminUser) === true, 'ADMIN: read 허용');
  assert(evaluateRead(companyUser) === false, 'COMPANY: read 차단 (DENIED)');
  assert(evaluateRead(workerUser) === false, 'WORKER: read 차단 (DENIED)');
  assert(evaluateRead(null) === false, '미로그인: read 차단 (DENIED)');

  // Create
  assert(evaluateCreate(adminUser, 'task_001', validTaskData) === true, 'ADMIN: 유효한 create 허용');
  assert(evaluateCreate(companyUser, 'task_001', validTaskData) === false, 'COMPANY: create 차단 (DENIED)');
  assert(evaluateCreate(workerUser, 'task_001', validTaskData) === false, 'WORKER: create 차단 (DENIED)');
  assert(evaluateCreate(null, 'task_001', validTaskData) === false, '미로그인: create 차단 (DENIED)');

  // Update
  assert(evaluateUpdate(adminUser, validTaskData, { ...validTaskData, status: 'IN_PROGRESS' }) === true, 'ADMIN: 유효한 update 허용');
  assert(evaluateUpdate(companyUser, validTaskData, { ...validTaskData, status: 'IN_PROGRESS' }) === false, 'COMPANY: update 차단 (DENIED)');
  assert(evaluateUpdate(workerUser, validTaskData, { ...validTaskData, status: 'IN_PROGRESS' }) === false, 'WORKER: update 차단 (DENIED)');
  assert(evaluateUpdate(null, validTaskData, { ...validTaskData, status: 'IN_PROGRESS' }) === false, '미로그인: update 차단 (DENIED)');

  // Delete
  assert(evaluateDelete(adminUser) === false, 'ADMIN 포함 모든 사용자: delete 영구 차단 (DENIED)');
  assert(evaluateDelete(companyUser) === false, 'COMPANY: delete 차단 (DENIED)');
  assert(evaluateDelete(workerUser) === false, 'WORKER: delete 차단 (DENIED)');
  assert(evaluateDelete(null) === false, '미로그인: delete 차단 (DENIED)');
}

// 2. create 검증: 필드 타입 및 필수 enum 검증
console.log('\n--- 2. [create 검증] 올바른 구조/타입/enum 강제 검증 ---');
{
  // title 검증
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, title: '' }) === false, '빈 문자열 title 차단');
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, title: 12345 }) === false, 'string이 아닌 title 차단');
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, title: 'a'.repeat(201) }) === false, '200자 초과 title 차단');
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, title: '정상 제목' }) === true, '유효한 title 승인');

  // priority 검증
  const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
  for (const p of validPriorities) {
    assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, priority: p }) === true, `유효한 priority(${p}) 승인`);
  }
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, priority: 'VERY_HIGH' }) === false, '잘못된 priority 차단');
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, priority: 1 }) === false, 'number 타입 priority 차단');

  // status 검증
  const validStatuses = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  for (const s of validStatuses) {
    const data = s === 'COMPLETED' ? { ...validTaskData, status: s, completedAt: '2026-10-10T12:00:00Z' } : { ...validTaskData, status: s };
    assert(evaluateCreate(adminUser, 'task_001', data) === true, `유효한 status(${s}) 승인`);
  }
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, status: 'DONE' }) === false, '잘못된 status 차단');

  // sourceType 검증
  const validSources = ['MANUAL', 'INQUIRY', 'DATA_REQUEST', 'MATERNITY', 'PAYROLL', 'MESSAGE', 'DOCUMENT', 'OTHER'];
  for (const st of validSources) {
    const data = st === 'MANUAL' ? { ...validTaskData, sourceType: st } : { ...validTaskData, sourceType: st, sourceId: 'src_100' };
    assert(evaluateCreate(adminUser, 'task_001', data) === true, `유효한 sourceType(${st}) 승인`);
  }
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, sourceType: 'UNKNOWN_SOURCE' }) === false, '잘못된 sourceType 차단');

  // id 일치 검증
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, id: 'task_999' }) === false, '문서 path id와 일치하지 않는 data.id 차단');
}

// 3. source 규칙 검증 (MANUAL vs Non-MANUAL)
console.log('\n--- 3. [source 규칙] MANUAL 및 비MANUAL 출처 정합성 검증 ---');
{
  // MANUAL 규칙: sourceId 없어야 함
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, sourceType: 'MANUAL', sourceId: 'inq_123' }) === false, 'MANUAL에 sourceId가 존재하면 차단 (규정 준수)');
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, sourceType: 'MANUAL', sourceId: '' }) === true, 'MANUAL에 빈 문자열 sourceId는 허용');
  assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, sourceType: 'MANUAL', sourceId: null }) === true, 'MANUAL에 null sourceId는 허용');
  const withoutSourceId = { ...validTaskData, sourceType: 'MANUAL' };
  delete (withoutSourceId as any).sourceId;
  assert(evaluateCreate(adminUser, 'task_001', withoutSourceId) === true, 'MANUAL에 sourceId 필드 미포함 시 정상 승인');

  // 비-MANUAL 규칙: 유효한 sourceId 필수
  const nonManualTypes = ['INQUIRY', 'DATA_REQUEST', 'MATERNITY', 'PAYROLL'];
  for (const st of nonManualTypes) {
    // sourceId 누락
    const missingSourceId = { ...validTaskData, sourceType: st };
    delete (missingSourceId as any).sourceId;
    assert(evaluateCreate(adminUser, 'task_001', missingSourceId) === false, `[${st}] sourceId 필드 누락 시 차단`);

    // sourceId 빈 문자열
    assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, sourceType: st, sourceId: '' }) === false, `[${st}] sourceId 빈 문자열 시 차단`);

    // sourceId 정상
    assert(evaluateCreate(adminUser, 'task_001', { ...validTaskData, sourceType: st, sourceId: `${st.toLowerCase()}_123` }) === true, `[${st}] 정상 sourceId 전달 시 승인`);
  }
}

// 4. update 보호 검증 (불변 필드 및 completedAt)
console.log('\n--- 4. [update 보호] 생성 메타데이터 불변 및 completedAt 검증 ---');
{
  // id 불변
  assert(evaluateUpdate(adminUser, validTaskData, { ...validTaskData, id: 'altered_id' }) === false, 'update 시 id 임의 변조 차단');

  // createdAt 불변
  assert(evaluateUpdate(adminUser, validTaskData, { ...validTaskData, createdAt: '2020-01-01T00:00:00Z' }) === false, 'update 시 createdAt 임의 변조 차단');

  // createdById 불변
  assert(evaluateUpdate(adminUser, validTaskData, { ...validTaskData, createdById: 'other_admin' }) === false, 'update 시 createdById 임의 변조 차단');

  // createdByName 불변
  assert(evaluateUpdate(adminUser, validTaskData, { ...validTaskData, createdByName: '해커' }) === false, 'update 시 createdByName 임의 변조 차단');

  // 정상 필드 수정 허용
  const normalUpdate = {
    ...validTaskData,
    title: '수정된 급여 검토 제목',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    description: '추가 코멘트 작성',
    dueDate: '2026-10-30',
    updatedAt: '2026-10-10T12:00:00Z',
    updatedById: 'admin_1',
    updatedByName: '노무법인 관리자',
  };
  assert(evaluateUpdate(adminUser, validTaskData, normalUpdate) === true, '정상 업무 내용/상태/마감일 수정 승인');

  // completedAt 검증: COMPLETED 전환 시
  const completeUpdate = {
    ...validTaskData,
    status: 'COMPLETED',
    completedAt: '2026-10-10T15:00:00Z',
    updatedAt: '2026-10-10T15:00:00Z',
  };
  assert(evaluateUpdate(adminUser, validTaskData, completeUpdate) === true, 'COMPLETED 전환 및 completedAt 기록 승인');

  // completedAt 검증: 재오픈 (IN_PROGRESS/TODO) 시 completedAt 제거
  const reopenUpdate = {
    ...completeUpdate,
    status: 'IN_PROGRESS',
    updatedAt: '2026-10-10T16:00:00Z',
  };
  delete (reopenUpdate as any).completedAt;
  assert(evaluateUpdate(adminUser, completeUpdate, reopenUpdate) === true, '재오픈 시 completedAt 제거(deleteField) 승인');

  // completedAt 검증: status가 TODO인데 completedAt이 남아있는 비정상 상태 차단
  const illegalReopen = {
    ...completeUpdate,
    status: 'TODO',
    completedAt: '2026-10-10T15:00:00Z',
  };
  assert(evaluateUpdate(adminUser, completeUpdate, illegalReopen) === false, 'status가 TODO인데 completedAt 문자열 유지 시 차단');
}

console.log(`\n================================================================`);
console.log(`[R3-3 3/3-C-① 테스트 완료]: 총 ${passCount}건 통과, ${failCount}건 실패`);
console.log(`================================================================`);

if (failCount > 0) {
  process.exit(1);
}
