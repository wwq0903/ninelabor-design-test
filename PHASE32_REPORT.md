# NINE 32차 — 실행 검증 우선 전환 및 서버 오류 방어

## 실제 수정
- `server.ts`: 모성보호 상태 변경·담당자 배정 API에서 JSON 본문이 없을 때 비구조화 할당 예외가 발생하지 않도록 방어 (`req.body ?? {}`).
- `server.ts`: Gemini 상위 예외 객체와 서버 시작 예외 객체를 그대로 기록하지 않도록 변경. 오류 시 내부 설정/질문 데이터의 로그 노출 위험 감소.
- `scripts/test-phase32-server-safety.cjs`: 서버 안정성 및 CI 배포 검증 경로 9개 회귀 주장 검사 추가.
- `package.json`: 32차 회귀 검사 명령 추가.
- `.github/workflows/verify.yml`: 32차 검사 및 빌드 결과 검증(`verify:build`) 추가.

## 이 환경에서 실제 실행한 검사
- 32차 신규 회귀 주장 검사: 9/9 통과 (정적 소스 확인; 실제 HTTP 통합 테스트 아님).
- JS/TS/TSX 구문 파싱: 122개, 오류 0.
- 로컬 import 확인: 97개 파일, 412건 확인.
- 오프라인 보안 검사: 9/9 스크립트 통과.
- 이전 15개 추가 검사 명령 통과 (22~31차 및 기타 검사).
- 빌드 준비: 5/7. Vite 및 TypeScript 패키지가 node_modules에 설치되지 않음.
- `npm run lint`: TS2688 `vite/client` 누락으로 실패.
- `npm run build`: `vite: not found`로 실패.
- npm 의존성 설치 시도는 환경 내에서 완료되지 않음. Firebase Emulator/실제 Firebase 연결 테스트는 미실시.

## 중요
이 버전은 실제 서비스 빌드 또는 운영 검증을 통과한 버전이 아님. 정적 검사는 기능 정상 동작을 보장하지 않음. 배포 전 네트워크 가능한 개발 환경에서 `npm install`, `npm run lint`, `npm run build`, `npm run verify:build`, Firebase Emulator/실계정 E2E 테스트를 수행해야 함.

## 권장 다음 작업
1. 인터넷 연결된 로컬/CI 환경에서 의존성 설치 및 lockfile 재현성 확보.
2. 실제 타입 오류 및 Vite 빌드 오류 일괄 수정.
3. 로그인·가입·기업 승인·지부 격리·급여·모성보호·문서·NIA E2E 테스트.
4. 데이터 마이그레이션, UI/UX, Firebase Storage, 배포 QA.
