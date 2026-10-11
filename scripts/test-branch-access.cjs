const fs = require('node:fs');
const ts = fs.readFileSync('src/security/branchAccess.ts', 'utf8');
const assert = require('node:assert/strict');
// Strip TypeScript using Node 22 built-in type stripping, then import the pure policy.
const { stripTypeScriptTypes } = require('node:module');
const code = stripTypeScriptTypes(ts, { mode: 'strip' });
(async () => {
 const { canAccessBranchResource: can, validBranchId } = await import('data:text/javascript,' + encodeURIComponent(code));
 const a = { uid: 'u1', active: true, role: 'ATTORNEY', branchId: 'jeonju', permissions: ['company:read'] };
 const m = { ...a, role: 'MANAGER', assignedCompanyIds: ['c1'] };
 const r = { branchId: 'jeonju', companyId: 'c1' };
 assert.equal(can(a, r, 'company:read'), true);
 assert.equal(can(a, { ...r, branchId: 'gwangju' }, 'company:read'), false);
 assert.equal(can({ ...a, active: false }, r, 'company:read'), false);
 assert.equal(can(a, { ...r, branchId: null }, 'company:read'), false);
 assert.equal(can({ ...a, branchId: null }, r, 'company:read'), false);
 assert.equal(can(a, r, 'company:write'), false);
 assert.equal(can(m, { ...r, companyId: 'c2' }, 'company:read'), false);
 assert.equal(can(m, r, 'company:read'), true);
 assert.equal(can(null, r, 'company:read'), false);
 assert.equal(validBranchId('../other'), false);
 console.log('PASS 10 branch access policy checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
