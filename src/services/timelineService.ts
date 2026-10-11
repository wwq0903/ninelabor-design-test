import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  TimelineItem,
  TimelineItemType,
  TimelineFilterOptions,
} from '../types';

/**
 * [R3-4 1/3] 주민등록번호 등 민감정보 마스킹 및 요약문 길이 제한 헬퍼
 * - 주민등록번호 13자리 패턴(하이픈 포함/미포함) 마스킹
 * - 최대 글자수 제한(기본 80자)을 두어 장문 본문 복제 방지
 */
export function maskSensitiveSummary(text?: string | null, maxLength: number = 80): string | undefined {
  if (!text || typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // 1. 주민등록번호 패턴 마스킹: 6자리 + 구분자? + [1-8] + 6자리
  let sanitized = trimmed.replace(
    /\b(\d{6})\s*[-–—/._\s]?\s*([1-8])\d{6}\b/g,
    '$1-$2******'
  );

  // 2. 최대 길이 제한 및 말줄임표
  if (sanitized.length > maxLength) {
    return sanitized.slice(0, maxLength) + '...';
  }
  return sanitized;
}

/**
 * [R3-4 1/3] 날짜 문자열 검증 헬퍼
 * - 유효한 날짜(ISO 또는 Date 파싱 가능)인 경우에만 ISO 문자열 반환
 * - 날짜가 없거나 유효하지 않은 경우 null 반환 (임의 날짜 생성 절대 금지)
 */
export function parseValidOccurredAt(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  if (isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

/**
 * 1. INQUIRY (inquiries) -> TimelineItem 변환
 */
export function transformInquiryToTimelineItem(
  id: string,
  data: any,
  targetCompanyId: string
): TimelineItem | null {
  if (!data || data.companyId !== targetCompanyId) return null;
  const occurredAt = parseValidOccurredAt(data.createdAt);
  if (!occurredAt) return null; // 날짜 없는 데이터 제외

  const title = maskSensitiveSummary(data.title, 50) || '통합 문의';
  const summary = maskSensitiveSummary(data.content, 80);

  return {
    id: `inquiry_${id}`,
    companyId: targetCompanyId,
    type: 'INQUIRY',
    occurredAt,
    title,
    summary,
    status: data.status || 'RECEIVED',
    sourceId: id,
    sourceType: 'INQUIRY',
    metadata: {
      requesterName: data.requesterName,
      authorName: data.authorName,
      status: data.status,
    },
  };
}

/**
 * 2. DATA_REQUEST (data_requests) -> TimelineItem 변환
 */
export function transformDataRequestToTimelineItem(
  id: string,
  data: any,
  targetCompanyId: string
): TimelineItem | null {
  if (!data || data.companyId !== targetCompanyId) return null;
  const occurredAt = parseValidOccurredAt(data.createdAt);
  if (!occurredAt) return null;

  const title = maskSensitiveSummary(data.title, 50) || '자료 요청';
  const requestedItemsStr = Array.isArray(data.requestedItems) && data.requestedItems.length > 0
    ? `요청 항목: ${data.requestedItems.slice(0, 3).join(', ')}${data.requestedItems.length > 3 ? ' 외' : ''}`
    : undefined;
  const summary = maskSensitiveSummary(data.description, 80) || requestedItemsStr;

  return {
    id: `data_request_${id}`,
    companyId: targetCompanyId,
    type: 'DATA_REQUEST',
    occurredAt,
    title,
    summary,
    status: data.status || 'REQUESTED',
    sourceId: id,
    sourceType: 'DATA_REQUEST',
    metadata: {
      dueDate: data.dueDate,
      status: data.status,
    },
  };
}

/**
 * 3. MATERNITY (maternity_cases) -> TimelineItem 변환
 */
export function transformMaternityToTimelineItem(
  id: string,
  data: any,
  targetCompanyId: string
): TimelineItem | null {
  if (!data || data.companyId !== targetCompanyId) return null;
  const occurredAt = parseValidOccurredAt(data.createdAt) || parseValidOccurredAt(data.applicationDate);
  if (!occurredAt) return null;

  const workType = data.workType || '신청';
  const title = `모성보호 신청 (${workType})`;
  const summary = data.startDate && data.endDate
    ? `기간: ${data.startDate} ~ ${data.endDate}`
    : undefined;

  return {
    id: `maternity_${id}`,
    companyId: targetCompanyId,
    type: 'MATERNITY',
    occurredAt,
    title,
    summary,
    status: data.status || 'SUBMITTED',
    sourceId: id,
    sourceType: 'MATERNITY',
    metadata: {
      employeeId: data.employeeId,
      workType: data.workType,
      startDate: data.startDate,
      endDate: data.endDate,
    },
  };
}

/**
 * 4. PAYROLL (payrolls) -> TimelineItem 변환
 * ※ 급여액, 세부 실수령액, 계좌번호 등 민감 재무 정보는 복제하지 않음
 */
export function transformPayrollToTimelineItem(
  id: string,
  data: any,
  targetCompanyId: string
): TimelineItem | null {
  if (!data || data.companyId !== targetCompanyId) return null;
  const occurredAt =
    parseValidOccurredAt(data.createdAt) ||
    parseValidOccurredAt(data.paymentDate) ||
    parseValidOccurredAt(data.confirmedAt);
  if (!occurredAt) return null;

  const yearMonth = data.belongingYearMonth || '';
  const empName = data.employeeName ? ` (${data.employeeName})` : '';
  const title = `${yearMonth} 급여${empName}`.trim() || '급여대장';

  let statusLabel = '작성중';
  if (data.status === 'PAID') statusLabel = '지급완료';
  else if (data.status === 'CONFIRMED') statusLabel = '확정';

  const summary = `상태: ${statusLabel}`;

  return {
    id: `payroll_${id}`,
    companyId: targetCompanyId,
    type: 'PAYROLL',
    occurredAt,
    title,
    summary,
    status: data.status || 'DRAFT',
    sourceId: id,
    sourceType: 'PAYROLL',
    metadata: {
      employeeId: data.employeeId,
      employeeName: data.employeeName,
      yearMonth: data.belongingYearMonth,
    },
  };
}

/**
 * 5. TASK (tasks) -> TimelineItem 변환
 * ※ 내부 상세 설명(description) 전체는 복제하지 않고 우선순위/마감일 메타만 요약
 */
export function transformTaskToTimelineItem(
  id: string,
  data: any,
  targetCompanyId: string
): TimelineItem | null {
  if (!data || data.companyId !== targetCompanyId) return null;
  const occurredAt = parseValidOccurredAt(data.createdAt);
  if (!occurredAt) return null;

  const title = maskSensitiveSummary(data.title, 50) || '할 일';
  const priority = data.priority || 'NORMAL';
  const dueDateStr = data.dueDate ? ` / 마감: ${data.dueDate}` : '';
  const summary = `우선순위: ${priority}${dueDateStr}`;

  return {
    id: `task_${id}`,
    companyId: targetCompanyId,
    type: 'TASK',
    occurredAt,
    title,
    summary,
    status: data.status || 'TODO',
    sourceId: id,
    sourceType: 'TASK',
    metadata: {
      priority: data.priority,
      dueDate: data.dueDate,
      workerId: data.workerId,
    },
  };
}

/**
 * 6. MESSAGE (messages) -> TimelineItem 변환
 */
export function transformMessageToTimelineItem(
  id: string,
  data: any,
  targetCompanyId: string
): TimelineItem | null {
  if (!data || data.companyId !== targetCompanyId) return null;
  const occurredAt = parseValidOccurredAt(data.createdAt);
  if (!occurredAt) return null;

  const title = maskSensitiveSummary(data.title, 50) || '메시지 발신';
  const summary = maskSensitiveSummary(data.content, 80);

  return {
    id: `message_${id}`,
    companyId: targetCompanyId,
    type: 'MESSAGE',
    occurredAt,
    title,
    summary,
    status: 'SENT',
    sourceId: id,
    sourceType: 'MESSAGE',
    metadata: {
      senderName: data.senderName,
      senderRole: data.senderRole,
    },
  };
}

/**
 * 7. DOCUMENT (company_documents) -> TimelineItem 변환
 * ※ 실파일 데이터/Storage 경로/다운로드 URL은 복제하지 않고 분류/파일명만 보관
 */
export function transformDocumentToTimelineItem(
  id: string,
  data: any,
  targetCompanyId: string
): TimelineItem | null {
  if (!data || data.companyId !== targetCompanyId) return null;
  const occurredAt = parseValidOccurredAt(data.createdAt);
  if (!occurredAt) return null;

  const title = maskSensitiveSummary(data.title, 50) || data.originalFileName || '기업 문서';
  const category = data.category || '기타';
  const summary = `문서 분류: ${category}${data.originalFileName ? ` (${data.originalFileName})` : ''}`;

  return {
    id: `document_${id}`,
    companyId: targetCompanyId,
    type: 'DOCUMENT',
    occurredAt,
    title,
    summary,
    status: data.category || 'OTHER',
    sourceId: id,
    sourceType: 'DOCUMENT',
    metadata: {
      category: data.category,
      originalFileName: data.originalFileName,
    },
  };
}

/**
 * [R3-4 1/3] 기업 업무 타임라인 서비스 (timelineService)
 * 
 * - 새로운 타임라인 컬렉션에 복제 저장하지 않고 원본 컬렉션을 실시간 조회하여 집계
 * - 전달받은 companyId에 속하는 데이터만 엄격히 조회 및 변환 (기업별 데이터 격리)
 * - 원본의 createdAt/발생시점을 기준으로 occurredAt 내림차순(최신순) 정렬
 * - 모든 항목에 sourceType, sourceId 유지 (추후 원본 업무 보기 지원)
 * - 민감정보(주민등록번호, 비밀번호, 본문 전문, 급여 세부금액 등) 제외/마스킹
 */
export const timelineService = {
  /**
   * 지정 기업의 모든 주요 업무 이력을 시간순 통합 타임라인으로 조회
   */
  async getCompanyTimeline(
    companyId: string,
    options?: TimelineFilterOptions
  ): Promise<TimelineItem[]> {
    if (!companyId || !companyId.trim()) {
      return [];
    }
    const cleanCompanyId = companyId.trim();

    // 조회 대상 타입 필터링 여부 확인
    const requestedTypes = options?.types && options.types.length > 0 ? options.types : null;
    const shouldFetch = (type: TimelineItemType) => !requestedTypes || requestedTypes.includes(type);

    // 원본 컬렉션 병렬 조회
    const [
      inquiriesRes,
      dataRequestsRes,
      maternityRes,
      payrollsRes,
      tasksRes,
      messagesRes,
      documentsRes,
    ] = await Promise.allSettled([
      // 1. INQUIRY
      shouldFetch('INQUIRY')
        ? getDocs(query(collection(db, 'inquiries'), where('companyId', '==', cleanCompanyId)))
        : Promise.resolve(null),

      // 2. DATA_REQUEST
      shouldFetch('DATA_REQUEST')
        ? getDocs(query(collection(db, 'data_requests'), where('companyId', '==', cleanCompanyId)))
        : Promise.resolve(null),

      // 3. MATERNITY
      shouldFetch('MATERNITY')
        ? getDocs(query(collection(db, 'maternity_cases'), where('companyId', '==', cleanCompanyId)))
        : Promise.resolve(null),

      // 4. PAYROLL
      shouldFetch('PAYROLL')
        ? getDocs(query(collection(db, 'payrolls'), where('companyId', '==', cleanCompanyId)))
        : Promise.resolve(null),

      // 5. TASK
      shouldFetch('TASK')
        ? getDocs(query(collection(db, 'tasks'), where('companyId', '==', cleanCompanyId)))
        : Promise.resolve(null),

      // 6. MESSAGE
      shouldFetch('MESSAGE')
        ? getDocs(query(collection(db, 'messages'), where('companyId', '==', cleanCompanyId)))
        : Promise.resolve(null),

      // 7. DOCUMENT
      shouldFetch('DOCUMENT')
        ? getDocs(query(collection(db, 'company_documents'), where('companyId', '==', cleanCompanyId)))
        : Promise.resolve(null),
    ]);

    const items: TimelineItem[] = [];

    // 1. INQUIRY 수합
    if (inquiriesRes.status === 'fulfilled' && inquiriesRes.value) {
      for (const snap of inquiriesRes.value.docs) {
        const item = transformInquiryToTimelineItem(snap.id, snap.data(), cleanCompanyId);
        if (item) items.push(item);
      }
    } else if (inquiriesRes.status === 'rejected') {
      console.warn('timelineService INQUIRY fetch failed:', inquiriesRes.reason);
    }

    // 2. DATA_REQUEST 수합
    if (dataRequestsRes.status === 'fulfilled' && dataRequestsRes.value) {
      for (const snap of dataRequestsRes.value.docs) {
        const item = transformDataRequestToTimelineItem(snap.id, snap.data(), cleanCompanyId);
        if (item) items.push(item);
      }
    } else if (dataRequestsRes.status === 'rejected') {
      console.warn('timelineService DATA_REQUEST fetch failed:', dataRequestsRes.reason);
    }

    // 3. MATERNITY 수합
    if (maternityRes.status === 'fulfilled' && maternityRes.value) {
      for (const snap of maternityRes.value.docs) {
        const item = transformMaternityToTimelineItem(snap.id, snap.data(), cleanCompanyId);
        if (item) items.push(item);
      }
    } else if (maternityRes.status === 'rejected') {
      console.warn('timelineService MATERNITY fetch failed:', maternityRes.reason);
    }

    // 4. PAYROLL 수합
    if (payrollsRes.status === 'fulfilled' && payrollsRes.value) {
      for (const snap of payrollsRes.value.docs) {
        const item = transformPayrollToTimelineItem(snap.id, snap.data(), cleanCompanyId);
        if (item) items.push(item);
      }
    } else if (payrollsRes.status === 'rejected') {
      console.warn('timelineService PAYROLL fetch failed:', payrollsRes.reason);
    }

    // 5. TASK 수합
    if (tasksRes.status === 'fulfilled' && tasksRes.value) {
      for (const snap of tasksRes.value.docs) {
        const item = transformTaskToTimelineItem(snap.id, snap.data(), cleanCompanyId);
        if (item) items.push(item);
      }
    } else if (tasksRes.status === 'rejected') {
      console.warn('timelineService TASK fetch failed:', tasksRes.reason);
    }

    // 6. MESSAGE 수합
    if (messagesRes.status === 'fulfilled' && messagesRes.value) {
      for (const snap of messagesRes.value.docs) {
        const item = transformMessageToTimelineItem(snap.id, snap.data(), cleanCompanyId);
        if (item) items.push(item);
      }
    } else if (messagesRes.status === 'rejected') {
      console.warn('timelineService MESSAGE fetch failed:', messagesRes.reason);
    }

    // 7. DOCUMENT 수합
    if (documentsRes.status === 'fulfilled' && documentsRes.value) {
      for (const snap of documentsRes.value.docs) {
        const item = transformDocumentToTimelineItem(snap.id, snap.data(), cleanCompanyId);
        if (item) items.push(item);
      }
    } else if (documentsRes.status === 'rejected') {
      console.warn('timelineService DOCUMENT fetch failed:', documentsRes.reason);
    }

    // 기간 필터 적용 (options.startDate / options.endDate)
    let filtered = items;
    if (options?.startDate) {
      const startTime = new Date(options.startDate).getTime();
      if (!isNaN(startTime)) {
        filtered = filtered.filter((i) => new Date(i.occurredAt).getTime() >= startTime);
      }
    }
    if (options?.endDate) {
      const endTime = new Date(options.endDate).getTime();
      if (!isNaN(endTime)) {
        filtered = filtered.filter((i) => new Date(i.occurredAt).getTime() <= endTime);
      }
    }

    // [R3-4 1/3] 최신 항목이 위로 오도록 occurredAt 내림차순 정렬
    filtered.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    // 개수 제한 적용 (options.limit)
    if (options?.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  },
};
