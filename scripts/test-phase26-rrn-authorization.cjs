#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');
const s = fs.readFileSync('src/server/rrnService.ts', 'utf8');
const admin = s.split('export async function checkCallerAdmin(')[1].split('async function authorizeWorkerRrn(')[0];
const auth = s.split('async function authorizeWorkerRrn(')[1].split('// Record Audit Log')[0];
const get = s.split('export async function handleGetWorkerRrn(')[1].split('export async function handleSaveWorkerRrn(')[0];
const save = s.split('export async function handleSaveWorkerRrn(')[1].split('export async function handleWorkerSubmitRrn(')[0];
for (const value of ["u?.role === 'ADMIN'", 'admin.exists && user.exists', 'a?.active === true', "u?.status !== 'SUSPENDED'", 'a?.branchId']) assert.ok(admin.includes(value), `admin check: ${value}`);
for (const value of ['worker.exists', 'company.exists', 'branchId !== a?.branchId', 'assignedCompanyIds', "w?.companyId", 'workerId.includes']) assert.ok(auth.includes(value), `branch check: ${value}`);
for (const block of [get, save]) {
  assert.ok(block.includes('authorizeWorkerRrn(callerUid, workerId)'), 'both endpoints must verify persisted worker ownership');
  assert.ok(block.indexOf('authorizeWorkerRrn(callerUid, workerId)') < block.indexOf("collection('worker_sensitive_data')"), 'authorization before sensitive access');
  assert.ok(block.includes('verifyIdToken(idToken, true)'), 'revoked tokens must be rejected');
}
for (const value of ['WORKER_USER_MISMATCH', 'SENSITIVE_RECORD_MISMATCH', 'userId: access.worker.userId', 'branchId: access.branchId']) assert.ok(save.includes(value), `save: ${value}`);
assert.ok(get.includes('SENSITIVE_RECORD_MISMATCH'));
console.log('PASS 26차 RRN API 권한 불변식 (정적 검사)');
