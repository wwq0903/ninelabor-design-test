# NINE 17차 통합 작업 결과

## 변경된 실제 코드
- `firestore.rules`: 기업의 실제 지부 정보를 조회하는 `adminCanAccessCompany` 및 `adminCanAccessOptionalCompany` 함수 추가.
- `ai_consultations`: 관리자 지부 접근 범위 축소, 상담 소유자/기업/지부 식별자 수정 방지, 사용자 생성 시 타 기업 연결 제한.
- `subscription_requests`: 관리자 조회·생성·수정·삭제에 기업 지부 확인 추가, 수정 시 companyId 및 branchId 불변.
- `audit_logs`: 관리자 조회 지부 범위 제한, 클라이언트 생성 시 actorUserId/actorRole 일치 확인, 관리자 생성 시 기업 지부 범위 제한.
- `scripts/test-phase17-branch.cjs`: 17차 변경 사항 정적 회귀 검사 추가.
- `scripts/audit-branch-coverage.cjs`: 34개 컬렉션 지부 범위 참조 현황 자동 보고.
- `.github/workflows/verify.yml`: GitHub Actions에서 오프라인 검사와 npm 설치/TypeScript/Vite 빌드를 분리 실행하도록 CI 정의 추가. **이 환경에서 GitHub Actions는 실행하지 않음.**

## 실제 실행한 검사
- 17차 정적 회귀 검사: 통과.
- 기존 오프라인 보안 검사: 9/9 통과.
- 로컬 import: 94개 파일, 408개 연결 검사 통과.
- Node 구문 검사: 신규 스크립트 통과.
- npm 레지스트리 연결: DNS EAI_AGAIN. 의존성 설치 불가.
- `npm run verify:build`: `PHASE17_BUILD_ATTEMPT.txt` 참조. TypeScript 및 Vite 실제 빌드 성공 미확인.

## 남은 중요한 위험
- 34개 중 18개 컬렉션 블록에 지부 검사 함수 참조가 나타남(정적 분석). 나머지 16개가 모두 취약하다는 뜻도, 18개가 모두 안전하다는 뜻도 아님.
- 지부 정보가 없는 레거시 기업/문서에 관리자 호환 접근 허용이 남음.
- 기존 클라이언트가 작성하는 감사 로그에 role/branch 값이 없거나 불일치하면 권한 거부가 발생할 수 있음. 실제 사용자 시나리오 검증 필요.
- Firestore Emulator, 실제 계정별 권한, Storage 규칙, 전체 기능 실행 테스트 미완료.
- **운영 배포 금지.** Firebase rules는 에뮬레이터에서 기존 기능 회귀 테스트 후 적용.
