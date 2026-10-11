#!/usr/bin/env node
// Execute the actual TypeScript HTTP guard module with globally available TypeScript.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
const filename = path.resolve(__dirname, '../src/server/httpProtection.ts');
const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandboxModule = { exports: {} };
vm.runInNewContext(js, { module: sandboxModule, exports: sandboxModule.exports, console, Date, Map, Math, String, Number, Error }, { filename });
const { apiSecurityHeaders, createFixedWindowLimiter, apiNotFound, apiErrorHandler } = sandboxModule.exports;
const assert = require('node:assert/strict');
function res() { return { headers: {}, statusCode: 200, body: null, setHeader(k,v) { this.headers[k] = v; return this; }, status(n) { this.statusCode = n; return this; }, json(x) { this.body = x; return this; } }; }
let passed=0;
function test(name, fn) { fn(); console.log('PASS',name); passed++; }
test('API security headers', () => { const r=res(); let next=0; apiSecurityHeaders({},r,()=>next++); assert.equal(next,1); assert.equal(r.headers['Cache-Control'],'no-store'); assert.equal(r.headers['X-Content-Type-Options'],'nosniff'); });
test('Limiter allows configured number and then returns 429', () => { const limit=createFixedWindowLimiter({windowMs:60000,max:2}); const req={socket:{remoteAddress:'192.0.2.1'}}; let next=0; const a=res(),b=res(),c=res(); limit(req,a,()=>next++);limit(req,b,()=>next++);limit(req,c,()=>next++);assert.equal(next,2);assert.equal(c.statusCode,429);assert.equal(c.body.error,'RATE_LIMITED');assert.ok(Number(c.headers['Retry-After'])>0); });
test('Limiter isolates distinct IPs', () => { const limit=createFixedWindowLimiter({windowMs:60000,max:1}); let next=0; limit({socket:{remoteAddress:'a'}},res(),()=>next++);limit({socket:{remoteAddress:'b'}},res(),()=>next++);assert.equal(next,2); });
test('Limiter rejects invalid configuration', () => { assert.throws(()=>createFixedWindowLimiter({windowMs:0,max:1}));assert.throws(()=>createFixedWindowLimiter({windowMs:1000,max:0})); });
test('Unknown API is JSON 404', () => { const r=res();apiNotFound({},r);assert.equal(r.statusCode,404);assert.equal(r.body.error,'API_NOT_FOUND'); });
test('Oversized JSON is sanitized 413', () => { const r=res();apiErrorHandler({status:413,type:'entity.too.large'}, {},r,()=>{});assert.equal(r.statusCode,413);assert.equal(r.body.error,'PAYLOAD_TOO_LARGE'); });
test('Malformed JSON is sanitized 400', () => { const r=res();apiErrorHandler({status:400,type:'entity.parse.failed'}, {},r,()=>{});assert.equal(r.statusCode,400);assert.equal(r.body.error,'INVALID_JSON'); });
test('Unknown error does not leak details', () => { const r=res();apiErrorHandler({message:'secret-value'}, {},r,()=>{});assert.equal(r.statusCode,500);assert.ok(!JSON.stringify(r.body).includes('secret-value')); });
console.log(`HTTP protection runtime checks: ${passed}/8 passed`);
