const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const overtime = fs.readFileSync(path.join(root, 'src/services/overtimeService.ts'), 'utf8');
const payroll = fs.readFileSync(path.join(root, 'src/services/payrollService.ts'), 'utf8');
const cases = [
  ['overtime list failure is propagated', /getOvertimeByCompany[\s\S]*?handleFirestoreError\(error, OperationType.LIST[\s\S]*?throw error;/],
  ['employee overtime list failure is propagated', /getOvertimeByEmployee[\s\S]*?handleFirestoreError\([\s\S]*?throw error;/],
  ['delete returns transaction snapshot', /const deleted = await runTransaction[\s\S]*?return deleted;/],
  ['delete uses latest document', /const current = latest.data\(\) as OvertimeRecord/],
  ['delete sync marker in transaction', /tx.delete\(docRef\);[\s\S]*?tx.set\(syncRef,/],
  ['overtime calculation requires wage', /baseHourlyWage: number\s*\)/],
  ['wage must be positive', /baseHourlyWage <= 0/],
  ['payroll items must be arrays', /Array.isArray\(data.payItems\)/],
  ['payroll total must be finite', /\[totalPay, totalDeduction, netPay\]\.every\(Number.isFinite\)/],
  ['payroll period is validated', /급여 저장에 필요한 기업·근로자·귀속연월/],
];
for (const [name, pattern] of cases) {
  assert.match(name.startsWith('overtime list') || name.startsWith('employee') || name.startsWith('delete') ? overtime : payroll, pattern, name);
  process.stdout.write(`PASS ${name}\n`);
}
