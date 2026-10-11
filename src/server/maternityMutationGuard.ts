/** Restrict client-provided updates to non-identity maternity workflow fields. */
const STATUSES = new Set(['APPLIED','DOCS_COLLECTING','UNDER_REVIEW','IN_PROGRESS','COMPLETED','SUPPLEMENT_REQUESTED','CANCELLED']);
const MUTABLE_FIELDS = new Set(['assignedAttorneyId','completedAt','completedById','supplementRequest']);
const ID = /^[A-Za-z0-9_-]{1,128}$/;
export function validDocumentId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}
export function validMaternityStatus(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && STATUSES.has(value));
}
export function sanitizeMaternityCaseUpdates(value: unknown, actorUid: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_CASE_UPDATES');
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (key === 'updatedById') continue; // Always set by the server.
    if (!MUTABLE_FIELDS.has(key)) throw new Error('PROTECTED_CASE_FIELD');
    if (key === 'assignedAttorneyId' || key === 'completedById') {
      if (!validDocumentId(field) || (key === 'completedById' && field !== actorUid)) throw new Error('INVALID_CASE_UPDATES');
    } else if (key === 'completedAt') {
      if (typeof field !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(field) || !Number.isFinite(Date.parse(field))) throw new Error('INVALID_CASE_UPDATES');
    } else if (key === 'supplementRequest') {
      if (!field || typeof field !== 'object' || Array.isArray(field)) throw new Error('INVALID_CASE_UPDATES');
      const req = field as Record<string, unknown>;
      if (typeof req.content !== 'string' || !req.content.trim() || req.content.length > 10000 ||
          typeof req.requestedAt !== 'string' || !Number.isFinite(Date.parse(req.requestedAt)) ||
          req.requestedById !== actorUid) throw new Error('INVALID_CASE_UPDATES');
    }
    result[key] = field;
  }
  return result;
}
