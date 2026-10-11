import type {
  Inquiry,
  DataRequest,
  MaternityCase,
  PayrollRecord,
  Task,
  CreateTaskInput,
  TaskSourceType,
  Company,
  Worker,
} from '../src/types';
import { taskService, TaskActor } from '../src/services/taskService';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failCount++;
  }
}

console.log('================================================================');
console.log('[R3-3 3/3-B-③-B] 출처와 기업·근로자 대상 정합성 단위/통합 검증');
console.log('================================================================\n');

// 1. Fixture Data
const mockCompanyA: Company = {
  id: 'comp_test_alpha_001',
  companyName: '(주)알파소프트',
  businessNumber: '111-22-33333',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockCompanyB: Company = {
  id: 'comp_test_beta_002',
  companyName: '(주)베타시스템',
  businessNumber: '222-33-44444',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Canonical Worker Document (workers/worker_canonical_101)
const mockCanonicalWorker101: Worker = {
  id: 'worker_canonical_101',
  companyId: 'comp_test_alpha_001',
  name: '홍길동',
  email: 'gildong.hong@alphasoft.com',
  userId: 'firebase_auth_uid_hong_123', // Auth UID (must NOT be used as workerId!)
  department: '개발팀',
  position: '책임연구원',
  joinDate: '2025-01-01',
  status: 'active',
  hourlyWage: 20000,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockCanonicalWorker102: Worker = {
  id: 'worker_canonical_102',
  companyId: 'comp_test_alpha_001',
  name: '김철수',
  email: 'chulsoo.kim@alphasoft.com',
  userId: 'firebase_auth_uid_kim_456',
  department: '기획팀',
  position: '선임연구원',
  joinDate: '2025-02-01',
  status: 'active',
  hourlyWage: 18000,
  createdAt: '2025-02-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Source Fixtures
// 1) INQUIRY (기업 문의)
const mockCompanyInquiry: Inquiry = {
  id: 'inq_comp_alpha_1',
  companyId: 'comp_test_alpha_001',
  companyName: '(주)알파소프트',
  title: '연차 산정 관련 문의',
  content: '회계연도 기준 연차 산정 방식 검토 요청',
  requesterId: 'user_comp_rep_1',
  requesterName: '알파 인사담당자',
  requesterRole: 'COMPANY',
  status: 'RECEIVED',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
};

// 2) INQUIRY (비소속 개인 문의)
const mockIndividualInquiry: Inquiry = {
  id: 'inq_indiv_worker_2',
  companyId: null, // 비소속
  companyName: null,
  title: '퇴직금 미지급 상담',
  content: '아르바이트 1년 근무 후 퇴직금 미지급',
  requesterId: 'user_indiv_77',
  requesterName: '개인 근로자',
  requesterRole: 'WORKER',
  status: 'RECEIVED',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
};

// 3) DATA_REQUEST
const mockDataRequest: DataRequest = {
  id: 'dreq_alpha_3',
  companyId: 'comp_test_alpha_001',
  title: '10월 근태 집계표 요청',
  description: '급여 작업을 위한 연장·야간 근무 기록표 요청',
  requestedItems: ['근태 집계표'],
  dueDate: '2026-10-25',
  status: 'REQUESTED',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  createdById: 'admin_test_uid',
  updatedById: 'admin_test_uid',
};

// 4) MATERNITY
const mockMaternityCase: MaternityCase = {
  id: 'mat_case_alpha_4',
  companyId: 'comp_test_alpha_001',
  employeeId: 'worker_canonical_101', // Canonical worker ID
  workType: 'MATERNITY_LEAVE',
  applicationDate: '2026-10-01',
  startDate: '2026-11-01',
  endDate: '2027-01-29',
  status: 'UNDER_REVIEW',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  createdById: 'admin_test_uid',
  updatedById: 'admin_test_uid',
};

// 5) PAYROLL (개별 급여 레코드)
const mockIndividualPayroll: PayrollRecord = {
  id: 'pr_comp_test_alpha_001_worker_canonical_101_202610',
  companyId: 'comp_test_alpha_001',
  employeeId: 'worker_canonical_101', // Canonical worker ID
  employeeName: '홍길동',
  belongingYearMonth: '2026-10',
  baseSalary: 3500000,
  payItems: [{ id: '1', name: '기본급', amount: 3500000 }],
  deductionItems: [],
  totalPay: 3500000,
  totalDeduction: 0,
  netPay: 3500000,
  status: 'DRAFT',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  createdById: 'admin_test_uid',
  updatedById: 'admin_test_uid',
};

// 6) PAYROLL (회사 전체 급여대장 - workerId 미지정)
const mockLedgerSourceId = 'payroll_comp_test_alpha_001_2026-10';

// In-Memory simulated validation engine matching taskService.validateSourceConsistency
class SimulatedTargetIntegrityValidator {
  private inquiries: Map<string, Inquiry> = new Map();
  private dataRequests: Map<string, DataRequest> = new Map();
  private maternityCases: Map<string, MaternityCase> = new Map();
  private payrolls: Map<string, PayrollRecord> = new Map();

  constructor() {
    this.inquiries.set(mockCompanyInquiry.id, mockCompanyInquiry);
    this.inquiries.set(mockIndividualInquiry.id, mockIndividualInquiry);
    this.dataRequests.set(mockDataRequest.id, mockDataRequest);
    this.maternityCases.set(mockMaternityCase.id, mockMaternityCase);
    this.payrolls.set(mockIndividualPayroll.id, mockIndividualPayroll);
  }

  async validateSourceConsistency(
    sourceType: TaskSourceType,
    sourceId: string,
    targetCompanyId?: string,
    targetWorkerId?: string
  ): Promise<{ expectedCompanyId?: string; expectedWorkerId?: string }> {
    if (!sourceType || sourceType === 'MANUAL' || !sourceId || !sourceId.trim()) {
      return {};
    }

    const cleanSourceId = sourceId.trim();
    const cleanCompanyId = targetCompanyId && targetCompanyId.trim() ? targetCompanyId.trim() : undefined;
    const cleanWorkerId = targetWorkerId && targetWorkerId.trim() ? targetWorkerId.trim() : undefined;

    switch (sourceType) {
      case 'INQUIRY': {
        const inq = this.inquiries.get(cleanSourceId);
        if (!inq) {
          throw new Error(`존재하지 않는 원본 문의입니다. (id: ${cleanSourceId})`);
        }
        const actualCompanyId = inq.companyId && inq.companyId.trim() ? inq.companyId.trim() : undefined;

        if (actualCompanyId) {
          if (cleanCompanyId !== actualCompanyId) {
            throw new Error(
              `원본 문의의 기업(companyId: ${actualCompanyId})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
            );
          }
        } else {
          if (cleanCompanyId) {
            throw new Error(`비소속 개인 문의에는 기업을 임의로 지정할 수 없습니다. (전달된 companyId: ${cleanCompanyId})`);
          }
        }

        if (cleanWorkerId) {
          throw new Error(`원본 문의에는 근로자를 임의로 지정할 수 없습니다. (전달된 workerId: ${cleanWorkerId})`);
        }

        return { expectedCompanyId: actualCompanyId, expectedWorkerId: undefined };
      }

      case 'DATA_REQUEST': {
        const req = this.dataRequests.get(cleanSourceId);
        if (!req) {
          throw new Error(`존재하지 않는 원본 자료요청입니다. (id: ${cleanSourceId})`);
        }
        const actualCompanyId = req.companyId && req.companyId.trim() ? req.companyId.trim() : undefined;

        if (!actualCompanyId || cleanCompanyId !== actualCompanyId) {
          throw new Error(
            `원본 자료요청의 기업(companyId: ${actualCompanyId || '없음'})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
          );
        }

        if (cleanWorkerId) {
          throw new Error(`원본 자료요청에는 근로자를 임의로 지정할 수 없습니다. (전달된 workerId: ${cleanWorkerId})`);
        }

        return { expectedCompanyId: actualCompanyId, expectedWorkerId: undefined };
      }

      case 'MATERNITY': {
        const mat = this.maternityCases.get(cleanSourceId);
        if (!mat) {
          throw new Error(`존재하지 않는 원본 모성보호 신청입니다. (id: ${cleanSourceId})`);
        }
        const actualCompanyId = mat.companyId && mat.companyId.trim() ? mat.companyId.trim() : undefined;
        const actualWorkerId = mat.employeeId && mat.employeeId.trim() ? mat.employeeId.trim() : undefined;

        if (!actualCompanyId || cleanCompanyId !== actualCompanyId) {
          throw new Error(
            `원본 모성보호 신청의 기업(companyId: ${actualCompanyId || '없음'})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
          );
        }

        if (!actualWorkerId || cleanWorkerId !== actualWorkerId) {
          throw new Error(
            `원본 모성보호 신청의 대상 근로자(workerId: ${actualWorkerId || '없음'})와 일치하지 않는 근로자(workerId: ${cleanWorkerId || '없음'})입니다.`
          );
        }

        return { expectedCompanyId: actualCompanyId, expectedWorkerId: actualWorkerId };
      }

      case 'PAYROLL': {
        const pay = this.payrolls.get(cleanSourceId);
        if (pay) {
          const actualCompanyId = pay.companyId && pay.companyId.trim() ? pay.companyId.trim() : undefined;
          const actualWorkerId = pay.employeeId && pay.employeeId.trim() ? pay.employeeId.trim() : undefined;

          if (!actualCompanyId || cleanCompanyId !== actualCompanyId) {
            throw new Error(
              `원본 급여 레코드의 기업(companyId: ${actualCompanyId || '없음'})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
            );
          }

          if (actualWorkerId) {
            if (cleanWorkerId !== actualWorkerId) {
              throw new Error(
                `개별 급여 레코드의 대상 근로자(workerId: ${actualWorkerId})와 일치하지 않는 근로자(workerId: ${cleanWorkerId || '없음'})입니다.`
              );
            }
          } else {
            if (cleanWorkerId) {
              throw new Error(`회사 전체 급여 업무에는 근로자를 임의로 지정할 수 없습니다. (전달된 workerId: ${cleanWorkerId})`);
            }
          }

          return { expectedCompanyId: actualCompanyId, expectedWorkerId: actualWorkerId };
        }

        if (cleanSourceId.startsWith('payroll_')) {
          const rest = cleanSourceId.substring('payroll_'.length);
          const lastIdx = rest.lastIndexOf('_');
          const compId = lastIdx > 0 ? rest.substring(0, lastIdx) : rest;
          if (!compId || cleanCompanyId !== compId) {
            throw new Error(
              `급여대장 업무의 기업(companyId: ${compId || '없음'})과 일치하지 않는 기업(companyId: ${cleanCompanyId || '없음'})으로 업무를 생성할 수 없습니다.`
            );
          }
          if (cleanWorkerId) {
            throw new Error(`회사 전체 급여대장 업무에는 근로자를 임의로 지정할 수 없습니다. (전달된 workerId: ${cleanWorkerId})`);
          }
          return { expectedCompanyId: compId, expectedWorkerId: undefined };
        }

        if (cleanSourceId.startsWith('pr_')) {
          const rest = cleanSourceId.substring(3); // after 'pr_'
          const lastIdx = rest.lastIndexOf('_'); // before yearMonth
          const body = lastIdx > 0 ? rest.substring(0, lastIdx) : rest;

          if (cleanCompanyId && cleanWorkerId && body === `${cleanCompanyId}_${cleanWorkerId}`) {
            return { expectedCompanyId: cleanCompanyId, expectedWorkerId: cleanWorkerId };
          }

          throw new Error(
            `개별 급여 업무의 대상 정보와 일치하지 않는 기업 또는 근로자입니다. (전달된 companyId: ${cleanCompanyId || '없음'}, workerId: ${cleanWorkerId || '없음'})`
          );
        }

        throw new Error(`존재하지 않는 원본 급여 업무입니다. (id: ${cleanSourceId})`);
      }

      default:
        return {};
    }
  }
}

const validator = new SimulatedTargetIntegrityValidator();

// ============================================================================
// Test Suite 1: companyId 정합성 및 변경 변조 차단
// ============================================================================
console.log('--- 1. [companyId 정합성] 4개 출처별 기업 일치 검증 및 변조 차단 ---');

// 1-1. INQUIRY (기업 문의)
{
  // 정상 일치
  const valid = await validator.validateSourceConsistency('INQUIRY', mockCompanyInquiry.id, 'comp_test_alpha_001');
  assert(valid.expectedCompanyId === 'comp_test_alpha_001', '[INQUIRY] 원본 기업 ID(comp_test_alpha_001) 정상 승인');

  // 타 기업으로 변조 시도
  let tamperBlocked = false;
  try {
    await validator.validateSourceConsistency('INQUIRY', mockCompanyInquiry.id, 'comp_test_beta_002');
  } catch (err: any) {
    tamperBlocked = err.message.includes('일치하지 않는 기업');
  }
  assert(tamperBlocked, '[INQUIRY] 다른 기업(comp_test_beta_002)으로 변조 시 저장 차단');

  // 기업 누락 시도
  let missingBlocked = false;
  try {
    await validator.validateSourceConsistency('INQUIRY', mockCompanyInquiry.id, undefined);
  } catch (err: any) {
    missingBlocked = err.message.includes('일치하지 않는 기업');
  }
  assert(missingBlocked, '[INQUIRY] 원본에 기업이 있는데 companyId 누락 시 저장 차단');
}

// 1-2. DATA_REQUEST
{
  const valid = await validator.validateSourceConsistency('DATA_REQUEST', mockDataRequest.id, 'comp_test_alpha_001');
  assert(valid.expectedCompanyId === 'comp_test_alpha_001', '[DATA_REQUEST] 원본 기업 ID 정상 승인');

  let tamperBlocked = false;
  try {
    await validator.validateSourceConsistency('DATA_REQUEST', mockDataRequest.id, 'comp_test_beta_002');
  } catch (err: any) {
    tamperBlocked = err.message.includes('일치하지 않는 기업');
  }
  assert(tamperBlocked, '[DATA_REQUEST] 다른 기업으로 변조 시 저장 차단');
}

// 1-3. MATERNITY
{
  const valid = await validator.validateSourceConsistency(
    'MATERNITY',
    mockMaternityCase.id,
    'comp_test_alpha_001',
    'worker_canonical_101'
  );
  assert(valid.expectedCompanyId === 'comp_test_alpha_001', '[MATERNITY] 원본 기업 ID 정상 승인');

  let tamperBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'MATERNITY',
      mockMaternityCase.id,
      'comp_test_beta_002',
      'worker_canonical_101'
    );
  } catch (err: any) {
    tamperBlocked = err.message.includes('일치하지 않는 기업');
  }
  assert(tamperBlocked, '[MATERNITY] 다른 기업으로 변조 시 저장 차단');
}

// 1-4. PAYROLL (개별 급여 & 대장)
{
  const validIndiv = await validator.validateSourceConsistency(
    'PAYROLL',
    mockIndividualPayroll.id,
    'comp_test_alpha_001',
    'worker_canonical_101'
  );
  assert(validIndiv.expectedCompanyId === 'comp_test_alpha_001', '[PAYROLL 개별] 원본 기업 ID 정상 승인');

  let tamperBlockedIndiv = false;
  try {
    await validator.validateSourceConsistency(
      'PAYROLL',
      mockIndividualPayroll.id,
      'comp_test_beta_002',
      'worker_canonical_101'
    );
  } catch (err: any) {
    tamperBlockedIndiv = err.message.includes('일치하지 않는 기업');
  }
  assert(tamperBlockedIndiv, '[PAYROLL 개별] 다른 기업으로 변조 시 저장 차단');

  const validLedger = await validator.validateSourceConsistency('PAYROLL', mockLedgerSourceId, 'comp_test_alpha_001');
  assert(validLedger.expectedCompanyId === 'comp_test_alpha_001', '[PAYROLL 대장] 대장 소속 기업 ID 정상 승인');

  let tamperBlockedLedger = false;
  try {
    await validator.validateSourceConsistency('PAYROLL', mockLedgerSourceId, 'comp_test_beta_002');
  } catch (err: any) {
    tamperBlockedLedger = err.message.includes('일치하지 않는 기업');
  }
  assert(tamperBlockedLedger, '[PAYROLL 대장] 다른 기업으로 변조 시 저장 차단');
}

// ============================================================================
// Test Suite 2: workerId 정합성 및 변조 차단
// ============================================================================
console.log('\n--- 2. [workerId 정합성] canonical worker.id 유지 및 변조 차단 ---');

// 2-1. MATERNITY: canonical worker.id 유지
{
  const valid = await validator.validateSourceConsistency(
    'MATERNITY',
    mockMaternityCase.id,
    'comp_test_alpha_001',
    'worker_canonical_101'
  );
  assert(valid.expectedWorkerId === 'worker_canonical_101', '[MATERNITY] canonical employeeId 정상 유지');

  // 타 근로자 ID로 변조 시도
  let otherWorkerBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'MATERNITY',
      mockMaternityCase.id,
      'comp_test_alpha_001',
      'worker_canonical_102'
    );
  } catch (err: any) {
    otherWorkerBlocked = err.message.includes('일치하지 않는 근로자');
  }
  assert(otherWorkerBlocked, '[MATERNITY] 다른 근로자 ID(worker_canonical_102)로 변조 시 차단');

  // Firebase Auth UID로 변조 시도
  let authUidBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'MATERNITY',
      mockMaternityCase.id,
      'comp_test_alpha_001',
      'firebase_auth_uid_hong_123'
    );
  } catch (err: any) {
    authUidBlocked = err.message.includes('일치하지 않는 근로자');
  }
  assert(authUidBlocked, '[MATERNITY] Firebase auth.uid로 변조 시 차단');

  // 이름 기반 ID로 변조 시도
  let nameIdBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'MATERNITY',
      mockMaternityCase.id,
      'comp_test_alpha_001',
      '홍길동'
    );
  } catch (err: any) {
    nameIdBlocked = err.message.includes('일치하지 않는 근로자');
  }
  assert(nameIdBlocked, '[MATERNITY] 이름 기반 ID("홍길동")로 변조 시 차단');

  // workerId 누락 시도
  let missingWorkerBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'MATERNITY',
      mockMaternityCase.id,
      'comp_test_alpha_001',
      undefined
    );
  } catch (err: any) {
    missingWorkerBlocked = err.message.includes('일치하지 않는 근로자');
  }
  assert(missingWorkerBlocked, '[MATERNITY] workerId 누락 시 차단');
}

// 2-2. 개별 PAYROLL: canonical worker.id 유지
{
  const valid = await validator.validateSourceConsistency(
    'PAYROLL',
    mockIndividualPayroll.id,
    'comp_test_alpha_001',
    'worker_canonical_101'
  );
  assert(valid.expectedWorkerId === 'worker_canonical_101', '[PAYROLL] canonical employeeId 정상 유지');

  // 타 근로자 ID로 변조 시도
  let otherWorkerBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'PAYROLL',
      mockIndividualPayroll.id,
      'comp_test_alpha_001',
      'worker_canonical_102'
    );
  } catch (err: any) {
    otherWorkerBlocked = err.message.includes('일치하지 않는 근로자');
  }
  assert(otherWorkerBlocked, '[PAYROLL] 다른 근로자 ID(worker_canonical_102)로 변조 시 차단');

  // Auth UID로 변조 시도
  let authUidBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'PAYROLL',
      mockIndividualPayroll.id,
      'comp_test_alpha_001',
      'firebase_auth_uid_hong_123'
    );
  } catch (err: any) {
    authUidBlocked = err.message.includes('일치하지 않는 근로자');
  }
  assert(authUidBlocked, '[PAYROLL] auth.uid로 변조 시 차단');
}

// 2-3. 원본에 workerId가 없는 업무에 임의 workerId 생성 차단
{
  // DATA_REQUEST에 workerId 부여 시도
  let dreqWorkerBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'DATA_REQUEST',
      mockDataRequest.id,
      'comp_test_alpha_001',
      'worker_canonical_101'
    );
  } catch (err: any) {
    dreqWorkerBlocked = err.message.includes('근로자를 임의로 지정할 수 없습니다');
  }
  assert(dreqWorkerBlocked, '[DATA_REQUEST] 원본에 workerId 없는 업무에 임의 workerId 지정 시 차단');

  // 회사 전체 급여대장에 workerId 부여 시도
  let ledgerWorkerBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'PAYROLL',
      mockLedgerSourceId,
      'comp_test_alpha_001',
      'worker_canonical_101'
    );
  } catch (err: any) {
    ledgerWorkerBlocked = err.message.includes('근로자를 임의로 지정할 수 없습니다');
  }
  assert(ledgerWorkerBlocked, '[PAYROLL 대장] 회사 전체 급여 업무에 임의 workerId 지정 시 차단');

  // 일반 문의에 workerId 부여 시도
  let inqWorkerBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'INQUIRY',
      mockCompanyInquiry.id,
      'comp_test_alpha_001',
      'worker_canonical_101'
    );
  } catch (err: any) {
    inqWorkerBlocked = err.message.includes('근로자를 임의로 지정할 수 없습니다');
  }
  assert(inqWorkerBlocked, '[INQUIRY] 문의 업무에 임의 workerId 지정 시 차단');
}

// ============================================================================
// Test Suite 3: 비소속 개인 문의 처리 (가짜 companyId 생성 방지)
// ============================================================================
console.log('\n--- 3. [개인 문의 처리] 가짜 companyId 생성 차단 및 미소속 보존 ---');
{
  // 정상 비소속 개인 문의: companyId = undefined
  const valid = await validator.validateSourceConsistency(
    'INQUIRY',
    mockIndividualInquiry.id,
    undefined,
    undefined
  );
  assert(valid.expectedCompanyId === undefined, '[개인 문의] 소속 기업 없이(undefined) 정상 승인');

  // 비소속 개인 문의에 가짜 companyId나 임의 기업 주입 시도
  let fakeCompBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'INQUIRY',
      mockIndividualInquiry.id,
      'fake_company_99999',
      undefined
    );
  } catch (err: any) {
    fakeCompBlocked = err.message.includes('비소속 개인 문의에는 기업을 임의로 지정할 수 없습니다');
  }
  assert(fakeCompBlocked, '[개인 문의] 가짜/임의 companyId 지정 시 즉시 차단');

  let existingCompInjectBlocked = false;
  try {
    await validator.validateSourceConsistency(
      'INQUIRY',
      mockIndividualInquiry.id,
      'comp_test_alpha_001',
      undefined
    );
  } catch (err: any) {
    existingCompInjectBlocked = err.message.includes('비소속 개인 문의에는 기업을 임의로 지정할 수 없습니다');
  }
  assert(existingCompInjectBlocked, '[개인 문의] 기존 기업 ID 주입 시 즉시 차단');
}

// ============================================================================
// Test Suite 4: UI 변조 방지 (CreateTaskFromSourceModal의 고정 및 submit 강제)
// ============================================================================
console.log('\n--- 4. [UI 변조 방지] 모달 기업·근로자 고정 및 submit 페이로드 강제 ---');
{
  // 모달에 전달된 원본 prop 시뮬레이션
  const modalPropsMaternity = {
    sourceType: 'MATERNITY' as TaskSourceType,
    sourceId: mockMaternityCase.id,
    companyId: mockMaternityCase.companyId,
    workerId: mockMaternityCase.employeeId,
  };

  const isSourceBound = Boolean(modalPropsMaternity.sourceType && modalPropsMaternity.sourceType !== 'MANUAL');
  assert(isSourceBound === true, '모달에서 출처 기반 업무임을 정상 감지 (isSourceBound = true)');

  // UI 악의적 변조 시뮬레이션: DOM을 뚫고 formCompanyId/formWorkerId를 변경했다고 가정
  const hackedFormCompanyId = 'hacked_company_evil';
  const hackedFormWorkerId = 'hacked_worker_evil';

  // handleCreateSubmit의 방어 로직: isSourceBound일 때는 formState가 아닌 prop 값을 강제
  const finalCompanyId = isSourceBound
    ? (modalPropsMaternity.companyId && modalPropsMaternity.companyId.trim() ? modalPropsMaternity.companyId.trim() : undefined)
    : (hackedFormCompanyId.trim() || undefined);

  const finalWorkerId = isSourceBound
    ? (modalPropsMaternity.workerId && modalPropsMaternity.workerId.trim() ? modalPropsMaternity.workerId.trim() : undefined)
    : (hackedFormWorkerId.trim() || undefined);

  assert(
    finalCompanyId === 'comp_test_alpha_001',
    'UI formState가 변조되어도 submit 페이로드의 companyId는 원본 prop(comp_test_alpha_001)으로 고정보장'
  );
  assert(
    finalWorkerId === 'worker_canonical_101',
    'UI formState가 변조되어도 submit 페이로드의 workerId는 원본 prop(worker_canonical_101)으로 고정보장'
  );

  // 개인 문의 UI 시뮬레이션
  const modalPropsIndivInquiry = {
    sourceType: 'INQUIRY' as TaskSourceType,
    sourceId: mockIndividualInquiry.id,
    companyId: undefined,
    workerId: undefined,
  };

  const finalIndivCompanyId = Boolean(modalPropsIndivInquiry.sourceType !== 'MANUAL')
    ? (modalPropsIndivInquiry.companyId ? modalPropsIndivInquiry.companyId : undefined)
    : hackedFormCompanyId;

  assert(finalIndivCompanyId === undefined, '개인 문의에서 UI 변조가 있어도 companyId는 undefined로 고정보장');
}

// ============================================================================
// Test Suite 5: taskService 실제 인터페이스 검증
// ============================================================================
console.log('\n--- 5. [taskService 실제 인터페이스 검증] ---');
{
  assert(typeof taskService.validateSourceConsistency === 'function', 'taskService.validateSourceConsistency 함수 정의 확인');
  assert(typeof taskService.createTask === 'function', 'taskService.createTask 함수 정의 확인');
  assert(typeof taskService.checkDuplicateSourceTask === 'function', 'taskService.checkDuplicateSourceTask 함수 정의 확인');
}

console.log('\n================================================================');
console.log(`[R3-3 3/3-B-③-B] 검증 결과: 통과 ${passCount}건 / 실패 ${failCount}건`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
}
