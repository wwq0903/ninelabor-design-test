# NINE 21차 — 오프라인 플랜 정책 통합 정리

## 실제 코드 변경
- `firestore.rules`: 과거 `subscription_requests` 데이터는 기존 권한으로 읽을 수 있으나 신규 생성·수정·삭제는 전면 차단. 기업/관리자 셀프 신청 기능을 중단하며 과거 기록을 삭제하지 않음.
- `AdminSubscriptionsView.tsx`: 과거 신청 접수 탭, 신청 심사/적용 모달 비노출 및 자동 신청 목록 조회 중단. 기업별 수동 플랜 지정 화면 유지. 중복 성공 안내 제거.
- `AdminDashboardSummary.tsx`: 실제 수금 데이터를 조회하지 않으면서 '미수금 없음'이라고 표시하던 허위 상태 제거. 플랜 수동 지정 안내로 변경.
- `policies.ts`, `PolicyModal.tsx`: 자동 정기결제 및 일률적 환불 문구를 오프라인 계약·관리자 수동 지정 안내로 변경; SaaS 표현 제거.
- `scripts/test-phase21-offline-only.cjs`: 온라인 신청 쓰기 차단, UI 비노출, 정책·대시보드 일치 회귀 검사.
- `package.json`: `npm run check:offline-only` 추가.

## 검사 결과
- 21차 신규 회귀 검사 PASS
- 로컬 import 407건 / 94개 파일 PASS
- 기존 오프라인 보안 검사 9/9 PASS
- 20차 오프라인 결제 정책 검사 7개 PASS
- 18/19차 정적 검사 PASS
- TypeScript 전체 검사: `vite/client` 타입 패키지 부재로 미실행(컴파일 성공 아님)
- Vite 빌드, Firebase Emulator, 실제 로그인/결제/플랜 기능 통합 테스트 미완료

## 중요한 유의사항
- 구독 신청 내역은 삭제하지 않고 과거 기록으로 남음. 신규 신청은 Firestore Rules에서 거부됨.
- 관리자 수동 플랜 지정이 Firebase 실제 권한 조건과 일치하는지는 Emulator에서 반드시 검증할 것.
- 약관·환불 조건은 법률 검토를 거쳐 확정해야 함. 이번 수정은 기존 자동결제 문구의 사실관계 정리이며 최종 법률 자문이 아님.
- 사용자에게 적용 전 원본 백업 유지.
