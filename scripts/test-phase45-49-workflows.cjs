const fs = require('fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const overtime = fs.readFileSync(path.join(root,'src/services/overtimeService.ts'),'utf8');
const payroll = fs.readFileSync(path.join(root,'src/services/payrollService.ts'),'utf8');
let count=0;
function check(name, fn){fn(); count++; console.log('PASS',name)}
for (const [name,regex] of Object.entries({
  'transactional overtime edits': /await runTransaction\(db, async \(tx\)/,
  'reject cross-company move': /data\.companyId !== original\.companyId/,
  'reject cross-employee move': /data\.employeeId !== original\.employeeId/,
  'validate merged record': /const merged = \{ \.\.\.original, \.\.\.data \}/,
  'never mutate creator': /delete payload\.createdById/,
  'strict calendar dates': /parsedDate\.toISOString\(\)\.slice\(0, 10\) !== data\.workDate/,
  'duplicate errors propagate': /handleFirestoreError\(error, OperationType\.LIST, 'overtime_records\/duplicate-check'\)/,
  'no worker-list empty bypass': /else if \(data\.expectedCompanyWorkers\)/,
  'reject infinite hours': /!Number\.isFinite\(data\.hours\)/,
})) check(name,()=>assert.match(overtime,regex));
for (const [name,regex] of Object.entries({
  'payroll transactional save': /await runTransaction\(db, async \(tx\)/,
  'locked payroll protection': /previous\.status !== 'DRAFT'/,
  'payroll immutable company': /previous\.companyId !== record\.companyId/,
  'payroll immutable employee': /previous\.employeeId !== record\.employeeId/,
  'payroll immutable month': /previous\.belongingYearMonth !== record\.belongingYearMonth/,
  'no create confirmed': /record\.status !== 'DRAFT'/,
  'atomic confirmation': /record\.status !== expectedStatus/,
  'no default fabricated wage': /DEFAULT_BASE_HOURLY_WAGE: 0/,
  'finite money amounts': /!Number\.isFinite\(item\.amount\)/,
  'strict company worker map': /matchedWorker\.companyId !== companyId/,
})) check(name,()=>assert.match(payroll,regex));
// Execute the actual validator method from the TS source without Firebase dependencies.
const start=overtime.indexOf('  validateOvertimeData(');
const end=overtime.indexOf('\n  // Requirement 5 & 6:',start);
assert.ok(start>0 && end>start);
let method=overtime.slice(start,end).replace(/^  validateOvertimeData\(data: \{[\s\S]*?\}\): OvertimeValidationResult \{/,'function validateOvertimeData(data) {').replace(/\n  \},\s*$/,'\n}').replace('const errors: string[] = [];','const errors = [];');
const validate=vm.runInNewContext(`(${method})`);
const base={companyId:'c1',employeeId:'w1',workDate:'2026-10-11',belongingYearMonth:'2026-10',workType:'OVERTIME',hours:2,expectedCompanyWorkers:[{id:'w1',companyId:'c1'}]};
for (const [name,changes,valid] of [
 ['valid input',{},true],['leap day invalid',{workDate:'2026-02-29',belongingYearMonth:'2026-02'},false],
 ['invalid 31st',{workDate:'2026-04-31',belongingYearMonth:'2026-04'},false],
 ['valid leap day',{workDate:'2028-02-29',belongingYearMonth:'2028-02'},true],
 ['infinite hours',{hours:Infinity},false],['negative hours',{hours:-1},false],
 ['empty company roster',{expectedCompanyWorkers:[]},false],
 ['foreign company roster',{expectedCompanyWorkers:[{id:'w1',companyId:'c2'}]},false],
 ['mismatched month',{belongingYearMonth:'2026-09'},false],
 ['invalid work type',{workType:'OTHER'},false],
]) check(name,()=>assert.equal(validate({...base,...changes}).isValid,valid));
console.log(`Phase 45-49: ${count}/${count} checks passed`);
