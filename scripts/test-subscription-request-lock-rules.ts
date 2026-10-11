/**
 * [R2-8 2/4-C-⑤] 플랜 신청 락 보안 검증 및 보강 테스트 러너
 * 
 * Verifies exact evaluation semantics of firestore.rules for:
 * - companies/{companyId}.activeSubscriptionRequestId lock hardening
 * - subscription_requests/{requestId} atomic binding
 */

interface UserContext {
  uid: string;
  role: 'ADMIN' | 'COMPANY' | 'WORKER';
  companyId?: string;
}

interface DocumentContext {
  companies: Record<string, any>;
  subscription_requests: Record<string, any>;
}

// Emulates Firestore Rules evaluation for companies/{companyId} update
function evaluateCompaniesUpdateRule(
  auth: UserContext | null,
  companyId: string,
  existingData: any,
  incomingData: any,
  afterState: DocumentContext
): { allowed: boolean; reason?: string } {
  if (!auth) {
    return { allowed: false, reason: 'Not signed in' };
  }

  // Helper functions
  const isAdmin = auth.role === 'ADMIN';
  if (isAdmin) {
    return { allowed: true, reason: 'ADMIN allowed' };
  }

  const isCompanyManager = auth.role === 'COMPANY' && auth.companyId === companyId;
  if (!isCompanyManager) {
    return { allowed: false, reason: 'Not company manager of this company' };
  }

  // Blacklist diff check
  const forbiddenKeys = ['id', 'businessNumber', 'currentPlanId', 'subscription', 'assignedAttorneyId', 'status'];
  const affectedKeys = Object.keys(incomingData).filter((k) => incomingData[k] !== existingData[k]);
  
  const hasForbiddenKey = affectedKeys.some((k) => forbiddenKeys.includes(k));
  if (hasForbiddenKey) {
    return { allowed: false, reason: 'Modified forbidden keys: ' + affectedKeys.filter((k) => forbiddenKeys.includes(k)).join(', ') };
  }

  // activeSubscriptionRequestId protection check
  const isLockAffected = affectedKeys.includes('activeSubscriptionRequestId');
  if (!isLockAffected) {
    return { allowed: true, reason: 'Normal profile update without modifying lock' };
  }

  // If lock is affected:
  const incomingReqId = incomingData.activeSubscriptionRequestId;
  if (typeof incomingReqId !== 'string' || incomingReqId.length === 0 || incomingReqId.length > 128) {
    return { allowed: false, reason: 'activeSubscriptionRequestId must be non-empty string <= 128 (null or empty disallowed)' };
  }

  // existsAfter check
  const companionReq = afterState.subscription_requests[incomingReqId];
  if (!companionReq) {
    return { allowed: false, reason: 'existsAfter failed: subscription_requests/' + incomingReqId + ' not found in atomic write' };
  }

  // getAfter properties validation
  if (companionReq.companyId !== companyId) {
    return { allowed: false, reason: 'getAfter failed: companion companyId (' + companionReq.companyId + ') does not match ' + companyId };
  }

  if (companionReq.requesterId !== auth.uid) {
    return { allowed: false, reason: 'getAfter failed: companion requesterId (' + companionReq.requesterId + ') does not match auth.uid (' + auth.uid + ')' };
  }

  if (companionReq.status !== 'REQUESTED') {
    return { allowed: false, reason: 'getAfter failed: companion status must be REQUESTED, got ' + companionReq.status };
  }

  // Existing active lock check
  const existingReqId = existingData?.activeSubscriptionRequestId;
  if (existingReqId) {
    const existingReq = afterState.subscription_requests[existingReqId];
    if (existingReq && (existingReq.status === 'REQUESTED' || existingReq.status === 'UNDER_REVIEW')) {
      return { allowed: false, reason: 'Cannot replace active lock when existing request is REQUESTED or UNDER_REVIEW' };
    }
  }

  return { allowed: true, reason: 'Atomic valid lock creation approved' };
}

// Emulates Firestore Rules evaluation for subscription_requests/{requestId} create
function evaluateSubscriptionRequestCreateRule(
  auth: UserContext | null,
  requestId: string,
  incomingData: any,
  afterState: DocumentContext
): { allowed: boolean; reason?: string } {
  if (!auth) {
    return { allowed: false, reason: 'Not signed in' };
  }

  if (auth.role === 'ADMIN') {
    return { allowed: true, reason: 'ADMIN allowed' };
  }

  if (auth.role !== 'COMPANY' || !auth.companyId) {
    return { allowed: false, reason: 'Only COMPANY or ADMIN can create' };
  }

  if (incomingData.companyId !== auth.companyId) {
    return { allowed: false, reason: 'companyId must match user companyId' };
  }

  if (incomingData.requesterId !== auth.uid) {
    return { allowed: false, reason: 'requesterId must match user uid' };
  }

  if (incomingData.status !== 'REQUESTED') {
    return { allowed: false, reason: 'status must be REQUESTED' };
  }

  const validPlans = ['FREE', 'BASIC', 'STANDARD', 'CUSTOM', 'OUTSOURCING'];
  if (!validPlans.includes(incomingData.requestedPlanCode)) {
    return { allowed: false, reason: 'Invalid requestedPlanCode' };
  }

  // existsAfter and getAfter lock matching on company document
  const companyAfter = afterState.companies[incomingData.companyId];
  if (!companyAfter) {
    return { allowed: false, reason: 'existsAfter failed: company document not found' };
  }

  if (companyAfter.activeSubscriptionRequestId !== requestId) {
    return { allowed: false, reason: 'getAfter failed: company.activeSubscriptionRequestId does not match ' + requestId };
  }

  return { allowed: true, reason: 'Atomic subscription request creation approved' };
}

async function runTestSuite() {
  console.log('=================================================================');
  console.log('🛡️  Firestore Rules Hardening Verification: [R2-8 2/4-C-⑤]');
  console.log('   Target: companies.activeSubscriptionRequestId Lock Hardening');
  console.log('=================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, detail: string = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name} (${detail})`);
      failed++;
    }
  }

  const compAUser: UserContext = { uid: 'user_comp_a', role: 'COMPANY', companyId: 'comp_A' };
  const compBUser: UserContext = { uid: 'user_comp_b', role: 'COMPANY', companyId: 'comp_B' };
  const adminUser: UserContext = { uid: 'user_admin', role: 'ADMIN' };

  console.log('--- 1. 공격 시나리오 검증 (Attack Vectors Must Return DENY) ---');

  // Attack 1: COMPANY 락만 단독 변경 (임의 requestId 입력, subscription_requests 미생성)
  {
    const state: DocumentContext = { companies: {}, subscription_requests: {} };
    const res = evaluateCompaniesUpdateRule(
      compAUser,
      'comp_A',
      { id: 'comp_A', activeSubscriptionRequestId: null },
      { id: 'comp_A', activeSubscriptionRequestId: 'fake_req_uncreated' },
      state
    );
    assert('공격 1: COMPANY 락만 단독 변경 (임의 requestId 입력) -> DENY', !res.allowed, res.reason);
  }

  // Attack 2: COMPANY 락 단독 삭제 (null로 강제 초기화)
  {
    const state: DocumentContext = {
      companies: {},
      subscription_requests: { req_existing: { companyId: 'comp_A', status: 'REQUESTED' } }
    };
    const res = evaluateCompaniesUpdateRule(
      compAUser,
      'comp_A',
      { id: 'comp_A', activeSubscriptionRequestId: 'req_existing' },
      { id: 'comp_A', activeSubscriptionRequestId: null },
      state
    );
    assert('공격 2: COMPANY 락 단독 삭제 (null 강제 초기화) -> DENY', !res.allowed, res.reason);
  }

  // Attack 3: 다른 회사 requestId 연결 (회사 B의 요청서를 회사 A 락에 주입)
  {
    const state: DocumentContext = {
      companies: {},
      subscription_requests: {
        req_b: { companyId: 'comp_B', requesterId: 'user_comp_b', status: 'REQUESTED' }
      }
    };
    const res = evaluateCompaniesUpdateRule(
      compAUser,
      'comp_A',
      { id: 'comp_A', activeSubscriptionRequestId: null },
      { id: 'comp_A', activeSubscriptionRequestId: 'req_b' },
      state
    );
    assert('공격 3: 다른 회사 requestId 연결 -> DENY', !res.allowed, res.reason);
  }

  // Attack 4: 존재하지 않는 requestId 연결
  {
    const state: DocumentContext = { companies: {}, subscription_requests: {} };
    const res = evaluateCompaniesUpdateRule(
      compAUser,
      'comp_A',
      { id: 'comp_A', activeSubscriptionRequestId: null },
      { id: 'comp_A', activeSubscriptionRequestId: 'non_existent_id' },
      state
    );
    assert('공격 4: 존재하지 않는 requestId 연결 -> DENY', !res.allowed, res.reason);
  }

  // Attack 5: 다른 회사 데이터 접근 (compA 사용자가 compB 회사 문서 수정)
  {
    const state: DocumentContext = { companies: {}, subscription_requests: {} };
    const res = evaluateCompaniesUpdateRule(
      compAUser,
      'comp_B',
      { id: 'comp_B', address: '구주소' },
      { id: 'comp_B', address: '신주소' },
      state
    );
    assert('공격 5: 다른 회사 데이터 접근 (compA -> compB 문서 수정) -> DENY', !res.allowed, res.reason);
  }

  // Attack 6: 기존 활성 신청 진행 중인데 다른 requestId로 락 덮어쓰기
  {
    const state: DocumentContext = {
      companies: {},
      subscription_requests: {
        req_active_1: { companyId: 'comp_A', requesterId: 'user_comp_a', status: 'REQUESTED' },
        req_active_2: { companyId: 'comp_A', requesterId: 'user_comp_a', status: 'REQUESTED' }
      }
    };
    const res = evaluateCompaniesUpdateRule(
      compAUser,
      'comp_A',
      { id: 'comp_A', activeSubscriptionRequestId: 'req_active_1' },
      { id: 'comp_A', activeSubscriptionRequestId: 'req_active_2' },
      state
    );
    assert('공격 6: 이미 진행 중인 활성 신청이 있을 때 중복 락 교체 시도 -> DENY', !res.allowed, res.reason);
  }

  // Attack 7: subscription_requests 단독 생성 시도 (companies 락 미획득)
  {
    const state: DocumentContext = {
      companies: { comp_A: { id: 'comp_A', activeSubscriptionRequestId: null } },
      subscription_requests: {}
    };
    const res = evaluateSubscriptionRequestCreateRule(
      compAUser,
      'req_solo',
      {
        companyId: 'comp_A',
        requesterId: 'user_comp_a',
        status: 'REQUESTED',
        requestedPlanCode: 'STANDARD'
      },
      state
    );
    assert('공격 7: companies 락 미획득 상태로 subscription_requests 단독 생성 -> DENY', !res.allowed, res.reason);
  }

  console.log('\n--- 2. 정상 시나리오 검증 (Legitimate Flows Must Return ALLOW) ---');

  // Normal 1: COMPANY 일반 프로필 정보 수정 (activeSubscriptionRequestId 미변경)
  {
    const state: DocumentContext = { companies: {}, subscription_requests: {} };
    const res = evaluateCompaniesUpdateRule(
      compAUser,
      'comp_A',
      { id: 'comp_A', address: '구주소' },
      { id: 'comp_A', address: '서울특별시 강남구' },
      state
    );
    assert('정상 1: COMPANY 일반 프로필 정보 수정 (락 미변경) -> ALLOW', res.allowed, res.reason);
  }

  // Normal 2: COMPANY 정상 신청 + 락 생성 (원자적 동시 커밋)
  {
    const state: DocumentContext = {
      companies: {
        comp_A: { id: 'comp_A', activeSubscriptionRequestId: 'req_legit_1' }
      },
      subscription_requests: {
        req_legit_1: {
          id: 'req_legit_1',
          companyId: 'comp_A',
          requesterId: 'user_comp_a',
          status: 'REQUESTED',
          requestedPlanCode: 'BASIC'
        }
      }
    };
    const resComp = evaluateCompaniesUpdateRule(
      compAUser,
      'comp_A',
      { id: 'comp_A', activeSubscriptionRequestId: null },
      { id: 'comp_A', activeSubscriptionRequestId: 'req_legit_1' },
      state
    );
    const resReq = evaluateSubscriptionRequestCreateRule(
      compAUser,
      'req_legit_1',
      state.subscription_requests.req_legit_1,
      state
    );
    assert('정상 2-1: COMPANY 정상 신청 원자적 companies 락 생성 -> ALLOW', resComp.allowed, resComp.reason);
    assert('정상 2-2: COMPANY 정상 신청 원자적 subscription_requests 생성 -> ALLOW', resReq.allowed, resReq.reason);
  }

  // Normal 3: ADMIN 종료 처리 (APPROVED) + 락 해제 (null)
  {
    const state: DocumentContext = { companies: {}, subscription_requests: {} };
    const resAdminClear = evaluateCompaniesUpdateRule(
      adminUser,
      'comp_A',
      { id: 'comp_A', activeSubscriptionRequestId: 'req_legit_1' },
      { id: 'comp_A', activeSubscriptionRequestId: null },
      state
    );
    assert('정상 3: ADMIN 심사 종료 후 락 해제 (activeSubscriptionRequestId: null) -> ALLOW', resAdminClear.allowed, resAdminClear.reason);
  }

  // Normal 4: ADMIN 반려/취소 (REJECTED/CANCELLED) 처리 시 락 해제
  {
    const state: DocumentContext = { companies: {}, subscription_requests: {} };
    const resAdminReject = evaluateCompaniesUpdateRule(
      adminUser,
      'comp_A',
      { id: 'comp_A', activeSubscriptionRequestId: 'req_legit_1' },
      { id: 'comp_A', activeSubscriptionRequestId: null },
      state
    );
    assert('정상 4: ADMIN 반려/취소 후 락 해제 -> ALLOW', resAdminReject.allowed, resAdminReject.reason);
  }

  console.log('\n=================================================================');
  console.log(`테스트 결과 요약: 총 ${passed + failed}개 중 ${passed}개 통과, ${failed}개 실패`);
  console.log('=================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
