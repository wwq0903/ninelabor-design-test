'use strict';
const isMonth = x => typeof x === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const isId = x => typeof x === 'string' && x.trim().length > 0;
function audit(data) {
  if (!data || !Array.isArray(data.overtime_records) || !Array.isArray(data.overtime_sync_meta)) {
    throw new Error('Expected overtime_records and overtime_sync_meta arrays');
  }
  const records = data.overtime_records, metas = data.overtime_sync_meta;
  const issues = [], add = (severity, code, key, message) => issues.push({severity, code, key, message});
  const groups = new Map(), seen = new Map(), metaMap = new Map();
  for (const r of records) {
    const id = isId(r?.id) ? r.id : '(missing id)';
    if (!isId(r?.companyId) || !isId(r?.employeeId) || !isMonth(r?.belongingYearMonth) || !/^\d{4}-\d{2}-\d{2}$/.test(r?.workDate || '')) {
      add('BLOCKER', 'INVALID_RECORD', id, 'Missing or malformed company/employee/month/date'); continue;
    }
    if (r.workDate.slice(0,7) !== r.belongingYearMonth) add('BLOCKER','MONTH_MISMATCH',id,'Work date differs from belonging month');
    const key = JSON.stringify([r.companyId,r.employeeId,r.workDate,r.workType]);
    if (seen.has(key)) add('BLOCKER','DUPLICATE_OVERTIME',id,`Same logical overtime as ${seen.get(key)}`);
    else seen.set(key,id);
    const group = JSON.stringify([r.companyId,r.belongingYearMonth]);
    groups.set(group,(groups.get(group)||0)+1);
  }
  for (const m of metas) {
    const id = isId(m?.id) ? m.id : '(missing id)';
    if (!isId(m?.companyId) || !isMonth(m?.belongingYearMonth)) { add('BLOCKER','INVALID_META',id,'Missing company or month'); continue; }
    const expected = `sync_${m.companyId}_${m.belongingYearMonth.replace('-','')}`;
    if (id !== expected) add('BLOCKER','META_ID_MISMATCH',id,`Expected ${expected}`);
    const key = JSON.stringify([m.companyId,m.belongingYearMonth]);
    if (metaMap.has(key)) add('BLOCKER','DUPLICATE_META',id,'Duplicate company/month metadata');
    metaMap.set(key,m);
    if (!Number.isSafeInteger(m.sourceVersion) || m.sourceVersion < 0) add('BLOCKER','UNVERSIONED_META',id,'Missing/invalid sourceVersion; requires controlled migration');
    if (m.overtimeImportedAt && !m.overtimeSourceUpdatedAt) add('REVIEW','IMPORT_WITHOUT_SOURCE_TIME',id,'Imported marker without source timestamp');
  }
  for (const [key,count] of groups) {
    if (!metaMap.has(key)) add('BLOCKER','MISSING_META',key,`${count} overtime records have no synchronization metadata`);
  }
  return { recordCount:records.length, metadataCount:metas.length, groupCount:groups.size, issues };
}
module.exports = { audit };
