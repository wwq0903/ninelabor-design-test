# 노무법인 나인 141~148차 통합 경과보고서

## 범위
133~140차 전체 소스를 기반으로 141~148차 작업을 통합하였다. 원본 Google AI Studio 프로젝트 및 운영 Firebase에는 접속하거나 변경하지 않았다.

## 실제 코드 변경
1. `firestore.rules`: COMPANY의 `overtime_sync_meta` 생성 시 허용 필드 제한, 문서 id 일치 검증, 업데이트 변경 가능 필드 제한.
2. `firestore.rules`: 선택 필드 `overtimeImportedAt` 접근을 `get(..., null)`로 변경하여 필드 미존재 시 규칙 평가 오류 가능성 감소.
3. `scripts/lib/overtime-migration-audit.cjs`: Firestore JSON 내보내기의 추가근무/동기화 메타 정합성 읽기 전용 분석기.
4. `scripts/audit-overtime-migration.cjs`: CLI. 사용법 `npm run audit:overtime-migration -- path/to/export.json --json`. 발견된 차단 오류 시 종료코드 1, 입력 오류 시 2.
5. `scripts/test-phase141-148-migration.cjs`: 15개 회귀 검사.
6. `package.json`, `.github/workflows/verify.yml`: 검사 명령 등록.

## 점검 범위
- 버전 누락·비정상 버전, 메타 누락·중복·문서 ID 불일치
- 동일 근로자/날짜/근무구분의 중복 기록
- 근무일자·귀속연월 불일치, 필수 데이터 누락
- 가져오기 표시와 원본 수정시각 불일치
- 회사의 메타 변경 가능 필드 제한 구조 검사

## 검사
- 전체 오프라인 검사 41/41 통과.
- 신규 테스트 15/15 통과.
- 상세 내역 `PHASE141_148_TEST_RESULTS.md`.

## 남은 위험 및 배포 전 필수 조치
- Firestore Rules 컴파일 및 Emulator 권한 테스트는 미수행. 정적 검사 통과를 실제 보안 검증으로 간주하지 말 것.
- 실제 운영 데이터의 `sourceVersion` 이전 작업은 미수행. 검사 도구는 자동 이전/수정 기능을 의도적으로 제공하지 않음.
- JSON export에는 민감 정보가 있을 수 있으므로 안전한 로컬에서 실행하고 결과 공유 시 식별자 비식별화 필요.
- 프로젝트 의존성 설치, 전체 TypeScript 타입 검사, Vite 빌드 및 실제 브라우저 E2E는 미수행.
- 규칙의 ADMIN 경로는 기존과 동일하게 별도 점검이 필요하며, COMPANY에 허용된 메타 변경이 실제 추가근무 기록 변경과 결합되었는지는 이번 규칙만으로 강제되지 않음.
- 최종 PC/모바일 디자인 개편, Firebase Storage 활성화, 배포 준비 미완료.
