# 6차: 모성보호 관리자 API 지부 권한 사전검증 연결 (기본 비활성)

- `src/server/branchAuthorization.ts`: Firebase ID 토큰 취소 여부 확인, 서버 Firestore `admins`, `users`, `companies` 읽기, 지부/권한/담당기업 검증. 요청 본문의 지부 정보는 신뢰하지 않음.
- `server.ts`: 관리자 모성보호 상태 변경 및 담당 노무사 배정 두 엔드포인트에 사전검증 미들웨어 연결.
- **기본 비활성**: `NINE_BRANCH_ENFORCEMENT=enabled`로 설정한 경우에만 강제. 지부 데이터 이전 전 켜면 기존 관리자 작업이 차단될 수 있음.
- 관리자 프로필 필수 스키마: `admins/{uid}`에 `branchRole`(SUPER_ADMIN/ATTORNEY/MANAGER), `branchId`, `active:true`, `permissions:['maternity.write']`, 매니저는 `assignedCompanyIds`; `companies/{id}`에 `branchId`. 이 스키마는 제안이며 운영 데이터와 확인 필요.
- 현재 모성보호 API는 기업 사용자도 사용 가능하므로, 플래그 활성화 시 이 관리자 API 경로에서 기업 계정은 거부됨. 운영 정책 확인 후 기업용 별도 경로 정리 필요.
- **아직 미완료**: 실제 지부 데이터 이전, Firestore/Storage Rules 변경, 다른 서버 API, 전체 빌드, Firebase Emulator 및 실데이터 검증.
- 테스트: 정적 연결 검사만 수행. 런타임 권한 검증 완료로 간주하면 안 됨.
