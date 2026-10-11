#!/usr/bin/env node
// Offline, read-only build prerequisites check. Does not access credentials or network.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const checks = [
  ['Node >= 20', Number(process.versions.node.split('.')[0]) >= 20],
  ['package.json has build script', Boolean(pkg.scripts?.build)],
  ['TypeScript configuration exists', fs.existsSync(path.join(root, 'tsconfig.json'))],
  ['Vite entrypoint exists', fs.existsSync(path.join(root, 'index.html'))],
  ['Dependency lockfile exists', ['package-lock.json','bun.lock','pnpm-lock.yaml','yarn.lock'].some(f => fs.existsSync(path.join(root,f)))],
  ['Installed Vite package exists', fs.existsSync(path.join(root, 'node_modules', 'vite', 'package.json'))],
  ['Installed TypeScript package exists', fs.existsSync(path.join(root, 'node_modules', 'typescript', 'package.json'))],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'BLOCKED'} ${name}`);
const blocked = checks.filter(([,ok]) => !ok);
console.log(`\n${checks.length - blocked.length}/${checks.length} prerequisites available`);
if (blocked.length) {
  console.error('Build is NOT verified. Install dependencies in a network-enabled environment and run npm run lint && npm run build.');
  process.exitCode = 1;
}
