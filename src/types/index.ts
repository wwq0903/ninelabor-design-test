export type UserRole = 'ADMIN' | 'COMPANY' | 'WORKER';

export type MembershipType = 'COMPANY_AFFILIATED' | 'INDIVIDUAL';

export type MembershipStatus = 'ACTIVE' | 'PENDING_COMPANY_VERIFICATION' | 'REJECTED';

export type SignUpType = 'COMPANY_REP' | 'WORKER_AFFILIATED' | 'WORKER_INDIVIDUAL';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  membershipType?: MembershipType;
  membershipStatus?: MembershipStatus;
  companyId?: string | null;
  companyName?: string;
  requestedCompanyId?: string | null;
  requestedCompanyName?: string;
  requestedBusinessNumber?: string;
  rejectionReason?: string;
  employeeId?: string;
  department?: string;
  position?: string;
  joinDate?: string;
  resignedDate?: string;
  workerStatus?: WorkerStatus;
  maskedRrn?: string;
  hasRrn?: boolean;
  assignedCompanyIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export type CompanyStatus = 'active' | 'pending' | 'suspended';

// [R2-8 2/4-B-②] 기업 구독 상태 (Subscription Status)
// ※ 기업 계정 자체 상태(CompanyStatus: 'active' | 'pending' | 'suspended')와 엄격히 분리
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

// [R2-8 2/4-C-③] 플랜 변경 신청 상태 (Subscription Request Status)
export type SubscriptionRequestStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

// [R2-8 2/4-C-③] 플랜 변경 신청 데이터 구조 (subscription_requests/{requestId})
export interface SubscriptionRequest {
  id: string;
  companyId: string;
  companyName: string;
  requesterId: string;
  requestedPlanCode: PlanCode;
  status: SubscriptionRequestStatus;
  createdAt: string;
  updatedAt: string;
  note?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewComment?: string;
  // [R2-8 2/4-C-⑦] 실제 구독 적용 메타데이터 (ADMIN 수동 적용)
  appliedAt?: string;
  appliedById?: string;
  appliedByName?: string;
  appliedSubscriptionPlanCode?: PlanCode;
}

// [R2-8 2/4-B-②] 기업 구독 데이터 구조 (Source of Truth)
// ※ companies/{companyId}.subscription 필드 구조
export interface CompanySubscription {
  planCode: PlanCode;
  status: SubscriptionStatus;
  startDate?: string;
  endDate?: string;
}

// [R2-8 2/4-C-⑩-2] 관리자 직접 구독 변경 결과 (트랜잭션 반환값)
export interface CompanySubscriptionUpdateResult {
  companyId: string;
  oldSubscription: CompanySubscription | null;
  newSubscription: CompanySubscription;
  updatedAt: string;
}

export interface Company {
  id: string;
  branchId?: string;
  companyName: string;
  businessNumber: string;
  representativeName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  assignedAttorneyId?: string;
  primaryContactId?: string; // [R3-1 1/3] 주 담당자 빠른 참조 및 동시성 락 연계
  currentPlanId?: string; // [하위 호환 유지] 기존 모성보호 및 관리자 화면 연동용
  subscription?: CompanySubscription; // [R2-8 2/4-B-②] 기업 구독 상태 구조 (Source of Truth)
  purchasedMaternityTickets?: number;
  lastMaternityDeductionAt?: string;
  status: CompanyStatus; // 기업 계정 자체 상태
  createdAt: string;
  updatedAt: string;
}

// [R3-1 1/3] 기업별 복수 담당자 데이터 모델 (company_contacts/{contactId})
export interface CompanyContact {
  id: string;
  companyId: string;
  name: string;
  position?: string;
  department?: string;
  phone?: string;
  email?: string;
  responsibilities?: string[];
  isPrimary: boolean;
  internalNote?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string;
}

export interface CreateCompanyContactInput {
  companyId: string;
  name: string;
  position?: string;
  department?: string;
  phone?: string;
  email?: string;
  responsibilities?: string[];
  isPrimary?: boolean;
  internalNote?: string;
  isActive?: boolean;
}

export interface UpdateCompanyContactInput {
  companyId?: string; // [R3-1 3/3] 회사 격리 검증용 (변조 방지)
  name?: string;
  position?: string;
  department?: string;
  phone?: string;
  email?: string;
  responsibilities?: string[];
  isPrimary?: boolean;
  internalNote?: string;
  isActive?: boolean;
}

// [R3-2 1/3] ADMIN 전용 기업·근로자 내부 메모 모델 (internal_notes/{noteId})
export type InternalNoteTargetType = 'COMPANY' | 'WORKER';

export interface InternalNote {
  id: string;
  targetType: InternalNoteTargetType;
  targetId: string;
  companyId: string;
  content: string;
  category?: string;
  isPinned: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
  updatedById: string;
  updatedByName: string;
}

export interface CreateInternalNoteInput {
  targetType: InternalNoteTargetType;
  targetId: string;
  companyId: string;
  content: string;
  category?: string;
  isPinned?: boolean;
}

export interface UpdateInternalNoteInput {
  content?: string;
  category?: string;
  isPinned?: boolean;
  isActive?: boolean;
}

// [R3-3 1/3] ADMIN 통합 할 일·마감일 관리 모델 (tasks/{taskId})
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TaskSourceType =
  | 'MANUAL'
  | 'INQUIRY'
  | 'DATA_REQUEST'
  | 'MATERNITY'
  | 'PAYROLL'
  | 'MESSAGE'
  | 'DOCUMENT'
  | 'OTHER';

export type TaskDueStatus =
  | 'OVERDUE'    // 완료되지 않았고 dueDate < 오늘
  | 'TODAY'      // 완료되지 않았고 dueDate = 오늘
  | 'UPCOMING'   // 완료되지 않았고 가까운 미래 (1~7일 이내)
  | 'NORMAL'     // 완료되지 않았고 여유 있는 미래 또는 마감일 미지정
  | 'COMPLETED'  // 완료됨 (마감 경고 대상 제외)
  | 'CANCELLED'; // 취소됨 (마감 경고 대상 제외)

export interface Task {
  id: string;
  companyId?: string;
  workerId?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  completedAt?: string;
  sourceType?: TaskSourceType;
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
  updatedById: string;
  updatedByName: string;
}

export interface CreateTaskInput {
  companyId?: string;
  workerId?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status?: TaskStatus; // 기본값 TODO
  dueDate?: string;
  sourceType?: TaskSourceType; // 기본값 MANUAL
  sourceId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | null;
  companyId?: string | null;
  workerId?: string | null;
  sourceType?: TaskSourceType | null;
  sourceId?: string | null;
}

export interface TaskFilters {
  companyId?: string;
  workerId?: string;
  status?: TaskStatus | 'ALL_ACTIVE' | 'ALL';
  priority?: TaskPriority;
  sourceType?: TaskSourceType;
  dueStatus?: TaskDueStatus;
}

export interface CompanyDirectoryItem {
  id: string;
  companyName: string;
  businessNumberMasked: string;
  createdAt?: string;
}

export type MaternityWorkType =
  | 'MATERNITY_LEAVE' // 출산전후휴가
  | 'PATERNITY_LEAVE' // 배우자 출산휴가
  | 'MISCARRIAGE_LEAVE' // 유산·사산휴가
  | 'PARENTAL_LEAVE' // 육아휴직
  | 'PARENTAL_REDUCED_HOURS' // 육아기 근로시간 단축
  | 'PREGNANCY_REDUCED_HOURS' // 임신기 근로시간 단축
  | 'INFERTILITY_TREATMENT_LEAVE' // 난임치료휴가
  | 'OTHER_MATERNITY'; // 기타 모성보호 관련 업무

export type MaternityStatus =
  | 'APPLIED' // 신청
  | 'DOCS_COLLECTING' // 서류수집
  | 'UNDER_REVIEW' // 검토
  | 'IN_PROGRESS' // 처리중
  | 'COMPLETED' // 완료
  | 'SUPPLEMENT_REQUESTED' // 보완요청
  | 'CANCELLED'; // 취소

export interface SubmittedDocument {
  name: string;
  url?: string;
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'SUPPLEMENT_REQUESTED';
  requestedAt?: string;
  submittedAt?: string;
}

export interface MaternityCaseHistoryItem {
  action: string;
  previousStatus?: MaternityStatus;
  newStatus?: MaternityStatus;
  timestamp: string;
  actor: string;
  actorUid?: string;
  notes?: string;
}

export interface MaternitySupplementRequest {
  content: string; // 보완요청 상세 내용
  requestedAt: string; // 요청일시
  requestedById: string; // 요청자 UID
  requestedByName?: string; // 요청자 성명
  responseNotes?: string; // 기업 보완 메모
  respondedAt?: string; // 보완 제출일시
  respondedById?: string; // 보완 제출자 UID
  respondedByName?: string; // 보완 제출자 성명
}

export interface MaternityCasePrivate {
  caseId: string;
  internalNotes: string;
  updatedAt: string;
  updatedById: string;
}

export interface MaternityDocument {
  id: string;
  caseId: string;
  companyId: string;
  employeeId: string;
  documentType: string;
  title: string;
  fileName: string;
  fileUrl?: string;
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  uploadedById: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaternityDocumentPrivate {
  documentId: string;
  internalNotes: string;
  updatedAt: string;
  updatedById: string;
}

// [R2-8 2/4-A-⑤-2] 모성보호 차감 출처 및 상태 타입
export type MaternityDeductionSource = 'MONTHLY_FREE' | 'PREPAID_TICKET';

export type MaternityDeductionStatus = 'DEDUCTED' | 'RESTORED' | 'CANCELLED';

// [R2-8 2/4-A-⑤-2] MaternityCase 문서 내 임베디드 차감 메타데이터
export interface MaternityCaseDeductionInfo {
  deductionId: string; // 고유 차감 식별자
  source: MaternityDeductionSource; // 차감 출처: MONTHLY_FREE | PREPAID_TICKET
  yearMonth: string; // 차감 적용 연월 ('YYYY-MM')
  deductedAt: string; // 차감 처리 일시 (ISO)
  restoredAt?: string; // 취소/반려 시 복구 일시 (ISO, 선택)
}

// [R2-8 2/4-A-⑤-2] 별도 차감 원장 데이터 모델 (Deduction Ledger Model)
export interface MaternityDeductionLedgerItem {
  id: string; // 원장 문서 ID (예: `deduct_${companyId}_${caseId}`)
  deductionId: string; // 차감 식별자
  companyId: string; // 대상 기업 ID (기업별 격리 인덱스)
  maternityCaseId: string; // 연계 모성보호 사건 ID (1:1 멱등성 보장)
  source: MaternityDeductionSource; // 차감 출처 (MONTHLY_FREE | PREPAID_TICKET)
  quantity: number; // 차감 수량 (기본 1)
  status: MaternityDeductionStatus; // 상태: DEDUCTED | RESTORED | CANCELLED
  yearMonth: string; // 적용 연월 ('YYYY-MM', 이월 방지 격리)
  deductedAt: string; // 차감 일시 (ISO)
  restoredAt?: string; // 복구 일시 (ISO, 선택)
  restorationReason?: string; // 복구/취소 사유 (선택)
  actorUid: string; // 처리자 UID
  actorRole: UserRole; // 처리자 역할 (COMPANY | ADMIN)
  actorName?: string; // 처리자 성명
  idempotencyKey: string; // 중복 차감/복구 방지 키 (`${companyId}_${maternityCaseId}_${source}`)
  restoredByUid?: string; // 복구 처리자 UID
  restoredByRole?: UserRole; // 복구 처리자 역할
  restoredByName?: string; // 복구 처리자 성명
  notes?: string; // 부가 기록/메모
  createdAt: string; // 원장 생성 일시 (ISO)
  updatedAt: string; // 원장 최종 수정 일시 (ISO)
}

export interface MaternityCase {
  id: string;
  companyId: string;
  employeeId: string;
  workType: MaternityWorkType;
  applicationDate: string;
  startDate: string;
  endDate: string;
  returnDate?: string;
  assignedAttorneyId?: string;
  status: MaternityStatus;
  submittedDocuments?: SubmittedDocument[];
  internalNotes?: string;
  supplementRequest?: MaternitySupplementRequest;
  completedAt?: string;
  completedById?: string;
  deductionInfo?: MaternityCaseDeductionInfo; // [R2-8 2/4-A-⑤-2] 모성보호 차감 메타데이터
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string;
  history?: MaternityCaseHistoryItem[];
}

export type PlanCode = 'FREE' | 'BASIC' | 'STANDARD' | 'CUSTOM' | 'OUTSOURCING';

export type GeneralPlanCode = 'FREE' | 'BASIC' | 'STANDARD' | 'CUSTOM';

export type SeparateServiceCode = 'OUTSOURCING' | 'MATERNITY_5' | 'MATERNITY_10';

export type PlatformFeatureKey =
  | 'DASHBOARD'
  | 'COMPANY_INFO'
  | 'MESSAGES'
  | 'DATA_REQUESTS'
  | 'DOCUMENTS'
  | 'WORKERS'
  | 'LABOR_INQUIRIES'
  | 'PLAN_INFO'
  | 'PAYROLL'
  | 'PAYSLIPS'
  | 'ATTENDANCE'
  | 'OVERTIME'
  | 'MATERNITY';

export interface FeatureDefinition {
  key: PlatformFeatureKey;
  name: string;
  description: string;
  category: 'GENERAL' | 'OUTSOURCING' | 'PREPAID_TICKET';
}

export interface MaternityQuotaPolicyItem {
  monthlyFreeQuota: number;
  allowRollover: boolean;
  description: string;
}

export interface CompanyMaternityUsageSummary {
  companyId: string;
  companyName: string;
  currentPlan: PlanCode;
  targetYearMonth: string; // 'YYYY-MM'
  monthlyFreeQuota: number; // STANDARD: 5, others: 0
  monthlyFreeUsed: number;
  monthlyFreeRemaining: number;
  purchasedTicketsRemaining: number;
  totalAvailableRemaining: number;
  deductionPriority: readonly ['MONTHLY_FREE_QUOTA', 'PREPAID_PURCHASED_TICKET'];
}

// [R2-8 2/4-A-⑤-3] 레거시 판별 옵션
export interface LegacyCheckOptions {
  cutOffDate?: string; // 적용 기준일 (ISO 형식)
  schemaVersion?: number; // 차감 스키마 버전
  effectiveYearMonth?: string; // 적용 기준 연월 ('YYYY-MM')
}

// [R2-8 2/4-A-⑤-3 & C-⑨] 차감 대상 판정 입력 인터페이스
export interface EvaluateMaternityDeductionInput {
  maternityCase: MaternityCase;
  companyId: string; // 대상 기업 ID (데이터 격리 검증용)
  planCode?: PlanCode; // [하위 호환] 대상 기업의 플랜 코드
  company?: Company; // [R2-8 2/4-C-⑨] 대상 기업 문서 (subscription 포함)
  subscription?: CompanySubscription | null; // [R2-8 2/4-C-⑨] 기업 구독 객체 (Source of Truth)
  referenceDateString?: string; // [R2-8 2/4-C-⑨] 유효기간 검증용 기준일 (기본값: 오늘)
  monthlyFreeQuota?: number; // [R2-8 2/4-C-⑨] 명시적 당월 무료 제공 횟수 (선택)
  targetYearMonth: string; // 'YYYY-MM' (당월 횟수 연계용)
  currentMonthFreeUsed: number; // 당월 이미 사용된 무료 횟수
  purchasedTicketsRemaining: number; // 보유 선불 이용권 잔여 수량
  existingLedgerItem?: MaternityDeductionLedgerItem | null; // 기존 차감 원장 (중복 검증용)
  options?: LegacyCheckOptions; // 레거시/기준일 옵션
}

// [R2-8 2/4-A-⑤-3] 차감 대상 판정 결과 인터페이스
export interface MaternityDeductionEligibilityResult {
  canDeduct: boolean; // 차감 진행 가능 여부
  reason?: string; // 차감 불가 사유 (소진, 중복, 레거시 소급 불가 등)
  determinedSource?: MaternityDeductionSource; // 결정된 차감 출처: 'MONTHLY_FREE' | 'PREPAID_TICKET'
  planCode: PlanCode;
  monthlyFreeQuota?: number; // [R2-8 2/4-C-⑨-2] 자격 판정된 월 무료 한도 (STANDARD: 5, 기타: 0)
  targetYearMonth: string;
  monthlyFreeRemainingBefore: number;
  purchasedTicketsRemainingBefore: number;
  totalAvailableRemainingBefore: number;
  caseId: string;
  companyId: string;
}

// [R2-8 2/4-A-⑥-1] 모성보호 차감 트랜잭션 오류 코드
export type MaternityDeductionErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'DATA_ISOLATION_VIOLATION'
  | 'CASE_NOT_FOUND'
  | 'COMPANY_NOT_FOUND'
  | 'LEGACY_CASE_RETROACTIVE_DENIED'
  | 'ALREADY_DEDUCTED'
  | 'QUOTA_EXHAUSTED'
  | 'INVALID_STATE'
  | 'TRANSACTION_FAILED';

// [R2-8 2/4-A-⑥-1] 모성보호 차감 호출자 컨텍스트
export interface MaternityDeductionCallerContext {
  uid: string;
  role: UserRole;
  companyId?: string;
  displayName?: string;
}

// [R2-8 2/4-A-⑥-1 & ⑥-9] 모성보호 차감 트랜잭션 실행 요청 파라미터
export interface MaternityDeductionTransactionParams {
  caller: MaternityDeductionCallerContext;
  companyId: string;
  caseId: string;
  targetYearMonth?: string; // [R2-8 2/4-C-⑨-3] 지정하지 않을 경우 실제 업무 착수일 기준 연월
  referenceDateString?: string; // [R2-8 2/4-C-⑨-3] 실제 업무 착수 기준일 ('YYYY-MM-DD' 또는 ISO)
  workStartDate?: string; // [R2-8 2/4-C-⑨-3] 실제 업무 착수일 별칭
  notes?: string;
  options?: LegacyCheckOptions;
  // [R2-8 2/4-A-⑥-9 & ⑥-10] 상태 전이 동시 원자적 처리 및 담당 노무사 배정용 확장 파라미터
  targetStatus?: MaternityStatus;
  statusChangeHistoryItem?: MaternityCaseHistoryItem;
  extraCaseUpdates?: Partial<MaternityCase>;
  allowSkipIfAlreadyDeducted?: boolean; // 기차감 사건 상태 전이 시 차감 스킵 허용 플래그
  assignedAttorneyId?: string; // [R2-8 2/4-A-⑥-10] 담당 노무사 최초 배정 트리거
}

// [R2-8 2/4-A-⑥-1 & ⑥-9] 모성보호 차감 트랜잭션 성공 결과
export interface MaternityDeductionTransactionResult {
  success: boolean;
  deductionId: string;
  caseId: string;
  companyId: string;
  source: MaternityDeductionSource;
  yearMonth: string;
  deductedAt: string;
  remainingMonthlyFree: number;
  remainingPurchasedTickets: number;
  totalRemaining: number;
  ledgerItem: MaternityDeductionLedgerItem;
  caseDeductionInfo: MaternityCaseDeductionInfo;
  targetStatus?: MaternityStatus;
  alreadyDeducted?: boolean;
}

// [R2-8 2/4-A-⑥-2] 모성보호 복구 판정 유형
export type MaternityRestorationType =
  | 'AUTO_RESTORE'            // 자동 복구 적격 (착수 전 취소)
  | 'REQUIRES_ADMIN_REVIEW'   // 업무 착수 후 취소·반려로 관리자 검토 필요
  | 'EXPIRED_MONTHLY_FREE'    // 익월 취소로 인한 당월 무료 횟수 소멸 (이월 불가)
  | 'NOT_ELIGIBLE';           // 복구 불가 (진행중, 중복, 데이터 불일치 등)

// [R2-8 2/4-A-⑥-2] 모성보호 복구 판정 입력 인터페이스
export interface EvaluateMaternityRestorationInput {
  maternityCase: MaternityCase;
  ledgerItem: MaternityDeductionLedgerItem | null | undefined;
  requestCompanyId: string; // 데이터 격리 검증용 기업 ID
  cancellationYearMonth?: string; // 취소 발생 연월 ('YYYY-MM'), 미지정 시 현재 연월
  cancellationDate?: string; // 취소 일시 (ISO)
  workStartedStatuses?: MaternityStatus[]; // 업무 착수 간주 상태 목록
  allowAdminOverride?: boolean; // 관리자 수동 검토 승인 여부
}

// [R2-8 2/4-A-⑥-2] 모성보호 복구 판정 결과 인터페이스
export interface MaternityRestorationEligibilityResult {
  canRestore: boolean; // 최종 복구 실행 가능 여부
  restorationType: MaternityRestorationType;
  requiresAdminReview: boolean; // 관리자 검토 대상 여부
  reason: string; // 판정 사유
  restorableSource?: MaternityDeductionSource; // 복구 대상 출처: 'PREPAID_TICKET' | 'MONTHLY_FREE'
  restoredQuantity?: number; // 복구 수량 (1)
  caseId: string;
  companyId: string;
  deductionId?: string;
  deductionYearMonth?: string;
  cancellationYearMonth: string;
}

// [R2-8 2/4-A-⑥-3] 모성보호 복구 트랜잭션 에러 코드
export type MaternityRestorationErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'ADMIN_APPROVAL_REQUIRED'
  | 'DATA_ISOLATION_VIOLATION'
  | 'CASE_NOT_FOUND'
  | 'LEDGER_NOT_FOUND'
  | 'COMPANY_NOT_FOUND'
  | 'ALREADY_RESTORED'
  | 'NOT_ELIGIBLE_FOR_RESTORATION'
  | 'EXPIRED_MONTHLY_FREE'
  | 'INVALID_STATE'
  | 'TRANSACTION_FAILED';

// [R2-8 2/4-A-⑥-3] 모성보호 복구 트랜잭션 요청 파라미터
export interface MaternityRestorationTransactionParams {
  caller: MaternityDeductionCallerContext;
  companyId: string;
  caseId: string;
  cancellationReason?: string;
  adminApprovalConfirmed?: boolean; // 업무 착수 후 취소 건에 대한 관리자 복구 승인 확인
  cancellationDate?: string;
  targetCaseCancellation?: boolean; // 복구 시 사건 상태를 CANCELLED로 원자적 전이 (기본 true)
}

// [R2-8 2/4-A-⑥-3] 모성보호 복구 트랜잭션 실행 결과
export interface MaternityRestorationTransactionResult {
  success: boolean;
  deductionId: string;
  caseId: string;
  companyId: string;
  restorationType: MaternityRestorationType;
  restorableSource?: MaternityDeductionSource;
  restoredSource?: MaternityDeductionSource;
  restoredQuantity: number;
  restoredAt: string;
  restorationReason: string;
  previousPurchasedTickets?: number;
  newPurchasedTickets?: number;
  ledgerItem: MaternityDeductionLedgerItem;
  caseDeductionInfo: MaternityCaseDeductionInfo;
}

export interface PlanFeature {
  id: string;
  name: string;
  description: string;
}

export interface Plan {
  id: string;
  planCode: GeneralPlanCode | PlanCode;
  planName: string;
  name: string;
  price: number | '별도 견적';
  billingType: 'free' | 'monthly' | 'custom' | 'quote';
  description: string;
  recommendTarget?: string;
  active?: boolean;
  featureIds?: string[];
}

export interface SeparateService {
  serviceCode: SeparateServiceCode;
  serviceName: string;
  pricingType: 'quote' | 'prepaid_ticket';
  price: '별도 견적' | '가격 미정' | '가격 별도 안내' | '가격 문의';
  description: string;
  ticketCount?: number;
}


export type WorkerStatus = 'active' | 'resigned' | 'on_leave';

export interface Worker {
  id: string;
  companyId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  joinDate?: string;
  resignedDate?: string;
  status: WorkerStatus;
  maskedRrn?: string;
  hasRrn?: boolean;
  hourlyWage?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerSensitiveData {
  workerId: string;
  userId?: string;
  rrnEncrypted: string;
  maskedRrn: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FirmInfo {
  firmName: string;
  representative?: string;
  businessNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  description?: string;
  naverReservationUrl?: string;
  updatedAt?: string;
}

export interface UserConsent {
  id: string;
  userId: string;
  termType: string;
  version: string;
  agreed: boolean;
  agreedAt: string;
  withdrawnAt?: string;
}

export interface Message {
  id: string;
  companyId: string;
  companyName?: string;
  senderId: string;
  senderRole: string; // 'ADMIN' | 'COMPANY'
  senderName: string;
  title?: string;
  content: string;
  recipientId?: string;
  recipientRole?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRead {
  id: string; // e.g. read_${userId}_${messageId}
  messageId: string;
  companyId: string;
  userId: string;
  readAt: string;
}

export interface MessageFile {
  id: string;
  messageId: string;
  companyId: string;
  uploadedById: string;
  uploadedByRole: 'ADMIN' | 'COMPANY';
  originalFileName: string;
  storagePath: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string;
  // Optional compatibility fields
  title?: string;
  category?: string;
}

export type DataRequestStatus =
  | 'REQUESTED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'COMPLETED';

export interface DataRequestFile {
  fileId: string;
  dataRequestId: string;
  companyId: string;
  uploadedById: string;
  uploadedByName?: string;
  originalFileName: string;
  storagePath: string;
  downloadUrl?: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface DataRequest {
  id: string;
  companyId: string;
  title: string;
  description: string;
  requestedItems: string[];
  dueDate: string;
  status: DataRequestStatus;
  createdAt: string;
  createdById: string;
  updatedAt: string;
  updatedById: string;

  // Submission details (R2-3 1/3-B & 1/3-C)
  submissionNote?: string;
  submittedAt?: string;
  submittedById?: string;
  submittedByName?: string;
  submittedFiles?: DataRequestFile[];

  // Admin Revision Request Details
  revisionNote?: string;

  // Optional display & compatibility fields
  companyName?: string;
  createdByName?: string;
  updatedByName?: string;
  requesterId?: string;
  requesterName?: string;
  content?: string;
  requiredItems?: string[];
  submittedItems?: { name: string; submittedAt: string; note?: string }[];
  history?: { action: string; timestamp: string; actor: string; note?: string }[];
}

export type CompanyDocumentCategory =
  | 'LABOR_CONTRACT' // 근로계약서
  | 'PAYROLL'        // 급여자료
  | 'WORK_RULES'     // 취업규칙
  | 'HR'             // 인사자료
  | 'FOUR_INSURANCES'// 4대보험
  | 'MATERNITY'      // 모성보호
  | 'OTHER';         // 기타

export interface CompanyDocument {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  category: CompanyDocumentCategory;
  description: string;
  originalFileName: string;
  storagePath: string;
  contentType: string;
  size: number;
  uploadedById: string;
  uploadedByRole: 'ADMIN' | 'COMPANY';
  createdAt: string;
  updatedAt: string;
}

export type DocumentCategory = CompanyDocumentCategory;

export interface DocumentMeta {
  id: string;
  companyId: string;
  employeeId?: string;
  relatedWorkId?: string;
  category: DocumentCategory;
  title: string;
  fileName: string;
  fileSize?: number;
  fileType?: string;
  uploadedById: string;
  uploadedByName: string;
  storagePath?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  companyId?: string;
  type: string;
  title: string;
  content: string;
  targetPath?: string;
  isRead: boolean;
  createdAt: string;
}

export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'SETUP_REQUIRED' | 'ERROR';

export interface IntegrationServiceItem {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  statusDetail: string;
  isExternalLink?: boolean;
  linkUrl?: string;
}


export type InquiryStatus =
  | 'RECEIVED'
  | 'IN_PROGRESS'
  | 'ANSWERED'
  | 'CLOSED'
  | 'ASSIGNED';

export interface Inquiry {
  id: string;
  companyId: string | null;
  companyName?: string | null;
  requesterId: string;
  requesterRole: 'COMPANY' | 'WORKER';
  requesterName: string;
  authorId?: string;
  authorName?: string;
  authorRole?: 'COMPANY' | 'WORKER';
  type?: string;
  title: string;
  content: string;
  status: InquiryStatus;
  answer?: string;
  answeredAt?: string;
  answeredById?: string;
  answeredByName?: string;
  assignedAttorneyId?: string;
  assignedAttorneyName?: string;
  attachments?: { name: string; url: string }[];
  reply?: string;
  replyAuthorName?: string;
  history?: {
    action: string;
    timestamp: string;
    actor: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface InquiryFile {
  id: string;
  inquiryId: string;
  companyId: string | null;
  requesterId: string;
  uploadedById: string;
  uploadedByRole: 'ADMIN' | 'COMPANY' | 'WORKER';
  originalFileName: string;
  storagePath: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

// [R2-5 1/3-C-2-②] 통합 문의 처리이력
export type InquiryHistoryEventType =
  | 'INQUIRY_CREATED'
  | 'INQUIRY_EDITED'
  | 'STATUS_CHANGED'
  | 'ANSWER_CREATED'
  | 'ANSWER_UPDATED'
  | 'INQUIRY_CLOSED';

export interface InquiryHistoryMetadata {
  fromStatus?: InquiryStatus;
  toStatus?: InquiryStatus;
  [key: string]: any;
}

export interface InquiryHistory {
  id: string;
  inquiryId: string;
  companyId: string | null;
  requesterId: string;
  eventType: InquiryHistoryEventType;
  actorId: string;
  actorRole: 'ADMIN' | 'COMPANY' | 'WORKER';
  actorName: string;
  createdAt: string;
  metadata?: InquiryHistoryMetadata;
}

export type PayrollStatus = 'DRAFT' | 'CONFIRMED' | 'PAID';

export interface PayItem {
  id: string;
  name: string;
  amount: number;
  isTaxable?: boolean;
}

export interface DeductionItem {
  id: string;
  name: string;
  amount: number;
}

export interface PayrollRecord {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  position?: string;
  belongingYearMonth: string; // YYYY-MM

  // Standard Pay Fields (Requirement 3)
  baseSalary?: number;          // 기본급
  allowances?: number;          // 각종 수당
  overtimePay?: number;         // 연장근로수당
  holidayPay?: number;          // 휴일근로수당
  otherPay?: number;            // 기타 지급

  // Standard Deduction Fields (Requirement 3)
  nationalPension?: number;     // 국민연금
  healthInsurance?: number;     // 건강보험
  longTermCare?: number;        // 장기요양보험
  employmentInsurance?: number; // 고용보험
  incomeTax?: number;           // 소득세
  localIncomeTax?: number;      // 지방소득세
  otherDeduction?: number;      // 기타 공제

  payItems: PayItem[];
  deductionItems: DeductionItem[];
  totalPay: number;
  totalDeduction: number;
  netPay: number;
  overtimeHours?: number;
  holidayHours?: number;
  holidayWorkHours?: number;
  hourlyWage?: number;
  wageStatus?: 'CONFIRMED' | 'NEEDS_CONFIRMATION';
  overtimeImportedAt?: string;
  status: PayrollStatus;
  companyName?: string;
  paymentDate?: string;
  confirmedAt?: string;
  confirmedById?: string;
  cancelledAt?: string;
  cancelledById?: string;
  cancellationReason?: string;
  paidAt?: string;
  paidById?: string;
  maternityNote?: string;
  createdById: string;
  updatedById: string;
  createdAt: string;
  updatedAt: string;
}

export type OvertimeWorkType = 'OVERTIME' | 'HOLIDAY' | string;

export interface OvertimeSyncMeta {
  id: string;
  companyId: string;
  belongingYearMonth: string;
  overtimeSourceUpdatedAt: string;
  overtimeImportedAt?: string;
  lastAction?: string;
  updatedById?: string;
  lastImportedById?: string;
  updatedAt: string;
}

export interface OvertimeRecord {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  position?: string;
  workDate: string; // YYYY-MM-DD
  belongingYearMonth: string; // YYYY-MM
  workType: OvertimeWorkType;
  hours: number;
  memo?: string;
  note?: string; // backward compatibility
  authorId?: string; // backward compatibility
  createdById?: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
}

export type AIConsultationStatus =
  | 'AI_ANSWERED'
  | 'ATTORNEY_REVIEW_PENDING'
  | 'ATTORNEY_REVIEWING'
  | 'ANSWERED';

export interface AIConsultation {
  id: string;
  conversationId: string;
  companyId?: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  question: string;
  aiAnswer?: string;
  status: AIConsultationStatus;
  reviewRequestedAt?: string;
  assignedAttorneyId?: string;
  assignedAttorneyName?: string;
  attorneyAnswer?: string;
  answeredAt?: string;
  attachments?: { name: string; url?: string; fileType?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorRole: UserRole;
  actorName: string;
  companyId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  timestamp: string;
  details?: Record<string, any>;
}

// [R3-4 1/3] 기업 업무 타임라인 공통 모델
export type TimelineItemType =
  | 'INQUIRY'
  | 'DATA_REQUEST'
  | 'MATERNITY'
  | 'PAYROLL'
  | 'TASK'
  | 'MESSAGE'
  | 'DOCUMENT';

export type TimelineSourceType = TimelineItemType;

export interface TimelineItemMetadata {
  workerId?: string;
  workerName?: string;
  actorName?: string;
  category?: string;
  dueDate?: string;
  priority?: string;
  yearMonth?: string;
  [key: string]: any;
}

export interface TimelineItem {
  id: string;
  companyId: string;
  type: TimelineItemType;
  occurredAt: string;
  title: string;
  summary?: string;
  status?: string;
  sourceId: string;
  sourceType: TimelineSourceType;
  metadata?: TimelineItemMetadata;
}

export interface TimelineFilterOptions {
  types?: TimelineItemType[];
  startDate?: string;
  endDate?: string;
  limit?: number;
}

