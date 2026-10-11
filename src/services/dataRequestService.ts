import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  arrayUnion,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { DataRequest, DataRequestStatus } from '../types';

/**
 * Normalizes Firestore document data into standard DataRequest structure
 */
function normalizeDataRequest(id: string, data: any): DataRequest {
  const description = data.description || data.content || '';
  const requestedItems = Array.isArray(data.requestedItems)
    ? data.requestedItems
    : Array.isArray(data.requiredItems)
    ? data.requiredItems
    : [];

  // Map legacy status SUPPLEMENT_REQUESTED to REVISION_REQUESTED
  let status: DataRequestStatus = data.status || 'REQUESTED';
  if ((status as any) === 'SUPPLEMENT_REQUESTED') {
    status = 'REVISION_REQUESTED';
  }

  const createdAt = data.createdAt || new Date().toISOString();
  const createdById = data.createdById || data.requesterId || 'admin';
  const updatedAt = data.updatedAt || createdAt;
  const updatedById = data.updatedById || createdById;

  return {
    id,
    companyId: data.companyId || '',
    title: data.title || '',
    description,
    requestedItems,
    dueDate: data.dueDate || '',
    status,
    createdAt,
    createdById,
    updatedAt,
    updatedById,
    // Submission details (R2-3 1/3-B & 1/3-C)
    submissionNote: data.submissionNote || '',
    submittedAt: data.submittedAt || undefined,
    submittedById: data.submittedById || undefined,
    submittedByName: data.submittedByName || undefined,
    submittedFiles: Array.isArray(data.submittedFiles) ? data.submittedFiles : [],
    revisionNote: data.revisionNote || undefined,
    // Complementary fields
    companyName: data.companyName,
    createdByName: data.createdByName || data.requesterName || '관리자',
    updatedByName: data.updatedByName || data.createdByName || '관리자',
    requesterId: createdById,
    requesterName: data.createdByName || data.requesterName || '관리자',
    content: description,
    requiredItems: requestedItems,
    submittedItems: data.submittedItems || [],
    history: data.history || [],
  };
}

export const dataRequestService = {
  /**
   * ADMIN: Fetch all data requests across all companies
   */
  async getAllDataRequests(): Promise<DataRequest[]> {
    const colRef = collection(db, 'data_requests');
    try {
      const q = query(colRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeDataRequest(d.id, d.data()));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'data_requests');
      return [];
    }
  },

  /**
   * COMPANY / ADMIN: Fetch data requests strictly isolated by companyId
   */
  async getDataRequestsByCompany(companyId: string): Promise<DataRequest[]> {
    if (!companyId) return [];
    const colRef = collection(db, 'data_requests');
    try {
      const q = query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => normalizeDataRequest(d.id, d.data()));
      // Sort client-side by createdAt descending to avoid composite index requirements
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `data_requests?companyId=${companyId}`);
      return [];
    }
  },

  /**
   * Get single data request by ID
   */
  async getDataRequestById(id: string): Promise<DataRequest | null> {
    if (!id) return null;
    const docRef = doc(db, 'data_requests', id);
    try {
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return normalizeDataRequest(snap.id, snap.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `data_requests/${id}`);
      return null;
    }
  },

  /**
   * ADMIN: Create a new official data request for a specific company
   */
  async createDataRequest(payload: {
    companyId: string;
    title: string;
    description: string;
    requestedItems: string[];
    dueDate: string;
    status?: DataRequestStatus;
    createdById: string;
    createdByName?: string;
    companyName?: string;
  }): Promise<DataRequest> {
    if (!payload.companyId) {
      throw new Error('자료요청을 생성할 대상 기업(companyId)을 반드시 지정해야 합니다.');
    }
    if (!payload.title.trim()) {
      throw new Error('자료요청 제목을 입력해야 합니다.');
    }
    if (!payload.requestedItems || payload.requestedItems.length === 0) {
      throw new Error('요청할 자료 항목을 최소 1개 이상 추가해야 합니다.');
    }

    const reqId = `dreq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'data_requests', reqId);
    const now = new Date().toISOString();

    const newRequest: DataRequest = {
      id: reqId,
      companyId: payload.companyId,
      title: payload.title.trim(),
      description: payload.description.trim(),
      requestedItems: payload.requestedItems,
      dueDate: payload.dueDate || '',
      status: payload.status || 'REQUESTED',
      createdAt: now,
      createdById: payload.createdById,
      updatedAt: now,
      updatedById: payload.createdById,
      createdByName: payload.createdByName || '관리자',
      updatedByName: payload.createdByName || '관리자',
      companyName: payload.companyName,
      // Backward compatibility fields
      requesterId: payload.createdById,
      requesterName: payload.createdByName || '관리자',
      content: payload.description.trim(),
      requiredItems: payload.requestedItems,
      history: [
        {
          action: '자료요청 등록',
          timestamp: now,
          actor: payload.createdByName || '관리자',
          note: '초기 자료요청 발송',
        },
      ],
    };

    try {
      await setDoc(docRef, newRequest);
      return newRequest;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `data_requests/${reqId}`);
      throw error;
    }
  },

  /**
   * ADMIN: Update data request fields (title, description, requestedItems, dueDate, etc.)
   */
  async updateDataRequest(
    id: string,
    data: {
      title?: string;
      description?: string;
      requestedItems?: string[];
      dueDate?: string;
      status?: DataRequestStatus;
      companyId?: string;
      updatedById: string;
      updatedByName?: string;
      actionNote?: string;
    }
  ): Promise<void> {
    const docRef = doc(db, 'data_requests', id);
    const now = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      updatedAt: now,
      updatedById: data.updatedById,
    };

    if (data.updatedByName) updatePayload.updatedByName = data.updatedByName;
    if (data.title !== undefined) updatePayload.title = data.title.trim();
    if (data.description !== undefined) {
      updatePayload.description = data.description.trim();
      updatePayload.content = data.description.trim();
    }
    if (data.requestedItems !== undefined) {
      updatePayload.requestedItems = data.requestedItems;
      updatePayload.requiredItems = data.requestedItems;
    }
    if (data.dueDate !== undefined) updatePayload.dueDate = data.dueDate;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.companyId !== undefined) updatePayload.companyId = data.companyId;

    if (data.actionNote) {
      updatePayload.history = arrayUnion({
        action: '자료요청 내용 수정',
        timestamp: now,
        actor: data.updatedByName || '관리자',
        note: data.actionNote,
      });
    }

    try {
      await updateDoc(docRef, updatePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `data_requests/${id}`);
      throw error;
    }
  },

  /**
   * Change status of a data request
   */
  async updateStatus(
    id: string,
    status: DataRequestStatus,
    actorId: string,
    actorName: string,
    note?: string
  ): Promise<void> {
    const docRef = doc(db, 'data_requests', id);
    const now = new Date().toISOString();

    const statusLabels: Record<DataRequestStatus, string> = {
      REQUESTED: '요청(미제출)',
      SUBMITTED: '제출완료',
      UNDER_REVIEW: '검토중',
      REVISION_REQUESTED: '보완요청',
      COMPLETED: '검토완료',
    };

    const actionText = `상태 변경: ${statusLabels[status] || status}`;

    const updatePayload: Record<string, any> = {
      status,
      updatedAt: now,
      updatedById: actorId,
      updatedByName: actorName,
      history: arrayUnion({
        action: actionText,
        timestamp: now,
        actor: actorName,
        note: note || '',
      }),
    };

    if (status === 'REVISION_REQUESTED' && note) {
      updatePayload.revisionNote = note.trim();
    }

    try {
      await updateDoc(docRef, updatePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `data_requests/${id}`);
      throw error;
    }
  },

  /**
   * COMPANY: Submit or re-submit requested data
   */
  async submitDataRequest(params: {
    requestId: string;
    companyId: string;
    currentStatus: DataRequestStatus;
    submissionNote?: string;
    submittedById: string;
    submittedByName?: string;
    submittedFiles?: import('../types').DataRequestFile[];
  }): Promise<void> {
    if (!params.requestId) {
      throw new Error('자료요청 식별자(ID)가 필요합니다.');
    }
    if (!['REQUESTED', 'REVISION_REQUESTED'].includes(params.currentStatus)) {
      throw new Error('제출 가능한 상태(요청 또는 보완요청)가 아닙니다.');
    }

    const docRef = doc(db, 'data_requests', params.requestId);
    const now = new Date().toISOString();
    const isResubmission = params.currentStatus === 'REVISION_REQUESTED';
    const actionText = isResubmission ? '보완 자료 재제출' : '자료 제출 완료';

    const updatePayload: Record<string, any> = {
      status: 'SUBMITTED',
      submittedAt: now,
      submittedById: params.submittedById,
      submittedByName: params.submittedByName || '기업 담당자',
      submissionNote: params.submissionNote ? params.submissionNote.trim() : '',
      updatedAt: now,
      updatedById: params.submittedById,
      updatedByName: params.submittedByName || '기업 담당자',
      history: arrayUnion({
        action: actionText,
        timestamp: now,
        actor: params.submittedByName || '기업 담당자',
        note: params.submissionNote ? params.submissionNote.trim() : '',
      }),
    };

    if (params.submittedFiles !== undefined) {
      updatePayload.submittedFiles = params.submittedFiles;
    }

    try {
      await updateDoc(docRef, updatePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `data_requests/${params.requestId}`);
      throw error;
    }
  },

  /**
   * Update or sync submitted files on the data request document
   */
  async updateSubmittedFiles(
    requestId: string,
    files: import('../types').DataRequestFile[],
    actorId: string,
    actorName: string
  ): Promise<void> {
    const docRef = doc(db, 'data_requests', requestId);
    const now = new Date().toISOString();
    try {
      await updateDoc(docRef, {
        submittedFiles: files,
        updatedAt: now,
        updatedById: actorId,
        updatedByName: actorName,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `data_requests/${requestId}`);
      throw error;
    }
  },

  /**
   * ADMIN: Delete a data request
   */
  async deleteDataRequest(id: string): Promise<void> {
    const docRef = doc(db, 'data_requests', id);
    try {
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `data_requests/${id}`);
      throw error;
    }
  },
};

