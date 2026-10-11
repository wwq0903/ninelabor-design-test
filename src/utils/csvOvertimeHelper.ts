import { OvertimeWorkType, Worker } from '../types';

export interface ParsedOvertimeCsvRow {
  rawRowIndex: number;
  employeeId: string;
  employeeName: string;
  workDate: string;
  workType: OvertimeWorkType;
  hours: number;
  memo?: string;
  matchStatus: 'MATCHED' | 'NEEDS_REVIEW';
  matchError?: string;
  matchedWorker?: Worker;
}

export interface CsvParseResult {
  totalRows: number;
  matchedCount: number;
  needsReviewCount: number;
  rows: ParsedOvertimeCsvRow[];
  headers: string[];
}

/**
 * Generate a downloadable standard CSV template with BOM for Excel Korean support
 */
export function generateOvertimeCsvTemplate(
  workers: Worker[],
  belongingYearMonth: string
): string {
  // UTF-8 BOM
  let csv = '\uFEFF';
  csv += '근로자 식별자,근로자명,근무일자,근무구분,근무시간,메모\r\n';

  // Sample rows from actual workers if available
  if (workers.length > 0) {
    const w1 = workers[0];
    csv += `${w1.id},${w1.name},${belongingYearMonth}-15,연장근무,2.5,프로젝트 납기 대응 연장근무\r\n`;
    if (workers.length > 1) {
      const w2 = workers[1];
      csv += `${w2.id},${w2.name},${belongingYearMonth}-18,휴무일근무,4,주말 시스템 점검 근무\r\n`;
    }
  } else {
    csv += `EMP001,홍길동,${belongingYearMonth}-15,연장근무,2,야근 업무 지원\r\n`;
    csv += `EMP002,김철수,${belongingYearMonth}-20,휴무일근무,4,주말 긴급 출근\r\n`;
  }

  return csv;
}

/**
 * Parse CSV string safely (handling CRLF, quotes, commas)
 */
export function parseCsvRows(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentToken = '';

  // Strip BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentToken += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentToken.trim());
      currentToken = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentToken.trim());
      if (row.some((cell) => cell !== '')) {
        result.push(row);
      }
      row = [];
      currentToken = '';
    } else {
      currentToken += char;
    }
  }

  if (currentToken || row.length > 0) {
    row.push(currentToken.trim());
    if (row.some((cell) => cell !== '')) {
      result.push(row);
    }
  }

  return result;
}

/**
 * Map CSV rows to overtime batch input structure strictly by employeeId
 * Requirement 3: 근로자명만으로 자동 연결하지 말고, employeeId 등 고유 식별자로 연결하고,
 * 식별자가 없거나 일치하지 않으면 검토 필요로 분류
 */
export function parseOvertimeCsv(
  csvText: string,
  companyWorkers: Worker[],
  belongingYearMonth: string
): CsvParseResult {
  const rawGrid = parseCsvRows(csvText);
  if (rawGrid.length === 0) {
    return {
      totalRows: 0,
      matchedCount: 0,
      needsReviewCount: 0,
      rows: [],
      headers: [],
    };
  }

  // Header detection
  const firstRow = rawGrid[0];
  let headerIndexMap = {
    employeeId: -1,
    employeeName: -1,
    workDate: -1,
    workType: -1,
    hours: -1,
    memo: -1,
  };

  firstRow.forEach((col, idx) => {
    const normalized = col.replace(/\s+/g, '').toLowerCase();
    if (
      normalized.includes('식별자') ||
      normalized.includes('사번') ||
      normalized.includes('employeeid') ||
      normalized.includes('id')
    ) {
      if (headerIndexMap.employeeId === -1) headerIndexMap.employeeId = idx;
    } else if (
      normalized.includes('근로자명') ||
      normalized.includes('이름') ||
      normalized.includes('성명') ||
      normalized.includes('name')
    ) {
      if (headerIndexMap.employeeName === -1) headerIndexMap.employeeName = idx;
    } else if (
      normalized.includes('근무일자') ||
      normalized.includes('일자') ||
      normalized.includes('날짜') ||
      normalized.includes('date')
    ) {
      if (headerIndexMap.workDate === -1) headerIndexMap.workDate = idx;
    } else if (
      normalized.includes('근무구분') ||
      normalized.includes('구분') ||
      normalized.includes('worktype') ||
      normalized.includes('유형')
    ) {
      if (headerIndexMap.workType === -1) headerIndexMap.workType = idx;
    } else if (
      normalized.includes('근무시간') ||
      normalized.includes('시간') ||
      normalized.includes('hours')
    ) {
      if (headerIndexMap.hours === -1) headerIndexMap.hours = idx;
    } else if (
      normalized.includes('메모') ||
      normalized.includes('비고') ||
      normalized.includes('memo') ||
      normalized.includes('사유')
    ) {
      if (headerIndexMap.memo === -1) headerIndexMap.memo = idx;
    }
  });

  // Fallback to default positional indices if header was standard order
  const hasHeaders =
    headerIndexMap.employeeId !== -1 ||
    headerIndexMap.workDate !== -1 ||
    headerIndexMap.hours !== -1;

  const dataRows = hasHeaders ? rawGrid.slice(1) : rawGrid;
  const colEmpId = headerIndexMap.employeeId !== -1 ? headerIndexMap.employeeId : 0;
  const colName = headerIndexMap.employeeName !== -1 ? headerIndexMap.employeeName : 1;
  const colDate = headerIndexMap.workDate !== -1 ? headerIndexMap.workDate : 2;
  const colType = headerIndexMap.workType !== -1 ? headerIndexMap.workType : 3;
  const colHours = headerIndexMap.hours !== -1 ? headerIndexMap.hours : 4;
  const colMemo = headerIndexMap.memo !== -1 ? headerIndexMap.memo : 5;

  const workerMapById = new Map<string, Worker>();
  companyWorkers.forEach((w) => workerMapById.set(w.id, w));

  const parsedRows: ParsedOvertimeCsvRow[] = [];
  let matchedCount = 0;
  let needsReviewCount = 0;

  dataRows.forEach((rowCells, rIdx) => {
    const rawRowIndex = hasHeaders ? rIdx + 2 : rIdx + 1; // 1-indexed for display
    const rawEmpId = (rowCells[colEmpId] || '').trim();
    const rawName = (rowCells[colName] || '').trim();
    const rawDate = (rowCells[colDate] || '').trim();
    const rawType = (rowCells[colType] || '').trim();
    const rawHoursStr = (rowCells[colHours] || '').replace(/[^0-9.]/g, '');
    const rawMemo = (rowCells[colMemo] || '').trim();

    // Parse workType
    let workType: OvertimeWorkType = 'OVERTIME';
    if (
      rawType.includes('휴일') ||
      rawType.includes('휴무') ||
      rawType.toUpperCase().includes('HOLIDAY')
    ) {
      workType = 'HOLIDAY';
    }

    const hours = parseFloat(rawHoursStr) || 0;

    // Strict matching by employeeId ONLY (Requirement 3: Never auto-link by name alone)
    let matchStatus: 'MATCHED' | 'NEEDS_REVIEW' = 'NEEDS_REVIEW';
    let matchError: string | undefined = undefined;
    let matchedWorker: Worker | undefined = undefined;

    if (!rawEmpId) {
      matchStatus = 'NEEDS_REVIEW';
      matchError = '근로자 고유 식별자(사번/ID)가 누락되었습니다.';
    } else {
      matchedWorker = workerMapById.get(rawEmpId);
      if (matchedWorker) {
        matchStatus = 'MATCHED';
      } else {
        matchStatus = 'NEEDS_REVIEW';
        matchError = `입력된 사번(${rawEmpId})과 일치하는 회사 소속 근로자가 없습니다.`;
      }
    }

    if (matchStatus === 'MATCHED') {
      matchedCount++;
    } else {
      needsReviewCount++;
    }

    parsedRows.push({
      rawRowIndex,
      employeeId: rawEmpId,
      employeeName: matchedWorker ? matchedWorker.name : rawName || '미지정',
      workDate: rawDate || `${belongingYearMonth}-01`,
      workType,
      hours,
      memo: rawMemo,
      matchStatus,
      matchError,
      matchedWorker,
    });
  });

  return {
    totalRows: parsedRows.length,
    matchedCount,
    needsReviewCount,
    rows: parsedRows,
    headers: firstRow,
  };
}
