/** Only missing-index errors may use a less ordered, equally scoped query.
 * Permission, authentication, network and quota errors must propagate unchanged.
 */
export function isMissingIndexError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  return e.code === 'failed-precondition' &&
    typeof e.message === 'string' &&
    /(?:index|indexes|create.*index)/i.test(e.message);
}
