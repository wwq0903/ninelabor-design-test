#!/usr/bin/env node
// No credentials or network. Validate the complete production runtime file graph.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const docker = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const files = ['server.ts', 'src/server/firebaseAdmin.ts', 'src/server/adminUserService.ts', 'firebase-applet-config.json'];
let n = 0;
function check(name, cb) { cb(); n++; console.log('PASS', name); }
check('Docker runtime copies Firebase project configuration', () => assert.match(docker, /COPY --from=build \/app\/firebase-applet-config\.json \.\/firebase-applet-config\.json/));
check('Docker runtime copies shared server source', () => assert.match(docker, /COPY --from=build \/app\/src \.\/src/));
check('Docker runtime copies server entry and built SPA', () => { assert.match(docker, /COPY --from=build \/app\/server\.ts \.\/server\.ts/); assert.match(docker, /COPY --from=build \/app\/dist \.\/dist/); });
check('Firebase project config file is present and valid JSON', () => { const data = JSON.parse(fs.readFileSync(path.join(root, files[3]), 'utf8')); assert.equal(typeof data.projectId, 'string'); assert.ok(data.projectId.length > 0); });
check('Both Admin modules import the root config', () => { for (const file of files.slice(1,3)) assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /firebase-applet-config\.json/); });
check('tsx is a production dependency', () => assert.ok(pkg.dependencies?.tsx));
check('runtime executes as non-root', () => assert.match(docker, /USER node/));
check('production server is started by Node with tsx', () => assert.match(docker, /CMD \["node", "--import", "tsx", "server\.ts"\]/));
check('runtime does not bake .env secrets', () => assert.match(fs.readFileSync(path.join(root,'.dockerignore'),'utf8'), /^\.env\.\*/m));
console.log(`${n}/${n} production artifact checks passed (static, not Docker execution)`);
