# 노무법인 나인 — 디자인 이전 통합 기술 점검

## 기준
157~164차 소스 복사본을 기준으로 작업. 디자인 변경, 운영 Firebase 데이터 변경, 실제 배포 없음.

## 실제 변경
1. `firebase.json`: Auth/Firestore/Storage 에뮬레이터 포트 및 기존 보안 규칙 파일 연결 (실제 실행은 하지 않음).
2. `scripts/audit-predesign-readiness.cjs`: 의존성, 빌드, 보안 규칙, 서버 API 운영 호스팅, 에뮬레이터, 데이터 점검 도구를 읽기 전용 검사.
3. `scripts/test-predesign-readiness.cjs`: 점검 도구의 API 탐지 및 결과 스키마 6개 단언.
4. `package.json`: 점검 명령 두 개 등록.
5. `server.ts`: AI 시스템 지시문의 영문 브랜드 표기를 NINELABOR로 통일.

## 실행 결과
- `npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false`: 실패 ENOTCACHED (@google/genai).
- package.json의 `check:*` 명령 중 배포 전제 조건이 필요한 `check:release`, `check:build-readiness`를 제외한 43개: **43 통과, 0 실패**.
- 디자인 이전 준비도 검사: **7/11 PASS, 4 BLOCKED**.
- BLOCKED: 로컬 TypeScript 미설치, 로컬 Vite 미설치, dist/index.html 없음, Express 서버 API를 실제 배포할 호스팅 구성 없음.
- Firebase Emulator는 구성 파일만 추가했고 실제 실행/권한 검증을 수행하지 못함.
- 데이터 이전, 보안 규칙 배포, Firebase Storage 버킷 생성, 실제 로그인/브라우저 QA는 하지 않음.

## 디자인 이전 필수 해결 순서
1. Node 22 이상 + 네트워크가 되는 환경에서 의존성 설치 후 `npm run verify:build` 통과.
2. Express API 서버 운영 방식을 선택하고 호스팅 및 라우팅 구성 (정적 Netlify만으로는 부족).
3. Firebase Emulator에서 관리자/기업/근로자/기업·지점 간 접근 통제와 저장 규칙 검증.
4. 실제 데이터의 sourceVersion/지점 필드 감사 및 필요시 백업 기반 이전 계획 수립.
5. 주요 업무 E2E: 로그인→소속 승인→추가근무→급여 확정/조회→자료 요청→메시지→모성보호.
6. 위 항목 통과 후 다른 채팅의 디자인 캡처를 기준으로 UI 작업.

## 결론
이 파일은 **디자인 이전 기술 점검 결과**이며 165~172차 디자인 완료 보고서가 아니다. 모든 기능이 검증됐거나 배포 가능하다는 의미가 아니다.
