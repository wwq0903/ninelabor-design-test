# NINELABOR 디자인 이전 서버 제공 방식 보완 보고서

## 실제 변경
- `server.ts`: 운영 환경에서 존재하지 않는 확장자 포함 정적 리소스 요청은 404로 반환하고, SPA 화면 경로는 index.html로 처리. HTML은 no-cache, Vite assets는 immutable 캐시 헤더 적용.
- `scripts/test-runtime-delivery.cjs`: API 우선 라우팅, 404, 캐시, Docker 실행 구조에 대한 8개 정적 회귀 검사 추가.
- `package.json`: `check:runtime-delivery` 명령 추가.

## 검증
- 신규 정적 회귀 검사 8/8 통과.
- 오프라인 check/audit 스크립트 47개 통과, 1개 실패(`check:build-readiness`, 실제 설치 의존성 부족).
- JS/TS/TSX 문법 125개 파일 오류 0개, 로컬 import 418개 누락 0개.
- `npm run verify:build` 실행했으나 typescript/vite/plugin-react/tailwindcss-vite 패키지 미설치로 차단됨.
- `npm install --ignore-scripts --prefer-offline` 시도는 시간 제한으로 실패; 의존성 설치 성공을 주장하지 않음.
- Docker 실행 파일이 환경에 없어 이미지 빌드/컨테이너 실행 미실시.
- Firebase Emulator, 운영 Firebase, 실제 사용자 E2E 미실시.

## 디자인 이전 남은 필수 작업
1. 네트워크가 가능한 환경에서 의존성 설치 및 lockfile 고정 후 `npm run lint`, `npm run build`.
2. Docker 이미지 실제 빌드, Express HTTP smoke 및 프록시 검증.
3. Firebase Emulator에서 ADMIN/COMPANY/WORKER 역할과 회사/지점/본인 격리 확인.
4. 실데이터 마이그레이션 점검, Firebase Storage 활성화와 rules 배포/검증.
5. 급여·근태·모성보호·메시지·파일·AI 주요 흐름 E2E 검증.

이번 작업은 운영 환경 검증이 아닌 코드 보완과 정적 회귀 검증이다. 디자인 변경 없음.
