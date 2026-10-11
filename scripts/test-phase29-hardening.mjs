import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeAuditDetails } from '../src/utils/sanitizeAuditDetails.ts';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const details = sanitizeAuditDetails({
  companyId: 'company-a', password: 'secret', nested: {
    residentNumber: '123456-1234567', safe: 'yes', nested: [{ token: 'abc', action: 'ok' }],
  }, authorization: 'Bearer xxx', action: 'UPDATE',
});
assert.deepEqual(details, { companyId: 'company-a', nested: { safe: 'yes', nested: [{ action: 'ok' }] }, action: 'UPDATE' });
assert.equal(sanitizeAuditDetails({ nested: { rrnEncrypted: 'cipher', maskedRrn: 'mask' } }).nested.rrnEncrypted, undefined);
assert.equal(sanitizeAuditDetails({ '주민등록번호': 'sensitive' })['주민등록번호'], undefined);
assert.equal(sanitizeAuditDetails({ noteContent: 'private', details: [{ password: 'x', safe: 1 }] }).details[0].safe, 1);
assert.equal(sanitizeAuditDetails({ huge: 'x'.repeat(5000) }).huge.length, 2000);
assert.ok(read('firestore.rules').includes("'displayName',"));
const rules = read('firestore.rules');
const userUpdate = rules.split('// Normal user (isCurrentUser): STRICT ALLOWLIST ONLY.')[1].split('allow delete:')[0];
assert.ok(!userUpdate.includes("'maskedRrn'"), 'Self-update must not change masked RRN');
assert.ok(!userUpdate.includes("'hasRrn'"), 'Self-update must not change RRN presence');
const firebase = read('src/lib/firebase.ts');
assert.ok(!firebase.slice(firebase.indexOf('export function handleFirestoreError')).includes('JSON.stringify(errInfo)'));
assert.ok(firebase.includes('throw new Error(userMessage)'));
const audit = read('src/services/auditLogService.ts');
assert.ok(audit.includes('entry.actorUserId !== signedInUid'));
assert.ok(audit.includes('sanitizeAuditDetails(entry.details'));
assert.ok(audit.includes("orderBy('timestamp', 'desc')"));
const notif = read('src/services/notificationService.ts');
assert.ok(notif.includes("doc(collection(db, 'notifications'))"));
console.log('PASS 29차: 중첩 개인정보 삭제, 입력 제한, 프로필 RRN 보호, 감사로그 사용자 일치, 오류정보 축소, ID 충돌 완화');
