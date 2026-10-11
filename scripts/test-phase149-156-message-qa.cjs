#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const service = fs.readFileSync('src/services/messageService.ts', 'utf8');
const util = fs.readFileSync('src/utils/firestoreQueryFallback.ts', 'utf8');
const compiled = ts.transpileModule(util,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const sandboxModule = {exports:{}};
vm.runInNewContext(compiled,{module:sandboxModule,exports:sandboxModule.exports});
const {isMissingIndexError} = sandboxModule.exports;
const checks = [
 ['index required allows fallback',()=>assert.equal(isMissingIndexError({code:'failed-precondition',message:'The query requires an index. Create it here.'}),true)],
 ['index error without matching code rejected',()=>assert.equal(isMissingIndexError({code:'permission-denied',message:'requires an index'}),false)],
 ['permission denied rejected',()=>assert.equal(isMissingIndexError({code:'permission-denied',message:'Missing or insufficient permissions.'}),false)],
 ['unavailable rejected',()=>assert.equal(isMissingIndexError({code:'unavailable',message:'Network unavailable'}),false)],
 ['resource exhausted rejected',()=>assert.equal(isMissingIndexError({code:'resource-exhausted',message:'Quota exceeded'}),false)],
 ['generic failed precondition rejected',()=>assert.equal(isMissingIndexError({code:'failed-precondition',message:'Another error'}),false)],
 ['null rejected',()=>assert.equal(isMissingIndexError(null),false)],
 ['primitive rejected',()=>assert.equal(isMissingIndexError('index'),false)],
 ['no message rejected',()=>assert.equal(isMissingIndexError({code:'failed-precondition'}),false)],
 ['message list fallback guarded',()=>assert.match(service,/getAllMessages missing-index fallback/)],
 ['company list fallback guarded',()=>assert.match(service,/getMessagesByCompany missing-index fallback/)],
 ['template list fallback guarded',()=>assert.match(service,/getTemplates missing-index fallback/)],
 ['all three fallbacks only after index check',()=>assert.equal((service.match(/if \(!isMissingIndexError\(orderErr\)\) throw orderErr;/g)||[]).length,3)],
 ['company fallback preserves company filter',()=>assert.match(service,/fallbackQ = query\(colRef, where\('companyId', '==', companyId\)\)/)],
 ['message sender must match authenticated user',()=>assert.match(service,/auth\.currentUser\.uid !== data\.senderId/)],
 ['blank message blocked',()=>assert.match(service,/!data\.content\?\.trim\(\)/)],
 ['invalid sender role blocked',()=>assert.match(service,/data\.senderRole !== 'ADMIN' && data\.senderRole !== 'COMPANY'/)],
 ['invalid recipient role blocked',()=>assert.match(service,/data\.recipientRole !== expectedRecipientRole/)],
 ['RRN screening remains',()=>assert.match(service,/containsKoreanRrn\(data\.content\)/)],
];
for (const [name, fn] of checks) {fn();console.log('PASS',name)}
console.log(`${checks.length}/${checks.length} checks passed (helper behavioral tests + service structural tests; no Firebase emulator).`);
