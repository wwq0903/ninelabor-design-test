#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const nav = read('src/components/layout/Navbar.tsx');
const app = read('src/App.tsx');
const website = read('src/components/public/PublicWebsite.tsx');
const boundary = read('src/components/common/ErrorBoundary.tsx');
const checks = [
  ['mobile primary navigation exists', () => assert.match(nav, /aria-label="모바일 주요 메뉴"/)],
  ['mobile navigation hidden at desktop breakpoint', () => assert.match(nav, /flex md:hidden border-t/)],
  ['mobile portal requires login for anonymous users', () => assert.match(nav, /currentUser \? onSelectTab\('portal'\) : setIsLoginOpen\(true\)/)],
  ['mobile website navigation remains accessible', () => assert.match(nav, /onClick=\{\(\) => onSelectTab\('website'\)\}/)],
  ['active mobile tab exposes aria-current', () => assert.match(nav, /aria-current=\{currentTab === 'portal'/)],
  ['account menu exposes expanded state', () => assert.match(nav, /aria-expanded=\{showUserMenu\}/)],
  ['official English brand in navigation', () => assert.match(nav, /NINELABOR/)],
  ['official English brand in public website', () => assert.match(website, /NINELABOR/)],
  ['public website does not use SaaS label', () => assert.doesNotMatch(website, /SaaS/i)],
  ['screen errors isolated with ErrorBoundary', () => assert.match(app, /<ErrorBoundary key=\{currentTab\}/)],
  ['boundary does not expose raw error message in UI', () => assert.doesNotMatch(boundary, /this\.state\.error\?\.message/)],
  ['error boundary supports retry', () => assert.match(boundary, /onClick=\{this\.handleRetry\}/)],
  ['portal uses existing PortalShell', () => assert.match(app, /<PortalShell\s*\/>/)],
  ['public website uses existing PublicWebsite', () => assert.match(app, /<PublicWebsite onGoToPortal=/)],
];
for (const [name, fn] of checks) { try { fn(); console.log('PASS', name); } catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; } }
console.log(`${checks.length} UI integration assertions; ${process.exitCode ? 'FAILED' : 'PASSED'}`);
