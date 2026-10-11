#!/usr/bin/env node
// Fail fast on missing local dependencies rather than reporting an unverified build as success.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const required = ['typescript', 'vite', '@vitejs/plugin-react', '@tailwindcss/vite'];
const missing = required.filter(name => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));
if (missing.length) {
  console.error(`BUILD BLOCKED: Missing dependencies: ${missing.join(', ')}`);
  console.error('Run "npm install" in a network-enabled environment, then "npm run verify:build".');
  process.exit(2);
}
for (const [label, command, args] of [
  ['TypeScript', 'node', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['Vite', 'node', ['node_modules/vite/bin/vite.js', 'build']],
]) {
  console.log(`Running ${label}...`);
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('TypeScript and Vite build passed. Firebase tests still required.');
