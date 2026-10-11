/** Defense-in-depth for audit details: omit nested sensitive keys and bound recursion. */
const PRIVATE_KEYS = new Set([
  'residentnumber', 'residentregistrationnumber', 'rrn', 'ssn', 'rrnencrypted',
  'maskedrrn', 'hasrrn', 'password', 'passwd', 'secret', 'token', 'accesstoken',
  'refreshtoken', 'authorization', 'apikey', 'privatekey', 'content',
  'contentsnippet', 'notecontent', 'snippet', 'description', 'taskdescription',
]);
const PRIVATE_KEY_PATTERN = /(resident.?number|social.?security|password|secret|token|api.?key|private.?key|rrn|주민등록번호|비밀번호)/i;

export function sanitizeAuditDetails(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[REDACTED_DEPTH]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 2000 ? value.slice(0, 2000) : value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeAuditDetails(item, depth + 1));
  if (typeof value !== 'object' || value instanceof Date) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    if (PRIVATE_KEYS.has(key.toLowerCase()) || PRIVATE_KEY_PATTERN.test(key)) continue;
    const cleaned = sanitizeAuditDetails(child, depth + 1);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  return output;
}
