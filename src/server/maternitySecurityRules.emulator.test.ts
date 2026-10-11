/**
 * [R2-8 2/4-A-⑥-5] 모성보호 차감 정보 보안 강화 - Firebase Emulator 보안 규칙 통합 검증 스위트
 * 
 * 검증 대상 컬렉션:
 * - /maternity_cases/{caseId}
 * - /maternity_deductions/{deductionId}
 * 
 * 4대 핵심 검증 카테고리:
 * 1. 보호 필드 직접 조작 차단 (Deduction & Restoration Protected Field Tampering Blocked)
 * 2. 정상 업무 필드 수정 및 등록 허용 (Legitimate Business Workflows Allowed)
 * 3. 타 기업 데이터 격리 및 미승인 사용자 차단 (Tenant Isolation & Authorization Guards)
 * 4. 기존 업무 기능 회귀 검증 (Regression Verification on Existing Policies)
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-test';
if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const adminDb = getFirestore();
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';

interface TestStats {
  passed: number;
  failed: number;
  total: number;
}
const stats: TestStats = { passed: 0, failed: 0, total: 0 };

function createToken(payload: Record<string, any>): string {
  const tokenPayload = {
    sub: payload.uid,
    user_id: payload.uid,
    ...payload,
  };
  return `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')}.`;
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (typeof v === 'number') {
      fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (Array.isArray(v)) {
      fields[k] = { values: v.map((item) => toFirestoreFields({ item }).item) };
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

async function restRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options?: {
    token?: string;
    body?: any;
    updateMask?: string[];
  }
): Promise<{ status: number; data?: any }> {
  let url = `http://${HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  if (options?.updateMask && options.updateMask.length > 0) {
    const maskParams = options.updateMask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&');
    url += (url.includes('?') ? '&' : '?') + maskParams;
  }

  const headers: Record<string, string> = {};
  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  return { status: res.status, data };
}

function assert(condition: boolean, testName: string, detail?: string) {
  stats.total++;
  if (condition) {
    stats.passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    stats.failed++;
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function seedInitialFixtures() {
  console.log('\n--- [Setup] Fixtures Seeding via Admin SDK ---');

  // 1. Users & Admins
  await adminDb.doc('users/admin_user').set({
    uid: 'admin_user',
    email: 'admin@firm.com',
    role: 'ADMIN',
    isAdmin: true,
  });
  await adminDb.doc('admins/admin_user').set({
    uid: 'admin_user',
  });

  await adminDb.doc('users/comp_a_user').set({
    uid: 'comp_a_user',
    email: 'hr@company-a.com',
    role: 'COMPANY',
    companyId: 'company_a',
  });

  await adminDb.doc('users/comp_b_user').set({
    uid: 'comp_b_user',
    email: 'hr@company-b.com',
    role: 'COMPANY',
    companyId: 'company_b',
  });

  await adminDb.doc('users/worker_active').set({
    uid: 'worker_active',
    email: 'worker@company-a.com',
    role: 'WORKER',
    membershipStatus: 'ACTIVE',
    employeeId: 'emp_a_01',
    companyId: 'company_a',
  });

  await adminDb.doc('users/worker_pending').set({
    uid: 'worker_pending',
    email: 'pending@company-a.com',
    role: 'WORKER',
    membershipStatus: 'PENDING_COMPANY_VERIFICATION',
    employeeId: 'emp_a_02',
    companyId: 'company_a',
  });

  // 2. Initial Maternity Cases
  // Case A1: Company A, with deductionInfo already attached (server-deducted)
  await adminDb.doc('maternity_cases/case_a1').set({
    id: 'case_a1',
    companyId: 'company_a',
    employeeId: 'emp_a_01',
    status: 'APPLIED',
    workType: 'MATERNITY_LEAVE',
    applicationDate: '2026-10-01',
    startDate: '2026-10-10',
    endDate: '2026-11-10',
    createdById: 'comp_a_user',
    updatedById: 'comp_a_user',
    deductionInfo: {
      deductionId: 'deduct_a1_001',
      source: 'MONTHLY_FREE',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T09:00:00.000Z',
    },
  });

  // Case A2: Company A, currently in SUPPLEMENT_REQUESTED state
  await adminDb.doc('maternity_cases/case_a2').set({
    id: 'case_a2',
    companyId: 'company_a',
    employeeId: 'emp_a_01',
    status: 'SUPPLEMENT_REQUESTED',
    workType: 'CHILDCARE_LEAVE',
    applicationDate: '2026-10-02',
    startDate: '2026-10-15',
    endDate: '2026-12-15',
    createdById: 'comp_a_user',
    updatedById: 'admin_user',
    deductionInfo: {
      deductionId: 'deduct_a2_001',
      source: 'PREPAID_TICKET',
      yearMonth: '2026-10',
      deductedAt: '2026-10-02T09:00:00.000Z',
    },
  });

  // Case A3: Company A, COMPLETED status
  await adminDb.doc('maternity_cases/case_a3').set({
    id: 'case_a3',
    companyId: 'company_a',
    employeeId: 'emp_a_01',
    status: 'COMPLETED',
    workType: 'MATERNITY_LEAVE',
    applicationDate: '2026-09-01',
    startDate: '2026-09-10',
    endDate: '2026-10-10',
    createdById: 'comp_a_user',
    updatedById: 'admin_user',
    deductionInfo: {
      deductionId: 'deduct_a3_001',
      source: 'MONTHLY_FREE',
      yearMonth: '2026-09',
      deductedAt: '2026-09-01T09:00:00.000Z',
    },
  });

  // 3. Maternity Deductions Ledger
  await adminDb.doc('maternity_deductions/deduct_a1_001').set({
    id: 'deduct_a1_001',
    deductionId: 'deduct_a1_001',
    companyId: 'company_a',
    maternityCaseId: 'case_a1',
    source: 'MONTHLY_FREE',
    quantity: 1,
    status: 'DEDUCTED',
    yearMonth: '2026-10',
    deductedAt: '2026-10-01T09:00:00.000Z',
    actorUid: 'comp_a_user',
    actorRole: 'COMPANY',
    idempotencyKey: 'company_a_case_a1_MONTHLY_FREE',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  });

  console.log('Fixtures seeded successfully.');
}

async function runTestSuite() {
  await seedInitialFixtures();

  const tokenAdmin = createToken({ uid: 'admin_user' });
  const tokenCompA = createToken({ uid: 'comp_a_user' });
  const tokenCompB = createToken({ uid: 'comp_b_user' });
  const tokenWorkerActive = createToken({ uid: 'worker_active' });
  const tokenWorkerPending = createToken({ uid: 'worker_pending' });

  console.log('\n======================================================');
  console.log('Category 1: 보호 필드 직접 조작 차단 (Protected Field Direct Tampering Blocked)');
  console.log('======================================================');

  // 1.1 COMPANY 생성 시 deductionInfo 포함 차단
  {
    const res = await restRequest('POST', 'maternity_cases?documentId=case_fail_comp', {
      token: tokenCompA,
      body: {
        fields: toFirestoreFields({
          id: 'case_fail_comp',
          companyId: 'company_a',
          employeeId: 'emp_a_01',
          workType: 'MATERNITY_LEAVE',
          status: 'APPLIED',
          deductionInfo: {
            deductionId: 'fake_deduct_01',
            source: 'MONTHLY_FREE',
            yearMonth: '2026-10',
          },
        }),
      },
    });
    assert(res.status === 403, '1.1 COMPANY 생성 시 deductionInfo 포함 시도시 차단 (403)');
  }

  // 1.2 WORKER 생성 시 deductionInfo 포함 차단
  {
    const res = await restRequest('POST', 'maternity_cases?documentId=case_fail_worker', {
      token: tokenWorkerActive,
      body: {
        fields: toFirestoreFields({
          id: 'case_fail_worker',
          companyId: 'company_a',
          employeeId: 'emp_a_01',
          createdById: 'worker_active',
          workType: 'MATERNITY_LEAVE',
          status: 'APPLIED',
          deductionInfo: {
            deductionId: 'fake_deduct_02',
            source: 'MONTHLY_FREE',
            yearMonth: '2026-10',
          },
        }),
      },
    });
    assert(res.status === 403, '1.2 WORKER 생성 시 deductionInfo 포함 시도시 차단 (403)');
  }

  // 1.3 ADMIN 클라이언트 생성 시 deductionInfo 포함 차단
  {
    const res = await restRequest('POST', 'maternity_cases?documentId=case_fail_admin', {
      token: tokenAdmin,
      body: {
        fields: toFirestoreFields({
          id: 'case_fail_admin',
          companyId: 'company_a',
          employeeId: 'emp_a_01',
          workType: 'MATERNITY_LEAVE',
          status: 'APPLIED',
          deductionInfo: {
            deductionId: 'fake_deduct_03',
            source: 'PREPAID_TICKET',
            yearMonth: '2026-10',
          },
        }),
      },
    });
    assert(res.status === 403, '1.3 ADMIN 클라이언트 생성 시 deductionInfo 포함 시도시 차단 (403)');
  }

  // 1.4 COMPANY 기존 사건의 deductionInfo 값 임의 수정 차단
  {
    const res = await restRequest('PATCH', 'maternity_cases/case_a1', {
      token: tokenCompA,
      updateMask: ['deductionInfo'],
      body: {
        fields: toFirestoreFields({
          deductionInfo: {
            deductionId: 'deduct_a1_001',
            source: 'PREPAID_TICKET', // 변조 시도
            yearMonth: '2026-10',
            deductedAt: '2026-10-01T09:00:00.000Z',
          },
        }),
      },
    });
    assert(res.status === 403, '1.4 COMPANY 기존 사건의 deductionInfo 임의 변조 시도시 차단 (403)');
  }

  // 1.5 COMPANY 기존 사건의 deductionInfo 삭제 차단
  {
    const res = await restRequest('PATCH', 'maternity_cases/case_a1', {
      token: tokenCompA,
      updateMask: ['deductionInfo'],
      body: {
        fields: {
          deductionInfo: { nullValue: null },
        },
      },
    });
    assert(res.status === 403, '1.5 COMPANY 기존 사건의 deductionInfo 필드 삭제 시도시 차단 (403)');
  }

  // 1.6 ADMIN 클라이언트에서 deductionInfo 임의 수정 차단 (서버 트랜잭션 전용 보호)
  {
    const res = await restRequest('PATCH', 'maternity_cases/case_a1', {
      token: tokenAdmin,
      updateMask: ['deductionInfo'],
      body: {
        fields: toFirestoreFields({
          deductionInfo: {
            deductionId: 'deduct_a1_001',
            source: 'PREPAID_TICKET',
            yearMonth: '2026-10',
            deductedAt: '2026-10-01T09:00:00.000Z',
          },
        }),
      },
    });
    assert(res.status === 403, '1.6 ADMIN 클라이언트에서 deductionInfo 임의 변조 시도시 차단 (403)');
  }

  // 1.7 WORKER의 모성보호 사건 수정 직접 시도 전면 차단
  {
    const res = await restRequest('PATCH', 'maternity_cases/case_a1', {
      token: tokenWorkerActive,
      updateMask: ['status'],
      body: {
        fields: toFirestoreFields({
          status: 'UNDER_REVIEW',
        }),
      },
    });
    assert(res.status === 403, '1.7 WORKER의 모성보호 사건 수정(PATCH) 직접 시도 전면 차단 (403)');
  }

  // 1.8 maternity_deductions 원장 컬렉션 클라이언트 직접 생성 차단
  {
    const res = await restRequest('POST', 'maternity_deductions?documentId=deduct_direct_write', {
      token: tokenCompA,
      body: {
        fields: toFirestoreFields({
          id: 'deduct_direct_write',
          companyId: 'company_a',
          source: 'MONTHLY_FREE',
          quantity: 1,
        }),
      },
    });
    assert(res.status === 403, '1.8 maternity_deductions 원장 클라이언트 직접 생성(create) 차단 (403)');
  }

  // 1.9 maternity_deductions 원장 컬렉션 클라이언트 직접 수정 차단
  {
    const res = await restRequest('PATCH', 'maternity_deductions/deduct_a1_001', {
      token: tokenAdmin,
      updateMask: ['status'],
      body: {
        fields: toFirestoreFields({
          status: 'RESTORED',
        }),
      },
    });
    assert(res.status === 403, '1.9 maternity_deductions 원장 클라이언트 직접 수정(update) 차단 (403)');
  }

  // 1.10 maternity_deductions 원장 컬렉션 클라이언트 직접 삭제 차단
  {
    const res = await restRequest('DELETE', 'maternity_deductions/deduct_a1_001', {
      token: tokenAdmin,
    });
    assert(res.status === 403, '1.10 maternity_deductions 원장 클라이언트 직접 삭제(delete) 차단 (403)');
  }

  console.log('\n======================================================');
  console.log('Category 2: 정상 업무 필드 수정 및 등록 허용 (Legitimate Business Workflows)');
  console.log('======================================================');

  // 2.1 COMPANY 정상 사건 등록 허용 (deductionInfo 미포함)
  {
    const res = await restRequest('POST', 'maternity_cases?documentId=case_comp_legit_01', {
      token: tokenCompA,
      body: {
        fields: toFirestoreFields({
          id: 'case_comp_legit_01',
          companyId: 'company_a',
          employeeId: 'emp_a_01',
          workType: 'MATERNITY_LEAVE',
          applicationDate: '2026-10-05',
          startDate: '2026-10-15',
          endDate: '2026-11-15',
          status: 'APPLIED',
          createdById: 'comp_a_user',
          updatedById: 'comp_a_user',
        }),
      },
    });
    assert(res.status === 200, '2.1 COMPANY 정상 사건 등록(create) 허용 (200)');
  }

  // 2.2 ACTIVE WORKER 본인 사건 등록 허용 (deductionInfo 미포함)
  {
    const res = await restRequest('POST', 'maternity_cases?documentId=case_worker_legit_01', {
      token: tokenWorkerActive,
      body: {
        fields: toFirestoreFields({
          id: 'case_worker_legit_01',
          companyId: 'company_a',
          employeeId: 'emp_a_01',
          workType: 'MATERNITY_LEAVE',
          applicationDate: '2026-10-05',
          startDate: '2026-10-15',
          endDate: '2026-11-15',
          status: 'APPLIED',
          createdById: 'worker_active',
          updatedById: 'worker_active',
        }),
      },
    });
    assert(res.status === 200, '2.2 ACTIVE WORKER 본인 사건 등록(create) 허용 (200)');
  }

  // 2.3 ADMIN 정상 사건 등록 허용 (deductionInfo 미포함)
  {
    const res = await restRequest('POST', 'maternity_cases?documentId=case_admin_legit_01', {
      token: tokenAdmin,
      body: {
        fields: toFirestoreFields({
          id: 'case_admin_legit_01',
          companyId: 'company_a',
          employeeId: 'emp_a_01',
          workType: 'MATERNITY_LEAVE',
          applicationDate: '2026-10-05',
          startDate: '2026-10-15',
          endDate: '2026-11-15',
          status: 'APPLIED',
          createdById: 'admin_user',
          updatedById: 'admin_user',
        }),
      },
    });
    assert(res.status === 200, '2.3 ADMIN 정상 사건 등록(create) 허용 (200)');
  }

  // 2.4 ADMIN 정상 업무 필드 수정 허용 (status 변경: APPLIED -> UNDER_REVIEW)
  {
    const res = await restRequest('PATCH', 'maternity_cases/case_a1', {
      token: tokenAdmin,
      updateMask: ['status', 'assignedAttorneyId'],
      body: {
        fields: toFirestoreFields({
          status: 'UNDER_REVIEW',
          assignedAttorneyId: 'attorney_01',
        }),
      },
    });
    assert(res.status === 200, '2.4 ADMIN 상태 변경 및 노무사 배정 수정 허용 (200)');
  }

  // 2.5 COMPANY 보완요청 후 재검토 상태 전이 허용 (SUPPLEMENT_REQUESTED -> UNDER_REVIEW)
  {
    const res = await restRequest('PATCH', 'maternity_cases/case_a2', {
      token: tokenCompA,
      updateMask: ['status'],
      body: {
        fields: toFirestoreFields({
          status: 'UNDER_REVIEW',
        }),
      },
    });
    assert(res.status === 200, '2.5 COMPANY 보완요청 후 재검토 상태 전이 허용 (200)');
  }

  // 2.6 COMPANY 자사 사건 정상 단건 조회 허용
  {
    const res = await restRequest('GET', 'maternity_cases/case_a1', {
      token: tokenCompA,
    });
    assert(res.status === 200, '2.6 COMPANY 자사 사건 단건 조회(GET) 허용 (200)');
  }

  // 2.7 ACTIVE WORKER 본인 사건 단건 조회 허용
  {
    const res = await restRequest('GET', 'maternity_cases/case_a1', {
      token: tokenWorkerActive,
    });
    assert(res.status === 200, '2.7 ACTIVE WORKER 본인 사건 단건 조회(GET) 허용 (200)');
  }

  // 2.8 ADMIN 전체 사건 단건 조회 허용
  {
    const res = await restRequest('GET', 'maternity_cases/case_a1', {
      token: tokenAdmin,
    });
    assert(res.status === 200, '2.8 ADMIN 전체 사건 단건 조회(GET) 허용 (200)');
  }

  // 2.9 COMPANY 자사 maternity_deductions 원장 조회 허용
  {
    const res = await restRequest('GET', 'maternity_deductions/deduct_a1_001', {
      token: tokenCompA,
    });
    assert(res.status === 200, '2.9 COMPANY 자사 차감 원장 조회(GET) 허용 (200)');
  }

  // 2.10 ADMIN 전체 maternity_deductions 원장 조회 허용
  {
    const res = await restRequest('GET', 'maternity_deductions/deduct_a1_001', {
      token: tokenAdmin,
    });
    assert(res.status === 200, '2.10 ADMIN 전체 차감 원장 조회(GET) 허용 (200)');
  }

  console.log('\n======================================================');
  console.log('Category 3: 타 기업 데이터 격리 및 미승인 사용자 차단 (Tenant Isolation & Authorization)');
  console.log('======================================================');

  // 3.1 COMPANY B의 타사(COMPANY A) 사건 조회 차단
  {
    const res = await restRequest('GET', 'maternity_cases/case_a1', {
      token: tokenCompB,
    });
    assert(res.status === 403, '3.1 COMPANY B의 COMPANY A 사건 조회 차단 (403)');
  }

  // 3.2 COMPANY B의 타사(COMPANY A) 사건 수정 차단
  {
    const res = await restRequest('PATCH', 'maternity_cases/case_a1', {
      token: tokenCompB,
      updateMask: ['startDate'],
      body: {
        fields: toFirestoreFields({
          startDate: '2026-10-20',
        }),
      },
    });
    assert(res.status === 403, '3.2 COMPANY B의 COMPANY A 사건 수정 차단 (403)');
  }

  // 3.3 COMPANY B의 타사(COMPANY A) 차감 원장 조회 차단
  {
    const res = await restRequest('GET', 'maternity_deductions/deduct_a1_001', {
      token: tokenCompB,
    });
    assert(res.status === 403, '3.3 COMPANY B의 COMPANY A 차감 원장 조회 차단 (403)');
  }

  // 3.4 WORKER의 maternity_deductions 원장 조회 차단 (원장은 기업/관리자 전용)
  {
    const res = await restRequest('GET', 'maternity_deductions/deduct_a1_001', {
      token: tokenWorkerActive,
    });
    assert(res.status === 403, '3.4 WORKER의 maternity_deductions 원장 조회 차단 (403)');
  }

  // 3.5 비로그인 사용자의 maternity_cases 조회 차단
  {
    const res = await restRequest('GET', 'maternity_cases/case_a1');
    assert(res.status === 403, '3.5 비로그인 사용자의 maternity_cases 조회 차단 (403)');
  }

  // 3.6 비로그인 사용자의 maternity_deductions 조회 차단
  {
    const res = await restRequest('GET', 'maternity_deductions/deduct_a1_001');
    assert(res.status === 403, '3.6 비로그인 사용자의 maternity_deductions 조회 차단 (403)');
  }

  console.log('\n======================================================');
  console.log('Category 4: 기존 기능 회귀 검증 (Regression Verification)');
  console.log('======================================================');

  // 4.1 PENDING 근로자의 모성보호 사건 조회 차단
  {
    const res = await restRequest('GET', 'maternity_cases/case_a1', {
      token: tokenWorkerPending,
    });
    assert(res.status === 403, '4.1 PENDING_COMPANY_VERIFICATION 근로자 사건 조회 차단 (403)');
  }

  // 4.2 PENDING 근로자의 모성보호 사건 생성 차단
  {
    const res = await restRequest('POST', 'maternity_cases?documentId=case_worker_pending_01', {
      token: tokenWorkerPending,
      body: {
        fields: toFirestoreFields({
          id: 'case_worker_pending_01',
          companyId: 'company_a',
          employeeId: 'emp_a_02',
          workType: 'MATERNITY_LEAVE',
          applicationDate: '2026-10-05',
          startDate: '2026-10-15',
          endDate: '2026-11-15',
          status: 'APPLIED',
          createdById: 'worker_pending',
        }),
      },
    });
    assert(res.status === 403, '4.2 PENDING_COMPANY_VERIFICATION 근로자 사건 등록 차단 (403)');
  }

  // 4.3 COMPANY의 사건 삭제(delete) 차단
  {
    const res = await restRequest('DELETE', 'maternity_cases/case_a1', {
      token: tokenCompA,
    });
    assert(res.status === 403, '4.3 COMPANY의 사건 삭제(DELETE) 권한 차단 (403)');
  }

  // 4.4 ADMIN의 사건 삭제(delete) 정상 허용
  {
    // case_admin_legit_01을 삭제
    const res = await restRequest('DELETE', 'maternity_cases/case_admin_legit_01', {
      token: tokenAdmin,
    });
    assert(res.status === 200, '4.4 ADMIN의 사건 삭제(DELETE) 정상 허용 (200)');
  }

  // 4.5 COMPANY가 이미 COMPLETED 상태인 사건의 status 임의 변경 시도 차단
  {
    const res = await restRequest('PATCH', 'maternity_cases/case_a3', {
      token: tokenCompA,
      updateMask: ['status'],
      body: {
        fields: toFirestoreFields({
          status: 'UNDER_REVIEW',
        }),
      },
    });
    assert(res.status === 403, '4.5 COMPANY가 COMPLETED 사건을 임의 수정하려는 시도 차단 (403)');
  }

  console.log('\n======================================================');
  console.log(`[Summary] Total: ${stats.total}, Passed: ${stats.passed}, Failed: ${stats.failed}`);
  console.log('======================================================\n');

  if (stats.failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
