const fs = require('node:fs');
const assert = require('node:assert/strict');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const segment = (start, end) => rules.split(start)[1]?.split(end)[0] || '';
const contacts = segment('match /company_contacts/{contactId}', 'match /internal_notes/{noteId}');
const notes = segment('match /internal_notes/{noteId}', 'match /tasks/{taskId}');
assert.match(rules, /function canAccessTaggedBranch\(data\)/);
assert.match(rules, /adminBranchId\(\) == data\.branchId/);
for (const [name, body] of [['contacts', contacts], ['notes', notes]]) {
  assert.ok(body.includes('canAccessTaggedBranch(resource.data)'), `${name}: scoped read`);
  assert.ok(body.includes('canAccessTaggedBranch(request.resource.data)'), `${name}: scoped create`);
  assert.ok(body.includes('taggedBranchUnchanged()'), `${name}: immutable branch`);
  assert.ok(body.includes('allow delete: if false'), `${name}: no delete`);
}
console.log('PASS phase9 static rule checks (NOT emulator authorization tests)');
