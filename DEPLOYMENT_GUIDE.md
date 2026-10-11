# NINELABOR 배포 안내 (실배포 미실행)

## 권장 구조
Vite 정적 화면과 Express `/api`를 **동일한 Node 서비스**에서 제공하는 Docker 배포 구조.
Netlify 정적 배포만으로는 `/api/admin/*`, `/api/worker/*`, `/api/ai-consult`가 실행되지 않음.

## 실행 준비
1. Node 22 이상 및 인터넷 접근 가능한 빌드 환경에서 `npm install`, `npm run lint`, `npm run build` 성공 확인.
2. `docker build -t ninelabor .` 수행. 이 명령은 패키지를 내려받으며, 여기에서는 실행하지 못함.
3. 운영 환경의 Secret Manager에서 `FIREBASE_SERVICE_ACCOUNT_KEY`, `RRN_ENCRYPTION_KEY`, `GEMINI_API_KEY` 주입. **클라이언트 VITE_ 변수에 서버 비밀키를 절대 넣지 말 것.**
4. HTTPS 프록시 / 도메인 연결 / Firebase Auth 승인 도메인 / CORS 정책 / 레이트 리밋 / 로그 정책 검토.
5. `GET /api/health`(프로세스 생존), `GET /api/ready`(관리자 인증·AI 설정 여부) 확인.
6. Firebase Emulator에서 Firestore/Storage rules 검증 후 운영에 별도 배포.
7. Firebase Storage 버킷 프로비저닝 후 실제 파일 권한 테스트.

## 제한
- Dockerfile은 **배포 구조를 마련한 것**이며 이미지 빌드, 서버 실행, 실제 보안 검증은 아직 안 됨.
- `npm install`은 lockfile 재현 설치가 아님. 실제 배포 전 npm lockfile을 생성·고정하고 `npm ci`로 전환 권장.
- 소스 내 운영 Secret, 사용자 데이터, 실제 주민등록번호를 ZIP에 포함하지 말 것.

## 추가 확인: 운영 컨테이너의 Firebase 프로젝트 설정
서버 `src/server/firebaseAdmin.ts` 및 `adminUserService.ts`는 저장소 루트의
`firebase-applet-config.json`을 import함. 운영 Docker 이미지에 이 파일이 반드시
포함되어야 하며 이번 수정에서 COPY 누락을 해결함. 이 파일은 프로젝트 식별자 등
클라이언트용 설정이며 서비스 계정 비밀키와 구별됨.

## 실행 가능한 검증과 불가능한 검증의 구분
- `npm run check:production-artifact`: 운영 이미지에 필요한 파일 COPY 및 진입점의 **정적 계약** 검증
- `npm run check:runtime-delivery`: 서버 라우팅/캐시 **정적 계약** 검증
- `npm run lint && npm run build`: 의존성을 설치한 환경에서 수행해야 하는 **실제 컴파일·빌드**
- `docker build -t ninelabor . && docker run ...`: Docker가 설치된 환경에서 수행할 **실제 이미지 검증**
- 인증/급여/근태/모성보호 등 실제 권한 테스트는 Emulator 또는 별도 테스트 Firebase 프로젝트 필요.
