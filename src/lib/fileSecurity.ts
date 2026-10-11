/**
 * File Security Policy and Validation Utility for Data Requests
 */

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_FILE_SIZE_MB = 20;

// Dangerous extensions strictly blocked from upload
export const DANGEROUS_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'sh',
  'bash',
  'bin',
  'msi',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  'scr',
  'com',
  'pif',
  'reg',
  'dll',
  'sys',
  'cpl',
  'jar',
  'apk',
  'app',
  'dmg',
  'iso',
  'php',
  'jsp',
  'asp',
  'aspx',
]);

// Allowed business document extensions
export const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'hwp',
  'hwpx',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'zip',
  '7z',
  'tar',
  'gz',
]);

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedName?: string;
}

/**
 * Validates a file before upload
 */
export function validateFileForUpload(file: File): FileValidationResult {
  if (!file) {
    return { isValid: false, error: '파일이 선택되지 않았습니다.' };
  }

  // 1. Empty file check
  if (file.size === 0) {
    return {
      isValid: false,
      error: `[${file.name}] 0바이트의 빈 파일은 업로드할 수 없습니다.`,
    };
  }

  // 2. Maximum file size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `[${file.name}] 파일 크기(${formatFileSize(file.size)})가 최대 허용 용량(${MAX_FILE_SIZE_MB}MB)을 초과했습니다.`,
    };
  }

  // 3. Extension extraction
  const parts = file.name.split('.');
  if (parts.length < 2) {
    return {
      isValid: false,
      error: `[${file.name}] 확장자가 없는 파일은 보안상 업로드할 수 없습니다.`,
    };
  }

  const ext = parts.pop()!.toLowerCase().trim();

  // 4. Dangerous file check
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      error: `[${file.name}] 실행 파일 및 위험 확장자(.${ext})는 보안상 엄격히 차단됩니다.`,
    };
  }

  // 5. Allowed extension check
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      error: `[${file.name}] 지원되지 않는 파일 형식(.${ext})입니다. PDF, 한글(HWP), 오피스 문서, 이미지, 압축파일만 업로드 가능합니다.`,
    };
  }

  // 6. Dangerous MIME type check
  const mime = file.type.toLowerCase();
  if (
    mime.includes('x-msdownload') ||
    mime.includes('x-executable') ||
    mime.includes('x-sh') ||
    mime.includes('x-bat')
  ) {
    return {
      isValid: false,
      error: `[${file.name}] 실행 가능한 프로그램 파일(MIME: ${mime})은 업로드할 수 없습니다.`,
    };
  }

  const sanitizedName = sanitizeFileName(file.name);
  return { isValid: true, sanitizedName };
}

/**
 * Sanitizes a file name for safe storage
 */
export function sanitizeFileName(name: string): string {
  // Remove control characters, null bytes, and path separators
  return name.replace(/[\/\?<>\\:\*\|":\x00-\x1f]/g, '_').trim();
}

/**
 * Formats byte size into human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
