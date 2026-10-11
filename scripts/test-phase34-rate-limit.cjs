#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
const source = fs.readFileSync(path.resolve(__dirname, '../src/server/httpProtection.ts'), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleObj = {exports:{}};
let clock=100000;
class TestDate extends Date { static now() { return clock; } }
vm.runInNewContext(js,{module:moduleObj,exports:moduleObj.exports,Date:TestDate,Map,Math,String,Number,Error,console});
const {createFixedWindowLimiter}=moduleObj.exports;
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
const request=(ip, headers={})=>({socket:{remoteAddress:ip},headers});
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name);}
check('Reject invalid capacity',()=>assert.throws(()=>createFixedWindowLimiter({windowMs:1000,max:1,maxEntries:0})));
check('Active IP cannot reset quota by filling capacity',()=>{
 const limit=createFixedWindowLimiter({windowMs:1000,max:1,maxEntries:2});
 const run=(ip)=>{const r=response();let passed=false;limit(request(ip),r,()=>passed=true);return {r,passed};};
 assert.equal(run('A').passed,true);assert.equal(run('B').passed,true);
 assert.equal(run('C').r.statusCode,429);assert.equal(run('A').r.statusCode,429);
});
check('Expired buckets are reclaimed',()=>{
 const limit=createFixedWindowLimiter({windowMs:1000,max:1,maxEntries:1});
 const run=(ip)=>{const r=response();let passed=false;limit(request(ip),r,()=>passed=true);return {r,passed};};
 assert.equal(run('A').passed,true);clock+=1001;assert.equal(run('B').passed,true);
});
check('Forwarded IP spoofing cannot bypass socket quota',()=>{
 const limit=createFixedWindowLimiter({windowMs:1000,max:1,maxEntries:2});
 let n=0;limit(request('A',{'x-forwarded-for':'1.1.1.1'}),response(),()=>n++);
 const r=response();limit(request('A',{'x-forwarded-for':'2.2.2.2'}),r,()=>n++);
 assert.equal(n,1);assert.equal(r.statusCode,429);
});
check('Retry-After returned on capacity denial',()=>{
 const limit=createFixedWindowLimiter({windowMs:2500,max:1,maxEntries:1});
 limit(request('A'),response(),()=>{});const r=response();limit(request('B'),r,()=>{});
 assert.equal(r.headers['Retry-After'],'3');
});
console.log(`Phase 34 HTTP limiter runtime tests: ${checks}/${checks} passed`);
