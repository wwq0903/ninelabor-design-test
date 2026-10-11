import React, { useEffect, useState, useRef } from 'react';
import { Company, Message, MessageFile, MessageRead, MessageTemplate, UserRole } from '../../../types';
import { messageService } from '../../../services/messageService';
import { firmService } from '../../../services/firmService';
import { useAuth } from '../../../contexts/AuthContext';
import { containsKoreanRrn, RRN_BLOCK_MESSAGE } from '../../../utils/rrnDetector';
import { formatFileSize } from '../../../lib/fileSecurity';
import {
  Mail,
  Send,
  Building2,
  Clock,
  User,
  Plus,
  Search,
  AlertCircle,
  X,
  Loader2,
  ArrowRight,
  ShieldAlert,
  FileText,
  CheckCircle2,
  Paperclip,
  Download,
  File,
  Trash2,
} from 'lucide-react';

interface MessagesViewProps {
  role: UserRole;
  companyId?: string;
  onUnreadCountChange?: (count: number) => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ role, companyId, onUnreadCountChange }) => {
  const { currentUser, userProfile } = useAuth();

  // WORKER Access Guard (R2-6 1/3-A 요구사항 1: WORKER 접근 불가)
  if (role === 'WORKER') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs max-w-lg mx-auto my-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-4">
          <ShieldAlert className="h-6 w-6 text-slate-500" />
        </div>
        <h3 className="text-base font-bold text-slate-800">메시지함 접근 권한 안내</h3>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          근로자 회원은 메시지함에 접근할 수 없습니다. 기업 고객 및 관리자 전용 소통 채널입니다.
        </p>
      </div>
    );
  }

  const [messages, setMessages] = useState<Message[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected company thread for ADMIN
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // New Message Compose State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTargetCompanyId, setComposeTargetCompanyId] = useState('');
  const [composeTitle, setComposeTitle] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Quick reply input
  const [quickReplyContent, setQuickReplyContent] = useState('');
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);

  // Active Template Selector State (R2-6 1/3-B-② COMPANY 메시지 서식 사용)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [activeTemplates, setActiveTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateFetchError, setTemplateFetchError] = useState<string | null>(null);
  const [templateTargetField, setTemplateTargetField] = useState<'modal' | 'quickReply'>('modal');

  // Overwrite Confirmation Dialog State (기존 작성 내용 보호)
  const [isOverwriteConfirmOpen, setIsOverwriteConfirmOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<MessageTemplate | null>(null);

  // Message Reads State (R2-6 1/3-C-① 메시지 읽음/안읽음)
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const isMarkingRef = useRef(false);

  // Message Files State (R2-6 1/3-C-② 메시지 첨부파일)
  const [messageFiles, setMessageFiles] = useState<MessageFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [quickReplyFiles, setQuickReplyFiles] = useState<File[]>([]);
  const [isDownloadingFileId, setIsDownloadingFileId] = useState<string | null>(null);
  const [isDeletingFileId, setIsDeletingFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickReplyFileInputRef = useRef<HTMLInputElement>(null);

  // Determine effective companyId for COMPANY role
  const effectiveCompanyId = companyId || userProfile?.companyId || '';

  const formatMessageDate = (isoString?: string): string => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}.${month}.${day} ${hours}:${minutes}`;
    } catch {
      return isoString;
    }
  };

  const fetchInitialData = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setActionError(null);

      if (role === 'ADMIN') {
        const [allMsgs, allComps, reads] = await Promise.all([
          messageService.getAllMessages(),
          firmService.getAllCompanies(),
          messageService.getReadsForUser({
            userId: currentUser.uid,
            role: 'ADMIN',
          }),
        ]);
        setMessages(allMsgs || []);
        setCompanies(allComps || []);
        const readIds = new Set((reads || []).map((r) => r.messageId));
        setReadMessageIds(readIds);

        let targetId = selectedCompanyId;
        if (allComps && allComps.length > 0 && !targetId) {
          const companyWithMsg = allComps.find((c) =>
            (allMsgs || []).some((m) => m.companyId === c.id)
          );
          targetId = companyWithMsg ? companyWithMsg.id : allComps[0].id;
          setSelectedCompanyId(targetId);
        }

        if (targetId) {
          const files = await messageService.getMessageFilesByCompany(targetId);
          setMessageFiles(files || []);
        } else {
          setMessageFiles([]);
        }
      } else if (role === 'COMPANY') {
        if (effectiveCompanyId) {
          const [compMsgs, reads, files] = await Promise.all([
            messageService.getMessagesByCompany(effectiveCompanyId),
            messageService.getReadsForUser({
              userId: currentUser.uid,
              role: 'COMPANY',
              companyId: effectiveCompanyId,
            }),
            messageService.getMessageFilesByCompany(effectiveCompanyId),
          ]);
          setMessages(compMsgs || []);
          setMessageFiles(files || []);
          const readIds = new Set((reads || []).map((r) => r.messageId));
          setReadMessageIds(readIds);

          const unreadCount = (compMsgs || []).filter(
            (m) => m.senderRole === 'ADMIN' && !readIds.has(m.id)
          ).length;
          onUnreadCountChange?.(unreadCount);
        } else {
          setMessages([]);
          setMessageFiles([]);
          setReadMessageIds(new Set());
          onUnreadCountChange?.(0);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch messages:', err);
      setActionError(err.message || '메시지 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [currentUser, role, effectiveCompanyId]);

  // Company Name helper
  const getCompanyName = (cId: string): string => {
    if (role === 'COMPANY' && userProfile?.companyName) {
      return userProfile.companyName;
    }
    const found = companies.find((c) => c.id === cId);
    if (found) return found.companyName;
    const msgWithCompany = messages.find((m) => m.companyId === cId && m.companyName);
    if (msgWithCompany?.companyName) return msgWithCompany.companyName;
    return '고객 기업';
  };

  // Group messages by company for ADMIN view
  const companyMessageGroups = companies.map((comp) => {
    const compMsgs = messages.filter((m) => m.companyId === comp.id);
    const latestMsg = compMsgs.length > 0 ? compMsgs[0] : null;
    // Unread count: messages sent by COMPANY that have not been read by ADMIN yet
    const unreadCount = compMsgs.filter(
      (m) => m.senderRole === 'COMPANY' && !readMessageIds.has(m.id)
    ).length;
    return {
      company: comp,
      messages: compMsgs,
      latestMessage: latestMsg,
      latestTime: latestMsg?.createdAt || '',
      count: compMsgs.length,
      unreadCount,
    };
  });

  // Filter company message groups for ADMIN search
  const filteredCompanyGroups = companyMessageGroups.filter((g) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.trim().toLowerCase();
    const matchName = g.company.companyName.toLowerCase().includes(query);
    const matchContent = g.messages.some(
      (m) =>
        m.content.toLowerCase().includes(query) ||
        (m.title && m.title.toLowerCase().includes(query)) ||
        m.senderName.toLowerCase().includes(query)
    );
    return matchName || matchContent;
  });

  // Active messages thread to display
  const currentThreadMessages =
    role === 'ADMIN'
      ? selectedCompanyId
        ? messages.filter((m) => m.companyId === selectedCompanyId)
        : []
      : messages;

  // Active thread sorted chronologically (past -> latest for conversation flow)
  const sortedThreadMessages = [...currentThreadMessages].sort((a, b) =>
    (a.createdAt || '').localeCompare(b.createdAt || '')
  );

  // Mark active thread messages as read (R2-6 1/3-C-① 읽음 처리)
  // - ADMIN: When viewing conversation for selectedCompanyId, mark unread COMPANY messages as read
  // - COMPANY: When viewing conversation for effectiveCompanyId, mark unread ADMIN messages as read
  // - Critical: Only mark currently active thread messages, never mark all messages globally!
  useEffect(() => {
    if (!currentUser || isMarkingRef.current) return;

    if (role === 'ADMIN' && selectedCompanyId) {
      const unreadMsgs = messages.filter(
        (m) =>
          m.companyId === selectedCompanyId &&
          m.senderRole === 'COMPANY' &&
          !readMessageIds.has(m.id)
      );
      if (unreadMsgs.length > 0) {
        isMarkingRef.current = true;
        const items = unreadMsgs.map((m) => ({ messageId: m.id, companyId: m.companyId }));
        messageService
          .markMessagesAsRead(items, currentUser.uid)
          .then((newReads) => {
            if (newReads.length > 0) {
              setReadMessageIds((prev) => {
                const next = new Set(prev);
                newReads.forEach((r) => next.add(r.messageId));
                return next;
              });
            }
          })
          .catch((err) => {
            console.warn('Failed to mark admin thread as read:', err);
          })
          .finally(() => {
            isMarkingRef.current = false;
          });
      }
    } else if (role === 'COMPANY' && effectiveCompanyId) {
      const unreadMsgs = messages.filter(
        (m) =>
          m.companyId === effectiveCompanyId &&
          m.senderRole === 'ADMIN' &&
          !readMessageIds.has(m.id)
      );
      if (unreadMsgs.length > 0) {
        isMarkingRef.current = true;
        const items = unreadMsgs.map((m) => ({ messageId: m.id, companyId: m.companyId }));
        messageService
          .markMessagesAsRead(items, currentUser.uid)
          .then((newReads) => {
            if (newReads.length > 0) {
              setReadMessageIds((prev) => {
                const next = new Set(prev);
                newReads.forEach((r) => next.add(r.messageId));
                return next;
              });
              onUnreadCountChange?.(0);
            }
          })
          .catch((err) => {
            console.warn('Failed to mark company thread as read:', err);
          })
          .finally(() => {
            isMarkingRef.current = false;
          });
      }
    }
  }, [selectedCompanyId, messages, readMessageIds, role, currentUser, effectiveCompanyId, onUnreadCountChange]);

  // Open Template Selector Modal (R2-6 1/3-B-②: isActive == true 서식만 조회)
  const handleOpenTemplateSelector = async (target: 'modal' | 'quickReply' = 'modal') => {
    setTemplateTargetField(target);
    setIsTemplateModalOpen(true);
    setTemplateFetchError(null);
    try {
      setLoadingTemplates(true);
      const list = await messageService.getActiveTemplates();
      setActiveTemplates(list || []);
    } catch (err: any) {
      console.error('Failed to load active templates:', err);
      setTemplateFetchError(err.message || '활성 서식 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Apply template content to target input
  const applyTemplateContent = (content: string) => {
    if (templateTargetField === 'quickReply') {
      setQuickReplyContent(content);
    } else {
      setComposeContent(content);
    }
  };

  // Template chosen by user
  const handleSelectTemplate = (template: MessageTemplate) => {
    const currentText = templateTargetField === 'quickReply' ? quickReplyContent : composeContent;
    if (currentText && currentText.trim().length > 0) {
      // 이미 작성 중인 메시지가 있을 때 확인창 표시 (3. 기존 작성 내용 보호)
      setPendingTemplate(template);
      setIsOverwriteConfirmOpen(true);
    } else {
      // 비어있는 작성창일 때는 즉시 삽입
      applyTemplateContent(template.content);
      setIsTemplateModalOpen(false);
    }
  };

  const handleConfirmOverwrite = () => {
    if (pendingTemplate) {
      applyTemplateContent(pendingTemplate.content);
    }
    setIsOverwriteConfirmOpen(false);
    setPendingTemplate(null);
    setIsTemplateModalOpen(false);
  };

  const handleCancelOverwrite = () => {
    setIsOverwriteConfirmOpen(false);
    setPendingTemplate(null);
  };

  // Reload attached files when ADMIN switches active company thread
  useEffect(() => {
    if (role === 'ADMIN' && selectedCompanyId) {
      messageService.getMessageFilesByCompany(selectedCompanyId).then((files) => {
        setMessageFiles(files || []);
      });
    }
  }, [role, selectedCompanyId]);

  // File selection validation helper (R2-6 1/3-C-②)
  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'modal' | 'quickReply'
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const incomingFiles = Array.from(e.target.files);
    const validList: File[] = [];

    for (const f of incomingFiles) {
      const val = messageService.validateMessageFile(f);
      if (!val.isValid) {
        setActionError(val.error || '유효하지 않은 파일입니다.');
        e.target.value = '';
        return;
      }
      validList.push(f);
    }

    if (target === 'modal') {
      setSelectedFiles((prev) => [...prev, ...validList]);
    } else {
      setQuickReplyFiles((prev) => [...prev, ...validList]);
    }
    e.target.value = '';
  };

  const handleRemoveFile = (index: number, target: 'modal' | 'quickReply') => {
    if (target === 'modal') {
      setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    } else {
      setQuickReplyFiles((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // 1. 다운로드 처리 (R2-6 1/3-C-③: Firestore downloadUrl 저장 안함, role/companyId 권한 검증)
  const handleDownloadFile = async (file: MessageFile) => {
    if (!currentUser) {
      setActionError('로그인이 필요합니다.');
      return;
    }
    try {
      setIsDownloadingFileId(file.id);
      setActionError(null);
      await messageService.downloadMessageFile(file, {
        userId: currentUser.uid,
        role: role as 'ADMIN' | 'COMPANY',
        companyId: effectiveCompanyId,
      });
    } catch (err: any) {
      console.error('File download failed:', err);
      setActionError(err.message || '파일 다운로드에 실패했습니다. Storage 권한을 확인해주세요.');
    } finally {
      setIsDownloadingFileId(null);
    }
  };

  // 첨부파일 삭제 가능 여부 (R2-6 1/3-C-③: ADMIN 전체 가능, COMPANY는 본인 회사 + 본인이 직접 올린 파일만)
  const canDeleteFile = (file: MessageFile): boolean => {
    if (!currentUser) return false;
    if (role === 'ADMIN') return true;
    if (role === 'COMPANY') {
      return (
        file.companyId === effectiveCompanyId &&
        file.uploadedById === currentUser.uid
      );
    }
    return false;
  };

  // 3~5. 삭제 처리 (R2-6 1/3-C-③: ① Storage 삭제 -> ② 성공 확인 -> ③ Firestore 삭제, 부분 실패 처리)
  const handleDeleteFile = async (file: MessageFile) => {
    if (!currentUser) {
      setActionError('로그인이 필요합니다.');
      return;
    }
    if (!canDeleteFile(file)) {
      setActionError('해당 첨부파일을 삭제할 권한이 없습니다.');
      return;
    }
    if (!window.confirm(`[${file.originalFileName}] 첨부파일을 정말 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.`)) {
      return;
    }

    try {
      setIsDeletingFileId(file.id);
      setActionError(null);
      const res = await messageService.deleteMessageFile(file, {
        userId: currentUser.uid,
        role: role as 'ADMIN' | 'COMPANY',
        companyId: effectiveCompanyId,
      });

      if (res.success) {
        setMessageFiles((prev) => prev.filter((f) => f.id !== file.id));
        setActionSuccess('첨부파일이 안전하게 삭제되었습니다.');
        setTimeout(() => setActionSuccess(null), 3000);
      } else if (res.partialFailure) {
        // 5. 부분 실패: Storage는 삭제되었으나 Firestore metadata 삭제 실패 시 성공 처리 금지 및 명확한 오류 표시
        setActionError(res.error || '파일은 삭제되었으나 파일 정보 정리에 실패했습니다.');
      }
    } catch (err: any) {
      console.error('File delete failed:', err);
      setActionError(err.message || '첨부파일 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeletingFileId(null);
    }
  };

  // Send message handler (from compose modal or direct)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const targetCId = role === 'ADMIN' ? composeTargetCompanyId : effectiveCompanyId;
    if (!targetCId) {
      setActionError('수신 기업을 선택해 주세요.');
      return;
    }
    if (!composeContent.trim()) {
      setActionError('메시지 내용을 입력해 주세요.');
      return;
    }

    // 주민등록번호 원문 발송 차단 검증 (5. 중요 — 주민등록번호 보안)
    if (containsKoreanRrn(composeContent) || containsKoreanRrn(composeTitle)) {
      setActionError(RRN_BLOCK_MESSAGE);
      return;
    }

    try {
      setIsSending(true);
      setActionError(null);

      const compName = getCompanyName(targetCId);
      const senderDisplayName =
        userProfile?.displayName || (role === 'ADMIN' ? '공인노무사/관리자' : '기업 담당자');

      // ① messages 문서 생성 (순서 1)
      const createdMessage = await messageService.sendMessage({
        companyId: targetCId,
        companyName: compName,
        senderId: currentUser.uid,
        senderRole: role as 'ADMIN' | 'COMPANY',
        senderName: senderDisplayName,
        title: composeTitle.trim() || undefined,
        content: composeContent.trim(),
        recipientRole: role === 'ADMIN' ? 'COMPANY' : 'ADMIN',
      });

      // ② Firebase Storage 파일 업로드 및 ③ 성공한 파일만 message_files 생성 (순서 2, 3)
      const uploadSuccesses: MessageFile[] = [];
      const uploadFailures: { name: string; error: string }[] = [];

      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            const uploadedFile = await messageService.uploadMessageFile({
              file,
              companyId: targetCId,
              messageId: createdMessage.id,
              uploadedById: currentUser.uid,
              uploadedByRole: role as 'ADMIN' | 'COMPANY',
            });
            if (uploadedFile) {
              uploadSuccesses.push(uploadedFile);
            }
          } catch (fileErr: any) {
            console.error(`File upload failed for [${file.name}]:`, fileErr);
            uploadFailures.push({
              name: file.name,
              error: fileErr.message || '저장소 권한 오류',
            });
          }
        }
      }

      if (uploadSuccesses.length > 0) {
        setMessageFiles((prev) => [...prev, ...uploadSuccesses]);
      }

      // 7. 부분 실패 처리: 전체가 성공한 것처럼 표시하지 않기
      if (uploadFailures.length > 0) {
        const failureDetails = uploadFailures.map((f) => `[${f.name}]: ${f.error}`).join(' / ');
        if (uploadSuccesses.length > 0) {
          setActionError(
            `메시지는 등록되었으나 일부 파일 업로드에 실패했습니다. (성공 ${uploadSuccesses.length}건, 실패 ${uploadFailures.length}건) - ${failureDetails}`
          );
        } else {
          setActionError(
            `메시지는 발송되었으나 첨부파일 업로드에 실패했습니다. (Storage 실파일 권한 검증 대기) - ${failureDetails}`
          );
        }
      } else {
        if (selectedFiles.length > 0) {
          setActionSuccess(`메시지와 첨부파일(${uploadSuccesses.length}건)이 성공적으로 발송되었습니다.`);
        } else {
          setActionSuccess('메시지가 성공적으로 발송되었습니다.');
        }
        setTimeout(() => setActionSuccess(null), 3000);
      }

      setIsComposeOpen(false);
      setComposeTitle('');
      setComposeContent('');
      setComposeTargetCompanyId('');
      setSelectedFiles([]);

      if (role === 'ADMIN') {
        setSelectedCompanyId(targetCId);
      }

      await fetchInitialData();
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setActionError(err.message || '메시지 발송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  // Quick reply handler inside open conversation
  const handleSendQuickReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !quickReplyContent.trim()) return;

    // 주민등록번호 원문 발송 차단 검증 (5. 중요 — 주민등록번호 보안)
    if (containsKoreanRrn(quickReplyContent)) {
      setActionError(RRN_BLOCK_MESSAGE);
      return;
    }

    const targetCId = role === 'ADMIN' ? selectedCompanyId : effectiveCompanyId;
    if (!targetCId) {
      setActionError('대상 기업을 확인할 수 없습니다.');
      return;
    }

    try {
      setIsSendingQuickReply(true);
      setActionError(null);

      const compName = getCompanyName(targetCId);
      const senderDisplayName =
        userProfile?.displayName || (role === 'ADMIN' ? '공인노무사/관리자' : '기업 담당자');

      // ① messages 문서 생성 (순서 1)
      const createdMessage = await messageService.sendMessage({
        companyId: targetCId,
        companyName: compName,
        senderId: currentUser.uid,
        senderRole: role as 'ADMIN' | 'COMPANY',
        senderName: senderDisplayName,
        content: quickReplyContent.trim(),
        recipientRole: role === 'ADMIN' ? 'COMPANY' : 'ADMIN',
      });

      // ② Firebase Storage 파일 업로드 및 ③ 성공한 파일만 message_files 생성 (순서 2, 3)
      const uploadSuccesses: MessageFile[] = [];
      const uploadFailures: { name: string; error: string }[] = [];

      if (quickReplyFiles.length > 0) {
        for (const file of quickReplyFiles) {
          try {
            const uploadedFile = await messageService.uploadMessageFile({
              file,
              companyId: targetCId,
              messageId: createdMessage.id,
              uploadedById: currentUser.uid,
              uploadedByRole: role as 'ADMIN' | 'COMPANY',
            });
            if (uploadedFile) {
              uploadSuccesses.push(uploadedFile);
            }
          } catch (fileErr: any) {
            console.error(`Quick reply file upload failed for [${file.name}]:`, fileErr);
            uploadFailures.push({
              name: file.name,
              error: fileErr.message || '저장소 권한 오류',
            });
          }
        }
      }

      if (uploadSuccesses.length > 0) {
        setMessageFiles((prev) => [...prev, ...uploadSuccesses]);
      }

      // 7. 부분 실패 처리: 전체가 성공한 것처럼 표시하지 않기
      if (uploadFailures.length > 0) {
        const failureDetails = uploadFailures.map((f) => `[${f.name}]: ${f.error}`).join(' / ');
        if (uploadSuccesses.length > 0) {
          setActionError(
            `메시지는 등록되었으나 일부 파일 업로드에 실패했습니다. (성공 ${uploadSuccesses.length}건, 실패 ${uploadFailures.length}건) - ${failureDetails}`
          );
        } else {
          setActionError(
            `메시지는 발송되었으나 첨부파일 업로드에 실패했습니다. (Storage 실파일 권한 검증 대기) - ${failureDetails}`
          );
        }
      } else {
        if (quickReplyFiles.length > 0) {
          setActionSuccess(`메시지와 첨부파일(${uploadSuccesses.length}건)이 성공적으로 발송되었습니다.`);
        } else {
          setActionSuccess('메시지가 성공적으로 발송되었습니다.');
        }
        setTimeout(() => setActionSuccess(null), 3000);
      }

      setQuickReplyFiles([]);
      setQuickReplyContent('');
      await fetchInitialData();
    } catch (err: any) {
      console.error('Failed to send quick reply:', err);
      setActionError(err.message || '메시지 발송 중 오류가 발생했습니다.');
    } finally {
      setIsSendingQuickReply(false);
    }
  };

  return (
    <div className="space-y-6 font-[Pretendard,sans-serif]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              기업-노무법인 소통
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
              {role === 'ADMIN' ? `전체 ${messages.length}건` : `자사 ${messages.length}건`}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Mail className="h-6 w-6 text-slate-700" />
            메시지함
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {role === 'ADMIN'
              ? '기업 고객과의 1:1 메시지를 기업별로 안전하게 확인하고 회신할 수 있는 메시지 채널입니다.'
              : '노무법인 나인 전담 관리자와 안전하게 직접 소통할 수 있는 자사 전용 메시지 채널입니다.'}
          </p>
        </div>

        <button
          onClick={() => {
            setActionError(null);
            setActionSuccess(null);
            setComposeTitle('');
            setComposeContent('');
            if (role === 'ADMIN') {
              setComposeTargetCompanyId(selectedCompanyId || (companies[0]?.id || ''));
            } else {
              setComposeTargetCompanyId(effectiveCompanyId);
            }
            setIsComposeOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition"
        >
          <Send className="h-4 w-4" />
          <span>새 메시지 작성</span>
        </button>
      </div>

      {/* Global Notice / Error */}
      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 flex items-start gap-2.5">
          <Clock className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ADMIN View: Two-panel layout (기업별 메시지 목록 + 대화창) */}
      {role === 'ADMIN' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: 기업별 메시지 목록 */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-slate-600" />
                기업별 메시지 목록
              </h3>
              <span className="text-[11px] text-slate-400">
                총 {companies.length}개 고객사
              </span>
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="기업명 또는 메시지 내용 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:border-slate-800 focus:outline-none shadow-2xs"
              />
            </div>

            {/* Company List Box */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  <span>기업 및 메시지 목록을 불러오는 중...</span>
                </div>
              ) : filteredCompanyGroups.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                  <p className="font-medium text-slate-600">조회된 기업이 없습니다.</p>
                  <p className="text-[11px]">검색어를 변경하거나 새 메시지를 작성해 보세요.</p>
                </div>
              ) : (
                filteredCompanyGroups.map((g) => {
                  const isSelected = selectedCompanyId === g.company.id;
                  return (
                    <div
                      key={g.company.id}
                      onClick={() => setSelectedCompanyId(g.company.id)}
                      className={`p-3.5 cursor-pointer transition text-left flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                          : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {g.company.companyName}
                          </span>
                          {g.unreadCount > 0 ? (
                            <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs">
                              ({g.unreadCount})
                            </span>
                          ) : g.count > 0 ? (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                              {g.count}
                            </span>
                          ) : null}
                        </div>
                        {g.latestTime && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatMessageDate(g.latestTime)}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 line-clamp-1 leading-snug">
                        {g.latestMessage ? (
                          <span>
                            <strong className="text-slate-700 font-medium">
                              {g.latestMessage.senderRole === 'ADMIN' ? '[보낸메시지] ' : '[받은메시지] '}
                            </strong>
                            {g.latestMessage.content}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">주고받은 메시지가 없습니다.</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: 선택된 기업의 메시지 대화 및 회신 */}
          <div className="lg:col-span-7 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col min-h-[640px]">
              {/* Selected Company Header */}
              {selectedCompanyId ? (
                <>
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-600" />
                        <h3 className="text-sm font-bold text-slate-900">
                          {getCompanyName(selectedCompanyId)}
                        </h3>
                        <span className="text-[11px] text-slate-400">
                          메시지 {currentThreadMessages.length}건
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        기업 ID: {selectedCompanyId}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setComposeTargetCompanyId(selectedCompanyId);
                        setComposeTitle('');
                        setComposeContent('');
                        setIsComposeOpen(true);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>새 메시지</span>
                    </button>
                  </div>

                  {/* Messages Stream */}
                  <div className="flex-1 py-4 space-y-3 overflow-y-auto max-h-[460px] pr-1">
                    {sortedThreadMessages.length === 0 ? (
                      <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 text-xs space-y-2">
                        <Mail className="h-8 w-8 text-slate-300" />
                        <p className="font-medium text-slate-600">
                          {getCompanyName(selectedCompanyId)}와(과) 주고받은 메시지가 없습니다.
                        </p>
                        <p className="text-[11px]">하단 입력창을 통해 메시지를 전송해 보세요.</p>
                      </div>
                    ) : (
                      sortedThreadMessages.map((msg) => {
                        const isAdminMsg = msg.senderRole === 'ADMIN';
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isAdminMsg ? 'items-end' : 'items-start'}`}
                          >
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1 px-1">
                              <span
                                className={`font-semibold rounded px-1.5 py-0.2 text-[10px] ${
                                  isAdminMsg
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                                }`}
                              >
                                {isAdminMsg ? '노무법인(관리자)' : '기업 고객'}
                              </span>
                              <span className="font-medium text-slate-700">{msg.senderName}</span>
                              <span>·</span>
                              <span>{formatMessageDate(msg.createdAt)}</span>
                            </div>

                            <div
                              className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed whitespace-pre-wrap ${
                                isAdminMsg
                                  ? 'bg-slate-900 text-white shadow-xs rounded-tr-xs'
                                  : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-tl-xs'
                              }`}
                            >
                              {msg.title && (
                                <div
                                  className={`font-bold mb-1 pb-1 border-b ${
                                    isAdminMsg
                                      ? 'border-slate-800 text-slate-100'
                                      : 'border-slate-200 text-slate-900'
                                  }`}
                                >
                                  {msg.title}
                                </div>
                              )}
                              <div>{msg.content}</div>

                              {/* Attached Files List */}
                              {messageFiles.filter((f) => f.messageId === msg.id).length > 0 && (
                                <div className="mt-2.5 pt-2 border-t border-slate-200/40 space-y-1.5">
                                  <div className="flex items-center gap-1 text-[10px] font-semibold opacity-75">
                                    <Paperclip className="h-3 w-3" />
                                    <span>첨부파일 ({messageFiles.filter((f) => f.messageId === msg.id).length}개)</span>
                                  </div>
                                  <div className="space-y-1">
                                    {messageFiles.filter((f) => f.messageId === msg.id).map((file) => (
                                      <div
                                        key={file.id}
                                        className={`flex items-center justify-between gap-2 p-1.5 rounded-lg text-[11px] ${
                                          isAdminMsg
                                            ? 'bg-white/10 text-white'
                                            : 'bg-white text-slate-800 border border-slate-200 shadow-2xs'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <File className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                          <span className="truncate max-w-[180px] font-medium" title={file.originalFileName}>
                                            {file.originalFileName}
                                          </span>
                                          <span className="text-[10px] opacity-60 shrink-0">
                                            ({formatFileSize(file.size)})
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => handleDownloadFile(file)}
                                            disabled={isDownloadingFileId === file.id || isDeletingFileId === file.id}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                              isAdminMsg
                                                ? 'bg-white/20 hover:bg-white/30 text-white'
                                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                            }`}
                                          >
                                            {isDownloadingFileId === file.id ? (
                                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                            ) : (
                                              <Download className="h-2.5 w-2.5" />
                                            )}
                                            <span>다운로드</span>
                                          </button>

                                          {canDeleteFile(file) && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteFile(file)}
                                              disabled={isDeletingFileId === file.id || isDownloadingFileId === file.id}
                                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                                isAdminMsg
                                                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 hover:text-white'
                                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-600'
                                              }`}
                                              title="첨부파일 삭제"
                                            >
                                              {isDeletingFileId === file.id ? (
                                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                              ) : (
                                                <Trash2 className="h-2.5 w-2.5" />
                                              )}
                                              <span>삭제</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Quick Reply Form (ADMIN) */}
                  <form onSubmit={handleSendQuickReply} className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-medium text-slate-500">빠른 답장</span>
                      <button
                        type="button"
                        onClick={() => quickReplyFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                        <span>파일 첨부</span>
                      </button>
                      <input
                        type="file"
                        ref={quickReplyFileInputRef}
                        onChange={(e) => handleFileSelect(e, 'quickReply')}
                        multiple
                        className="hidden"
                      />
                    </div>

                    {/* Quick reply files preview */}
                    {quickReplyFiles.length > 0 && (
                      <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-2">
                        {quickReplyFiles.map((f, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-1 rounded-lg bg-white border border-slate-200 text-xs"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="font-medium text-slate-800 truncate max-w-[200px]">{f.name}</span>
                              <span className="text-[11px] text-slate-400 shrink-0">({formatFileSize(f.size)})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(idx, 'quickReply')}
                              className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition"
                              title="첨부 취소"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        value={quickReplyContent}
                        onChange={(e) => setQuickReplyContent(e.target.value)}
                        placeholder={`${getCompanyName(selectedCompanyId)}에 보낼 메시지를 입력하세요...`}
                        className="flex-1 rounded-xl border border-slate-200 bg-white p-2.5 text-xs focus:border-slate-800 focus:outline-none resize-none font-mono"
                      />
                      <button
                        type="submit"
                        disabled={isSendingQuickReply || (!quickReplyContent.trim() && quickReplyFiles.length === 0)}
                        className="self-end rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
                      >
                        {isSendingQuickReply ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span>전송</span>
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 text-xs">
                  <Building2 className="h-8 w-8 text-slate-300 mb-2" />
                  <p>왼쪽 목록에서 확인할 기업을 선택해 주세요.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMPANY View: 자사 메시지만 조회 및 전송 */}
      {role === 'COMPANY' && (
        <div className="space-y-4">
          {/* Summary Banner */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    자사 메시지함
                  </span>
                  {messages.filter((m) => m.senderRole === 'ADMIN' && !readMessageIds.has(m.id)).length > 0 && (
                    <span className="inline-flex items-center rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      안읽은 관리자 메시지 ({messages.filter((m) => m.senderRole === 'ADMIN' && !readMessageIds.has(m.id)).length})
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-1">
                  {getCompanyName(effectiveCompanyId)}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  노무법인 나인과의 모든 1:1 업무 메시지는 안전하게 암호화 및 격리되어 관리됩니다.
                </p>
              </div>

              {/* 최근 메시지 요약 */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:text-right text-xs">
                <span className="text-[10px] text-slate-400 block">최근 메시지 시간</span>
                <span className="font-semibold text-slate-700">
                  {messages.length > 0 ? formatMessageDate(messages[0].createdAt) : '메시지 없음'}
                </span>
              </div>
            </div>
          </div>

          {/* Messages Stream & Chat Container */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col min-h-[500px]">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                주고받은 메시지 목록 ({messages.length}건)
              </span>
              <button
                type="button"
                onClick={() => {
                  setComposeTargetCompanyId(effectiveCompanyId);
                  setComposeTitle('');
                  setComposeContent('');
                  setIsComposeOpen(true);
                }}
                className="text-xs text-slate-900 hover:text-slate-700 font-semibold inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>새 메시지 작성</span>
              </button>
            </div>

            {/* Message items */}
            <div className="flex-1 py-4 space-y-3 overflow-y-auto max-h-[460px] pr-1">
              {loading ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  <span>자사 메시지를 불러오는 중...</span>
                </div>
              ) : sortedThreadMessages.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400 text-xs space-y-2">
                  <Mail className="h-8 w-8 text-slate-300" />
                  <p className="font-medium text-slate-600">아직 등록된 메시지가 없습니다.</p>
                  <p className="text-[11px]">
                    노무법인 나인에 업무 요청이나 전달사항이 있으시면 메시지를 발송해 주세요.
                  </p>
                </div>
              ) : (
                sortedThreadMessages.map((msg) => {
                  const isCompanyMsg = msg.senderRole === 'COMPANY';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isCompanyMsg ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1 px-1">
                        <span
                          className={`font-semibold rounded px-1.5 py-0.2 text-[10px] ${
                            isCompanyMsg
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {isCompanyMsg ? '자사(기업)' : '노무법인 나인(관리자)'}
                        </span>
                        <span className="font-medium text-slate-700">{msg.senderName}</span>
                        <span>·</span>
                        <span>{formatMessageDate(msg.createdAt)}</span>
                      </div>

                      <div
                        className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          isCompanyMsg
                            ? 'bg-slate-900 text-white shadow-xs rounded-tr-xs'
                            : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-tl-xs'
                        }`}
                      >
                        {msg.title && (
                          <div
                            className={`font-bold mb-1 pb-1 border-b ${
                              isCompanyMsg
                                ? 'border-slate-800 text-slate-100'
                                : 'border-slate-200 text-slate-900'
                            }`}
                          >
                            {msg.title}
                          </div>
                        )}
                        <div>{msg.content}</div>

                        {/* Attached Files List */}
                        {messageFiles.filter((f) => f.messageId === msg.id).length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-200/40 space-y-1.5">
                            <div className="flex items-center gap-1 text-[10px] font-semibold opacity-75">
                              <Paperclip className="h-3 w-3" />
                              <span>첨부파일 ({messageFiles.filter((f) => f.messageId === msg.id).length}개)</span>
                            </div>
                            <div className="space-y-1">
                              {messageFiles.filter((f) => f.messageId === msg.id).map((file) => (
                                <div
                                  key={file.id}
                                  className={`flex items-center justify-between gap-2 p-1.5 rounded-lg text-[11px] ${
                                    isCompanyMsg
                                      ? 'bg-white/10 text-white'
                                      : 'bg-white text-slate-800 border border-slate-200 shadow-2xs'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <File className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                    <span className="truncate max-w-[180px] font-medium" title={file.originalFileName}>
                                      {file.originalFileName}
                                    </span>
                                    <span className="text-[10px] opacity-60 shrink-0">
                                      ({formatFileSize(file.size)})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadFile(file)}
                                      disabled={isDownloadingFileId === file.id || isDeletingFileId === file.id}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                        isCompanyMsg
                                          ? 'bg-white/20 hover:bg-white/30 text-white'
                                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {isDownloadingFileId === file.id ? (
                                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                      ) : (
                                        <Download className="h-2.5 w-2.5" />
                                      )}
                                      <span>다운로드</span>
                                    </button>

                                    {canDeleteFile(file) && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteFile(file)}
                                        disabled={isDeletingFileId === file.id || isDownloadingFileId === file.id}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                          isCompanyMsg
                                            ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 hover:text-white'
                                            : 'bg-rose-50 hover:bg-rose-100 text-rose-600'
                                        }`}
                                        title="첨부파일 삭제"
                                      >
                                        {isDeletingFileId === file.id ? (
                                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-2.5 w-2.5" />
                                        )}
                                        <span>삭제</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Reply Form */}
            <form onSubmit={handleSendQuickReply} className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-medium text-slate-500">메시지 작성</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => quickReplyFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                    <span>파일 첨부</span>
                  </button>
                  <input
                    type="file"
                    ref={quickReplyFileInputRef}
                    onChange={(e) => handleFileSelect(e, 'quickReply')}
                    multiple
                    className="hidden"
                  />
                  {role === 'COMPANY' && (
                    <button
                      type="button"
                      onClick={() => handleOpenTemplateSelector('quickReply')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      <FileText className="h-3.5 w-3.5 text-slate-500" />
                      <span>서식 불러오기</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick reply files preview */}
              {quickReplyFiles.length > 0 && (
                <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {quickReplyFiles.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-1 rounded-lg bg-white border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-800 truncate max-w-[200px]">{f.name}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">({formatFileSize(f.size)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx, 'quickReply')}
                        className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition"
                        title="첨부 취소"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={quickReplyContent}
                  onChange={(e) => setQuickReplyContent(e.target.value)}
                  placeholder="노무법인 나인에 보낼 메시지를 입력하세요..."
                  className="flex-1 rounded-xl border border-slate-200 bg-white p-2.5 text-xs focus:border-slate-800 focus:outline-none resize-none font-mono"
                />
                <button
                  type="submit"
                  disabled={isSendingQuickReply || (!quickReplyContent.trim() && quickReplyFiles.length === 0)}
                  className="self-end rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
                >
                  {isSendingQuickReply ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>전송</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Message Compose Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Send className="h-4 w-4 text-slate-700" />
                <span>새 메시지 작성</span>
              </h3>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {actionError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="space-y-3.5">
              {/* Target Company Selector (ADMIN only) */}
              {role === 'ADMIN' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    수신 기업 선택 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={composeTargetCompanyId}
                    onChange={(e) => setComposeTargetCompanyId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                  >
                    <option value="">수신 기업을 선택해 주세요</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Company Info Badge for COMPANY role */}
              {role === 'COMPANY' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    수신 대상
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 font-medium">
                    노무법인 나인 (공인노무사/관리자)
                  </div>
                </div>
              )}

              {/* Title (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  제목 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                <input
                  type="text"
                  placeholder="메시지 제목 (선택사항)"
                  value={composeTitle}
                  onChange={(e) => setComposeTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* Content (Required) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    메시지 내용 <span className="text-rose-500">*</span>
                  </label>
                  {role === 'COMPANY' && (
                    <button
                      type="button"
                      onClick={() => handleOpenTemplateSelector('modal')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      <FileText className="h-3.5 w-3.5 text-slate-500" />
                      <span>서식 불러오기</span>
                    </button>
                  )}
                </div>
                <textarea
                  required
                  rows={5}
                  placeholder="전달하실 업무 내용이나 요청사항을 입력해 주세요."
                  value={composeContent}
                  onChange={(e) => setComposeContent(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs focus:border-slate-800 focus:outline-none leading-relaxed font-mono"
                />
              </div>

              {/* File Attachment Section (R2-6 1/3-C-②-A 파일 첨부 UI) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    파일 첨부 <span className="text-slate-400 font-normal">(선택)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                      <span>파일 첨부</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => handleFileSelect(e, 'modal')}
                      multiple
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Selected Files Preview List */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-slate-600">
                      <span className="flex items-center gap-1">
                        <Paperclip className="h-3 w-3 text-slate-500" />
                        선택된 파일 ({selectedFiles.length}개)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        총 {formatFileSize(selectedFiles.reduce((acc, f) => acc + f.size, 0))}
                      </span>
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-800 truncate" title={file.name}>
                              {file.name}
                            </span>
                            <span className="text-[11px] text-slate-400 shrink-0">
                              ({formatFileSize(file.size)})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx, 'modal')}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition hover:bg-rose-50 shrink-0"
                            title="첨부 파일 제거"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSending || !composeContent.trim()}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>발송 중...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>메시지 발송</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Template Selector Modal (R2-6 1/3-B-②) */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">메시지 서식 선택</h3>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              관리자가 등록한 표준 메시지 서식을 선택하면 본문 영역에 자동으로 내용이 입력됩니다.
            </p>

            {loadingTemplates ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                <span>활성 서식을 불러오는 중입니다...</span>
              </div>
            ) : templateFetchError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
                {templateFetchError}
              </div>
            ) : activeTemplates.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center space-y-2">
                <FileText className="h-8 w-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold text-slate-700">사용 가능한 활성 서식이 없습니다.</p>
                <p className="text-[11px] text-slate-400">
                  관리자가 활성화한 서식이 등록되면 여기에 표시됩니다.
                </p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                {activeTemplates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className="group rounded-xl border border-slate-200 hover:border-slate-800 hover:shadow-xs p-3.5 cursor-pointer transition bg-white space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-slate-900">
                        {template.name}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 group-hover:text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                        선택
                      </span>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 line-clamp-3 font-mono leading-relaxed whitespace-pre-wrap">
                      {template.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite Confirmation Modal (R2-6 1/3-B-② 기존 작성 내용 보호) */}
      {isOverwriteConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 border border-slate-200">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">작성 중인 내용 변경 확인</h4>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed font-medium">
                  작성 중인 내용을 선택한 서식으로 변경하시겠습니까?
                </p>
                <p className="mt-1 text-[11px] text-slate-400 leading-normal">
                  변경하시면 현재 작성 중인 내용이 지워지고 선택한 서식의 본문으로 교체됩니다.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCancelOverwrite}
                className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmOverwrite}
                className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-xs"
              >
                서식으로 변경
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
