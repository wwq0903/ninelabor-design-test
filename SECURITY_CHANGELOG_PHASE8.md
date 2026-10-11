# 8차 — 지부 이전 준비 검증 강화 (안전한 비배포 작업)

- `scripts/audit-branch-readiness.cjs`: 7차 점검 도구를 보완한 **별도 엄격 검사**. 누락된 컬렉션을 성공으로 오인하지 않도록 차단하며 관리자 담당기업의 타 지부 배정, 관리자 사용자 지부 누락, 잘못된 기업 참조를 검사함.
- `scripts/test-phase8.cjs`: 7개 오프라인 회귀 시나리오.
- 실행: `node scripts/test-phase8.cjs`; 비식별 JSON 준비 후 `node scripts/audit-branch-readiness.cjs <sanitized-export.json>`.
- **운영 데이터 미수정.** `firestore.rules` 및 `storage.rules` 변경 없음. 실제 지부 격리 미적용. 전체 빌드 및 Emulator 테스트 미완료.
- 내보내기 데이터의 전체성은 이 도구가 검증할 수 없음. 실명, 주민등록번호, 실제 급여 등 민감정보를 포함한 파일을 업로드하지 말 것.
- 다음 필수 작업: 스키마·기존 데이터 백필, 모든 관리자 API 및 Firestore/Storage 지부 접근 통합, Emulator 교차 지부 거부 테스트 후 배포.
