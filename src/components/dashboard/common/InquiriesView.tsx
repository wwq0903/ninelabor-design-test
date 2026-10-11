import React, { useEffect, useState } from 'react';
import {
  Inquiry,
  InquiryFile,
  InquiryStatus,
  UserRole,
  InquiryHistory,
  InquiryHistoryEventType,
} from '../../../types';
import { firmService } from '../../../services/firmService';
import {
  inquiryFileService,
  formatFileSize,
  validateFileForUpload,
  INQUIRY_STORAGE_REQUIRED_MESSAGE,
} from '../../../services/inquiryFileService';
import {
  inquiryHistoryService,
  formatHistoryDateTime,
  getHistoryEventTitle,
  getHistoryActorRoleBadge,
  formatHistoryStatusLabel,
} from '../../../services/inquiryHistoryService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  MessageSquare,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  X,
  FileText,
  Paperclip,
  File,
  Download,
  Trash2,
  Loader2,
  Pencil,
  Lock,
  History,
  CheckSquare,
} from 'lucide-react';
import { CreateTaskFromSourceModal } from '../admin/CreateTaskFromSourceModal';

interface InquiriesViewProps {
  role: UserRole;
  title?: string;
  description?: string;
  initialInquiryId?: string;
}

interface PendingUploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'ready' | 'uploading' | 'completed' | 'error';
  errorMessage?: string;
}

const statusMap: Record<InquiryStatus, { label: string; badge: string }> = {
  RECEIVED: { label: '접수', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  IN_PROGRESS: { label: '처리중', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  ANSWERED: { label: '답변완료', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CLOSED: { label: '종결', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  ASSIGNED: { label: '처리중', badge: 'bg-blue-50 text-blue-700 border-blue-200' }, // Legacy fallback
};

export const InquiriesView: React.FC<InquiriesViewProps> = ({
  role,
  title = '통합 문의',
  description = '기업 고객 및 비소속 개인 근로자의 노무 질의와 요청사항을 접수하고 관리합니다.',
  initialInquiryId,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RECEIVED' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED'>('ALL');

  // New Inquiry Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newInquiryFiles, setNewInquiryFiles] = useState<PendingUploadFile[]>([]);
  const [newInquiryError, setNewInquiryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail Modal State & Admin Actions State
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [inquiryFiles, setInquiryFiles] = useState<InquiryFile[]>([]);
  const [inquiryHistories, setInquiryHistories] = useState<InquiryHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null);
  const [fileActionSuccess, setFileActionSuccess] = useState<string | null>(null);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editTitleInput, setEditTitleInput] = useState('');
  const [editContentInput, setEditContentInput] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [adminReplyFiles, setAdminReplyFiles] = useState<PendingUploadFile[]>([]);
  const [answerInput, setAnswerInput] = useState('');
  const [isSavingAnswer, setIsSavingAnswer] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // [R2-5 1/3-C-2-②] 처리이력 조회 헬퍼
  const loadHistoriesForInquiry = async (inquiryId: string) => {
    try {
      setIsLoadingHistory(true);
      const list = await inquiryHistoryService.getInquiryHistories(inquiryId, {
        role,
        companyId: userProfile?.companyId,
        requesterId: currentUser?.uid,
      });
      setInquiryHistories(list || []);
    } catch (err) {
      console.warn('Failed to load inquiry histories', err);
      setInquiryHistories([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Worker affiliation check (R2-5 1/3-A Requirement 3 & 4)
  const isAffiliatedWorker =
    role === 'WORKER' &&
    (userProfile?.membershipType === 'COMPANY_AFFILIATED' ||
      Boolean(userProfile?.companyId) ||
      Boolean(userProfile?.requestedCompanyId) ||
      userProfile?.membershipStatus === 'PENDING_COMPANY_VERIFICATION');

  const isIndividualWorker =
    role === 'WORKER' &&
    userProfile?.membershipType === 'INDIVIDUAL' &&
    !userProfile?.companyId &&
    !userProfile?.requestedCompanyId;

  const canCreateInquiry = role === 'COMPANY' || (role === 'WORKER' && isIndividualWorker);

  const fetchInquiries = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      let list: Inquiry[] = [];

      if (role === 'ADMIN') {
        list = await firmService.getAllInquiries();
      } else if (role === 'COMPANY') {
        if (userProfile?.companyId) {
          list = await firmService.getInquiriesByCompany(userProfile.companyId);
        }
      } else if (role === 'WORKER') {
        if (isIndividualWorker) {
          list = await firmService.getInquiriesByRequester(currentUser.uid);
        } else {
          // Affiliated workers are blocked from querying inquiries
          list = [];
        }
      }

      setInquiries(list);
    } catch (err) {
      console.error('Failed to fetch inquiries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries();
  }, [currentUser, role, userProfile?.companyId, userProfile?.membershipType]);

  const handleOpenDetail = (inq: Inquiry) => {
    setSelectedInquiry(inq);
    setAnswerInput(inq.answer || inq.reply || '');
    setActionError(null);
    setFileActionSuccess(null);
    setDeletingFileId(null);
    setConfirmDeleteFileId(null);
    setIsEditingContent(false);
    setEditTitleInput('');
    setEditContentInput('');
    setAdminReplyFiles([]);
    setInquiryHistories([]);
    loadHistoriesForInquiry(inq.id);
    inquiryFileService
      .getInquiryFiles(inq.id)
      .then((files) => setInquiryFiles(files || []))
      .catch((err) => {
        console.warn('Failed to load inquiry files', err);
        setInquiryFiles([]);
      });
  };

  // [R3-3 3/3-B-④-A] 할 일에서 원본 업무 이동 시 해당 문의 상세 모달 자동 오픈
  const autoOpenedInquiryRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!initialInquiryId) {
      autoOpenedInquiryRef.current = null;
      return;
    }
    if (autoOpenedInquiryRef.current === initialInquiryId) return;
    if (selectedInquiry && selectedInquiry.id === initialInquiryId) {
      autoOpenedInquiryRef.current = initialInquiryId;
      return;
    }

    if (inquiries.length > 0) {
      const match = inquiries.find((i) => i.id === initialInquiryId);
      if (match) {
        autoOpenedInquiryRef.current = initialInquiryId;
        handleOpenDetail(match);
        return;
      }
    }

    let isCancelled = false;
    firmService
      .getInquiryById(initialInquiryId)
      .then((inq) => {
        if (inq && !isCancelled) {
          autoOpenedInquiryRef.current = initialInquiryId;
          handleOpenDetail(inq);
        }
      })
      .catch((err) => {
        console.warn('Failed to load initial inquiry directly:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [initialInquiryId, inquiries]);

  const handleSelectNewInquiryFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setNewInquiryError(null);
    const newItems: PendingUploadFile[] = [];

    Array.from(fileList).forEach((file) => {
      const validation = validateFileForUpload(file);
      if (!validation.isValid) {
        newItems.push({
          id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          file,
          name: file.name,
          size: file.size,
          status: 'error',
          errorMessage: validation.error || '유효하지 않은 파일입니다.',
        });
      } else {
        newItems.push({
          id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          file,
          name: file.name,
          size: file.size,
          status: 'ready',
        });
      }
    });

    setNewInquiryFiles((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveNewInquiryFile = (id: string) => {
    setNewInquiryFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSelectAdminReplyFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setActionError(null);
    const newItems: PendingUploadFile[] = [];

    Array.from(fileList).forEach((file) => {
      const validation = validateFileForUpload(file);
      if (!validation.isValid) {
        newItems.push({
          id: `af_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          file,
          name: file.name,
          size: file.size,
          status: 'error',
          errorMessage: validation.error || '유효하지 않은 파일입니다.',
        });
      } else {
        newItems.push({
          id: `af_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          file,
          name: file.name,
          size: file.size,
          status: 'ready',
        });
      }
    });

    setAdminReplyFiles((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveAdminReplyFile = (id: string) => {
    setAdminReplyFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDownloadFile = async (file: InquiryFile) => {
    if (!currentUser) {
      setActionError('로그인이 필요합니다.');
      return;
    }

    if (role === 'WORKER' && isAffiliatedWorker) {
      setActionError('회사 소속 근로자는 통합 문의 파일에 접근할 수 없습니다.');
      return;
    }

    if (role === 'COMPANY' && userProfile?.companyId !== file.companyId) {
      setActionError('자사 문의 파일만 다운로드할 수 있습니다.');
      return;
    }

    if (
      role === 'WORKER' &&
      isIndividualWorker &&
      currentUser.uid !== file.requesterId &&
      currentUser.uid !== file.uploadedById
    ) {
      setActionError('본인이 작성한 문의의 파일만 다운로드할 수 있습니다.');
      return;
    }

    try {
      setActionError(null);
      await inquiryFileService.downloadInquiryFile(file);
    } catch (err: any) {
      console.warn('Download error:', err.message);
      setActionError(err.message || INQUIRY_STORAGE_REQUIRED_MESSAGE);
    }
  };

  /**
   * R2-5 1/3-C-1-③-C: 첨부파일 삭제 권한 검증 및 삭제 로직
   * - ADMIN: 모든 파일 삭제 가능
   * - COMPANY: 자기 회사 문의에서 본인이 업로드한 파일만 삭제 가능
   * - 비소속 개인 WORKER: 본인 문의에서 본인이 업로드한 파일만 삭제 가능
   * - 회사 소속 WORKER: 삭제 불가
   */
  const canDeleteFile = (file: InquiryFile): boolean => {
    if (!currentUser) return false;
    if (role === 'ADMIN') return true;
    if (
      role === 'COMPANY' &&
      userProfile?.companyId &&
      file.companyId === userProfile.companyId &&
      file.uploadedById === currentUser.uid
    ) {
      return true;
    }
    if (
      role === 'WORKER' &&
      isIndividualWorker &&
      file.requesterId === currentUser.uid &&
      file.uploadedById === currentUser.uid
    ) {
      return true;
    }
    return false;
  };

  const handleDeleteFile = async (file: InquiryFile) => {
    if (!currentUser) {
      setActionError('로그인이 필요합니다.');
      return;
    }

    if (!canDeleteFile(file)) {
      setActionError('첨부파일 삭제 권한이 없습니다 (본인이 업로드한 파일만 삭제 가능).');
      return;
    }

    try {
      setDeletingFileId(file.id);
      setActionError(null);
      setFileActionSuccess(null);

      // 실제 Storage 파일 삭제 성공 후 -> Firestore 메타데이터 삭제 순서 엄수
      await inquiryFileService.deleteInquiryFile({
        file,
        currentUserId: currentUser.uid,
        currentUserRole: role,
        companyId: userProfile?.companyId,
        isIndividualWorker,
      });

      // 성공 시에만 목록에서 제거
      setInquiryFiles((prev) => prev.filter((f) => f.id !== file.id));
      setConfirmDeleteFileId(null);
      setFileActionSuccess(`"${file.originalFileName}" 파일이 삭제되었습니다.`);
    } catch (err: any) {
      console.error('Delete error:', err);
      setActionError(err.message || '파일 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingFileId(null);
    }
  };

  // [R2-5 1/3-C-2-①] 문의 수정 권한 및 잠금 조건
  // 1. COMPANY: 자사 문의 + 본인 작성자
  // 2. 비소속 개인 WORKER: 본인 작성자
  const isOwnerOfSelectedInquiry = Boolean(
    selectedInquiry &&
      currentUser &&
      (
        (role === 'COMPANY' &&
          Boolean(userProfile?.companyId) &&
          selectedInquiry.companyId === userProfile?.companyId &&
          (selectedInquiry.requesterId === currentUser.uid || selectedInquiry.authorId === currentUser.uid)) ||
        (role === 'WORKER' &&
          isIndividualWorker &&
          (selectedInquiry.requesterId === currentUser.uid || selectedInquiry.authorId === currentUser.uid))
      )
  );

  // 수정 가능 조건:
  // - status == 'RECEIVED' (접수 상태에서만)
  // - ADMIN 답변(answer 또는 reply)이 없는 경우에만
  // - CLOSED 상태가 아닌 경우
  const canEditSelectedInquiry = Boolean(
    isOwnerOfSelectedInquiry &&
      selectedInquiry &&
      selectedInquiry.status === 'RECEIVED' &&
      !selectedInquiry.answer?.trim() &&
      !selectedInquiry.reply?.trim()
  );

  const handleStartEditContent = () => {
    if (!selectedInquiry || !canEditSelectedInquiry) return;
    setEditTitleInput(selectedInquiry.title);
    setEditContentInput(selectedInquiry.content);
    setIsEditingContent(true);
    setActionError(null);
  };

  const handleCancelEditContent = () => {
    setIsEditingContent(false);
    setActionError(null);
  };

  const handleSaveEditContent = async () => {
    if (!currentUser || !selectedInquiry || !canEditSelectedInquiry) {
      setActionError('문의 내용을 수정할 수 없습니다 (접수 상태 및 답변 대기 중인 경우에만 수정 가능).');
      return;
    }
    if (!editTitleInput.trim()) {
      setActionError('문의 제목을 입력해주세요.');
      return;
    }
    if (!editContentInput.trim()) {
      setActionError('문의 내용을 입력해주세요.');
      return;
    }

    try {
      setIsSavingEdit(true);
      setActionError(null);

      await firmService.editInquiryContent(selectedInquiry.id, {
        title: editTitleInput.trim(),
        content: editContentInput.trim(),
      });

      // [R2-5 1/3-C-2-②] 처리이력: INQUIRY_EDITED 기록 (민감 원문 제외)
      try {
        await inquiryHistoryService.recordHistory({
          inquiryId: selectedInquiry.id,
          companyId: selectedInquiry.companyId,
          requesterId: selectedInquiry.requesterId,
          eventType: 'INQUIRY_EDITED',
          actorId: currentUser.uid,
          actorRole: role as 'COMPANY' | 'WORKER',
          actorName: userProfile?.displayName || (role === 'COMPANY' ? '기업 담당자' : '개인 근로자'),
        });
        await loadHistoriesForInquiry(selectedInquiry.id);
      } catch (histErr) {
        console.warn('History recording notice (INQUIRY_EDITED):', histErr);
      }

      const updated = {
        ...selectedInquiry,
        title: editTitleInput.trim(),
        content: editContentInput.trim(),
        updatedAt: new Date().toISOString(),
      };
      setSelectedInquiry(updated);
      setIsEditingContent(false);
      setFileActionSuccess('문의 제목과 내용이 성공적으로 수정되었습니다.');
      await fetchInquiries();
    } catch (err: any) {
      console.error('Failed to edit inquiry content:', err);
      setActionError(err.message || '문의 수정 중 오류가 발생했습니다.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCreateInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newTitle.trim() || !newContent.trim()) return;

    // Check if any file has validation error before attempting
    const hasValidationError = newInquiryFiles.some(
      (f) => f.status === 'error' && f.errorMessage !== INQUIRY_STORAGE_REQUIRED_MESSAGE
    );
    if (hasValidationError) {
      setNewInquiryError('보안 검증을 통과하지 못한 파일이 포함되어 있습니다. 확인 후 다시 시도해 주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      setNewInquiryError(null);

      let createdInquiry: Inquiry | undefined;

      if (role === 'COMPANY') {
        const targetCompanyId = userProfile?.companyId?.trim() || null;
        if (!targetCompanyId) {
          setNewInquiryError('소속 기업 정보를 확인할 수 없습니다.');
          return;
        }

        createdInquiry = await firmService.createInquiry({
          companyId: targetCompanyId,
          companyName: userProfile?.companyName || null,
          requesterId: currentUser.uid,
          requesterRole: 'COMPANY',
          requesterName: userProfile?.displayName || '기업 담당자',
          authorId: currentUser.uid,
          authorName: userProfile?.displayName || '기업 담당자',
          authorRole: 'COMPANY',
          title: newTitle.trim(),
          content: newContent.trim(),
          status: 'RECEIVED',
        });
      } else if (role === 'WORKER' && isIndividualWorker) {
        // Individual Worker: companyId must be null
        createdInquiry = await firmService.createInquiry({
          companyId: null,
          companyName: null,
          requesterId: currentUser.uid,
          requesterRole: 'WORKER',
          requesterName: userProfile?.displayName || '개인 근로자',
          authorId: currentUser.uid,
          authorName: userProfile?.displayName || '개인 근로자',
          authorRole: 'WORKER',
          title: newTitle.trim(),
          content: newContent.trim(),
          status: 'RECEIVED',
        });
      }

      if (!createdInquiry) {
        throw new Error('문의 등록에 실패했습니다.');
      }

      // [R2-5 1/3-C-2-②] 처리이력: INQUIRY_CREATED 기록 (민감 원문 제외)
      try {
        await inquiryHistoryService.recordHistory({
          inquiryId: createdInquiry.id,
          companyId: createdInquiry.companyId,
          requesterId: createdInquiry.requesterId,
          eventType: 'INQUIRY_CREATED',
          actorId: currentUser.uid,
          actorRole: role as 'COMPANY' | 'WORKER',
          actorName: userProfile?.displayName || (role === 'COMPANY' ? '기업 담당자' : '개인 근로자'),
          metadata: {
            toStatus: 'RECEIVED',
          },
        });
      } catch (histErr) {
        console.warn('History recording notice (INQUIRY_CREATED):', histErr);
      }

      // If files are attached, attempt actual upload to Firebase Storage
      let hasUploadFailure = false;
      if (newInquiryFiles.length > 0) {
        const updatedFiles = [...newInquiryFiles];

        for (let i = 0; i < updatedFiles.length; i++) {
          const item = updatedFiles[i];
          if (item.status === 'ready' || item.status === 'error') {
            item.status = 'uploading';
            setNewInquiryFiles([...updatedFiles]);

            try {
              await inquiryFileService.uploadInquiryFile({
                file: item.file,
                inquiryId: createdInquiry.id,
                companyId: createdInquiry.companyId,
                requesterId: currentUser.uid,
                uploadedById: currentUser.uid,
                uploadedByRole: role as 'COMPANY' | 'WORKER',
              });
              item.status = 'completed';
              item.errorMessage = undefined;
            } catch {
              hasUploadFailure = true;
              item.status = 'error';
              item.errorMessage = INQUIRY_STORAGE_REQUIRED_MESSAGE;
            }
            setNewInquiryFiles([...updatedFiles]);
          }
        }
      }

      await fetchInquiries();

      if (hasUploadFailure) {
        setNewInquiryError(INQUIRY_STORAGE_REQUIRED_MESSAGE);
      } else {
        setNewTitle('');
        setNewContent('');
        setNewInquiryFiles([]);
        setIsCreateModalOpen(false);
      }
    } catch (err: any) {
      console.warn('Failed to create inquiry:', err);
      setNewInquiryError(err.message || '문의 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // R2-5 1/3-B: ADMIN 답변 저장 (답변 저장 시 status: ANSWERED로 자동 전환)
  const handleSaveAnswer = async () => {
    if (!selectedInquiry || !currentUser || role !== 'ADMIN') return;
    if (!answerInput.trim()) {
      setActionError('답변 내용을 입력해 주세요. (빈 답변은 저장할 수 없습니다)');
      return;
    }

    try {
      setIsSavingAnswer(true);
      setActionError(null);
      const adminName = userProfile?.displayName || '공인노무사/관리자';

      const isAlreadyAnswered = Boolean(
        selectedInquiry.answer?.trim() || selectedInquiry.reply?.trim()
      );
      const answerEventType: InquiryHistoryEventType = isAlreadyAnswered
        ? 'ANSWER_UPDATED'
        : 'ANSWER_CREATED';

      await firmService.saveInquiryAnswer(
        selectedInquiry.id,
        answerInput.trim(),
        currentUser.uid,
        adminName
      );

      // [R2-5 1/3-C-2-②] 처리이력: ANSWER_CREATED 또는 ANSWER_UPDATED 기록 (민감 원문 제외)
      try {
        await inquiryHistoryService.recordHistory({
          inquiryId: selectedInquiry.id,
          companyId: selectedInquiry.companyId,
          requesterId: selectedInquiry.requesterId,
          eventType: answerEventType,
          actorId: currentUser.uid,
          actorRole: 'ADMIN',
          actorName: adminName,
          metadata: {
            fromStatus: selectedInquiry.status,
            toStatus: 'ANSWERED',
          },
        });
        await loadHistoriesForInquiry(selectedInquiry.id);
      } catch (histErr) {
        console.warn('History recording notice (ANSWER):', histErr);
      }

      // Attempt actual upload of admin reply files if any
      let hasUploadFailure = false;
      if (adminReplyFiles.length > 0) {
        const updatedFiles = [...adminReplyFiles];
        for (let i = 0; i < updatedFiles.length; i++) {
          const item = updatedFiles[i];
          if (item.status === 'ready' || item.status === 'error') {
            item.status = 'uploading';
            setAdminReplyFiles([...updatedFiles]);

            try {
              await inquiryFileService.uploadInquiryFile({
                file: item.file,
                inquiryId: selectedInquiry.id,
                companyId: selectedInquiry.companyId,
                requesterId: selectedInquiry.requesterId,
                uploadedById: currentUser.uid,
                uploadedByRole: 'ADMIN',
              });
              item.status = 'completed';
              item.errorMessage = undefined;
            } catch {
              hasUploadFailure = true;
              item.status = 'error';
              item.errorMessage = INQUIRY_STORAGE_REQUIRED_MESSAGE;
            }
            setAdminReplyFiles([...updatedFiles]);
          }
        }
      }

      const now = new Date().toISOString();
      setSelectedInquiry((prev) =>
        prev
          ? {
              ...prev,
              answer: answerInput.trim(),
              answeredAt: now,
              answeredById: currentUser.uid,
              answeredByName: adminName,
              status: 'ANSWERED',
              reply: answerInput.trim(),
              replyAuthorName: adminName,
            }
          : null
      );

      // Refresh existing inquiry files
      const refreshedFiles = await inquiryFileService.getInquiryFiles(selectedInquiry.id);
      setInquiryFiles(refreshedFiles || []);

      await fetchInquiries();

      if (hasUploadFailure) {
        setActionError(INQUIRY_STORAGE_REQUIRED_MESSAGE);
      } else {
        setAdminReplyFiles([]);
      }
    } catch (err: any) {
      console.warn('Failed to save answer:', err);
      setActionError(err.message || '답변 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingAnswer(false);
    }
  };

  // R2-5 1/3-B: ADMIN 문의 상태 명시적 변경
  const handleUpdateStatus = async (newStatus: InquiryStatus) => {
    if (!selectedInquiry || !currentUser || role !== 'ADMIN') return;

    try {
      setIsUpdatingStatus(true);
      setActionError(null);

      const statusEventType: InquiryHistoryEventType =
        newStatus === 'CLOSED' ? 'INQUIRY_CLOSED' : 'STATUS_CHANGED';

      await firmService.updateInquiryStatus(selectedInquiry.id, newStatus);

      // [R2-5 1/3-C-2-②] 처리이력: STATUS_CHANGED 또는 INQUIRY_CLOSED 기록 (민감 원문 제외)
      try {
        await inquiryHistoryService.recordHistory({
          inquiryId: selectedInquiry.id,
          companyId: selectedInquiry.companyId,
          requesterId: selectedInquiry.requesterId,
          eventType: statusEventType,
          actorId: currentUser.uid,
          actorRole: 'ADMIN',
          actorName: userProfile?.displayName || '공인노무사/관리자',
          metadata: {
            fromStatus: selectedInquiry.status,
            toStatus: newStatus,
          },
        });
        await loadHistoriesForInquiry(selectedInquiry.id);
      } catch (histErr) {
        console.warn('History recording notice (STATUS):', histErr);
      }

      setSelectedInquiry((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus,
            }
          : null
      );

      await fetchInquiries();
    } catch (err: any) {
      console.error('Failed to update inquiry status:', err);
      setActionError(err.message || '상태 변경 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Affiliated worker blocked view (Requirement 3 & 4)
  if (role === 'WORKER' && isAffiliatedWorker) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs max-w-lg mx-auto my-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-4">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">통합 문의 이용 안내</h3>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          회사에 소속된 근로자는 통합 문의 기능을 이용할 수 없습니다.
          소속 기업의 인사담당자 또는 회사 공인노무사를 통해 문의해 주시기 바랍니다.
        </p>
      </div>
    );
  }

  const filteredInquiries =
    statusFilter === 'ALL'
      ? inquiries
      : inquiries.filter((inq) => {
          if (statusFilter === 'IN_PROGRESS' && inq.status === 'ASSIGNED') return true;
          return inq.status === statusFilter;
        });

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {role === 'ADMIN' ? '통합 노무실' : '상담 및 질의'}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              4단계 상태 관리
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <MessageSquare className="h-6 w-6 text-slate-700" />
            {title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>

        {canCreateInquiry && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition"
          >
            <Plus className="h-4 w-4" />
            새 문의 작성
          </button>
        )}
      </div>

      {/* Status Filter Tabs (RECEIVED, IN_PROGRESS, ANSWERED, CLOSED) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 text-xs">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`px-3 py-2 font-medium rounded-lg transition whitespace-nowrap ${
            statusFilter === 'ALL'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          전체 ({inquiries.length})
        </button>
        {(['RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'] as const).map((st) => {
          const count = inquiries.filter((i) => {
            if (st === 'IN_PROGRESS' && i.status === 'ASSIGNED') return true;
            return i.status === st;
          }).length;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-2 font-medium rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{statusMap[st]?.label}</span>
              <span className="text-[11px] opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Inquiries Table (상태, 제목, 문의자, 회사 또는 개인, 접수일) */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">문의 목록을 불러오는 중입니다...</div>
        ) : filteredInquiries.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">등록된 문의가 없습니다</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              {canCreateInquiry
                ? '상단의 "새 문의 작성" 버튼을 통해 노무 관련 질의사항을 접수할 수 있습니다.'
                : '현재 접수된 문의가 없거나 선택한 상태에 해당하는 문의가 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="py-3 px-4">상태</th>
                  <th className="py-3 px-4">제목</th>
                  <th className="py-3 px-4">문의자</th>
                  <th className="py-3 px-4">회사 또는 개인</th>
                  <th className="py-3 px-4">접수일</th>
                  <th className="py-3 px-4 text-right">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredInquiries.map((inq) => {
                  const requesterDisplay = inq.requesterName || inq.authorName || '문의자';
                  const companyOrIndividual = inq.companyName
                    ? inq.companyName
                    : inq.companyId
                    ? inq.companyId
                    : '개인 (비소속)';
                  const currentStatus = inq.status || 'RECEIVED';
                  const statusInfo = statusMap[currentStatus] || statusMap.RECEIVED;

                  return (
                    <tr
                      key={inq.id}
                      onClick={() => handleOpenDetail(inq)}
                      className="hover:bg-slate-50/60 cursor-pointer transition"
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusInfo.badge}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-xs truncate">
                        {inq.title}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span>{requesterDisplay}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span className={inq.companyId ? 'font-medium text-slate-800' : 'text-slate-500'}>
                            {companyOrIndividual}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(inq.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="text-blue-600 font-medium hover:underline">열람</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inquiry Detail Modal */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                      (statusMap[selectedInquiry.status] || statusMap.RECEIVED).badge
                    }`}
                  >
                    {(statusMap[selectedInquiry.status] || statusMap.RECEIVED).label}
                  </span>
                  {selectedInquiry.updatedAt && selectedInquiry.updatedAt !== selectedInquiry.createdAt && (
                    <span className="text-[10px] text-slate-400">
                      (수정됨: {new Date(selectedInquiry.updatedAt).toLocaleDateString('ko-KR')})
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{selectedInquiry.title}</h3>
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
                  type="button"
                  onClick={() => setSelectedInquiry(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Error Notification */}
            {actionError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Success Notification */}
            {fileActionSuccess && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{fileActionSuccess}</span>
              </div>
            )}

            {/* Submitter & Metadata (작성자, 회사/개인 구분, 작성일) */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">작성자 (문의자)</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {selectedInquiry.requesterName || selectedInquiry.authorName || '문의자'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">회사 / 개인 구분</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {selectedInquiry.companyName
                    ? selectedInquiry.companyName
                    : selectedInquiry.companyId
                    ? selectedInquiry.companyId
                    : '개인 (비소속)'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">작성일시 (접수일)</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {new Date(selectedInquiry.createdAt).toLocaleString('ko-KR')}
                </span>
              </div>
            </div>

            {/* Inquiry Content (문의 내용) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-700">문의 내용</h4>
                {/* COMPANY / 비소속 개인 WORKER 전용: 수정 버튼 또는 잠금 상태 뱃지 */}
                {role !== 'ADMIN' && isOwnerOfSelectedInquiry && (
                  canEditSelectedInquiry ? (
                    !isEditingContent && (
                      <button
                        type="button"
                        onClick={handleStartEditContent}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                      >
                        <Pencil className="h-3 w-3 text-slate-500" />
                        <span>문의 수정</span>
                      </button>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                      <Lock className="h-3 w-3 text-slate-400" />
                      <span>
                        {selectedInquiry.status === 'CLOSED'
                          ? '종결된 문의는 수정할 수 없습니다'
                          : selectedInquiry.answer?.trim() || selectedInquiry.reply?.trim()
                          ? '답변 등록 완료 (수정 불가)'
                          : '처리 진행 중 (수정 불가)'}
                      </span>
                    </span>
                  )
                )}
              </div>

              {isEditingContent ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      문의 제목 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editTitleInput}
                      onChange={(e) => setEditTitleInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                      placeholder="문의 제목을 입력해주세요"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      문의 내용 <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={5}
                      value={editContentInput}
                      onChange={(e) => setEditContentInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs focus:border-slate-800 focus:outline-none"
                      placeholder="문의 내용을 입력해주세요"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={handleCancelEditContent}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={handleSaveEditContent}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      {isSavingEdit ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>저장 중...</span>
                        </>
                      ) : (
                        <span>수정 내용 저장</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap min-h-[100px]">
                  {selectedInquiry.content}
                </div>
              )}
            </div>

            {/* Attached files list (With Download & RBAC Delete) */}
            {inquiryFiles.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                  첨부파일 ({inquiryFiles.length}개)
                </h4>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                  {inquiryFiles.map((file) => {
                    const userCanDelete = canDeleteFile(file);
                    const isDeletingThis = deletingFileId === file.id;
                    const isConfirmingThis = confirmDeleteFileId === file.id;

                    return (
                      <div
                        key={file.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border border-slate-200 text-xs shadow-2xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate font-medium text-slate-800" title={file.originalFileName}>
                            {file.originalFileName}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            ({formatFileSize(file.size)})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {file.uploadedByRole === 'ADMIN' ? '답변 첨부' : '문의 첨부'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(file)}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 text-[11px] font-medium border border-blue-200 transition"
                            title="파일 다운로드"
                          >
                            <Download className="h-3 w-3" />
                            <span>다운로드</span>
                          </button>

                          {userCanDelete && (
                            isConfirmingThis ? (
                              <div className="inline-flex items-center gap-1 bg-red-50 p-0.5 rounded-md border border-red-200">
                                <span className="text-[10px] font-semibold text-red-700 px-1">삭제?</span>
                                <button
                                  type="button"
                                  disabled={isDeletingThis}
                                  onClick={() => handleDeleteFile(file)}
                                  className="inline-flex items-center gap-1 rounded bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 text-[10px] font-bold transition disabled:opacity-50"
                                >
                                  {isDeletingThis ? (
                                    <>
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                      <span>삭제중...</span>
                                    </>
                                  ) : (
                                    <span>확인</span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeletingThis}
                                  onClick={() => setConfirmDeleteFileId(null)}
                                  className="inline-flex items-center rounded bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 text-[10px] transition font-medium"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isDeletingThis}
                                onClick={() => {
                                  setActionError(null);
                                  setFileActionSuccess(null);
                                  setConfirmDeleteFileId(file.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 text-[11px] font-medium border border-red-200 transition disabled:opacity-50"
                                title="파일 삭제"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>삭제</span>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. COMPANY / 개인 WORKER 답변 조회 영역 */}
            {role !== 'ADMIN' && (
              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  공인노무사/관리자 답변
                </h4>
                {selectedInquiry.answer || selectedInquiry.reply ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs border-b border-emerald-100 pb-2">
                      <span className="font-semibold text-emerald-900">
                        {selectedInquiry.answeredByName || selectedInquiry.replyAuthorName || '노무법인 나인'}
                      </span>
                      {selectedInquiry.answeredAt && (
                        <span className="text-[11px] text-emerald-700">
                          답변일시: {new Date(selectedInquiry.answeredAt).toLocaleString('ko-KR')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap pt-1">
                      {selectedInquiry.answer || selectedInquiry.reply}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
                    아직 답변이 등록되지 않았습니다.
                  </div>
                )}
              </div>
            )}

            {/* 1 & 2. ADMIN 전용: 상태 제어 및 답변 작성/수정 */}
            {role === 'ADMIN' && (
              <div className="pt-3 border-t border-slate-200 space-y-4">
                {/* 문의 상태 명시적 변경 */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">문의 상태 관리 (ADMIN)</span>
                    <span className="text-[11px] text-slate-500">
                      현재: {(statusMap[selectedInquiry.status] || statusMap.RECEIVED).label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {(['RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'] as const).map((st) => {
                      const isActive = selectedInquiry.status === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={isUpdatingStatus || isActive}
                          onClick={() => handleUpdateStatus(st)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                            isActive
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {statusMap[st].label} {isActive && '✓'}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    * 답변을 작성하여 저장하면 자동으로 '답변완료'로 변경됩니다. 모든 상담 및 검토가 끝나면 '종결'을 눌러주세요.
                  </p>
                </div>

                {/* ADMIN 답변 작성 / 수정 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      {selectedInquiry.answer || selectedInquiry.reply ? '답변 수정' : '답변 작성'}
                    </h4>
                    {selectedInquiry.answeredAt && (
                      <span className="text-[11px] text-slate-400">
                        기존 답변일시: {new Date(selectedInquiry.answeredAt).toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={5}
                    placeholder="문의에 대한 법률 검토 답변 및 조치 가이드를 작성해주세요... (빈 답변은 저장할 수 없습니다)"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-slate-800 focus:outline-none"
                  />

                  {/* ADMIN 답변 첨부파일 영역 */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                        답변 첨부파일 (선택)
                      </label>
                      <span className="text-[11px] text-slate-400">
                        최대 20MB · 문서/이미지/압축파일
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-xs">
                        <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                        <span>파일 추가</span>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleSelectAdminReplyFiles}
                        />
                      </label>
                      <span className="text-[11px] text-slate-500">
                        {adminReplyFiles.length === 0
                          ? '선택된 파일 없음'
                          : `${adminReplyFiles.length}개 파일 선택됨`}
                      </span>
                    </div>

                    {adminReplyFiles.length > 0 && (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                        {adminReplyFiles.map((af) => (
                          <div
                            key={af.id}
                            className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 border border-slate-200 text-xs shadow-2xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate font-medium text-slate-800" title={af.name}>
                                {af.name}
                              </span>
                              <span className="text-[11px] text-slate-400 shrink-0">
                                ({formatFileSize(af.size)})
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {af.status === 'ready' && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  업로드 대기
                                </span>
                              )}
                              {af.status === 'uploading' && (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 animate-pulse">
                                  업로드 중...
                                </span>
                              )}
                              {af.status === 'completed' && (
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  완료
                                </span>
                              )}
                              {af.status === 'error' && (
                                <span
                                  className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 border border-rose-200 max-w-[200px] truncate"
                                  title={af.errorMessage}
                                >
                                  {af.errorMessage || INQUIRY_STORAGE_REQUIRED_MESSAGE}
                                </span>
                              )}

                              {af.status !== 'uploading' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAdminReplyFile(af.id)}
                                  className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition"
                                  title="파일 제거"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSavingAnswer || !answerInput.trim()}
                      onClick={handleSaveAnswer}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {isSavingAnswer ? '저장 중...' : '답변 저장 (상태: 답변완료)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. [처리이력] 영역 (R2-5 1/3-C-2-② 통합 문의 처리이력) */}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <History className="h-4 w-4 text-slate-600" />
                  <span>처리이력</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    ({inquiryHistories.length}건)
                  </span>
                </h4>
                <span className="text-[10px] text-slate-400">
                  * 수정 및 삭제가 불가능한 불변 감사 이력입니다
                </span>
              </div>

              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-6 text-xs text-slate-400 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  <span>처리이력을 불러오는 중입니다...</span>
                </div>
              ) : inquiryHistories.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
                  <Clock className="h-4 w-4 text-slate-300 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">기록된 처리이력이 없습니다.</p>
                  {selectedInquiry.createdAt && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      문의 등록일시: {formatHistoryDateTime(selectedInquiry.createdAt)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-0">
                  <div className="relative pl-1">
                    {inquiryHistories.map((hist, idx) => {
                      const isLast = idx === inquiryHistories.length - 1;
                      const actorBadge = getHistoryActorRoleBadge(hist.actorRole);
                      const eventTitle = getHistoryEventTitle(hist.eventType, hist.metadata);

                      // Event type color
                      let dotColor = 'bg-slate-400 ring-slate-100';
                      if (hist.eventType === 'INQUIRY_CREATED') dotColor = 'bg-amber-500 ring-amber-100';
                      else if (hist.eventType === 'INQUIRY_EDITED') dotColor = 'bg-blue-500 ring-blue-100';
                      else if (hist.eventType === 'STATUS_CHANGED') dotColor = 'bg-indigo-500 ring-indigo-100';
                      else if (hist.eventType === 'ANSWER_CREATED' || hist.eventType === 'ANSWER_UPDATED') dotColor = 'bg-emerald-500 ring-emerald-100';
                      else if (hist.eventType === 'INQUIRY_CLOSED') dotColor = 'bg-slate-600 ring-slate-200';

                      return (
                        <div key={hist.id} className="relative pl-6 pb-3.5 last:pb-0">
                          {/* Vertical line connecting nodes */}
                          {!isLast && (
                            <div className="absolute left-[7px] top-3.5 bottom-0 w-0.5 bg-slate-200" />
                          )}
                          {/* Bullet node */}
                          <div
                            className={`absolute left-[3px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ${dotColor}`}
                          />

                          <div className="bg-white rounded-lg border border-slate-200/90 p-2.5 shadow-2xs space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                              <span className="font-semibold text-slate-800">
                                {formatHistoryDateTime(hist.createdAt)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-600 font-medium">
                                  {hist.actorName}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${actorBadge.badgeClass}`}
                                >
                                  {actorBadge.label}
                                </span>
                              </div>
                            </div>

                            <div className="text-xs font-medium text-slate-700 leading-snug">
                              {eventTitle}
                            </div>

                            {hist.eventType === 'STATUS_CHANGED' &&
                              hist.metadata?.fromStatus &&
                              hist.metadata?.toStatus && (
                                <div className="text-[11px] text-slate-400">
                                  ({formatHistoryStatusLabel(hist.metadata.fromStatus)} → {formatHistoryStatusLabel(hist.metadata.toStatus)})
                                </div>
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Close Button & Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                {role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => setIsTaskModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
                    <span>할 일로 추가</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedInquiry(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal from Inquiry */}
      {isTaskModalOpen && selectedInquiry && role === 'ADMIN' && (
        <CreateTaskFromSourceModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          sourceType="INQUIRY"
          sourceId={selectedInquiry.id}
          sourceTitle={selectedInquiry.title}
          companyId={selectedInquiry.companyId ? selectedInquiry.companyId : undefined}
          defaultTitle={`[문의] ${selectedInquiry.title}`}
          defaultDescription={selectedInquiry.content || ''}
          defaultPriority="NORMAL"
          onTaskCreated={() => {
            setFileActionSuccess('할 일로 성공적으로 등록되었습니다.');
            setTimeout(() => setFileActionSuccess(null), 4000);
          }}
        />
      )}

      {/* New Inquiry Modal (COMPANY 또는 비소속 개인 WORKER) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {role === 'COMPANY' ? '회사 노무 문의 접수' : '개인 노무 문의 접수'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateInquiry} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  문의 명의
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {role === 'COMPANY' ? (
                    <span className="font-medium text-slate-800">
                      {userProfile?.companyName || '소속 기업'} 명의 문의
                    </span>
                  ) : (
                    <span className="font-medium text-slate-800">
                      비소속 개인 근로자 ({userProfile?.displayName || '본인'}) 명의 문의
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  문의 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="문의의 핵심 요지를 작성해주세요"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  문의 내용 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="사실 관계 및 구체적인 질문 내용을 작성해주세요..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* 첨부파일 선택 및 상태 목록 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    첨부파일 (선택)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    최대 20MB · 문서/이미지/압축파일
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-xs">
                    <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                    <span>파일 선택</span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleSelectNewInquiryFiles}
                    />
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {newInquiryFiles.length === 0
                      ? '선택된 파일 없음'
                      : `${newInquiryFiles.length}개 파일 선택됨`}
                  </span>
                </div>

                {newInquiryFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                    {newInquiryFiles.map((pf) => (
                      <div
                        key={pf.id}
                        className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 border border-slate-200 text-xs shadow-2xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate font-medium text-slate-800" title={pf.name}>
                            {pf.name}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            ({formatFileSize(pf.size)})
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {pf.status === 'ready' && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              업로드 대기
                            </span>
                          )}
                          {pf.status === 'uploading' && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 animate-pulse">
                              업로드 중...
                            </span>
                          )}
                          {pf.status === 'completed' && (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              완료
                            </span>
                          )}
                          {pf.status === 'error' && (
                            <span
                              className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 border border-rose-200 max-w-[200px] truncate"
                              title={pf.errorMessage}
                            >
                              {pf.errorMessage || INQUIRY_STORAGE_REQUIRED_MESSAGE}
                            </span>
                          )}

                          {pf.status !== 'uploading' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveNewInquiryFile(pf.id)}
                              className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition"
                              title="파일 제거"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {newInquiryError && (
                  <div className="mt-2 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{newInquiryError}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isSubmitting ? '접수 중...' : '문의 접수하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
