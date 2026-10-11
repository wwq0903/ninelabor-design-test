const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const cp=require('node:child_process');
const ts=require(require.resolve('typescript',{paths:[cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()]}));
const file=path.join(__dirname,'../src/services/overtimeService.ts');
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let docs=new Map(), failReads=false, failWrites=false, count=0;
const doc=(_db,col,id)=>({col,id});
const snapshot=ref=>({exists:()=>docs.has(ref.id),data:()=>docs.get(ref.id)});
const mock={doc,collection:()=>({}),where:()=>({}),query:()=>({}),getDocs:async()=>({docs:[]}),
 getDoc:async(ref)=>{if(failReads)throw Error('unavailable');return snapshot(ref)},
 setDoc:async(ref,data)=>{if(failWrites)throw Error('unavailable');docs.set(ref.id,{...docs.get(ref.id),...data})},
 runTransaction:async(_db,fn)=>{if(failWrites)throw Error('unavailable');let writes=[];const tx={get:async(ref)=>{if(failReads)throw Error('unavailable');return snapshot(ref)},set:(ref,value)=>writes.push([ref,value])};await fn(tx);for(const [ref,value] of writes)docs.set(ref.id,{...docs.get(ref.id),...value});}};
const original=Module._load;Module._load=function(id,...args){if(id==='firebase/firestore')return mock;if(id==='../lib/firebase')return {db:{},handleFirestoreError:()=>{throw Error('DB_FAIL')},OperationType:{GET:'GET',WRITE:'WRITE'}};if(id==='../types')return {};return original.call(this,id,...args)};
const m=new Module(file,module);m.filename=file;m.paths=module.paths;try{m._compile(js,file)}finally{Module._load=original}
const s=m.exports.overtimeService;const check=(v,msg)=>{assert.ok(v,msg);count++};
(async()=>{
 const key='sync_c1_202610';const before='2026-10-10T09:00:00.000Z',after='2026-10-10T10:00:00.000Z';
 docs.set(key,{overtimeSourceUpdatedAt:before});await s.recordOvertimeImport('c1','2026-10',after,'admin');check(docs.get(key).overtimeImportedAt===after,'successful import');
 docs.set(key,{overtimeSourceUpdatedAt:'2026-10-10T11:00:00.000Z'});
 await assert.rejects(()=>s.recordOvertimeImport('c1','2026-10',after,'admin'),/변경/);check(!docs.get(key).overtimeImportedAt,'stale import rejected');
 failWrites=true;await assert.rejects(()=>s.recordOvertimeImport('c1','2026-10',after),/DB_FAIL/);check(!docs.get(key).overtimeImportedAt,'failed import not acknowledged');
 await assert.rejects(()=>s.recordOvertimeSourceUpdate('c1','2026-10','UPDATED'),/DB_FAIL/);check(true,'failed source marker reported');failWrites=false;
 failReads=true;await assert.rejects(()=>s.getOvertimeSyncMeta('c1','2026-10'),/DB_FAIL/);check(true,'metadata read failure surfaced');
 await assert.rejects(()=>s.getOvertimeSourceUpdatedAt('c1','2026-10'),/DB_FAIL/);check(true,'source read failure surfaced');failReads=false;
 await assert.rejects(()=>s.recordOvertimeImport('c1','2026-13',after),/귀속연월/);check(true,'invalid month rejected');
 await assert.rejects(()=>s.recordOvertimeImport('c1','2026-10','bad'),/시각/);check(true,'invalid timestamp rejected');
 await s.recordOvertimeSourceUpdate('c1','2026-10','UPDATED');check(!!docs.get(key).overtimeSourceUpdatedAt,'source marker saved');
 console.log(`Phase69-76 sync safety: ${count}/${count} passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
