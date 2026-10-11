/** Offline-only regression runner. Does not contact Firebase or mutate data. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const checks = [
  ['지부 권한 정책', 'node', 'scripts/test-branch-access.cjs'],
  ['6차 API 연결 정적 검사', 'node', 'scripts/test-phase6-integration.cjs'],
  ['7차 데이터 검증', 'node', 'scripts/test-phase7.cjs'],
  ['8차 데이터 검증', 'node', 'scripts/test-phase8.cjs'],
  ['9차 Firestore 규칙 정적 검사', 'node', 'scripts/test-phase9.cjs'],
  ['10차 지부 규칙 정적 검사', 'python3', 'tests/phase10_branch_rules_static.py'],
  ['급여 보안 정적 검사', 'python3', 'scripts/test-payroll-rules-static.py'],
  ['관리자 목록 보안 정적 검사', 'python3', 'scripts/test-admin-directory-static.py'],
  ['근로자·기업 격리 정적 검사', 'python3', 'scripts/test-worker-company-isolation-static.py'],
];
let failed = 0;
for (const [label, cmd, file] of checks) {
  const result = spawnSync(cmd, [file], { cwd: root, encoding: 'utf8', timeout: 20000 });
  const ok = result.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) { failed++; console.error((result.stderr || result.stdout || result.error?.message || '').trim().slice(-1200)); }
}
console.log(`\n결과: ${checks.length - failed}/${checks.length}개 검사 스크립트 통과`);
console.log('주의: 정적/오프라인 검사만 수행. Firebase Emulator, 전체 빌드 및 실서비스 보안 검증을 대체하지 않음.');
process.exitCode = failed ? 1 : 0;
