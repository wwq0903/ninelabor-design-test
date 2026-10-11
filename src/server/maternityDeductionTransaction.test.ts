/**
 * [R2-8 2/4-A-⑥-1] 모성보호 차감 트랜잭션 단위 및 동시성 검증 테스트 스위트
 * 
 * 검증 항목:
 * 1. 동시 신청 및 동일 사건 중복 요청 방지 (Concurrency & Idempotency)
 * 2. STANDARD 월 무료 5회 우선 적용 -> 선불 이용권 차감 -> 0회 시 거부 (Priority & Quota Exhaustion)
 * 3. 트랜잭션 도중 오류 발생 시 전체 롤백 (Atomic Rollback)
 * 4. ADMIN/COMPANY 권한 검증 및 기업별 데이터 격리 (RBAC & Tenant Isolation)
 * 5. 레거시 사건 소급 차감 금지 (Legacy Case Protection)
 * 6. 기존 신청 건수와 신규 차감 기록 이중 집계 방지 (Double-counting Prevention)
 */

import {
  executeMaternityDeductionTransaction,
  MaternityDeductionError,
} from './maternityDeductionTransaction';
import {
  MaternityCase,
  Company,
  MaternityDeductionCallerContext,
} from '../types';

// ============================================================================
// In-Memory Transactional Firestore Mock
// ============================================================================
class MockDocRef {
  constructor(public collectionName: string, public id: string, public db: MockFirestore) {}
  get path() {
    return `${this.collectionName}/${this.id}`;
  }
}

class MockQuery {
  constructor(
    public collectionName: string,
    public db: MockFirestore,
    public filters: Array<{ field: string; op: string; val: any }> = []
  ) {}

  where(field: string, op: string, val: any) {
    return new MockQuery(this.collectionName, this.db, [...this.filters, { field, op, val }]);
  }
}

class MockFirestore {
  // Key: collection/id -> { data: any, version: number }
  public store = new Map<string, { data: any; version: number }>();
  private lock = Promise.resolve();

  collection(collectionName: string) {
    return {
      doc: (id: string) => new MockDocRef(collectionName, id, this),
      where: (field: string, op: string, val: any) =>
        new MockQuery(collectionName, this, [{ field, op, val }]),
    };
  }

  setRaw(path: string, data: any) {
    const existing = this.store.get(path);
    this.store.set(path, {
      data: JSON.parse(JSON.stringify(data)),
      version: (existing?.version || 0) + 1,
    });
  }

  getRaw(path: string): any {
    const item = this.store.get(path);
    return item ? JSON.parse(JSON.stringify(item.data)) : null;
  }

  async runTransaction<T>(
    updateFunction: (transaction: MockTransaction) => Promise<T>,
    maxRetries = 50
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const readVersions = new Map<string, number>();
      const pendingWrites = new Map<string, { type: 'set' | 'update'; data: any }>();

      const transaction: MockTransaction = {
        get: async (target: MockDocRef | MockQuery) => {
          if (target instanceof MockDocRef) {
            const path = target.path;
            const entry = this.store.get(path);
            readVersions.set(path, entry ? entry.version : 0);
            return {
              exists: Boolean(entry),
              id: target.id,
              data: () => (entry ? JSON.parse(JSON.stringify(entry.data)) : undefined),
            };
          } else {
            // MockQuery
            const q = target as MockQuery;
            const results: any[] = [];
            for (const [path, entry] of this.store.entries()) {
              if (path.startsWith(`${q.collectionName}/`)) {
                readVersions.set(path, entry.version);
                const docId = path.split('/')[1];
                let matches = true;
                for (const f of q.filters) {
                  if (entry.data[f.field] !== f.val) {
                    matches = false;
                    break;
                  }
                }
                if (matches) {
                  results.push({
                    id: docId,
                    data: () => JSON.parse(JSON.stringify(entry.data)),
                  });
                }
              }
            }
            return { docs: results };
          }
        },
        set: (ref: MockDocRef, data: any) => {
          pendingWrites.set(ref.path, { type: 'set', data: JSON.parse(JSON.stringify(data)) });
        },
        update: (ref: MockDocRef, data: any) => {
          pendingWrites.set(ref.path, { type: 'update', data: JSON.parse(JSON.stringify(data)) });
        },
      };

      try {
        const result = await updateFunction(transaction);

        // Atomic commit check (Optimistic Concurrency Control)
        let conflict = false;
        for (const [path, readVer] of readVersions.entries()) {
          const currentEntry = this.store.get(path);
          const currentVer = currentEntry ? currentEntry.version : 0;
          if (currentVer !== readVer) {
            conflict = true;
            break;
          }
        }

        if (conflict) {
          // Concurrency conflict: retry transaction
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          continue;
        }

        // Commit pending writes
        for (const [path, op] of pendingWrites.entries()) {
          const current = this.store.get(path);
          let newData: any;
          if (op.type === 'set') {
            newData = op.data;
          } else {
            newData = { ...(current ? current.data : {}), ...op.data };
          }
          this.store.set(path, {
            data: newData,
            version: (current?.version || 0) + 1,
          });
        }

        return result;
      } catch (err) {
        // If an explicit error was thrown inside updateFunction, roll back immediately (do not commit)
        throw err;
      }
    }

    throw new Error('Transaction max retries exceeded due to concurrency conflict.');
  }
}

interface MockTransaction {
  get: (target: MockDocRef | MockQuery) => Promise<any>;
  set: (ref: MockDocRef, data: any) => void;
  update: (ref: MockDocRef, data: any) => void;
}

// ============================================================================
// Test Suites
// ============================================================================

async function runAllTests() {
  console.log('================================================================');
  console.log('🧪 Starting Maternity Deduction Transaction Test Suite [R2-8 2/4-A-⑥-1]');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ ASSERTION FAILED: ${msg}`);
      failed++;
      throw new Error(`Assertion failed: ${msg}`);
    } else {
      console.log(`  ✓ ${msg}`);
      passed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: ADMIN/COMPANY 권한 검증 및 기업별 데이터 격리
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] ADMIN / COMPANY 권한 검증 및 기업별 데이터 격리');
  {
    const db = new MockFirestore();
    const companyA: Company = {
      id: 'comp_A',
      companyName: '테스트기업A',
      businessNumber: '111-22-33333',
      currentPlanId: 'STANDARD',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_A', companyA);

    const caseA: MaternityCase = {
      id: 'case_A1',
      companyId: 'comp_A',
      employeeId: 'emp_1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      createdById: 'worker_1',
      updatedById: 'worker_1',
    };
    db.setRaw('maternity_cases/case_A1', caseA);

    // 1-1: WORKER 계정 실행 시 FORBIDDEN 차단
    try {
      await executeMaternityDeductionTransaction(
        {
          caller: { uid: 'worker_1', role: 'WORKER', companyId: 'comp_A' },
          companyId: 'comp_A',
          caseId: 'case_A1',
        },
        db
      );
      assert(false, 'WORKER 계정은 차단되어야 합니다.');
    } catch (err: any) {
      assert(err.code === 'FORBIDDEN', 'WORKER 호출 차단 (FORBIDDEN 확인)');
    }

    // 1-2: COMPANY 담당자가 타 기업(comp_B) 사건 차감 시도 시 DATA_ISOLATION_VIOLATION 차단
    try {
      await executeMaternityDeductionTransaction(
        {
          caller: { uid: 'manager_B', role: 'COMPANY', companyId: 'comp_B' },
          companyId: 'comp_A',
          caseId: 'case_A1',
        },
        db
      );
      assert(false, '타 기업 사건 차감은 차단되어야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'DATA_ISOLATION_VIOLATION',
        '타 기업 사건 접근 차단 (DATA_ISOLATION_VIOLATION 확인)'
      );
    }

    // 1-3: 정상 COMPANY 담당자 (본인 기업 사건) -> 성공
    const compResult = await executeMaternityDeductionTransaction(
      {
        caller: { uid: 'manager_A', role: 'COMPANY', companyId: 'comp_A' },
        companyId: 'comp_A',
        caseId: 'case_A1',
      },
      db
    );
    assert(compResult.success === true, '본인 소속 기업 담당자의 정상 차감 성공');
    assert(compResult.source === 'MONTHLY_FREE', 'STANDARD 플랜 월 무료 5회 중 1회 차감');
  }

  // --------------------------------------------------------------------------
  // TEST 2: 동일 사건 중복 차감 방지 (Idempotency)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] 동일 사건 중복 차감 방지 (Idempotency)');
  {
    const db = new MockFirestore();
    const companyA: Company = {
      id: 'comp_A',
      companyName: '테스트기업A',
      businessNumber: '111-22-33333',
      currentPlanId: 'STANDARD',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 3,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_A', companyA);

    const caseA: MaternityCase = {
      id: 'case_dup_1',
      companyId: 'comp_A',
      employeeId: 'emp_1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      createdById: 'worker_1',
      updatedById: 'worker_1',
    };
    db.setRaw('maternity_cases/case_dup_1', caseA);

    const caller: MaternityDeductionCallerContext = {
      uid: 'admin_1',
      role: 'ADMIN',
    };

    // 1차 차감: 성공
    const res1 = await executeMaternityDeductionTransaction(
      { caller, companyId: 'comp_A', caseId: 'case_dup_1' },
      db
    );
    assert(res1.success, '1차 차감 성공');

    // 2차 동일 사건 중복 차감 시도: 차단
    try {
      await executeMaternityDeductionTransaction(
        { caller, companyId: 'comp_A', caseId: 'case_dup_1' },
        db
      );
      assert(false, '동일 사건 재차감은 차단되어야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'ALREADY_DEDUCTED',
        '동일 사건 중복 차감 방지 성공 (ALREADY_DEDUCTED)'
      );
    }
  }

  // --------------------------------------------------------------------------
  // TEST 3: STANDARD 월 무료 5회 우선 적용 -> 선불 이용권 차감 -> 잔여 0회 시 거부
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] 무료/선불 차감 우선순위 및 0회 시 거부');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_std',
      companyName: '스탠다드기업',
      businessNumber: '222-33-44444',
      currentPlanId: 'STANDARD',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 2, // 선불 이용권 2회 보유
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_std', company);

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 8개 사건 준비 (1~5: 무료 5회 차감, 6~7: 선불 2회 차감, 8: 0회 거부)
    for (let i = 1; i <= 8; i++) {
      const c: MaternityCase = {
        id: `case_std_${i}`,
        companyId: 'comp_std',
        employeeId: `emp_${i}`,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        applicationDate: '2026-10-01',
        createdAt: `2026-10-01T0${i}:00:00Z`,
        updatedAt: `2026-10-01T0${i}:00:00Z`,
        createdById: 'worker',
        updatedById: 'worker',
      };
      db.setRaw(`maternity_cases/case_std_${i}`, c);
    }

    // 1회~5회: STANDARD 월 무료 5회 우선 적용
    for (let i = 1; i <= 5; i++) {
      const res = await executeMaternityDeductionTransaction(
        { caller, companyId: 'comp_std', caseId: `case_std_${i}` },
        db
      );
      assert(res.source === 'MONTHLY_FREE', `${i}회차: STANDARD 월 무료 차감 (MONTHLY_FREE)`);
      assert(res.remainingMonthlyFree === 5 - i, `월 무료 잔여: ${5 - i}회`);
      assert(res.remainingPurchasedTickets === 2, `선불 이용권 잔여 유지: 2회`);
    }

    // 6회: 무료 소진 후 1순위 선불 이용권 차감
    const res6 = await executeMaternityDeductionTransaction(
      { caller, companyId: 'comp_std', caseId: 'case_std_6' },
      db
    );
    assert(res6.source === 'PREPAID_TICKET', '6회차: 선불 이용권 차감 (PREPAID_TICKET)');
    assert(res6.remainingMonthlyFree === 0, '월 무료 잔여 0회');
    assert(res6.remainingPurchasedTickets === 1, '선불 이용권 잔여: 1회');

    // 7회: 선불 이용권 추가 차감
    const res7 = await executeMaternityDeductionTransaction(
      { caller, companyId: 'comp_std', caseId: 'case_std_7' },
      db
    );
    assert(res7.source === 'PREPAID_TICKET', '7회차: 선불 이용권 차감 (PREPAID_TICKET)');
    assert(res7.remainingPurchasedTickets === 0, '선불 이용권 잔여 0회');
    assert(res7.totalRemaining === 0, '총 잔여 0회');

    // 8회: 무료 0회 + 선불 0회 -> 잔여 0회 시 차감 거부
    try {
      await executeMaternityDeductionTransaction(
        { caller, companyId: 'comp_std', caseId: 'case_std_8' },
        db
      );
      assert(false, '잔여 0회 시 차감은 거부되어야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'QUOTA_EXHAUSTED',
        '잔여 0회 시 차감 거부 성공 (QUOTA_EXHAUSTED)'
      );
    }
  }

  // --------------------------------------------------------------------------
  // TEST 4: 동시 신청 시 초과 차감 방지 (Concurrency Protection)
  // [R2-8 2/4-A-⑥-6] 무료 및 선불 동시 차감 직렬화 및 정합성 검증
  // --------------------------------------------------------------------------
  console.log('\n[Test 4-1] 무료 잔여 1회 상태에서 5건 동시 신청 시 정확히 1건만 성공');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_free_1',
      companyName: '무료1회남은기업',
      businessNumber: '101-20-30401',
      currentPlanId: 'STANDARD', // 월 무료 5회
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_free_1', company);

    // 이미 당월(2026-10)에 4건이 정상 차감되어 1회만 남은 상태 세팅
    for (let i = 1; i <= 4; i++) {
      db.setRaw(`maternity_cases/case_prev_${i}`, {
        id: `case_prev_${i}`,
        companyId: 'comp_free_1',
        employeeId: `emp_prev_${i}`,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-01',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        createdById: 'worker',
        updatedById: 'worker',
        deductionInfo: {
          deductionId: `deduct_comp_free_1_case_prev_${i}`,
          source: 'MONTHLY_FREE',
          yearMonth: '2026-10',
          deductedAt: '2026-10-01T00:00:00Z',
        },
      });
      db.setRaw(`maternity_deductions/deduct_comp_free_1_case_prev_${i}`, {
        id: `deduct_comp_free_1_case_prev_${i}`,
        deductionId: `deduct_comp_free_1_case_prev_${i}`,
        companyId: 'comp_free_1',
        maternityCaseId: `case_prev_${i}`,
        source: 'MONTHLY_FREE',
        quantity: 1,
        status: 'DEDUCTED',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
        actorUid: 'admin_1',
        actorRole: 'ADMIN',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      });
    }

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 5건의 서로 다른 신규 사건 동시 신청
    const caseIds = ['case_f1', 'case_f2', 'case_f3', 'case_f4', 'case_f5'];
    for (const cid of caseIds) {
      db.setRaw(`maternity_cases/${cid}`, {
        id: cid,
        companyId: 'comp_free_1',
        employeeId: 'emp_test',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        applicationDate: '2026-10-02',
        createdAt: '2026-10-02T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
        createdById: 'worker',
        updatedById: 'worker',
      });
    }

    // 5건 동시 병렬 실행 (Promise.allSettled)
    const results = await Promise.allSettled(
      caseIds.map((cid) =>
        executeMaternityDeductionTransaction(
          { caller, companyId: 'comp_free_1', caseId: cid, targetYearMonth: '2026-10' },
          db
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 1,
      `무료 잔여 1회 상태에서 5건 동시 신청 시 정확히 1건만 성공 (성공: ${fulfilled.length})`
    );
    assert(
      rejected.length === 4,
      `동시 신청 5건 중 4건은 한도 초과(QUOTA_EXHAUSTED) 거부 (거부: ${rejected.length})`
    );

    const successResult = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    assert(successResult.source === 'MONTHLY_FREE', '성공한 1건은 MONTHLY_FREE 출처로 차감');
    assert(successResult.remainingMonthlyFree === 0, '차감 후 무료 잔여 0회');

    for (const rej of rejected) {
      const err = (rej as PromiseRejectedResult).reason;
      assert(err.code === 'QUOTA_EXHAUSTED', '거부된 건의 에러 코드는 QUOTA_EXHAUSTED');
    }

    // 기업 문서의 갱신 확인 (직렬화 필드 갱신 확인)
    const updatedComp = db.getRaw('companies/comp_free_1');
    assert(Boolean(updatedComp.lastMaternityDeductionAt), 'companies 문서에 lastMaternityDeductionAt 기록 확인');
  }

  console.log('\n[Test 4-2] 무료 잔여 5회 상태에서 10건 동시 신청 시 정확히 5건만 무료 차감');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_free_5',
      companyName: '무료5회온전기업',
      businessNumber: '101-20-30402',
      currentPlanId: 'STANDARD', // 월 무료 5회
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_free_5', company);

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 10건의 서로 다른 신규 사건 준비
    const caseIds = Array.from({ length: 10 }, (_, i) => `case_ten_${i + 1}`);
    for (const cid of caseIds) {
      db.setRaw(`maternity_cases/${cid}`, {
        id: cid,
        companyId: 'comp_free_5',
        employeeId: 'emp_ten',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        applicationDate: '2026-10-01',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        createdById: 'worker',
        updatedById: 'worker',
      });
    }

    // 10건 동시 병렬 실행
    const results = await Promise.allSettled(
      caseIds.map((cid) =>
        executeMaternityDeductionTransaction(
          { caller, companyId: 'comp_free_5', caseId: cid, targetYearMonth: '2026-10' },
          db
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 5,
      `무료 잔여 5회 상태에서 10건 동시 신청 시 정확히 5건만 성공 (성공: ${fulfilled.length})`
    );
    assert(
      rejected.length === 5,
      `동시 신청 10건 중 5건은 무료 소진으로 거부 (거부: ${rejected.length})`
    );

    for (const f of fulfilled) {
      const val = (f as PromiseFulfilledResult<any>).value;
      assert(val.source === 'MONTHLY_FREE', '성공한 5건 모두 MONTHLY_FREE 출처로 차감');
    }

    for (const r of rejected) {
      const err = (r as PromiseRejectedResult).reason;
      assert(err.code === 'QUOTA_EXHAUSTED', '거부된 5건 모두 QUOTA_EXHAUSTED 에러');
    }

    // 차감 원장에 정확히 5건만 생성되었는지 확인
    let ledgerCount = 0;
    for (const [path, entry] of db.store.entries()) {
      if (path.startsWith('maternity_deductions/') && entry.data.companyId === 'comp_free_5') {
        ledgerCount++;
      }
    }
    assert(ledgerCount === 5, `차감 원장 문서에 초과 생성 없이 정확히 5건만 기록됨 (실제: ${ledgerCount})`);
  }

  console.log('\n[Test 4-3] 선불 이용권과 혼합된 동시 신청 (무료 2회 + 선불 3회 상태에서 10건 동시 신청)');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_mixed',
      companyName: '혼합동시신청기업',
      businessNumber: '101-20-30403',
      currentPlanId: 'STANDARD', // 월 무료 5회 중 3회 기사용 -> 무료 2회 남음
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 3, // 선불 이용권 3회 보유 -> 총 5회 차감 가능
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_mixed', company);

    // 당월 기차감 3건 세팅 (무료 잔여 2회 남도록)
    for (let i = 1; i <= 3; i++) {
      db.setRaw(`maternity_cases/case_used_${i}`, {
        id: `case_used_${i}`,
        companyId: 'comp_mixed',
        employeeId: 'emp_u',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-01',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        createdById: 'worker',
        updatedById: 'worker',
        deductionInfo: {
          deductionId: `deduct_comp_mixed_case_used_${i}`,
          source: 'MONTHLY_FREE',
          yearMonth: '2026-10',
          deductedAt: '2026-10-01T00:00:00Z',
        },
      });
      db.setRaw(`maternity_deductions/deduct_comp_mixed_case_used_${i}`, {
        id: `deduct_comp_mixed_case_used_${i}`,
        deductionId: `deduct_comp_mixed_case_used_${i}`,
        companyId: 'comp_mixed',
        maternityCaseId: `case_used_${i}`,
        source: 'MONTHLY_FREE',
        quantity: 1,
        status: 'DEDUCTED',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
        actorUid: 'admin_1',
        actorRole: 'ADMIN',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      });
    }

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 10건의 서로 다른 신규 사건 준비
    const caseIds = Array.from({ length: 10 }, (_, i) => `case_mix_${i + 1}`);
    for (const cid of caseIds) {
      db.setRaw(`maternity_cases/${cid}`, {
        id: cid,
        companyId: 'comp_mixed',
        employeeId: 'emp_m',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        applicationDate: '2026-10-01',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        createdById: 'worker',
        updatedById: 'worker',
      });
    }

    // 10건 동시 병렬 실행
    const results = await Promise.allSettled(
      caseIds.map((cid) =>
        executeMaternityDeductionTransaction(
          { caller, companyId: 'comp_mixed', caseId: cid, targetYearMonth: '2026-10' },
          db
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 5,
      `총 5회 한도(무료 2회 + 선불 3회) 내에서 10건 중 정확히 5건만 성공 (성공: ${fulfilled.length})`
    );
    assert(
      rejected.length === 5,
      `잔여 0회 초과분 5건은 정확히 차단 (거부: ${rejected.length})`
    );

    const freeCount = fulfilled.filter(
      (f) => (f as PromiseFulfilledResult<any>).value.source === 'MONTHLY_FREE'
    ).length;
    const prepaidCount = fulfilled.filter(
      (f) => (f as PromiseFulfilledResult<any>).value.source === 'PREPAID_TICKET'
    ).length;

    assert(
      freeCount === 2,
      `무료 잔여 2회가 정확히 우선 차감됨 (MONTHLY_FREE 차감 수: ${freeCount})`
    );
    assert(
      prepaidCount === 3,
      `무료 소진 후 선불 이용권 3회가 정확히 차감됨 (PREPAID_TICKET 차감 수: ${prepaidCount})`
    );

    const finalComp = db.getRaw('companies/comp_mixed');
    assert(
      finalComp.purchasedMaternityTickets === 0,
      `선불 이용권 3장이 차감되어 잔여 0회로 일치 (실제: ${finalComp.purchasedMaternityTickets})`
    );
  }

  console.log('\n[Test 4-4] 다중 기업 동시 신청 시 상호 격리 (타 기업 이용 횟수에 무영향)');
  {
    const db = new MockFirestore();
    const compA: Company = {
      id: 'comp_iso_A',
      companyName: '격리기업A',
      businessNumber: '101-20-30404',
      currentPlanId: 'STANDARD',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const compB: Company = {
      id: 'comp_iso_B',
      companyName: '격리기업B',
      businessNumber: '101-20-30405',
      currentPlanId: 'STANDARD',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_iso_A', compA);
    db.setRaw('companies/comp_iso_B', compB);

    // 각 기업당 무료 4회 기사용 세팅 (각각 잔여 1회 남음)
    for (let i = 1; i <= 4; i++) {
      db.setRaw(`maternity_deductions/deduct_A_${i}`, {
        id: `deduct_A_${i}`,
        deductionId: `deduct_A_${i}`,
        companyId: 'comp_iso_A',
        maternityCaseId: `case_A_${i}`,
        source: 'MONTHLY_FREE',
        quantity: 1,
        status: 'DEDUCTED',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
        actorUid: 'admin_1',
        actorRole: 'ADMIN',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      });
      db.setRaw(`maternity_deductions/deduct_B_${i}`, {
        id: `deduct_B_${i}`,
        deductionId: `deduct_B_${i}`,
        companyId: 'comp_iso_B',
        maternityCaseId: `case_B_${i}`,
        source: 'MONTHLY_FREE',
        quantity: 1,
        status: 'DEDUCTED',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
        actorUid: 'admin_1',
        actorRole: 'ADMIN',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      });
    }

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 기업 A: 3건 신규 신청, 기업 B: 3건 신규 신청 -> 총 6건 동시 신청
    for (let i = 1; i <= 3; i++) {
      db.setRaw(`maternity_cases/case_req_A_${i}`, {
        id: `case_req_A_${i}`,
        companyId: 'comp_iso_A',
        employeeId: 'emp_a',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-05',
        createdAt: '2026-10-05T00:00:00Z',
        updatedAt: '2026-10-05T00:00:00Z',
        createdById: 'worker',
        updatedById: 'worker',
      });
      db.setRaw(`maternity_cases/case_req_B_${i}`, {
        id: `case_req_B_${i}`,
        companyId: 'comp_iso_B',
        employeeId: 'emp_b',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-05',
        createdAt: '2026-10-05T00:00:00Z',
        updatedAt: '2026-10-05T00:00:00Z',
        createdById: 'worker',
        updatedById: 'worker',
      });
    }

    const mixedRequests = [
      ...[1, 2, 3].map((i) =>
        executeMaternityDeductionTransaction(
          { caller, companyId: 'comp_iso_A', caseId: `case_req_A_${i}`, targetYearMonth: '2026-10' },
          db
        )
      ),
      ...[1, 2, 3].map((i) =>
        executeMaternityDeductionTransaction(
          { caller, companyId: 'comp_iso_B', caseId: `case_req_B_${i}`, targetYearMonth: '2026-10' },
          db
        )
      ),
    ];

    const results = await Promise.allSettled(mixedRequests);
    const resultsA = results.slice(0, 3);
    const resultsB = results.slice(3, 6);

    const fulfilledA = resultsA.filter((r) => r.status === 'fulfilled');
    const fulfilledB = resultsB.filter((r) => r.status === 'fulfilled');

    assert(fulfilledA.length === 1, `기업 A: 동시 신청 3건 중 정확히 1건만 성공 (성공: ${fulfilledA.length})`);
    assert(fulfilledB.length === 1, `기업 B: 동시 신청 3건 중 정확히 1건만 성공 (성공: ${fulfilledB.length})`);
  }

  console.log('\n[Test 4-5] 선불 이용권 잔여 1회 상태에서 5건 동시 신청 (기존 PREPAID_TICKET 보호 유지)');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_limit',
      companyName: '한도테스트기업',
      businessNumber: '333-44-55555',
      currentPlanId: 'FREE', // 무료 0회
      subscription: {
        planCode: 'FREE',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 1, // 선불 이용권 단 1회 남음!
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_limit', company);

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    const caseIds = ['case_c1', 'case_c2', 'case_c3', 'case_c4', 'case_c5'];
    for (const cid of caseIds) {
      db.setRaw(`maternity_cases/${cid}`, {
        id: cid,
        companyId: 'comp_limit',
        employeeId: 'emp_c',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        applicationDate: '2026-10-01',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        createdById: 'worker',
        updatedById: 'worker',
      });
    }

    const results = await Promise.allSettled(
      caseIds.map((cid) =>
        executeMaternityDeductionTransaction(
          { caller, companyId: 'comp_limit', caseId: cid },
          db
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 1,
      `선불 1회 상태에서 5건 중 정확히 1건만 성공 (성공 수: ${fulfilled.length})`
    );
    assert(
      rejected.length === 4,
      `선불 1회 상태에서 4건은 한도 초과 거부 (거부 수: ${rejected.length})`
    );

    const updatedComp = db.getRaw('companies/comp_limit');
    assert(
      updatedComp.purchasedMaternityTickets === 0,
      '동시성 제어로 음수 수량 발생 없이 정확히 0회로 고정'
    );
  }

  // --------------------------------------------------------------------------
  // TEST 5: 트랜잭션 도중 오류 발생 시 전체 롤백 (Atomic Rollback)
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] 트랜잭션 도중 오류 발생 시 전체 롤백 (Atomic Rollback)');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_rollback',
      companyName: '롤백기업',
      businessNumber: '555-66-77777',
      currentPlanId: 'FREE',
      subscription: {
        planCode: 'FREE',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 5,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_rollback', company);

    // 사건 등록 (단, 취소된 상태로 등록하여 오류 유발)
    const cancelledCase: MaternityCase = {
      id: 'case_cancelled',
      companyId: 'comp_rollback',
      employeeId: 'emp_1',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED', // 차감 불가 상태
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
    };
    db.setRaw('maternity_cases/case_cancelled', cancelledCase);

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    try {
      await executeMaternityDeductionTransaction(
        { caller, companyId: 'comp_rollback', caseId: 'case_cancelled' },
        db
      );
      assert(false, '취소 사건 차감 시도는 에러를 던져야 합니다.');
    } catch (err: any) {
      assert(err.code === 'INVALID_STATE', 'INVALID_STATE 에러 발생 확인');
    }

    // 롤백 검증: 사건 deductionInfo 없음, 원장 미생성, 기업 선불 티켓 5장 그대로 보존
    const cDoc = db.getRaw('maternity_cases/case_cancelled');
    assert(!cDoc.deductionInfo, '사건 문서에 deductionInfo 기록되지 않음 (롤백)');

    const lDoc = db.getRaw('maternity_deductions/deduct_comp_rollback_case_cancelled');
    assert(lDoc === null, '차감 원장 문서 미생성 (롤백)');

    const compDoc = db.getRaw('companies/comp_rollback');
    assert(compDoc.purchasedMaternityTickets === 5, '선불 이용권 차감 없이 5회 그대로 보존 (롤백)');
  }

  // --------------------------------------------------------------------------
  // TEST 6: 기존 레거시 사건 소급 차감 금지 및 이중 집계 방지
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] 레거시 사건 소급 차감 금지 및 기존 신청 건수 이중 집계 방지');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_legacy',
      companyName: '레거시보호기업',
      businessNumber: '777-88-99999',
      currentPlanId: 'STANDARD',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };
    db.setRaw('companies/comp_legacy', company);

    // 1) 과거 완료된 레거시 사건 (deductionInfo 없음)
    const oldCompletedCase: MaternityCase = {
      id: 'case_old_comp',
      companyId: 'comp_legacy',
      employeeId: 'emp_old',
      workType: 'MATERNITY_LEAVE',
      status: 'COMPLETED',
      startDate: '2026-08-01',
      endDate: '2026-10-31',
      applicationDate: '2026-08-01',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
    };
    db.setRaw('maternity_cases/case_old_comp', oldCompletedCase);

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 레거시 사건 소급 차감 시도 -> 차단
    try {
      await executeMaternityDeductionTransaction(
        { caller, companyId: 'comp_legacy', caseId: 'case_old_comp' },
        db
      );
      assert(false, '레거시 사건은 소급 차감할 수 없습니다.');
    } catch (err: any) {
      assert(
        err.code === 'LEGACY_CASE_RETROACTIVE_DENIED',
        '레거시 사건 소급 차감 차단 확인 (LEGACY_CASE_RETROACTIVE_DENIED)'
      );
    }

    // 2) 이중 집계 방지 검증:
    // 당월(2026-10)에 기존 완료된 레거시 사건 1건(deductionInfo 없음) + 이미 차감된 신규 사건 1건(원장 및 deductionInfo 보유)
    db.setRaw('maternity_cases/case_m1', {
      id: 'case_m1',
      companyId: 'comp_legacy',
      employeeId: 'emp_1',
      workType: 'MATERNITY_LEAVE',
      status: 'COMPLETED', // 기존 완료된 레거시 건
      applicationDate: '2026-10-02',
      createdAt: '2026-10-02T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
    });

    db.setRaw('maternity_cases/case_m2', {
      id: 'case_m2',
      companyId: 'comp_legacy',
      employeeId: 'emp_2',
      workType: 'MATERNITY_LEAVE',
      status: 'UNDER_REVIEW',
      applicationDate: '2026-10-03',
      createdAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
      deductionInfo: {
        deductionId: 'deduct_comp_legacy_case_m2',
        source: 'MONTHLY_FREE',
        yearMonth: '2026-10',
        deductedAt: '2026-10-03T00:00:00Z',
      },
    });

    // case_m2에 대한 차감 원장도 동시 존재 (양쪽 컬렉션에 모두 존재할 때 중복 집계되지 않는지 검증)
    db.setRaw('maternity_deductions/deduct_comp_legacy_case_m2', {
      id: 'deduct_comp_legacy_case_m2',
      deductionId: 'deduct_comp_legacy_case_m2',
      companyId: 'comp_legacy',
      maternityCaseId: 'case_m2',
      source: 'MONTHLY_FREE',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-03T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_legacy_case_m2_MONTHLY_FREE',
      createdAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
    });

    // 신규 신청 건 case_new 차감 실행
    const newCase: MaternityCase = {
      id: 'case_new',
      companyId: 'comp_legacy',
      employeeId: 'emp_3',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      startDate: '2026-10-05',
      endDate: '2027-01-05',
      applicationDate: '2026-10-05',
      createdAt: '2026-10-05T00:00:00Z',
      updatedAt: '2026-10-05T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
    };
    db.setRaw('maternity_cases/case_new', newCase);

    const newRes = await executeMaternityDeductionTransaction(
      { caller, companyId: 'comp_legacy', caseId: 'case_new', targetYearMonth: '2026-10' },
      db
    );

    // 레거시 1건 + 기차감 1건(이중집계 방지) + 신규 1건 = 총 3건 사용 -> 남은 무료 횟수: 5 - 3 = 2회
    assert(
      newRes.remainingMonthlyFree === 2,
      `레거시 1건 + 기차감 1건(이중집계 방지) + 신규 1건 = 3건 집계되어 잔여 2회 남음 (실제: ${newRes.remainingMonthlyFree})`
    );
  }

  // --------------------------------------------------------------------------
  // [Test 7] [R2-8 2/4-A-⑥-9] STANDARD 무료분 차감 및 UNDER_REVIEW 상태 전이 원자적 처리
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] STANDARD 무료분 차감 및 UNDER_REVIEW 상태 전이 원자적 처리');
  {
    const db = new MockFirestore();
    const companyId = 'comp_std_trans_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '스탠다드 전이 기업',
      currentPlanId: 'plan_standard',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
    });

    const caseId = 'case_trans_1';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-01',
      history: [{ action: '신청 접수', newStatus: 'APPLIED', timestamp: '2026-10-01T00:00:00Z' }],
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };
    const historyItem = {
      action: '상태 변경: 검토',
      previousStatus: 'APPLIED' as const,
      newStatus: 'UNDER_REVIEW' as const,
      timestamp: '2026-10-08T00:00:00Z',
      actor: '관리자',
      actorUid: 'admin_1',
      notes: '노무사 법정 기준 검토 착수',
    };

    const res = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        targetStatus: 'UNDER_REVIEW',
        statusChangeHistoryItem: historyItem,
      },
      db
    );

    assert(res.success === true, '전이 및 차감 성공');
    assert(res.source === 'MONTHLY_FREE', 'STANDARD 무료분으로 차감');
    assert(res.remainingMonthlyFree === 4, '월 무료 잔여 4회 (5 - 1)');

    const updatedCase = db.getRaw(`maternity_cases/${caseId}`);
    assert(updatedCase.status === 'UNDER_REVIEW', '사건 상태가 UNDER_REVIEW로 원자적 전이');
    assert(Boolean(updatedCase.deductionInfo?.deductionId), '사건에 deductionInfo 원자적 기록');
    assert(updatedCase.history.length === 2, '사건 이력에 전이 내역 추가');
    assert(updatedCase.history[1].newStatus === 'UNDER_REVIEW', '추가된 이력 확인');

    const ledger = db.getRaw(`maternity_deductions/deduct_${companyId}_${caseId}`);
    assert(Boolean(ledger), '차감 원장 생성 확인');
    assert(ledger.status === 'DEDUCTED', '원장 상태 DEDUCTED');
  }

  // --------------------------------------------------------------------------
  // [Test 8] [R2-8 2/4-A-⑥-9] STANDARD 무료분 소진 후 선불 차감 및 IN_PROGRESS 전이
  // --------------------------------------------------------------------------
  console.log('\n[Test 8] STANDARD 무료분 소진 후 선불 차감 및 IN_PROGRESS 전이');
  {
    const db = new MockFirestore();
    const companyId = 'comp_std_exhaust_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '무료소진 스탠다드 기업',
      currentPlanId: 'plan_standard',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 2,
    });

    // 당월 무료 5건 이미 소진 원장 등록
    for (let i = 1; i <= 5; i++) {
      db.setRaw(`maternity_deductions/deduct_${companyId}_prior_${i}`, {
        id: `deduct_${companyId}_prior_${i}`,
        deductionId: `deduct_${companyId}_prior_${i}`,
        companyId,
        maternityCaseId: `prior_${i}`,
        source: 'MONTHLY_FREE',
        status: 'DEDUCTED',
        yearMonth: '2026-10',
      });
    }

    const caseId = 'case_exhaust_6';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_6',
      workType: 'MATERNITY_LEAVE',
      status: 'DOCS_COLLECTING',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };
    const res = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        targetStatus: 'IN_PROGRESS',
        statusChangeHistoryItem: {
          action: '처리중 전이',
          newStatus: 'IN_PROGRESS',
          timestamp: '2026-10-08T00:00:00Z',
          actor: '관리자',
          actorUid: 'admin_1',
        },
      },
      db
    );

    assert(res.source === 'PREPAID_TICKET', '무료 소진 후 선불 이용권 차감 (PREPAID_TICKET)');
    assert(res.remainingPurchasedTickets === 1, '선불 이용권 잔여 1회 (2 - 1)');

    const updatedComp = db.getRaw(`companies/${companyId}`);
    assert(updatedComp.purchasedMaternityTickets === 1, '회사 문서 선불 이용권 1회 감소');

    const updatedCase = db.getRaw(`maternity_cases/${caseId}`);
    assert(updatedCase.status === 'IN_PROGRESS', '사건 상태가 IN_PROGRESS로 원자적 전이');
    assert(updatedCase.deductionInfo.source === 'PREPAID_TICKET', '사건 deductionInfo source가 PREPAID_TICKET');
  }

  // --------------------------------------------------------------------------
  // [Test 9] [R2-8 2/4-A-⑥-9] 다른 플랜 (BASIC / FREE / CUSTOM) 선불 차감 및 상태 전이
  // --------------------------------------------------------------------------
  console.log('\n[Test 9] 다른 플랜 (BASIC / FREE / CUSTOM) 선불 차감 및 상태 전이');
  {
    const db = new MockFirestore();
    const companyId = 'comp_basic_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '베이직 플랜 기업',
      currentPlanId: 'plan_basic',
      subscription: {
        planCode: 'BASIC',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 3,
    });

    const caseId = 'case_basic_1';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_b1',
      workType: 'PARENTAL_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };
    const res = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        targetStatus: 'UNDER_REVIEW',
      },
      db
    );

    assert(res.source === 'PREPAID_TICKET', 'BASIC 플랜은 무료 없이 선불 이용권 즉시 차감');
    assert(res.remainingPurchasedTickets === 2, '선불 이용권 잔여 2회 (3 - 1)');

    const updatedCase = db.getRaw(`maternity_cases/${caseId}`);
    assert(updatedCase.status === 'UNDER_REVIEW', '사건 상태가 UNDER_REVIEW로 전이');
  }

  // --------------------------------------------------------------------------
  // [Test 10] [R2-8 2/4-A-⑥-9] OUTSOURCING 무료분 미적용 (선불 차감 및 0회 시 차단)
  // --------------------------------------------------------------------------
  console.log('\n[Test 10] OUTSOURCING 무료분 미적용 (구매 이용권만 사용, 0회 시 차단)');
  {
    const db = new MockFirestore();
    const compWithTicket = 'comp_out_1';
    db.setRaw(`companies/${compWithTicket}`, {
      id: compWithTicket,
      companyName: '아웃소싱 티켓보유 기업',
      currentPlanId: 'plan_outsourcing',
      subscription: {
        planCode: 'OUTSOURCING',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 1,
    });

    const caseWithTicket = 'case_out_1';
    db.setRaw(`maternity_cases/${caseWithTicket}`, {
      id: caseWithTicket,
      companyId: compWithTicket,
      employeeId: 'emp_o1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };
    const res = await executeMaternityDeductionTransaction(
      { caller, companyId: compWithTicket, caseId: caseWithTicket, targetStatus: 'UNDER_REVIEW' },
      db
    );
    assert(res.source === 'PREPAID_TICKET', 'OUTSOURCING은 무료분 미적용 및 보유 선불권 차감');
    assert(res.remainingPurchasedTickets === 0, '선불권 잔여 0회');

    // 티켓 0회인 아웃소싱 기업
    const compZeroTicket = 'comp_out_0';
    db.setRaw(`companies/${compZeroTicket}`, {
      id: compZeroTicket,
      companyName: '아웃소싱 무티켓 기업',
      currentPlanId: 'plan_outsourcing',
      subscription: {
        planCode: 'OUTSOURCING',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
    });

    const caseZero = 'case_out_zero';
    db.setRaw(`maternity_cases/${caseZero}`, {
      id: caseZero,
      companyId: compZeroTicket,
      employeeId: 'emp_o2',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
    });

    try {
      await executeMaternityDeductionTransaction(
        { caller, companyId: compZeroTicket, caseId: caseZero, targetStatus: 'UNDER_REVIEW' },
        db
      );
      assert(false, 'OUTSOURCING 티켓 0회는 차단되어야 합니다.');
    } catch (err: any) {
      assert(err.code === 'QUOTA_EXHAUSTED', 'OUTSOURCING 무료 5회 미적용 확인 (QUOTA_EXHAUSTED)');
    }
  }

  // --------------------------------------------------------------------------
  // [Test 11] [R2-8 2/4-A-⑥-9] 잔여 0회 시 상태 전이 차단 및 기존 상태 (APPLIED/DOCS_COLLECTING) 유지 (원자성)
  // --------------------------------------------------------------------------
  console.log('\n[Test 11] 잔여 0회 시 상태 전이 차단 및 기존 상태(APPLIED/DOCS_COLLECTING) 유지');
  {
    const db = new MockFirestore();
    const companyId = 'comp_zero_quota_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '잔여 0회 기업',
      currentPlanId: 'plan_free',
      purchasedMaternityTickets: 0,
    });

    const caseId = 'case_retain_status';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_z1',
      workType: 'MATERNITY_LEAVE',
      status: 'DOCS_COLLECTING',
      applicationDate: '2026-10-08',
      history: [{ action: '서류수집 진입', newStatus: 'DOCS_COLLECTING' }],
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    try {
      await executeMaternityDeductionTransaction(
        {
          caller,
          companyId,
          caseId,
          targetStatus: 'UNDER_REVIEW',
          statusChangeHistoryItem: {
            action: '검토 전이 시도',
            newStatus: 'UNDER_REVIEW',
            timestamp: '2026-10-08T00:00:00Z',
            actor: '관리자',
          },
        },
        db
      );
      assert(false, '잔여 0회 시 전이 거부되어야 함');
    } catch (err: any) {
      assert(err.code === 'QUOTA_EXHAUSTED', 'QUOTA_EXHAUSTED 에러 발생 확인');
    }

    // 사건 상태가 변경되지 않고 기존 DOCS_COLLECTING 그대로 유지되었는지 확인 (원자성)
    const caseInDb = db.getRaw(`maternity_cases/${caseId}`);
    assert(caseInDb.status === 'DOCS_COLLECTING', '사건 상태가 DOCS_COLLECTING으로 보존됨 (UNDER_REVIEW 변경 없음)');
    assert(!caseInDb.deductionInfo, '사건에 deductionInfo 미생성 확인');
    assert(caseInDb.history.length === 1, '이력에 실패한 전이 내역 추가되지 않음');

    const ledger = db.getRaw(`maternity_deductions/deduct_${companyId}_${caseId}`);
    assert(!ledger, '차감 원장 문서 미생성 확인');
  }

  // --------------------------------------------------------------------------
  // [Test 12] [R2-8 2/4-A-⑥-9] 동일 사건 재차감 방지 (이미 deductionInfo가 있는 사건)
  // --------------------------------------------------------------------------
  console.log('\n[Test 12] 동일 사건 재차감 방지 (이미 deductionInfo가 있는 사건)');
  {
    const db = new MockFirestore();
    const companyId = 'comp_retransition_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '재전이 기업',
      currentPlanId: 'plan_standard',
      purchasedMaternityTickets: 5,
    });

    const caseId = 'case_already_deducted_1';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_r1',
      workType: 'MATERNITY_LEAVE',
      status: 'UNDER_REVIEW',
      deductionInfo: {
        deductionId: `deduct_${companyId}_${caseId}`,
        source: 'MONTHLY_FREE',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 12-1: allowSkipIfAlreadyDeducted: true 로 UNDER_REVIEW -> IN_PROGRESS 전이
    const res = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        targetStatus: 'IN_PROGRESS',
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );

    assert(res.success === true, '재차감 없이 상태 전이 성공');
    assert(res.alreadyDeducted === true, 'alreadyDeducted 플래그 반환');

    const comp = db.getRaw(`companies/${companyId}`);
    assert(comp.purchasedMaternityTickets === 5, '추가 차감 없이 이용권 5개 그대로 유지');

    const caseInDb = db.getRaw(`maternity_cases/${caseId}`);
    assert(caseInDb.status === 'IN_PROGRESS', '상태가 IN_PROGRESS로 업데이트됨');

    // 12-2: allowSkipIfAlreadyDeducted 없이 일반 차감 재시도 시 ALREADY_DEDUCTED 차단
    try {
      await executeMaternityDeductionTransaction(
        { caller, companyId, caseId },
        db
      );
      assert(false, '동일 사건 재차감은 차단되어야 합니다.');
    } catch (err: any) {
      assert(err.code === 'ALREADY_DEDUCTED', 'ALREADY_DEDUCTED 에러 차단 확인');
    }
  }

  // --------------------------------------------------------------------------
  // [Test 13] [R2-8 2/4-A-⑥-9] 동시 요청 초과 차감 방지 (상태 전이 경합)
  // --------------------------------------------------------------------------
  console.log('\n[Test 13] 동시 요청 초과 차감 방지 (상태 전이 경합)');
  {
    const db = new MockFirestore();
    const companyId = 'comp_race_trans_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '동시성 전이 기업',
      currentPlanId: 'plan_basic',
      purchasedMaternityTickets: 1, // 선불 잔여 딱 1회
    });

    // 5건의 APPLIED 사건 준비
    for (let i = 1; i <= 5; i++) {
      db.setRaw(`maternity_cases/case_race_${i}`, {
        id: `case_race_${i}`,
        companyId,
        employeeId: `emp_${i}`,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-08',
      });
    }

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };
    const promises = Array.from({ length: 5 }, (_, i) =>
      executeMaternityDeductionTransaction(
        {
          caller,
          companyId,
          caseId: `case_race_${i + 1}`,
          targetStatus: 'UNDER_REVIEW',
        },
        db
      )
        .then((res) => ({ status: 'fulfilled' as const, res }))
        .catch((err) => ({ status: 'rejected' as const, err }))
    );

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = results.filter((r) => r.status === 'rejected').length;

    assert(successCount === 1, `정확히 1건만 UNDER_REVIEW 전이 및 차감 성공 (실제: ${successCount})`);
    assert(rejectedCount === 4, `초과 4건은 QUOTA_EXHAUSTED로 거부 (실제: ${rejectedCount})`);

    const comp = db.getRaw(`companies/${companyId}`);
    assert(comp.purchasedMaternityTickets === 0, '선불 이용권 0회로 정확히 고정 (음수 발생 없음)');

    // 거부된 4건의 상태가 APPLIED로 보존되었는지 검증
    let retainedAppliedCount = 0;
    for (let i = 1; i <= 5; i++) {
      const c = db.getRaw(`maternity_cases/case_race_${i}`);
      if (c.status === 'APPLIED') retainedAppliedCount++;
    }
    assert(retainedAppliedCount === 4, '실패한 4건 모두 APPLIED 상태로 안전하게 보존됨');
  }

  // --------------------------------------------------------------------------
  // [Test 14] [R2-8 2/4-A-⑥-9] 트랜잭션 도중 오류 발생 시 전체 Rollback (원자성)
  // --------------------------------------------------------------------------
  console.log('\n[Test 14] 트랜잭션 도중 오류 발생 시 전체 Rollback (원자성)');
  {
    const db = new MockFirestore();
    const companyId = 'comp_atomic_err_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '원자성 검증 기업',
      currentPlanId: 'plan_standard',
      purchasedMaternityTickets: 3,
    });

    // 취소된 사건 준비 (취소 건 차감 시도시 INVALID_STATE 오류 유발)
    const caseId = 'case_cancelled_err';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_c1',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    try {
      await executeMaternityDeductionTransaction(
        { caller, companyId, caseId, targetStatus: 'UNDER_REVIEW' },
        db
      );
      assert(false, 'CANCELLED 건 전이 시도는 에러여야 함');
    } catch (err: any) {
      assert(err.code === 'INVALID_STATE', 'INVALID_STATE 에러 발생');
    }

    const caseInDb = db.getRaw(`maternity_cases/${caseId}`);
    assert(caseInDb.status === 'CANCELLED', '사건 상태 롤백되어 CANCELLED 유지');
    assert(!caseInDb.deductionInfo, '사건 deductionInfo 미기록 (롤백)');

    const compInDb = db.getRaw(`companies/${companyId}`);
    assert(compInDb.purchasedMaternityTickets === 3, '회사 티켓 3회 그대로 보존 (롤백)');
    assert(!db.getRaw(`maternity_deductions/deduct_${companyId}_${caseId}`), '원장 미생성 (롤백)');
  }

  // --------------------------------------------------------------------------
  // [Test 15] [R2-8 2/4-A-⑥-10] 담당 노무사 최초 배정 차감 (STANDARD 무료분 & PREPAID 선불권)
  // --------------------------------------------------------------------------
  console.log('\n[Test 15] 담당 노무사 최초 배정 차감 (STANDARD 무료분 & PREPAID 선불권)');
  {
    const db = new MockFirestore();
    const companyIdStd = 'comp_std_attorney_1';
    db.setRaw(`companies/${companyIdStd}`, {
      id: companyIdStd,
      companyName: '스탠다드 노무사 배정 기업',
      currentPlanId: 'plan_standard',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
    });

    const caseIdStd = 'case_attorney_std_1';
    db.setRaw(`maternity_cases/${caseIdStd}`, {
      id: caseIdStd,
      companyId: companyIdStd,
      employeeId: 'emp_att_1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
      createdAt: '2026-10-08T00:00:00Z',
      history: [],
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN', displayName: '담당관리자' };

    // STANDARD: 담당 노무사 최초 배정 -> MONTHLY_FREE 1회 차감 및 assignedAttorneyId 기록
    const resStd = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId: companyIdStd,
        caseId: caseIdStd,
        assignedAttorneyId: 'attorney_kim',
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );

    assert(resStd.success === true, 'STANDARD 담당 노무사 배정 차감 성공');
    assert(resStd.source === 'MONTHLY_FREE', 'STANDARD 월 무료 5회분에서 차감');
    assert(resStd.alreadyDeducted === false, '최초 배정이므로 신규 차감 처리');

    const caseStdInDb = db.getRaw(`maternity_cases/${caseIdStd}`);
    assert(caseStdInDb.assignedAttorneyId === 'attorney_kim', '사건에 assignedAttorneyId 원자적 저장');
    assert(caseStdInDb.deductionInfo?.source === 'MONTHLY_FREE', '사건에 deductionInfo 기록');
    assert(
      caseStdInDb.history?.some((h: any) => h.action === '담당 노무사 배정'),
      '사건 처리 이력에 담당 노무사 배정 기록 추가'
    );

    const ledgerStd = db.getRaw(`maternity_deductions/deduct_${companyIdStd}_${caseIdStd}`);
    assert(ledgerStd && ledgerStd.status === 'DEDUCTED', '차감 원장 정상 생성');

    // BASIC: 선불 이용권 차감 검증
    const companyIdBasic = 'comp_basic_attorney_1';
    db.setRaw(`companies/${companyIdBasic}`, {
      id: companyIdBasic,
      companyName: '베이직 노무사 배정 기업',
      currentPlanId: 'plan_basic',
      purchasedMaternityTickets: 3,
    });

    const caseIdBasic = 'case_attorney_basic_1';
    db.setRaw(`maternity_cases/${caseIdBasic}`, {
      id: caseIdBasic,
      companyId: companyIdBasic,
      employeeId: 'emp_att_2',
      workType: 'REDUCED_HOURS',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
    });

    const resBasic = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId: companyIdBasic,
        caseId: caseIdBasic,
        assignedAttorneyId: 'attorney_park',
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );

    assert(resBasic.success === true, 'BASIC 담당 노무사 배정 차감 성공');
    assert(resBasic.source === 'PREPAID_TICKET', 'BASIC 선불 이용권에서 차감');
    assert(resBasic.remainingPurchasedTickets === 2, '선불 이용권 잔여 2회');

    const compBasicInDb = db.getRaw(`companies/${companyIdBasic}`);
    assert(compBasicInDb.purchasedMaternityTickets === 2, '회사 티켓 1회 원자적 감소');
    const caseBasicInDb = db.getRaw(`maternity_cases/${caseIdBasic}`);
    assert(caseBasicInDb.assignedAttorneyId === 'attorney_park', '베이직 사건에 assignedAttorneyId 원자적 저장');
  }

  // --------------------------------------------------------------------------
  // [Test 16] [R2-8 2/4-A-⑥-10] 보완요청 최초 발송 차감 (SUPPLEMENT_REQUESTED 및 supplementRequest 원자적 저장)
  // --------------------------------------------------------------------------
  console.log('\n[Test 16] 보완요청 최초 발송 차감 (SUPPLEMENT_REQUESTED 및 supplementRequest 원자적 저장)');
  {
    const db = new MockFirestore();
    const companyId = 'comp_supp_deduct_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '보완요청 차감 기업',
      currentPlanId: 'plan_standard',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
    });

    const caseId = 'case_supp_1';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_supp_1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
      history: [],
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN', displayName: '담당노무사' };

    const supplementReq = {
      content: '출산증명서 및 급여대장 사본 추가 제출 요망',
      requestedAt: '2026-10-08T10:00:00Z',
      requestedById: 'admin_1',
      requestedByName: '담당노무사',
    };

    const res = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        targetStatus: 'SUPPLEMENT_REQUESTED',
        extraCaseUpdates: { supplementRequest: supplementReq },
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );

    assert(res.success === true, '보완요청 최초 발송 시 차감 트랜잭션 성공');
    assert(res.source === 'MONTHLY_FREE', '무료 횟수에서 차감');
    assert(res.alreadyDeducted === false, '최초 착수이므로 신규 차감');

    const caseInDb = db.getRaw(`maternity_cases/${caseId}`);
    assert(caseInDb.status === 'SUPPLEMENT_REQUESTED', '사건 상태 SUPPLEMENT_REQUESTED로 원자적 전이');
    assert(caseInDb.supplementRequest?.content === supplementReq.content, '사건에 supplementRequest 내용 원자적 저장');
    assert(caseInDb.deductionInfo?.deductionId === res.deductionId, '사건에 deductionInfo 정상 기록');

    const ledger = db.getRaw(`maternity_deductions/deduct_${companyId}_${caseId}`);
    assert(ledger && ledger.status === 'DEDUCTED', '차감 원장 정상 생성');
  }

  // --------------------------------------------------------------------------
  // [Test 17] [R2-8 2/4-A-⑥-10] 잔여 0회 시 각각 전체 rollback (담당자 배정 금지, 보완요청 금지)
  // --------------------------------------------------------------------------
  console.log('\n[Test 17] 잔여 0회 시 각각 전체 rollback (담당자 배정 금지, 보완요청 금지)');
  {
    const db = new MockFirestore();
    const companyId = 'comp_zero_rollback_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '잔여 0회 기업',
      currentPlanId: 'plan_basic', // 베이직 플랜 (월 무료 0회)
      purchasedMaternityTickets: 0, // 선불 0회 -> 총 잔여 0회
    });

    const caseId1 = 'case_zero_attorney';
    db.setRaw(`maternity_cases/${caseId1}`, {
      id: caseId1,
      companyId,
      employeeId: 'emp_z1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
    });

    const caseId2 = 'case_zero_supp';
    db.setRaw(`maternity_cases/${caseId2}`, {
      id: caseId2,
      companyId,
      employeeId: 'emp_z2',
      workType: 'MATERNITY_LEAVE',
      status: 'DOCS_COLLECTING',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 1. 잔여 0회 상태에서 담당 노무사 배정 시도 -> 전체 롤백 검증
    try {
      await executeMaternityDeductionTransaction(
        {
          caller,
          companyId,
          caseId: caseId1,
          assignedAttorneyId: 'attorney_choi',
          allowSkipIfAlreadyDeducted: true,
        },
        db
      );
      assert(false, '잔여 0회 시 담당 노무사 배정 차감은 QUOTA_EXHAUSTED 에러여야 함');
    } catch (err: any) {
      assert(err.code === 'QUOTA_EXHAUSTED', 'QUOTA_EXHAUSTED 에러 정상 발생');
    }

    const case1InDb = db.getRaw(`maternity_cases/${caseId1}`);
    assert(!case1InDb.assignedAttorneyId, '차감 실패 시 assignedAttorneyId 배정 금지 (롤백)');
    assert(!case1InDb.deductionInfo, '차감 정보 미생성 (롤백)');
    assert(!db.getRaw(`maternity_deductions/deduct_${companyId}_${caseId1}`), '원장 미생성 (롤백)');

    // 2. 잔여 0회 상태에서 보완요청 발송 시도 -> 전체 롤백 검증
    try {
      await executeMaternityDeductionTransaction(
        {
          caller,
          companyId,
          caseId: caseId2,
          targetStatus: 'SUPPLEMENT_REQUESTED',
          extraCaseUpdates: {
            supplementRequest: { content: '서류 추가', requestedAt: '2026-10-08T10:00:00Z', requestedById: 'admin_1' },
          },
          allowSkipIfAlreadyDeducted: true,
        },
        db
      );
      assert(false, '잔여 0회 시 보완요청 발송은 QUOTA_EXHAUSTED 에러여야 함');
    } catch (err: any) {
      assert(err.code === 'QUOTA_EXHAUSTED', 'QUOTA_EXHAUSTED 에러 정상 발생');
    }

    const case2InDb = db.getRaw(`maternity_cases/${caseId2}`);
    assert(case2InDb.status === 'DOCS_COLLECTING', '사건 상태가 SUPPLEMENT_REQUESTED로 바뀌지 않고 DOCS_COLLECTING 유지 (롤백)');
    assert(!case2InDb.supplementRequest, '보완요청 데이터 미저장 (롤백)');
    assert(!case2InDb.deductionInfo, '차감 정보 미생성 (롤백)');
    assert(!db.getRaw(`maternity_deductions/deduct_${companyId}_${caseId2}`), '원장 미생성 (롤백)');
  }

  // --------------------------------------------------------------------------
  // [Test 18] [R2-8 2/4-A-⑥-10] 상태전이 후 담당자 배정 시 재차감 없음
  // --------------------------------------------------------------------------
  console.log('\n[Test 18] 상태전이 후 담당자 배정 시 재차감 없음');
  {
    const db = new MockFirestore();
    const companyId = 'comp_seq_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '순차 트리거 기업 1',
      currentPlanId: 'plan_basic',
      purchasedMaternityTickets: 5,
    });

    const caseId = 'case_seq_1';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_s1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 1단계: UNDER_REVIEW 상태 전이로 최초 1회 차감 실행
    const res1 = await executeMaternityDeductionTransaction(
      { caller, companyId, caseId, targetStatus: 'UNDER_REVIEW', allowSkipIfAlreadyDeducted: true },
      db
    );
    assert(res1.success === true && res1.alreadyDeducted === false, '1단계: 상태 전이 최초 차감 성공');
    assert(res1.remainingPurchasedTickets === 4, '선불 이용권 5 -> 4회 감소');

    // 2단계: 이미 차감된 사건에 담당 노무사 배정
    const res2 = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        assignedAttorneyId: 'attorney_master',
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );
    assert(res2.success === true, '2단계: 담당 노무사 배정 성공');
    assert(res2.alreadyDeducted === true, '이미 차감된 사건이므로 재차감 스킵');
    assert(res2.deductionId === res1.deductionId, '기존 deductionId 유지');

    const compInDb = db.getRaw(`companies/${companyId}`);
    assert(compInDb.purchasedMaternityTickets === 4, '이용권 추가 차감 없음 (4회 그대로 유지)');

    const caseInDb = db.getRaw(`maternity_cases/${caseId}`);
    assert(caseInDb.assignedAttorneyId === 'attorney_master', 'assignedAttorneyId 정상 배정');
    assert(caseInDb.status === 'UNDER_REVIEW', '기존 상태 유지');
  }

  // --------------------------------------------------------------------------
  // [Test 19] [R2-8 2/4-A-⑥-10] 담당자 배정 후 상태전이 시 재차감 없음
  // --------------------------------------------------------------------------
  console.log('\n[Test 19] 담당자 배정 후 상태전이 시 재차감 없음');
  {
    const db = new MockFirestore();
    const companyId = 'comp_seq_2';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '순차 트리거 기업 2',
      currentPlanId: 'plan_basic',
      purchasedMaternityTickets: 3,
    });

    const caseId = 'case_seq_2';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_s2',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 1단계: 담당 노무사 먼저 배정 -> 최초 1회 차감 실행
    const res1 = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        assignedAttorneyId: 'attorney_first',
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );
    assert(res1.success === true && res1.alreadyDeducted === false, '1단계: 담당자 배정 최초 차감 성공');
    assert(res1.remainingPurchasedTickets === 2, '선불 이용권 3 -> 2회 감소');

    // 2단계: 그 후 UNDER_REVIEW 또는 IN_PROGRESS 상태 전이 실행
    const res2 = await executeMaternityDeductionTransaction(
      { caller, companyId, caseId, targetStatus: 'IN_PROGRESS', allowSkipIfAlreadyDeducted: true },
      db
    );
    assert(res2.success === true && res2.alreadyDeducted === true, '2단계: 상태 전이 시 재차감 스킵');

    const compInDb = db.getRaw(`companies/${companyId}`);
    assert(compInDb.purchasedMaternityTickets === 2, '이용권 추가 차감 없음 (2회 유지)');

    const caseInDb = db.getRaw(`maternity_cases/${caseId}`);
    assert(caseInDb.status === 'IN_PROGRESS', '상태 IN_PROGRESS로 정상 변경');
    assert(caseInDb.assignedAttorneyId === 'attorney_first', '기존 배정된 노무사 유지');
  }

  // --------------------------------------------------------------------------
  // [Test 20] [R2-8 2/4-A-⑥-10] 보완요청 후 UNDER_REVIEW 복귀 시 재차감 없음
  // --------------------------------------------------------------------------
  console.log('\n[Test 20] 보완요청 후 UNDER_REVIEW 복귀 시 재차감 없음');
  {
    const db = new MockFirestore();
    const companyId = 'comp_supp_cycle_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '보완요청 사이클 기업',
      currentPlanId: 'plan_basic',
      purchasedMaternityTickets: 2,
    });

    const caseId = 'case_supp_cycle';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_sc1',
      workType: 'MATERNITY_LEAVE',
      status: 'DOCS_COLLECTING',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 1단계: 보완요청 발송 -> 최초 1회 차감 발생 (티켓 2 -> 1)
    const res1 = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        targetStatus: 'SUPPLEMENT_REQUESTED',
        extraCaseUpdates: { supplementRequest: { content: '보완 요청', requestedAt: '2026-10-08T00:00:00Z', requestedById: 'admin_1' } },
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );
    assert(res1.success === true && res1.alreadyDeducted === false, '1단계: 보완요청 발송 시 차감 성공');
    assert(res1.remainingPurchasedTickets === 1, '티켓 1회 감소');

    // 2단계: 기업이 보완하여 UNDER_REVIEW로 복귀
    const res2 = await executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        targetStatus: 'UNDER_REVIEW',
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );
    assert(res2.success === true && res2.alreadyDeducted === true, '2단계: UNDER_REVIEW 복귀 시 재차감 스킵');

    const compInDb = db.getRaw(`companies/${companyId}`);
    assert(compInDb.purchasedMaternityTickets === 1, '티켓 추가 차감 없음 (1회 유지)');

    const caseInDb = db.getRaw(`maternity_cases/${caseId}`);
    assert(caseInDb.status === 'UNDER_REVIEW', '상태 UNDER_REVIEW로 정상 복귀');
  }

  // --------------------------------------------------------------------------
  // [Test 21] [R2-8 2/4-A-⑥-10] 동시 트리거 발생 시 사건당 정확히 1회만 차감
  // --------------------------------------------------------------------------
  console.log('\n[Test 21] 동시 트리거 발생 시 사건당 정확히 1회만 차감');
  {
    const db = new MockFirestore();
    const companyId = 'comp_concurrent_triggers_1';
    db.setRaw(`companies/${companyId}`, {
      id: companyId,
      companyName: '동시 트리거 기업',
      currentPlanId: 'plan_basic',
      purchasedMaternityTickets: 5,
    });

    const caseId = 'case_concurrent_trig_1';
    db.setRaw(`maternity_cases/${caseId}`, {
      id: caseId,
      companyId,
      employeeId: 'emp_ct1',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      applicationDate: '2026-10-08',
    });

    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 동일 사건에 대해 [담당자 배정]과 [보완요청 발송]과 [UNDER_REVIEW 전이] 3개 트리거를 동시 실행
    const p1 = executeMaternityDeductionTransaction(
      { caller, companyId, caseId, assignedAttorneyId: 'attorney_a', allowSkipIfAlreadyDeducted: true },
      db
    );
    const p2 = executeMaternityDeductionTransaction(
      {
        caller,
        companyId,
        caseId,
        targetStatus: 'SUPPLEMENT_REQUESTED',
        extraCaseUpdates: { supplementRequest: { content: '동시 보완요청', requestedAt: '2026-10-08T00:00:00Z', requestedById: 'admin_1' } },
        allowSkipIfAlreadyDeducted: true,
      },
      db
    );
    const p3 = executeMaternityDeductionTransaction(
      { caller, companyId, caseId, targetStatus: 'UNDER_REVIEW', allowSkipIfAlreadyDeducted: true },
      db
    );

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    const results = [r1, r2, r3];

    // 3개 요청 중 최초 실행된 1건만 alreadyDeducted === false, 나머지 2건은 alreadyDeducted === true
    const newDeductCount = results.filter((r) => r.alreadyDeducted === false).length;
    const skippedCount = results.filter((r) => r.alreadyDeducted === true).length;

    assert(newDeductCount === 1, `정확히 1건만 최초 신규 차감 (실제: ${newDeductCount})`);
    assert(skippedCount === 2, `나머지 2건은 재차감 방지로 스킵 (실제: ${skippedCount})`);

    const compInDb = db.getRaw(`companies/${companyId}`);
    assert(compInDb.purchasedMaternityTickets === 4, '티켓은 정확히 1회만 차감되어 4회 남음');
  }

  // --------------------------------------------------------------------------
  // [Test 22] [R2-8 2/4-C-⑨] STANDARD 월 5회 무료 구독 정합성 트랜잭션 실측 검증
  // --------------------------------------------------------------------------
  console.log('\n[Test 22] [R2-8 2/4-C-⑨] STANDARD 월 5회 무료 구독 정합성 트랜잭션 실측 검증');
  {
    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 22-1: currentPlanId=STANDARD이나 subscription=ACTIVE BASIC (무료 0회, 티켓 없으면 거부)
    {
      const db = new MockFirestore();
      const compId = 'comp_mismatch_std_basic';
      db.setRaw(`companies/${compId}`, {
        id: compId,
        companyName: '불일치 기업 1',
        currentPlanId: 'STANDARD',
        subscription: { planCode: 'BASIC', status: 'ACTIVE' },
        purchasedMaternityTickets: 0,
      });
      db.setRaw('maternity_cases/case_mismatch_1', {
        id: 'case_mismatch_1',
        companyId: compId,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-09',
      });
      try {
        await executeMaternityDeductionTransaction({ caller, companyId: compId, caseId: 'case_mismatch_1' }, db);
        assert(false, 'currentPlanId=STANDARD, sub=ACTIVE BASIC은 무료 0회이므로 거부되어야 함');
      } catch (err: any) {
        assert(err.code === 'QUOTA_EXHAUSTED', '22-1: sub=BASIC 기업은 무료 5회 미부여(QUOTA_EXHAUSTED)');
      }
    }

    // 22-2: currentPlanId=BASIC이나 subscription=ACTIVE STANDARD (Source of Truth로 무료 5회 부여)
    {
      const db = new MockFirestore();
      const compId = 'comp_mismatch_basic_std';
      db.setRaw(`companies/${compId}`, {
        id: compId,
        companyName: '불일치 기업 2',
        currentPlanId: 'BASIC',
        subscription: { planCode: 'STANDARD', status: 'ACTIVE' },
        purchasedMaternityTickets: 0,
      });
      db.setRaw('maternity_cases/case_mismatch_2', {
        id: 'case_mismatch_2',
        companyId: compId,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-09',
      });
      const res = await executeMaternityDeductionTransaction({ caller, companyId: compId, caseId: 'case_mismatch_2' }, db);
      assert(res.success === true, '22-2: sub=STANDARD 기업은 무료 차감 성공');
      assert(res.source === 'MONTHLY_FREE', '22-2: MONTHLY_FREE 출처로 차감');
      assert(res.remainingMonthlyFree === 4, '22-2: 무료 잔여 4회');
    }

    // 22-3: CANCELLED STANDARD (무료 0회 거부)
    {
      const db = new MockFirestore();
      const compId = 'comp_cancelled_std';
      db.setRaw(`companies/${compId}`, {
        id: compId,
        companyName: '해지 기업',
        currentPlanId: 'STANDARD',
        subscription: { planCode: 'STANDARD', status: 'CANCELLED', startDate: '2026-01-01', endDate: '2026-12-31' },
        purchasedMaternityTickets: 0,
      });
      db.setRaw('maternity_cases/case_cancelled_1', {
        id: 'case_cancelled_1',
        companyId: compId,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-09',
      });
      try {
        await executeMaternityDeductionTransaction({ caller, companyId: compId, caseId: 'case_cancelled_1' }, db);
        assert(false, 'CANCELLED STANDARD는 무료 0회이므로 거부되어야 함');
      } catch (err: any) {
        assert(err.code === 'QUOTA_EXHAUSTED', '22-3: CANCELLED STANDARD 무료 0회 거부 확인');
      }
    }

    // 22-4: 만료된 STANDARD + 선불 이용권 보유 (무료분 0회, 선불 이용권 1회 정상 차감)
    {
      const db = new MockFirestore();
      const compId = 'comp_expired_with_tickets';
      db.setRaw(`companies/${compId}`, {
        id: compId,
        companyName: '만료 기업(티켓보유)',
        currentPlanId: 'STANDARD',
        subscription: { planCode: 'STANDARD', status: 'EXPIRED' },
        purchasedMaternityTickets: 2, // 선불 이용권 2회 보유
      });
      db.setRaw('maternity_cases/case_expired_1', {
        id: 'case_expired_1',
        companyId: compId,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-09',
      });
      const res = await executeMaternityDeductionTransaction({ caller, companyId: compId, caseId: 'case_expired_1' }, db);
      assert(res.success === true, '22-4: 만료 STANDARD라도 선불 이용권으로 차감 성공');
      assert(res.source === 'PREPAID_TICKET', '22-4: PREPAID_TICKET 출처로 차감');
      assert(res.remainingMonthlyFree === 0, '22-4: 무료 잔여는 0회');
      assert(res.remainingPurchasedTickets === 1, '22-4: 선불 이용권 2 -> 1회 감소');
      const compInDb = db.getRaw(`companies/${compId}`);
      assert(compInDb.purchasedMaternityTickets === 1, '22-4: 기업 문서 선불 이용권 1회 감소 반영');
    }
  }

  // --------------------------------------------------------------------------
  // [Test 23] [R2-8 2/4-C-⑨-3] 모성보호 월 무료 5회 실제 업무 착수 시점 및 월 귀속 검증
  // --------------------------------------------------------------------------
  console.log('\n[Test 23] [R2-8 2/4-C-⑨-3] 모성보호 월 무료 5회 실제 업무 착수 시점 및 월 귀속 검증');
  {
    const caller: MaternityDeductionCallerContext = { uid: 'admin_1', role: 'ADMIN' };

    // 23-1: 10월 신청(2026-10-25), 11월 3일 업무 착수, STANDARD 구독기간이 10월말(2026-10-31)로 만료된 경우
    // -> 11월 3일 기준 STANDARD 구독 만료이므로 무료 횟수 적용 불가 (QUOTA_EXHAUSTED)
    {
      const db = new MockFirestore();
      const compId = 'comp_c9_3_expired';
      db.setRaw(`companies/${compId}`, {
        id: compId,
        companyName: '10월 구독 만료 기업',
        currentPlanId: 'STANDARD',
        subscription: {
          planCode: 'STANDARD',
          status: 'ACTIVE',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        },
        purchasedMaternityTickets: 0,
      });

      db.setRaw('maternity_cases/case_c9_1', {
        id: 'case_c9_1',
        companyId: compId,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-25', // 10월 25일 신청
        createdAt: '2026-10-25T09:00:00Z',
      });

      try {
        await executeMaternityDeductionTransaction(
          {
            caller,
            companyId: compId,
            caseId: 'case_c9_1',
            referenceDateString: '2026-11-03', // 실제 업무 착수: 11월 3일
            targetStatus: 'UNDER_REVIEW',
            statusChangeHistoryItem: {
              action: '상태 변경: 검토',
              previousStatus: 'APPLIED',
              newStatus: 'UNDER_REVIEW',
              timestamp: '2026-11-03T10:00:00Z',
              actor: '관리자',
            },
          },
          db
        );
        assert(false, '11월 3일 착수 시점 구독 만료이므로 무료 횟수가 적용되지 않고 거부되어야 함');
      } catch (err: any) {
        assert(err.code === 'QUOTA_EXHAUSTED', '23-1: 11월 3일 착수 시점 STANDARD 만료로 무료 혜택 불가 확인');
      }
    }

    // 23-2: 10월말 구독 만료 기업이라도 선불 이용권 보유 시 선불권으로 정상 차감
    {
      const db = new MockFirestore();
      const compId = 'comp_c9_3_expired_prepaid';
      db.setRaw(`companies/${compId}`, {
        id: compId,
        companyName: '10월 구독 만료 기업 (선불권 보유)',
        currentPlanId: 'STANDARD',
        subscription: {
          planCode: 'STANDARD',
          status: 'ACTIVE',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        },
        purchasedMaternityTickets: 1, // 선불권 1회 보유
      });

      db.setRaw('maternity_cases/case_c9_2', {
        id: 'case_c9_2',
        companyId: compId,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-25',
        createdAt: '2026-10-25T09:00:00Z',
      });

      const res = await executeMaternityDeductionTransaction(
        {
          caller,
          companyId: compId,
          caseId: 'case_c9_2',
          referenceDateString: '2026-11-03',
          targetStatus: 'UNDER_REVIEW',
          statusChangeHistoryItem: {
            action: '상태 변경: 검토',
            previousStatus: 'APPLIED',
            newStatus: 'UNDER_REVIEW',
            timestamp: '2026-11-03T10:00:00Z',
            actor: '관리자',
          },
        },
        db
      );

      assert(res.success === true, '23-2: 무료 횟수 미적용 시 선불 이용권으로 차감 성공');
      assert(res.source === 'PREPAID_TICKET', '23-2: 차감 출처는 PREPAID_TICKET');
      assert(res.yearMonth === '2026-11', '23-2: 차감 귀속 연월은 11월(2026-11)');
      assert(res.remainingMonthlyFree === 0, '23-2: 잔여 무료 0회');
      assert(res.remainingPurchasedTickets === 0, '23-2: 선불권 1 -> 0회 차감');
    }

    // 23-3: 10월 신청(2026-10-25), 11월 3일 업무 착수, 11월 STANDARD 구독 유효
    // -> 11월 업무 착수일에 STANDARD 유효하므로 11월 무료 5회에서 1회 차감 (귀속: 2026-11)
    {
      const db = new MockFirestore();
      const compId = 'comp_c9_3_nov_valid';
      db.setRaw(`companies/${compId}`, {
        id: compId,
        companyName: '11월 STANDARD 유효 기업',
        currentPlanId: 'STANDARD',
        subscription: {
          planCode: 'STANDARD',
          status: 'ACTIVE',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
        },
        purchasedMaternityTickets: 0,
      });

      db.setRaw('maternity_cases/case_c9_3', {
        id: 'case_c9_3',
        companyId: compId,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-25', // 10월 신청
        createdAt: '2026-10-25T09:00:00Z',
      });

      const res = await executeMaternityDeductionTransaction(
        {
          caller,
          companyId: compId,
          caseId: 'case_c9_3',
          referenceDateString: '2026-11-03', // 11월 3일 업무 착수
          targetStatus: 'UNDER_REVIEW',
          statusChangeHistoryItem: {
            action: '상태 변경: 검토',
            previousStatus: 'APPLIED',
            newStatus: 'UNDER_REVIEW',
            timestamp: '2026-11-03T10:00:00Z',
            actor: '담당 노무사',
          },
        },
        db
      );

      assert(res.success === true, '23-3: 11월 착수 시 11월 유효 STANDARD 무료 차감 성공');
      assert(res.source === 'MONTHLY_FREE', '23-3: MONTHLY_FREE 출처로 차감');
      assert(res.yearMonth === '2026-11', '23-3: 월 귀속은 실제 착수일이 속한 11월 (2026-11)');
      assert(res.remainingMonthlyFree === 4, '23-3: 11월 무료 횟수 5회 중 1회 차감되어 4회 남음');

      // 원장 확인
      const ledger = db.getRaw(`maternity_deductions/deduct_${compId}_case_c9_3`);
      assert(ledger.yearMonth === '2026-11', '23-3: 차감 원장의 yearMonth가 2026-11로 기록');
      assert(ledger.source === 'MONTHLY_FREE', '23-3: 원장의 source가 MONTHLY_FREE');

      // 사건 확인
      const caseDoc = db.getRaw('maternity_cases/case_c9_3');
      assert(caseDoc.deductionInfo.yearMonth === '2026-11', '23-3: 사건 deductionInfo.yearMonth가 2026-11');
      assert(caseDoc.status === 'UNDER_REVIEW', '23-3: 사건 상태가 UNDER_REVIEW로 전이');
    }

    // 23-4: 복원 시 월 처리 확인 (당월 취소 복구 vs 익월 취소 소멸)
    {
      const { evaluateMaternityRestorationEligibility } = await import('../services/maternityUsageService');
      const testCase = {
        id: 'case_c9_rest_1',
        companyId: 'comp_c9_rest',
        status: 'CANCELLED' as const,
        deductionInfo: {
          deductionId: 'ded_c9_1',
          source: 'MONTHLY_FREE' as const,
          yearMonth: '2026-11',
          deductedAt: '2026-11-03T10:00:00Z',
        },
      } as any;
      const testLedger = {
        deductionId: 'ded_c9_1',
        companyId: 'comp_c9_rest',
        maternityCaseId: 'case_c9_rest_1',
        source: 'MONTHLY_FREE' as const,
        yearMonth: '2026-11',
        status: 'DEDUCTED' as const,
      } as any;

      // 1) 11월 내 취소 -> 당월 복구 성공 (11월 무료 횟수 반환)
      const sameMonthRest = evaluateMaternityRestorationEligibility({
        maternityCase: testCase,
        ledgerItem: testLedger,
        requestCompanyId: 'comp_c9_rest',
        cancellationYearMonth: '2026-11',
      });
      assert(sameMonthRest.canRestore === true, '23-4: 11월 착수 차감 건의 11월 당월 취소는 복구 허용');
      assert(sameMonthRest.restorableSource === 'MONTHLY_FREE', '23-4: 복구 출처는 MONTHLY_FREE');

      // 2) 12월 취소 -> 익월 취소로 무료 횟수 이월 불가 및 소멸
      const diffMonthRest = evaluateMaternityRestorationEligibility({
        maternityCase: testCase,
        ledgerItem: testLedger,
        requestCompanyId: 'comp_c9_rest',
        cancellationYearMonth: '2026-12',
      });
      assert(diffMonthRest.canRestore === false, '23-4: 11월 차감 건의 12월 익월 취소는 이월 불가로 복구 차단');
      assert(diffMonthRest.restorationType === 'EXPIRED_MONTHLY_FREE', '23-4: 소멸 판정(EXPIRED_MONTHLY_FREE)');
    }
  }

  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run test directly if executed via tsx
runAllTests().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
