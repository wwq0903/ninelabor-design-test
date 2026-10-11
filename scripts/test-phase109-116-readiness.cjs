#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const rules = read('firestore.rules');
const overtime = read('src/services/overtimeService.ts');
const ci = read('.github/workflows/verify.yml');
const tests = [
  ['production build script exists', () => assert.equal(pkg.scripts.build, 'vite build')],
  ['typecheck command exists', () => assert.match(pkg.scripts.lint, /tsc\s+--noEmit/)],
  ['offline prerequisites script exists', () => assert.ok(fs.existsSync(path.join(root, 'scripts/check-build-readiness.cjs')))],
  ['CI runs full typecheck', () => assert.match(ci, /npm run lint/)],
  ['CI runs Vite build', () => assert.match(ci, /npm run build/)],
  ['rules default deny', () => assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/)],
  ['payroll identity immutable', () => assert.match(rules, /function payrollIdentityUnchanged\(\)/)],
  ['payroll admin transitions guarded', () => assert.match(rules, /function payrollStatusTransitionAllowed\(\)/)],
  ['locked payroll delete restricted', () => assert.match(rules, /allow delete: if adminCanAccessOptionalCompany\(resource.data\) && resource.data.get\('status', ''\) == 'DRAFT'/)],
  ['payroll worker read limited to confirmed/paid', () => assert.match(rules, /resource.data.status in \['CONFIRMED', 'PAID'\]/)],
  ['overtime batch canonical transaction', () => assert.match(overtime, /await runTransaction\(db, async \(tx\) =>/)],
  ['overtime result follows input order', () => assert.match(overtime, /const createdRecords = entries.map\(\(\{ record \}\) => record\)/)],
  ['no async push race', () => assert.doesNotMatch(overtime, /createdRecords\.push\(record\)/)],
  ['emulator is not falsely claimed', () => assert.ok(!pkg.scripts['test:emulator'] || pkg.scripts['test:emulator'].includes('emulator'))],
];
let passed=0;
for(const [name,fn] of tests){try{fn();passed++;console.log('PASS',name);}catch(e){console.error('FAIL',name,e.message);}}
console.log(`${passed}/${tests.length} checks passed`);
if(passed!==tests.length)process.exitCode=1;
