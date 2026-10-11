# NINE 11차: 오프라인 보안 회귀 검사 통합

## 실제 변경 사항
- `scripts/run-offline-security-checks.cjs` 추가: 기존 1~10차에서 사용한 9개 오프라인/정적 검사 스크립트를 일괄 실행하고 실패 시 비정상 종료합니다.
- `package.json`에 `check:security:offline` 명령 추가.
- `OFFLINE_TEST_RESULTS.txt`에 이번 실행 결과 저장.

## 검증 범위와 한계
- Node.js와 Python3가 설치된 환경에서 `npm run check:security:offline`으로 실행할 수 있습니다. 별도의 npm 의존성은 필요하지 않습니다.
- 이번 환경에서 `npm install --ignore-scripts --no-audit --no-fund --prefer-offline`을 시도했으나 시간 초과로 완료하지 못했습니다. 따라서 전체 TypeScript/Vite 빌드는 성공 여부를 확인하지 못했습니다.
- `scripts/test-maternity-security-rules.cjs`는 `127.0.0.1:8085`의 Firestore Emulator가 필요하며, 실행 시 연결 실패로 통과하지 못했습니다. 이 테스트는 오프라인 검사 모음에 포함하지 않았습니다.
- 통과한 정적 검사도 Firestore 규칙의 실제 권한 안전성을 증명하지 않습니다. 특히 `branchId`가 없는 기존 자료는 여전히 완전 격리되지 않습니다.
- 실데이터 및 Firebase 프로젝트는 변경하지 않았습니다.
