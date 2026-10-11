#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x => x.isDirectory() ? walk(path.join(dir,x.name)) : [path.join(dir,x.name)]); }
const files = walk(path.join(root,'src'));
const pages = files.filter(f => /\.(tsx|jsx)$/.test(f) && /\/(pages|components)\//.test(f));
const services = files.filter(f => /\/services\/.*\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'));
const tests = files.filter(f => /\.(test|spec)\.(ts|tsx|js)$/.test(f));
const scripts = walk(path.join(root,'scripts')).filter(f => /test-|check-|audit-/.test(path.basename(f)));
const result = { counts: { sourceFiles: files.length, uiFiles: pages.length, serviceFiles: services.length, unitTestFiles: tests.length, offlineCheckScripts: scripts.length }, releaseGates: { dependencyInstall: 'not_verified', typecheck: 'not_verified', viteBuild: 'not_verified', firebaseEmulator: 'not_verified', browserE2E: 'not_verified', productionDeploy: 'not_verified' }, caveat: 'File counts are not feature-completion percentages. Only executed checks establish verified progress.' };
console.log(JSON.stringify(result,null,2));
