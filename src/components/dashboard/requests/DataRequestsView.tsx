import React, { useEffect, useState, useMemo } from 'react';
import { Company, DataRequest, DataRequestFile, DataRequestStatus, UserRole } from '../../../types';
import { dataRequestService } from '../../../services/dataRequestService';
import { firmService } from '../../../services/firmService';
import { auditLogService } from '../../../services/auditLogService';
import { dataRequestStorageService, StorageStatus } from '../../../services/dataRequestStorageService';
import { validateFileForUpload, formatFileSize, MAX_FILE_SIZE_MB } from '../../../lib/fileSecurity';
import { useAuth } from '../../../contexts/AuthContext';
import {
  FileCheck,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  X,
  Check,
  ArrowRight,
  Edit3,
  Trash2,
  Filter,
  RefreshCw,
  FileText,
  Info,
  CalendarDays,
  ShieldCheck,
  SlidersHorizontal,
  Send,
  Upload,
  Download,
  Paperclip,
  File,
  CheckSquare,
} from 'lucide-react';
import { CreateTaskFromSourceModal } from '../admin/CreateTaskFromSourceModal';

interface DataRequestsViewProps {
  role: UserRole;
  companyId?: string;
  initialRequestId?: string;
}

const STATUS_CONFIG: Record<
  DataRequestStatus,
  { label: string; badge: string; bg: string; text: string; border: string; dot: string; desc: string }
> = {
  REQUESTED: {
    label: '요청',
    badge: '요청 (미제출)',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    desc: '회원사에 서류 제출을 요청한 상태입니다.',
  },
  SUBMITTED: {
    label: '제출',
    badge: '제출완료',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    desc: '회원사에서 자료를 제출하여 검토 대기 중입니다.',
  },
  UNDER_REVIEW: {
    label: '검토중',
    badge: '검토중',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
    desc: '담당 노무사가 제출된 서류를 정밀 검토 중입니다.',
  },
  REVISION_REQUESTED: {
    label: '보완요청',
    badge: '보완요청',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    desc: '누락되거나 추가 확인이 필요한 서류의 보완을 요청했습니다.',
  },
  COMPLETED: {
    label: '완료',
    badge: '검토완료 (종결)',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    desc: '모든 자료의 적격성 검토가 완료되어 종결되었습니다.',
  },
};

const PRESET_ITEMS = [
  '월간 임직원 근태 및 출근부 집계표',
  '연장·야간·휴일근로 추가근무 신청/승인서',
  '급여대장 및 수당 지급 내역서',
  '신규 입사자 명단 및 근로계약서 사본',
  '퇴사자 명단 및 4대보험 상실 신고서',
  '기타 급여 정산 증빙자료',
];

export const DataRequestsView: React.FC<DataRequestsViewProps> = ({
  role,
  companyId,
  initialRequestId,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Data States
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Filters State
  const [companyFilter, setCompanyFilter] = useState<string>(companyId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dueDateFilter, setDueDateFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Active Items
  const [selectedRequest, setSelectedRequest] = useState<DataRequest | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<DataRequest | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Form State for New Request
  const [formCompanyId, setFormCompanyId] = useState(companyId || '');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formRequestedItems, setFormRequestedItems] = useState<string[]>([
    '월간 임직원 근태 및 출근부 집계표',
    '급여대장 및 수당 지급 내역서',
  ]);
  const [newItemInput, setNewItemInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State for Edit Request
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editRequestedItems, setEditRequestedItems] = useState<string[]>([]);
  const [editNewItemInput, setEditNewItemInput] = useState('');
  const [editActionNote, setEditActionNote] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Status Change Note
  const [statusChangeNote, setStatusChangeNote] = useState('');
  const [targetStatusToChange, setTargetStatusToChange] = useState<DataRequestStatus | null>(null);
  const [isStatusChanging, setIsStatusChanging] = useState(false);

  // Storage & File Upload States (R2-3 1/3-C)
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [activeUploadedFiles, setActiveUploadedFiles] = useState<DataRequestFile[]>([]);
  const [uploadQueue, setUploadQueue] = useState<
    {
      id: string;
      file: File;
      percent: number;
      status: 'queued' | 'uploading' | 'success' | 'error';
      error?: string;
    }[]
  >([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  // COMPANY Submission State (R2-3 1/3-B)
  const [companySubmissionNote, setCompanySubmissionNote] = useState('');
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState(false);
  const [isSubmittingData, setIsSubmittingData] = useState(false);

  // Check Storage connectivity on mount
  useEffect(() => {
    const checkStorage = async () => {
      try {
        const res = await dataRequestStorageService.checkStorageAvailability();
        setStorageStatus(res);
      } catch (err: any) {
        setStorageStatus({
          isConfigured: false,
          bucketName: '',
          errorMessage: err.message || 'Firebase Storage 설정이 필요합니다.',
        });
      }
    };
    checkStorage();
  }, []);

  // Select request helper
  const handleSelectRequest = (req: DataRequest) => {
    setSelectedRequest(req);
    setCompanySubmissionNote(req.submissionNote || '');
    setActiveUploadedFiles(req.submittedFiles || []);
    setUploadQueue([]);
  };

  // [R3-3 3/3-B-④-A] 할 일에서 원본 업무 이동 시 해당 자료요청 상세 모달 자동 오픈
  const autoOpenedRequestRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!initialRequestId) {
      autoOpenedRequestRef.current = null;
      return;
    }
    if (autoOpenedRequestRef.current === initialRequestId) return;
    if (selectedRequest && selectedRequest.id === initialRequestId) {
      autoOpenedRequestRef.current = initialRequestId;
      return;
    }

    if (requests.length > 0) {
      const match = requests.find((r) => r.id === initialRequestId);
      if (match) {
        autoOpenedRequestRef.current = initialRequestId;
        handleSelectRequest(match);
        return;
      }
    }

    let isCancelled = false;
    dataRequestService
      .getDataRequestById(initialRequestId)
      .then((req) => {
        if (req && !isCancelled) {
          autoOpenedRequestRef.current = initialRequestId;
          handleSelectRequest(req);
        }
      })
      .catch((err) => {
        console.warn('Failed to load initial data request directly:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [initialRequestId, requests]);

  // File selection & pre-validation
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: typeof uploadQueue = [];
    Array.from(files).forEach((file) => {
      const validation = validateFileForUpload(file);
      if (!validation.isValid) {
        newItems.push({
          id: `${file.name}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          file,
          percent: 0,
          status: 'error',
          error: validation.error,
        });
      } else {
        newItems.push({
          id: `${file.name}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          file,
          percent: 0,
          status: 'queued',
        });
      }
    });

    setUploadQueue((prev) => [...prev, ...newItems]);
    e.target.value = ''; // Reset input to allow re-selection
  };

  // Remove an item from the upload queue
  const handleRemoveQueueItem = (id: string) => {
    setUploadQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Execute upload for all queued valid files
  const handleUploadAllQueued = async () => {
    if (!selectedRequest || !currentUser) return;
    setIsUploadingFiles(true);

    const queued = uploadQueue.filter((item) => item.status === 'queued');
    if (queued.length === 0) {
      setIsUploadingFiles(false);
      return;
    }

    for (const item of queued) {
      setUploadQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'uploading', percent: 15 } : it))
      );

      try {
        const uploadedFile = await dataRequestStorageService.uploadDataRequestFile({
          file: item.file,
          companyId: selectedRequest.companyId,
          dataRequestId: selectedRequest.id,
          uploadedById: currentUser.uid,
          uploadedByName: userProfile?.displayName || '기업 담당자',
          onProgress: (percent) => {
            setUploadQueue((prev) =>
              prev.map((it) => (it.id === item.id ? { ...it, percent } : it))
            );
          },
        });

        // Audit Log for file upload (Requirement 12)
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: role,
          actorName: userProfile?.displayName || '사용자',
          companyId: selectedRequest.companyId,
          action: 'DATA_REQUEST_FILE_UPLOADED',
          resourceType: 'DATA_REQUEST_FILE',
          resourceId: uploadedFile.fileId,
          details: {
            dataRequestId: selectedRequest.id,
            fileId: uploadedFile.fileId,
            originalFileName: uploadedFile.originalFileName,
            fileSize: uploadedFile.size,
            contentType: uploadedFile.contentType,
            storagePath: uploadedFile.storagePath,
          },
        });

        setUploadQueue((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'success', percent: 100 } : it))
        );
        setActiveUploadedFiles((prev) => [...prev, uploadedFile]);
      } catch (err: any) {
        console.error('File upload failed:', err);
        setUploadQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'error',
                  error: err.message || '파일 업로드 실패 (Firebase Storage 설정이 필요합니다.)',
                }
              : it
          )
        );
      }
    }

    setIsUploadingFiles(false);
  };

  // Pre-submission file deletion (Requirement 10)
  const handleDeleteUploadedFile = async (file: DataRequestFile) => {
    if (!selectedRequest || !currentUser) return;
    if (!window.confirm(`[${file.originalFileName}] 파일을 삭제하시겠습니까?`)) return;

    try {
      await dataRequestStorageService.deleteDataRequestFile({
        storagePath: file.storagePath,
        companyId: selectedRequest.companyId,
        dataRequestId: selectedRequest.id,
      });

      // Audit Log for file deletion (Requirement 12)
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: role,
        actorName: userProfile?.displayName || '사용자',
        companyId: selectedRequest.companyId,
        action: 'DATA_REQUEST_FILE_DELETED',
        resourceType: 'DATA_REQUEST_FILE',
        resourceId: file.fileId,
        details: {
          dataRequestId: selectedRequest.id,
          fileId: file.fileId,
          originalFileName: file.originalFileName,
          storagePath: file.storagePath,
        },
      });

      const updatedList = activeUploadedFiles.filter((f) => f.fileId !== file.fileId);
      setActiveUploadedFiles(updatedList);

      // If document was already submitted or in review, also update Firestore
      if (selectedRequest.status !== 'REQUESTED') {
        await dataRequestService.updateSubmittedFiles(
          selectedRequest.id,
          updatedList,
          currentUser.uid,
          userProfile?.displayName || '관리자'
        );
      }

      setFeedback({ type: 'success', message: '파일이 삭제되었습니다.' });
    } catch (err: any) {
      console.error('File delete error:', err);
      setFeedback({ type: 'error', message: err.message || '파일 삭제 중 오류가 발생했습니다.' });
    }
  };

  // File download (Requirement 7 & 12)
  const handleDownloadFile = async (file: DataRequestFile) => {
    if (!currentUser) return;
    try {
      await dataRequestStorageService.downloadDataRequestFile(file);

      // Audit Log for file download (Requirement 12)
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: role,
        actorName: userProfile?.displayName || '사용자',
        companyId: file.companyId,
        action: 'DATA_REQUEST_FILE_DOWNLOADED',
        resourceType: 'DATA_REQUEST_FILE',
        resourceId: file.fileId,
        details: {
          dataRequestId: file.dataRequestId,
          fileId: file.fileId,
          originalFileName: file.originalFileName,
          storagePath: file.storagePath,
        },
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setFeedback({
        type: 'error',
        message: err.message || '파일 다운로드에 실패했습니다. (Firebase Storage 설정 확인 필요)',
      });
    }
  };

  // Open submit confirmation with Requirement 6 validation
  const handleOpenSubmitConfirm = () => {
    if (!selectedRequest) return;

    // Requirement 6: Must have at least 1 successfully uploaded file
    if (activeUploadedFiles.length === 0) {
      if (storageStatus && !storageStatus.isConfigured) {
        setFeedback({
          type: 'error',
          message: 'Firebase Storage 설정이 필요합니다. Storage 버킷이 활성화되어 실제 파일이 업로드된 후에만 자료 제출이 가능합니다.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: '자료요청 제출을 위해 요청 서류 파일을 최소 1개 이상 업로드해야 합니다. (실제 성공한 파일만 제출 가능)',
        });
      }
      return;
    }

    setIsConfirmSubmitOpen(true);
  };

  // Execute COMPANY submission or resubmission
  const handleCompanySubmit = async () => {
    if (!selectedRequest || !currentUser) return;
    const isResubmission = selectedRequest.status === 'REVISION_REQUESTED';

    try {
      setIsSubmittingData(true);
      await dataRequestService.submitDataRequest({
        requestId: selectedRequest.id,
        companyId: selectedRequest.companyId,
        currentStatus: selectedRequest.status,
        submissionNote: companySubmissionNote.trim(),
        submittedById: currentUser.uid,
        submittedByName: userProfile?.displayName || '기업 담당자',
        submittedFiles: activeUploadedFiles, // Attach verified uploaded files
      });

      // Audit Log (Requirement 9: DATA_REQUEST_SUBMITTED or DATA_REQUEST_RESUBMITTED)
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: 'COMPANY',
        actorName: userProfile?.displayName || '기업 담당자',
        companyId: selectedRequest.companyId,
        action: isResubmission ? 'DATA_REQUEST_RESUBMITTED' : 'DATA_REQUEST_SUBMITTED',
        resourceType: 'DATA_REQUEST',
        resourceId: selectedRequest.id,
        details: {
          requestId: selectedRequest.id,
          isResubmission,
          fileCount: activeUploadedFiles.length,
        },
      });

      setFeedback({
        type: 'success',
        message: isResubmission
          ? '보완 자료가 성공적으로 재제출되었습니다.'
          : '자료가 성공적으로 제출되었습니다.',
      });

      setIsConfirmSubmitOpen(false);
      await fetchAllData();
      const updated = await dataRequestService.getDataRequestById(selectedRequest.id);
      if (updated) {
        setSelectedRequest(updated);
        setActiveUploadedFiles(updated.submittedFiles || []);
      }
    } catch (err: any) {
      console.error('Failed to submit data request', err);
      setFeedback({
        type: 'error',
        message: err.message || '자료 제출 처리 중 오류가 발생했습니다.',
      });
    } finally {
      setIsSubmittingData(false);
    }
  };

  // Fetch Companies & Requests
  const fetchAllData = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      if (role === 'ADMIN') {
        const [compList, reqList] = await Promise.all([
          firmService.getAllCompanies(),
          dataRequestService.getAllDataRequests(),
        ]);
        setCompanies(compList || []);
        setRequests(reqList || []);
      } else {
        // Strict company isolation: COMPANY can only fetch requests for their own companyId
        const effectiveCompanyId = userProfile?.companyId || companyId;
        if (effectiveCompanyId) {
          const reqList = await dataRequestService.getDataRequestsByCompany(effectiveCompanyId);
          setRequests(reqList || []);
        } else {
          setRequests([]);
        }
      }
    } catch (err) {
      console.error('Failed to load data requests', err);
      setFeedback({ type: 'error', message: '자료요청 목록을 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [role, companyId, userProfile?.companyId]);

  // Company Lookup Helper
  const companyMap = useMemo(() => {
    const map = new Map<string, Company>();
    companies.forEach((c) => map.set(c.id, c));
    return map;
  }, [companies]);

  const getCompanyName = (compIdentifier: string) => {
    const comp = companyMap.get(compIdentifier);
    return comp ? comp.companyName : compIdentifier;
  };

  // Filter Logic
  const filteredRequests = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    return requests.filter((req) => {
      // 1. Company Filter (ADMIN only, COMPANY is already strictly isolated at fetch)
      if (role === 'ADMIN' && companyFilter !== 'ALL' && req.companyId !== companyFilter) {
        return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'ALL' && req.status !== statusFilter) {
        return false;
      }

      // 3. Due Date Filter
      if (dueDateFilter === 'TODAY') {
        if (!req.dueDate || req.dueDate !== today) return false;
      } else if (dueDateFilter === 'OVERDUE') {
        if (!req.dueDate || req.dueDate >= today || req.status === 'COMPLETED') return false;
      } else if (dueDateFilter === 'WEEK') {
        if (!req.dueDate) return false;
        const targetDate = new Date(req.dueDate).getTime();
        const nowTime = new Date(today).getTime();
        const weekTime = nowTime + 7 * 24 * 60 * 60 * 1000;
        if (targetDate < nowTime || targetDate > weekTime) return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const compName = getCompanyName(req.companyId).toLowerCase();
        const titleMatch = req.title.toLowerCase().includes(query);
        const descMatch = req.description.toLowerCase().includes(query);
        const itemMatch = req.requestedItems.some((item) => item.toLowerCase().includes(query));
        const compMatch = compName.includes(query);

        if (!titleMatch && !descMatch && !itemMatch && !compMatch) {
          return false;
        }
      }

      return true;
    });
  }, [requests, companyFilter, statusFilter, dueDateFilter, searchQuery, role, companyMap]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = requests.length;
    const requested = requests.filter((r) => r.status === 'REQUESTED').length;
    const submitted = requests.filter((r) => r.status === 'SUBMITTED').length;
    const underReview = requests.filter((r) => r.status === 'UNDER_REVIEW').length;
    const revision = requests.filter((r) => r.status === 'REVISION_REQUESTED').length;
    const completed = requests.filter((r) => r.status === 'COMPLETED').length;

    const today = new Date().toISOString().split('T')[0];
    const overdue = requests.filter(
      (r) => r.dueDate && r.dueDate < today && r.status !== 'COMPLETED'
    ).length;

    return { total, requested, submitted, underReview, revision, completed, overdue };
  }, [requests]);

  // Handle Item Addition in New Modal
  const handleAddNewItem = () => {
    if (!newItemInput.trim()) return;
    if (formRequestedItems.includes(newItemInput.trim())) {
      setFeedback({ type: 'error', message: '이미 추가된 자료 항목입니다.' });
      return;
    }
    setFormRequestedItems([...formRequestedItems, newItemInput.trim()]);
    setNewItemInput('');
  };

  const handleAddPresetItem = (preset: string) => {
    if (formRequestedItems.includes(preset)) return;
    setFormRequestedItems([...formRequestedItems, preset]);
  };

  const handleRemoveFormItem = (index: number) => {
    setFormRequestedItems(formRequestedItems.filter((_, i) => i !== index));
  };

  // Open New Modal
  const handleOpenNewModal = () => {
    setFormCompanyId(companyId || (companies[0]?.id || ''));
    setFormTitle('');
    setFormDescription('');
    setFormDueDate('');
    setFormRequestedItems([
      '월간 임직원 근태 및 출근부 집계표',
      '급여대장 및 수당 지급 내역서',
    ]);
    setNewItemInput('');
    setIsNewModalOpen(true);
  };

  // Create Request Submit (ADMIN)
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!formCompanyId) {
      setFeedback({ type: 'error', message: '요청 대상 기업을 선택해주세요.' });
      return;
    }
    if (!formTitle.trim()) {
      setFeedback({ type: 'error', message: '자료요청 제목을 입력해주세요.' });
      return;
    }
    if (formRequestedItems.length === 0) {
      setFeedback({ type: 'error', message: '요청할 자료 항목을 최소 1개 이상 등록해주세요.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const targetCompany = companyMap.get(formCompanyId);

      const created = await dataRequestService.createDataRequest({
        companyId: formCompanyId,
        companyName: targetCompany?.companyName,
        title: formTitle.trim(),
        description: formDescription.trim(),
        requestedItems: formRequestedItems,
        dueDate: formDueDate || '',
        status: 'REQUESTED',
        createdById: currentUser.uid,
        createdByName: userProfile?.displayName || '관리자',
      });

      setFeedback({
        type: 'success',
        message: `[${targetCompany?.companyName || '기업'}] 대상 신규 자료요청이 발송되었습니다.`,
      });
      setIsNewModalOpen(false);
      await fetchAllData();
      setSelectedRequest(created);
    } catch (err: any) {
      console.error('Failed to create data request', err);
      setFeedback({
        type: 'error',
        message: err.message || '자료요청 생성 중 오류가 발생했습니다.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal (ADMIN)
  const handleOpenEditModal = (req: DataRequest) => {
    setEditingRequest(req);
    setEditTitle(req.title);
    setEditDescription(req.description || '');
    setEditDueDate(req.dueDate || '');
    setEditRequestedItems([...req.requestedItems]);
    setEditNewItemInput('');
    setEditActionNote('');
    setIsEditModalOpen(true);
  };

  const handleAddEditItem = () => {
    if (!editNewItemInput.trim()) return;
    if (editRequestedItems.includes(editNewItemInput.trim())) return;
    setEditRequestedItems([...editRequestedItems, editNewItemInput.trim()]);
    setEditNewItemInput('');
  };

  const handleRemoveEditItem = (index: number) => {
    setEditRequestedItems(editRequestedItems.filter((_, i) => i !== index));
  };

  // Submit Edit (ADMIN)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest || !currentUser) return;

    if (!editTitle.trim()) {
      setFeedback({ type: 'error', message: '자료요청 제목을 입력해주세요.' });
      return;
    }
    if (editRequestedItems.length === 0) {
      setFeedback({ type: 'error', message: '요청할 자료 항목이 1개 이상 필요합니다.' });
      return;
    }

    try {
      setIsUpdating(true);
      await dataRequestService.updateDataRequest(editingRequest.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        requestedItems: editRequestedItems,
        dueDate: editDueDate,
        updatedById: currentUser.uid,
        updatedByName: userProfile?.displayName || '관리자',
        actionNote: editActionNote.trim() || '관리자 내용 수정',
      });

      setFeedback({ type: 'success', message: '자료요청 정보가 성공적으로 수정되었습니다.' });
      setIsEditModalOpen(false);

      // Refresh list and detail
      await fetchAllData();
      const updated = await dataRequestService.getDataRequestById(editingRequest.id);
      if (updated) setSelectedRequest(updated);
    } catch (err: any) {
      console.error('Failed to update data request', err);
      setFeedback({ type: 'error', message: err.message || '수정 중 오류가 발생했습니다.' });
    } finally {
      setIsUpdating(false);
    }
  };

  // Status Change Submit
  const handleExecuteStatusChange = async (newStatus: DataRequestStatus) => {
    if (!selectedRequest || !currentUser) return;
    try {
      setIsStatusChanging(true);
      await dataRequestService.updateStatus(
        selectedRequest.id,
        newStatus,
        currentUser.uid,
        userProfile?.displayName || '관리자',
        statusChangeNote.trim() || undefined
      );

      setFeedback({
        type: 'success',
        message: `자료요청 상태가 '${STATUS_CONFIG[newStatus].badge}'(으)로 변경되었습니다.`,
      });

      setStatusChangeNote('');
      setTargetStatusToChange(null);

      // Refresh
      await fetchAllData();
      const updated = await dataRequestService.getDataRequestById(selectedRequest.id);
      if (updated) setSelectedRequest(updated);
    } catch (err: any) {
      console.error('Failed to change status', err);
      setFeedback({ type: 'error', message: err.message || '상태 변경 중 오류가 발생했습니다.' });
    } finally {
      setIsStatusChanging(false);
    }
  };

  // Delete Request (ADMIN)
  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm('정말 이 자료요청을 삭제하시겠습니까? 복구할 수 없습니다.')) return;
    try {
      await dataRequestService.deleteDataRequest(id);
      setFeedback({ type: 'success', message: '자료요청이 삭제되었습니다.' });
      setSelectedRequest(null);
      await fetchAllData();
    } catch (err: any) {
      console.error('Failed to delete data request', err);
      setFeedback({ type: 'error', message: '삭제 중 오류가 발생했습니다.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Feedback Message */}
      {feedback && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {role === 'ADMIN' ? '아웃소싱 관리' : '자료요청 확인 및 제출'}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              {role === 'ADMIN' ? '전체 고객사 자료요청 허브' : '고객사 전용 자료요청실'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <FileCheck className="h-6 w-6 text-slate-800" />
            {role === 'ADMIN' ? '자료요청 관리' : '자료요청 확인 및 제출'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {role === 'ADMIN'
              ? '급여 산정, 4대보험 취득·상실, 추가근무 정산에 필요한 서류를 기업별로 요청하고 진행상태를 체계적으로 관리합니다.'
              : '전담 공인노무사가 요청한 필수 자료 목록을 확인하고, 서류 준비 후 제출 메모와 함께 제출합니다.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchAllData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            title="새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            새로고침
          </button>

          {role === 'ADMIN' && (
            <button
              onClick={handleOpenNewModal}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-2xs hover:bg-slate-800 transition"
            >
              <Plus className="h-4 w-4" />
              새 자료요청 작성
            </button>
          )}
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">전체 요청</span>
            <FileText className="h-3.5 w-3.5 opacity-60" />
          </div>
          <div className="mt-2 text-xl font-black">{metrics.total}</div>
        </div>

        <div
          onClick={() => setStatusFilter('REQUESTED')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'REQUESTED'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white text-slate-800 border-slate-200 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">요청 (미제출)</span>
            <Clock className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="mt-2 text-xl font-black">{metrics.requested}</div>
        </div>

        <div
          onClick={() => setStatusFilter('SUBMITTED')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'SUBMITTED'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-slate-800 border-slate-200 hover:border-blue-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">제출완료</span>
            <Check className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <div className="mt-2 text-xl font-black">{metrics.submitted}</div>
        </div>

        <div
          onClick={() => setStatusFilter('UNDER_REVIEW')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'UNDER_REVIEW'
              ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
              : 'bg-white text-slate-800 border-slate-200 hover:border-purple-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">검토중</span>
            <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
          </div>
          <div className="mt-2 text-xl font-black">{metrics.underReview}</div>
        </div>

        <div
          onClick={() => setStatusFilter('REVISION_REQUESTED')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'REVISION_REQUESTED'
              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
              : 'bg-white text-slate-800 border-slate-200 hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">보완요청</span>
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <div className="mt-2 text-xl font-black">{metrics.revision}</div>
        </div>

        <div
          onClick={() => setStatusFilter('COMPLETED')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'COMPLETED'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">완료 (종결)</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <div className="mt-2 text-xl font-black">{metrics.completed}</div>
        </div>
      </div>

      {/* Filters Bar: Company, Status, DueDate, Search */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
            {/* Filter 1: Company (ADMIN Only) */}
            {role === 'ADMIN' ? (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  기업 필터
                </label>
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 font-medium focus:border-slate-800 focus:outline-none"
                  >
                    <option value="ALL">전체 기업 ({companies.length}개사)</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  소속 기업
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 font-bold">
                  <Building2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>{getCompanyName(companyId || userProfile?.companyId || '')}</span>
                </div>
              </div>
            )}

            {/* Filter 2: Status Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                진행상태 필터
              </label>
              <div className="relative">
                <SlidersHorizontal className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 font-medium focus:border-slate-800 focus:outline-none"
                >
                  <option value="ALL">전체 상태</option>
                  <option value="REQUESTED">요청 (미제출)</option>
                  <option value="SUBMITTED">제출완료</option>
                  <option value="UNDER_REVIEW">검토중</option>
                  <option value="REVISION_REQUESTED">보완요청</option>
                  <option value="COMPLETED">완료 (종결)</option>
                </select>
              </div>
            </div>

            {/* Filter 3: Due Date Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                제출기한 필터
              </label>
              <div className="relative">
                <CalendarDays className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <select
                  value={dueDateFilter}
                  onChange={(e) => setDueDateFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 font-medium focus:border-slate-800 focus:outline-none"
                >
                  <option value="ALL">전체 제출기한</option>
                  <option value="TODAY">오늘 마감 예정</option>
                  <option value="WEEK">7일 이내 마감</option>
                  <option value="OVERDUE">기한 경과 (미완료)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Filter 4: Keyword Search */}
          <div className="w-full lg:w-72 pt-1 lg:pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="제목, 내용, 요청자료, 기업명 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Filter Reset */}
        {(companyFilter !== (companyId || 'ALL') ||
          statusFilter !== 'ALL' ||
          dueDateFilter !== 'ALL' ||
          searchQuery !== '') && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span>
              필터 적용 중:{' '}
              <strong className="text-slate-800">{filteredRequests.length}</strong>건 표시됨 (전체 {requests.length}건 중)
            </span>
            <button
              onClick={() => {
                setCompanyFilter(companyId || 'ALL');
                setStatusFilter('ALL');
                setDueDateFilter('ALL');
                setSearchQuery('');
              }}
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              필터 초기화
            </button>
          </div>
        )}
      </div>

      {/* Main Request Table & List */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-slate-400" />
            자료요청 목록을 불러오는 중입니다...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FileCheck className="mx-auto h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">해당 조건에 맞는 자료요청이 없습니다.</p>
            <p className="text-xs text-slate-400">
              {role === 'ADMIN'
                ? '새 자료요청을 생성하거나 필터 조건을 변경해보세요.'
                : '현재 등록된 자료요청 서류가 없습니다.'}
            </p>
            {role === 'ADMIN' && (
              <button
                onClick={handleOpenNewModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />새 자료요청 작성하기
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600">
                <tr>
                  <th className="py-3 px-4 w-28">현재 상태</th>
                  {role === 'ADMIN' && <th className="py-3 px-4 w-44">기업명</th>}
                  <th className="py-3 px-4">요청 제목 및 자료</th>
                  <th className="py-3 px-4 w-28">요청일</th>
                  <th className="py-3 px-4 w-32">제출기한</th>
                  <th className="py-3 px-4 w-32 text-center">
                    {role === 'ADMIN' ? '관리' : '확인 및 제출'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => {
                  const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.REQUESTED;
                  const compName = getCompanyName(req.companyId);
                  const isOverdue =
                    req.dueDate &&
                    req.dueDate < new Date().toISOString().split('T')[0] &&
                    req.status !== 'COMPLETED';

                  return (
                    <tr
                      key={req.id}
                      onClick={() => handleSelectRequest(req)}
                      className="hover:bg-slate-50 transition cursor-pointer"
                    >
                      {/* 현재 상태 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.badge}
                        </span>
                      </td>

                      {/* 기업명 (ADMIN 전용) */}
                      {role === 'ADMIN' && (
                        <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{compName}</span>
                          </div>
                        </td>
                      )}

                      {/* 요청 제목 & 요청 자료 */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm hover:text-blue-600 transition">
                            {req.title}
                          </div>
                          {req.description && (
                            <p className="text-slate-500 text-[11px] line-clamp-1">
                              {req.description}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[10px] font-semibold text-slate-400">
                              요청자료:
                            </span>
                            {req.requestedItems.slice(0, 3).map((item, idx) => (
                              <span
                                key={idx}
                                className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 border border-slate-200"
                              >
                                {item}
                              </span>
                            ))}
                            {req.requestedItems.length > 3 && (
                              <span className="text-[10px] font-bold text-slate-500">
                                +{req.requestedItems.length - 3}건
                              </span>
                            )}
                            {req.submittedFiles && req.submittedFiles.length > 0 && (
                              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                                <Paperclip className="h-2.5 w-2.5" />
                                제출파일 {req.submittedFiles.length}건
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 요청일 */}
                      <td className="py-3.5 px-4 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(req.createdAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </td>

                      {/* 제출기한 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {req.dueDate ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 font-semibold text-slate-800 text-xs">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              {req.dueDate}
                            </div>
                            {isOverdue && (
                              <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                기한 초과
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">기한 없음</span>
                        )}
                      </td>

                      {/* 관리 버튼 / 확인 및 제출 */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {role === 'ADMIN' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleSelectRequest(req)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-semibold transition"
                            >
                              상세
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(req)}
                              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                              title="수정"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            {req.status === 'REQUESTED' ? (
                              <button
                                onClick={() => handleSelectRequest(req)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shadow-xs transition"
                              >
                                <Send className="h-3 w-3" />
                                자료 제출
                              </button>
                            ) : req.status === 'REVISION_REQUESTED' ? (
                              <button
                                onClick={() => handleSelectRequest(req)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-xs transition"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                보완 제출
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSelectRequest(req)}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold transition"
                              >
                                확인 (상세)
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. Detail Modal (상세보기 및 상태변경)                                    */}
      {/* ========================================================================= */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      STATUS_CONFIG[selectedRequest.status]?.bg
                    } ${STATUS_CONFIG[selectedRequest.status]?.text} ${
                      STATUS_CONFIG[selectedRequest.status]?.border
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        STATUS_CONFIG[selectedRequest.status]?.dot
                      }`}
                    />
                    {STATUS_CONFIG[selectedRequest.status]?.badge}
                  </span>
                  <span className="text-xs text-slate-400">|</span>
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                    {getCompanyName(selectedRequest.companyId)}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {selectedRequest.title}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => setIsTaskModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition shadow-2xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
                    <span>할 일로 추가</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Status Explanation Card */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  STATUS_CONFIG[selectedRequest.status]?.bg
                } ${STATUS_CONFIG[selectedRequest.status]?.border}`}
              >
                <div>
                  <div
                    className={`font-bold text-xs ${
                      STATUS_CONFIG[selectedRequest.status]?.text
                    }`}
                  >
                    현재 상태: {STATUS_CONFIG[selectedRequest.status]?.badge}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {STATUS_CONFIG[selectedRequest.status]?.desc}
                  </p>
                </div>

                {role === 'ADMIN' && (
                  <button
                    onClick={() => handleOpenEditModal(selectedRequest)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                  >
                    <Edit3 className="h-3 w-3" />
                    내용 수정
                  </button>
                )}
              </div>

              {/* Requirement 2 & 6: 관리자 보완요청 내용 */}
              {(selectedRequest.status === 'REVISION_REQUESTED' || selectedRequest.revisionNote) && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    <span>전담 노무사(관리자) 보완요청 내용</span>
                  </div>
                  <div className="bg-white/90 p-3 rounded-lg border border-rose-200 text-xs text-rose-950 font-medium whitespace-pre-wrap leading-relaxed shadow-2xs">
                    {selectedRequest.revisionNote ||
                      selectedRequest.history?.find((h) => h.action.includes('보완') && h.note)?.note ||
                      '기존 제출 자료에 보완이 필요한 항목이 확인되었습니다. 보완요청 지침을 확인 후 보완 서류를 재제출해 주시기 바랍니다.'}
                  </div>
                </div>
              )}

              {/* Due Date & Timestamps Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block">제출 기한</span>
                  <span className="font-bold text-slate-800 text-xs">
                    {selectedRequest.dueDate ? selectedRequest.dueDate : '지정 기한 없음'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block">요청 등록일</span>
                  <span className="font-semibold text-slate-700 text-xs">
                    {new Date(selectedRequest.createdAt).toLocaleDateString('ko-KR')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block">최종 수정일</span>
                  <span className="font-semibold text-slate-700 text-xs">
                    {new Date(selectedRequest.updatedAt).toLocaleDateString('ko-KR')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block">요청 담당자</span>
                  <span className="font-semibold text-slate-700 text-xs">
                    {selectedRequest.createdByName || selectedRequest.createdById}
                  </span>
                </div>
              </div>

              {/* Description / Instructions */}
              <div>
                <h3 className="font-bold text-slate-900 text-xs mb-1.5 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  요청 설명 및 제출 지침
                </h3>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-700 whitespace-pre-wrap leading-relaxed text-xs">
                  {selectedRequest.description || '별도의 세부 설명이 등록되지 않았습니다.'}
                </div>
              </div>

              {/* Requested Items Checklist */}
              <div>
                <h3 className="font-bold text-slate-900 text-xs mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" />
                    요청 자료 목록 ({selectedRequest.requestedItems.length}종)
                  </span>
                  <span className="text-[11px] font-normal text-slate-500">
                    회원사 제출 대상 서류
                  </span>
                </h3>
                <div className="space-y-1.5">
                  {selectedRequest.requestedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-800">{item}</span>
                      </div>

                      {selectedRequest.status === 'COMPLETED' ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                          <Check className="h-3 w-3" /> 검토 완료
                        </span>
                      ) : selectedRequest.status === 'SUBMITTED' ||
                        selectedRequest.status === 'UNDER_REVIEW' ? (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          제출 완료됨
                        </span>
                      ) : selectedRequest.status === 'REVISION_REQUESTED' ? (
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          보완 제출 필요
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          제출 대기
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Requirement 4: 제출 정보 섹션 */}
              {(selectedRequest.status === 'SUBMITTED' ||
                selectedRequest.status === 'UNDER_REVIEW' ||
                selectedRequest.status === 'COMPLETED' ||
                selectedRequest.submittedAt) && (
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      <span>제출 정보</span>
                    </div>
                    {selectedRequest.submittedAt && (
                      <span className="text-[11px] font-semibold text-blue-700">
                        제출일시: {new Date(selectedRequest.submittedAt).toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>

                  {selectedRequest.submittedByName && (
                    <div className="text-xs text-blue-900">
                      <span className="font-semibold text-blue-950">제출자:</span>{' '}
                      {selectedRequest.submittedByName}
                    </div>
                  )}

                  {selectedRequest.submissionNote ? (
                    <div className="bg-white p-3 rounded-lg border border-blue-100 text-xs text-slate-800 whitespace-pre-wrap">
                      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">제출 메모:</span>
                      {selectedRequest.submissionNote}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">등록된 제출 메모가 없습니다.</p>
                  )}
                </div>
              )}

              {/* Requirement 1: Firebase Storage 연결 상태 안내 (가짜 성공 금지) */}
              {storageStatus && !storageStatus.isConfigured && (
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Firebase Storage 설정이 필요합니다.</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    현재 Firebase 프로젝트의 Cloud Storage 버킷({storageStatus.bucketName || '미설정'})이 비활성화 상태입니다.
                    가짜 업로드나 임시 URL 대신 실제 Firebase Storage 연동 기준을 엄격히 준수합니다.
                    Firebase Console에서 Cloud Storage를 활성화하시면 실시간 파일 업로드 및 안전 다운로드가 정상 동작합니다.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await dataRequestStorageService.checkStorageAvailability();
                        setStorageStatus(res);
                        if (res.isConfigured) {
                          setFeedback({ type: 'success', message: 'Firebase Storage 연결이 확인되었습니다.' });
                        } else {
                          setFeedback({ type: 'error', message: res.errorMessage || 'Storage 버킷이 아직 활성화되지 않았습니다.' });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold transition shadow-2xs"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Storage 연결 상태 다시 확인
                    </button>
                  </div>
                </div>
              )}

              {/* Requirement 2, 4, 7: 제출된 서류 파일 목록 (ADMIN & COMPANY 공통 조회/다운로드) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-blue-600" />
                    제출 서류 파일 목록 ({activeUploadedFiles.length}개)
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    data-requests/{selectedRequest.companyId}/{selectedRequest.id}/...
                  </span>
                </div>

                {activeUploadedFiles.length === 0 ? (
                  <div className="p-3.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center space-y-1">
                    <p className="text-[11px] text-slate-500 font-medium">제출된 서류 파일이 없습니다.</p>
                    {role === 'COMPANY' && (selectedRequest.status === 'REQUESTED' || selectedRequest.status === 'REVISION_REQUESTED') && (
                      <p className="text-[10px] text-slate-400">
                        아래 서류 파일 첨부 영역에서 요청 서류를 업로드해 주세요.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {activeUploadedFiles.map((file) => (
                      <div
                        key={file.fileId}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/80 transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                          <div className="h-8 w-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-600">
                            <File className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 text-xs truncate" title={file.originalFileName}>
                              {file.originalFileName}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              <span className="font-medium text-slate-500">{formatFileSize(file.size)}</span>
                              <span>•</span>
                              <span>{file.uploadedByName || '사용자'}</span>
                              <span>•</span>
                              <span>{new Date(file.uploadedAt).toLocaleString('ko-KR')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(file)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition shadow-2xs"
                            title="파일 다운로드"
                          >
                            <Download className="h-3 w-3 text-slate-600" />
                            <span>다운로드</span>
                          </button>

                          {role === 'COMPANY' && (selectedRequest.status === 'REQUESTED' || selectedRequest.status === 'REVISION_REQUESTED') && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUploadedFile(file)}
                              className="p-1 rounded-lg border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                              title="제출 전 파일 삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Requirement 4 & 5: COMPANY 서류 파일 선택 및 업로드 대기 영역 */}
              {role === 'COMPANY' && (selectedRequest.status === 'REQUESTED' || selectedRequest.status === 'REVISION_REQUESTED') && (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Upload className="h-3.5 w-3.5 text-blue-600" />
                      <span>서류 파일 첨부 및 업로드</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      최대 {MAX_FILE_SIZE_MB}MB / PDF, HWP, 엑셀, 오피스, 압축, 이미지
                    </span>
                  </div>

                  {/* File Input & Selection Button */}
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition">
                      <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                      <span>파일 선택 (다중 선택 가능)</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                        disabled={isUploadingFiles}
                      />
                    </label>
                    <span className="text-[11px] text-slate-500">
                      {uploadQueue.length > 0 ? `${uploadQueue.length}개 파일 선택됨` : '선택된 새 파일 없음'}
                    </span>
                  </div>

                  {/* Queue List */}
                  {uploadQueue.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] font-bold text-slate-700">업로드 대기 목록:</div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                        {uploadQueue.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-800 truncate max-w-[240px]" title={item.file.name}>
                                  {item.file.name}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                  ({formatFileSize(item.file.size)})
                                </span>
                              </div>

                              {item.status === 'uploading' && (
                                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                                  <div
                                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${item.percent}%` }}
                                  />
                                </div>
                              )}

                              {item.status === 'error' && (
                                <p className="text-[10px] text-rose-600 mt-0.5 font-medium">{item.error}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.status === 'queued' && (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  대기중
                                </span>
                              )}
                              {item.status === 'uploading' && (
                                <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  {item.percent}%
                                </span>
                              )}
                              {item.status === 'success' && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-0.5">
                                  <Check className="h-3 w-3" /> 완료
                                </span>
                              )}
                              {item.status === 'error' && (
                                <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                  실패
                                </span>
                              )}

                              {item.status !== 'uploading' && item.status !== 'success' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveQueueItem(item.id)}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                  title="선택 취소"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleUploadAllQueued}
                          disabled={isUploadingFiles || uploadQueue.every((it) => it.status !== 'queued')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
                        >
                          {isUploadingFiles ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              업로드 진행 중...
                            </>
                          ) : (
                            <>
                              <Upload className="h-3 w-3" />
                              선택한 파일 업로드 실행
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 leading-tight">
                    ※ 보안 정책: 0바이트 빈 파일 및 실행 가능한 프로그램(.exe, .bat, .sh, .cmd 등)은 차단됩니다.
                  </div>
                </div>
              )}

              {/* Requirement 5, 6, 7: COMPANY 제출 및 보완 후 재제출 작성 */}
              {role === 'COMPANY' &&
                (selectedRequest.status === 'REQUESTED' || selectedRequest.status === 'REVISION_REQUESTED') && (
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <Send className="h-3.5 w-3.5 text-blue-600" />
                        {selectedRequest.status === 'REVISION_REQUESTED'
                          ? '보완 서류 재제출 작성'
                          : '자료 제출 작성'}
                      </h3>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        허용 상태 변경: {selectedRequest.status} → SUBMITTED
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-800 mb-1">
                        제출 메모 <span className="font-normal text-slate-400">(준비 내용, 특이사항 또는 보완 조치 내역)</span>
                      </label>
                      <textarea
                        rows={3}
                        value={companySubmissionNote}
                        onChange={(e) => setCompanySubmissionNote(e.target.value)}
                        placeholder={
                          selectedRequest.status === 'REVISION_REQUESTED'
                            ? '노무사 보완요청에 대한 조치 결과나 추가 전달사항을 입력해주세요.'
                            : '요청받은 자료의 준비 현황이나 서류 관련 전달사항을 입력해주세요.'
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleOpenSubmitConfirm}
                        disabled={isSubmittingData}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition ${
                          selectedRequest.status === 'REVISION_REQUESTED'
                            ? 'bg-rose-600 hover:bg-rose-700'
                            : 'bg-slate-900 hover:bg-slate-800'
                        }`}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {selectedRequest.status === 'REVISION_REQUESTED'
                          ? '보완 후 재제출하기'
                          : '제출하기'}
                      </button>
                    </div>
                  </div>
                )}

              {/* ADMIN Status Change Controls */}
              {role === 'ADMIN' && (
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <h3 className="font-bold text-slate-900 text-xs">관리자 상태 변경 조치</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    <button
                      type="button"
                      disabled={isStatusChanging || selectedRequest.status === 'REQUESTED'}
                      onClick={() => handleExecuteStatusChange('REQUESTED')}
                      className={`px-2 py-2 rounded-xl text-[11px] font-bold border transition ${
                        selectedRequest.status === 'REQUESTED'
                          ? 'bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-amber-400'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      요청 (재요청)
                    </button>

                    <button
                      type="button"
                      disabled={isStatusChanging || selectedRequest.status === 'SUBMITTED'}
                      onClick={() => handleExecuteStatusChange('SUBMITTED')}
                      className={`px-2 py-2 rounded-xl text-[11px] font-bold border transition ${
                        selectedRequest.status === 'SUBMITTED'
                          ? 'bg-blue-100 text-blue-800 border-blue-300 ring-2 ring-blue-400'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      제출 처리
                    </button>

                    <button
                      type="button"
                      disabled={isStatusChanging || selectedRequest.status === 'UNDER_REVIEW'}
                      onClick={() => handleExecuteStatusChange('UNDER_REVIEW')}
                      className={`px-2 py-2 rounded-xl text-[11px] font-bold border transition ${
                        selectedRequest.status === 'UNDER_REVIEW'
                          ? 'bg-purple-100 text-purple-800 border-purple-300 ring-2 ring-purple-400'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      검토중 전환
                    </button>

                    <button
                      type="button"
                      disabled={isStatusChanging || selectedRequest.status === 'REVISION_REQUESTED'}
                      onClick={() => handleExecuteStatusChange('REVISION_REQUESTED')}
                      className={`px-2 py-2 rounded-xl text-[11px] font-bold border transition ${
                        selectedRequest.status === 'REVISION_REQUESTED'
                          ? 'bg-rose-100 text-rose-800 border-rose-300 ring-2 ring-rose-400'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      보완요청 발송
                    </button>

                    <button
                      type="button"
                      disabled={isStatusChanging || selectedRequest.status === 'COMPLETED'}
                      onClick={() => handleExecuteStatusChange('COMPLETED')}
                      className={`px-2 py-2 rounded-xl text-[11px] font-bold border transition ${
                        selectedRequest.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-2 ring-emerald-400'
                          : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      검토 완료 (승인)
                    </button>
                  </div>

                  {/* Status change note input */}
                  <input
                    type="text"
                    placeholder="상태 변경 사유나 회원사 안내 메모 입력 (선택사항)"
                    value={statusChangeNote}
                    onChange={(e) => setStatusChangeNote(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                  />
                </div>
              )}

              {/* History / Audit Log */}
              {selectedRequest.history && selectedRequest.history.length > 0 && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <h3 className="font-bold text-slate-800 text-xs">처리 이력</h3>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {selectedRequest.history.map((h, i) => (
                      <div
                        key={i}
                        className="text-[11px] text-slate-600 flex items-center justify-between p-1.5 rounded-lg bg-slate-50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{h.action}</span>
                          {h.note && <span className="text-slate-500">- {h.note}</span>}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {h.actor} ({new Date(h.timestamp).toLocaleDateString('ko-KR')})
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              {role === 'ADMIN' ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTaskModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition shadow-2xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
                    <span>할 일로 추가</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRequest(selectedRequest.id)}
                    className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 text-xs font-semibold px-2 py-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    요청 삭제
                  </button>
                </div>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal from Data Request */}
      {isTaskModalOpen && selectedRequest && role === 'ADMIN' && (
        <CreateTaskFromSourceModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          sourceType="DATA_REQUEST"
          sourceId={selectedRequest.id}
          sourceTitle={selectedRequest.title}
          companyId={selectedRequest.companyId}
          defaultTitle={`[자료요청] ${selectedRequest.title}`}
          defaultDescription={
            selectedRequest.description ||
            (selectedRequest.requestedItems && selectedRequest.requestedItems.length > 0
              ? `요청 항목: ${selectedRequest.requestedItems.join(', ')}`
              : '')
          }
          defaultDueDate={selectedRequest.dueDate || ''}
          defaultPriority="NORMAL"
          onTaskCreated={() => {
            setFeedback({ type: 'success', message: '할 일로 성공적으로 등록되었습니다.' });
            setTimeout(() => setFeedback(null), 4000);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 1-B. Confirmation Modal for COMPANY Submission (Requirements 5 & 6)       */}
      {/* ========================================================================= */}
      {isConfirmSubmitOpen && selectedRequest && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  selectedRequest.status === 'REVISION_REQUESTED'
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedRequest.status === 'REVISION_REQUESTED'
                    ? '보완 자료 재제출 확인'
                    : '자료 제출 확인'}
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-[280px]">
                  {selectedRequest.title}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-2.5">
              <p className="leading-relaxed">
                {selectedRequest.status === 'REVISION_REQUESTED'
                  ? '보완 요청된 자료를 다시 제출하시겠습니까? 제출 완료 시 진행 상태가 [제출완료]로 갱신되며 노무사 재검토가 진행됩니다.'
                  : '해당 요청에 대해 서류 제출을 완료하시겠습니까? 제출 완료 후 진행 상태가 [제출완료]로 변경됩니다.'}
              </p>

              {/* Requirement 6: Display verified uploaded files to be submitted */}
              <div className="border-t border-slate-200 pt-2 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span className="flex items-center gap-1">
                    <Paperclip className="h-3 w-3 text-blue-600" />
                    제출 서류 파일 목록
                  </span>
                  <span className="text-blue-700 font-bold">{activeUploadedFiles.length}건</span>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
                  {activeUploadedFiles.map((file) => (
                    <div
                      key={file.fileId}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-white border border-slate-200 text-[10px]"
                    >
                      <span className="font-semibold text-slate-700 truncate max-w-[220px]" title={file.originalFileName}>
                        {file.originalFileName}
                      </span>
                      <span className="text-slate-400 shrink-0 font-medium">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {companySubmissionNote.trim() && (
                <div className="border-t border-slate-200 pt-2 text-[11px]">
                  <span className="font-bold text-slate-800 block mb-0.5">작성된 제출 메모:</span>
                  <p className="text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200 line-clamp-3">
                    "{companySubmissionNote.trim()}"
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSubmittingData}
                onClick={() => setIsConfirmSubmitOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmittingData}
                onClick={handleCompanySubmit}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs transition ${
                  selectedRequest.status === 'REVISION_REQUESTED'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {isSubmittingData ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    제출 처리 중...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    {selectedRequest.status === 'REVISION_REQUESTED'
                      ? '보완 재제출 확정'
                      : '최종 제출하기'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. New Request Modal (새 자료요청 작성 - ADMIN)                           */}
      {/* ========================================================================= */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-slate-800" />
                신규 자료요청 작성
              </h2>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Step 1: 대상 기업 선택 (companyId 필수) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  1. 요청 대상 기업 <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <select
                    required
                    value={formCompanyId}
                    onChange={(e) => setFormCompanyId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-800 focus:outline-none"
                  >
                    <option value="">대상 기업을 선택하세요</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} {c.businessNumber ? `(${c.businessNumber})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  ※ 자료요청은 반드시 특정 기업(companyId)을 기준으로 엄격히 격리 저장됩니다.
                </p>
              </div>

              {/* Step 2: 제목 & 설명 */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  2. 자료요청 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 2026년 3월 정기 급여 산정 및 4대보험 취득 자료 제출 요청"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  3. 요청 상세 설명 및 작성 지침
                </label>
                <textarea
                  rows={3}
                  placeholder="대상 기간, 서류 작성 시 유의사항, 파일 형식 등을 상세히 안내해주세요."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* Step 3: 제출 기한 */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  4. 제출 기한 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* Step 4: 요청 자료 목록 (requestedItems - dynamic add/delete) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-800">
                    5. 요청 자료 항목 목록 <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    현재 {formRequestedItems.length}개 항목 등록됨
                  </span>
                </div>

                {/* Preset Chips */}
                <div className="mb-2">
                  <span className="text-[10px] text-slate-500 block mb-1">자주 쓰는 요청 항목 (클릭 시 자동 추가):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_ITEMS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAddPresetItem(preset)}
                        className={`text-[10px] px-2 py-1 rounded-lg border transition ${
                          formRequestedItems.includes(preset)
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Current Items List */}
                <div className="space-y-1.5 mb-2.5">
                  {formRequestedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <span className="font-semibold text-slate-800 flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                          {idx + 1}
                        </span>
                        {item}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFormItem(idx)}
                        className="text-rose-500 hover:text-rose-700 text-xs font-semibold p-1 hover:bg-rose-50 rounded"
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Custom Item */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="직접 요청할 서류명 입력 후 추가 (Enter 가능)"
                    value={newItemInput}
                    onChange={(e) => setNewItemInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddNewItem();
                      }
                    }}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewItem}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* Submit / Cancel Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isSubmitting ? '발송 처리 중...' : '요청 발송'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. Edit Request Modal (자료요청 수정 - ADMIN)                              */}
      {/* ========================================================================= */}
      {isEditModalOpen && editingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="h-5 w-5 text-slate-800" />
                  자료요청 내용 수정
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  대상 기업: {getCompanyName(editingRequest.companyId)}
                </p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  자료요청 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  요청 상세 설명 및 지침
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">제출 기한</label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* Items Editor */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  요청 자료 항목 ({editRequestedItems.length}종) <span className="text-rose-500">*</span>
                </label>
                <div className="space-y-1.5 mb-2">
                  {editRequestedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <span className="font-semibold text-slate-800">{item}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEditItem(idx)}
                        className="text-rose-500 hover:text-rose-700 text-xs p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="새 항목명 입력 후 추가"
                    value={editNewItemInput}
                    onChange={(e) => setEditNewItemInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEditItem();
                      }
                    }}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddEditItem}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* Modification Note */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  수정 사유 (이력 저장)
                </label>
                <input
                  type="text"
                  placeholder="예: 근태 마감 일정 변경에 따른 기한 연장"
                  value={editActionNote}
                  onChange={(e) => setEditActionNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isUpdating ? '수정 저장 중...' : '수정사항 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
