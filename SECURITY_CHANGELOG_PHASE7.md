# 7차: 지부 데이터 이전 사전점검 + 모성보호 사건 소속 검증

- `src/server/branchAuthorization.ts`: 지부 권한 플래그 활성 시, URL의 사건 ID로 `maternity_cases`를 서버에서 조회하고 요청의 `targetCompanyId`와 실제 사건의 `companyId` 일치를 확인. 기존 회사 소속 검사에 더해 사건 대상 검증 추가.
- `scripts/audit-branch-migration.cjs`: 별도로 준비한 **비식별 JSON 내보내기**를 읽는 로컬 전용, 읽기 전용 사전점검 도구. Firebase 접속/쓰기/마이그레이션은 하지 않음. 컬렉션 간 기업 참조, 지부 ID, 지부 불일치 검출.
- `scripts/test-phase7.cjs`: 데이터 사례 및 코드 가드 정적 테스트.
- 실행: `node scripts/test-phase7.cjs`; `node scripts/audit-branch-migration.cjs sanitized-export.json`.
- 주의: 이 검사는 모든 Firestore 문서 스키마를 확정하거나 전체 데이터 접근 정책을 검증하지 않음. 지부별 보안 규칙, 데이터 이전, 운영 배포 및 Emulator 테스트는 여전히 미완료. 현재 플래그 기본 비활성.
- **실제 고객 데이터나 주민등록번호를 포함한 내보내기 파일을 채팅에 업로드하지 말 것.**
