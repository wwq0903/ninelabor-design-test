# 노무법인 나인 157~164차 통합 작업 보고

## 기준
149~156차 전체 소스를 복제한 별도 작업본. 원본 프로젝트·운영 Firebase 데이터 미변경.

## 변경 사항
1. 모바일 상단 주요 메뉴를 신규 추가해 홈페이지/통합노무실 간 전환 제공.
2. 모바일 통합노무실 비로그인 접근 시 로그인 모달 유도.
3. 현재 탭에 `aria-current`를 제공해 접근성 개선.
4. 계정 메뉴에 `aria-expanded`, `aria-haspopup`, 설명 레이블 추가.
5. 공식 영문 브랜드 NINELABOR로 표기 통일.
6. 홈페이지 사용자 문구에서 SaaS 용어 제거.
7. App의 각 탭을 ErrorBoundary로 격리해 오류 시 재시도 제공.
8. ErrorBoundary에서 사용자에게 원시 예외 메시지를 노출하지 않도록 변경.
9. 신규 UI 회귀 검증 14건 및 CI 워크플로 연결.

## 검증
- 오프라인 check/audit 스크립트 43/43 통과.
- 신규 UI 구조 검사 14/14 통과.
- 문법 검사: 125개 JS/TS/TSX 파일, 문법 오류 0.
- 로컬 import 검사: 418개 import, 누락 0.
- 빌드 준비조건: 5/7 충족. node_modules의 Vite/TypeScript 패키지 없음.
- `npm run verify:build`: 의존성 미설치로 BLOCKED (빌드 성공으로 간주하지 않음).
- Firebase Emulator, 브라우저 E2E, 실제 모바일 화면 시각 검수: 미실행.

## 남은 작업
실제 의존성 설치 후 TypeScript 타입 검사와 Vite 빌드; Firebase Emulator 권한 검증; 관리자/기업/근로자 상세 화면 및 반응형 디자인 개편; 실사용 QA; 배포 전 Storage 버킷 활성화 및 규칙 검증.
