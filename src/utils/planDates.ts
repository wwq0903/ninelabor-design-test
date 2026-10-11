/** Shared calendar-day validation for manual company plan assignment.
 * Strict UTC round-trip prevents invalid dates (e.g. 2026-02-30) from being
 * accepted by the UI or the service when called without the UI.
 */
export function isValidPlanDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validatePlanDateRange(start?: string, end?: string): void {
  if ((start && !isValidPlanDate(start)) || (end && !isValidPlanDate(end))) {
    throw new Error('날짜를 올바른 YYYY-MM-DD 형식으로 입력해주세요.');
  }
  if (start && end && end < start) {
    throw new Error('종료일은 시작일보다 이전일 수 없습니다.');
  }
}
