# 노무법인 나인 34차 — API 요청 제한 우회 취약점 수정 및 통합 검사

## 실제 수정
- `src/server/httpProtection.ts`: 기존 IP별 요청 제한 구현이 최대 저장 개수에 도달하면 **아직 유효한 IP 기록을 강제로 삭제**하여 해당 IP가 즉시 새 요청 횟수를 얻는 우회 가능성을 수정함.
- 저장 한도 도달 시 만료된 기록만 정리하고, 공간이 부족하면 새로운 IP 요청을 HTTP 429로 거부하는 fail-closed 정책으로 변경.
- `maxEntries`가 양의 안전한 정수인지 검증.
- `scripts/test-phase34-rate-limit.cjs`: 실제 TypeScript 모듈을 트랜스파일해 실행하는 테스트 5개 추가(한도 우회, 만료 정리, IP 헤더 위조, Retry-After, 설정 검증).
- `package.json`에 `check:phase34` 등록, GitHub Actions 워크플로에 연결.

## 직접 실행한 검증
- `check:*` 중 빌드 준비도 검사를 제외한 **21개 검사 명령 모두 성공**. 상세 로그 `PHASE34_TEST_RESULTS.md`.
- 새 HTTP 요청 제한 테스트 5/5, 기존 HTTP 테스트 8/8.
- JS/TS/TSX 문법 122개 파일 파싱 성공, 로컬 import 412건 해결.
- `check:build-readiness`: 5/7 (Vite와 TypeScript 프로젝트 의존성 미설치).
- `npm run lint`: 실패 (`vite/client` 타입 미설치).
- `npm run build`: 실패 (`vite` 명령 없음).
- Firebase Emulator/실제 Firebase, UI 브라우저 통합 테스트 **미실시**.

## 중요한 한계
- 위 21개 검사는 개별 정적/단위 검사이지 서비스 전체 실행 테스트가 아님.
- 인메모리 요청 제한은 단일 프로세스에만 적용됨. 다중 서버 운영 시 공유 저장소/게이트웨이 기반 요청 제한 필요.
- 새 IP 요청을 거부하는 방식은 자원 고갈 시 안전하게 제한하지만 NAT 사용자에게도 일시적인 429를 유발할 수 있음.
- 전체 빌드 성공, 실제 인증/권한/급여/모성보호 시나리오 검증은 완료되지 않았음. 운영 배포 금지.
