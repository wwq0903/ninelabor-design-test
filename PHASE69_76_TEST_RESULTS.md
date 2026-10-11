# 69~76차 검사 결과

- check:security:offline: PASS — API 연결 정적 검사
PASS 7차 데이터 검증
PASS 8차 데이터 검증
PASS 9차 Firestore 규칙 정적 검사
PASS 10차 지부 규칙 정적 검사
PASS 급여 보안 정적 검사
PASS 관리자 목록 보안 정적 검사
PASS 근로자·기업 격리 정적 검사

결과: 9/9개 검사 스크립트 통과
주의: 정적/오프라인 검사만 수행. Firebase Emulator, 전체 빌드 및 실서비스 보안 검증을 대체하지 않음.
- check:imports: PASS — > react-example@0.0.0 check:imports
> node scripts/check-local-imports.cjs

Checked 99 source files and 414 local imports.
All statically detected local imports resolved.
- check:branch:phase17: PASS — > react-example@0.0.0 check:branch:phase17
> node scripts/test-phase17-branch.cjs

PASS: phase17 admin company scope, AI owner immutability, audit actor validation, subscription branch scope (static only)
- audit:branch:coverage: PASS — "collection": "firm_info",
      "branchScopeReference": false,
      "legacyAdminFallback": true
    },
    {
      "collection": "subscription_requests",
      "branchScopeReference": true,
      "legacyAdminFallback": false
    }
  ]
}
- check:security:phase18: PASS — > react-example@0.0.0 check:security:phase18
> node scripts/test-phase18-security.cjs

PASS phase18 security structural checks (not emulator validation)
- check:security:phase19: PASS — > react-example@0.0.0 check:security:phase19
> node scripts/test-phase19-onboarding.cjs

PASS phase19 signup/approval structural checks (NOT emulator or UI runtime verification)
- check:offline-only: PASS — > react-example@0.0.0 check:offline-only
> node scripts/test-phase21-offline-only.cjs

PASS: offline-only plan flow, legacy request writes disabled, policy/dashboard consistency
- check:syntax: PASS — > react-example@0.0.0 check:syntax
> node scripts/check-typescript-syntax.cjs

Parsed 124 JS/TS/TSX files; syntax errors: 0. Compiler: 5.8.3
- check:security:phase22: PASS — > react-example@0.0.0 check:security:phase22
> node scripts/test-phase22-hardening.cjs

PASS: company privilege allowlist, retired plan writes, strict dates, exclusive expiry boundary
- check:security:phase23: PASS — > react-example@0.0.0 check:security:phase23
> node scripts/test-phase23-integration.cjs

PASS: notification privacy, branch-scoped recipient, immutable read status, trusted audit UID, service/UI date validation
- check:plan-dates: PASS — an-dates.mjs

PASS: 14 real date boundary and range assertions
(node:24757) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- check:migration:phase24: PASS — PASS duplicate assignment
PASS invalid assignments
PASS duplicate worker id
PASS invalid record
PASS admin user missing branch
PASS invalid company branch
PASS invalid company ID
PASS invalid export
14/14 migration readiness checks passed
- check:security:phase25: PASS — > react-example@0.0.0 check:security:phase25
> node scripts/test-phase25-api-security.cjs

PASS 12 API, RRN and branch-enforcement security invariants (static checks only)
- check:security:phase26: PASS — > react-example@0.0.0 check:security:phase26
> node scripts/test-phase26-rrn-authorization.cjs

PASS 26차 RRN API 권한 불변식 (정적 검사)
- check:security:phase27: PASS — > react-example@0.0.0 check:security:phase27
> node scripts/test-phase27-tenant-authorization.cjs

PASS 27차 관리자 이중 인증, 지부별 기업 권한, 회원 생성 사전검증/보상, 서버 오류 정보 비노출 (정적 검사)
- check:security:phase28: PASS — > react-example@0.0.0 check:security:phase28
> node scripts/test-phase28-tenant-integrity.cjs

PASS phase28 tenant creation, approval, directory isolation, audit actor role (static assertions only)
- check:security:phase29: PASS — 중첩 개인정보 삭제, 입력 제한, 프로필 RRN 보호, 감사로그 사용자 일치, 오류정보 축소, ID 충돌 완화
(node:24879) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- check:http:phase30: PASS — id configuration
PASS Unknown API is JSON 404
PASS Oversized JSON is sanitized 413
PASS Malformed JSON is sanitized 400
PASS Unknown error does not leak details
HTTP protection runtime checks: 8/8 passed
Unhandled API error { status: 500 }
- check:phase31: PASS — ed range fails closed
PASS valid leap day
PASS invalid leap day rejected
PASS production refuses missing dist
PASS readiness checks service configuration
PASS branch auth has no development bypass
Phase31 runtime/static checks 12/12 passed
- check:phase32: PASS — PASS API error handler installed
PASS Production requires compiled index
PASS CI checks TypeScript
PASS CI checks Vite build
PASS CI checks build output
PASS CI checks server safety regression
9/9 server-safety regression assertions passed
- check:phase33: PASS — afe
PASS privileged admin creation limited
PASS sensitive RRN reads limited
PASS maternity transitions limited and gated
PASS maternity assignment limited and gated
18/18 phase33 source invariants passed (not runtime Firebase verification)
- check:phase34: PASS — ity
PASS Active IP cannot reset quota by filling capacity
PASS Expired buckets are reclaimed
PASS Forwarded IP spoofing cannot bypass socket quota
PASS Retry-After returned on capacity denial
Phase 34 HTTP limiter runtime tests: 5/5 passed
- check:phase35: PASS — > react-example@0.0.0 check:phase35
> node scripts/test-phase35-runtime.cjs

PASS phase35: 9 encryption integrity and Firebase project isolation assertions
- check:phase36: PASS — 36-maternity-guard.mjs

Phase 36 maternity guard: 15/15 passed
(node:25042) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- check:phase37: PASS — > react-example@0.0.0 check:phase37
> node scripts/test-phase37-request-guards.cjs

PASS phase37: 18 executable input and branch-gate assertions
- check:phase38: PASS — > react-example@0.0.0 check:phase38
> node scripts/test-phase38-account-consistency.cjs

PASS phase38: 14 source and executable account consistency assertions
- check:phase39-44: PASS — ue printing
PASS CI invokes regression suite
PASS CI does not suppress native dependency install scripts
PASS release gate rejects incomplete deployment
PASS inventory does not fabricate completion percentage
13/13 phase39-44 checks passed
- check:phase45-49: PASS — d input
PASS leap day invalid
PASS invalid 31st
PASS valid leap day
PASS infinite hours
PASS negative hours
PASS empty company roster
PASS foreign company roster
PASS mismatched month
PASS invalid work type
Phase 45-49: 29/29 checks passed
- check:phase50-54: PASS — PASS delete uses latest document
PASS delete sync marker in transaction
PASS overtime calculation requires wage
PASS wage must be positive
PASS payroll items must be arrays
PASS payroll total must be finite
PASS payroll period is validated
- check:phase55-60: PASS — > react-example@0.0.0 check:phase55-60
> node scripts/test-phase55-60-batch.cjs

Phase55-60 compatibility checks 11/11 passed (structural; runtime covered by phase61-68)
- check:phase61-68: PASS — > react-example@0.0.0 check:phase61-68
> node scripts/test-phase61-68-concurrency.cjs

Phase61-68 concurrency mock checks: 17/17 passed
- check:phase69-76: PASS — > react-example@0.0.0 check:phase69-76
> node scripts/test-phase69-76-sync.cjs

Phase69-76 sync safety: 9/9 passed

전체 빌드·Firebase Emulator·브라우저 E2E는 실행하지 않음.
