# 오프라인 검사 실행 결과

- check:security:offline: PASS — 기업 격리 정적 검사

결과: 9/9개 검사 스크립트 통과
주의: 정적/오프라인 검사만 수행. Firebase Emulator, 전체 빌드 및 실서비스 보안 검증을 대체하지 않음.
- check:imports: PASS — Checked 100 source files and 418 local imports.
All statically detected local imports resolved.
- check:branch:phase17: PASS — ompany scope, AI owner immutability, audit actor validation, subscription branch scope (static only)
- check:security:phase18: PASS — PASS phase18 security structural checks (not emulator validation)
- check:security:phase19: PASS — PASS phase19 signup/approval structural checks (NOT emulator or UI runtime verification)
- check:offline-only: PASS — PASS: offline-only plan flow, legacy request writes disabled, policy/dashboard consistency
- check:syntax: PASS — Parsed 125 JS/TS/TSX files; syntax errors: 0. Compiler: 5.8.3
- check:security:phase22: PASS — PASS: company privilege allowlist, retired plan writes, strict dates, exclusive expiry boundary
- check:security:phase23: PASS — ivacy, branch-scoped recipient, immutable read status, trusted audit UID, service/UI date validation
- check:plan-dates: PASS — and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- check:migration:phase24: PASS — d company branch
PASS invalid company ID
PASS invalid export
14/14 migration readiness checks passed
- check:security:phase25: PASS — PASS 12 API, RRN and branch-enforcement security invariants (static checks only)
- check:security:phase26: PASS — PASS 26차 RRN API 권한 불변식 (정적 검사)
- check:security:phase27: PASS — PASS 27차 관리자 이중 인증, 지부별 기업 권한, 회원 생성 사전검증/보상, 서버 오류 정보 비노출 (정적 검사)
- check:security:phase28: PASS — SS phase28 tenant creation, approval, directory isolation, audit actor role (static assertions only)
- check:security:phase29: PASS — and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- check:http:phase30: PASS — does not leak details
HTTP protection runtime checks: 8/8 passed
Unhandled API error { status: 500 }
- check:phase31: PASS —  configuration
PASS branch auth has no development bypass
Phase31 runtime/static checks 12/12 passed
- check:phase32: PASS —  build output
PASS CI checks server safety regression
9/9 server-safety regression assertions passed
- check:phase33: PASS — ignment limited and gated
18/18 phase33 source invariants passed (not runtime Firebase verification)
- check:phase34: PASS — t quota
PASS Retry-After returned on capacity denial
Phase 34 HTTP limiter runtime tests: 5/5 passed
- check:phase35: PASS — PASS phase35: 9 encryption integrity and Firebase project isolation assertions
- check:phase36: PASS — and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
- check:phase37: PASS — PASS phase37: 18 executable input and branch-gate assertions
- check:phase38: PASS — PASS phase38: 14 source and executable account consistency assertions
- check:phase39-44: PASS — te deployment
PASS inventory does not fabricate completion percentage
13/13 phase39-44 checks passed
- check:phase45-49: PASS — foreign company roster
PASS mismatched month
PASS invalid work type
Phase 45-49: 29/29 checks passed
- check:phase50-54: PASS — PASS payroll items must be arrays
PASS payroll total must be finite
PASS payroll period is validated
- check:phase55-60: PASS — Phase55-60 compatibility checks 11/11 passed (structural; runtime covered by phase61-68)
- check:phase61-68: PASS — Phase61-68 concurrency mock checks: 17/17 passed
- check:phase69-76: PASS — Phase69-76 sync safety: 9/9 passed
- check:phase77-84: PASS — Phase77-84 atomic payroll tests: 12/12 passed
- check:phase85-92: PASS — Phase85-92 executable tests: 10/10 passed
- check:phase93-100: PASS — Phase93-100 executable payroll transitions: 16/16 passed
- check:phase101-108: PASS — S company draft only
Phase101-108 payroll rules structural checks: 12/12 passed (not emulator tests)
- check:phase109-116: PASS — follows input order
PASS no async push race
PASS emulator is not falsely claimed
14/14 checks passed
- check:phase117-124: PASS — ing payroll rejected
PASS existing audit atomic
PASS existing sync atomic
Phase117-124: 12/12 passed
- check:phase125-132: PASS — mpany create requires revision one
PASS company update requires increment
Phase125-132: 17/17 passed
- check:phase133-140: PASS — rules enforce company branch admin reads
11/11 structural checks passed; Firestore emulator not run.
- check:phase141-148: PASS — company updates restricted to marker fields
PASS optional import marker read safe
15/15 tests passed
- check:phase149-156: PASS — ains
19/19 checks passed (helper behavioral tests + service structural tests; no Firebase emulator).
- check:phase157-164: PASS — ing PortalShell
PASS public website uses existing PublicWebsite
14 UI integration assertions; PASSED
- check:predesign: PASS — PASS pre-design readiness audit schema, API discovery and deployment gate (6 assertions)
- check:deployment-contract: PASS — fore SPA
PASS deployment guide documents external validation
11/11 deployment contract checks passed
