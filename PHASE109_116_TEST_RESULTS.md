## check:security:offline — PASS
```
PASS 지부 권한 정책
PASS 6차 API 연결 정적 검사
PASS 7차 데이터 검증
PASS 8차 데이터 검증
PASS 9차 Firestore 규칙 정적 검사
PASS 10차 지부 규칙 정적 검사
PASS 급여 보안 정적 검사
PASS 관리자 목록 보안 정적 검사
PASS 근로자·기업 격리 정적 검사

결과: 9/9개 검사 스크립트 통과
주의: 정적/오프라인 검사만 수행. Firebase Emulator, 전체 빌드 및 실서비스 보안 검증을 대체하지 않음.

```
## check:imports — PASS
```
Checked 99 source files and 415 local imports.
All statically detected local imports resolved.

```
## check:branch:phase17 — PASS
```
PASS: phase17 admin company scope, AI owner immutability, audit actor validation, subscription branch scope (static only)

```
## audit:branch:coverage — PASS
```
ction": "audit_logs",
      "branchScopeReference": true,
      "legacyAdminFallback": true
    },
    {
      "collection": "firm_info",
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

```
## check:security:phase18 — PASS
```
PASS phase18 security structural checks (not emulator validation)

```
## check:security:phase19 — PASS
```
PASS phase19 signup/approval structural checks (NOT emulator or UI runtime verification)

```
## check:offline-only — PASS
```
PASS: offline-only plan flow, legacy request writes disabled, policy/dashboard consistency

```
## check:syntax — PASS
```
Parsed 124 JS/TS/TSX files; syntax errors: 0. Compiler: 5.8.3

```
## check:security:phase22 — PASS
```
PASS: company privilege allowlist, retired plan writes, strict dates, exclusive expiry boundary

```
## check:security:phase23 — PASS
```
PASS: notification privacy, branch-scoped recipient, immutable read status, trusted audit UID, service/UI date validation

```
## check:plan-dates — PASS
```
PASS: 14 real date boundary and range assertions
(node:38988) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

```
## check:migration:phase24 — PASS
```
llection
PASS missing worker branch
PASS wrong worker branch
PASS unknown company
PASS cross branch assignment
PASS duplicate assignment
PASS invalid assignments
PASS duplicate worker id
PASS invalid record
PASS admin user missing branch
PASS invalid company branch
PASS invalid company ID
PASS invalid export
14/14 migration readiness checks passed

```
## check:security:phase25 — PASS
```
PASS 12 API, RRN and branch-enforcement security invariants (static checks only)

```
## check:security:phase26 — PASS
```
PASS 26차 RRN API 권한 불변식 (정적 검사)

```
## check:security:phase27 — PASS
```
PASS 27차 관리자 이중 인증, 지부별 기업 권한, 회원 생성 사전검증/보상, 서버 오류 정보 비노출 (정적 검사)

```
## check:security:phase28 — PASS
```
PASS phase28 tenant creation, approval, directory isolation, audit actor role (static assertions only)

```
## check:security:phase29 — PASS
```
PASS 29차: 중첩 개인정보 삭제, 입력 제한, 프로필 RRN 보호, 감사로그 사용자 일치, 오류정보 축소, ID 충돌 완화
(node:39040) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

```
## check:http:phase30 — PASS
```
er allows configured number and then returns 429
PASS Limiter isolates distinct IPs
PASS Limiter rejects invalid configuration
PASS Unknown API is JSON 404
PASS Oversized JSON is sanitized 413
PASS Malformed JSON is sanitized 400
Unhandled API error { status: 500 }
PASS Unknown error does not leak details
HTTP protection runtime checks: 8/8 passed

```
## check:phase31 — PASS
```
date rejects
PASS inclusive end date
PASS expired following day
PASS corrupt end date fails closed
PASS reversed range fails closed
PASS valid leap day
PASS invalid leap day rejected
PASS production refuses missing dist
PASS readiness checks service configuration
PASS branch auth has no development bypass
Phase31 runtime/static checks 12/12 passed

```
## check:phase32 — PASS
```
dy
PASS AI errors do not log upstream exception object
PASS Startup errors do not dump environment exceptions
PASS API error handler installed
PASS Production requires compiled index
PASS CI checks TypeScript
PASS CI checks Vite build
PASS CI checks build output
PASS CI checks server safety regression
9/9 server-safety regression assertions passed

```
## check:phase33 — PASS
```
no audit PII
PASS no raw exception logging
PASS failure injection restricted to tests
PASS request body null-safe
PASS privileged admin creation limited
PASS sensitive RRN reads limited
PASS maternity transitions limited and gated
PASS maternity assignment limited and gated
18/18 phase33 source invariants passed (not runtime Firebase verification)

```
## check:phase34 — PASS
```
PASS Reject invalid capacity
PASS Active IP cannot reset quota by filling capacity
PASS Expired buckets are reclaimed
PASS Forwarded IP spoofing cannot bypass socket quota
PASS Retry-After returned on capacity denial
Phase 34 HTTP limiter runtime tests: 5/5 passed

```
## check:phase35 — PASS
```
PASS phase35: 9 encryption integrity and Firebase project isolation assertions

```
## check:phase36 — PASS
```
Phase 36 maternity guard: 15/15 passed
(node:39113) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

```
## check:phase37 — PASS
```
PASS phase37: 18 executable input and branch-gate assertions

```
## check:phase38 — PASS
```
PASS phase38: 14 source and executable account consistency assertions

```
## check:phase39-44 — PASS
```
log AI error objects
PASS Deployment gate exposed
PASS Inventory exposed
PASS Release config avoids secret value printing
PASS CI invokes regression suite
PASS CI does not suppress native dependency install scripts
PASS release gate rejects incomplete deployment
PASS inventory does not fabricate completion percentage
13/13 phase39-44 checks passed

```
## check:phase45-49 — PASS
```
onfirmation
PASS no default fabricated wage
PASS finite money amounts
PASS strict company worker map
PASS valid input
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

```
## check:phase50-54 — PASS
```
lure is propagated
PASS employee overtime list failure is propagated
PASS delete returns transaction snapshot
PASS delete uses latest document
PASS delete sync marker in transaction
PASS overtime calculation requires wage
PASS wage must be positive
PASS payroll items must be arrays
PASS payroll total must be finite
PASS payroll period is validated

```
## check:phase55-60 — PASS
```
Phase55-60 compatibility checks 11/11 passed (structural; runtime covered by phase61-68)

```
## check:phase61-68 — PASS
```
Phase61-68 concurrency mock checks: 17/17 passed

```
## check:phase69-76 — PASS
```
Phase69-76 sync safety: 9/9 passed

```
## check:phase77-84 — PASS
```
Phase77-84 atomic payroll tests: 12/12 passed

```
## check:phase85-92 — PASS
```
Phase85-92 executable tests: 10/10 passed

```
## check:phase93-100 — PASS
```
Phase93-100 executable payroll transitions: 16/16 passed

```
## check:phase101-108 — PASS
```
e
PASS tenant immutable
PASS status transition helper
PASS draft confirm
PASS confirm cancellation
PASS confirm paid
PASS cancel reason
PASS admin status author
PASS locked record delete denied
PASS admin update guard
PASS company identity guard
PASS company draft only
Phase101-108 payroll rules structural checks: 12/12 passed (not emulator tests)

```
## check:phase109-116 — PASS
```
d
PASS rules default deny
PASS payroll identity immutable
PASS payroll admin transitions guarded
PASS locked payroll delete restricted
PASS payroll worker read limited to confirmed/paid
PASS overtime batch canonical transaction
PASS overtime result follows input order
PASS no async push race
PASS emulator is not falsely claimed
14/14 checks passed

```