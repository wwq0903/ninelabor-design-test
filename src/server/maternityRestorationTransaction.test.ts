/**
 * [R2-8 2/4-A-⑥-3] 모성보호 이용권 복구 트랜잭션 단위 및 동시성 검증 테스트 스위트
 * 
 * 검증 항목:
 * 1. 착수 전 취소 건 자동 복구 (COMPANY & ADMIN)
 * 2. 업무 착수 후 취소 건 관리자 승인 검증 (COMPANY 차단, ADMIN 미승인 차단, ADMIN 승인 시 성공)
 * 3. PREPAID_TICKET 선불 이용권 1회 반환 (기업 티켓 증가)
 * 4. MONTHLY_FREE 당월 취소 복구 vs 익월 취소 이월 차단 (EXPIRED_MONTHLY_FREE)
 * 5. 동일 사건 중복 복구 차단 및 동시 복구 경합 방지
 * 6. 타사 기업 격리 위반 차단
 * 7. 트랜잭션 실패 시 전체 롤백 (원자성)
 * 8. 복구 완료 원장의 차감 집계 제외 정합성 (기존 차감 로직 연계)
 */

import {
  executeMaternityRestorationTransaction,
  MaternityRestorationError,
} from './maternityRestorationTransaction';
import {
  executeMaternityDeductionTransaction,
} from './maternityDeductionTransaction';
import {
  MaternityCase,
  Company,
  MaternityDeductionCallerContext,
  MaternityDeductionLedgerItem,
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
  public store = new Map<string, { data: any; version: number }>();

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
    updateFunction: (transaction: any) => Promise<T>,
    maxRetries = 10
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const readVersions = new Map<string, number>();
      const pendingWrites = new Map<string, { type: 'set' | 'update'; data: any }>();

      const transaction = {
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
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          continue;
        }

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
        throw err;
      }
    }

    throw new Error('Transaction max retries exceeded due to concurrency conflict.');
  }
}

// ============================================================================
// Test Suites
// ============================================================================

async function runRestorationTransactionTests() {
  console.log('================================================================');
  console.log('🧪 Starting Maternity Restoration Transaction Test Suite [R2-8 2/4-A-⑥-3]');
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
  // TEST 1: 착수 전 취소 건 자동 복구 (PREPAID_TICKET 반환)
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] 착수 전 취소 건 자동 복구 및 선불 이용권 반환');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_auto',
      companyName: '자동복구기업',
      businessNumber: '111-22-33333',
      currentPlanId: 'FREE',
      purchasedMaternityTickets: 2, // 기존 2회 보유
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_auto', company);

    const caseItem: MaternityCase = {
      id: 'case_auto_1',
      companyId: 'comp_auto',
      employeeId: 'emp_1',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED', // 착수 전 단순 취소 완료
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      createdById: 'worker_1',
      updatedById: 'worker_1',
      deductionInfo: {
        deductionId: 'deduct_comp_auto_case_auto_1',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
    };
    db.setRaw('maternity_cases/case_auto_1', caseItem);

    const ledgerItem: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_auto_case_auto_1',
      deductionId: 'deduct_comp_auto_case_auto_1',
      companyId: 'comp_auto',
      maternityCaseId: 'case_auto_1',
      source: 'PREPAID_TICKET',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_auto_case_auto_1_PREPAID_TICKET',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };
    db.setRaw('maternity_deductions/deduct_comp_auto_case_auto_1', ledgerItem);

    // COMPANY 담당자 호출
    const caller: MaternityDeductionCallerContext = {
      uid: 'manager_auto',
      role: 'COMPANY',
      companyId: 'comp_auto',
      displayName: '기업담당자',
    };

    const res = await executeMaternityRestorationTransaction(
      {
        caller,
        companyId: 'comp_auto',
        caseId: 'case_auto_1',
        cancellationReason: '근로자 개인 사정으로 인한 취소',
      },
      db
    );

    assert(res.success === true, '착수 전 취소 복구 성공');
    assert(res.restoredSource === 'PREPAID_TICKET', '복구 출처: PREPAID_TICKET');
    assert(res.newPurchasedTickets === 3, '기업 선불 이용권 1회 반환 (2회 -> 3회)');

    // DB 원장 및 사건 상태 확인
    const updatedLedger = db.getRaw('maternity_deductions/deduct_comp_auto_case_auto_1');
    assert(updatedLedger.status === 'RESTORED', '원장 상태가 RESTORED로 업데이트됨');
    assert(updatedLedger.restoredByUid === 'manager_auto', '원장에 복구 처리자 기록');

    const updatedCase = db.getRaw('maternity_cases/case_auto_1');
    assert(updatedCase.status === 'CANCELLED', '사건 상태가 CANCELLED 확정');
    assert(Boolean(updatedCase.deductionInfo.restoredAt), '사건에 restoredAt 기록');
  }

  // --------------------------------------------------------------------------
  // TEST 2: 업무 착수 후 취소 건 관리자 승인 검증
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] 업무 착수 후 취소·반려 시 관리자 승인 검증');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_reviewed',
      companyName: '검토후취소기업',
      businessNumber: '222-33-44444',
      currentPlanId: 'FREE',
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_reviewed', company);

    // 노무사가 배정되어 검토(UNDER_REVIEW)에 착수한 이력이 있는 사건
    const caseItem: MaternityCase = {
      id: 'case_rev_1',
      companyId: 'comp_reviewed',
      employeeId: 'emp_2',
      workType: 'MATERNITY_LEAVE',
      status: 'UNDER_REVIEW', // 업무 착수 상태
      assignedAttorneyId: 'attorney_lee', // 노무사 배정됨
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      createdById: 'worker_2',
      updatedById: 'admin_1',
      deductionInfo: {
        deductionId: 'deduct_comp_reviewed_case_rev_1',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
      history: [
        {
          action: '신청 접수',
          timestamp: '2026-10-01T00:00:00Z',
          newStatus: 'APPLIED',
          actor: '근로자',
        },
        {
          action: '노무사 검토 배정',
          timestamp: '2026-10-02T00:00:00Z',
          previousStatus: 'APPLIED',
          newStatus: 'UNDER_REVIEW',
          actor: '이노무사',
        },
      ],
    };
    db.setRaw('maternity_cases/case_rev_1', caseItem);

    const ledgerItem: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_reviewed_case_rev_1',
      deductionId: 'deduct_comp_reviewed_case_rev_1',
      companyId: 'comp_reviewed',
      maternityCaseId: 'case_rev_1',
      source: 'PREPAID_TICKET',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_reviewed_case_rev_1_PREPAID_TICKET',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };
    db.setRaw('maternity_deductions/deduct_comp_reviewed_case_rev_1', ledgerItem);

    // 2-1: COMPANY 계정이 복구를 시도할 경우 -> ADMIN_APPROVAL_REQUIRED 에러 차단
    const companyCaller: MaternityDeductionCallerContext = {
      uid: 'manager_rev',
      role: 'COMPANY',
      companyId: 'comp_reviewed',
    };

    try {
      await executeMaternityRestorationTransaction(
        {
          caller: companyCaller,
          companyId: 'comp_reviewed',
          caseId: 'case_rev_1',
        },
        db
      );
      assert(false, '착수 후 취소 건에 대한 COMPANY 직접 복구는 차단되어야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'ADMIN_APPROVAL_REQUIRED',
        '착수 후 취소 시 COMPANY 차단 (ADMIN_APPROVAL_REQUIRED 확인)'
      );
    }

    // 2-2: ADMIN 계정이라도 adminApprovalConfirmed가 false인 경우 -> 차단
    const adminCaller: MaternityDeductionCallerContext = {
      uid: 'admin_1',
      role: 'ADMIN',
      displayName: '최고관리자',
    };

    try {
      await executeMaternityRestorationTransaction(
        {
          caller: adminCaller,
          companyId: 'comp_reviewed',
          caseId: 'case_rev_1',
          adminApprovalConfirmed: false,
        },
        db
      );
      assert(false, '관리자 승인 미확인 시 차단되어야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'ADMIN_APPROVAL_REQUIRED',
        '승인 플래그 누락 시 차단 (ADMIN_APPROVAL_REQUIRED 확인)'
      );
    }

    // 2-3: ADMIN 계정이 adminApprovalConfirmed: true로 승인 복구 시 -> 정상 처리
    const adminRes = await executeMaternityRestorationTransaction(
      {
        caller: adminCaller,
        companyId: 'comp_reviewed',
        caseId: 'case_rev_1',
        adminApprovalConfirmed: true,
        cancellationReason: '사건 초입 단계 취소로 관리자 특별 복구 승인',
      },
      db
    );

    assert(adminRes.success === true, 'ADMIN 승인 하에 정상 복구 완료');
    assert(adminRes.newPurchasedTickets === 1, '선불 이용권 1회 반환 (0회 -> 1회)');
    assert(adminRes.restorationType === 'REQUIRES_ADMIN_REVIEW', '관리자 검토 복구 유형 기록');
  }

  // --------------------------------------------------------------------------
  // TEST 3: MONTHLY_FREE 당월 취소 복구 vs 익월 취소 이월 차단
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] MONTHLY_FREE 당월 취소 복구 vs 익월 취소 이월 차단');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_std',
      companyName: '스탠다드기업',
      businessNumber: '333-44-55555',
      currentPlanId: 'STANDARD', // 월 5회 무료
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_std', company);

    const caller: MaternityDeductionCallerContext = {
      uid: 'admin_1',
      role: 'ADMIN',
    };

    // 3-1: 당월 취소 건 (2026-10 차감 -> 2026-10 취소) -> 정상 복구
    db.setRaw('maternity_cases/case_std_same', {
      id: 'case_std_same',
      companyId: 'comp_std',
      employeeId: 'emp_std_1',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-05T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
      deductionInfo: {
        deductionId: 'deduct_comp_std_case_std_same',
        source: 'MONTHLY_FREE',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
    });

    db.setRaw('maternity_deductions/deduct_comp_std_case_std_same', {
      id: 'deduct_comp_std_case_std_same',
      deductionId: 'deduct_comp_std_case_std_same',
      companyId: 'comp_std',
      maternityCaseId: 'case_std_same',
      source: 'MONTHLY_FREE',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_std_case_std_same_MONTHLY_FREE',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    const resSame = await executeMaternityRestorationTransaction(
      {
        caller,
        companyId: 'comp_std',
        caseId: 'case_std_same',
        cancellationDate: '2026-10-05T00:00:00Z',
      },
      db
    );
    assert(resSame.success === true, '당월 무료 횟수 당월 취소 복구 성공');
    assert(resSame.restorableSource === 'MONTHLY_FREE', '복구 출처: MONTHLY_FREE');

    // 3-2: 익월 취소 건 (2026-09 차감 -> 2026-10 취소) -> EXPIRED_MONTHLY_FREE 차단
    db.setRaw('maternity_cases/case_std_expired', {
      id: 'case_std_expired',
      companyId: 'comp_std',
      employeeId: 'emp_std_2',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      startDate: '2026-09-01',
      endDate: '2026-11-30',
      applicationDate: '2026-09-01',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-10-05T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
      deductionInfo: {
        deductionId: 'deduct_comp_std_case_std_expired',
        source: 'MONTHLY_FREE',
        yearMonth: '2026-09',
        deductedAt: '2026-09-01T00:00:00Z',
      },
    });

    db.setRaw('maternity_deductions/deduct_comp_std_case_std_expired', {
      id: 'deduct_comp_std_case_std_expired',
      deductionId: 'deduct_comp_std_case_std_expired',
      companyId: 'comp_std',
      maternityCaseId: 'case_std_expired',
      source: 'MONTHLY_FREE',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-09', // 9월 차감
      deductedAt: '2026-09-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_std_case_std_expired_MONTHLY_FREE',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    });

    try {
      await executeMaternityRestorationTransaction(
        {
          caller,
          companyId: 'comp_std',
          caseId: 'case_std_expired',
          cancellationDate: '2026-10-05T00:00:00Z', // 10월 취소
        },
        db
      );
      assert(false, '익월 취소 건은 무료 횟수 복구가 차단되어야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'EXPIRED_MONTHLY_FREE',
        '익월 취소 무료 횟수 이월 차단 및 소멸 (EXPIRED_MONTHLY_FREE 확인)'
      );
    }
  }

  // --------------------------------------------------------------------------
  // TEST 4: 동일 사건 중복 복구 차단 및 동시 복구 경합 방지
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] 동일 사건 중복 복구 차단 및 동시 복구 경합 방지');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_dup',
      companyName: '중복방지기업',
      businessNumber: '555-66-77777',
      currentPlanId: 'FREE',
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_dup', company);

    const caseItem: MaternityCase = {
      id: 'case_dup_1',
      companyId: 'comp_dup',
      employeeId: 'emp_dup',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
      deductionInfo: {
        deductionId: 'deduct_comp_dup_case_dup_1',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
    };
    db.setRaw('maternity_cases/case_dup_1', caseItem);

    const ledgerItem: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_dup_case_dup_1',
      deductionId: 'deduct_comp_dup_case_dup_1',
      companyId: 'comp_dup',
      maternityCaseId: 'case_dup_1',
      source: 'PREPAID_TICKET',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_dup_case_dup_1_PREPAID_TICKET',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };
    db.setRaw('maternity_deductions/deduct_comp_dup_case_dup_1', ledgerItem);

    const caller: MaternityDeductionCallerContext = {
      uid: 'admin_1',
      role: 'ADMIN',
    };

    // 4-1: 동시 복구 요청 2건 병렬 실행 (Promise.allSettled)
    const results = await Promise.allSettled([
      executeMaternityRestorationTransaction(
        { caller, companyId: 'comp_dup', caseId: 'case_dup_1' },
        db
      ),
      executeMaternityRestorationTransaction(
        { caller, companyId: 'comp_dup', caseId: 'case_dup_1' },
        db
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(fulfilled.length === 1, '동시 복구 요청 중 정확히 1건만 성공');
    assert(rejected.length === 1, '동시 복구 요청 중 1건은 중복 거부');

    // 4-2: 3차 순차 재복구 시도 -> ALREADY_RESTORED 즉시 차단
    try {
      await executeMaternityRestorationTransaction(
        { caller, companyId: 'comp_dup', caseId: 'case_dup_1' },
        db
      );
      assert(false, '이미 복구된 사건의 재복구는 차단되어야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'ALREADY_RESTORED',
        '순차 재복구 시 ALREADY_RESTORED 에러 차단 확인'
      );
    }

    // 선불 티켓이 정확히 1회만 증가했는지 확인 (0 -> 1)
    const compDoc = db.getRaw('companies/comp_dup');
    assert(compDoc.purchasedMaternityTickets === 1, '중복 복구 방지로 티켓 중복 지급 없이 정확히 1회 증가');
  }

  // --------------------------------------------------------------------------
  // TEST 5: 타 기업 사건 접근 및 복구 차단 (기업별 데이터 격리)
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] 타 기업 사건 복구 차단 (기업별 데이터 격리)');
  {
    const db = new MockFirestore();
    db.setRaw('companies/comp_target', {
      id: 'comp_target',
      companyName: '타겟기업',
      purchasedMaternityTickets: 0,
    });
    db.setRaw('maternity_cases/case_target', {
      id: 'case_target',
      companyId: 'comp_target',
      status: 'CANCELLED',
      deductionInfo: {
        deductionId: 'deduct_comp_target_case_target',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
      },
    });
    db.setRaw('maternity_deductions/deduct_comp_target_case_target', {
      id: 'deduct_comp_target_case_target',
      deductionId: 'deduct_comp_target_case_target',
      companyId: 'comp_target',
      status: 'DEDUCTED',
      source: 'PREPAID_TICKET',
      yearMonth: '2026-10',
    });

    const otherCompanyCaller: MaternityDeductionCallerContext = {
      uid: 'other_mgr',
      role: 'COMPANY',
      companyId: 'comp_other', // 다른 회사 담당자
    };

    try {
      await executeMaternityRestorationTransaction(
        {
          caller: otherCompanyCaller,
          companyId: 'comp_target',
          caseId: 'case_target',
        },
        db
      );
      assert(false, '타 기업 사건 복구는 차단되어야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'DATA_ISOLATION_VIOLATION',
        '기업별 데이터 격리 위반 차단 확인 (DATA_ISOLATION_VIOLATION)'
      );
    }
  }

  // --------------------------------------------------------------------------
  // TEST 6: 트랜잭션 도중 오류 발생 시 전체 롤백 (원자성)
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] 트랜잭션 도중 오류 발생 시 전체 롤백 (원자성)');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_rb',
      companyName: '롤백기업',
      businessNumber: '999-99-99999',
      currentPlanId: 'FREE',
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_rb', company);

    // 사건은 있으나 원장이 매칭되지 않거나 deductionInfo가 불일치하여 롤백 유발
    db.setRaw('maternity_cases/case_rb', {
      id: 'case_rb',
      companyId: 'comp_rb',
      status: 'CANCELLED',
      deductionInfo: {
        deductionId: 'deduct_comp_rb_case_rb',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
      },
    });

    // 원장의 deductionId를 고의로 불일치하게 등록
    db.setRaw('maternity_deductions/deduct_comp_rb_case_rb', {
      id: 'deduct_comp_rb_case_rb',
      deductionId: 'MISMATCH_ID', // 불일치!
      companyId: 'comp_rb',
      status: 'DEDUCTED',
      source: 'PREPAID_TICKET',
      yearMonth: '2026-10',
    });

    const caller: MaternityDeductionCallerContext = {
      uid: 'admin_1',
      role: 'ADMIN',
    };

    try {
      await executeMaternityRestorationTransaction(
        { caller, companyId: 'comp_rb', caseId: 'case_rb' },
        db
      );
      assert(false, '데이터 불일치 건은 에러가 발생해야 합니다.');
    } catch (err: any) {
      assert(
        err.code === 'NOT_ELIGIBLE_FOR_RESTORATION',
        '데이터 불일치로 에러 발생 (NOT_ELIGIBLE_FOR_RESTORATION 확인)'
      );
    }

    // 롤백 확인: 기업 티켓 0회 유지, 원장 상태 DEDUCTED 유지, 사건 restoredAt 없음
    const compDoc = db.getRaw('companies/comp_rb');
    assert(compDoc.purchasedMaternityTickets === 0, '기업 선불 티켓 변경 없음 (롤백)');

    const ledgerDoc = db.getRaw('maternity_deductions/deduct_comp_rb_case_rb');
    assert(ledgerDoc.status === 'DEDUCTED', '원장 상태 DEDUCTED 유지 (롤백)');

    const caseDoc = db.getRaw('maternity_cases/case_rb');
    assert(!caseDoc.deductionInfo.restoredAt, '사건에 restoredAt 미반영 (롤백)');
  }

  // --------------------------------------------------------------------------
  // TEST 7: 복구 완료 원장의 차감 집계 제외 정합성 (기존 차감 로직 연계)
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] 복구 완료 원장의 무료 횟수 재사용 정합성 (RESTORED 원장 집계 제외)');
  {
    const db = new MockFirestore();
    const company: Company = {
      id: 'comp_reuse',
      companyName: '재사용정합성기업',
      businessNumber: '777-77-77777',
      currentPlanId: 'STANDARD', // 월 5회 무료
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.setRaw('companies/comp_reuse', company);

    const caller: MaternityDeductionCallerContext = {
      uid: 'admin_1',
      role: 'ADMIN',
    };

    // 1) 사건 1: 차감 실행
    db.setRaw('maternity_cases/case_reuse_1', {
      id: 'case_reuse_1',
      companyId: 'comp_reuse',
      employeeId: 'emp_1',
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

    const deductRes1 = await executeMaternityDeductionTransaction(
      { caller, companyId: 'comp_reuse', caseId: 'case_reuse_1', targetYearMonth: '2026-10' },
      db
    );
    assert(deductRes1.remainingMonthlyFree === 4, '1차 차감 후 잔여 무료: 4회 (5 - 1)');

    // 2) 사건 1 취소 및 복구 실행
    const restoreRes = await executeMaternityRestorationTransaction(
      {
        caller,
        companyId: 'comp_reuse',
        caseId: 'case_reuse_1',
        cancellationReason: '취소 접수',
        cancellationDate: '2026-10-02T00:00:00Z',
      },
      db
    );
    assert(restoreRes.success === true, '사건 1 복구 성공');

    // 3) 새로운 사건 2 차감 실행
    db.setRaw('maternity_cases/case_reuse_2', {
      id: 'case_reuse_2',
      companyId: 'comp_reuse',
      employeeId: 'emp_2',
      workType: 'MATERNITY_LEAVE',
      status: 'APPLIED',
      startDate: '2026-10-03',
      endDate: '2026-12-31',
      applicationDate: '2026-10-03',
      createdAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
      createdById: 'worker',
      updatedById: 'worker',
    });

    const deductRes2 = await executeMaternityDeductionTransaction(
      { caller, companyId: 'comp_reuse', caseId: 'case_reuse_2', targetYearMonth: '2026-10' },
      db
    );

    // 복구된 사건 1이 무료 집계에서 제외되었으므로, 사건 2 차감 후 잔여 무료는 여전히 4회여야 함! (5 - 1 = 4)
    assert(
      deductRes2.remainingMonthlyFree === 4,
      `복구된 원장이 집계에서 제외되어 신규 차감 후 잔여 무료 4회 정상 유지 (실제: ${deductRes2.remainingMonthlyFree})`
    );
  }

  console.log('\n================================================================');
  console.log(`🎉 RESTORATION TRANSACTION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRestorationTransactionTests().catch((err) => {
  console.error('Restoration transaction test fatal error:', err);
  process.exit(1);
});
