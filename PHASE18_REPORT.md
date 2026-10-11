# NINE 18차 통합 수정 결과

## 실제 변경
- `firestore.rules`: 일반 COMPANY 자체 회원가입 시 기존 기업 ID/지부를 임의 연결하는 행위 차단. 정상 기업 연결은 별도 승인/서버 절차 필요.
- `firestore.rules`: COMPANY가 기업의 지부, 담당자, 대표 계정, 관리자 관련 필드 및 결제 정보를 직접 변경하지 못하도록 차단.
- `firestore.rules`: `/documents` WORKER 생성은 ACTIVE 소속, 동일 companyId, 본인 업로드, 본인 employeeId로 제한. 기존에는 단순 uploadedById 일치만 확인.
- `firestore.rules`: `/documents` 업데이트 시 companyId/employeeId/uploadedById 변경 금지, 관리자 접근 시 해당 기업의 지부 확인.
- `firestore.rules`: `/company_documents` 관리자 조회/생성/삭제 시 문서 자체의 지부뿐 아니라 참조 기업의 지부도 확인.
- 10차/16차 정적 테스트를 강화된 정책 함수에 맞춰 갱신. 18차 회귀 검사 추가. GitHub Actions에 추가.

## 실행 검증
- 기존 오프라인 보안 검사 9/9 통과
- 18차 정적 보안 회귀 검사 통과
- 로컬 소스 94개 파일 / import 408개 확인
- 17차 지부 검사 통과
- 16차 지부 검사 통과
- 빌드 준비 5/7: Vite 및 TypeScript 프로젝트 의존성 미설치

## 남은 위험 및 필수 검증
- Firestore Emulator에서 정상/악의적 가입·문서 업로드·지부간 접근 테스트가 필요함. 정적 검사는 실제 Rules 평가가 아님.
- 기업 가입 흐름이 COMPANY 계정에 companyId를 바로 기록하던 방식이면 신규 제한과 충돌할 수 있음. 실제 가입 플로우 확인 필요.
- `branchId` 없는 기존 레거시 자료 허용 예외 남음. 마이그레이션 전 운영 적용 금지.
- npm 의존성 미설치로 TypeScript 타입 검사 및 Vite 빌드 미완료.
- 본 수정본은 개발용이며 운영 배포 승인본이 아님.
