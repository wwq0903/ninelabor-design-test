import React, { useEffect, useState } from 'react';
import {
  MaternityCase,
  MaternityStatus,
  MaternityWorkType,
  MaternityCaseHistoryItem,
  MaternitySupplementRequest,
  UserRole,
  Worker,
  Company,
} from '../../../types';
import { firmService } from '../../../services/firmService';
import { auditLogService } from '../../../services/auditLogService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  MATERNITY_STATUS_CONFIG,
  MATERNITY_WORK_TYPES,
  PRIMARY_STATUS_FLOW,
  ADDITIONAL_STATUS_FLOW,
  getMaternityWorkTypeLabel,
  getMaternityStatusConfig,
} from '../../../config/maternity';
import {
  HeartHandshake,
  Plus,
  Search,
  Calendar,
  User,
  Building2,
  FileCheck2,
  History,
  X,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertCircle,
  FileText,
  RotateCcw,
  MessageSquare,
  Info,
  Send,
  AlertTriangle,
  Check,
  Lock,
  Save,
  ShieldCheck,
  CheckSquare,
} from 'lucide-react';
import { CreateTaskFromSourceModal } from '../admin/CreateTaskFromSourceModal';
import { TaskSourceType } from '../../../types';

interface MaternityViewProps {
  role: UserRole;
  companyId?: string;
  title?: string;
  description?: string;
  initialCaseId?: string;
  onNavigateToSource?: (
    sourceType: TaskSourceType,
    sourceId: string,
    companyId?: string,
    workerId?: string
  ) => void;
}

export const MaternityView: React.FC<MaternityViewProps> = ({
  role,
  companyId: propCompanyId,
  title = '모성보호 업무관리',
  description = '출산전후휴가, 육아휴직 및 근로시간 단축 등 법정 모성보호 제도의 신청·서류·일정·처리를 통합 관리합니다.',
  initialCaseId,
  onNavigateToSource,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [cases, setCases] = useState<MaternityCase[]>([]);
  const [workers, setWorkers] = useState<Record<string, Worker>>({});
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters (Requirement 5: 기업, 업무유형, 상태, 근로자 검색)
  const [companyFilter, setCompanyFilter] = useState<'ALL' | string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MaternityStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | MaternityWorkType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Creation Modal State (Requirement 4: 기업 -> 근로자 -> 유형 -> 신청일 -> 시작일 -> 종료일 -> 복직예정일 -> 내부메모)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [adminSelectedCompanyId, setAdminSelectedCompanyId] = useState<string>('');
  const [availableWorkers, setAvailableWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedWorkType, setSelectedWorkType] = useState<MaternityWorkType>('MATERNITY_LEAVE');
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createModalError, setCreateModalError] = useState<string | null>(null);

  // Detail Modal State (Requirement 6: 기본정보, 일정, 제출서류, 보완요청, 처리이력, 내부메모)
  const [selectedCase, setSelectedCase] = useState<MaternityCase | null>(null);
  const [detailTab, setDetailTab] = useState<'basic' | 'dates' | 'docs' | 'supplement' | 'history' | 'notes'>('basic');

  // Task Integration Modal State (R3-3 3/3-B)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskCreatedMessage, setTaskCreatedMessage] = useState<string | null>(null);

  // ADMIN Status Change State (R2-4 1/3-B-1 & B-2 Requirement 1, 2, 3)
  const [adminTargetStatus, setAdminTargetStatus] = useState<MaternityStatus>('APPLIED');
  const [adminStatusNote, setAdminStatusNote] = useState('');
  const [adminSupplementContent, setAdminSupplementContent] = useState('');
  const [adminCancelReason, setAdminCancelReason] = useState('');
  const [adminAssignedAttorney, setAdminAssignedAttorney] = useState('');
  const [isAdminConfirmOpen, setIsAdminConfirmOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [adminStatusError, setAdminStatusError] = useState<string | null>(null);

  // ADMIN Confidential Private Notes State (R2-4 1/3-B-2 Requirement 3: maternity_case_private isolation)
  const [adminPrivateNotes, setAdminPrivateNotes] = useState('');
  const [isLoadingPrivateNotes, setIsLoadingPrivateNotes] = useState(false);
  const [isSavingPrivateNotes, setIsSavingPrivateNotes] = useState(false);
  const [privateNoteSavedNotice, setPrivateNoteSavedNotice] = useState(false);

  // COMPANY Supplement Resubmission State (R2-4 1/3-B-1 Requirement 4 & 5)
  const [companyResponseNote, setCompanyResponseNote] = useState('');
  const [isCompanyConfirmOpen, setIsCompanyConfirmOpen] = useState(false);
  const [isSubmittingSupplement, setIsSubmittingSupplement] = useState(false);
  const [companySupplementError, setCompanySupplementError] = useState<string | null>(null);

  const effectiveCompanyId =
    (propCompanyId && propCompanyId.trim()) ||
    (userProfile?.companyId && userProfile.companyId.trim()) ||
    '';

  const loadData = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setLoadError(null);
      let caseList: MaternityCase[] = [];

      if (role === 'ADMIN') {
        const [caseRes, allCompanies, allWorkers] = await Promise.all([
          firmService.getAllMaternityCases().catch((err) => {
            console.error('getAllMaternityCases failed', err);
            throw err;
          }),
          firmService.getAllCompanies().catch(() => []),
          firmService.getAllWorkers().catch(() => []),
        ]);

        caseList = caseRes || [];
        const compMap: Record<string, Company> = {};
        (allCompanies || []).forEach((c) => {
          if (c?.id) compMap[c.id] = c;
        });
        setCompanies(compMap);

        const wMap: Record<string, Worker> = {};
        (allWorkers || []).forEach((w) => {
          if (w?.id) wMap[w.id] = w;
        });
        setWorkers(wMap);
        setAvailableWorkers(allWorkers || []);
      } else if (role === 'COMPANY') {
        if (effectiveCompanyId) {
          const [caseRes, compWorkers] = await Promise.all([
            firmService.getMaternityCasesByCompany(effectiveCompanyId).catch((err) => {
              console.error('getMaternityCasesByCompany failed', err);
              throw err;
            }),
            firmService.getWorkersByCompany(effectiveCompanyId).catch(() => []),
          ]);

          caseList = caseRes || [];
          const wMap: Record<string, Worker> = {};
          (compWorkers || []).forEach((w) => {
            if (w?.id) wMap[w.id] = w;
          });
          setWorkers(wMap);
          setAvailableWorkers(compWorkers || []);
        } else {
          caseList = [];
          setWorkers({});
          setAvailableWorkers([]);
        }
      } else if (role === 'WORKER') {
        if (effectiveCompanyId) {
          const compWorkers = await firmService.getWorkersByCompany(effectiveCompanyId).catch(() => []);
          const currentWorker = (compWorkers || []).find(
            (w) =>
              (w.userId && w.userId === currentUser.uid) ||
              (w.email && w.email === currentUser.email)
          );
          if (currentWorker) {
            caseList = (await firmService.getMaternityCasesByEmployee(currentWorker.id).catch(() => [])) || [];
            setWorkers({ [currentWorker.id]: currentWorker });
            setAvailableWorkers([currentWorker]);
          } else {
            caseList = [];
          }
        } else {
          caseList = [];
        }
      }

      setCases(caseList || []);

      // If a case was currently selected, refresh its reference safely
      if (selectedCase) {
        const updatedSelected = (caseList || []).find((c) => c.id === selectedCase.id);
        if (updatedSelected) {
          setSelectedCase(updatedSelected);
        }
      }
    } catch (err: any) {
      console.error('Failed to load maternity cases', err);
      const isPermissionDenied =
        err?.message?.includes('permission-denied') ||
        err?.message?.includes('Missing or insufficient permissions') ||
        err?.message?.includes('PERMISSION_DENIED');
      const friendlyMessage = isPermissionDenied
        ? '모성보호 업무 데이터에 접근할 수 있는 권한이 없거나 조회가 제한되었습니다. 관리자 권한 및 소속 계정을 확인해주세요.'
        : '모성보호 업무 데이터를 불러오는 중 통신 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      setLoadError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser, role, effectiveCompanyId]);

  // When opening a case in detail view, reset sub-states safely
  const handleOpenCaseDetail = (c: MaternityCase) => {
    setSelectedCase(c);
    setAdminTargetStatus(c.status);
    setAdminStatusNote('');
    setAdminSupplementContent(c.supplementRequest?.content || '');
    setAdminCancelReason('');
    setAdminAssignedAttorney(c.assignedAttorneyId || '');
    setAdminStatusError(null);
    setCompanyResponseNote('');
    setCompanySupplementError(null);
    setIsAdminConfirmOpen(false);
    setIsCompanyConfirmOpen(false);
    setPrivateNoteSavedNotice(false);

    // If supplement requested, open supplement tab by default
    if (c.status === 'SUPPLEMENT_REQUESTED' || c.supplementRequest) {
      setDetailTab('supplement');
    } else {
      setDetailTab('basic');
    }

    // Requirement 3: internalNotes isolated access strictly for ADMIN
    if (role === 'ADMIN' && currentUser) {
      setIsLoadingPrivateNotes(true);
      firmService
        .getMaternityCasePrivate(c.id)
        .then((pDoc) => {
          if (pDoc && pDoc.internalNotes) {
            setAdminPrivateNotes(pDoc.internalNotes);
          } else if (c.internalNotes) {
            // Safe migration: legacy data exists in maternity_cases; move to private collection and remove from public
            setAdminPrivateNotes(c.internalNotes);
            firmService.migrateLegacyInternalNotes(c.id, c.internalNotes, currentUser.uid);
          } else {
            setAdminPrivateNotes('');
          }
        })
        .catch((err) => {
          console.warn('Failed to load private notes', err);
          setAdminPrivateNotes(c.internalNotes || '');
        })
        .finally(() => {
          setIsLoadingPrivateNotes(false);
        });
    } else {
      // Non-admins never receive or store internalNotes
      setAdminPrivateNotes('');
    }
  };

  // Auto select case if navigated from Task (R3-3 3/3-B & R3-3 3/3-B-④-A)
  const autoOpenedCaseRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!initialCaseId) {
      autoOpenedCaseRef.current = null;
      return;
    }
    if (autoOpenedCaseRef.current === initialCaseId) return;
    if (selectedCase && selectedCase.id === initialCaseId) {
      autoOpenedCaseRef.current = initialCaseId;
      return;
    }

    if (cases.length > 0) {
      const match = cases.find((c) => c.id === initialCaseId);
      if (match) {
        autoOpenedCaseRef.current = initialCaseId;
        handleOpenCaseDetail(match);
        return;
      }
    }

    let isCancelled = false;
    firmService
      .getMaternityCaseById(initialCaseId)
      .then((c) => {
        if (c && !isCancelled) {
          autoOpenedCaseRef.current = initialCaseId;
          handleOpenCaseDetail(c);
        }
      })
      .catch((err) => {
        console.warn('Failed to load initial maternity case directly:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [initialCaseId, cases]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateModalError(null);
    const targetCompanyId = role === 'ADMIN' ? adminSelectedCompanyId : effectiveCompanyId;

    if (!targetCompanyId || !selectedWorkerId || !startDate || !endDate || !currentUser) {
      setCreateModalError('필수 항목(소속 기업, 근로자, 시작일, 종료일)을 모두 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const selectedTypeConfig = MATERNITY_WORK_TYPES[selectedWorkType];
      const initialDocList = ((selectedTypeConfig && selectedTypeConfig.requiredDocuments) || []).map(
        (docName) => ({
          name: docName,
          status: 'PENDING' as const,
          requestedAt: new Date().toISOString(),
        })
      );

      const now = new Date().toISOString();
      await firmService.createMaternityCase({
        companyId: targetCompanyId,
        employeeId: selectedWorkerId,
        workType: selectedWorkType,
        applicationDate,
        startDate,
        endDate,
        returnDate: returnDate || undefined,
        status: 'APPLIED',
        submittedDocuments: initialDocList,
        internalNotes: internalNotes.trim() || undefined,
        createdById: currentUser.uid,
        updatedById: currentUser.uid,
        history: [
          {
            action: '모성보호 업무 접수',
            previousStatus: undefined,
            newStatus: 'APPLIED',
            timestamp: now,
            actor: userProfile?.displayName || '관리자',
            actorUid: currentUser.uid,
            notes: `${getMaternityWorkTypeLabel(selectedWorkType)} 신청 등록`,
          },
        ],
      });

      setIsCreateModalOpen(false);
      setSelectedWorkerId('');
      setStartDate('');
      setEndDate('');
      setReturnDate('');
      setInternalNotes('');
      setCreateModalError(null);
      await loadData();
    } catch (err: any) {
      console.error('Failed to create maternity case', err);
      setCreateModalError('모성보호 업무 등록 중 오류가 발생했습니다. 입력 정보를 확인 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ADMIN Status Change Request Trigger (R2-4 1/3-B-1 & B-2 Requirement 1, 2, 3)
  const handleInitiateAdminStatusChange = () => {
    setAdminStatusError(null);
    if (!selectedCase) return;

    // Requirement 1: COMPLETED 상태의 건은 기본적으로 수정 잠금 처리
    if (selectedCase.status === 'COMPLETED') {
      setAdminStatusError('완료(COMPLETED) 처리된 건은 수정이 잠금되어 상태를 변경할 수 없습니다.');
      return;
    }

    if (adminTargetStatus === selectedCase.status) {
      setAdminStatusError('현재 상태와 동일한 상태입니다. 변경할 다른 상태를 선택해주세요.');
      return;
    }

    // Requirement 2: 취소 시 반드시 사유를 입력
    if (adminTargetStatus === 'CANCELLED') {
      if (!adminCancelReason || !adminCancelReason.trim()) {
        setAdminStatusError('취소 처리 시 [취소 사유]는 필수 입력 항목입니다. 취소 사유를 반드시 입력해주세요.');
        return;
      }
    }

    // Requirement 3: 보완요청 내용이 비어 있으면 저장할 수 없습니다.
    if (adminTargetStatus === 'SUPPLEMENT_REQUESTED') {
      if (!adminSupplementContent || !adminSupplementContent.trim()) {
        setAdminStatusError('보완요청 시 [보완요청 내용]은 필수 입력 항목입니다. 구체적인 요청 사항을 입력해주세요.');
        return;
      }
    }

    setIsAdminConfirmOpen(true);
  };

  // ADMIN Status Change Confirmed Execution (R2-4 1/3-B-2 Requirement 1, 2, 3, 5)
  const handleConfirmAdminStatusChange = async () => {
    if (!selectedCase || !currentUser) return;
    try {
      setIsUpdatingStatus(true);
      setAdminStatusError(null);
      const now = new Date().toISOString();
      const statusConfig = getMaternityStatusConfig(adminTargetStatus);

      let actionTitle = `상태 변경: ${statusConfig.label}`;
      let changeNotes: string | undefined = adminStatusNote.trim() || undefined;

      if (adminTargetStatus === 'COMPLETED') {
        actionTitle = '모성보호 업무 완료 처리';
        changeNotes = adminStatusNote.trim() || '법정 절차 및 모성보호 업무 완료';
      } else if (adminTargetStatus === 'CANCELLED') {
        actionTitle = '모성보호 업무 취소';
        changeNotes = `[취소 사유] ${adminCancelReason.trim()}`;
      } else if (adminTargetStatus === 'SUPPLEMENT_REQUESTED') {
        actionTitle = '보완요청 (서류/내용 보완)';
        changeNotes = adminSupplementContent.trim();
      }

      // Requirement 2: history에 이전 상태, 변경 상태, 변경일시, 변경자 UID, 변경 사유/메모 누적
      const newHistoryItem: MaternityCaseHistoryItem = {
        action: actionTitle,
        previousStatus: selectedCase.status,
        newStatus: adminTargetStatus,
        timestamp: now,
        actor: userProfile?.displayName || '공인노무사/관리자',
        actorUid: currentUser.uid,
        notes: changeNotes,
      };

      const updatedHistory = [...(selectedCase.history || []), newHistoryItem];

      const updatePayload: Partial<MaternityCase> = {
        status: adminTargetStatus,
        updatedById: currentUser.uid,
        history: updatedHistory,
      };

      // Requirement 1: 완료 시 completedAt, completedById 기록
      if (adminTargetStatus === 'COMPLETED') {
        updatePayload.completedAt = now;
        updatePayload.completedById = currentUser.uid;
      }

      // Requirement 3: 보완요청 내용, 요청일시, 요청자 기록
      if (adminTargetStatus === 'SUPPLEMENT_REQUESTED') {
        const supplementReq: MaternitySupplementRequest = {
          content: adminSupplementContent.trim(),
          requestedAt: now,
          requestedById: currentUser.uid,
          requestedByName: userProfile?.displayName || '공인노무사/관리자',
          responseNotes: undefined,
          respondedAt: undefined,
          respondedById: undefined,
          respondedByName: undefined,
        };
        updatePayload.supplementRequest = supplementReq;
      }

      // Requirement 3: internalNotes 보안 (maternity_case_private 격리 저장, maternity_cases에는 비저장)
      if (changeNotes) {
        const newPrivateEntry = `[${new Date().toLocaleDateString('ko-KR')} ${actionTitle}] ${changeNotes}`;
        const updatedPrivateNotes = adminPrivateNotes
          ? `${adminPrivateNotes}\n${newPrivateEntry}`
          : newPrivateEntry;
        await firmService.saveMaternityCasePrivate(selectedCase.id, updatedPrivateNotes, currentUser.uid);
        setAdminPrivateNotes(updatedPrivateNotes);
      }

      // Update public maternity case (internalNotes excluded)
      // [R2-8 2/4-A-⑥-9 & ⑥-10] 최초 업무 착수 트리거 (UNDER_REVIEW, IN_PROGRESS, SUPPLEMENT_REQUESTED, 최초 담당노무사 배정) 시 차감 트랜잭션 연결
      const isAssigningNewAttorney =
        Boolean(adminAssignedAttorney.trim()) &&
        adminAssignedAttorney.trim() !== (selectedCase.assignedAttorneyId || '');

      const shouldTriggerDeduction =
        (adminTargetStatus === 'UNDER_REVIEW' ||
          adminTargetStatus === 'IN_PROGRESS' ||
          adminTargetStatus === 'SUPPLEMENT_REQUESTED' ||
          isAssigningNewAttorney) &&
        (!selectedCase.deductionInfo || !selectedCase.deductionInfo.deductionId);

      let resultingDeductionInfo: import('../../../types').MaternityCaseDeductionInfo | undefined =
        selectedCase.deductionInfo;

      if (adminAssignedAttorney.trim()) {
        updatePayload.assignedAttorneyId = adminAssignedAttorney.trim();
      }

      if (shouldTriggerDeduction) {
        // 미차감 사건: 차감 + 상태/담당자/보완요청을 단일 Firestore Transaction에서 원자적으로 처리
        const transitionResult = await firmService.transitionMaternityCaseStatusWithDeduction({
          caseId: selectedCase.id,
          targetCompanyId: selectedCase.companyId,
          targetStatus: adminTargetStatus,
          currentUser,
          callerRole: role,
          callerDisplayName: userProfile?.displayName,
          newHistoryItem,
          assignedAttorneyId: adminAssignedAttorney.trim() || undefined,
          extraCaseUpdates: {
            updatedById: currentUser.uid,
            ...(adminAssignedAttorney.trim() ? { assignedAttorneyId: adminAssignedAttorney.trim() } : {}),
            ...(adminTargetStatus === 'COMPLETED' ? { completedAt: now, completedById: currentUser.uid } : {}),
            ...(adminTargetStatus === 'SUPPLEMENT_REQUESTED' ? { supplementRequest: updatePayload.supplementRequest } : {}),
          },
          notes: changeNotes,
        });
        resultingDeductionInfo = transitionResult.caseDeductionInfo;
      } else {
        // 이미 차감되었거나 차감 대상 외 상태로의 전이: 기존대로 updateMaternityCase 호출
        await firmService.updateMaternityCase(selectedCase.id, updatePayload);
      }

      // Requirement 5: Audit Log 기록 (internalNotes/보완요청 원문 미포함)
      let auditAction = 'MATERNITY_STATUS_CHANGED';
      if (adminTargetStatus === 'COMPLETED') {
        auditAction = 'MATERNITY_COMPLETED';
      } else if (adminTargetStatus === 'CANCELLED') {
        auditAction = 'MATERNITY_CANCELLED';
      } else if (adminTargetStatus === 'SUPPLEMENT_REQUESTED') {
        auditAction = 'MATERNITY_SUPPLEMENT_REQUESTED';
      }

      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: role,
        actorName: userProfile?.displayName || '관리자',
        companyId: selectedCase.companyId,
        action: auditAction,
        resourceType: 'maternity_cases',
        resourceId: selectedCase.id,
        details: {
          previousStatus: selectedCase.status,
          newStatus: adminTargetStatus,
          workType: selectedCase.workType,
          employeeId: selectedCase.employeeId,
          companyId: selectedCase.companyId,
          isDeducted: Boolean(resultingDeductionInfo?.deductionId),
          deductionSource: resultingDeductionInfo?.source,
          assignedAttorneyId: updatePayload.assignedAttorneyId || selectedCase.assignedAttorneyId,
          ...(adminTargetStatus === 'COMPLETED' ? { completedAt: now } : {}),
          ...(adminTargetStatus === 'CANCELLED' ? { hasCancellationReason: true } : {}),
          ...(adminTargetStatus === 'SUPPLEMENT_REQUESTED' ? { hasSupplementContent: true } : {}),
        },
      });

      const updatedCase: MaternityCase = {
        ...selectedCase,
        ...updatePayload,
        deductionInfo: resultingDeductionInfo,
        updatedAt: now,
      };

      setSelectedCase(updatedCase);
      setIsAdminConfirmOpen(false);
      setAdminStatusNote('');
      setAdminSupplementContent('');
      setAdminCancelReason('');
      setAdminAssignedAttorney('');
      await loadData();
    } catch (err: any) {
      console.error('Failed to update status', err);
      setAdminStatusError(err?.message || '상태 변경 중 오류가 발생했습니다. 권한 및 네트워크를 확인해주세요.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // ADMIN Direct Save of Private Internal Notes (Requirement 3: maternity_case_private/{caseId})
  const handleSavePrivateNotes = async () => {
    if (!selectedCase || !currentUser || role !== 'ADMIN') return;
    try {
      setIsSavingPrivateNotes(true);
      await firmService.saveMaternityCasePrivate(selectedCase.id, adminPrivateNotes.trim(), currentUser.uid);
      setPrivateNoteSavedNotice(true);
      setTimeout(() => setPrivateNoteSavedNotice(false), 2500);
    } catch (err: any) {
      console.error('Failed to save private note', err);
      setAdminStatusError('내부 메모 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingPrivateNotes(false);
    }
  };

  // COMPANY Supplement Resubmission Trigger (R2-4 1/3-B-1 Requirement 5)
  const handleInitiateCompanySupplementSubmit = () => {
    setCompanySupplementError(null);
    if (!companyResponseNote || !companyResponseNote.trim()) {
      setCompanySupplementError('보완 제출 메모를 입력해주세요. 보완 조치 내역 또는 소명 내용을 구체적으로 작성해야 합니다.');
      return;
    }
    setIsCompanyConfirmOpen(true);
  };

  // COMPANY Supplement Resubmission Confirmed (R2-4 1/3-B-1 & B-2 Requirement 5: SUPPLEMENT_REQUESTED -> UNDER_REVIEW)
  const handleConfirmCompanySupplementSubmit = async () => {
    if (!selectedCase || !currentUser) return;
    try {
      setIsSubmittingSupplement(true);
      setCompanySupplementError(null);
      const now = new Date().toISOString();

      const newHistoryItem: MaternityCaseHistoryItem = {
        action: '보완 내용 제출 (검토 요청)',
        previousStatus: 'SUPPLEMENT_REQUESTED',
        newStatus: 'UNDER_REVIEW',
        timestamp: now,
        actor: userProfile?.displayName || '기업 담당자',
        actorUid: currentUser.uid,
        notes: companyResponseNote.trim(),
      };

      const updatedHistory = [...(selectedCase.history || []), newHistoryItem];

      const updatedSupplement: MaternitySupplementRequest = {
        content: selectedCase.supplementRequest?.content || '보완 요청',
        requestedAt: selectedCase.supplementRequest?.requestedAt || now,
        requestedById: selectedCase.supplementRequest?.requestedById || '',
        requestedByName: selectedCase.supplementRequest?.requestedByName,
        responseNotes: companyResponseNote.trim(),
        respondedAt: now,
        respondedById: currentUser.uid,
        respondedByName: userProfile?.displayName || '기업 담당자',
      };

      await firmService.updateMaternityCase(selectedCase.id, {
        companyId: selectedCase.companyId, // Maintain strict tenant isolation
        status: 'UNDER_REVIEW', // Strict transition to UNDER_REVIEW
        supplementRequest: updatedSupplement,
        history: updatedHistory,
        updatedById: currentUser.uid,
      });

      // Requirement 5: Audit Log 기록 (MATERNITY_SUPPLEMENT_SUBMITTED)
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: 'COMPANY',
        actorName: userProfile?.displayName || '기업 담당자',
        companyId: selectedCase.companyId,
        action: 'MATERNITY_SUPPLEMENT_SUBMITTED',
        resourceType: 'maternity_cases',
        resourceId: selectedCase.id,
        details: {
          previousStatus: 'SUPPLEMENT_REQUESTED',
          newStatus: 'UNDER_REVIEW',
          workType: selectedCase.workType,
          employeeId: selectedCase.employeeId,
          companyId: selectedCase.companyId,
          responseSubmitted: true,
        },
      });

      const updatedCase: MaternityCase = {
        ...selectedCase,
        status: 'UNDER_REVIEW',
        supplementRequest: updatedSupplement,
        history: updatedHistory,
        updatedAt: now,
        updatedById: currentUser.uid,
      };

      setSelectedCase(updatedCase);
      setIsCompanyConfirmOpen(false);
      setCompanyResponseNote('');
      await loadData();
    } catch (err: any) {
      console.error('Failed to submit supplement', err);
      setCompanySupplementError(err?.message || '보완 제출 중 오류가 발생했습니다. 권한을 확인해주세요.');
    } finally {
      setIsSubmittingSupplement(false);
    }
  };

  // Filtered cases strictly by company, status, type, and worker name (Requirement 5)
  const filteredCases = (cases || []).filter((c) => {
    if (!c) return false;
    const matchesCompany = companyFilter === 'ALL' || c.companyId === companyFilter;
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || c.workType === typeFilter;
    const workerName = (c.employeeId && workers[c.employeeId]?.name) || '';
    const typeLabel = getMaternityWorkTypeLabel(c.workType);
    const cleanSearch = searchQuery.trim().toLowerCase();

    const matchesSearch =
      !cleanSearch ||
      workerName.toLowerCase().includes(cleanSearch) ||
      typeLabel.toLowerCase().includes(cleanSearch);

    return matchesCompany && matchesStatus && matchesType && matchesSearch;
  });

  // Filter available workers in create modal for ADMIN (strictly by chosen companyId)
  const modalWorkers =
    role === 'ADMIN'
      ? adminSelectedCompanyId
        ? availableWorkers.filter((w) => w.companyId === adminSelectedCompanyId)
        : []
      : availableWorkers;

  // Calculate Stepper position for R2-4 1/3-B-1 Requirement 1
  const getStepperIndex = (status: MaternityStatus): number => {
    if (status === 'SUPPLEMENT_REQUESTED') return 2; // Held at review stage
    if (status === 'CANCELLED') return -1;
    return PRIMARY_STATUS_FLOW.indexOf(status);
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
              일·가정 양립 지원
            </span>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200">
              모성보호 업무
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <HeartHandshake className="h-6 w-6 text-rose-600" />
            {title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>

        {(role === 'COMPANY' || role === 'ADMIN') && (
          <button
            onClick={() => {
              setCreateModalError(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition active:scale-95"
          >
            <Plus className="h-4 w-4" />
            새 모성보호 업무 등록
          </button>
        )}
      </div>

      {/* Filter Bar (Requirement 5: 기업, 업무유형, 상태, 근로자 검색) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Company Filter (Admin Only) */}
          {role === 'ADMIN' && (
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-slate-800 focus:outline-none"
            >
              <option value="ALL">전체 기업 ({Object.keys(companies).length})</option>
              {Object.values(companies).map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.companyName}
                </option>
              ))}
            </select>
          )}

          {/* Work Type Filter (8 Statutory Types) */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-slate-800 focus:outline-none"
          >
            <option value="ALL">전체 업무 유형</option>
            {Object.keys(MATERNITY_WORK_TYPES).map((wt) => (
              <option key={wt} value={wt}>
                {MATERNITY_WORK_TYPES[wt as MaternityWorkType].label}
              </option>
            ))}
          </select>

          {/* Status Filter (Primary & Additional Statuses) */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-slate-800 focus:outline-none"
          >
            <option value="ALL">전체 상태 ({cases.length})</option>
            <optgroup label="기본 진행 상태">
              {PRIMARY_STATUS_FLOW.map((st) => (
                <option key={st} value={st}>
                  {MATERNITY_STATUS_CONFIG[st].label}
                </option>
              ))}
            </optgroup>
            <optgroup label="추가 상태">
              {ADDITIONAL_STATUS_FLOW.map((st) => (
                <option key={st} value={st}>
                  {MATERNITY_STATUS_CONFIG[st].label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Worker Search */}
        <div className="relative w-full sm:w-60">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="근로자 성명 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-slate-800 focus:outline-none"
          />
        </div>
      </div>

      {/* Main Table (Requirement 5: 근로자, 기업, 업무유형, 기간, 현재 상태 중심) */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
            <span>모성보호 업무 데이터를 안전하게 불러오는 중입니다...</span>
          </div>
        ) : loadError ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="max-w-md">
              <h3 className="text-sm font-bold text-slate-900 mb-1">데이터 조회 안내</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{loadError}</p>
            </div>
            <button
              onClick={loadData}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              다시 시도
            </button>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <HeartHandshake className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">등록된 모성보호 업무가 없습니다.</p>
              <p className="text-xs text-slate-500 mt-1">
                신규 모성보호 제도를 신청하거나 등록하여 일정 및 서류 관리를 시작하세요.
              </p>
            </div>
            {(role === 'ADMIN' || role === 'COMPANY') && (
              <button
                onClick={() => {
                  setCreateModalError(null);
                  setIsCreateModalOpen(true);
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition"
              >
                <Plus className="h-4 w-4" />
                새 모성보호 업무 등록
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-medium">대상 근로자</th>
                  {role === 'ADMIN' && <th className="py-3 px-4 font-medium">소속 기업</th>}
                  <th className="py-3 px-4 font-medium">업무 유형</th>
                  <th className="py-3 px-4 font-medium">기간</th>
                  <th className="py-3 px-4 font-medium">현재 상태</th>
                  <th className="py-3 px-4 font-medium text-right">상세/처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.map((c) => {
                  const workerObj = c.employeeId ? workers[c.employeeId] : undefined;
                  const companyObj = c.companyId ? companies[c.companyId] : undefined;
                  const statusConfig = getMaternityStatusConfig(c.status);
                  const typeLabel = getMaternityWorkTypeLabel(c.workType);

                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleOpenCaseDetail(c)}
                      className="hover:bg-slate-50/75 cursor-pointer transition"
                    >
                      {/* 1. 근로자 */}
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400" />
                          <div>
                            <div className="font-semibold">{workerObj?.name || c.employeeId}</div>
                            {workerObj?.department && (
                              <div className="text-[11px] text-slate-400">
                                {workerObj.department} {workerObj.position && `· ${workerObj.position}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. 기업 (ADMIN) */}
                      {role === 'ADMIN' && (
                        <td className="py-3.5 px-4 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            <span>{companyObj?.companyName || c.companyId}</span>
                          </div>
                        </td>
                      )}

                      {/* 3. 업무 유형 */}
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 border border-rose-200">
                          {typeLabel}
                        </span>
                      </td>

                      {/* 4. 기간 */}
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {c.startDate} ~ {c.endDate}
                      </td>

                      {/* 5. 현재 상태 */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            statusConfig.badge
                          }`}
                        >
                          {statusConfig.label}
                        </span>
                      </td>

                      {/* 상세 보기 */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="text-indigo-600 font-semibold hover:underline">상세보기</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Case Detail Modal (Requirement 1, 2, 3, 4, 5, 6) */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                      getMaternityStatusConfig(selectedCase.status).badge
                    }`}
                  >
                    {getMaternityStatusConfig(selectedCase.status).label}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {companies[selectedCase.companyId]?.companyName || selectedCase.companyId}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  {getMaternityWorkTypeLabel(selectedCase.workType)}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    ({workers[selectedCase.employeeId]?.name || selectedCase.employeeId})
                  </span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => setIsTaskModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition shadow-2xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    할 일로 추가
                  </button>
                )}
                <button
                  onClick={() => setSelectedCase(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Task Created Success Alert */}
            {taskCreatedMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="font-medium">{taskCreatedMessage}</span>
              </div>
            )}

            {/* Requirement 1: COMPLETED 상태의 수정 잠금 배너 */}
            {selectedCase.status === 'COMPLETED' && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs text-emerald-900 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white shrink-0">
                    <Lock className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-bold">업무 완료 (수정 잠금): </span>
                    <span>본 모성보호 업무는 정상 완료 처리되어 추가 수정이 잠금되었습니다.</span>
                  </div>
                </div>
                {selectedCase.completedAt && (
                  <span className="font-mono text-[11px] text-emerald-700 bg-white/70 px-2 py-0.5 rounded border border-emerald-200">
                    완료일시: {new Date(selectedCase.completedAt).toLocaleDateString('ko-KR')}
                  </span>
                )}
              </div>
            )}

            {/* R2-4 1/3-B-1 Requirement 1: 기본 처리 흐름 진행 단계 (신청 -> 서류수집 -> 검토 -> 처리중 -> 완료) */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-800">업무 진행 단계</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    getMaternityStatusConfig(selectedCase.status).badge
                  }`}
                >
                  현재: {getMaternityStatusConfig(selectedCase.status).label}
                </span>
              </div>

              {/* 5-Step Stepper */}
              <div className="relative flex items-center justify-between pt-1 pb-1">
                {PRIMARY_STATUS_FLOW.map((flowStatus, idx) => {
                  const currentIdx = getStepperIndex(selectedCase.status);
                  const isCurrent = flowStatus === selectedCase.status;
                  const isPassed = currentIdx > idx;
                  const isHeldOnSupplement = selectedCase.status === 'SUPPLEMENT_REQUESTED' && flowStatus === 'UNDER_REVIEW';

                  return (
                    <React.Fragment key={flowStatus}>
                      <div className="flex flex-col items-center z-10">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition ${
                            isHeldOnSupplement
                              ? 'bg-rose-600 text-white ring-4 ring-rose-100'
                              : isCurrent
                              ? 'bg-slate-900 text-white ring-4 ring-slate-200'
                              : isPassed
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white border-2 border-slate-200 text-slate-400'
                          }`}
                        >
                          {isPassed ? (
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                          ) : isHeldOnSupplement ? (
                            <AlertTriangle className="h-3.5 w-3.5 stroke-[2.5]" />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <span
                          className={`mt-1.5 text-[11px] ${
                            isHeldOnSupplement
                              ? 'font-bold text-rose-700'
                              : isCurrent
                              ? 'font-bold text-slate-900'
                              : isPassed
                              ? 'font-semibold text-slate-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {MATERNITY_STATUS_CONFIG[flowStatus].label}
                        </span>
                      </div>

                      {/* Connecting Line */}
                      {idx < PRIMARY_STATUS_FLOW.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 mx-1 transition ${
                            currentIdx > idx ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Status Specific Helper Alert */}
              {selectedCase.status === 'SUPPLEMENT_REQUESTED' && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">보완 요청 상태:</span> 서류 또는 신청 내용에 대한 보완이
                    필요합니다. 기업에서 보완 내용을 작성하여 제출하면 자동으로 [검토] 상태로 복귀합니다.
                  </div>
                </div>
              )}
              {selectedCase.status === 'CANCELLED' && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-100 p-2.5 text-xs text-slate-700">
                  <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">신청 취소:</span> 본 건은 취소 또는 종결 처리된 상태입니다.
                  </div>
                </div>
              )}
            </div>

            {/* Sub-tabs: 기본정보, 일정, 제출서류, 보완요청, 처리이력, 관리자 메모(ADMIN only) */}
            <div className="flex items-center gap-1 border-b border-slate-100 text-xs overflow-x-auto">
              <button
                onClick={() => setDetailTab('basic')}
                className={`px-3 py-2 font-medium border-b-2 transition whitespace-nowrap ${
                  detailTab === 'basic'
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                기본정보
              </button>
              <button
                onClick={() => setDetailTab('dates')}
                className={`px-3 py-2 font-medium border-b-2 transition whitespace-nowrap ${
                  detailTab === 'dates'
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                일정
              </button>
              <button
                onClick={() => setDetailTab('docs')}
                className={`px-3 py-2 font-medium border-b-2 transition whitespace-nowrap ${
                  detailTab === 'docs'
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                제출서류 ({selectedCase.submittedDocuments?.length || 0})
              </button>

              {/* Supplement Tab (Visible if supplement requested or history exists) */}
              {(selectedCase.supplementRequest || selectedCase.status === 'SUPPLEMENT_REQUESTED') && (
                <button
                  onClick={() => setDetailTab('supplement')}
                  className={`px-3 py-2 font-medium border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                    detailTab === 'supplement'
                      ? 'border-rose-600 text-rose-700 font-semibold'
                      : 'border-transparent text-rose-600/80 hover:text-rose-700'
                  }`}
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  보완요청 현황
                  {selectedCase.status === 'SUPPLEMENT_REQUESTED' && (
                    <span className="rounded-full bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0.2 font-bold">
                      대기
                    </span>
                  )}
                </button>
              )}

              <button
                onClick={() => setDetailTab('history')}
                className={`px-3 py-2 font-medium border-b-2 transition whitespace-nowrap ${
                  detailTab === 'history'
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                처리이력 ({selectedCase.history?.length || 0})
              </button>

              {/* Requirement 3 & 4: ADMIN 내부메모는 표시하지 마세요 (Strict Isolation: Only ADMIN) */}
              {role === 'ADMIN' && (
                <button
                  onClick={() => setDetailTab('notes')}
                  className={`px-3 py-2 font-medium border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                    detailTab === 'notes'
                      ? 'border-slate-900 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                  관리자 메모
                </button>
              )}
            </div>

            {/* Tab 1: 기본정보 */}
            {detailTab === 'basic' && (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400 font-medium">대상 근로자</span>
                    <span className="font-semibold text-slate-800">
                      {workers[selectedCase.employeeId]?.name || selectedCase.employeeId}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400 font-medium">소속 기업</span>
                    <span className="font-semibold text-slate-800">
                      {companies[selectedCase.companyId]?.companyName || selectedCase.companyId}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400 font-medium">소속 부서 / 직책</span>
                    <span className="text-slate-800">
                      {workers[selectedCase.employeeId]?.department || '-'} /{' '}
                      {workers[selectedCase.employeeId]?.position || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400 font-medium">담당 공인노무사</span>
                    <span className="font-semibold text-slate-800">
                      {selectedCase.assignedAttorneyId ? (
                        <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">
                          {selectedCase.assignedAttorneyId}
                        </span>
                      ) : (
                        <span className="text-slate-400">미배정</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400 font-medium">업무 유형</span>
                    <span className="font-semibold text-slate-800">
                      {getMaternityWorkTypeLabel(selectedCase.workType)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">법정 기준 안내</span>
                    <span className="text-slate-600 text-right max-w-xs leading-relaxed">
                      {MATERNITY_WORK_TYPES[selectedCase.workType]?.statutoryPeriod ||
                        '사내 규정 및 법령 개정 사항 준용'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100 text-[11px] text-blue-800 leading-relaxed">
                  {MATERNITY_WORK_TYPES[selectedCase.workType]?.description || '모성보호 제도 안내'}
                </div>
              </div>
            )}

            {/* Tab 2: 일정 */}
            {detailTab === 'dates' && (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-medium">신청일자</span>
                    <span className="font-mono text-slate-800">{selectedCase.applicationDate}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-medium">휴가/단축 시작일</span>
                    <span className="font-mono font-semibold text-blue-700">{selectedCase.startDate}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-medium">휴가/단축 종료일</span>
                    <span className="font-mono font-semibold text-blue-700">{selectedCase.endDate}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500 font-medium">복직 예정일</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {selectedCase.returnDate || '미정'}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 border border-slate-100">
                  복직 예정일 및 휴가 종료일은 급여 마감 및 출근부 연계 시 근무상태 판정에 참조됩니다.
                </div>
              </div>
            )}

            {/* Tab 3: 제출서류 */}
            {detailTab === 'docs' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">법정 필수 제출 서류 목록</span>
                  <span className="text-[11px] text-slate-400">법정 표준 제출 서식</span>
                </div>
                <div className="space-y-2">
                  {selectedCase.submittedDocuments && selectedCase.submittedDocuments.length > 0 ? (
                    selectedCase.submittedDocuments.map((doc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400" />
                          <span className="font-medium text-slate-800">{doc.name}</span>
                        </div>
                        <span className="rounded bg-slate-200 text-slate-700 text-[10px] font-medium px-2 py-0.5">
                          {doc.status === 'PENDING' ? '제출 대기' : doc.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-slate-400 rounded-lg border border-dashed border-slate-200">
                      등록된 제출 서류 항목이 없습니다.
                    </div>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-slate-50 text-[11px] text-slate-500 border border-slate-100 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>실제 서류 첨부 및 업로드 기능은 연계 모듈 개발 시 적용됩니다.</span>
                </div>
              </div>
            )}

            {/* Tab: 보완요청 (R2-4 1/3-B-1 Requirement 4 & 5: COMPANY 보완 확인 및 재제출) */}
            {detailTab === 'supplement' && (
              <div className="space-y-4 text-xs">
                {selectedCase.supplementRequest ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-rose-600" />
                        <span className="font-bold text-rose-900">공인노무사 보완요청 사항</span>
                      </div>
                      <span className="text-[11px] text-rose-700 font-mono">
                        요청일시: {new Date(selectedCase.supplementRequest.requestedAt).toLocaleString('ko-KR')}
                      </span>
                    </div>

                    <div className="bg-white/80 rounded-lg p-3 border border-rose-100 text-rose-950 whitespace-pre-wrap leading-relaxed font-sans">
                      {selectedCase.supplementRequest.content}
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-rose-700 pt-1">
                      <span>요청 담당자: {selectedCase.supplementRequest.requestedByName || '담당 공인노무사/관리자'}</span>
                      {selectedCase.status === 'SUPPLEMENT_REQUESTED' && (
                        <span className="rounded bg-rose-600 text-white font-semibold px-2 py-0.5 text-[10px]">
                          보완 제출 대기중
                        </span>
                      )}
                    </div>

                    {/* Previous Response if already submitted in prior cycle */}
                    {selectedCase.supplementRequest.responseNotes && (
                      <div className="mt-3 pt-3 border-t border-rose-100 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-800">이전 기업 보완 제출 내용</span>
                          {selectedCase.supplementRequest.respondedAt && (
                            <span className="font-mono text-slate-500">
                              제출일시: {new Date(selectedCase.supplementRequest.respondedAt).toLocaleString('ko-KR')}
                            </span>
                          )}
                        </div>
                        <div className="bg-white rounded-lg p-2.5 border border-slate-200 text-slate-700 leading-relaxed">
                          {selectedCase.supplementRequest.responseNotes}
                        </div>
                        <div className="text-[10px] text-slate-400 text-right">
                          제출자: {selectedCase.supplementRequest.respondedByName || '기업 담당자'}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-center text-slate-400 rounded-lg border border-dashed border-slate-200">
                    현재 보완요청 기록이 없습니다.
                  </div>
                )}

                {/* COMPANY Role: 보완 후 재제출 Form (Requirement 5) */}
                {role === 'COMPANY' && selectedCase.status === 'SUPPLEMENT_REQUESTED' && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-indigo-950 flex items-center gap-1.5">
                        <Send className="h-3.5 w-3.5 text-indigo-600" />
                        보완 내용 작성 및 재제출
                      </h4>
                      <span className="text-[10px] text-indigo-600">제출 시 [검토] 상태로 전환됩니다</span>
                    </div>

                    {companySupplementError && (
                      <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700 text-[11px] flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{companySupplementError}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        보완 조치 내용 / 소명 메모 <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={companyResponseNote}
                        onChange={(e) => {
                          setCompanyResponseNote(e.target.value);
                          setCompanySupplementError(null);
                        }}
                        placeholder="요청받은 보완 서류의 발급 및 보완 진행 내역을 상세히 작성해주세요..."
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:border-slate-800 focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleInitiateCompanySupplementSubmit}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition active:scale-95"
                      >
                        <Send className="h-3.5 w-3.5" />
                        보완 제출 (검토 요청)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: 처리이력 (Requirement 2: 이전 상태, 변경 상태, 변경일시, 변경자 UID, 사유/메모 누적) */}
            {detailTab === 'history' && (
              <div className="space-y-3 text-xs">
                <div className="space-y-2">
                  {selectedCase.history && selectedCase.history.length > 0 ? (
                    selectedCase.history.map((h, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/75 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{h.action}</span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {new Date(h.timestamp).toLocaleString('ko-KR')}
                          </span>
                        </div>

                        {/* Status Transition Badges */}
                        {(h.previousStatus || h.newStatus) && (
                          <div className="flex items-center gap-1.5 text-[11px] py-0.5">
                            {h.previousStatus && (
                              <span
                                className={`rounded px-1.5 py-0.5 border text-[10px] font-medium ${
                                  getMaternityStatusConfig(h.previousStatus).badge
                                }`}
                              >
                                {getMaternityStatusConfig(h.previousStatus).label}
                              </span>
                            )}
                            {h.previousStatus && h.newStatus && (
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                            )}
                            {h.newStatus && (
                              <span
                                className={`rounded px-1.5 py-0.5 border text-[10px] font-medium ${
                                  getMaternityStatusConfig(h.newStatus).badge
                                }`}
                              >
                                {getMaternityStatusConfig(h.newStatus).label}
                              </span>
                            )}
                          </div>
                        )}

                        {h.notes && (
                          <div className="rounded-lg bg-white p-2 border border-slate-100 text-slate-700 leading-relaxed mt-0.5">
                            {h.notes}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                          <span>처리자: {h.actor}</span>
                          {role === 'ADMIN' && h.actorUid && (
                            <span className="font-mono text-[10px]">UID: {h.actorUid}</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-slate-400 rounded-lg border border-dashed border-slate-200">
                      등록된 처리 이력이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 5: 내부메모 (Strict Isolation: ONLY ADMIN from maternity_case_private) */}
            {detailTab === 'notes' && role === 'ADMIN' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                    <h4 className="font-bold text-slate-800">
                      공인노무사 내부 업무 메모 (독립 보안 보관소)
                    </h4>
                  </div>
                  <span className="rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold px-2 py-0.5 text-[10px]">
                    maternity_case_private 격리 컬렉션
                  </span>
                </div>

                <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-2.5 text-[11px] text-amber-800 leading-relaxed">
                  본 메모는 관리자 전용 독립 컬렉션에 암호 저장되며, 기업(COMPANY) 및 근로자(WORKER)의
                  API 조회 문서에 완전히 포함되지 않습니다.
                </div>

                {isLoadingPrivateNotes ? (
                  <div className="p-6 text-center text-slate-400">비공개 내부 메모 로딩 중...</div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      rows={5}
                      value={adminPrivateNotes}
                      onChange={(e) => setAdminPrivateNotes(e.target.value)}
                      placeholder="사건 검토 특이사항, 법적 쟁점, 자문 내역 등 공인노무사 전용 메모를 입력하세요..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-slate-800 text-xs focus:border-slate-800 focus:bg-white focus:outline-none"
                    />

                    <div className="flex items-center justify-between">
                      {privateNoteSavedNotice ? (
                        <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" />
                          내부 메모가 안전하게 저장되었습니다.
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          저장 시 관리자 보안 컬렉션에 즉시 반영됩니다.
                        </span>
                      )}

                      <button
                        onClick={handleSavePrivateNotes}
                        disabled={isSavingPrivateNotes}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isSavingPrivateNotes ? '저장 중...' : '메모 저장'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ADMIN Only: 상태 변경 컨트롤 섹션 (R2-4 1/3-B-1 & B-2 Requirement 1, 2, 3) */}
            {role === 'ADMIN' && (
              <div className="pt-4 border-t border-slate-200 space-y-3 bg-slate-50/60 -mx-6 -mb-6 p-6 rounded-b-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-slate-600" />
                    [관리자 전용] 업무 상태 변경 및 처리
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    현재 상태: <strong>{getMaternityStatusConfig(selectedCase.status).label}</strong>
                  </span>
                </div>

                {/* Requirement 1: COMPLETED 상태의 건은 수정 잠금 처리 (완료 취소/재개 기능 아직 만들지 않음) */}
                {selectedCase.status === 'COMPLETED' ? (
                  <div className="rounded-xl border border-emerald-200 bg-white p-3.5 text-xs text-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-emerald-600" />
                      <span>
                        본 모성보호 업무는 <strong>완료(COMPLETED)</strong> 처리되어 상태 변경 및 수정이
                        잠금되었습니다.
                      </span>
                    </div>
                    <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                      수정 잠금 상태
                    </span>
                  </div>
                ) : (
                  <>
                    {adminStatusError && (
                      <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700 text-xs flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{adminStatusError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          변경할 상태 <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={adminTargetStatus}
                          onChange={(e) => {
                            setAdminTargetStatus(e.target.value as MaternityStatus);
                            setAdminStatusError(null);
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                        >
                          <optgroup label="기본 처리 흐름">
                            {PRIMARY_STATUS_FLOW.map((st) => (
                              <option key={st} value={st}>
                                {MATERNITY_STATUS_CONFIG[st].label} ({st})
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="추가 상태">
                            {ADDITIONAL_STATUS_FLOW.map((st) => (
                              <option key={st} value={st}>
                                {MATERNITY_STATUS_CONFIG[st].label} ({st})
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      <div>
                        {/* Requirement 3: 보완요청 내용 필수 입력 */}
                        {adminTargetStatus === 'SUPPLEMENT_REQUESTED' ? (
                          <div>
                            <label className="block text-[11px] font-medium text-rose-700 mb-1">
                              보완요청 내용 <span className="text-rose-600">* (필수)</span>
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="필요한 서류 및 보완 요청 사항 입력"
                              value={adminSupplementContent}
                              onChange={(e) => {
                                setAdminSupplementContent(e.target.value);
                                setAdminStatusError(null);
                              }}
                              className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-900 focus:border-rose-500 focus:outline-none"
                            />
                          </div>
                        ) : adminTargetStatus === 'CANCELLED' ? (
                          /* Requirement 2: 취소 시 반드시 사유 입력 */
                          <div>
                            <label className="block text-[11px] font-medium text-rose-700 mb-1">
                              취소 사유 <span className="text-rose-600">* (필수)</span>
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="업무 취소 또는 종결 사유를 구체적으로 입력"
                              value={adminCancelReason}
                              onChange={(e) => {
                                setAdminCancelReason(e.target.value);
                                setAdminStatusError(null);
                              }}
                              className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-900 focus:border-rose-500 focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              {adminTargetStatus === 'COMPLETED'
                                ? '완료 처리 메모 (선택)'
                                : '변경 사유 / 메모 (선택)'}
                            </label>
                            <input
                              type="text"
                              placeholder={
                                adminTargetStatus === 'COMPLETED'
                                  ? '최종 종결 의견 또는 완료 메모 입력'
                                  : '검토 의견 또는 변경 사유 입력'
                              }
                              value={adminStatusNote}
                              onChange={(e) => setAdminStatusNote(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        담당 공인노무사 배정 (선택)
                      </label>
                      <input
                        type="text"
                        placeholder={
                          selectedCase.assignedAttorneyId
                            ? `현재: ${selectedCase.assignedAttorneyId}`
                            : '담당 노무사 ID 또는 성명 입력'
                        }
                        value={adminAssignedAttorney}
                        onChange={(e) => setAdminAssignedAttorney(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleInitiateAdminStatusChange}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition active:scale-95"
                      >
                        상태 변경 확인
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Modal Bottom Action Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div>
                {role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => setIsTaskModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl transition shadow-2xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    할 일로 추가
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCase(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN Status Change Confirmation Dialog (Requirement 1 & 2) */}
      {isAdminConfirmOpen && selectedCase && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-600 border-b border-slate-100 pb-3">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold text-slate-900">
                {adminTargetStatus === 'COMPLETED'
                  ? '모성보호 업무 완료 처리 확인'
                  : adminTargetStatus === 'CANCELLED'
                  ? '모성보호 업무 취소 확인'
                  : '모성보호 상태 변경 확인'}
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {adminTargetStatus === 'COMPLETED'
                ? '본 모성보호 업무를 [완료(COMPLETED)] 처리하시겠습니까? 완료 후에는 기본적으로 수정 잠금 처리됩니다.'
                : adminTargetStatus === 'CANCELLED'
                ? '본 모성보호 업무를 [취소(CANCELLED)] 처리하시겠습니까? 취소 사유가 감사 로그 및 처리 이력에 영구 보존됩니다.'
                : '업무 상태를 변경하시겠습니까? 변경 내역은 처리 이력(History)에 누적되어 영구 보존됩니다.'}
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">현재 상태</span>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-medium border ${
                    getMaternityStatusConfig(selectedCase.status).badge
                  }`}
                >
                  {getMaternityStatusConfig(selectedCase.status).label}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">변경될 상태</span>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-bold border ${
                    getMaternityStatusConfig(adminTargetStatus).badge
                  }`}
                >
                  {getMaternityStatusConfig(adminTargetStatus).label}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">처리 담당자</span>
                <span className="font-semibold text-slate-800">
                  {userProfile?.displayName || '관리자'} ({currentUser?.uid.substring(0, 8)}...)
                </span>
              </div>
              {adminAssignedAttorney.trim() && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">배정 담당 노무사</span>
                  <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px]">
                    {adminAssignedAttorney.trim()}
                  </span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2">
                <span className="text-slate-500 block mb-1">
                  {adminTargetStatus === 'SUPPLEMENT_REQUESTED'
                    ? '보완요청 내용'
                    : adminTargetStatus === 'CANCELLED'
                    ? '취소 사유'
                    : '변경 사유/메모'}
                  :
                </span>
                <div className="rounded bg-white p-2 border border-slate-200 text-slate-800 whitespace-pre-wrap">
                  {adminTargetStatus === 'SUPPLEMENT_REQUESTED'
                    ? adminSupplementContent
                    : adminTargetStatus === 'CANCELLED'
                    ? adminCancelReason
                    : adminStatusNote || '(사유 미입력)'}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => setIsAdminConfirmOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={handleConfirmAdminStatusChange}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50"
              >
                {isUpdatingStatus ? '처리 중...' : '확인 및 상태 변경'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPANY Supplement Submit Confirmation Dialog (Requirement 5) */}
      {isCompanyConfirmOpen && selectedCase && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-indigo-600 border-b border-slate-100 pb-3">
              <Send className="h-5 w-5" />
              <h3 className="text-base font-bold text-slate-900">보완 내용 제출 확인</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              작성하신 보완 내용을 제출하시겠습니까? 제출 시 상태가{' '}
              <strong className="text-indigo-600 font-bold">[검토(UNDER_REVIEW)]</strong>로 자동
              전환되며 공인노무사에게 전달됩니다.
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">현재 상태</span>
                <span className="rounded px-2 py-0.5 text-[11px] font-medium border bg-rose-50 text-rose-700 border-rose-200">
                  보완요청 (SUPPLEMENT_REQUESTED)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">제출 후 상태</span>
                <span className="rounded px-2 py-0.5 text-[11px] font-bold border bg-indigo-50 text-indigo-700 border-indigo-200">
                  검토 (UNDER_REVIEW)
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <span className="text-slate-500 block mb-1">제출 보완 메모:</span>
                <div className="rounded bg-white p-2 border border-slate-200 text-slate-800 whitespace-pre-wrap">
                  {companyResponseNote}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSubmittingSupplement}
                onClick={() => setIsCompanyConfirmOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmittingSupplement}
                onClick={handleConfirmCompanySupplementSubmit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {isSubmittingSupplement ? '제출 중...' : '확인 및 보완 제출'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Case Creation Modal (Requirement 4 from R2-4 1/3-A) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">모성보호 업무 신규 등록</h3>
              <button
                onClick={() => {
                  setCreateModalError(null);
                  setIsCreateModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createModalError && (
              <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCase} className="mt-4 space-y-3.5">
              {/* 1. 기업 선택 (ADMIN) */}
              {role === 'ADMIN' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    대상 기업 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={adminSelectedCompanyId}
                    onChange={(e) => {
                      setAdminSelectedCompanyId(e.target.value);
                      setSelectedWorkerId('');
                      setCreateModalError(null);
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                  >
                    <option value="">대상 기업을 선택하세요</option>
                    {Object.values(companies).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} ({c.businessNumber || '사업자번호 미등록'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 2. 해당 기업 근로자 선택 (반드시 선택한 companyId 소속 근로자만 표시, employeeId로 연결) */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  대상 근로자 <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedWorkerId}
                  onChange={(e) => {
                    setSelectedWorkerId(e.target.value);
                    setCreateModalError(null);
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                >
                  <option value="">근로자를 선택하세요</option>
                  {modalWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.department || '부서미지정'} - {w.position || '직원'})
                    </option>
                  ))}
                </select>
                {role === 'ADMIN' && !adminSelectedCompanyId && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    먼저 상단에서 대상 기업을 선택해주세요.
                  </p>
                )}
              </div>

              {/* 3. 업무유형 선택 (8개 법정 유형) */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  모성보호 업무 유형 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedWorkType}
                  onChange={(e) => setSelectedWorkType(e.target.value as MaternityWorkType)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                >
                  {Object.keys(MATERNITY_WORK_TYPES).map((wt) => (
                    <option key={wt} value={wt}>
                      {MATERNITY_WORK_TYPES[wt as MaternityWorkType].label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  {MATERNITY_WORK_TYPES[selectedWorkType]?.statutoryPeriod}
                </p>
              </div>

              {/* 4. 신청일 */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  신청일 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={applicationDate}
                  onChange={(e) => setApplicationDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* 5. 시작일 & 6. 종료일 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    휴가/단축 시작일 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    휴가/단축 종료일 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* 7. 복직예정일 */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  복직 예정일
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* 8. 내부 메모 (저장 시 maternity_case_private로 자동 격리) */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  내부 업무 메모 (공인노무사 비공개 보관)
                </label>
                <textarea
                  rows={3}
                  placeholder="특이사항 또는 관리자 전용 내부 메모를 입력하세요 (maternity_case_private 컬렉션에 독립 저장)..."
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalError(null);
                    setIsCreateModalOpen(false);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isSubmitting ? '신청 중...' : '모성보호 업무 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Creation from Maternity Case Modal (R3-3 3/3-B) */}
      {selectedCase && isTaskModalOpen && (
        <CreateTaskFromSourceModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          sourceType="MATERNITY"
          sourceId={selectedCase.id}
          sourceTitle={`모성보호: ${getMaternityWorkTypeLabel(selectedCase.workType)} (${workers[selectedCase.employeeId]?.name || selectedCase.employeeId})`}
          companyId={selectedCase.companyId}
          workerId={selectedCase.employeeId}
          defaultTitle={`[모성보호] ${getMaternityWorkTypeLabel(selectedCase.workType)} - ${workers[selectedCase.employeeId]?.name || selectedCase.employeeId}`}
          defaultDescription={`기업: ${companies[selectedCase.companyId]?.companyName || selectedCase.companyId}\n근로자: ${workers[selectedCase.employeeId]?.name || selectedCase.employeeId}\n신청제도: ${getMaternityWorkTypeLabel(selectedCase.workType)}\n기간: ${selectedCase.startDate} ~ ${selectedCase.endDate}\n상태: ${getMaternityStatusConfig(selectedCase.status).label}`}
          defaultDueDate={selectedCase.endDate || ''}
          initialCompanies={Object.values(companies)}
          initialWorkers={Object.values(workers)}
          onTaskCreated={() => {
            setTaskCreatedMessage('모성보호 업무가 할 일로 성공적으로 등록되었습니다.');
            setTimeout(() => setTaskCreatedMessage(null), 3500);
          }}
          onNavigateToSource={onNavigateToSource}
        />
      )}
    </div>
  );
};
