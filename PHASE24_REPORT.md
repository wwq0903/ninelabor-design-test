# NINE 24차: 지부 데이터 이전 사전검증 강화

## 변경
- `scripts/audit-branch-readiness.cjs`: 지부 이전용 오프라인 점검의 누락 탐지 강화. 컬렉션 미포함, 중복/누락 ID, 회사 참조 오류, 회사-레코드 지부 불일치, 지부 미기재 레거시 데이터, 관리자 담당 기업의 타 지부 연결, 중복/잘못된 할당 구조 탐지.
- `scripts/test-phase24-migration.cjs`: 정상/오류 데이터 14가지 회귀 검사.
- `npm run check:migration:phase24`와 GitHub Actions에 회귀 검사 추가.

## 주의
- 이 검사는 **익명화된 오프라인 JSON**만 처리하며 Firebase 데이터를 직접 조회/수정하지 않는다.
- `branchId`가 없는 회사 연계 레코드를 이전 차단 사유로 판단하되, 기존 데이터를 자동 변경하거나 삭제하지 않는다.
- 컬렉션별 `id` 필드가 없는 익스포트는 실패한다. 문서 ID를 `id`에 포함해 익스포트해야 한다.
- 컬렉션 전체가 익스포트되었다는 사실 자체는 자동 증명하지 못한다.
- TypeScript 타입 검사, Vite 빌드, Firebase Emulator 통합 테스트는 미완료. 운영 배포 금지.

## 테스트
`PHASE24_TEST_RESULTS.txt` 참고.
