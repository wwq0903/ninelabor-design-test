#!/usr/bin/env node
// Source-level invariants; this does NOT replace a Firebase Emulator test.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const service = read('src/server/adminUserService.ts');
const server = read('server.ts');
const cases = [
  ['single Firestore batch', /const writeBatch = adminDb\.batch\(\)/.test(service)],
  ['company record atomic', /writeBatch\.create\(adminDb\.collection\('companies'\)/.test(service)],
  ['directory atomic', /writeBatch\.create\(adminDb\.collection\('company_directory'\)/.test(service)],
  ['user profile atomic', /writeBatch\.create\(adminDb\.collection\('users'\)/.test(service)],
  ['sensitive records atomic', /writeBatch\.create\(adminDb\.collection\('worker_sensitive_data'\)/.test(service)],
  ['worker record atomic', /writeBatch\.create\(adminDb\.collection\('workers'\)/.test(service)],
  ['audit record atomic', /writeBatch\.create\(adminDb\.collection\('audit_logs'\)/.test(service)],
  ['batch committed before reset email', service.indexOf('await writeBatch.commit()') < service.indexOf('const resetUrl')],
  ['no sequential company write', !/await adminDb\.collection\('companies'\).*\.create\(/.test(service)],
  ['no sequential user write', !/await adminDb\.collection\('users'\).*\.set\(/.test(service)],
  ['no audit PII', !/targetEmail: cleanEmail|targetDisplayName: cleanName/.test(service)],
  ['no raw exception logging', !/console\.(error|warn|log)\([^\n]*(?:\.message|createdUid)/.test(service)],
  ['failure injection restricted to tests', /simulateFirestoreFailure && process\.env\.NODE_ENV !== 'test'/.test(service)],
  ['request body null-safe', /\} = req\.body \?\? \{\}/.test(service)],
  ['privileged admin creation limited', /create-user', privilegedLimiter, handleAdminCreateUser/.test(server)],
  ['sensitive RRN reads limited', /worker-rrn\/:workerId', privilegedLimiter, handleGetWorkerRrn/.test(server)],
  ['maternity transitions limited and gated', /status-transition', privilegedLimiter, requireMaternityBranchAccess/.test(server)],
  ['maternity assignment limited and gated', /assign-attorney', privilegedLimiter, requireMaternityBranchAccess/.test(server)],
];
for (const [label, ok] of cases) { assert.ok(ok, label); console.log(`PASS ${label}`); }
console.log(`${cases.length}/${cases.length} phase33 source invariants passed (not runtime Firebase verification)`);
