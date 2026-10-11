#!/usr/bin/env node
/** Offline migration gate. Sanitized exports only; never connects to Firebase. */
const fs = require('node:fs');
const COLLECTIONS = ['companies','users','admins','workers','maternity_cases','payrolls','overtime_records','messages','documents'];
const valid = s => typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/.test(s);
const rowValid = r => r !== null && typeof r === 'object' && !Array.isArray(r);
function auditReadiness(data) {
  const issues=[];
  const add=(collection,index,code)=>issues.push({collection,index,code});
  if (!rowValid(data)) return {ready:false,issues:[{collection:'export',index:-1,code:'INVALID_EXPORT'}]};
  for (const name of COLLECTIONS) if (!Array.isArray(data[name])) add(name,-1,'COLLECTION_NOT_EXPORTED');
  const companies=new Map();
  const companyRows=Array.isArray(data.companies)?data.companies:[];
  for (const [i,c] of companyRows.entries()) {
    if (!rowValid(c)) {add('companies',i,'INVALID_RECORD');continue;}
    if (!valid(c.id) || companies.has(c.id)) add('companies',i,'DUPLICATE_OR_MISSING_ID');
    if (!valid(c.branchId)) add('companies',i,'MISSING_OR_INVALID_BRANCH');
    if (valid(c.id) && !companies.has(c.id)) companies.set(c.id,c);
  }
  for (const name of COLLECTIONS.filter(x=>x!=='companies')) {
    const rows=Array.isArray(data[name])?data[name]:[];
    const ids=new Set();
    for (const [i,r] of rows.entries()) {
      if (!rowValid(r)) {add(name,i,'INVALID_RECORD');continue;}
      if (!valid(r.id) || ids.has(r.id)) add(name,i,'DUPLICATE_OR_MISSING_ID');
      if (valid(r.id)) ids.add(r.id);
      if (name==='admins' && !valid(r.branchId)) add(name,i,'MISSING_OR_INVALID_BRANCH');
      if (name==='users' && r.role==='ADMIN' && !valid(r.branchId)) add(name,i,'ADMIN_USER_MISSING_BRANCH');
      if (r.companyId !== undefined && r.companyId !== null && r.companyId !== '') {
        if (!valid(r.companyId)) add(name,i,'INVALID_COMPANY_ID');
        const c=companies.get(r.companyId);
        if (!c) add(name,i,'UNKNOWN_COMPANY');
        else {
          // A missing branch is a migration blocker even if legacy rules currently allow it.
          if (!valid(r.branchId)) add(name,i,'MISSING_RECORD_BRANCH');
          else if (r.branchId!==c.branchId) add(name,i,'BRANCH_COMPANY_MISMATCH');
        }
      }
      if (name==='admins' && r.assignedCompanyIds!==undefined) {
        if (!Array.isArray(r.assignedCompanyIds)) add(name,i,'INVALID_ASSIGNMENTS');
        else {
          const assigned=new Set();
          for (const cid of r.assignedCompanyIds) {
            if (assigned.has(cid)) add(name,i,'DUPLICATE_ASSIGNMENT');
            assigned.add(cid);
            const c=companies.get(cid);
            if (!c) add(name,i,'UNKNOWN_ASSIGNED_COMPANY');
            else if (valid(r.branchId) && r.branchId!==c.branchId) add(name,i,'CROSS_BRANCH_ASSIGNMENT');
          }
        }
      }
    }
  }
  return {ready:issues.length===0,counts:Object.fromEntries(COLLECTIONS.map(k=>[k,Array.isArray(data[k])?data[k].length:null])),issues,scope:'offline-export-only',warning:'PASS does not prove Firestore/Storage access isolation, export completeness, or safe live migration.'};
}
if (require.main===module) {
  const path=process.argv[2];
  if (!path) {console.error('Usage: node scripts/audit-branch-readiness.cjs <sanitized-export.json>');process.exit(2);}
  try {const result=auditReadiness(JSON.parse(fs.readFileSync(path,'utf8')));console.log(JSON.stringify(result,null,2));process.exitCode=result.ready?0:1;}
  catch(e){console.error('Audit failed:',e.message);process.exitCode=2;}
}
module.exports={auditReadiness,COLLECTIONS};
