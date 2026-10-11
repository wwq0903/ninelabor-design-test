#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const overtime=fs.readFileSync(path.join(root,'src/services/overtimeService.ts'),'utf8');
const payroll=fs.readFileSync(path.join(root,'src/services/payrollService.ts'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
const source=overtime.match(/function nextSourceVersion\(snapshot: \{ exists\(\): boolean; data\(\): any \}\): number \{([\s\S]*?)\n\}/);
assert.ok(source,'revision helper exists');
const code='function nextSourceVersion(snapshot) {'+source[1]+'\n}';
const ctx={};vm.runInNewContext(code,ctx);
const cases=[
 ['new metadata begins at 1',()=>assert.equal(ctx.nextSourceVersion({exists:()=>false}),1)],
 ['legacy metadata begins at 1',()=>assert.equal(ctx.nextSourceVersion({exists:()=>true,data:()=>({})}),1)],
 ['existing metadata increments',()=>assert.equal(ctx.nextSourceVersion({exists:()=>true,data:()=>({sourceVersion:9})}),10)],
 ['same-millisecond writes remain distinct',()=>assert.equal(ctx.nextSourceVersion({exists:()=>true,data:()=>({sourceVersion:10,overtimeSourceUpdatedAt:'2026-01-01T00:00:00.000Z'})}),11)],
 ['negative revision rejected',()=>assert.throws(()=>ctx.nextSourceVersion({exists:()=>true,data:()=>({sourceVersion:-1})}))],
 ['fractional revision rejected',()=>assert.throws(()=>ctx.nextSourceVersion({exists:()=>true,data:()=>({sourceVersion:1.5})}))],
 ['unsafe revision rejected',()=>assert.throws(()=>ctx.nextSourceVersion({exists:()=>true,data:()=>({sourceVersion:Number.MAX_SAFE_INTEGER})}))],
 ['create reads source in transaction',()=>assert.match(overtime,/const syncSnap = await tx\.get\(syncRef\);[\s\S]*?sourceVersion: nextSourceVersion\(syncSnap\)/)],
 ['update reads affected months',()=>assert.match(overtime,/const affectedMonths = \[\.\.\.new Set\(\[merged\.belongingYearMonth, original\.belongingYearMonth\]\)\]/)],
 ['delete reads source in transaction',()=>assert.match(overtime,/tx\.delete\(docRef\);\s*tx\.set\(syncRef, \{\s*sourceVersion: nextSourceVersion\(syncSnap\)/)],
 ['batch reads source in transaction',()=>assert.match(overtime,/const monthMetas = await Promise\.all[\s\S]*?sourceVersion: nextSourceVersion\(snap\)/)],
 ['standalone marker uses transaction',()=>assert.match(overtime,/async recordOvertimeSourceUpdate[\s\S]*?await runTransaction\(db, async tx =>/)],
 ['analysis brackets integer version',()=>assert.match(payroll,/beforeMeta\.sourceVersion !== afterMeta\.sourceVersion/)],
 ['import rejects missing integer version',()=>assert.match(payroll,/!Number\.isSafeInteger\(analysis\.sourceVersion\)/)],
 ['import checks current integer version',()=>assert.match(payroll,/currentSourceVersion !== analysis\.sourceVersion/)],
 ['company create requires revision one',()=>assert.match(rules,/request\.resource\.data\.get\('sourceVersion', -1\) == 1/)],
 ['company update requires increment',()=>assert.match(rules,/request\.resource\.data\.get\('sourceVersion', -1\) == resource\.data\.get\('sourceVersion', 0\) \+ 1/)],
];
let passed=0;for(const [name,fn] of cases){try{fn();console.log('PASS',name);passed++}catch(e){console.error('FAIL',name,e.message)}}
console.log(`Phase125-132: ${passed}/${cases.length} passed`);if(passed!==cases.length)process.exitCode=1;
