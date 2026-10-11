# 노무법인 나인 35차 — Firebase 프로젝트 격리 및 주민등록번호 암호문 검증

## 실제 수정
- `src/server/firebaseAdmin.ts`: 서비스 계정 JSON의 `project_id`가 앱 Firebase 프로젝트와 일치하지 않으면 관리자 SDK 초기화 차단. 기존 SDK 앱 재사용 시에도 동일 프로젝트 ID 검증. 다른 프로젝트 인증정보를 실수로 주입하거나 타 프로젝트 앱을 재사용하는 위험 감소.
- `src/server/rrnService.ts`: AES-256-GCM 암호문 IV(12바이트), 인증 태그(16바이트), 암호문 16진수 형식을 복호화 전에 엄격히 검증. Node Buffer의 잘못된 hex 입력 자동 절단 방지. 기존 정상 암호문 포맷은 유지.
- `scripts/test-phase35-runtime.cjs`: 암호화·복호화 왕복, 마스킹, 손상된 암호문 차단, Firebase 프로젝트 검증 코드 존재 등 9개 검증.
- `scripts/smoke-deployment.cjs`: 실제 배포된 HTTPS URL의 /api/health, 404, 보안 헤더를 확인할 수 있는 읽기 전용 스모크 검사 추가. 배포 전이므로 실행하지 않음.
- GitHub Actions와 npm scripts에 35차 검사 연결.

## 검증
- `check:*` 중 빌드 준비도 검사를 제외한 22개 명령 전부 통과.
- 신규 35차 테스트 9개 통과. 소스 문법 122개, 로컬 import 412개 검사 통과.
- `npm install` 30초 재시도 중 타임아웃. 현재 프로젝트 의존성이 설치되지 않아 TypeScript 전체 타입 검사와 Vite 빌드 미실시/미통과.
- Firebase Emulator, 실제 Firebase, 로그인/급여/모성보호/브라우저 E2E 테스트 미실시.

## 운영 주의
- Firebase 서비스 계정은 `firebase-applet-config.json`의 프로젝트 ID와 반드시 일치해야 함. 실제 운영 프로젝트로 이전할 때는 앱 설정과 서비스 계정을 함께 변경해야 함.
- 기존 `RRN_ENCRYPTION_KEY`를 임의로 교체하면 저장된 주민번호 복호화가 불가능해질 수 있으므로 키 회전 계획 없이 변경하지 말 것.
- 운영 배포용으로 검증된 소스가 아님. 원본 AI Studio 프로젝트 유지.
