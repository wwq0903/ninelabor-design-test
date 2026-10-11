#!/usr/bin/env node
// Offline deployment gate: never print secret values or read credential files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const failures = [];
const pass = (name, ok) => { console.log(`${ok ? 'PASS' : 'BLOCKED'} ${name}`); if (!ok) failures.push(name); };
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
pass('Node.js 22+', Number(process.versions.node.split('.')[0]) >= 22);
pass('Production bundle exists', fs.existsSync(path.join(root, 'dist/index.html')));
pass('Firebase project ID provided', Boolean((process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '').trim()));
pass('Gemini API key provided', Boolean(process.env.GEMINI_API_KEY?.trim()));
pass('RRN encryption key provided', Boolean(process.env.RRN_ENCRYPTION_KEY?.trim()));
pass('Production mode enabled', process.env.NODE_ENV === 'production');
pass('Build script defined', Boolean(pkg.scripts?.build));
console.log(`${7 - failures.length}/7 deployment prerequisites satisfied`);
if (failures.length) process.exitCode = 1;
