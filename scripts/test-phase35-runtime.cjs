#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = fs.readFileSync(path.join(root, 'src/server/rrnService.ts'), 'utf8');
const js = ts.transpileModule(file, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const moduleObj={exports:{}};
const sandbox={module:moduleObj,exports:moduleObj.exports,Buffer,process:{env:{RRN_ENCRYPTION_KEY:'phase35-test-only-not-production-key'}},require(id){if(id==='crypto')return crypto;if(id==='./firebaseAdmin')return {};throw Error('Unexpected module '+id)}};
vm.runInNewContext(js,sandbox,{filename:'rrnService.js'});
const {encryptRrn,decryptRrn}=moduleObj.exports;
const {rrnEncrypted,maskedRrn}=encryptRrn('900101-1234567');
assert.equal(decryptRrn(rrnEncrypted),'900101-1234567');
assert.equal(maskedRrn,'900101-1******');
let checks=2;
const invalid=[rrnEncrypted.replace(/^[^:]+/, 'a'),rrnEncrypted.replace(/:([^:]+):/, ':z:'),rrnEncrypted+'ff', '00:11:22',rrnEncrypted.replace(/.$/,'z')];
for(const value of invalid){assert.throws(()=>decryptRrn(value));checks++;}
const adminSource=fs.readFileSync(path.join(root,'src/server/firebaseAdmin.ts'),'utf8');
assert.match(adminSource,/serviceAccount\.project_id !== firebaseConfig\.projectId/);checks++;
assert.match(adminSource,/getApps\(\)\.find\(app => app\.options\.projectId === firebaseConfig\.projectId\)/);checks++;
console.log(`PASS phase35: ${checks} encryption integrity and Firebase project isolation assertions`);
