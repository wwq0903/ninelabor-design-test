# 노무법인 나인 69~76차 통합 수정 보고서

## 작업 근거 및 범위
61~68차 전체 소스에서 시작해 추가근무 급여 연동 상태의 **거짓 성공 표시**와 데이터 조회 장애 은폐를 수정했습니다. 회차 이름은 묶음 관리용이며 8개 독립 기능의 완성을 뜻하지 않습니다. 원본 Google AI Studio 프로젝트는 변경하지 않았습니다.

## 실제 코드 변경
1. `src/services/overtimeService.ts`: `recordOvertimeImport`가 실패해도 성공한 것처럼 반환하던 문제 수정. 트랜잭션으로 동기화 메타데이터를 읽고 `overtimeSourceUpdatedAt > importedAt`이면 가져오기 완료 마커를 기록하지 않음. 쓰기 장애를 호출자에게 전달.
2. 같은 파일: `recordOvertimeSourceUpdate` 실패를 무시하지 않음. 실패한 메타데이터 기록을 성공한 시각으로 반환하지 않음.
3. 같은 파일: `getOvertimeSyncMeta`, `getOvertimeSourceUpdatedAt`에서 DB 읽기 실패를 동기화된 상태/변경 없음으로 오인하지 않도록 오류를 상위에 전달. 실제 메타 문서가 없는 정상 상황의 fallback은 유지.
4. 같은 파일: 귀속연월 형식과 import 타임스탬프를 검사. 생성 시 `updatedById`가 요청 데이터로 위조되지 않도록 조정.
5. `src/components/dashboard/payroll/PayrollView.tsx`: 급여 목록 로드 실패 시 이전 기업의 화면 목록과 동기화 시각을 초기화하고 오류 메시지 표시.
6. `scripts/test-phase69-76-sync.cjs`: 정상 반영, 변경 중 충돌, 읽기·쓰기 장애, 입력 검증을 모의 Firestore로 검증.
7. `package.json`, `.github/workflows/verify.yml`: 회귀 검사 명령 및 CI 추가.

## 검증
- 신규 모의 실행 검사 9/9 통과.
- 기존 61~68차 모의 검사 17/17 통과.
- `check:` / `audit:` 중 운영환경 의존 검사 제외 32/32 통과.
- TS 구문 검사 124개 파일 통과, 로컬 import 414건 정상.
- 전체 TypeScript 타입검사, Vite 빌드, Firebase Emulator, 실제 다중 사용자·브라우저 테스트 **미실행**. 오후 4시 이후로 미루기로 한 설치/빌드 작업을 수행하지 않음.

## 미해결 사항
- 여러 근로자 급여를 순차 저장하는 연동 과정은 원자적이지 않으므로 중간 실패 시 일부 급여만 반영될 수 있음. 완료 마커를 잘못 기록하는 문제만 방지함.
- `importedAt`보다 이후 발생한 변경은 충돌로 막지만, 같은 밀리초 타임스탬프 등 극단적인 경합을 배제할 수 없음. 서버 시간·버전 카운터를 이용한 강화 필요.
- Firestore 규칙에서 새 트랜잭션의 `overtime_sync_meta` 읽기/쓰기를 허용하는지 실제 Emulator 확인 필요.
- 전체 기능 구현률과 배포 준비율은 실환경 검증 없이 정량화 불가.
