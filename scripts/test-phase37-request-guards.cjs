#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks={}) {
  const source = fs.readFileSync(path.join(root,file),'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{}};
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){if(id in mocks)return mocks[id];throw Error('Unexpected import '+id);}}, {filename:file});
  return mod.exports;
}
(async () => {
  const {parseMaternitySkipFlag} = load('src/server/maternityRequestValidation.ts');
  assert.equal(parseMaternitySkipFlag(undefined),false);
  assert.equal(parseMaternitySkipFlag(true),true);
  assert.equal(parseMaternitySkipFlag(false),false);
  for (const invalid of ['true','false','0',0,1,null,{},[]]) assert.throws(()=>parseMaternitySkipFlag(invalid),{name:'TypeError'});
  let checks=11;
  const server=fs.readFileSync(path.join(root,'server.ts'),'utf8');
  assert.equal((server.match(/parseMaternitySkipFlag\(allowSkipIfAlreadyDeducted\)/g)||[]).length,2); checks++;
  assert.equal((server.match(/allowSkipIfAlreadyDeducted: skipAlreadyDeducted/g)||[]).length,2); checks++;
  assert.ok(!server.includes('Boolean(allowSkipIfAlreadyDeducted)')); checks++;
  let authFails=false, dbFails=false;
  const auth={verifyIdToken:async()=>{if(authFails)throw Error('bad token');return {uid:'admin1'}}};
  const db={collection(name){if(dbFails)throw Error('db offline');return {doc(id){return {get:async()=>({exists:true,data:()=>name==='users'?{role:'ADMIN'}:name==='admins'?{active:true,branchRole:'ADMIN',branchId:'j'}:name==='companies'?{branchId:'j'}:{companyId:'company1'}})}}}}};
  const {requireMaternityBranchAccess}=load('src/server/branchAuthorization.ts',{
    './firebaseAdmin':{isFirebaseAdminConfigured:()=>true,getAdminAuth:()=>auth,getAdminDb:()=>db},
    '../security/branchAccess':{canAccessBranchResource:()=>true}
  });
  const req={headers:{authorization:'Bearer token'},body:{targetCompanyId:'company1'},params:{caseId:'case1'}};
  async function invoke(){let status=0,body=null,next=false;const res={status(s){status=s;return this},json(v){body=v;return this}};await requireMaternityBranchAccess(req,res,()=>{next=true});return {status,body,next};}
  assert.equal((await invoke()).next,true);checks++;
  authFails=true;assert.equal((await invoke()).status,401);checks++;authFails=false;
  dbFails=true;const outage=await invoke();assert.equal(outage.status,503);assert.equal(outage.body.error,'AUTH_BACKEND_UNAVAILABLE');checks+=2;
  console.log(`PASS phase37: ${checks} executable input and branch-gate assertions`);
})().catch(e=>{console.error(e);process.exitCode=1});
