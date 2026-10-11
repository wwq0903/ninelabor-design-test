# 10차: 지부 태그 접근제어 확대 (정적 검증 단계)

- `workers`, `documents`, `payrolls`, `overtime_records`, `messages` 컬렉션의 관리자 접근 허용 경로에 `canAccessTaggedBranch` 조건 추가.
- 수정 시 `branchId` 불변 조건 추가. 기업 및 근로자의 기존 접근 조건은 유지.
- 기존 문서에 `branchId`가 없으면 레거시 관리자 접근을 계속 허용함. 완전한 지부 격리가 아님.
- 클라이언트가 관리자 문서의 `branchId`를 설정할 수 있으므로 실제 회사 지부와 일치하는지 검증하는 서버 API 및 데이터 이전이 필요.
- `list` 쿼리는 권한 규칙이 필터처럼 작동하지 않으므로 지부 필터를 적용하지 않은 관리자 목록 쿼리가 실패할 수 있음.
- Storage Rules, 기타 컬렉션, Firebase Emulator 테스트, 전체 빌드는 아직 미완료. 운영 환경 배포 금지.
