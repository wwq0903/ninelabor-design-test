/**
 * [R2-8 2/4-A-⑥-2] 모성보호 이용권 복구 판정 순수 함수 단위 검증 테스트 스위트
 * 
 * 검증 항목:
 * 1. PREPAID_TICKET 복구 판정 (선불 이용권 1회 반환)
 * 2. MONTHLY_FREE 당월 취소 시 무료 횟수 1회 복구 판정
 * 3. MONTHLY_FREE 익월 취소 시 무료 횟수 이월 차단 및 소멸 (EXPIRED_MONTHLY_FREE)
 * 4. SUPPLEMENT_REQUESTED / APPLIED 등 진행 중 상태 복구 불가
 * 5. 노무사 검토 착수 후 취소·반려 시 관리자 검토 대상 구분 (REQUIRES_ADMIN_REVIEW)
 * 6. 중복 복구 차단 (RESTORED / CANCELLED 원장 및 이미 복구된 사건)
 * 7. 사건 deductionInfo와 원장 메타데이터 불일치 차단
 * 8. 타 기업 사건 접근 및 복구 차단 (기업별 데이터 격리)
 */

import {
  evaluateMaternityRestorationEligibility,
  hasMaternityWorkStarted,
} from './maternityUsageService';
import {
  MaternityCase,
  MaternityDeductionLedgerItem,
} from '../types';

async function runRestorationTests() {
  console.log('================================================================');
  console.log('🧪 Starting Maternity Restoration Decision Test Suite [R2-8 2/4-A-⑥-2]');
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
  // TEST 1: PREPAID_TICKET 복구 판정 (선불 이용권 1회 반환)
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] 선불 이용권(PREPAID_TICKET) 복구 판정');
  {
    const maternityCase: MaternityCase = {
      id: 'case_prepaid_1',
      companyId: 'comp_1',
      employeeId: 'emp_1',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED', // 착수 전 단순 취소
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      createdById: 'worker_1',
      updatedById: 'worker_1',
      deductionInfo: {
        deductionId: 'deduct_comp_1_case_prepaid_1',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
    };

    const ledgerItem: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_1_case_prepaid_1',
      deductionId: 'deduct_comp_1_case_prepaid_1',
      companyId: 'comp_1',
      maternityCaseId: 'case_prepaid_1',
      source: 'PREPAID_TICKET',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_1_case_prepaid_1_PREPAID_TICKET',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const result = evaluateMaternityRestorationEligibility({
      maternityCase,
      ledgerItem,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10',
    });

    assert(result.canRestore === true, '선불 이용권 복구 가능 (canRestore: true)');
    assert(result.restorationType === 'AUTO_RESTORE', '착수 전 취소로 자동 복구 (AUTO_RESTORE)');
    assert(result.restorableSource === 'PREPAID_TICKET', '복구 출처: PREPAID_TICKET');
    assert(result.restoredQuantity === 1, '선불 이용권 1회 반환');
    assert(result.requiresAdminReview === false, '관리자 검토 불필요');
  }

  // --------------------------------------------------------------------------
  // TEST 2: MONTHLY_FREE 당월 취소 시 무료 횟수 1회 복구 판정
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] 당월 무료 횟수(MONTHLY_FREE) 당월 취소 복구 판정');
  {
    const maternityCase: MaternityCase = {
      id: 'case_free_same_month',
      companyId: 'comp_1',
      employeeId: 'emp_2',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-05',
      createdAt: '2026-10-05T00:00:00Z',
      updatedAt: '2026-10-08T00:00:00Z',
      createdById: 'worker_2',
      updatedById: 'worker_2',
      deductionInfo: {
        deductionId: 'deduct_comp_1_case_free_same_month',
        source: 'MONTHLY_FREE',
        yearMonth: '2026-10', // 2026년 10월 차감
        deductedAt: '2026-10-05T00:00:00Z',
      },
    };

    const ledgerItem: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_1_case_free_same_month',
      deductionId: 'deduct_comp_1_case_free_same_month',
      companyId: 'comp_1',
      maternityCaseId: 'case_free_same_month',
      source: 'MONTHLY_FREE',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-05T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_1_case_free_same_month_MONTHLY_FREE',
      createdAt: '2026-10-05T00:00:00Z',
      updatedAt: '2026-10-05T00:00:00Z',
    };

    const result = evaluateMaternityRestorationEligibility({
      maternityCase,
      ledgerItem,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10', // 2026년 10월 당월 취소!
    });

    assert(result.canRestore === true, '당월 무료 횟수 복구 가능 (canRestore: true)');
    assert(result.restorationType === 'AUTO_RESTORE', '자동 복구 적격 (AUTO_RESTORE)');
    assert(result.restorableSource === 'MONTHLY_FREE', '복구 출처: MONTHLY_FREE');
    assert(result.restoredQuantity === 1, '당월 무료 횟수 1회 반환');
  }

  // --------------------------------------------------------------------------
  // TEST 3: MONTHLY_FREE 익월 취소 시 이월 차단 및 소멸
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] 익월 취소 시 무료 횟수 이월 차단 및 소멸 (EXPIRED_MONTHLY_FREE)');
  {
    const maternityCase: MaternityCase = {
      id: 'case_free_next_month',
      companyId: 'comp_1',
      employeeId: 'emp_3',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      startDate: '2026-09-10',
      endDate: '2026-12-10',
      applicationDate: '2026-09-10',
      createdAt: '2026-09-10T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      createdById: 'worker_3',
      updatedById: 'worker_3',
      deductionInfo: {
        deductionId: 'deduct_comp_1_case_free_next_month',
        source: 'MONTHLY_FREE',
        yearMonth: '2026-09', // 2026년 9월 차감
        deductedAt: '2026-09-10T00:00:00Z',
      },
    };

    const ledgerItem: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_1_case_free_next_month',
      deductionId: 'deduct_comp_1_case_free_next_month',
      companyId: 'comp_1',
      maternityCaseId: 'case_free_next_month',
      source: 'MONTHLY_FREE',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-09', // 9월 차감 원장
      deductedAt: '2026-09-10T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_1_case_free_next_month_MONTHLY_FREE',
      createdAt: '2026-09-10T00:00:00Z',
      updatedAt: '2026-09-10T00:00:00Z',
    };

    // 2026년 10월(익월) 취소 요청
    const result = evaluateMaternityRestorationEligibility({
      maternityCase,
      ledgerItem,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10',
    });

    assert(result.canRestore === false, '익월 취소 시 무료 횟수 복구 불가 (canRestore: false)');
    assert(
      result.restorationType === 'EXPIRED_MONTHLY_FREE',
      '무료 횟수 이월 금지에 따른 소멸 판정 (EXPIRED_MONTHLY_FREE)'
    );
    assert(result.restorableSource === undefined, '복구 출처 없음');
    assert(result.reason.includes('소멸'), '사유에 무료 횟수 소멸 안내 포함');
  }

  // --------------------------------------------------------------------------
  // TEST 4: SUPPLEMENT_REQUESTED 등 진행 중 상태 복구 불가
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] 진행 중 상태(SUPPLEMENT_REQUESTED 등) 복구 불가 검증');
  {
    const ongoingStatuses = ['SUPPLEMENT_REQUESTED', 'APPLIED', 'DOCS_COLLECTING', 'UNDER_REVIEW', 'IN_PROGRESS'];

    for (const st of ongoingStatuses) {
      const maternityCase: MaternityCase = {
        id: `case_ongoing_${st}`,
        companyId: 'comp_1',
        employeeId: 'emp_4',
        workType: 'MATERNITY_LEAVE',
        status: st as any,
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        applicationDate: '2026-10-01',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
        createdById: 'worker_4',
        updatedById: 'worker_4',
        deductionInfo: {
          deductionId: `deduct_comp_1_case_ongoing_${st}`,
          source: 'PREPAID_TICKET',
          yearMonth: '2026-10',
          deductedAt: '2026-10-01T00:00:00Z',
        },
      };

      const ledgerItem: MaternityDeductionLedgerItem = {
        id: `deduct_comp_1_case_ongoing_${st}`,
        deductionId: `deduct_comp_1_case_ongoing_${st}`,
        companyId: 'comp_1',
        maternityCaseId: `case_ongoing_${st}`,
        source: 'PREPAID_TICKET',
        quantity: 1,
        status: 'DEDUCTED',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
        actorUid: 'admin_1',
        actorRole: 'ADMIN',
        idempotencyKey: `comp_1_case_ongoing_${st}_PREPAID_TICKET`,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const result = evaluateMaternityRestorationEligibility({
        maternityCase,
        ledgerItem,
        requestCompanyId: 'comp_1',
        cancellationYearMonth: '2026-10',
      });

      assert(result.canRestore === false, `상태 ${st}: 진행 중 사건 복구 불가 (canRestore: false)`);
      assert(result.restorationType === 'NOT_ELIGIBLE', `상태 ${st}: NOT_ELIGIBLE 판정`);
      assert(result.reason.includes('진행 중 사건'), '사유에 진행 중 사건 안내 포함');
    }
  }

  // --------------------------------------------------------------------------
  // TEST 5: 노무사 검토 착수 후 취소·반려 시 관리자 검토 대상 구분
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] 업무 착수 후 취소·반려 시 관리자 검토 대상 구분 (REQUIRES_ADMIN_REVIEW)');
  {
    // 5-1: 담당 노무사 배정 및 검토(UNDER_REVIEW) 이력이 있는 사건이 취소된 경우
    const maternityCaseWithReview: MaternityCase = {
      id: 'case_reviewed_cancel',
      companyId: 'comp_1',
      employeeId: 'emp_5',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      assignedAttorneyId: 'attorney_kim', // 노무사 배정됨
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
      createdById: 'worker_5',
      updatedById: 'admin_1',
      deductionInfo: {
        deductionId: 'deduct_comp_1_case_reviewed_cancel',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
      history: [
        {
          action: '검토 착수',
          timestamp: '2026-10-01T00:00:00Z',
          previousStatus: 'APPLIED',
          newStatus: 'UNDER_REVIEW', // 노무사 검토 착수
          actor: '김노무사',
        },
        {
          action: '사후 취소',
          timestamp: '2026-10-03T00:00:00Z',
          previousStatus: 'UNDER_REVIEW',
          newStatus: 'CANCELLED', // 사후 취소
          actor: '기업담당자',
        },
      ],
    };

    const ledgerItem: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_1_case_reviewed_cancel',
      deductionId: 'deduct_comp_1_case_reviewed_cancel',
      companyId: 'comp_1',
      maternityCaseId: 'case_reviewed_cancel',
      source: 'PREPAID_TICKET',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_1_case_reviewed_cancel_PREPAID_TICKET',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    // 업무 착수 판별 헬퍼 검증
    assert(
      hasMaternityWorkStarted(maternityCaseWithReview) === true,
      'hasMaternityWorkStarted 헬퍼가 업무 착수 여부 정확히 감지'
    );

    // 자동 복구 시도 -> 관리자 검토 대상으로 차단
    const autoResult = evaluateMaternityRestorationEligibility({
      maternityCase: maternityCaseWithReview,
      ledgerItem,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10',
      allowAdminOverride: false,
    });

    assert(autoResult.canRestore === false, '업무 착수 건은 자동 복구 불가 (canRestore: false)');
    assert(
      autoResult.restorationType === 'REQUIRES_ADMIN_REVIEW',
      '관리자 검토 대상으로 분류 (REQUIRES_ADMIN_REVIEW)'
    );
    assert(autoResult.requiresAdminReview === true, 'requiresAdminReview: true 플래그 설정');

    // 5-2: 관리자가 수동 검토 후 승인(allowAdminOverride: true)한 경우 -> 복구 승인
    const adminApprovedResult = evaluateMaternityRestorationEligibility({
      maternityCase: maternityCaseWithReview,
      ledgerItem,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10',
      allowAdminOverride: true,
    });

    assert(adminApprovedResult.canRestore === true, '관리자 승인 시 복구 허용 (canRestore: true)');
    assert(adminApprovedResult.restorableSource === 'PREPAID_TICKET', '복구 출처: PREPAID_TICKET');
  }

  // --------------------------------------------------------------------------
  // TEST 6: 중복 복구 차단 (RESTORED / CANCELLED 원장 및 이미 복구된 건)
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] 중복 복구 차단 (RESTORED / CANCELLED 및 복구 완료 메타데이터)');
  {
    const maternityCase: MaternityCase = {
      id: 'case_dup_restore',
      companyId: 'comp_1',
      employeeId: 'emp_6',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      createdById: 'worker_6',
      updatedById: 'worker_6',
      deductionInfo: {
        deductionId: 'deduct_comp_1_case_dup_restore',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
    };

    // 6-1: 원장 상태가 이미 RESTORED인 경우
    const restoredLedger: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_1_case_dup_restore',
      deductionId: 'deduct_comp_1_case_dup_restore',
      companyId: 'comp_1',
      maternityCaseId: 'case_dup_restore',
      source: 'PREPAID_TICKET',
      quantity: 1,
      status: 'RESTORED', // 이미 복구 완료!
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      restoredAt: '2026-10-02T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'comp_1_case_dup_restore_PREPAID_TICKET',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
    };

    const resRestored = evaluateMaternityRestorationEligibility({
      maternityCase,
      ledgerItem: restoredLedger,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10',
    });

    assert(resRestored.canRestore === false, 'RESTORED 원장의 중복 복구 차단 (canRestore: false)');
    assert(resRestored.reason.includes('이미 복구'), '사유에 중복 복구 차단 명시');

    // 6-2: 사건 메타데이터에 이미 restoredAt이 기록된 경우
    const caseWithRestoredAt: MaternityCase = {
      ...maternityCase,
      deductionInfo: {
        ...maternityCase.deductionInfo!,
        restoredAt: '2026-10-02T00:00:00Z', // 이미 복구 일시 존재
      },
    };

    const normalLedger: MaternityDeductionLedgerItem = {
      ...restoredLedger,
      status: 'DEDUCTED',
    };

    const resCaseRestored = evaluateMaternityRestorationEligibility({
      maternityCase: caseWithRestoredAt,
      ledgerItem: normalLedger,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10',
    });

    assert(
      resCaseRestored.canRestore === false,
      '사건 restoredAt 존재 시 중복 복구 차단 (canRestore: false)'
    );

    // 6-3: CANCELLED 원장 차단
    const cancelledLedger: MaternityDeductionLedgerItem = {
      ...restoredLedger,
      status: 'CANCELLED',
    };

    const resCancelled = evaluateMaternityRestorationEligibility({
      maternityCase,
      ledgerItem: cancelledLedger,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10',
    });

    assert(resCancelled.canRestore === false, 'CANCELLED 원장 복구 차단 (canRestore: false)');
  }

  // --------------------------------------------------------------------------
  // TEST 7: 사건 deductionInfo와 원장 정보 불일치 차단
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] 사건 deductionInfo와 원장 메타데이터 불일치 차단');
  {
    const maternityCase: MaternityCase = {
      id: 'case_mismatch',
      companyId: 'comp_1',
      employeeId: 'emp_7',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      createdById: 'worker_7',
      updatedById: 'worker_7',
      deductionInfo: {
        deductionId: 'deduct_A',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
    };

    // deductionId 불일치 원장
    const mismatchedLedger: MaternityDeductionLedgerItem = {
      id: 'deduct_B',
      deductionId: 'deduct_B', // 불일치!
      companyId: 'comp_1',
      maternityCaseId: 'case_mismatch',
      source: 'PREPAID_TICKET',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'key',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const resMismatch = evaluateMaternityRestorationEligibility({
      maternityCase,
      ledgerItem: mismatchedLedger,
      requestCompanyId: 'comp_1',
      cancellationYearMonth: '2026-10',
    });

    assert(resMismatch.canRestore === false, 'deductionId 불일치 시 복구 차단 (canRestore: false)');
    assert(resMismatch.reason.includes('일치하지 않습니다'), '데이터 불일치 사유 안내');
  }

  // --------------------------------------------------------------------------
  // TEST 8: 타 기업 사건 접근 및 복구 차단 (기업별 데이터 격리)
  // --------------------------------------------------------------------------
  console.log('\n[Test 8] 타 기업 사건 복구 차단 (기업별 데이터 격리)');
  {
    const maternityCase: MaternityCase = {
      id: 'case_comp_A',
      companyId: 'comp_A', // comp_A 소속 사건
      employeeId: 'emp_8',
      workType: 'MATERNITY_LEAVE',
      status: 'CANCELLED',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      applicationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      createdById: 'worker_8',
      updatedById: 'worker_8',
      deductionInfo: {
        deductionId: 'deduct_comp_A_case_comp_A',
        source: 'PREPAID_TICKET',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T00:00:00Z',
      },
    };

    const ledgerItem: MaternityDeductionLedgerItem = {
      id: 'deduct_comp_A_case_comp_A',
      deductionId: 'deduct_comp_A_case_comp_A',
      companyId: 'comp_A',
      maternityCaseId: 'case_comp_A',
      source: 'PREPAID_TICKET',
      quantity: 1,
      status: 'DEDUCTED',
      yearMonth: '2026-10',
      deductedAt: '2026-10-01T00:00:00Z',
      actorUid: 'admin_1',
      actorRole: 'ADMIN',
      idempotencyKey: 'key',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    // comp_B 명의로 comp_A 사건 복구 시도 -> 차단
    const resIsolation = evaluateMaternityRestorationEligibility({
      maternityCase,
      ledgerItem,
      requestCompanyId: 'comp_B',
      cancellationYearMonth: '2026-10',
    });

    assert(
      resIsolation.canRestore === false,
      '타 기업 사건 복구 시도 시 차단 (canRestore: false)'
    );
    assert(
      resIsolation.reason.includes('데이터 격리 위반'),
      '데이터 격리 위반 사유 정확히 반환'
    );
  }

  console.log('\n================================================================');
  console.log(`🎉 RESTORATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRestorationTests().catch((err) => {
  console.error('Restoration test execution fatal error:', err);
  process.exit(1);
});
