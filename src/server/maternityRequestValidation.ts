/** Validate HTTP input before it can alter an atomic maternity transaction. */
export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError('Expected a JSON boolean');
  return value;
}

/** Reject unexpected client flags instead of coercing strings (including "false") to true. */
export function parseMaternitySkipFlag(value: unknown): boolean {
  return parseOptionalBoolean(value) ?? false;
}
