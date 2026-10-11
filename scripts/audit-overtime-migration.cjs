#!/usr/bin/env node
// Offline, read-only inspection of a Firestore JSON export. No credentials, network or writes.
const fs = require('node:fs');
const { resolve } = require('node:path');
const { audit } = require('./lib/overtime-migration-audit.cjs');
const input = process.argv[2];
if (!input || process.argv.includes('--help')) {
  console.log('Usage: node scripts/audit-overtime-migration.cjs <export.json> [--json]');
  console.log('Input: {"overtime_records":[{"id":"...",...}],"overtime_sync_meta":[{"id":"...",...}]}');
  process.exit(input ? 0 : 2);
}
try {
  const data = JSON.parse(fs.readFileSync(resolve(input), 'utf8'));
  const result = audit(data);
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Read-only audit: ${result.recordCount} records, ${result.metadataCount} metadata, ${result.issues.length} findings`);
    for (const issue of result.issues) console.log(`[${issue.severity}] ${issue.code} ${issue.key}: ${issue.message}`);
  }
  process.exitCode = result.issues.some(x => x.severity === 'BLOCKER') ? 1 : 0;
} catch (e) { console.error(`Audit failed: ${e.message}`); process.exitCode = 2; }
