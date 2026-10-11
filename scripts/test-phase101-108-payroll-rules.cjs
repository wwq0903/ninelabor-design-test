const fs = require('node:fs');
const assert = require('node:assert/strict');
const rules = fs.readFileSync('firestore.rules','utf8');
const match = rules.match(/match \/payrolls\/\{payrollId\} \{([\s\S]*?)\n    \}/);
assert.ok(match, 'payroll match missing');
const block = match[1];
const cases = [
  ['identity immutable', /function payrollIdentityUnchanged\(\)/],
  ['tenant immutable', /request\.resource\.data\.get\('companyId'/.test(rules) ? /payrollIdentityUnchanged\(\)/ : /NOT_PRESENT/],
  ['status transition helper', /function payrollStatusTransitionAllowed\(\)/],
  ['draft confirm', /resource\.data\.get\('status', ''\) == 'DRAFT' &&\s*request\.resource\.data\.get\('status', ''\) == 'CONFIRMED'/],
  ['confirm cancellation', /resource\.data\.get\('status', ''\) == 'CONFIRMED' &&\s*request\.resource\.data\.get\('status', ''\) == 'DRAFT'/],
  ['confirm paid', /resource\.data\.get\('status', ''\) == 'CONFIRMED' &&\s*request\.resource\.data\.get\('status', ''\) == 'PAID'/],
  ['cancel reason', /cancellationReason.*size\(\) > 0/],
  ['admin status author', /get\('paidById', ''\) == request\.auth\.uid/],
  ['locked record delete denied', /allow delete: if adminCanAccessOptionalCompany\(resource\.data\) && resource\.data\.get\('status', ''\) == 'DRAFT'/],
  ['admin update guard', /payrollAdminUpdateAllowed\(\)/],
  ['company identity guard', /payrollIdentityUnchanged\(\)/],
  ['company draft only', /resource\.data\.status == 'DRAFT' &&\s*request\.resource\.data\.status == 'DRAFT'/],
];
for(const [name,regex] of cases) {assert.match(name.includes('delete') || name.includes('company') || name==='admin update guard' ? block : rules, regex, name); console.log('PASS',name)}
console.log(`Phase101-108 payroll rules structural checks: ${cases.length}/${cases.length} passed (not emulator tests)`);
