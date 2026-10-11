/** Offline structural regression tests only: NOT a Firestore rules evaluator. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const section = name => {
  const start = rules.indexOf(`match /${name}/{`);
  assert(start >= 0, `Missing ${name}`);
  const end = rules.indexOf('\n    match /', start + 8);
  return rules.slice(start, end < 0 ? undefined : end);
};
assert.match(rules, /function adminCanAccessCompany\(companyId\)/);
assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/companies\/\$\(companyId\)\)\.data\.get\('branchId', ''\) == adminBranchId\(\)/);
const ai = section('ai_consultations');
assert.match(ai, /adminCanAccessOptionalCompany\(resource\.data\)/);
assert.match(ai, /adminCanAccessOptionalCompany\(request\.resource\.data\)/);
assert.match(ai, /request\.resource\.data\.get\('userId', ''\) == resource\.data\.get\('userId', ''\)/);
assert.match(ai, /request\.resource\.data\.get\('companyId', ''\) == resource\.data\.get\('companyId', ''\)/);
assert.match(ai, /taggedBranchUnchanged\(\)/);
const audit = section('audit_logs');
assert.match(audit, /adminCanAccessOptionalCompany\(resource\.data\)/);
assert.match(audit, /request\.resource\.data\.get\('actorUserId', ''\) == request\.auth\.uid/);
assert.match(audit, /request\.resource\.data\.get\('actorRole', ''\) == getUserData\(\)\.get\('role', ''\)/);
assert.match(audit, /allow update, delete: if false/);
const sub = section('subscription_requests');
assert.match(sub, /adminCanAccessCompany\(resource\.data\.get\('companyId', ''\)\)/);
assert.match(sub, /allow create, update, delete: if false/);
assert.match(sub, /allow get, list: if isSignedIn/);
assert.doesNotMatch(sub, /allow update: if isSignedIn\(\) && isAdmin\(\)/);
console.log('PASS: phase17 admin company scope, AI owner immutability, audit actor validation, subscription branch scope (static only)');
