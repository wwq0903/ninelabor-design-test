const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),cp=require('node:child_process');
const ts=require(require.resolve('typescript',{paths:[cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()]}));
const file=path.join(__dirname,'../src/services/payrollService.ts');
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let docs=new Map(), failCommit=false, onBeforeCommit=null, assertions=0;
let generatedId=0;const doc=(_db,col,id)=>({col,id:id??`audit_${++generatedId}`,key:`${col}/${id??`audit_${generatedId}`}`});
const snap=ref=>({exists:()=>docs.has(ref.key),data:()=>docs.get(ref.key)});
const firestore={doc,collection:()=>({}),query:()=>({}),where:()=>({}),orderBy:()=>({}),getDocs:async()=>({docs:[]}),getDoc:async ref=>snap(ref),
 runTransaction:async(_db,fn)=>{let writes=[];const tx={get:async ref=>snap(ref),set:(ref,data,opts)=>writes.push([ref,data,opts]),update:(ref,data)=>writes.push([ref,data,{merge:true}])};await fn(tx);if(onBeforeCommit)await onBeforeCommit();if(failCommit)throw Error('commit failed');for(const [ref,data,opts] of writes)docs.set(ref.key,opts?.merge?{...docs.get(ref.key),...data}:data);}};
const original=Module._load;
Module._load=function(id,...args){if(id==='firebase/firestore')return firestore;if(id==='../lib/firebase')return {db:{},auth:{currentUser:{uid:'a1'}},handleFirestoreError:(e)=>{throw e},OperationType:{WRITE:'WRITE',UPDATE:'UPDATE',GET:'GET'}};if(id==='./overtimeService')return {overtimeService:{recordOvertimeImport:()=>{throw Error('must not call standalone sync')}}};if(id==='./auditLogService')return {auditLogService:{logAction:async()=>{}}};if(id==='../utils/sanitizeAuditDetails')return {sanitizeAuditDetails:x=>x};if(id==='../types')return {};return original.call(this,id,...args)};
const m=new Module(file,module);m.filename=file;m.paths=module.paths;try{m._compile(js,file)}finally{Module._load=original}
const service=m.exports.payrollService;
service.getPayrollsByCompany=async()=>[];
const workers=[{id:'w1',name:'Kim',companyId:'c1',hourlyWage:10000},{id:'w2',name:'Lee',companyId:'c1',hourlyWage:12000}];
const analysis={companyId:'c1',belongingYearMonth:'2026-10',aggregatedByWorker:{w1:{overtimeHours:2,holidayWorkHours:0},w2:{overtimeHours:1,holidayWorkHours:1}},excludedRecords:[],totalOvertimeHours:3,totalHolidayHours:1,sourceVersion:1};
docs.set('overtime_sync_meta/sync_c1_202610',{sourceVersion:1});
const args={companyId:'c1',belongingYearMonth:'2026-10',registeredWorkers:workers,analysis,actorUserId:'a1',actorRole:'ADMIN',actorName:'Admin'};
const ok=(condition,label)=>{assert.ok(condition,label);assertions++};
(async()=>{
 let result=await service.importOvertimeToPayrolls(args);
 ok(result.updatedWorkersCount===2,'two imported');ok(docs.size===4,'two payrolls plus marker and audit');
 ok(docs.get('payrolls/pr_c1_w1_202610').overtimePay===30000,'overtime pay');
 ok(docs.get('overtime_sync_meta/sync_c1_202610').lastImportedById==='a1','marker in same transaction');
 docs.clear();docs.set('overtime_sync_meta/sync_c1_202610',{sourceVersion:1});failCommit=true;await assert.rejects(()=>service.importOvertimeToPayrolls(args),/commit failed/);ok(docs.size===1,'failed commit atomic');failCommit=false;
 docs.set('payrolls/pr_c1_w2_202610',{status:'CONFIRMED',companyId:'c1',employeeId:'w2',belongingYearMonth:'2026-10'});
 await assert.rejects(()=>service.importOvertimeToPayrolls(args),/확정되거나 변경/);ok(!docs.has('payrolls/pr_c1_w1_202610'),'no partial on locked record');ok(!docs.get('overtime_sync_meta/sync_c1_202610')?.overtimeImportedAt,'no false sync marker');
 docs.clear();docs.set('overtime_sync_meta/sync_c1_202610',{sourceVersion:2,overtimeSourceUpdatedAt:'2099-01-01T00:00:00.000Z'});
 await assert.rejects(()=>service.importOvertimeToPayrolls(args),/변경/);ok(docs.size===1,'stale source not acknowledged');
 docs.clear();docs.set('overtime_sync_meta/sync_c1_202610',{sourceVersion:1});await assert.rejects(()=>service.importOvertimeToPayrolls({...args,analysis:{...analysis,companyId:'other'}}),/일치하지/);ok(docs.size===1,'wrong tenant analysis');
 await assert.rejects(()=>service.importOvertimeToPayrolls({...args,registeredWorkers:[workers[0],workers[0]]}),/중복/);ok(docs.size===1,'duplicate workers');
 await assert.rejects(()=>service.importOvertimeToPayrolls({...args,registeredWorkers:[{...workers[0],companyId:'other'},workers[1]]}),/다른 기업/);ok(docs.size===1,'cross tenant worker');
 const many=Array.from({length:101},(_,i)=>({...workers[0],id:`w${i}`}));
 await assert.rejects(()=>service.importOvertimeToPayrolls({...args,registeredWorkers:many,analysis:{...analysis,aggregatedByWorker:Object.fromEntries(many.map(w=>[w.id,{overtimeHours:1,holidayWorkHours:0}]))}}),/최대 100명/);ok(docs.size===1,'transaction size guard');
 console.log(`Phase77-84 atomic payroll tests: ${assertions}/${assertions} passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
