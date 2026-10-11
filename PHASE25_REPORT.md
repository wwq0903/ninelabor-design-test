# NINE 25차 통합 보안 수정 보고서

## 실제 소스 변경
1. `src/server/rrnService.ts`: 근로자 본인 주민등록번호 제출 시 Firestore 프로필 역할/활성 상태 검증, 전달받은 workerId가 실제 본인 소유인지 서버에서 확인, 기존 민감정보 문서의 소유자 일치 확인 후 암호화 저장. 타인의 workerId를 지정해 암호화 민감정보/마스킹 프로필을 덮어쓰는 경로 차단.
2. `firestore.rules`: `worker_sensitive_data`의 클라이언트 SDK 직접 생성/수정/삭제 차단. 서버 Firebase Admin SDK의 암호화 API로만 기록. 관리자 읽기에도 지부 태그 검사 적용(기존 지부 미기재 문서에는 레거시 접근 가능성이 남음).
3. `src/server/branchAuthorization.ts`: 운영 서버에서 지부 검사 옵트아웃 금지. 개발 환경에서만 `NINE_BRANCH_ENFORCEMENT=disabled`로 우회 허용. 기존 레거시 데이터가 지부 미설정이면 운영 API가 거부될 수 있으므로 이전 작업 필수.
4. `server.ts`: JSON 요청 256KB 제한, X-Powered-By 제거, AI 입력 길이 상한, Gemini API 키 명시적 전달, 내부 오류 상세 메시지 클라이언트 노출 방지, HOST 환경변수 지원.
5. `scripts/test-phase8.cjs`: 24차 강화된 이전 데이터 검사와 불일치하던 8차 정상 fixture에 문서 ID 부여. 기존 9개 보안 스크립트 재통과.
6. `scripts/test-phase25-api-security.cjs`, `package.json`, `.github/workflows/`: 신규 회귀 검사 및 CI 추가.

## 검사 결과
- 문법 검사: 120개 소스, 오류 0.
- 상대 경로 import: 409건 정상.
- 오프라인 보안 9/9 PASS.
- 17·18·19·21·22·23차 정적 검사 PASS.
- 23차 날짜 검사 14건 PASS.
- 24차 데이터 이전 검사 14/14 PASS.
- 25차 API 보안 구조 검사 PASS.

## 미완료 / 운영 주의
- `npm run lint`: `vite/client` 타입 패키지 미설치로 실패.
- `npm run build`: `vite` 패키지 미설치로 실패.
- Firebase Emulator와 실제 로그인/민감정보 API 통합 검증은 진행되지 않음.
- 운영 환경에서 지부 검사 필수 적용 시 기존 지부 정보 미기재 데이터는 차단될 수 있음.
- 정적 검사 통과는 실제 취약점 부재를 보증하지 않음. **운영 배포 금지, 기존 원본 덮어쓰기 금지.**
