const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = require('node:path').join(__dirname, '..');
const server = fs.readFileSync(require('node:path').join(root, 'server.ts'), 'utf8');
const gate = fs.readFileSync(require('node:path').join(root, 'src/server/branchAuthorization.ts'), 'utf8');
for (const route of ['status-transition', 'assign-attorney']) {
  assert.ok(server.includes(`/:caseId/${route}', privilegedLimiter, requireMaternityBranchAccess, async`), `${route} gate missing`);
}
for (const check of ['verifyIdToken(', "collection('admins')", "collection('users')", "collection('companies')", 'canAccessBranchResource(', "'maternity.write'"]) {
  assert.ok(gate.includes(check), `${check} missing`);
}
assert.ok(!gate.includes("NINE_BRANCH_ENFORCEMENT === 'disabled'"), 'branch bypass must not exist');
console.log('PASS: 9 integration presence checks (static only)');
