const assert=require('node:assert/strict');
const {auditReadiness,COLLECTIONS}=require('./audit-branch-readiness.cjs');
const blank=()=>Object.fromEntries(COLLECTIONS.map(k=>[k,[]]));
const fixture=()=>{const d=blank();d.companies=[{id:'co_1',branchId:'jeonju'}];d.admins=[{id:'ad_1',branchId:'jeonju',assignedCompanyIds:['co_1']}];d.workers=[{id:'w_1',companyId:'co_1',branchId:'jeonju'}];return d;};
const cases=[
['valid sanitized fixture',d=>{},true],
['missing collection',d=>{delete d.messages},false,'COLLECTION_NOT_EXPORTED'],
['missing worker branch',d=>{delete d.workers[0].branchId},false,'MISSING_RECORD_BRANCH'],
['wrong worker branch',d=>{d.workers[0].branchId='gwangju'},false,'BRANCH_COMPANY_MISMATCH'],
['unknown company',d=>{d.workers[0].companyId='co_missing'},false,'UNKNOWN_COMPANY'],
['cross branch assignment',d=>{d.admins[0].branchId='gwangju'},false,'CROSS_BRANCH_ASSIGNMENT'],
['duplicate assignment',d=>{d.admins[0].assignedCompanyIds.push('co_1')},false,'DUPLICATE_ASSIGNMENT'],
['invalid assignments',d=>{d.admins[0].assignedCompanyIds='co_1'},false,'INVALID_ASSIGNMENTS'],
['duplicate worker id',d=>{d.workers.push({...d.workers[0]})},false,'DUPLICATE_OR_MISSING_ID'],
['invalid record',d=>{d.documents.push(null)},false,'INVALID_RECORD'],
['admin user missing branch',d=>{d.users.push({id:'u_1',role:'ADMIN'})},false,'ADMIN_USER_MISSING_BRANCH'],
['invalid company branch',d=>{d.companies[0].branchId=''},false,'MISSING_OR_INVALID_BRANCH'],
['invalid company ID',d=>{d.companies[0].id='bad id'},false,'DUPLICATE_OR_MISSING_ID'],
];
for(const [label,mutate,expected,code] of cases){const d=fixture();mutate(d);const result=auditReadiness(d);assert.equal(result.ready,expected,label);if(code)assert.ok(result.issues.some(i=>i.code===code),`${label}: ${code}`);console.log('PASS',label);}
assert.equal(auditReadiness(null).ready,false);
console.log('PASS invalid export');
console.log('14/14 migration readiness checks passed');
