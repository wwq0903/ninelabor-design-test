#!/usr/bin/env node
// Structural regression checks; no claim of emulator/runtime verification.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const service = fs.readFileSync('src/services/payrollService.ts', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const entry = service.match(/async confirmPayroll\(id: string, actorId: string\): Promise<void> \{([\s\S]*?)\n  \},/);
assert.ok(entry, 'legacy single-payroll confirmation entrypoint must exist');
const checks = [
  ['single confirmation uses audited transaction', () => assert.match(entry[1], /this\.transitionPayrollStatus\(/)],
  ['single confirmation cannot directly write status', () => assert.doesNotMatch(entry[1], /tx\.update|updateDoc|setDoc/)],
  ['single confirmation passes actor UID', () => assert.match(entry[1], /actorUserId: actorId/)],
  ['single confirmation enforces admin', () => assert.match(entry[1], /actorRole: 'ADMIN'/)],
  ['single confirmation requires draft', () => assert.match(entry[1], /expectedStatus: 'DRAFT'/)],
  ['single confirmation confirms', () => assert.match(entry[1], /nextStatus: 'CONFIRMED'/)],
  ['transition checks authenticated UID', () => assert.match(service, /auth\.currentUser\?\.uid !== actorUserId/)],
  ['transition writes audit in same transaction', () => assert.match(service, /tx\.update\(payrollRefs\[i\], patch\);[\s\S]*?tx\.set\(auditRefs\[i\]/)],
  ['transition stores confirmer UID', () => assert.match(service, /patch\.confirmedById = actorUserId/)],
  ['rules enforce confirmer UID', () => assert.match(rules, /get\('confirmedById', ''\) == request\.auth\.uid/)],
  ['rules enforce company branch admin reads', () => {
    const block=rules.match(/match \/payrolls\/\{payrollId\} \{([\s\S]*?)\n    \}/);
    assert.ok(block); assert.match(block[1], /allow get, list:[\s\S]*?adminCanAccessOptionalCompany\(resource\.data\)/);
    assert.doesNotMatch(block[1].split('allow create:')[0], /canAccessTaggedBranch\(resource\.data\)/);
  }],
];
for (const [name, fn] of checks) { fn(); console.log('PASS', name); }
console.log(`${checks.length}/${checks.length} structural checks passed; Firestore emulator not run.`);
