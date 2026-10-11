# 34차 실제 검사 결과

## check:security:offline: PASS
```
ASS 지부 권한 정책
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
## check:imports: PASS
```

> react-example@0.0.0 check:imports
> node scripts/check-local-imports.cjs

Checked 97 source files and 412 local imports.
All statically detected local imports resolved.

```
## check:branch:phase17: PASS
```

> react-example@0.0.0 check:branch:phase17
> node scripts/test-phase17-branch.cjs

PASS: phase17 admin company scope, AI owner immutability, audit actor validation, subscription branch scope (static only)

```
## check:security:phase18: PASS
```

> react-example@0.0.0 check:security:phase18
> node scripts/test-phase18-security.cjs

PASS phase18 security structural checks (not emulator validation)

```
## check:security:phase19: PASS
```

> react-example@0.0.0 check:security:phase19
> node scripts/test-phase19-onboarding.cjs

PASS phase19 signup/approval structural checks (NOT emulator or UI runtime verification)

```
## check:offline-only: PASS
```

> react-example@0.0.0 check:offline-only
> node scripts/test-phase21-offline-only.cjs

PASS: offline-only plan flow, legacy request writes disabled, policy/dashboard consistency

```
## check:syntax: PASS
```

> react-example@0.0.0 check:syntax
> node scripts/check-typescript-syntax.cjs

Parsed 122 JS/TS/TSX files; syntax errors: 0. Compiler: 5.8.3

```
## check:security:phase22: PASS
```

> react-example@0.0.0 check:security:phase22
> node scripts/test-phase22-hardening.cjs

PASS: company privilege allowlist, retired plan writes, strict dates, exclusive expiry boundary

```
## check:security:phase23: PASS
```

> react-example@0.0.0 check:security:phase23
> node scripts/test-phase23-integration.cjs

PASS: notification privacy, branch-scoped recipient, immutable read status, trusted audit UID, service/UI date validation

```
## check:plan-dates: PASS
```
ipts/test-phase23-plan-dates.mjs

PASS: 14 real date boundary and range assertions
(node:11255) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

```
## check:migration:phase24: PASS
```
ss branch assignment
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
## check:security:phase25: PASS
```

> react-example@0.0.0 check:security:phase25
> node scripts/test-phase25-api-security.cjs

PASS 12 API, RRN and branch-enforcement security invariants (static checks only)

```
## check:security:phase26: PASS
```

> react-example@0.0.0 check:security:phase26
> node scripts/test-phase26-rrn-authorization.cjs

PASS 26차 RRN API 권한 불변식 (정적 검사)

```
## check:security:phase27: PASS
```

> react-example@0.0.0 check:security:phase27
> node scripts/test-phase27-tenant-authorization.cjs

PASS 27차 관리자 이중 인증, 지부별 기업 권한, 회원 생성 사전검증/보상, 서버 오류 정보 비노출 (정적 검사)

```
## check:security:phase28: PASS
```

> react-example@0.0.0 check:security:phase28
> node scripts/test-phase28-tenant-integrity.cjs

PASS phase28 tenant creation, approval, directory isolation, audit actor role (static assertions only)

```
## check:security:phase29: PASS
```
ening.mjs

PASS 29차: 중첩 개인정보 삭제, 입력 제한, 프로필 RRN 보호, 감사로그 사용자 일치, 오류정보 축소, ID 충돌 완화
(node:11377) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

```
## check:http:phase30: PASS
```
imiter rejects invalid configuration
PASS Unknown API is JSON 404
PASS Oversized JSON is sanitized 413
PASS Malformed JSON is sanitized 400
PASS Unknown error does not leak details
HTTP protection runtime checks: 8/8 passed
Unhandled API error { status: 500 }

```
## check:phase31: PASS
```
s closed
PASS reversed range fails closed
PASS valid leap day
PASS invalid leap day rejected
PASS production refuses missing dist
PASS readiness checks service configuration
PASS branch auth has no development bypass
Phase31 runtime/static checks 12/12 passed

```
## check:phase32: PASS
```
ironment exceptions
PASS API error handler installed
PASS Production requires compiled index
PASS CI checks TypeScript
PASS CI checks Vite build
PASS CI checks build output
PASS CI checks server safety regression
9/9 server-safety regression assertions passed

```
## check:phase33: PASS
```
 request body null-safe
PASS privileged admin creation limited
PASS sensitive RRN reads limited
PASS maternity transitions limited and gated
PASS maternity assignment limited and gated
18/18 phase33 source invariants passed (not runtime Firebase verification)

```
## check:phase34: PASS
```
Reject invalid capacity
PASS Active IP cannot reset quota by filling capacity
PASS Expired buckets are reclaimed
PASS Forwarded IP spoofing cannot bypass socket quota
PASS Retry-After returned on capacity denial
Phase 34 HTTP limiter runtime tests: 5/5 passed

```
