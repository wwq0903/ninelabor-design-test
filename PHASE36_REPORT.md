# NINE 36차 — 모성보호 트랜잭션 무단 필드 수정 차단

## 확인된 실제 위험
`maternityDeductionTransaction.ts`는 클라이언트가 전송한 `extraCaseUpdates`를 `Object.assign`으로 사건 업데이트 객체에 덮어쓸 수 있었습니다. 이는 `companyId`, `branchId`, `deductionInfo`, `status` 등 서버에서 관리해야 할 필드에 대한 덮어쓰기 위험입니다.

## 적용
- `src/server/maternityMutationGuard.ts`: 사건/기업 문서 ID 및 상태값 검증, 허용된 부가 변경 필드만 통과, 완료 처리 작성자 및 보완요청 작성자 UID 검증.
- `src/server/maternityDeductionTransaction.ts`: 트랜잭션 진입 전에 검증하고 서버가 만든 원장·사건 변경 데이터를 보호. 이미 차감된 사건 및 최초 차감 경로에 모두 적용.
- `scripts/test-phase36-maternity-guard.mjs`: 허용·거부 동작 15건 테스트.
- CI에 phase36 테스트 추가.

## 실행 확인
- 36차 테스트: 15/15 통과
- TS/JS/TSX 구문 파싱: 123개, 오류 0
- 로컬 import: 413개 확인, 누락 0
- 오프라인 보안 검사: 9/9 통과
- 전체 타입 검사: 실패 — vite/client 패키지 없음
- Vite 빌드: 실패 — vite 실행 파일 없음
- Firebase Emulator/실제 서비스 통합 테스트: 미실시

## 운영 주의
본 수정은 모성보호 서버 트랜잭션 경로의 추가 필드 변조를 제한합니다. Firestore 클라이언트 직접 쓰기와 다른 업데이트 경로는 별도 규칙/통합 검증이 필요합니다. 프로덕션 배포 전 의존성 설치와 실제 빌드, Firebase Emulator 테스트가 필수입니다.
