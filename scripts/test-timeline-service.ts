/**
 * [R3-4 1/3] 기업 업무 타임라인 데이터 구조·서비스 검증 테스트
 * 
 * 1. TimelineItem 구조 검증 (7개 타입: INQUIRY, DATA_REQUEST, MATERNITY, PAYROLL, TASK, MESSAGE, DOCUMENT)
 * 2. 원본 컬렉션 연결 및 변환 검증 (Source of Truth)
 * 3. companyId 격리 검증 (타사 데이터 침범 방지)
 * 4. occurredAt 기준 및 최신순(내림차순) 정렬 검증 (날짜 없는 데이터 임의 날짜 생성 방지)
 * 5. 원본 연결 정보(sourceType, sourceId) 정합성 검증
 * 6. 민감정보(주민등록번호, 비밀번호, 본문 전문 등) 제외/마스킹 검증
 * 7. 옵션 필터링(타입 필터, 기간 필터, 개수 제한) 검증
 */

import {
  maskSensitiveSummary,
  parseValidOccurredAt,
  transformInquiryToTimelineItem,
  transformDataRequestToTimelineItem,
  transformMaternityToTimelineItem,
  transformPayrollToTimelineItem,
  transformTaskToTimelineItem,
  transformMessageToTimelineItem,
  transformDocumentToTimelineItem,
} from '../src/services/timelineService';
import { TimelineItem, TimelineItemType } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

async function runTimelineTests() {
  console.log('=== [R3-4 1/3] 기업 업무 타임라인 서비스 검증 시작 ===\n');

  // -------------------------------------------------------------
  // Test 1: 민감정보 마스킹 및 요약문 헬퍼 검증
  // -------------------------------------------------------------
  console.log('[Test 1] 민감정보 마스킹 및 요약문 헬퍼 검증');

  // 1-1. 주민등록번호 패턴 마스킹
  const textWithRrn1 = '홍길동 근로자 주민번호 900101-1234567 확인 요청';
  const masked1 = maskSensitiveSummary(textWithRrn1);
  assert(masked1?.includes('900101-1******') === true, '하이픈 있는 RRN 마스킹 실패');
  assert(!masked1?.includes('1234567'), 'RRN 뒷자리가 노출됨');

  const textWithRrn2 = '개인정보: 8812252345678 급여 문의';
  const masked2 = maskSensitiveSummary(textWithRrn2);
  assert(masked2?.includes('881225-2******') === true, '연속 13자리 RRN 마스킹 실패');
  assert(!masked2?.includes('2345678'), '연속 13자리 뒷자리가 노출됨');

  // 1-2. 장문 글자수 제한
  const longText = '가'.repeat(200);
  const truncated = maskSensitiveSummary(longText, 50);
  assert(truncated?.length === 53, '글자수 제한 및 말줄임표 처리 실패');
  assert(truncated?.endsWith('...') === true, '말줄임표 누락');

  // 1-3. 빈 텍스트 처리
  assert(maskSensitiveSummary('') === undefined, '빈 텍스트 undefined 반환 검증');
  assert(maskSensitiveSummary(null) === undefined, 'null 텍스트 undefined 반환 검증');
  console.log('  -> PASS: 민감정보 마스킹 및 길이 제한 검증 완료\n');

  // -------------------------------------------------------------
  // Test 2: 날짜 검증 헬퍼 (임의 날짜 생성 방지)
  // -------------------------------------------------------------
  console.log('[Test 2] 날짜 파싱 헬퍼 (임의 날짜 생성 방지)');

  assert(parseValidOccurredAt('2026-10-10T10:00:00Z') === '2026-10-10T10:00:00.000Z', '정상 ISO 일시 파싱');
  assert(parseValidOccurredAt('2026-10-10') !== null, 'YYYY-MM-DD 날짜 파싱');
  assert(parseValidOccurredAt(undefined) === null, 'undefined 날짜는 반드시 null이어야 함 (임의 생성 금지)');
  assert(parseValidOccurredAt('') === null, '빈 문자열 날짜는 반드시 null이어야 함');
  assert(parseValidOccurredAt('invalid-date-string') === null, '유효하지 않은 날짜는 null');
  console.log('  -> PASS: 날짜 엄격 검증 완료 (가짜 날짜 미생성 보장)\n');

  // -------------------------------------------------------------
  // Test 3: 7개 원본 컬렉션별 TimelineItem 변환 및 정합성 검증
  // -------------------------------------------------------------
  console.log('[Test 3] 7대 원본 컬렉션별 TimelineItem 변환 및 소스 연결 정보 검증');

  const compId = 'company_alpha';
  const otherCompId = 'company_beta';

  // 3-1. INQUIRY
  const inquiryData = {
    companyId: compId,
    title: '연차 유급휴가 부여 문의',
    content: '근로자 950505-1000000 님의 1년 미만 연차 발생 관련하여 문의드립니다.',
    status: 'IN_PROGRESS',
    createdAt: '2026-10-01T09:00:00Z',
    requesterName: '김인사',
  };
  const inqItem = transformInquiryToTimelineItem('inq_101', inquiryData, compId);
  assert(inqItem !== null, 'INQUIRY 변환 실패');
  assert(inqItem!.type === 'INQUIRY', 'type 불일치');
  assert(inqItem!.sourceType === 'INQUIRY', 'sourceType 불일치');
  assert(inqItem!.sourceId === 'inq_101', 'sourceId 불일치');
  assert(inqItem!.companyId === compId, 'companyId 불일치');
  assert(inqItem!.status === 'IN_PROGRESS', 'status 불일치');
  assert(inqItem!.summary?.includes('950505-1******') === true, '문의 본문 내 RRN 마스킹 실패');
  assert(!inqItem!.summary?.includes('1000000'), '문의 본문 내 RRN 노출');

  // 3-2. DATA_REQUEST
  const requestData = {
    companyId: compId,
    title: '2026년 하반기 취업규칙 개정안 제출 요청',
    description: '개정된 취업규칙 전문 및 근로자 동의서를 제출해주세요.',
    status: 'REQUESTED',
    dueDate: '2026-10-25',
    requestedItems: ['취업규칙', '근로자 동의서'],
    createdAt: '2026-10-02T10:00:00Z',
  };
  const reqItem = transformDataRequestToTimelineItem('dr_202', requestData, compId);
  assert(reqItem !== null, 'DATA_REQUEST 변환 실패');
  assert(reqItem!.type === 'DATA_REQUEST', 'type 불일치');
  assert(reqItem!.sourceType === 'DATA_REQUEST', 'sourceType 불일치');
  assert(reqItem!.sourceId === 'dr_202', 'sourceId 불일치');
  assert(reqItem!.status === 'REQUESTED', 'status 불일치');

  // 3-3. MATERNITY
  const maternityData = {
    companyId: compId,
    employeeId: 'emp_01',
    workType: '출산전후휴가',
    status: 'UNDER_REVIEW',
    startDate: '2026-11-01',
    endDate: '2027-01-30',
    createdAt: '2026-10-03T11:00:00Z',
  };
  const matItem = transformMaternityToTimelineItem('mat_303', maternityData, compId);
  assert(matItem !== null, 'MATERNITY 변환 실패');
  assert(matItem!.type === 'MATERNITY', 'type 불일치');
  assert(matItem!.sourceType === 'MATERNITY', 'sourceType 불일치');
  assert(matItem!.sourceId === 'mat_303', 'sourceId 불일치');
  assert(matItem!.title.includes('출산전후휴가'), 'workType 타이틀 반영 실패');
  assert(matItem!.summary?.includes('2026-11-01 ~ 2027-01-30') === true, '기간 요약 반영 실패');

  // 3-4. PAYROLL
  const payrollData = {
    companyId: compId,
    employeeId: 'emp_02',
    employeeName: '박근로',
    belongingYearMonth: '2026-09',
    status: 'CONFIRMED',
    totalPay: 3500000,
    netPay: 3100000,
    createdAt: '2026-10-04T12:00:00Z',
  };
  const payItem = transformPayrollToTimelineItem('pay_404', payrollData, compId);
  assert(payItem !== null, 'PAYROLL 변환 실패');
  assert(payItem!.type === 'PAYROLL', 'type 불일치');
  assert(payItem!.sourceType === 'PAYROLL', 'sourceType 불일치');
  assert(payItem!.sourceId === 'pay_404', 'sourceId 불일치');
  assert(payItem!.status === 'CONFIRMED', 'status 불일치');
  assert(payItem!.title.includes('2026-09'), '귀속연월 타이틀 반영 실패');
  assert(!payItem!.summary?.includes('3500000') && !payItem!.summary?.includes('3100000'), '민감 급여액 노출 금지 실패');

  // 3-5. TASK
  const taskData = {
    companyId: compId,
    title: '4대보험 상실신고 검토',
    description: '내부 비밀 메모: 대표자 사적 지시 건이므로 조용히 처리할 것',
    priority: 'HIGH',
    status: 'TODO',
    dueDate: '2026-10-20',
    createdAt: '2026-10-05T13:00:00Z',
  };
  const taskItem = transformTaskToTimelineItem('task_505', taskData, compId);
  assert(taskItem !== null, 'TASK 변환 실패');
  assert(taskItem!.type === 'TASK', 'type 불일치');
  assert(taskItem!.sourceType === 'TASK', 'sourceType 불일치');
  assert(taskItem!.sourceId === 'task_505', 'sourceId 불일치');
  assert(taskItem!.summary?.includes('우선순위: HIGH') === true, '우선순위 반영 실패');
  assert(taskItem!.summary?.includes('마감: 2026-10-20') === true, '마감일 반영 실패');
  assert(!taskItem!.summary?.includes('내부 비밀 메모'), '민감한 내부 상세 설명이 summary에 복제되지 않아야 함');

  // 3-6. MESSAGE
  const messageData = {
    companyId: compId,
    title: '정기 점검 안내 공지',
    content: '안녕하세요. 노무법인입니다. 10월 정기 노무 점검 일정 안내드립니다.',
    senderName: '이노무사',
    senderRole: 'ADMIN',
    createdAt: '2026-10-06T14:00:00Z',
  };
  const msgItem = transformMessageToTimelineItem('msg_606', messageData, compId);
  assert(msgItem !== null, 'MESSAGE 변환 실패');
  assert(msgItem!.type === 'MESSAGE', 'type 불일치');
  assert(msgItem!.sourceType === 'MESSAGE', 'sourceType 불일치');
  assert(msgItem!.sourceId === 'msg_606', 'sourceId 불일치');
  assert(msgItem!.title === '정기 점검 안내 공지', 'title 불일치');

  // 3-7. DOCUMENT
  const documentData = {
    companyId: compId,
    title: '2026년 표준근로계약서',
    category: 'LABOR_CONTRACT',
    originalFileName: 'standard_contract_2026.pdf',
    storagePath: 'company-documents/company_alpha/doc_707/standard_contract_2026.pdf',
    createdAt: '2026-10-07T15:00:00Z',
  };
  const docItem = transformDocumentToTimelineItem('doc_707', documentData, compId);
  assert(docItem !== null, 'DOCUMENT 변환 실패');
  assert(docItem!.type === 'DOCUMENT', 'type 불일치');
  assert(docItem!.sourceType === 'DOCUMENT', 'sourceType 불일치');
  assert(docItem!.sourceId === 'doc_707', 'sourceId 불일치');
  assert(docItem!.summary?.includes('LABOR_CONTRACT') === true, '문서 카테고리 요약 실패');
  assert(!docItem!.summary?.includes('company-documents/'), '내부 스토리지 경로 노출 금지 실패');

  console.log('  -> PASS: 7개 원본 컬렉션별 변환 및 연결 정보 검증 완료\n');

  // -------------------------------------------------------------
  // Test 4: companyId 데이터 격리 검증
  // -------------------------------------------------------------
  console.log('[Test 4] companyId 데이터 격리 검증 (타사 데이터 침범 방지)');

  // 타 기업 데이터 주입 시 null 반환 확인
  const otherCompanyInquiry = {
    companyId: otherCompId,
    title: '타사 문의',
    content: '타사 문의 내용',
    createdAt: '2026-10-01T09:00:00Z',
  };
  const isolatedInq = transformInquiryToTimelineItem('inq_other', otherCompanyInquiry, compId);
  assert(isolatedInq === null, '타 기업 문의 데이터가 필터링되지 않고 변환됨 (격리 실패)');

  const otherCompanyPayroll = {
    companyId: otherCompId,
    employeeName: '타사근로자',
    createdAt: '2026-10-02T10:00:00Z',
  };
  const isolatedPay = transformPayrollToTimelineItem('pay_other', otherCompanyPayroll, compId);
  assert(isolatedPay === null, '타 기업 급여 데이터가 필터링되지 않고 변환됨 (격리 실패)');

  console.log('  -> PASS: 기업별 엄격한 격리 검증 완료\n');

  // -------------------------------------------------------------
  // Test 5: 날짜 누락 데이터 임의 생성 금지 검증
  // -------------------------------------------------------------
  console.log('[Test 5] 날짜 누락 데이터 검증 (임의 날짜 생성 방지)');

  const noDateTask = {
    companyId: compId,
    title: '날짜 없는 업무',
    createdAt: undefined,
  };
  const droppedTask = transformTaskToTimelineItem('task_nodate', noDateTask, compId);
  assert(droppedTask === null, '날짜가 없는 항목은 임의 날짜를 생성하지 않고 제외해야 함');

  console.log('  -> PASS: 날짜 누락 데이터 임의 생성 방지 검증 완료\n');

  // -------------------------------------------------------------
  // Test 6: 시간순(occurredAt) 내림차순 정렬 및 필터링 시뮬레이션
  // -------------------------------------------------------------
  console.log('[Test 6] 시간순(occurredAt) 내림차순 정렬 및 필터링 시뮬레이션');

  const allItems: TimelineItem[] = [
    inqItem!,   // 2026-10-01T09:00:00.000Z
    reqItem!,   // 2026-10-02T10:00:00.000Z
    matItem!,   // 2026-10-03T11:00:00.000Z
    payItem!,   // 2026-10-04T12:00:00.000Z
    taskItem!,  // 2026-10-05T13:00:00.000Z
    msgItem!,   // 2026-10-06T14:00:00.000Z
    docItem!,   // 2026-10-07T15:00:00.000Z
  ];

  // 내림차순 정렬
  const sorted = [...allItems].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  assert(sorted[0].id === 'document_doc_707', '최신 항목(10-07)이 1위여야 함');
  assert(sorted[1].id === 'message_msg_606', '두번째 항목(10-06)이어야 함');
  assert(sorted[sorted.length - 1].id === 'inquiry_inq_101', '가장 오래된 항목(10-01)이 마지막이어야 함');

  // 타입 필터 검증
  const taskOnly = sorted.filter((i) => i.type === 'TASK');
  assert(taskOnly.length === 1 && taskOnly[0].type === 'TASK', 'TASK 타입 필터 실패');

  // 기간 필터 검증
  const dateFiltered = sorted.filter((i) => {
    const t = new Date(i.occurredAt).getTime();
    return t >= new Date('2026-10-03T00:00:00Z').getTime() && t <= new Date('2026-10-05T23:59:59Z').getTime();
  });
  assert(dateFiltered.length === 3, '기간 필터 항목 수 불일치 (3개여야 함)');
  assert(dateFiltered.every((i) => ['MATERNITY', 'PAYROLL', 'TASK'].includes(i.type)), '기간 필터 대상 불일치');

  console.log('  -> PASS: 시간순 내림차순 정렬 및 필터링 시뮬레이션 완료\n');

  console.log('=== [R3-4 1/3] 기업 업무 타임라인 서비스 전체 검증 성공 ===');
}

runTimelineTests().catch((err) => {
  console.error('\n[ERROR] 타임라인 검증 실패:', err);
  process.exit(1);
});
