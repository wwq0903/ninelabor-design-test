# NINE 3차 보안 수정

## 변경
- `firestore.rules`: `payrolls` 및 `overtime_records`의 WORKER 읽기 조건에 `users/{uid}.companyId`와 대상 문서의 `companyId` 일치 검증 추가.
- `scripts/test-worker-company-isolation-static.py`: 두 컬렉션의 기업 소속 검증 정적 검사 추가.
- 기존 1·2차 수정 유지.

## 정적 검사 결과
- 신규 기업 소속 검증 2건 통과.
- 기존 급여 규칙 정적 검사 5건 통과.

## 주의
- Firebase Emulator 및 실제 데이터로 허용/거부 검증 전에는 운영에 배포하지 말 것.
- 기존 사용자 프로필에 `companyId`가 누락되어 있으면 WORKER의 급여·추가근무 조회가 거부됨. 기존 데이터 정합성 점검 및 이전 계획 필요.
- 기업/근로자 소속 승인 및 지부별 격리, 문서 컬렉션 등 다른 권한 규칙은 여전히 별도 검증 필요.
- 전체 npm 설치, 빌드, 실서비스 테스트는 수행하지 못함.
