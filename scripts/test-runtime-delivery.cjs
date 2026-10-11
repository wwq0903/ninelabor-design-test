#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const docker = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
test('unknown API routes do not fall through to SPA', () => assert(server.indexOf("app.use('/api', apiNotFound)") < server.indexOf("app.get('*'")));
test('missing static assets return HTTP 404', () => assert.match(server, /path\.extname\(req\.path\).*status\(404\)/));
test('SPA document is not cached indefinitely', () => assert.match(server, /setHeader\('Cache-Control', 'no-cache'\)/));
test('Vite hashed assets have immutable caching', () => assert.match(server, /max-age=31536000, immutable/));
test('server refuses to start without dist index', () => assert.match(server, /if \(!fs\.existsSync\(indexPath\)\)/));
test('production has a Node entrypoint', () => assert.equal(pkg.scripts.start, 'tsx server.ts'));
test('production image includes built dist and server source', () => {assert.match(docker, /COPY --from=build \/app\/dist/);assert.match(docker, /COPY --from=build \/app\/server\.ts/);});
test('Docker runtime does not run as root', () => assert.match(docker, /USER node/));
console.log(`${count}/${count} runtime delivery checks passed (static checks, not a running HTTP server)`);
