# 노무법인 나인 101~108차 통합 작업 보고서

## 실제 변경 범위
- `firestore.rules`: 급여 상태 머신과 원본 식별자 불변성을 서버 측 보안 규칙에 추가.
- 관리자 생성은 DRAFT만 허용. 관리자 수정은 DRAFT 유지 또는 DRAFT→CONFIRMED, CONFIRMED→DRAFT(취소 사유), CONFIRMED→PAID만 허용.
- 상태 변경 시 변경 가능한 필드를 제한하고 confirmedById/cancelledById/paidById를 로그인 UID와 대조.
- 회사 사용자의 DRAFT 수정에도 기업/근로자/귀속연월/createdAt 불변성 검증.
- 급여 삭제는 관리자이고 DRAFT인 경우만 허용. CONFIRMED/PAID 삭제 차단.
- `scripts/test-phase101-108-payroll-rules.cjs`: 정적 규칙 검사 12건 추가.
- `package.json`, `.github/workflows/verify.yml`: 검사 명령과 CI 연결.

## 실행 검사
- 오프라인 check:/audit: 36/36 통과 (운영환경 설정 검사 2개 제외).
- 신규 보안 규칙 정적 검사 12/12 통과.
- 기존 급여 상태 전환 모의 검사 16/16 통과.
- JS/TS/TSX 문법 검사 124개 오류 0건.
- 로컬 import 415건 누락 0건.

## 중요 미검증 사항
- Firestore Emulator Rules 단위/통합 테스트 미실행. 규칙 정적 검사만으로 실제 Rules 문법·권한 평가·트랜잭션 적합성을 보증하지 않음.
- 관리자 지부/기업 매핑이 없는 기존 데이터는 강화된 보안 규칙에 따라 거절될 수 있으므로 실데이터 이행 점검 필요.
- 감사 로그를 반드시 같은 트랜잭션에서 생성하도록 Rules가 강제하지는 않음. 앱 서비스의 트랜잭션 구현에 의존.
- 전체 Vite 빌드, TypeScript 타입 검사, 실제 브라우저 E2E 및 배포는 미실행.
- 변경된 firestore.rules를 배포하지 않았음.

## 다음 우선 작업
1. Firebase Emulator에서 ADMIN/COMPANY/WORKER 실제 권한 매트릭스 검증.
2. Firestore Rules 컴파일 및 기존 급여 상태 변경 트랜잭션의 실환경 호환성 검증.
3. 100명 초과 급여 처리와 중복/감사 로그 재검토.
4. 전체 빌드, 디자인 및 최종 배포 QA.
