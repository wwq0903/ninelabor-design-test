# NINE 2차 보안 수정 기록

## 변경 사항
- `firestore.rules`: 기업 계정의 급여자료 생성은 DRAFT로 제한.
- 기업 계정은 기존 DRAFT를 DRAFT 상태로만 수정할 수 있으며, companyId 변경 불가.
- 확정(CONFIRMED) 및 지급완료(PAID) 상태 변경은 현재 ADMIN 규칙만 허용.
- `scripts/test-payroll-rules-static.py`: 위 규칙의 존재 여부를 확인하는 정적 회귀 점검 추가.

## 검증 수준과 배포 주의
- 정적 점검은 Firebase Rules 실행을 대신하지 않음. Firebase Emulator에서 COMPANY/WORKER/ADMIN 계정별 허용·거부 테스트 필수.
- 현재 ADMIN은 급여 전체 수정 권한을 유지하므로 ADMIN 측 상태 전이 검증 및 감사 로그 무결성은 추가 보완 필요.
- 기존 기업 사용자에게 급여 확정 버튼이 노출되어 있다면 새 규칙 적용 후 권한 오류가 날 수 있으므로 실제 운영 역할별 UI 흐름 확인 필수.
- 지부별 격리, 30일 재인증, 기존 데이터 마이그레이션은 이번 수정 범위에 포함되지 않음.
- 운영 Firebase에 규칙을 아직 배포하지 않았음.
