# NINE 28차 — 기업 생성 원자성·지부 승인·공개 인덱스 권한 보완

## 실제 수정 사항
1. `src/services/firmService.ts`: 기업 승인 시 현재 관리자의 실제 지부와 선택한 지부가 같아야 하며, 신청 문서에 기존 지부가 있으면 일치해야 승인하도록 변경.
2. `src/services/firmService.ts`: 관리자 기업 직접 생성 시 임의 ID 덮어쓰기를 방지하고, 기업 원본과 공개 디렉터리 레코드를 단일 Firestore 트랜잭션으로 원자적 생성. 이전에는 기업 생성 후 디렉터리 생성 실패를 경고만 하고 넘어가 검색에서 누락될 수 있었음.
3. `firestore.rules`: 공개 기업 디렉터리의 생성/수정/삭제를 해당 지부 관리자에게만 허용. 기업 사용자 직접 수정 경로 제거. 생성 트랜잭션에서는 `existsAfter`/`getAfter`를 사용하여 함께 생성된 기업의 지부를 검증.
4. `src/services/firmService.ts`: 플랜 변경 감사 기록의 actorRole을 호출자가 임의 지정하지 못하게 ADMIN으로 고정하고 비관리자 역할 요청을 거부.
5. 19차 정적 테스트를 강화된 디렉터리 정책에 맞게 갱신. 28차 신규 회귀 검사 및 GitHub Actions 자동 실행 연결.

## 검사 결과
- 15개 정적/오프라인 검사 명령 전부 PASS (세부: `PHASE28_CHECK_RESULTS.txt`).
- JS/TS/TSX 문법 120개 파일 PASS; 로컬 import 409건 PASS.
- TypeScript 전체 타입 검사 **실패**: `vite/client` 의존성 미설치.
- Vite 빌드 **실패**: `vite` 실행 파일 미설치.
- npm 의존성 설치 재시도했으나 제한 시간 내 완료하지 못함.

## 배포 차단 조건
- 네트워크 가능한 환경에서 npm 의존성 설치 후 TypeScript 전체 검사 및 Vite 빌드 성공 필요.
- Firestore Emulator에서 규칙 구문 컴파일 및 회사+디렉터리 생성 트랜잭션의 `getAfter` 동작 검증 필수.
- 전주/광주 실제 관리자 권한 및 가입 승인 테스트, 지부 누락 데이터 이전, Firebase Storage와 실제 업무 기능 통합 테스트 필요.
- 기존 원본 덮어쓰기 및 운영 배포 금지. 정적 테스트 성공은 런타임 검증을 대체하지 않음.
