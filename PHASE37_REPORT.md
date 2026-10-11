# 노무법인 나인 — 37차 상세 경과보고서

## 기준 및 변경 범위
- 기준: 36차 통합 소스의 복사본. 원본은 변경하지 않음.
- 변경 파일: `server.ts`, `src/server/branchAuthorization.ts`, `src/server/maternityRequestValidation.ts`(신규), `scripts/test-phase37-request-guards.cjs`(신규), `package.json`, `.github/workflows/verify.yml`.

## 발견한 문제와 실제 수정
1. 모성보호 상태 변경 및 담당자 배정 API에서 `Boolean(allowSkipIfAlreadyDeducted)`를 사용함. JSON 문자열 `"false"`도 true로 바뀌어 기차감 처리 분기 진입을 유발할 수 있음. `parseMaternitySkipFlag`를 신설하여 실제 JSON boolean만 허용하고, 누락 시 false, 다른 타입 시 400 `INVALID_SKIP_FLAG`로 응답하도록 두 경로 모두 수정.
2. 지부 권한 게이트에서 Firebase ID 토큰 검증 실패와 Firestore 읽기/백엔드 오류를 같은 catch로 처리해 모두 401로 응답하던 문제 수정. 토큰 검증 실패는 401 `INVALID_TOKEN`, DB 읽기 장애는 503 `AUTH_BACKEND_UNAVAILABLE`로 분리. 인증/권한 거부 403 로직은 유지.
3. 위 동작을 TS 소스 트랜스파일 + 모의 인증/DB를 사용하여 직접 호출하는 실행형 회귀 검사 18개 추가. CI에 등록.

## 검증
- 신규 실행형 테스트 18개 PASS.
- 26개 `check:`/`audit:` 명령 중 25개 PASS. 나머지 `check:build-readiness`는 의존성 부재로 FAIL(설계된 사전검사).
- TypeScript 구문 분석: 124개 파일 오류 0.
- 로컬 import 확인: 414개 연결 누락 0.
- `npm run lint`: FAIL, `vite/client` 타입 정의 미설치.
- `npm run build`: FAIL, `vite` 실행 파일 미설치.
- `npm view vite` 확인: `EAI_AGAIN registry.npmjs.org`; 현재 컨테이너에서 의존성 설치를 완료할 수 없음.
- 실제 Firebase/브라우저 E2E 테스트: 미실시.

## 전체 진행도 산정 방식
단일 '실제 완료율'은 기능 명세별 요구사항, 빌드, E2E 및 운영 테스트 결과가 없으면 객관적으로 산정할 수 없음. 따라서 근거 있는 관측 지표와 잠정 추정치를 분리함.
- 정적·모의 실행 검사 통과율: 25/25 = 100% (환경 준비 확인 1개 별도 실패). **제품 기능 완료율이 아님.**
- 빌드/타입 검사 성공률: 0/2 = 0% (설치 부재로 검증 불가; 코드 자체의 오류 여부 미판정).
- 신규 HTTP 입력 검증 및 분기 테스트: 18/18 = 100% (모의 실행 한정).
- 기능 구현률/전체 개발률/배포 준비율: 현재 파일 개수와 정적 검사만으로 정확한 퍼센트를 산출할 수 없음. 임의 수치를 사실처럼 제시하지 않음.

## 기능별 현황 (소스 존재 여부 기준; 정상 동작 인증 아님)
- 계정/권한: AuthContext, adminUserService, branchAuthorization, Firestore Rules 존재. 통합 검증 미완료.
- 기업·회원: firmService, company 관련 서비스 존재. 통합 검증 미완료.
- 급여: payrollService 존재. 실제 확정/지급/E2E 미완료.
- 추가근무/근태: overtimeService 존재. 실제 연동 검증 미완료.
- 모성보호: 트랜잭션/복구/보호 코드와 테스트 존재. Emulator 통합 검증 미완료.
- 문서/메시지: documentService, messageService, 관련 저장소 서비스 존재. 실제 Storage 검증 미완료.
- AI: aiConsultationService와 서버 Gemini 엔드포인트 존재. 실 API 통합 검증 미완료.
- UI/모바일: React 앱 존재. 브라우저 반응형/접근성 검증 미완료.

## 후속 필수 작업
1. 네트워크 연결 가능한 환경에서 의존성 설치 및 TypeScript/Vite 빌드 성공.
2. Firebase Emulator와 브라우저 E2E로 ADMIN/COMPANY/WORKER의 기업 격리, 급여, 근태, 모성보호, 파일 검증.
3. 운영용 UI/UX 정리, 환경 변수/Storage 활성화/Rules 배포, 배포 전 실제 QA.

**판정: 37차 변경 코드 및 오프라인 검사는 완료. 전체 제품 빌드·운영 준비 완료는 아님.**
