import { getSubscriptionEntitlement, isCompanyTabVisible, getMaternityMonthlyFreeEligibility } from './subscriptionEntitlement';
import { calculateMaternityQuota, evaluateMaternityDeductionEligibility } from '../services/maternityUsageService';
import { Company, CompanySubscription, MaternityCase } from '../types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✓ PASSED: ${msg}`);
  }
}

console.log('--- Running Subscription Entitlement Suite ---');

// 1. 구독 미설정
const noSubCompany: Company = {
  id: 'c-1',
  companyName: '테스트기업',
  businessNumber: '123-45-67890',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const ent1 = getSubscriptionEntitlement(noSubCompany);
assert(ent1.isActive === false, '구독 미설정 시 isActive=false');
assert(ent1.activePlanCode === null, '구독 미설정 시 activePlanCode=null');
assert(isCompanyTabVisible('dashboard', noSubCompany) === true, '미설정 대시보드 노출');
assert(isCompanyTabVisible('company-info', noSubCompany) === true, '미설정 회사정보 노출');
assert(isCompanyTabVisible('plan', noSubCompany) === true, '미설정 플랜안내 노출');
assert(isCompanyTabVisible('maternity', noSubCompany) === true, '미설정 모성보호 노출(별도권한 유지)');
assert(isCompanyTabVisible('workers', noSubCompany) === false, '미설정 근로자관리 차단');
assert(isCompanyTabVisible('payroll', noSubCompany) === false, '미설정 급여관리 차단');
assert(isCompanyTabVisible('inquiries', noSubCompany) === false, '미설정 노무문의 차단');
assert(isCompanyTabVisible('data-submissions', noSubCompany) === false, '미설정 자료요청 차단');
assert(isCompanyTabVisible('documents', noSubCompany) === false, '미설정 문서관리 차단');
assert(isCompanyTabVisible('messages', noSubCompany) === false, '미설정 메시지함 차단');

// 2. 비활성 구독 (PENDING, EXPIRED, CANCELLED)
const statuses: Array<CompanySubscription['status']> = ['PENDING', 'EXPIRED', 'CANCELLED'];
for (const status of statuses) {
  const comp: Company = {
    ...noSubCompany,
    id: `c-${status}`,
    subscription: {
      planCode: 'STANDARD',
      status,
    },
  };
  const ent = getSubscriptionEntitlement(comp);
  assert(ent.isActive === false, `비활성(${status}) isActive=false`);
  assert(ent.activePlanCode === null, `비활성(${status}) activePlanCode=null`);
  assert(isCompanyTabVisible('dashboard', comp) === true, `비활성(${status}) 대시보드 노출`);
  assert(isCompanyTabVisible('company-info', comp) === true, `비활성(${status}) 기업정보 노출`);
  assert(isCompanyTabVisible('plan', comp) === true, `비활성(${status}) 플랜안내 노출`);
  assert(isCompanyTabVisible('maternity', comp) === true, `비활성(${status}) 모성보호 노출`);
  assert(isCompanyTabVisible('inquiries', comp) === false, `비활성(${status}) 노무문의 차단`);
  assert(isCompanyTabVisible('workers', comp) === false, `비활성(${status}) 근로자 차단`);
}

// 3. ACTIVE FREE
const freeComp: Company = {
  ...noSubCompany,
  id: 'c-free',
  subscription: {
    planCode: 'FREE',
    status: 'ACTIVE',
  },
};
const entFree = getSubscriptionEntitlement(freeComp);
assert(entFree.isActive === true, 'FREE isActive=true');
assert(entFree.activePlanCode === 'FREE', 'FREE activePlanCode=FREE');
assert(isCompanyTabVisible('dashboard', freeComp) === true, 'FREE 대시보드 노출');
assert(isCompanyTabVisible('company-info', freeComp) === true, 'FREE 기업정보 노출');
assert(isCompanyTabVisible('messages', freeComp) === true, 'FREE 메시지함 노출');
assert(isCompanyTabVisible('plan', freeComp) === true, 'FREE 플랜안내 노출');
assert(isCompanyTabVisible('maternity', freeComp) === true, 'FREE 모성보호 노출');
assert(isCompanyTabVisible('workers', freeComp) === false, 'FREE 근로자관리 차단');
assert(isCompanyTabVisible('data-submissions', freeComp) === false, 'FREE 자료요청 차단');
assert(isCompanyTabVisible('documents', freeComp) === false, 'FREE 문서관리 차단');
assert(isCompanyTabVisible('inquiries', freeComp) === false, 'FREE 1:1노무문의 차단');
assert(isCompanyTabVisible('payroll', freeComp) === false, 'FREE 급여 차단');

// 4. ACTIVE BASIC
const basicComp: Company = {
  ...noSubCompany,
  id: 'c-basic',
  subscription: {
    planCode: 'BASIC',
    status: 'ACTIVE',
  },
};
assert(isCompanyTabVisible('workers', basicComp) === true, 'BASIC 근로자관리 노출');
assert(isCompanyTabVisible('data-submissions', basicComp) === true, 'BASIC 자료요청 노출');
assert(isCompanyTabVisible('documents', basicComp) === true, 'BASIC 문서관리 노출');
assert(isCompanyTabVisible('inquiries', basicComp) === false, 'BASIC 1:1노무문의 차단');
assert(isCompanyTabVisible('payroll', basicComp) === false, 'BASIC 급여 차단');

// 5. ACTIVE STANDARD
const stdComp: Company = {
  ...noSubCompany,
  id: 'c-std',
  subscription: {
    planCode: 'STANDARD',
    status: 'ACTIVE',
  },
};
assert(isCompanyTabVisible('inquiries', stdComp) === true, 'STANDARD 1:1노무문의 노출');
assert(isCompanyTabVisible('payroll', stdComp) === false, 'STANDARD 급여 차단');
assert(isCompanyTabVisible('payslips', stdComp) === false, 'STANDARD 급여명세서 차단');
assert(isCompanyTabVisible('overtime', stdComp) === false, 'STANDARD 근태/추가근무 차단');

// 6. ACTIVE OUTSOURCING
const outComp: Company = {
  ...noSubCompany,
  id: 'c-out',
  subscription: {
    planCode: 'OUTSOURCING',
    status: 'ACTIVE',
  },
};
assert(isCompanyTabVisible('inquiries', outComp) === true, 'OUTSOURCING 1:1노무문의 노출');
assert(isCompanyTabVisible('payroll', outComp) === true, 'OUTSOURCING 급여 노출');
assert(isCompanyTabVisible('payslips', outComp) === true, 'OUTSOURCING 급여명세서 노출');
assert(isCompanyTabVisible('overtime', outComp) === true, 'OUTSOURCING 근태/추가근무 노출');

// 7. ACTIVE CUSTOM
const customComp: Company = {
  ...noSubCompany,
  id: 'c-custom',
  subscription: {
    planCode: 'CUSTOM',
    status: 'ACTIVE',
  },
};
assert(isCompanyTabVisible('inquiries', customComp) === true, 'CUSTOM 1:1노무문의 노출');
assert(isCompanyTabVisible('payroll', customComp) === false, 'CUSTOM 급여 차단 (중앙 config 준수)');
assert(isCompanyTabVisible('overtime', customComp) === false, 'CUSTOM 근태 차단 (중앙 config 준수)');

// ========================================================
// [R2-8 2/4-C-⑧] 구독 생명주기 및 만료 판정 종합 검증
// ========================================================
console.log('\n--- [R2-8 2/4-C-⑧] 구독 생명주기 및 만료 판정 테스트 ---');

// 기준일 고정: 2026-10-09
const refToday = '2026-10-09';

// 8-1: ACTIVE + 기간 없음 → 허용 (운영 호환성)
const activeNoDates: Company = {
  ...noSubCompany,
  id: 'c-act-nodates',
  subscription: {
    planCode: 'STANDARD',
    status: 'ACTIVE',
  },
};
const entNoDates = getSubscriptionEntitlement(activeNoDates, refToday);
assert(entNoDates.isActive === true, 'ACTIVE + 기간 없음 → 허용 (isActive=true)');
assert(entNoDates.displayStatus === 'ACTIVE', 'ACTIVE + 기간 없음 → displayStatus=ACTIVE');
assert(entNoDates.displayStatusLabel === '정상 이용 중', 'ACTIVE + 기간 없음 → 정상 이용 중');
assert(isCompanyTabVisible('inquiries', activeNoDates) === true, 'ACTIVE + 기간 없음 → 일반 업무기능 노출 허용');

// 8-2: ACTIVE + 현재 유효기간 (2026-10-01 ~ 2026-10-31) → 허용
const activeValidPeriod: Company = {
  ...noSubCompany,
  id: 'c-act-valid',
  subscription: {
    planCode: 'BASIC',
    status: 'ACTIVE',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  },
};
const entValid = getSubscriptionEntitlement(activeValidPeriod, refToday);
assert(entValid.isActive === true, 'ACTIVE + 현재 유효기간 → 허용 (isActive=true)');
assert(entValid.displayStatus === 'ACTIVE', 'ACTIVE + 현재 유효기간 → displayStatus=ACTIVE');
assert(entValid.displayStatusLabel === '정상 이용 중', 'ACTIVE + 현재 유효기간 → 정상 이용 중');
assert(isCompanyTabVisible('workers', activeValidPeriod) === true, 'ACTIVE + 현재 유효기간 → BASIC 근로자관리 노출 허용');

// 8-3: ACTIVE + startDate 미래 (2026-10-15 ~ 2027-10-14) → 차단 ("이용 시작 전")
const activeFutureStart: Company = {
  ...noSubCompany,
  id: 'c-act-future',
  subscription: {
    planCode: 'STANDARD',
    status: 'ACTIVE',
    startDate: '2026-10-15',
    endDate: '2027-10-14',
  },
};
const entFuture = getSubscriptionEntitlement(activeFutureStart, refToday);
assert(entFuture.isActive === false, 'ACTIVE + startDate 미래 → 차단 (isActive=false)');
assert(entFuture.displayStatus === 'BEFORE_START', 'ACTIVE + startDate 미래 → displayStatus=BEFORE_START');
assert(entFuture.displayStatusLabel === '이용 시작 전', 'ACTIVE + startDate 미래 → 라벨: 이용 시작 전');
assert(isCompanyTabVisible('inquiries', activeFutureStart) === false, 'ACTIVE + startDate 미래 → 노무문의 차단');
assert(isCompanyTabVisible('dashboard', activeFutureStart) === true, 'ACTIVE + startDate 미래 → 대시보드 기본메뉴 허용');

// 8-4: ACTIVE + endDate 과거 (2025-10-01 ~ 2026-10-01) → 차단 ("이용기간 만료")
const activeExpiredEnd: Company = {
  ...noSubCompany,
  id: 'c-act-expired-end',
  subscription: {
    planCode: 'STANDARD',
    status: 'ACTIVE',
    startDate: '2025-10-01',
    endDate: '2026-10-01',
  },
};
const entExpiredEnd = getSubscriptionEntitlement(activeExpiredEnd, refToday);
assert(entExpiredEnd.isActive === false, 'ACTIVE + endDate 과거 → 차단 (isActive=false)');
assert(entExpiredEnd.displayStatus === 'PERIOD_EXPIRED', 'ACTIVE + endDate 과거 → displayStatus=PERIOD_EXPIRED');
assert(entExpiredEnd.displayStatusLabel === '이용기간 만료', 'ACTIVE + endDate 과거 → 라벨: 이용기간 만료');
assert(isCompanyTabVisible('inquiries', activeExpiredEnd) === false, 'ACTIVE + endDate 과거 → 노무문의 차단');
assert(isCompanyTabVisible('workers', activeExpiredEnd) === false, 'ACTIVE + endDate 과거 → 근로자관리 차단');
assert(isCompanyTabVisible('messages', activeExpiredEnd) === false, 'ACTIVE + endDate 과거 → 메시지함 차단');
assert(isCompanyTabVisible('dashboard', activeExpiredEnd) === true, 'ACTIVE + endDate 과거 → 대시보드 기본메뉴 허용');
assert(isCompanyTabVisible('plan', activeExpiredEnd) === true, 'ACTIVE + endDate 과거 → 플랜 안내 기본메뉴 허용');

// 8-5: PENDING → 차단
const pendingSub: Company = {
  ...noSubCompany,
  id: 'c-pend',
  subscription: {
    planCode: 'STANDARD',
    status: 'PENDING',
    startDate: '2026-10-01',
  },
};
const entPend = getSubscriptionEntitlement(pendingSub, refToday);
assert(entPend.isActive === false, 'PENDING → 차단 (isActive=false)');
assert(entPend.displayStatus === 'PENDING', 'PENDING → displayStatus=PENDING');
assert(isCompanyTabVisible('inquiries', pendingSub) === false, 'PENDING → 업무기능 차단');

// 8-6: EXPIRED (저장 상태 자체) → 차단
const expiredSub: Company = {
  ...noSubCompany,
  id: 'c-exp',
  subscription: {
    planCode: 'STANDARD',
    status: 'EXPIRED',
  },
};
const entExp = getSubscriptionEntitlement(expiredSub, refToday);
assert(entExp.isActive === false, 'EXPIRED → 차단 (isActive=false)');
assert(entExp.displayStatus === 'EXPIRED', 'EXPIRED → displayStatus=EXPIRED');
assert(isCompanyTabVisible('inquiries', expiredSub) === false, 'EXPIRED → 업무기능 차단');

// 8-7: CANCELLED (endDate 미래라도 즉시 차단)
const cancelledSub: Company = {
  ...noSubCompany,
  id: 'c-canc',
  subscription: {
    planCode: 'STANDARD',
    status: 'CANCELLED',
    startDate: '2026-01-01',
    endDate: '2026-12-31', // 미래 종료일이 남아있더라도 즉시 차단
  },
};
const entCanc = getSubscriptionEntitlement(cancelledSub, refToday);
assert(entCanc.isActive === false, 'CANCELLED (endDate 미래라도) → 차단 (isActive=false)');
assert(entCanc.displayStatus === 'CANCELLED', 'CANCELLED → displayStatus=CANCELLED');
assert(isCompanyTabVisible('inquiries', cancelledSub) === false, 'CANCELLED → 업무기능 차단');
assert(isCompanyTabVisible('workers', cancelledSub) === false, 'CANCELLED → 근로자관리 차단');

// 8-8: Maternity 별도 권한 유지 (모든 상태에서 메뉴 노출 유지)
assert(isCompanyTabVisible('maternity', activeNoDates) === true, '모성보호: ACTIVE 무기간 유지');
assert(isCompanyTabVisible('maternity', activeValidPeriod) === true, '모성보호: ACTIVE 유효기간 유지');
assert(isCompanyTabVisible('maternity', activeFutureStart) === true, '모성보호: 이용 시작 전 유지');
assert(isCompanyTabVisible('maternity', activeExpiredEnd) === true, '모성보호: 이용기간 만료 유지');
assert(isCompanyTabVisible('maternity', pendingSub) === true, '모성보호: PENDING 유지');
assert(isCompanyTabVisible('maternity', expiredSub) === true, '모성보호: EXPIRED 유지');
assert(isCompanyTabVisible('maternity', cancelledSub) === true, '모성보호: CANCELLED 유지');

// ========================================================
// [R2-8 2/4-C-⑨] 모성보호 STANDARD 월 5회 무료 구독 정합성 검증 (12개 시나리오)
// ========================================================
console.log('\n--- [R2-8 2/4-C-⑨] 모성보호 STANDARD 월 5회 구독 정합성 12개 시나리오 검증 ---');

// 1. ACTIVE STANDARD + 기간 없음 → 무료 5회
const stdNoDates: Company = {
  ...noSubCompany,
  id: 'c-std-nodates',
  currentPlanId: 'STANDARD',
  subscription: {
    planCode: 'STANDARD',
    status: 'ACTIVE',
  },
};
const resStdNoDates = getMaternityMonthlyFreeEligibility(stdNoDates, refToday);
assert(resStdNoDates.isEligibleForMonthlyFree === true, '1. ACTIVE STANDARD + 기간 없음 → isEligible=true');
assert(resStdNoDates.monthlyFreeQuota === 5, '1. ACTIVE STANDARD + 기간 없음 → 무료 5회');
assert(resStdNoDates.effectivePlanCode === 'STANDARD', '1. ACTIVE STANDARD + 기간 없음 → effectivePlanCode=STANDARD');

// 2. ACTIVE STANDARD + 유효기간 (2026-10-01 ~ 2026-10-31) → 무료 5회
const stdValidPeriod: Company = {
  ...noSubCompany,
  id: 'c-std-valid',
  currentPlanId: 'STANDARD',
  subscription: {
    planCode: 'STANDARD',
    status: 'ACTIVE',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  },
};
const resStdValid = getMaternityMonthlyFreeEligibility(stdValidPeriod, refToday);
assert(resStdValid.isEligibleForMonthlyFree === true, '2. ACTIVE STANDARD + 유효기간 → isEligible=true');
assert(resStdValid.monthlyFreeQuota === 5, '2. ACTIVE STANDARD + 유효기간 → 무료 5회');

// 3. ACTIVE STANDARD + startDate 미래 (2026-10-15 ~ 2027-10-14) → 무료 0회
const stdFuture: Company = {
  ...noSubCompany,
  id: 'c-std-future',
  currentPlanId: 'STANDARD',
  subscription: {
    planCode: 'STANDARD',
    status: 'ACTIVE',
    startDate: '2026-10-15',
    endDate: '2027-10-14',
  },
};
const resStdFuture = getMaternityMonthlyFreeEligibility(stdFuture, refToday);
assert(resStdFuture.isEligibleForMonthlyFree === false, '3. ACTIVE STANDARD + startDate 미래 → isEligible=false');
assert(resStdFuture.monthlyFreeQuota === 0, '3. ACTIVE STANDARD + startDate 미래 → 무료 0회');

// 4. ACTIVE STANDARD + endDate 과거 (2025-10-01 ~ 2026-10-01) → 무료 0회
const stdExpiredEnd: Company = {
  ...noSubCompany,
  id: 'c-std-expired-end',
  currentPlanId: 'STANDARD',
  subscription: {
    planCode: 'STANDARD',
    status: 'ACTIVE',
    startDate: '2025-10-01',
    endDate: '2026-10-01',
  },
};
const resStdExpiredEnd = getMaternityMonthlyFreeEligibility(stdExpiredEnd, refToday);
assert(resStdExpiredEnd.isEligibleForMonthlyFree === false, '4. ACTIVE STANDARD + endDate 과거 → isEligible=false');
assert(resStdExpiredEnd.monthlyFreeQuota === 0, '4. ACTIVE STANDARD + endDate 과거 → 무료 0회');

// 5. CANCELLED STANDARD → 무료 0회
const stdCancelled: Company = {
  ...noSubCompany,
  id: 'c-std-cancelled',
  currentPlanId: 'STANDARD',
  subscription: {
    planCode: 'STANDARD',
    status: 'CANCELLED',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  },
};
const resStdCancelled = getMaternityMonthlyFreeEligibility(stdCancelled, refToday);
assert(resStdCancelled.isEligibleForMonthlyFree === false, '5. CANCELLED STANDARD → isEligible=false');
assert(resStdCancelled.monthlyFreeQuota === 0, '5. CANCELLED STANDARD → 무료 0회');

// 6. PENDING STANDARD → 무료 0회
const stdPending: Company = {
  ...noSubCompany,
  id: 'c-std-pending',
  currentPlanId: 'STANDARD',
  subscription: {
    planCode: 'STANDARD',
    status: 'PENDING',
    startDate: '2026-10-01',
  },
};
const resStdPending = getMaternityMonthlyFreeEligibility(stdPending, refToday);
assert(resStdPending.isEligibleForMonthlyFree === false, '6. PENDING STANDARD → isEligible=false');
assert(resStdPending.monthlyFreeQuota === 0, '6. PENDING STANDARD → 무료 0회');

// 7. EXPIRED STANDARD → 무료 0회
const stdExpiredStatus: Company = {
  ...noSubCompany,
  id: 'c-std-expired-status',
  currentPlanId: 'STANDARD',
  subscription: {
    planCode: 'STANDARD',
    status: 'EXPIRED',
  },
};
const resStdExpired = getMaternityMonthlyFreeEligibility(stdExpiredStatus, refToday);
assert(resStdExpired.isEligibleForMonthlyFree === false, '7. EXPIRED STANDARD → isEligible=false');
assert(resStdExpired.monthlyFreeQuota === 0, '7. EXPIRED STANDARD → 무료 0회');

// 8. ACTIVE OUTSOURCING → 무료 0회
const outActive: Company = {
  ...noSubCompany,
  id: 'c-out-active',
  currentPlanId: 'OUTSOURCING',
  subscription: {
    planCode: 'OUTSOURCING',
    status: 'ACTIVE',
  },
};
const resOutActive = getMaternityMonthlyFreeEligibility(outActive, refToday);
assert(resOutActive.isEligibleForMonthlyFree === false, '8. ACTIVE OUTSOURCING → isEligible=false');
assert(resOutActive.monthlyFreeQuota === 0, '8. ACTIVE OUTSOURCING → 무료 0회');

// 9. ACTIVE CUSTOM → 무료 0회
const customActive: Company = {
  ...noSubCompany,
  id: 'c-custom-active',
  currentPlanId: 'CUSTOM',
  subscription: {
    planCode: 'CUSTOM',
    status: 'ACTIVE',
  },
};
const resCustomActive = getMaternityMonthlyFreeEligibility(customActive, refToday);
assert(resCustomActive.isEligibleForMonthlyFree === false, '9. ACTIVE CUSTOM → isEligible=false');
assert(resCustomActive.monthlyFreeQuota === 0, '9. ACTIVE CUSTOM → 무료 0회');

// 10. currentPlanId=STANDARD이지만 subscription=ACTIVE BASIC → 무료 0회 (Source of Truth는 subscription)
const legacyMismatchStdToBasic: Company = {
  ...noSubCompany,
  id: 'c-mismatch-std-to-basic',
  currentPlanId: 'STANDARD', // 레거시 필드는 STANDARD지만
  subscription: {
    planCode: 'BASIC', // 실제 subscription은 BASIC
    status: 'ACTIVE',
  },
};
const resMismatch1 = getMaternityMonthlyFreeEligibility(legacyMismatchStdToBasic, refToday);
assert(resMismatch1.isEligibleForMonthlyFree === false, '10. currentPlanId=STANDARD, sub=ACTIVE BASIC → isEligible=false');
assert(resMismatch1.monthlyFreeQuota === 0, '10. currentPlanId=STANDARD, sub=ACTIVE BASIC → 무료 0회');
assert(resMismatch1.effectivePlanCode === 'BASIC', '10. currentPlanId=STANDARD, sub=ACTIVE BASIC → effectivePlan=BASIC');

// 11. currentPlanId=BASIC이지만 subscription=ACTIVE STANDARD → 무료 5회 (Source of Truth는 subscription)
const legacyMismatchBasicToStd: Company = {
  ...noSubCompany,
  id: 'c-mismatch-basic-to-std',
  currentPlanId: 'BASIC', // 레거시 필드는 BASIC이지만
  subscription: {
    planCode: 'STANDARD', // 실제 subscription은 STANDARD
    status: 'ACTIVE',
  },
};
const resMismatch2 = getMaternityMonthlyFreeEligibility(legacyMismatchBasicToStd, refToday);
assert(resMismatch2.isEligibleForMonthlyFree === true, '11. currentPlanId=BASIC, sub=ACTIVE STANDARD → isEligible=true');
assert(resMismatch2.monthlyFreeQuota === 5, '11. currentPlanId=BASIC, sub=ACTIVE STANDARD → 무료 5회');
assert(resMismatch2.effectivePlanCode === 'STANDARD', '11. currentPlanId=BASIC, sub=ACTIVE STANDARD → effectivePlan=STANDARD');

// 12. 만료된 STANDARD + 선불 이용권 보유 → 무료분은 0회, 선불 이용권은 기존대로 사용 가능
const expiredStdWithTickets: Company = {
  ...noSubCompany,
  id: 'c-exp-with-tickets',
  currentPlanId: 'STANDARD',
  subscription: {
    planCode: 'STANDARD',
    status: 'EXPIRED',
  },
  purchasedMaternityTickets: 3, // 선불 이용권 3회 보유
};
const resExpiredWithTickets = getMaternityMonthlyFreeEligibility(expiredStdWithTickets, refToday);
assert(resExpiredWithTickets.isEligibleForMonthlyFree === false, '12. 만료된 STANDARD → 무료분 isEligible=false');
assert(resExpiredWithTickets.monthlyFreeQuota === 0, '12. 만료된 STANDARD → 무료 0회');

// calculateMaternityQuota 검증: 만료 상태라도 선불 이용권 3회 정상 조회 및 가용
const quotaCalc = calculateMaternityQuota({
  company: expiredStdWithTickets,
  referenceDateString: refToday,
  targetYearMonth: '2026-10',
  monthCasesCount: 0,
  purchasedTicketsRemaining: 3,
});
assert(quotaCalc.monthlyFreeQuota === 0, '12. calculateMaternityQuota: 무료 한도 0회');
assert(quotaCalc.monthlyFreeRemaining === 0, '12. calculateMaternityQuota: 무료 잔여 0회');
assert(quotaCalc.purchasedTicketsRemaining === 3, '12. calculateMaternityQuota: 선불 이용권 3회 유지');
assert(quotaCalc.totalAvailableRemaining === 3, '12. calculateMaternityQuota: 총 이용 가능 3회');

// evaluateMaternityDeductionEligibility 검증: 선불 이용권으로 정상 차감 적격 판정 (determinedSource: PREPAID_TICKET)
const mockCase: MaternityCase = {
  id: 'case-test-12',
  companyId: expiredStdWithTickets.id,
  employeeId: 'emp-12',
  workType: 'MATERNITY_LEAVE',
  status: 'APPLIED',
  startDate: '2026-10-01',
  endDate: '2026-12-31',
  applicationDate: refToday,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  createdById: 'worker',
  updatedById: 'worker',
};
const evalResult = evaluateMaternityDeductionEligibility({
  maternityCase: mockCase,
  companyId: expiredStdWithTickets.id,
  company: expiredStdWithTickets,
  referenceDateString: refToday,
  targetYearMonth: '2026-10',
  currentMonthFreeUsed: 0,
  purchasedTicketsRemaining: 3,
});
assert(evalResult.canDeduct === true, '12. evaluateDeduction: 만료 STANDARD라도 선불권 보유 시 차감 가능');
assert(evalResult.determinedSource === 'PREPAID_TICKET', '12. evaluateDeduction: 차감 출처는 PREPAID_TICKET');
assert(evalResult.purchasedTicketsRemainingBefore === 3, '12. evaluateDeduction: 차감 전 선불권 3회');
assert(evalResult.monthlyFreeRemainingBefore === 0, '12. evaluateDeduction: 차감 전 무료분 0회');

console.log('🎉 ALL 12 MATERNITY SUBSCRIPTION SCENARIOS PASSED!');
console.log('🎉 ALL SUBSCRIPTION ENTITLEMENT TESTS PASSED!');
