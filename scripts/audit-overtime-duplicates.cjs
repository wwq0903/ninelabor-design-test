// Offline, read-only duplicate audit. Usage: node scripts/audit-overtime-duplicates.cjs export.json
// Accepts an array of Firestore-exported overtime_records rows; NEVER writes to Firestore.
const fs=require('node:fs');
const input=process.argv[2];
if(!input){console.error('Usage: node scripts/audit-overtime-duplicates.cjs overtime-records.json');process.exit(2)}
let rows;
try{rows=JSON.parse(fs.readFileSync(input,'utf8'));if(!Array.isArray(rows))throw Error('JSON root must be array')}catch(e){console.error(e.message);process.exit(2)}
const groups=new Map();const invalid=[];
for(const row of rows){
 if(!row || ['companyId','employeeId','workDate','workType'].some(k=>typeof row[k]!=='string'||!row[k])){invalid.push(row?.id||'(missing id)');continue}
 const key=JSON.stringify([row.companyId,row.employeeId,row.workDate,row.workType]);
 if(!groups.has(key))groups.set(key,[]);
 groups.get(key).push(row.id||'(missing id)');
}
const duplicates=[...groups.entries()].filter(([,ids])=>ids.length>1).map(([key,ids])=>({key:JSON.parse(key),ids}));
console.log(JSON.stringify({total:rows.length,uniqueKeys:groups.size,invalid,duplicates,duplicateGroups:duplicates.length},null,2));
if(duplicates.length||invalid.length)process.exitCode=1;
