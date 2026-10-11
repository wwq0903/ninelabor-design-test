#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const ai = fs.readFileSync(path.join(root, 'src/services/aiConsultationService.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const checks = [
 ['Vite is loaded only for development', !/^import .* from 'vite';/m.test(server) && server.includes("await import('vite')")],
 ['Production dist existence checked', server.includes("fs.existsSync(indexPath)")],
 ['Graceful SIGTERM and SIGINT shutdown', server.includes("['SIGTERM', 'SIGINT']") && server.includes('server.close(')],
 ['Shutdown timeout is bounded', server.includes('10_000).unref()')],
 ['AI upstream failure is a gateway error', server.includes("error: 'GEMINI_CALL_FAILED'") && server.includes('res.status(502).json({')],
 ['Browser does not log AI error objects', !ai.includes("console.error('Failed to call Gemini AI', err)")],
 ['Deployment gate exposed', Boolean(pkg.scripts['check:release'])],
 ['Inventory exposed', Boolean(pkg.scripts['report:inventory'])],
 ['Release config avoids secret value printing', !fs.readFileSync(path.join(root,'scripts/check-release-config.cjs'),'utf8').includes('console.log(process.env')],
 ['CI invokes regression suite', fs.readFileSync(path.join(root,'.github/workflows/verify.yml'),'utf8').includes('npm run check:phase39-44')],
 ['CI does not suppress native dependency install scripts', !fs.readFileSync(path.join(root,'.github/workflows/verify.yml'),'utf8').includes('--ignore-scripts')],
];
for (const [name, ok] of checks) { assert.ok(ok, name); console.log('PASS',name); }
const release = cp.spawnSync(process.execPath,['scripts/check-release-config.cjs'], {cwd:root,env:{...process.env,NODE_ENV:'test',FIREBASE_PROJECT_ID:'',GCLOUD_PROJECT:'',GOOGLE_CLOUD_PROJECT:'',GEMINI_API_KEY:'',RRN_ENCRYPTION_KEY:''},encoding:'utf8'});
assert.equal(release.status,1,'Release gate must fail closed without config');
assert.match(release.stdout,/BLOCKED Production bundle exists/);
assert.match(release.stdout,/BLOCKED Gemini API key provided/);
console.log('PASS release gate rejects incomplete deployment');
const inventory = cp.spawnSync(process.execPath,['scripts/inventory-progress.cjs'],{cwd:root,encoding:'utf8'});
assert.equal(inventory.status,0);
const result=JSON.parse(inventory.stdout);
assert.ok(result.counts.sourceFiles > 50);
assert.equal(result.releaseGates.firebaseEmulator,'not_verified');
console.log('PASS inventory does not fabricate completion percentage');
console.log('13/13 phase39-44 checks passed');
