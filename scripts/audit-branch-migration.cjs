#!/usr/bin/env node
/** Offline, read-only branch migration readiness audit. Never connects to Firebase. */
const fs = require('node:fs');
const valid = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/.test(value);
function audit(data) {
  const issues = [];
  const companies = new Map();
  const records = name => Array.isArray(data[name]) ? data[name] : [];
  for (const [i, company] of records('companies').entries()) {
    if (!company.id || companies.has(company.id)) issues.push({collection:'companies',index:i,code:'DUPLICATE_OR_MISSING_ID'});
    if (!valid(company.branchId)) issues.push({collection:'companies',index:i,code:'MISSING_OR_INVALID_BRANCH'});
    if (company.id) companies.set(company.id,company);
  }
  for (const name of ['users','admins','workers','maternity_cases','payrolls','overtime_records','messages','documents']) {
    for (const [i,record] of records(name).entries()) {
      if (name === 'admins' && !valid(record.branchId)) issues.push({collection:name,index:i,code:'MISSING_OR_INVALID_BRANCH'});
      if (record.companyId) {
        const company = companies.get(record.companyId);
        if (!company) issues.push({collection:name,index:i,code:'UNKNOWN_COMPANY'});
        else if (record.branchId && record.branchId !== company.branchId) issues.push({collection:name,index:i,code:'BRANCH_COMPANY_MISMATCH'});
      }
    }
  }
  return {ready:issues.length===0,counts:Object.fromEntries(['companies','users','admins','workers','maternity_cases','payrolls','overtime_records','messages','documents'].map(k=>[k,records(k).length])),issues};
}
if (require.main === module) {
  const path = process.argv[2];
  if (!path) { console.error('Usage: node scripts/audit-branch-migration.cjs <sanitized-export.json>'); process.exit(2); }
  try {
    const report=audit(JSON.parse(fs.readFileSync(path,'utf8')));
    console.log(JSON.stringify(report,null,2));
    process.exitCode=report.ready?0:1;
  } catch (err) { console.error('Audit failed:',err.message); process.exitCode=2; }
}
module.exports={audit};
