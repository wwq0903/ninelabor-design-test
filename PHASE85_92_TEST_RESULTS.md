# 85~92차 오프라인 검사

- PASS `check:security:offline`: 록 보안 정적 검사
PASS 근로자·기업 격리 정적 검사

결과: 9/9개 검사 스크립트 통과
주의: 정적/오프라인 검사만 수행. Firebase Emulator, 전체 빌드 및 실서비스 보안 검증을 대체하지 않음.
- PASS `check:imports`: /check-local-imports.cjs

Checked 99 source files and 415 local imports.
All statically detected local imports resolved.
- PASS `check:branch:phase17`: ASS: phase17 admin company scope, AI owner immutability, audit actor validation, subscription branch scope (static only)
- PASS `audit:branch:coverage`: collection": "subscription_requests",
      "branchScopeReference": true,
      "legacyAdminFallback": false
    }
  ]
}
- PASS `check:security:phase18`: rity:phase18
> node scripts/test-phase18-security.cjs

PASS phase18 security structural checks (not emulator validation)
- PASS `check:security:phase19`: ts/test-phase19-onboarding.cjs

PASS phase19 signup/approval structural checks (NOT emulator or UI runtime verification)
- PASS `check:offline-only`: est-phase21-offline-only.cjs

PASS: offline-only plan flow, legacy request writes disabled, policy/dashboard consistency
- PASS `check:syntax`: 0 check:syntax
> node scripts/check-typescript-syntax.cjs

Parsed 124 JS/TS/TSX files; syntax errors: 0. Compiler: 5.8.3
- PASS `check:security:phase22`: t-phase22-hardening.cjs

PASS: company privilege allowlist, retired plan writes, strict dates, exclusive expiry boundary
- PASS `check:security:phase23`: ASS: notification privacy, branch-scoped recipient, immutable read status, trusted audit UID, service/UI date validation
- PASS `check:plan-dates`: xperimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- PASS `check:migration:phase24`: g branch
PASS invalid company branch
PASS invalid company ID
PASS invalid export
14/14 migration readiness checks passed
- PASS `check:security:phase25`:  scripts/test-phase25-api-security.cjs

PASS 12 API, RRN and branch-enforcement security invariants (static checks only)
- PASS `check:security:phase26`: -example@0.0.0 check:security:phase26
> node scripts/test-phase26-rrn-authorization.cjs

PASS 26차 RRN API 권한 불변식 (정적 검사)
- PASS `check:security:phase27`: > node scripts/test-phase27-tenant-authorization.cjs

PASS 27차 관리자 이중 인증, 지부별 기업 권한, 회원 생성 사전검증/보상, 서버 오류 정보 비노출 (정적 검사)
- PASS `check:security:phase28`: nt-integrity.cjs

PASS phase28 tenant creation, approval, directory isolation, audit actor role (static assertions only)
- PASS `check:security:phase29`: xperimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- PASS `check:http:phase30`: 
PASS Unknown error does not leak details
HTTP protection runtime checks: 8/8 passed
Unhandled API error { status: 500 }
- PASS `check:phase31`: iness checks service configuration
PASS branch auth has no development bypass
Phase31 runtime/static checks 12/12 passed
- PASS `check:phase32`: build
PASS CI checks build output
PASS CI checks server safety regression
9/9 server-safety regression assertions passed
- PASS `check:phase33`: d
PASS maternity assignment limited and gated
18/18 phase33 source invariants passed (not runtime Firebase verification)
- PASS `check:phase34`:  cannot bypass socket quota
PASS Retry-After returned on capacity denial
Phase 34 HTTP limiter runtime tests: 5/5 passed
- PASS `check:phase35`: 
> node scripts/test-phase35-runtime.cjs

PASS phase35: 9 encryption integrity and Firebase project isolation assertions
- PASS `check:phase36`: xperimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- PASS `check:phase37`: eck:phase37
> node scripts/test-phase37-request-guards.cjs

PASS phase37: 18 executable input and branch-gate assertions
- PASS `check:phase38`: node scripts/test-phase38-account-consistency.cjs

PASS phase38: 14 source and executable account consistency assertions
- PASS `check:phase39-44`: ate rejects incomplete deployment
PASS inventory does not fabricate completion percentage
13/13 phase39-44 checks passed
- PASS `check:phase45-49`: company roster
PASS foreign company roster
PASS mismatched month
PASS invalid work type
Phase 45-49: 29/29 checks passed
- PASS `check:phase50-54`: ge must be positive
PASS payroll items must be arrays
PASS payroll total must be finite
PASS payroll period is validated
- PASS `check:phase55-60`: ipts/test-phase55-60-batch.cjs

Phase55-60 compatibility checks 11/11 passed (structural; runtime covered by phase61-68)
- PASS `check:phase61-68`: @0.0.0 check:phase61-68
> node scripts/test-phase61-68-concurrency.cjs

Phase61-68 concurrency mock checks: 17/17 passed
- PASS `check:phase69-76`: > react-example@0.0.0 check:phase69-76
> node scripts/test-phase69-76-sync.cjs

Phase69-76 sync safety: 9/9 passed
- PASS `check:phase77-84`: @0.0.0 check:phase77-84
> node scripts/test-phase77-84-atomic-payroll.cjs

Phase77-84 atomic payroll tests: 12/12 passed
- PASS `check:phase85-92`: mple@0.0.0 check:phase85-92
> node scripts/test-phase85-92-payroll-guards.cjs

Phase85-92 executable tests: 10/10 passed
