# NINE 22차 대규모 통합 수정 보고서

## 실제 수정
1. `firestore.rules`: COMPANY의 `companies/{companyId}` 수정 권한을 기존 금지 필드 목록 방식에서 **명시적 허용 필드 목록** 방식으로 전환. 플랜, 소속 지부, 관리자/대표 식별자, 과거 플랜 신청 락, 새로 추가될 권한 필드를 기본 차단. 관리자 변경은 기존 정책 유지.
2. `firestore.rules`: 구독 종료일 다음날 00:00:00 정각을 잘못 허용하던 `<= next midnight` 비교를 `< next midnight`로 수정.
3. `src/services/subscriptionRequestService.ts`: UI만 비활성화돼 있던 과거 고객 직접 플랜 신청 API에 즉시 오류 반환 적용. 기존 신청 기록 조회 메서드는 유지.
4. `src/components/dashboard/admin/AdminSubscriptionsView.tsx`: 관리자 플랜 날짜의 잘못된 달력 날짜 및 형식 입력 차단(YYYY-MM-DD 및 실제 날짜 확인).
5. 과거 17차/18차 정적 검사를 현재 보안 정책에 맞게 갱신(검사 완화가 아니라 **현재 불변 조건 검사로 교체**).
6. JS/TS/TSX 전체 파싱 검사 추가 (`npm run check:syntax`), 22차 보안 회귀 검사 추가, CI에 포함.

## 검증 (실제 실행)
- 기존 오프라인 보안 검사: 9/9 통과
- 로컬 import: 94개 소스 파일 / 407개 import 검사 통과
- JS/TS/TSX 파서: 119개 파일 / 문법 오류 0
- 17·18·19·21·22차 정적 회귀 검사: 각각 통과

## 중요한 미검증
- TypeScript 전체 **타입 검사**와 Vite 실제 빌드 미완료 (프로젝트 의존성 없음). 문법 파싱 성공을 타입 검사/빌드 성공으로 오인하면 안 됨.
- Firebase Emulator 보안 규칙 평가, 실제 기업 가입/승인, 관리자 플랜 변경, 파일 업로드, 지부 격리 E2E 테스트 미완료.
- 기업 연락처 수정 허용 필드의 실제 화면 연동은 별도 점검 필요.
- 기존 `branchId` 없는 데이터의 이전 및 레거시 예외 제거 미완료.
- 실제 운영/배포 금지.
