# 117~124차 통합 검사 결과
- 오프라인 검사 38/38 통과
- npm 의존성 설치/전체 Vite 빌드/Firebase Emulator는 미실행

- PASS check:security:offline: PASS 지부 권한 정책
PASS 6차 API 연결 정적 검사
PASS 7차 데이터 검증
PASS 8차 데이터 검증
PASS 9차 Firestore 규칙 정적 검사
PASS 10차 지부 규칙 정적 검사
PASS 급여
- PASS check:imports: Checked 99 source files and 415 local imports.
All statically detected local imports resolved.
- PASS check:branch:phase17: PASS: phase17 admin company scope, AI owner immutability, audit actor validation, subscription branch scope (static only
- PASS audit:branch:coverage: : true,
      "legacyAdminFallback": true
    },
    {
      "collection": "firm_info",
      "branchScopeReference": fa
- PASS check:security:phase18: PASS phase18 security structural checks (not emulator validation)
- PASS check:security:phase19: PASS phase19 signup/approval structural checks (NOT emulator or UI runtime verification)
- PASS check:offline-only: PASS: offline-only plan flow, legacy request writes disabled, policy/dashboard consistency
- PASS check:syntax: Parsed 124 JS/TS/TSX files; syntax errors: 0. Compiler: 5.8.3
- PASS check:security:phase22: PASS: company privilege allowlist, retired plan writes, strict dates, exclusive expiry boundary
- PASS check:security:phase23: PASS: notification privacy, branch-scoped recipient, immutable read status, trusted audit UID, service/UI date validatio
- PASS check:plan-dates: PASS: 14 real date boundary and range assertions
(node:41643) ExperimentalWarning: Type Stripping is an experimental fea
- PASS check:migration:phase24: ker branch
PASS unknown company
PASS cross branch assignment
PASS duplicate assignment
PASS invalid assignments
PASS dup
- PASS check:security:phase25: PASS 12 API, RRN and branch-enforcement security invariants (static checks only)
- PASS check:security:phase26: PASS 26차 RRN API 권한 불변식 (정적 검사)
- PASS check:security:phase27: PASS 27차 관리자 이중 인증, 지부별 기업 권한, 회원 생성 사전검증/보상, 서버 오류 정보 비노출 (정적 검사)
- PASS check:security:phase28: PASS phase28 tenant creation, approval, directory isolation, audit actor role (static assertions only)
- PASS check:security:phase29: PASS 29차: 중첩 개인정보 삭제, 입력 제한, 프로필 RRN 보호, 감사로그 사용자 일치, 오류정보 축소, ID 충돌 완화
(node:41765) ExperimentalWarning: Type Stripping
- PASS check:http:phase30: ASS Limiter isolates distinct IPs
PASS Limiter rejects invalid configuration
PASS Unknown API is JSON 404
PASS Oversized
- PASS check:phase31: following day
PASS corrupt end date fails closed
PASS reversed range fails closed
PASS valid leap day
PASS invalid leap 
- PASS check:phase32: ject
PASS Startup errors do not dump environment exceptions
PASS API error handler installed
PASS Production requires co
- PASS check:phase33: ilure injection restricted to tests
PASS request body null-safe
PASS privileged admin creation limited
PASS sensitive RR
- PASS check:phase34: PASS Reject invalid capacity
PASS Active IP cannot reset quota by filling capacity
PASS Expired buckets are reclaimed
PA
- PASS check:phase35: PASS phase35: 9 encryption integrity and Firebase project isolation assertions
- PASS check:phase36: Phase 36 maternity guard: 15/15 passed
(node:41928) ExperimentalWarning: Type Stripping is an experimental feature and m
- PASS check:phase37: PASS phase37: 18 executable input and branch-gate assertions
- PASS check:phase38: PASS phase38: 14 source and executable account consistency assertions
- PASS check:phase39-44: PASS Inventory exposed
PASS Release config avoids secret value printing
PASS CI invokes regression suite
PASS CI does no
- PASS check:phase45-49: inite money amounts
PASS strict company worker map
PASS valid input
PASS leap day invalid
PASS invalid 31st
PASS valid l
- PASS check:phase50-54: lure is propagated
PASS delete returns transaction snapshot
PASS delete uses latest document
PASS delete sync marker in 
- PASS check:phase55-60: Phase55-60 compatibility checks 11/11 passed (structural; runtime covered by phase61-68)
- PASS check:phase61-68: Phase61-68 concurrency mock checks: 17/17 passed
- PASS check:phase69-76: Phase69-76 sync safety: 9/9 passed
- PASS check:phase77-84: Phase77-84 atomic payroll tests: 12/12 passed
- PASS check:phase85-92: Phase85-92 executable tests: 10/10 passed
- PASS check:phase93-100: Phase93-100 executable payroll transitions: 16/16 passed
- PASS check:phase101-108: per
PASS draft confirm
PASS confirm cancellation
PASS confirm paid
PASS cancel reason
PASS admin status author
PASS lock
- PASS check:phase109-116: mutable
PASS payroll admin transitions guarded
PASS locked payroll delete restricted
PASS payroll worker read limited to
- PASS check:phase117-124: revision
PASS import compares source revision
PASS import rejects missing version on tracked source
PASS import rejects 
