#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');
const rules = read('firestore.rules');
const sensitive = rules.split('match /worker_sensitive_data/{sensitiveId} {')[1].split('\n    }')[0];
assert.match(sensitive, /allow create, update, delete: if false/);
assert.match(sensitive, /canAccessTaggedBranch\(resource.data\)/);
assert.doesNotMatch(sensitive, /request\.resource\.data\.userId == request\.auth\.uid/);
const rrn = read('src/server/rrnService.ts');
const submit = rrn.split('export async function handleWorkerSubmitRrn(')[1];
for (const required of ["callerProfile?.role !== 'WORKER'", "linkedWorker.data()?.userId !== callerUid", "existingSensitive.data()?.userId !== callerUid", "error: 'WORKER_OWNERSHIP_REQUIRED'", "error: 'SENSITIVE_RECORD_OWNERSHIP_REQUIRED'"]) assert.ok(submit.includes(required),required);
assert.ok(submit.indexOf('linkedWorker.data()?.userId !== callerUid') < submit.indexOf('.doc(targetDocId).set('),'ownership must precede write');
const branch = read('src/server/branchAuthorization.ts');
assert.doesNotMatch(branch,/NINE_BRANCH_ENFORCEMENT === 'disabled'/);
const server = read('server.ts');
for (const check of ["express.json({ limit: '256kb', strict: true })", "prompt.length > 12000", 'new GoogleGenAI({ apiKey })', "app.disable('x-powered-by')"]) assert.ok(server.includes(check),check);
assert.ok(!server.includes("message: error.message || 'AI"),'no raw AI errors');
console.log('PASS 12 API, RRN and branch-enforcement security invariants (static checks only)');
