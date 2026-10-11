# 노무법인 나인 61~68차 통합 수정 보고

## 변경된 실제 코드
- `src/services/overtimeService.ts`: 추가근무의 논리적 식별키(companyId, employeeId, workDate, workType)를 SHA-256으로 해시한 안정적 Firestore 문서 ID `ot_v2_*` 도입. 단건/일괄 신규 저장을 Firestore 트랜잭션으로 변경하고 문서 존재 확인을 트랜잭션의 모든 쓰기보다 먼저 실행. 기존 데이터와의 중복을 막기 위한 조회 추가. 신규 문서의 식별키인 근무일·근무구분을 수정할 경우 삭제 후 재등록하도록 제한. 월별 변경 메타데이터를 같은 트랜잭션에서 기록.
- `scripts/test-phase61-68-concurrency.cjs`: 단건/일괄 중복 거절, 다중 월, 입력 오류, 실패 커밋, 결정적 ID, 트랜잭션 읽기 순서 등을 모의 Firestore로 실행 검증 (17 assertions).
- `scripts/test-phase55-60-batch.cjs`: 기존 writeBatch 방식에만 의존한 모의 테스트를 새로운 트랜잭션 계약에 맞는 구조 회귀 검사로 교체 (11 assertions). 실행형 검증은 phase61-68에서 수행.
- `scripts/audit-overtime-duplicates.cjs`: 기존 레코드 JSON을 입력받아 논리키별 중복과 필수값 누락을 탐지하는 읽기 전용 진단 도구 추가. 실제 데이터 변경 없음.
- `package.json`, `.github/workflows/verify.yml`: 신규 검사 CI 포함.

## 검증 결과
- 기존 포함 `check:*`, `audit:*` 검사(환경 필수 항목 제외) 31/31 통과.
- 신규 실행형 모의 검증 17/17 통과.
- 호환 구조 검사 11/11 통과.
- TypeScript 문법 검사 124개 오류 없음. 로컬 import 414건 해결됨.

## 제약과 위험
- **실제 Firebase Emulator 동시성 테스트는 하지 못함.** 모의 트랜잭션은 Firestore의 실제 경합 재시도·규칙 적용을 재현하지 않음.
- 기존 무작위 ID 레코드는 유지. 이전 버전 클라이언트가 계속 쓰기를 하면 결정적 ID와 무관하게 중복이 발생할 수 있으므로, 구 버전 배포 중지 및 레거시 중복 감사 필요.
- 기존 레코드의 동일 키 중복은 자동 정리하지 않음. 읽기 전용 감사 스크립트로 먼저 확인할 것.
- 브라우저의 Web Crypto `crypto.subtle`이 가능한 보안 컨텍스트(HTTPS/localhost)가 필요.
- Firestore 보안 규칙의 다수 문서 트랜잭션 허용 여부는 Emulator로 반드시 검증할 것. 특히 200건 일괄 작업은 규칙 평가·트랜잭션 한도를 확인해야 함.
- `npm install`, `npm run lint`, `npm run build`는 사용자가 연기하도록 요청한 범위이므로 실행하지 않음.
- Google AI Studio 원본 프로젝트는 변경하지 않음.

## 다음 검증 우선순위
1. Firebase Emulator에서 두 브라우저/클라이언트의 동일 키 동시 생성 경합 검증.
2. 레거시 레코드 중복 현황을 익명화 JSON으로 감사하고, 데이터 정리·마이그레이션을 별도 승인 후 실행.
3. Firestore rules의 1건·20건·200건 트랜잭션 허용 여부 확인.
4. 사용자와 정한 시점 이후 패키지 설치, 전체 타입 검사, 빌드 및 브라우저 E2E 수행.

**진행률:** 이번 범위의 코드 변경 및 모의 검증은 완료. 전체 기능 구현률/실제 운영 검증률/배포 준비율은 검증 기준표 미완성으로 미산정. 검사 통과율을 전체 개발률로 오인하지 말 것.
