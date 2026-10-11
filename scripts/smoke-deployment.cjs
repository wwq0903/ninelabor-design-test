#!/usr/bin/env node
// Read-only production HTTP smoke checks. No credentials or personal data sent.
const base = process.env.NINE_SMOKE_URL;
if (!base || !/^https:\/\//.test(base)) {
  console.error('Set NINE_SMOKE_URL to an HTTPS deployment URL.');
  process.exit(2);
}
const origin = new URL(base).origin;
async function check(path, expectedStatus, validate) {
  const response = await fetch(origin + path, {signal:AbortSignal.timeout(10000),redirect:'manual'});
  if(response.status!==expectedStatus) throw Error(`${path}: expected ${expectedStatus}, got ${response.status}`);
  if(response.headers.get('x-content-type-options')!=='nosniff') throw Error(`${path}: security header missing`);
  const data=await response.json();
  validate(data);
  console.log(`PASS ${path}: HTTP ${response.status}`);
}
(async()=>{
  await check('/api/health',200,d=>{if(d.status!=='ok')throw Error('health response invalid')});
  await check('/api/__nine_missing_route__',404,d=>{if(d.error!=='API_NOT_FOUND')throw Error('API fallback invalid')});
  console.log('Production HTTP smoke checks passed; authentication and Firebase authorization still require separate tests.');
})().catch(e=>{console.error('Deployment smoke failed:',e.message);process.exitCode=1});
