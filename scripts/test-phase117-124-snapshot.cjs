#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/services/payrollService.ts'),'utf8');
const tests=[
 ['analysis revision exposed',()=>assert.match(src,/sourceRevision\?: string \| null/)],
 ['analysis reads source before records',()=>assert.match(src,/const beforeMeta = await overtimeService\.getOvertimeSyncMeta[\s\S]*?const allRecords = await overtimeService\.getOvertimeByCompany/)],
 ['analysis reads source after records',()=>assert.match(src,/const allRecords = await overtimeService\.getOvertimeByCompany[\s\S]*?const afterMeta = await overtimeService\.getOvertimeSyncMeta/)],
 ['analysis detects concurrent source change',()=>assert.match(src,/beforeMeta\.overtimeSourceUpdatedAt !== afterMeta\.overtimeSourceUpdatedAt/)],
 ['analysis returns revision',()=>assert.match(src,/sourceRevision: afterMeta\.overtimeSourceUpdatedAt/)],
 ['import compares source revision',()=>assert.match(src,/sourceUpdatedAt \?\? null\) !== analysis\.sourceRevision/)],
 ['import rejects missing version on tracked source',()=>assert.match(src,/analysis\.sourceRevision === undefined && sourceUpdatedAt != null/)],
 ['import rejects changed draft',()=>assert.match(src,/old\.updatedAt !== existingMap\.get\(record\.employeeId\)\?\.updatedAt/)],
 ['duplicate existing payroll rejected',()=>assert.match(src,/existingMap\.has\(p\.employeeId\)/)],
 ['cross-tenant existing payroll rejected',()=>assert.match(src,/p\.companyId !== companyId \|\| p\.belongingYearMonth !== belongingYearMonth/)],
 ['existing audit atomic',()=>assert.match(src,/tx\.set\(auditRef, auditRecord\)/)],
 ['existing sync atomic',()=>assert.match(src,/tx\.set\(syncRef,/)],
];
let ok=0;for(const [name,fn] of tests){try{fn();console.log('PASS',name);ok++;}catch(e){console.error('FAIL',name,e.message)}}console.log(`Phase117-124: ${ok}/${tests.length} passed`);if(ok!==tests.length)process.exitCode=1;
