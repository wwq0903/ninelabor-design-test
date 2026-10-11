/**
 * [R2-8 2/4-A-⑥-6] Firebase Firestore Emulator 실제 환경에서의 동시 차감 및 직렬화 검증 스크립트
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { executeMaternityDeductionTransaction } from '../src/server/maternityDeductionTransaction';
import { Company, MaternityCase, MaternityDeductionCallerContext } from '../src/types';

// Emulator 연결 설정
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-maternity-test';

const app = getApps().length === 0
  ? initializeApp({ projectId: PROJECT_ID })
  : getApps()[0];

const db = getFirestore(app);

async function runEmulatorConcurrencyTests() {
  console.log('================================================================');
  console.log('🚀 Firebase Firestore Emulator 모성보호 동시성 실측 테스트 시작');
  console.log(`📡 Host: ${process.env.FIRESTORE_EMULATOR_HOST}, Project: ${PROJECT_ID}`);
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
      throw new Error(`Assertion failed: ${msg}`);
    } else {
      console.log(`  ✓ ${msg}`);
      passed++;
    }
  }

  const caller: MaternityDeductionCallerContext = {
    uid: 'admin_emu_1',
    role: 'ADMIN',
    displayName: '관리자',
  };

  // --------------------------------------------------------------------------
  // [EMU TEST 1] 무료 잔여 1회 상태에서 5건 동시 신청 -> 정확히 1건만 성공
  // --------------------------------------------------------------------------
  console.log('\n[EMU Test 1] 무료 잔여 1회 상태에서 5건 동시 신청 실측');
  {
    const companyId = 'emu_comp_free_1';
    const now = new Date().toISOString();

    // 1) 기업 문서 세팅 (STANDARD: 월 무료 5회)
    await db.collection('companies').doc(companyId).set({
      id: companyId,
      companyName: '에뮬레이터 무료1회 기업',
      businessNumber: '111-81-00001',
      currentPlanId: 'STANDARD',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    } as Company);

    // 2) 이미 당월(2026-10) 4건 차감 데이터 세팅
    for (let i = 1; i <= 4; i++) {
      const prevCaseId = `emu_case_prev_${i}`;
      await db.collection('maternity_cases').doc(prevCaseId).set({
        id: prevCaseId,
        companyId,
        employeeId: `emp_${i}`,
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-01',
        createdAt: now,
        updatedAt: now,
        createdById: 'worker_prev',
        updatedById: 'worker_prev',
        deductionInfo: {
          deductionId: `deduct_${companyId}_${prevCaseId}`,
          source: 'MONTHLY_FREE',
          yearMonth: '2026-10',
          deductedAt: now,
        },
      } as MaternityCase);

      await db.collection('maternity_deductions').doc(`deduct_${companyId}_${prevCaseId}`).set({
        id: `deduct_${companyId}_${prevCaseId}`,
        deductionId: `deduct_${companyId}_${prevCaseId}`,
        companyId,
        maternityCaseId: prevCaseId,
        source: 'MONTHLY_FREE',
        quantity: 1,
        status: 'DEDUCTED',
        yearMonth: '2026-10',
        deductedAt: now,
        actorUid: caller.uid,
        actorRole: caller.role,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 3) 5건의 신규 사건 등록
    const newCaseIds = ['emu_c_1', 'emu_c_2', 'emu_c_3', 'emu_c_4', 'emu_c_5'];
    for (const cid of newCaseIds) {
      await db.collection('maternity_cases').doc(cid).set({
        id: cid,
        companyId,
        employeeId: 'emp_new',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        startDate: '2026-10-05',
        endDate: '2027-01-05',
        applicationDate: '2026-10-05',
        createdAt: now,
        updatedAt: now,
        createdById: 'worker_new',
        updatedById: 'worker_new',
      } as MaternityCase);
    }

    // 4) 5건 동시 신청 (Promise.allSettled)
    const results = await Promise.allSettled(
      newCaseIds.map((cid) =>
        executeMaternityDeductionTransaction(
          {
            caller,
            companyId,
            caseId: cid,
            targetYearMonth: '2026-10',
          },
          db
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 1,
      `실제 Firestore Emulator에서 동시 5건 중 정확히 1건만 성공 (성공 수: ${fulfilled.length})`
    );
    assert(
      rejected.length === 4,
      `실제 Firestore Emulator에서 초과 4건은 정확히 차단 (거부 수: ${rejected.length})`
    );

    const successVal = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    assert(successVal.source === 'MONTHLY_FREE', '성공 건의 출처는 MONTHLY_FREE');
    assert(successVal.remainingMonthlyFree === 0, '잔여 무료 횟수 0회');

    for (const r of rejected) {
      const err = (r as PromiseRejectedResult).reason;
      assert(err.code === 'QUOTA_EXHAUSTED', '거부된 건 에러 코드는 QUOTA_EXHAUSTED');
    }

    // DB 확인: 기업 문서의 lastMaternityDeductionAt 갱신 여부
    const compSnap = await db.collection('companies').doc(companyId).get();
    const compData = compSnap.data() as Company;
    assert(Boolean(compData.lastMaternityDeductionAt), '기업 문서에 lastMaternityDeductionAt 갱신 확인');
  }

  // --------------------------------------------------------------------------
  // [EMU TEST 2] 무료 잔여 5회 상태에서 10건 동시 신청 -> 정확히 5건만 무료 차감
  // --------------------------------------------------------------------------
  console.log('\n[EMU Test 2] 무료 잔여 5회 상태에서 10건 동시 신청 실측');
  {
    const companyId = 'emu_comp_free_5';
    const now = new Date().toISOString();

    await db.collection('companies').doc(companyId).set({
      id: companyId,
      companyName: '에뮬레이터 무료5회 기업',
      businessNumber: '111-81-00002',
      currentPlanId: 'STANDARD',
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    } as Company);

    const caseIds = Array.from({ length: 10 }, (_, i) => `emu_ten_${i + 1}`);
    for (const cid of caseIds) {
      await db.collection('maternity_cases').doc(cid).set({
        id: cid,
        companyId,
        employeeId: 'emp_ten',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        applicationDate: '2026-10-01',
        createdAt: now,
        updatedAt: now,
        createdById: 'worker_ten',
        updatedById: 'worker_ten',
      } as MaternityCase);
    }

    const results = await Promise.allSettled(
      caseIds.map((cid) =>
        executeMaternityDeductionTransaction(
          {
            caller,
            companyId,
            caseId: cid,
            targetYearMonth: '2026-10',
          },
          db
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 5,
      `실제 Firestore Emulator에서 동시 10건 중 정확히 5건만 성공 (성공 수: ${fulfilled.length})`
    );
    assert(
      rejected.length === 5,
      `실제 Firestore Emulator에서 초과 5건은 정확히 차단 (거부 수: ${rejected.length})`
    );

    for (const f of fulfilled) {
      const val = (f as PromiseFulfilledResult<any>).value;
      assert(val.source === 'MONTHLY_FREE', '성공한 5건 모두 MONTHLY_FREE 출처');
    }

    // 원장 문서 갯수 확인
    const ledgerSnap = await db
      .collection('maternity_deductions')
      .where('companyId', '==', companyId)
      .get();
    assert(ledgerSnap.size === 5, `실제 Firestore 원장 컬렉션에 정확히 5건만 생성됨 (실제: ${ledgerSnap.size})`);
  }

  // --------------------------------------------------------------------------
  // [EMU TEST 3] 선불 이용권과 혼합된 동시 신청 (무료 2회 + 선불 3회 상태에서 10건 동시 신청)
  // --------------------------------------------------------------------------
  console.log('\n[EMU Test 3] 선불 이용권 혼합 동시 신청 실측 (무료 2회 + 선불 3회 -> 10건 동시 신청)');
  {
    const companyId = 'emu_comp_mix';
    const now = new Date().toISOString();

    await db.collection('companies').doc(companyId).set({
      id: companyId,
      companyName: '에뮬레이터 혼합 기업',
      businessNumber: '111-81-00003',
      currentPlanId: 'STANDARD', // 무료 5회 중 3회 기사용 -> 잔여 2회
      subscription: {
        planCode: 'STANDARD',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 3, // 선불 3회 보유 -> 총 5회 차감 가능
      status: 'active',
      createdAt: now,
      updatedAt: now,
    } as Company);

    // 3회 기차감 세팅
    for (let i = 1; i <= 3; i++) {
      const pid = `emu_mix_prev_${i}`;
      await db.collection('maternity_cases').doc(pid).set({
        id: pid,
        companyId,
        employeeId: 'emp_u',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        applicationDate: '2026-10-01',
        createdAt: now,
        updatedAt: now,
        createdById: 'worker',
        updatedById: 'worker',
        deductionInfo: {
          deductionId: `deduct_${companyId}_${pid}`,
          source: 'MONTHLY_FREE',
          yearMonth: '2026-10',
          deductedAt: now,
        },
      } as MaternityCase);

      await db.collection('maternity_deductions').doc(`deduct_${companyId}_${pid}`).set({
        id: `deduct_${companyId}_${pid}`,
        deductionId: `deduct_${companyId}_${pid}`,
        companyId,
        maternityCaseId: pid,
        source: 'MONTHLY_FREE',
        quantity: 1,
        status: 'DEDUCTED',
        yearMonth: '2026-10',
        deductedAt: now,
        actorUid: caller.uid,
        actorRole: caller.role,
        createdAt: now,
        updatedAt: now,
      });
    }

    const caseIds = Array.from({ length: 10 }, (_, i) => `emu_mix_req_${i + 1}`);
    for (const cid of caseIds) {
      await db.collection('maternity_cases').doc(cid).set({
        id: cid,
        companyId,
        employeeId: 'emp_mix',
        workType: 'MATERNITY_LEAVE',
        status: 'APPLIED',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        applicationDate: '2026-10-01',
        createdAt: now,
        updatedAt: now,
        createdById: 'worker_mix',
        updatedById: 'worker_mix',
      } as MaternityCase);
    }

    const results = await Promise.allSettled(
      caseIds.map((cid) =>
        executeMaternityDeductionTransaction(
          {
            caller,
            companyId,
            caseId: cid,
            targetYearMonth: '2026-10',
          },
          db
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 5,
      `혼합 5회 한도 내에서 10건 중 정확히 5건만 성공 (성공 수: ${fulfilled.length})`
    );
    assert(
      rejected.length === 5,
      `혼합 5회 초과분 5건은 정확히 차단 (거부 수: ${rejected.length})`
    );

    const freeCount = fulfilled.filter(
      (f) => (f as PromiseFulfilledResult<any>).value.source === 'MONTHLY_FREE'
    ).length;
    const prepaidCount = fulfilled.filter(
      (f) => (f as PromiseFulfilledResult<any>).value.source === 'PREPAID_TICKET'
    ).length;

    assert(freeCount === 2, `무료 2회가 우선 차감됨 (실제: ${freeCount})`);
    assert(prepaidCount === 3, `선불 이용권 3회가 이어서 차감됨 (실제: ${prepaidCount})`);

    const finalComp = await db.collection('companies').doc(companyId).get();
    assert(
      finalComp.data()?.purchasedMaternityTickets === 0,
      `선불 이용권 3회가 모두 소진되어 0회로 일치 (실제: ${finalComp.data()?.purchasedMaternityTickets})`
    );
  }

  // --------------------------------------------------------------------------
  // [EMU TEST 4] 트랜잭션 오류 시 전체 롤백 검증
  // --------------------------------------------------------------------------
  console.log('\n[EMU Test 4] 트랜잭션 도중 오류 발생 시 롤백 실측');
  {
    const companyId = 'emu_comp_rb';
    const now = new Date().toISOString();

    await db.collection('companies').doc(companyId).set({
      id: companyId,
      companyName: '에뮬레이터 롤백 기업',
      businessNumber: '111-81-00004',
      currentPlanId: 'FREE',
      subscription: {
        planCode: 'FREE',
        status: 'ACTIVE',
      },
      purchasedMaternityTickets: 3,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    } as Company);

    const cancelCaseId = 'emu_case_cancel';
    await db.collection('maternity_cases').doc(cancelCaseId).set({
      id: cancelCaseId,
      companyId,
      employeeId: 'emp_rb',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED', // 차감 불가 상태
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: now,
      updatedAt: now,
      createdById: 'worker',
      updatedById: 'worker',
    } as MaternityCase);

    try {
      await executeMaternityDeductionTransaction(
        { caller, companyId, caseId: cancelCaseId },
        db
      );
      assert(false, '취소 사건 차감 시도는 에러를 던져야 함');
    } catch (err: any) {
      assert(err.code === 'INVALID_STATE', 'INVALID_STATE 에러 확인');
    }

    // 롤백 확인
    const caseSnap = await db.collection('maternity_cases').doc(cancelCaseId).get();
    assert(!caseSnap.data()?.deductionInfo, '사건에 deductionInfo 미반영 (롤백)');

    const compSnap = await db.collection('companies').doc(companyId).get();
    assert(compSnap.data()?.purchasedMaternityTickets === 3, '티켓 3장 보존 (롤백)');
  }

  console.log('\n================================================================');
  console.log(`🎉 EMULATOR CONCURRENCY SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmulatorConcurrencyTests().catch((err) => {
  console.error('Fatal Emulator Test Error:', err);
  process.exit(1);
});
