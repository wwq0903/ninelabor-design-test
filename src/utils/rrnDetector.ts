/**
 * Resident Registration Number (주민등록번호, RRN) Detection Utility
 *
 * Security Requirement (R2-6 1/3-B-②):
 * - Detects full Korean Resident Registration Number format before message dispatch.
 * - Prevents plaintext RRN from being stored in messages.
 * - CRITICAL: Never log, trace, or expose actual RRN values anywhere.
 */

export const RRN_BLOCK_MESSAGE =
  '주민등록번호 전체는 메시지로 전송할 수 없습니다. 근로자 정보의 보안 입력 기능을 이용해주세요.';

/**
 * Checks if the provided text contains a full Korean Resident Registration Number (13 digits).
 *
 * Detected patterns:
 * 1. Hyphenated / separated: 6 digits + separator (hyphen/space/slash) + 7 digits (with gender digit 1~8)
 *    e.g., "950101-1234567", "950101 - 1234567", "950101.1234567"
 * 2. Continuous 13 digits with gender digit 1~8:
 *    e.g., "9501011234567"
 *
 * Allowed patterns (not blocked):
 * - Field title alone: "주민등록번호:" or "주민등록번호: "
 * - Birthdate alone: "950101"
 * - Masked format: "950101-1******"
 */
export function containsKoreanRrn(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;

  // 1. Separated format: 6 digits + optional whitespace/separator + 7 digits (gender code 1~8)
  // Uses (?:^|[^0-9]) to support filenames with underscores (e.g. file_950101-1234567.pdf)
  const separatedRegex = /(?:^|[^0-9])\d{6}\s*[-–—/._\s]\s*[1-8]\d{6}(?:[^0-9]|$)/;
  if (separatedRegex.test(text)) {
    return true;
  }

  // 2. Continuous format: 13 digits where 7th digit is 1~8
  const continuousRegex = /(?:^|[^0-9])\d{6}[1-8]\d{6}(?:[^0-9]|$)/;
  if (continuousRegex.test(text)) {
    return true;
  }

  // 3. Normalized check: Scan lines containing '주민' or 'rrn' followed by 13 digits
  const lines = text.split('\n');
  for (const line of lines) {
    // If line has 13 consecutive digits after removing non-alphanumeric except Korean
    const digitsOnly = line.replace(/[^0-9]/g, '');
    if (digitsOnly.length === 13) {
      const genderCode = parseInt(digitsOnly.charAt(6), 10);
      if (genderCode >= 1 && genderCode <= 8) {
        return true;
      }
    }
  }

  return false;
}
