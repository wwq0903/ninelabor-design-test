const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const cp=require('node:child_process');
const ts=require(require.resolve('typescript',{paths:[cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()]}));
const file=path.join(__dirname,'../src/services/overtimeService.ts');
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let store=new Map(),fail=false, commits=0, errors=0, reads=0;
const doc=(...args)=>({id:args.length===1?'random':args.at(-1),collection:args[1]});
const mock={collection:(_db,name)=>({name}),doc,
 query:(...x)=>x,where:()=>({}),getDocs:async()=>({docs:[]}),
 runTransaction:async(_db,fn)=>{
  const writes=[];let hasWritten=false;
  const tx={get:async(ref)=>{assert.equal(hasWritten,false,'transaction reads must precede writes');reads++;return {exists:()=>store.has(ref.id),data:()=>store.get(ref.id)}},set:(ref,value)=>{hasWritten=true;writes.push([ref.id,value])},update:()=>{},delete:()=>{}};
  const result=await fn(tx);commits++;if(fail)throw Error('network');for(const [id,v] of writes)store.set(id,v);return result;
 }};
const original=Module._load;Module._load=function(id,...args){if(id==='firebase/firestore')return mock;if(id==='../lib/firebase')return {db:{},handleFirestoreError:()=>{errors++},OperationType:{CREATE:'CREATE'}};if(id==='../types')return {};return original.call(this,id,...args)};
const m=new Module(file,module);m.filename=file;m.paths=module.paths;try{m._compile(js,file)}finally{Module._load=original}
const {overtimeService:s,overtimeDocumentId:identity}=m.exports;
const rec=(id,month='2026-10',day='2026-10-10')=>({companyId:'c1',employeeId:id,workDate:day,belongingYearMonth:month,workType:'OVERTIME',hours:2});
let n=0;const check=(v,msg)=>{assert.ok(v,msg);n++};
(async()=>{
 const a=await identity(rec('e1'));check(/^ot_v2_[a-f0-9]{64}$/.test(a),'sha256 identity');
 check(a===await identity(rec('e1')),'stable identity');check(a!==await identity(rec('e2')),'distinct identity');
 let r=await s.batchCreateOvertimeRecords([rec('e1'),rec('e2')],'admin');check(r.createdCount===2,'batch count');
 check(store.has(a),'canonical persisted');check(store.has('sync_c1_202610'),'sync marker persisted');
 const prev=commits;await assert.rejects(()=>s.batchCreateOvertimeRecords([rec('e1')],'admin'),/이미 존재|동시에/);check(commits===prev,'duplicate not committed');
 await assert.rejects(()=>s.batchCreateOvertimeRecords([rec('e3'),rec('e3')],'admin'),/중복/);check(commits===prev,'same-batch duplicate rejected');
 await assert.rejects(()=>s.batchCreateOvertimeRecords([rec('e3'),{...rec('e4'),hours:NaN}],'admin'),/오류/);check(commits===prev,'invalid row rejected');
 await assert.rejects(()=>s.batchCreateOvertimeRecords(Array.from({length:201},(_,i)=>rec('e'+i)),'admin'),/200건/);check(commits===prev,'limit rejected');
 r=await s.batchCreateOvertimeRecords([rec('e3'),rec('e4','2026-11','2026-11-10')],'admin');check(r.createdCount===2,'cross-month batch');check(store.has('sync_c1_202611'),'second marker');
 await assert.rejects(()=>s.createOvertimeRecord(rec('e3')),/이미 존재/);check(store.has(await identity(rec('e3'))),'single path preserves existing');
 r=await s.createOvertimeRecord(rec('e5'));check(r.id===await identity(rec('e5')),'single path canonical id');
 fail=true;const before=store.size;await assert.rejects(()=>s.batchCreateOvertimeRecords([rec('e6')],'admin'),/network/);check(store.size===before,'failed commit atomic');check(errors>=1,'error reported');
 fail=false;check(reads>=5,'transaction document reads');
 console.log(`Phase61-68 concurrency mock checks: ${n}/${n} passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
