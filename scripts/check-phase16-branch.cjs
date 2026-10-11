const fs=require('fs'); const assert=require('assert');
const rules=fs.readFileSync('firestore.rules','utf8');
const names=['maternity_cases','maternity_case_private','maternity_documents','maternity_document_private','maternity_deductions','data_requests','company_documents'];
for(const name of names){const start=rules.indexOf('match /'+name+'/{'); assert(start>=0,name+' missing'); const next=rules.indexOf('\n    match /',start+8); const block=rules.slice(start,next<0?undefined:next); assert(block.includes('canAccessTaggedBranch(') || block.includes('adminCanAccessOptionalCompany('),name+' branch check missing');}
for(const name of ['maternity_case_private','maternity_document_private']){const start=rules.indexOf('match /'+name+'/{');const next=rules.indexOf('\n    match /',start+8);const b=rules.slice(start,next<0?undefined:next);assert(b.includes('taggedBranchUnchanged()'));}
console.log('PASS: 7 branch sections and 2 immutable branch checks (static only)');
