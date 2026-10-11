import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { Message, MessageFile, MessageRead, MessageTemplate } from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreHelper';
import { containsKoreanRrn, RRN_BLOCK_MESSAGE } from '../utils/rrnDetector';
import { validateFileForUpload, sanitizeFileName, formatFileSize } from '../lib/fileSecurity';
import { isMissingIndexError } from '../utils/firestoreQueryFallback';
import { auth } from '../lib/firebase';

export const messageService = {
  // Messages (R2-6 1/3-A 메시지함 기반 구조)
  async getAllMessages(): Promise<Message[]> {
    const colRef = collection(db, 'messages');
    try {
      let snap;
      try {
        const q = query(colRef, orderBy('createdAt', 'desc'));
        snap = await getDocs(q);
      } catch (orderErr) {
        if (!isMissingIndexError(orderErr)) throw orderErr;
        console.warn('getAllMessages missing-index fallback:', orderErr);
        snap = await getDocs(colRef);
      }
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    }
  },

  async getMessagesByCompany(companyId: string): Promise<Message[]> {
    if (!companyId || !companyId.trim()) return [];
    const colRef = collection(db, 'messages');
    try {
      let snap;
      try {
        const q = query(
          colRef,
          where('companyId', '==', companyId),
          orderBy('createdAt', 'desc')
        );
        snap = await getDocs(q);
      } catch (orderErr) {
        if (!isMissingIndexError(orderErr)) throw orderErr;
        console.warn('getMessagesByCompany missing-index fallback:', orderErr);
        const fallbackQ = query(colRef, where('companyId', '==', companyId));
        snap = await getDocs(fallbackQ);
      }
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `messages?companyId=${companyId}`);
    }
  },

  async sendMessage(data: {
    companyId: string;
    companyName?: string;
    senderId: string;
    senderRole: 'ADMIN' | 'COMPANY';
    senderName: string;
    content: string;
    title?: string;
    recipientRole?: 'ADMIN' | 'COMPANY';
    recipientId?: string;
  }): Promise<Message> {
    if (!auth.currentUser || auth.currentUser.uid !== data.senderId) {
      throw new Error('로그인 사용자와 메시지 발신자가 일치하지 않습니다.');
    }
    if (!data.companyId?.trim() || !data.senderName?.trim() || !data.content?.trim()) {
      throw new Error('기업, 발신자 이름 및 메시지 내용을 입력해 주세요.');
    }
    if (data.senderRole !== 'ADMIN' && data.senderRole !== 'COMPANY') {
      throw new Error('메시지 발신 권한이 올바르지 않습니다.');
    }
    const expectedRecipientRole = data.senderRole === 'ADMIN' ? 'COMPANY' : 'ADMIN';
    if (data.recipientRole && data.recipientRole !== expectedRecipientRole) {
      throw new Error('메시지 수신 대상 권한이 올바르지 않습니다.');
    }
    // 주민등록번호 원문 발송 차단 (R2-6 1/3-B-② 보안 규정)
    if (containsKoreanRrn(data.content) || containsKoreanRrn(data.title || '')) {
      throw new Error(RRN_BLOCK_MESSAGE);
    }

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'messages', msgId);
    const now = new Date().toISOString();

    const newMessage: Message = sanitizeFirestoreData({
      id: msgId,
      companyId: data.companyId,
      companyName: data.companyName || '',
      senderId: data.senderId,
      senderRole: data.senderRole,
      senderName: data.senderName,
      title: data.title?.trim() || '',
      content: data.content.trim(),
      recipientRole: data.recipientRole || (data.senderRole === 'ADMIN' ? 'COMPANY' : 'ADMIN'),
      recipientId: data.recipientId || '',
      createdAt: now,
      updatedAt: now,
    });

    try {
      await setDoc(docRef, newMessage);
      return newMessage;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `messages/${msgId}`);
    }
  },

  // Templates (R2-6 1/3-B-① 메시지 서식 관리)
  async getTemplates(): Promise<MessageTemplate[]> {
    const colRef = collection(db, 'message_templates');
    try {
      let snap;
      try {
        const q = query(colRef, orderBy('createdAt', 'desc'));
        snap = await getDocs(q);
      } catch (orderErr) {
        if (!isMissingIndexError(orderErr)) throw orderErr;
        console.warn('getTemplates missing-index fallback:', orderErr);
        snap = await getDocs(colRef);
      }
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
          content: data.content || '',
          isActive: data.isActive !== false,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
          createdById: data.createdById || '',
          updatedById: data.updatedById || '',
        } as MessageTemplate;
      });
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'message_templates');
    }
  },

  async getActiveTemplates(): Promise<MessageTemplate[]> {
    const colRef = collection(db, 'message_templates');
    try {
      const q = query(colRef, where('isActive', '==', true));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
          content: data.content || '',
          isActive: true,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
          createdById: data.createdById || '',
          updatedById: data.updatedById || '',
        } as MessageTemplate;
      });
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'message_templates?isActive=true');
    }
  },

  async createTemplate(params: {
    name: string;
    content: string;
    isActive?: boolean;
    adminUid: string;
  }): Promise<MessageTemplate> {
    const tmplId = `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'message_templates', tmplId);
    const now = new Date().toISOString();

    const newTemplate: MessageTemplate = sanitizeFirestoreData({
      id: tmplId,
      name: params.name.trim(),
      content: params.content.trim(),
      isActive: params.isActive !== false,
      createdAt: now,
      updatedAt: now,
      createdById: params.adminUid,
      updatedById: params.adminUid,
    });

    try {
      await setDoc(docRef, newTemplate);
      return newTemplate;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `message_templates/${tmplId}`);
    }
  },

  async updateTemplate(
    id: string,
    params: {
      name: string;
      content: string;
      isActive: boolean;
      adminUid: string;
      createdById: string;
    }
  ): Promise<void> {
    const docRef = doc(db, 'message_templates', id);
    const now = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      name: params.name.trim(),
      content: params.content.trim(),
      isActive: params.isActive,
      createdById: params.createdById,
      updatedById: params.adminUid,
      updatedAt: now,
    };

    try {
      await updateDoc(docRef, sanitizeFirestoreData(updatePayload));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `message_templates/${id}`);
    }
  },

  async toggleTemplateActive(
    tmpl: MessageTemplate,
    adminUid: string
  ): Promise<boolean> {
    const nextState = !tmpl.isActive;
    await this.updateTemplate(tmpl.id, {
      name: tmpl.name,
      content: tmpl.content,
      isActive: nextState,
      createdById: tmpl.createdById,
      adminUid,
    });
    return nextState;
  },

  // Message Reads (R2-6 1/3-C-① 메시지 읽음/안읽음)
  /**
   * Retrieves read logs for the authenticated user.
   * - COMPANY: queries by companyId == companyId AND userId == userId (satisfies Firestore security rules)
   * - ADMIN: queries by userId == userId
   */
  async getReadsForUser(params: {
    userId: string;
    role: 'ADMIN' | 'COMPANY';
    companyId?: string;
  }): Promise<MessageRead[]> {
    if (!params.userId) return [];
    const colRef = collection(db, 'message_reads');
    try {
      let q;
      if (params.role === 'COMPANY') {
        if (!params.companyId) return [];
        q = query(
          colRef,
          where('companyId', '==', params.companyId),
          where('userId', '==', params.userId)
        );
      } else {
        q = query(colRef, where('userId', '==', params.userId));
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageRead));
    } catch (error) {
      console.warn('Failed to load message reads:', error);
      return [];
    }
  },

  /**
   * Marks a list of messages as read for a given user.
   * Deterministic ID: `read_${userId}_${messageId}` prevents duplicate records completely.
   */
  async markMessagesAsRead(
    items: Array<{ messageId: string; companyId: string }>,
    userId: string
  ): Promise<MessageRead[]> {
    if (!userId || !items || items.length === 0) return [];
    const now = new Date().toISOString();
    const createdReads: MessageRead[] = [];

    // Filter unique messageIds in the incoming items
    const uniqueItemsMap = new Map<string, { messageId: string; companyId: string }>();
    items.forEach((it) => {
      if (it.messageId && it.companyId) {
        uniqueItemsMap.set(it.messageId, it);
      }
    });

    const tasks = Array.from(uniqueItemsMap.values()).map(async (item) => {
      const readId = `read_${userId}_${item.messageId}`;
      const docRef = doc(db, 'message_reads', readId);
      const payload: MessageRead = {
        id: readId,
        messageId: item.messageId,
        companyId: item.companyId,
        userId,
        readAt: now,
      };

      try {
        await setDoc(docRef, sanitizeFirestoreData(payload));
        createdReads.push(payload);
      } catch (err) {
        console.warn(`Failed to mark message ${item.messageId} as read:`, err);
      }
    });

    await Promise.all(tasks);
    return createdReads;
  },

  // Message Files (R2-6 1/3-C-②-A 메시지 첨부파일 기반 구조)
  /**
   * Validates a message file attachment before upload
   * - 0 bytes blocked
   * - Max 20MB
   * - Allowed extensions only
   * - Executable / dangerous extensions and MIME types blocked
   * - Filename sanitized
   * - RRN check in file name (Korean Resident Registration Number)
   *   CRITICAL: Never log or expose actual RRN values anywhere.
   */
  validateMessageFile(file: File): { isValid: boolean; error?: string; sanitizedName?: string } {
    if (!file) {
      return { isValid: false, error: '파일이 선택되지 않았습니다.' };
    }
    // RRN check in file name (CRITICAL: Do NOT print or expose RRN value)
    if (containsKoreanRrn(file.name)) {
      return {
        isValid: false,
        error: '파일명에 주민등록번호가 포함되어 있어 첨부할 수 없습니다. 주민등록번호가 제외된 파일명을 사용해 주세요.',
      };
    }
    const res = validateFileForUpload(file);
    if (!res.isValid) {
      return res;
    }
    return {
      isValid: true,
      sanitizedName: sanitizeFileName(file.name),
    };
  },

  /**
   * Uploads file to Storage and creates message_files metadata in Firestore.
   * Strictly follows required sequence:
   * ① messages document already created
   * ② Storage real upload
   * ③ message_files metadata creation only if Storage upload succeeds
   */
  async uploadMessageFile(params: {
    file: File;
    companyId: string;
    messageId: string;
    uploadedById: string;
    uploadedByRole: 'ADMIN' | 'COMPANY';
  }): Promise<MessageFile> {
    const val = this.validateMessageFile(params.file);
    if (!val.isValid) {
      throw new Error(val.error || '유효하지 않은 파일입니다.');
    }

    const fileId = `mfile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sanitizedName = val.sanitizedName || sanitizeFileName(params.file.name);
    const storagePath = `messages/${params.companyId}/${params.messageId}/${fileId}/${sanitizedName}`;

    // ② Storage real upload
    const storageRef = ref(storage, storagePath);
    try {
      await uploadBytes(storageRef, params.file, {
        contentType: params.file.type || 'application/octet-stream',
        customMetadata: {
          uploadedById: params.uploadedById,
          companyId: params.companyId,
          messageId: params.messageId,
          originalFileName: params.file.name,
        },
      });
    } catch (storageError: any) {
      console.error('Storage upload failed:', storageError);
      const isUnauthorized =
        storageError?.code === 'storage/unauthorized' ||
        storageError?.message?.includes('permission') ||
        storageError?.message?.includes('unauthorized') ||
        storageError?.message?.includes('403');
      const waitNotice = isUnauthorized
        ? ' (Storage 실파일 권한 검증 대기)'
        : '';
      throw new Error(
        `파일 저장소(Storage) 업로드 실패${waitNotice}: ${storageError.message || '저장소 권한 오류 또는 네트워크 오류가 발생했습니다.'}`
      );
    }

    // ③ message_files metadata creation (NO downloadUrl in Firestore)
    const docRef = doc(db, 'message_files', fileId);
    const now = new Date().toISOString();
    const fileMeta: MessageFile = {
      id: fileId,
      messageId: params.messageId,
      companyId: params.companyId,
      uploadedById: params.uploadedById,
      uploadedByRole: params.uploadedByRole,
      originalFileName: params.file.name,
      storagePath,
      contentType: params.file.type || 'application/octet-stream',
      size: params.file.size,
      uploadedAt: now,
    };

    try {
      await setDoc(docRef, sanitizeFirestoreData(fileMeta));
      return fileMeta;
    } catch (firestoreError) {
      handleFirestoreError(firestoreError, OperationType.CREATE, `message_files/${fileId}`);
    }
  },

  /**
   * Retrieves message files for a specific company thread
   */
  async getMessageFilesByCompany(companyId: string): Promise<MessageFile[]> {
    if (!companyId) return [];
    const colRef = collection(db, 'message_files');
    try {
      const q = query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageFile));
    } catch (err) {
      console.warn('Failed to load message files for company:', err);
      return [];
    }
  },

  /**
   * Downloads a file using temporary download URL from storagePath
   * [R2-6 1/3-C-③ 보안 요구사항]:
   * - downloadUrl은 Firestore에 저장하지 않음 (휘발성 메모리 URL만 사용)
   * - COMPANY: 본인 companyId 소속 첨부파일만 다운로드 가능 (타사 경로 변조 방지)
   * - ADMIN: 전체 기업 메시지 첨부파일 다운로드 허용
   * - WORKER / 비로그인: 전면 차단
   */
  async downloadMessageFile(
    file: MessageFile,
    authContext: { userId: string; role: 'ADMIN' | 'COMPANY' | 'WORKER'; companyId?: string }
  ): Promise<void> {
    if (!authContext?.userId) {
      throw new Error('로그인이 필요합니다.');
    }
    if (authContext.role === 'WORKER') {
      throw new Error('근로자 회원은 메시지 첨부파일에 접근할 수 없습니다.');
    }
    if (!file || !file.storagePath) {
      throw new Error('파일 정보 또는 저장 경로가 올바르지 않습니다.');
    }

    // COMPANY 권한 검증: 본인 companyId 일치 및 storagePath 타사 위조 방지
    if (authContext.role === 'COMPANY') {
      if (!authContext.companyId || file.companyId !== authContext.companyId) {
        throw new Error('타사의 메시지 첨부파일은 다운로드할 수 없습니다.');
      }
      if (!file.storagePath.startsWith(`messages/${authContext.companyId}/`)) {
        throw new Error('접근할 수 없는 파일 경로입니다.');
      }
    }

    try {
      const fileRef = ref(storage, file.storagePath);
      const downloadUrl = await getDownloadURL(fileRef);
      // 브라우저 다운로드 트리거 (downloadUrl은 Firestore에 절대 저장하지 않음)
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = file.originalFileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download file:', err);
      const isUnauthorized =
        err?.code === 'storage/unauthorized' ||
        err?.message?.includes('permission') ||
        err?.message?.includes('unauthorized') ||
        err?.message?.includes('403');
      const waitNotice = isUnauthorized ? ' (Storage 실파일 권한 검증 대기)' : '';
      throw new Error(`파일 다운로드 실패${waitNotice}: ${err.message || '저장소 권한을 확인해주세요.'}`);
    }
  },

  /**
   * Deletes a message attachment file
   * [R2-6 1/3-C-③ 삭제 정책 및 순서]:
   * - ADMIN: 모든 메시지 첨부파일 삭제 가능
   * - COMPANY: 자기 회사 메시지 중 본인이 직접 업로드한 파일만 삭제 가능 (uploadedById == auth.uid)
   * - WORKER / 비로그인: 삭제 불가
   * - 엄격한 순서:
   *   ① Firebase Storage 실제 파일 삭제
   *   ② Storage 삭제 성공 확인
   *   ③ message_files Firestore 메타데이터 삭제
   * - 부분 실패 처리:
   *   Storage 삭제 성공 후 Firestore 메타데이터 삭제 실패 시 명확한 오류 반환
   */
  async deleteMessageFile(
    file: MessageFile,
    authContext: { userId: string; role: 'ADMIN' | 'COMPANY' | 'WORKER'; companyId?: string }
  ): Promise<{ success: boolean; partialFailure?: boolean; error?: string }> {
    if (!authContext?.userId) {
      throw new Error('로그인이 필요합니다.');
    }
    if (authContext.role === 'WORKER') {
      throw new Error('근로자 회원은 메시지 첨부파일을 삭제할 수 없습니다.');
    }
    if (!file || !file.storagePath || !file.id) {
      throw new Error('유효하지 않은 파일 정보입니다.');
    }

    // COMPANY 권한 검증: 본인 회사 + 본인이 직접 업로드한 파일만 삭제 가능 (타인/ADMIN 파일 삭제 차단)
    if (authContext.role === 'COMPANY') {
      if (!authContext.companyId || file.companyId !== authContext.companyId) {
        throw new Error('타사의 메시지 첨부파일은 삭제할 수 없습니다.');
      }
      if (file.uploadedById !== authContext.userId) {
        throw new Error('본인이 직접 업로드한 첨부파일만 삭제할 수 있습니다.');
      }
      if (!file.storagePath.startsWith(`messages/${authContext.companyId}/`)) {
        throw new Error('접근할 수 없는 파일 경로입니다.');
      }
    }

    // ① Firebase Storage 실제 파일 삭제 (가짜 성공 처리 금지)
    const fileRef = ref(storage, file.storagePath);
    try {
      await deleteObject(fileRef);
    } catch (storageErr: any) {
      console.error('Storage file deletion failed:', storageErr);
      const isNotFound = storageErr?.code === 'storage/object-not-found';
      // Storage에 파일이 아예 없는 404를 제외하고는 오류 발생 시 Firestore 메타데이터를 삭제하지 않고 중단
      if (!isNotFound) {
        const isUnauthorized =
          storageErr?.code === 'storage/unauthorized' ||
          storageErr?.message?.includes('permission') ||
          storageErr?.message?.includes('unauthorized') ||
          storageErr?.message?.includes('403');
        const waitNotice = isUnauthorized ? ' (Storage 실파일 권한 검증 대기)' : '';
        throw new Error(
          `저장소(Storage) 파일 삭제 실패${waitNotice}: ${storageErr.message || '저장소 권한 오류'}`
        );
      }
    }

    // ② Storage 삭제 성공 확인 후 ③ message_files Firestore 메타데이터 삭제
    try {
      const docRef = doc(db, 'message_files', file.id);
      await deleteDoc(docRef);
      return { success: true };
    } catch (firestoreErr: any) {
      console.error('Firestore metadata deletion failed after storage deletion:', firestoreErr);
      // 5. 부분 실패: Storage는 삭제되었으나 Firestore metadata 삭제 실패 시 성공으로 처리하지 않음
      return {
        success: false,
        partialFailure: true,
        error: '파일은 삭제되었으나 파일 정보 정리에 실패했습니다.',
      };
    }
  },
};
