// Phase 55-60 regression: retain the validation and all-or-nothing contract
// after the phase 61+ move from writeBatch to canonical-ID transactions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file=path.join(__dirname,'../src/services/overtimeService.ts');
const src=fs.readFileSync(file,'utf8');
let passed=0;
const check=(condition,message)=>{assert.ok(condition,message);passed++};
check(src.includes('async batchCreateOvertimeRecords('),'bulk entrypoint');
check(src.includes('records.length > 200'),'max 200 entries');
check(src.includes('const keys = new Set<string>()'),'input duplicate detection');
check(src.includes('this.validateOvertimeData({'),'validation');
check(src.includes('const touchedMonths = new Map'),'multi-month metadata');
check(src.includes('await runTransaction(db, async (tx) =>'),'atomic commit');
check(src.includes('const snapshots = await Promise.all(entries.map(({ ref }) => tx.get(ref)))'),'read-before-write');
check(src.includes('snapshots.some(snap => snap.exists())'),'existing record guard');
check(src.includes('tx.set(ref, record)'),'transaction record write');
check(src.includes("'overtime_sync_meta'"),'metadata tracking');
check(src.includes('createdCount: createdRecords.length'),'result count');
console.log(`Phase55-60 compatibility checks ${passed}/${passed} passed (structural; runtime covered by phase61-68)`);
