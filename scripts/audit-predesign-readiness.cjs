#!/usr/bin/env node
/** Pre-design release architecture audit. No network, credentials, or writes. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('server.ts');
const checks = [];
const add = (id, severity, passed, detail) => checks.push({id,severity,status:passed?'PASS':'BLOCKED',detail});
const endpoints = [...server.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*['"](\/api\/[^'"]+)['"]/g)].map(x=>x[1]);
const sourceFiles=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(ts|tsx|js|jsx)$/.test(e.name))sourceFiles.push(p);}}
walk(path.join(root,'src'));
const frontendApi = [...new Set(sourceFiles.flatMap(p=>[...fs.readFileSync(p,'utf8').matchAll(/['"`](\/api\/[\w/\-:${}]+)['"`]/g)].map(m=>m[1])))].sort();
add('NODE_RUNTIME','runtime',Number(process.versions.node.split('.')[0])>=22,'Node 22+');
add('TYPESCRIPT_INSTALLED','build',fs.existsSync(path.join(root,'node_modules/typescript/package.json')),'Local TypeScript package');
add('VITE_INSTALLED','build',fs.existsSync(path.join(root,'node_modules/vite/package.json')),'Local Vite package');
add('PRODUCTION_BUILD','build',fs.existsSync(path.join(root,'dist/index.html')),'Production build output');
add('FIRESTORE_RULES','security',fs.existsSync(path.join(root,'firestore.rules')),'Firestore rules exist; emulator execution still required');
add('STORAGE_RULES','security',fs.existsSync(path.join(root,'storage.rules')),'Storage rules exist; bucket provisioning still required');
const hosting = ['netlify.toml','netlify/functions','vercel.json','Dockerfile','cloudbuild.yaml'].filter(p=>fs.existsSync(path.join(root,p)));
if (fs.existsSync(path.join(root,'firebase.json'))) { const config=JSON.parse(read('firebase.json')); if (config.hosting || config.functions) hosting.push('firebase.json hosting/functions'); }
add('API_HOSTING_PLAN','deployment',endpoints.length===0||hosting.length>0,`Express API routes: ${endpoints.length}; hosting manifests: ${hosting.join(', ')||'none'}. Static Vite hosting alone cannot run Express API.`);
add('FIREBASE_EMULATOR_CONFIG','test',fs.existsSync(path.join(root,'firebase.json')),'firebase.json required for reproducible local Emulator Suite run');
add('LOCKFILE','build',['bun.lock','package-lock.json','pnpm-lock.yaml','yarn.lock'].some(p=>fs.existsSync(path.join(root,p))),'Dependency lockfile');
add('SOURCE_VERSION_AUDIT','migration',fs.existsSync(path.join(root,'scripts/audit-overtime-migration.cjs')),'Read-only overtime migration audit present; requires actual data export');
add('ENV_TEMPLATE','deployment',fs.existsSync(path.join(root,'.env.example')),'Environment template present; live credentials not checked');
const result={generatedAt:new Date().toISOString(),scope:'offline architecture/readiness only',checks,api:{backendRoutes:endpoints,frontendApiReferences:frontendApi},summary:{pass:checks.filter(x=>x.status==='PASS').length,blocked:checks.filter(x=>x.status==='BLOCKED').length}};
if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));else{for(const c of checks)console.log(`${c.status} ${c.id}: ${c.detail}`);console.log(`\n${result.summary.pass}/${checks.length} checks pass; ${result.summary.blocked} blocked. Frontend API references: ${frontendApi.length}; backend routes: ${endpoints.length}.`);}
if(process.argv.includes('--strict')&&result.summary.blocked)process.exitCode=1;
