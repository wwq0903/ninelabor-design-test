import assert from 'node:assert/strict';
import { isValidPlanDate, validatePlanDateRange } from '../src/utils/planDates.ts';
for (const value of ['2026-01-01','2028-02-29','2026-12-31']) assert.equal(isValidPlanDate(value),true,value);
for (const value of ['2026-02-29','2026-02-30','2026-13-01','2026-00-01','2026-1-1','not-a-date','2026-04-31']) assert.equal(isValidPlanDate(value),false,value);
assert.doesNotThrow(()=>validatePlanDateRange('2026-10-01','2026-10-01'));
assert.doesNotThrow(()=>validatePlanDateRange(undefined,'2026-10-01'));
assert.throws(()=>validatePlanDateRange('2026-10-12','2026-10-11'));
assert.throws(()=>validatePlanDateRange('2026-02-30','2026-03-01'));
console.log('PASS: 14 real date boundary and range assertions');
