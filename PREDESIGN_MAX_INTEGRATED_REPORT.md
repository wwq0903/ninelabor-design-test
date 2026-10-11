# 노무법인 나인 — 디자인 이전 최대 통합 작업 보고서

## 실제 변경
- `Dockerfile`: Vite 빌드 + Express `/api`를 단일 컨테이너로 실행할 수 있는 2단계 이미지 구성
- `.dockerignore`: 빌드 컨텍스트에서 환경변수 비밀 파일, node_modules, dist 제외
- `package.json`: 운영 런타임에서 필요한 `tsx`를 dependencies로 이동; 검증 스크립트 등록
- `DEPLOYMENT_GUIDE.md`: 운영 환경의 비밀키, Firebase Emulator, Storage 버킷, 도메인/HTTPS 검증 절차
- `scripts/test-deployment-contract.cjs`: 배포 구조 오프라인 검증 11개

## 실행 결과
- npm check:* 오프라인 스크립트 44/44 통과 (`PREDESIGN_MAX_TEST_RESULTS.md` 참조)
- 배포 구조 계약 검사 11/11 통과 (44개 스크립트에 포함)
- 배포 준비도 8/11: Dockerfile이 API 호스팅 계획을 제공함

## 아직 차단된 검증
1. TypeScript, Vite 의존성 미설치로 전체 타입 검사 및 빌드 미실행
2. 실제 Docker 이미지 빌드/기동 및 HTTP smoke 테스트 미실행
3. Firebase Emulator 실제 Firestore/Storage 권한 테스트 미실행
4. Firebase Storage 운영 버킷 미프로비저닝, 운영 Secret/도메인/실데이터 미연결
5. 역할별 브라우저 E2E, 급여·모성보호·메시지·파일 전 업무 통합 테스트 미실행
6. npm 설치는 잠금파일 재현 설치가 아니므로 운영 전 package-lock.json 생성 및 npm ci 검증 필요

## 해석
이번 수정은 배포 아키텍처의 실행 가능한 소스 기반을 마련한 것이며, 운영 준비 완료 또는 전체 기능 QA 완료를 의미하지 않음. 디자인은 미착수.
