# 16차 지부 권한 적용 확대 (정적 수정)

- 적용 대상: maternity_cases, maternity_case_private, maternity_documents, maternity_document_private, maternity_deductions, data_requests, company_documents.
- 관리자 접근 경로에 지부 태그 검증을 추가하고, 관리자 수정 시 branchId 변경을 제한함.
- 기업·근로자 기존 접근 조건은 유지함.
- **중요:** branchId가 없는 레거시 문서는 기존 관리자 접근을 허용함. 완전한 지부 격리가 아님.
- Firebase Emulator/실제 데이터/전체 빌드 검증은 수행하지 않았음. 운영 배포 금지.
