#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/verify.yml'), 'utf8');
const cases = [
  ['API route handles absent JSON body', (source.match(/\}\s*= req\.body \?\? \{\};/g) || []).length >= 2],
  ['AI errors do not log upstream exception object', !source.includes("console.error('Gemini API Error in /api/ai-consult:', error)")],
  ['Startup errors do not dump environment exceptions', !source.includes("console.error('Failed to start server:', err)")],
  ['API error handler installed', source.includes('app.use(apiErrorHandler)')],
  ['Production requires compiled index', source.includes('if (!fs.existsSync(indexPath))')],
  ['CI checks TypeScript', workflow.includes('npm run lint')],
  ['CI checks Vite build', workflow.includes('npm run build')],
  ['CI checks build output', workflow.includes('npm run verify:build')],
  ['CI checks server safety regression', workflow.includes('npm run check:phase32')],
];
for (const [name, ok] of cases) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); assert.ok(ok, name); }
console.log(`${cases.length}/${cases.length} server-safety regression assertions passed`);
