# NINE 15차 — 지부별 보안 규칙 적용 범위 정밀 조사

이 단계는 **코드 변경 없이**, Firestore 규칙의 지부별 권한 적용 범위를 정적 분석한 결과입니다.

- 분석한 컬렉션: 34개
- `canAccessTaggedBranch` 참조가 있는 컬렉션: 8개
- 해당 참조가 없는 컬렉션: users, admins, tasks, task_source_locks, company_directory, worker_sensitive_data, maternity_cases, maternity_case_private, maternity_documents, maternity_document_private, maternity_deductions, inquiries, inquiry_files, inquiry_history, consents, message_templates, message_reads, message_files, data_requests, company_documents, notifications, overtime_sync_meta, ai_consultations, audit_logs, firm_info, subscription_requests
- **핵심 위험:** `canAccessTaggedBranch`가 `branchId` 없는 기존 자료를 관리자에게 허용하는 이전 호환 분기를 포함함. 따라서 지부 완전 격리 **미완료**.
- 참조 유무만 조사했으며 각 `allow` 조건의 모든 경로가 안전하다는 의미는 아닙니다.
- Firebase Emulator 미실행, 전체 빌드 미실행. 운영 적용 불가.

## 다음 실행 과제
1. 비식별화된 기존 기업·관리자·업무자료의 지부 매핑 및 이전 계획 검증
2. Emulator에서 지부별 긍정/부정 접근 테스트 실행
3. 기존 데이터 이전 완료 후 레거시 예외 제거 및 모든 API/Storage 경로 검증
