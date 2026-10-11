# NINE 19차 통합 개발 보고서

## 실제 수정 (가입-보안-관리자 승인 흐름을 한 번에 연결)
1. 이메일 가입과 Google 계정 미완성 프로필 복구에서 COMPANY가 즉시 회사를 만들고 자기 계정에 companyId/ACTIVE를 부여하던 **실제 충돌**을 제거. 기업대표는 PENDING_COMPANY_VERIFICATION 상태로 등록되고 requestedCompanyName/requestedBusinessNumber를 보관한다.
2. Firestore Rules에서 companies와 company_directory의 비관리자 create를 차단하고, 공개 COMPANY 프로필 생성은 승인대기 상태만 허용한다. 기존 자가 생성 경로는 더 이상 동작하지 않는다.
3. 관리자 기업관리 화면에 승인 대기 기업대표 목록, 전주/광주 지부 선택, 신원 확인 안내, 승인 버튼, 오류 처리 추가.
4. `firmService.approveCompanyRegistration`는 Firestore 트랜잭션으로 기업/공개 디렉터리/대표 사용자 프로필을 **원자적으로** 생성/연결하고, 승인 중복을 방지한다.
5. 회원가입 완료 화면의 기업대표/소속 근로자 승인대기 안내를 실제 상태와 일치시켰다.
6. 새 구조 회귀 검사 및 CI 단계 추가.

## 실행 검증
- `npm run check:security:offline`: 9/9 PASS
- `npm run check:security:phase18`: PASS
- `npm run check:security:phase19`: PASS (정적 구조 검사)
- `npm run check:imports`: 94개 파일 / 410개 import PASS
- `npm run check:branch:phase17`: PASS
- `node scripts/check-phase16-branch.cjs`: PASS
- `npm run check:build-readiness`: 5/7, Vite/TypeScript 프로젝트 패키지 없음
- npm registry DNS 조회 실패 (`Could not resolve host: registry.npmjs.org`), 실제 빌드/에뮬레이터/화면 테스트 불가

## 남은 위험 및 배포 차단
- 관리자 권한은 기존 Firestore `isAdmin()` 정책에 의존하므로 지부별 관리자 승인 권한 세분화는 별도 검증 필요.
- 사업자등록번호 진위 및 대표자 신원 확인은 관리자 수동 절차이며 자동 검증은 구현하지 않았다.
- 기존에 ACTIVE로 가입된 기업대표의 계정/기업 자료는 소급 수정하지 않는다. 운영 전 데이터 감사 필요.
- 기존 UI의 다른 가입 모달(AuthModal) 안내문구, Google 계정 재가입/프로필 복구 경로를 실제 실행 환경에서 확인할 것.
- Firebase Emulator에서 비관리자 회사/디렉터리 생성 차단 및 관리자 승인 트랜잭션 검증 필수.
- Firebase 의존성 설치, TypeScript 전체 검사, Vite 빌드, 모바일·PC QA 미완료. **운영 배포 금지.**
