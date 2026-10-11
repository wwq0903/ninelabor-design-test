/** Static coverage inventory: no Firestore calls, does not prove effective access control. */
const fs = require('node:fs');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const matches = [...rules.matchAll(/^\s{4}match \/([a-z_]+)\/\{[^\n]+/gm)];
const report = matches.map((m,i)=>{
  const block=rules.slice(m.index, i+1<matches.length?matches[i+1].index:undefined);
  const signals=['canAccessTaggedBranch(', 'adminCanAccessCompany(', 'adminCanAccessOptionalCompany('];
  return {collection:m[1], branchScopeReference:signals.some(x=>block.includes(x)), legacyAdminFallback:block.includes('isAdmin()')};
});
const summary={total:report.length,branchScopeReferenced:report.filter(x=>x.branchScopeReference).length,unscoped:report.filter(x=>!x.branchScopeReference).map(x=>x.collection),note:'Static inventory only. Indirect helper calls and cross-collection data relationships require emulator testing.'};
console.log(JSON.stringify({summary,collections:report},null,2));
