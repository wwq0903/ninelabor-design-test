#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'src/server/adminUserService.ts'),'utf8');
const server = fs.readFileSync(path.join(root,'server.ts'),'utf8');
let checks = 0;
function check(condition, message) {assert.ok(condition,message);checks++}
check(!source.includes('phoneNumber: phone?.trim()'), 'Auth must not receive local phone number');
check(source.includes('verifiedCompanyName = typeof data?.companyName'), 'company name must come from verified document');
check(source.includes("error: 'MEMBERSHIP_COMPANY_CONFLICT'"), 'conflicting membership must be rejected');
check(source.includes("error: 'INVALID_MEMBERSHIP_TYPE'"), 'unknown membership must be rejected');
check(server.includes("error: 'AUTH_BACKEND_UNAVAILABLE'"), 'AI backend outage distinct from bad token');
check(server.indexOf('callerUid = (await getAdminAuth().verifyIdToken') < server.indexOf("error: 'AUTH_BACKEND_UNAVAILABLE'"), 'verify token before database lookup');
const transpiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const writes=[];
const firebaseAuth={verifyIdToken:async()=>({uid:'admin1'}),createUser:async v=>{writes.push(['auth',v]);return {uid:'newuser'}},deleteUser:async()=>{}};
const batch={create:(ref,data)=>writes.push([ref.collection,ref.id,data]),commit:async()=>{}};
const db={collection(name){return {doc(id){return {collection:name,id,async get(){if(name==='admins')return {exists:true,data:()=>({active:true,branchId:'jeonju',branchRole:'ADMIN'})};if(name==='users')return {exists:true,data:()=>({role:'ADMIN'})};if(name==='companies')return {exists:true,data:()=>({branchId:'jeonju',companyName:'검증된 회사명'})};return {exists:false,data:()=>null}}}}}},batch:()=>batch};
const mod={exports:{}};
const mocks={express:{},crypto:require('node:crypto'),'../../firebase-applet-config.json':{apiKey:'demo'},'../types':{},'./firebaseAdmin':{isFirebaseAdminConfigured:()=>true,getAdminAuth:()=>firebaseAuth,getAdminDb:()=>db},'./rrnService':{encryptRrn:()=>null,validateRrn:()=>({isValid:true}),isRrnEncryptionConfigured:()=>true}};
vm.runInNewContext(transpiled,{module:mod,exports:mod.exports,require:id=>{if(id in mocks)return mocks[id];throw Error(id)},console,process:{env:{NODE_ENV:'production'}},Date,fetch:async()=>({ok:true})});
async function request(body){let status=200,data;const res={status(v){status=v;return this},json(v){data=v;return this}};await mod.exports.handleAdminCreateUser({headers:{authorization:'Bearer token'},body},res);return {status,data}}
(async()=>{
  const base={role:'WORKER',email:'person@example.com',displayName:'근로자',companyId:'company1'};
  let r=await request({...base,membershipType:'INDIVIDUAL'});check(r.status===400&&r.data.error==='MEMBERSHIP_COMPANY_CONFLICT','company linked worker cannot be individual');
  r=await request({...base,membershipType:'BAD'});check(r.status===400&&r.data.error==='INVALID_MEMBERSHIP_TYPE','unknown membership rejected');
  r=await request({...base,companyId:undefined,membershipType:'COMPANY_AFFILIATED'});check(r.status===400&&r.data.error==='MEMBERSHIP_COMPANY_CONFLICT','unaffiliated worker cannot claim affiliation');
  r=await request({...base,companyName:'위조된 회사명',phone:'010-1234-5678'});
  check(r.status===201,'worker with Korean contact phone should be created');
  check(!('phoneNumber' in writes.find(x=>x[0]==='auth')[1]),'Auth payload must not include phoneNumber');
  const user=writes.find(x=>x[0]==='users')[2];
  check(user.companyName==='검증된 회사명','user company name from verified company');
  check(user.membershipType==='COMPANY_AFFILIATED','worker affiliation consistent');
  check(user.phone==='010-1234-5678','contact phone retained in Firestore');
  console.log(`PASS phase38: ${checks} source and executable account consistency assertions`);
})().catch(e=>{console.error(e);process.exitCode=1});
