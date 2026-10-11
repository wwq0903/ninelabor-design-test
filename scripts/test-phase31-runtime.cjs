#!/usr/bin/env node
// Execute the real subscription modules without installing browser dependencies.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(__dirname,'..');
const cache=new Map();
function load(relative){
  const file=path.resolve(root,relative)+'.ts';
  if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const src=fs.readFileSync(file,'utf8');
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const req=(id)=>{if(id.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(file),id)));throw Error('External runtime import: '+id)};
  vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{Intl,Date,Error,Map,Set,Number,String,Boolean,Array,Math,console},{filename:file})(req,mod,mod.exports);
  return mod.exports;
}
const {getReferenceDateString,getSubscriptionEntitlement}=load('src/utils/subscriptionEntitlement');
const {validatePlanDateRange}=load('src/utils/planDates');
let count=0;
function test(label,fn){fn();console.log('PASS',label);count++}
test('KST boundary from UTC 15:00',()=>assert.equal(getReferenceDateString(new Date('2026-10-10T15:00:00Z')),'2026-10-11'));
test('KST day before UTC 15:00',()=>assert.equal(getReferenceDateString(new Date('2026-10-10T14:59:59Z')),'2026-10-10'));
test('invalid reference date rejects',()=>assert.throws(()=>getReferenceDateString(new Date('invalid'))));
test('inclusive end date',()=>assert.equal(getSubscriptionEntitlement({planCode:'STANDARD',status:'ACTIVE',startDate:'2026-10-01',endDate:'2026-10-11'},'2026-10-11').isActive,true));
test('expired following day',()=>assert.equal(getSubscriptionEntitlement({planCode:'STANDARD',status:'ACTIVE',endDate:'2026-10-11'},'2026-10-12').isActive,false));
test('corrupt end date fails closed',()=>assert.equal(getSubscriptionEntitlement({planCode:'STANDARD',status:'ACTIVE',endDate:'2026-02-30'},'2026-02-28').isActive,false));
test('reversed range fails closed',()=>assert.equal(getSubscriptionEntitlement({planCode:'STANDARD',status:'ACTIVE',startDate:'2026-11-01',endDate:'2026-10-01'},'2026-10-11').isActive,false));
test('valid leap day',()=>assert.doesNotThrow(()=>validatePlanDateRange('2028-02-29','2028-03-01')));
test('invalid leap day rejected',()=>assert.throws(()=>validatePlanDateRange('2027-02-29','2027-03-01')));
const server=fs.readFileSync(path.join(root,'server.ts'),'utf8');
const branch=fs.readFileSync(path.join(root,'src/server/branchAuthorization.ts'),'utf8');
test('production refuses missing dist',()=>{assert.match(server,/if \(!fs\.existsSync\(indexPath\)\)/);assert.match(server,/throw new Error\('Production build missing/)});
test('readiness checks service configuration',()=>{assert.match(server,/app\.get\('\/api\/ready'/);assert.match(server,/isFirebaseAdminConfigured\(\) && Boolean\(process\.env\.GEMINI_API_KEY/)});
test('branch auth has no development bypass',()=>assert.doesNotMatch(branch,/NINE_BRANCH_ENFORCEMENT === 'disabled'/));
console.log(`Phase31 runtime/static checks ${count}/${count} passed`);
