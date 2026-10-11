#!/usr/bin/env node
// Offline preflight: checks local import paths without installing dependencies.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sourceRoots = ['src', 'server.ts', 'vite.config.ts'];
const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp'];
const visited = [];
function walk(p) {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) for (const name of fs.readdirSync(p)) walk(path.join(p,name));
  else if (/\.(?:tsx?|jsx?)$/.test(p)) visited.push(p);
}
sourceRoots.forEach(x => walk(path.join(root,x)));
const missing = [];
let count = 0;
for (const file of visited) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?|\bimport\s*\()\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(text))) {
    const spec = match[1];
    if (!(spec.startsWith('.') || spec.startsWith('@/'))) continue;
    count++;
    const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(file),spec);
    const candidates = extensions.map(e => base+e).concat(extensions.slice(1).map(e=>path.join(base,'index'+e)));
    if (!candidates.some(p => fs.existsSync(p) && fs.statSync(p).isFile())) missing.push(`${path.relative(root,file)} -> ${spec}`);
  }
}
console.log(`Checked ${visited.length} source files and ${count} local imports.`);
if (missing.length) {
  console.error(`Unresolved local imports: ${missing.length}`);
  for (const x of missing) console.error('  '+x);
  process.exitCode=1;
} else console.log('All statically detected local imports resolved.');
