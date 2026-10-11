import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  InternalNote,
  InternalNoteTargetType,
  CreateInternalNoteInput,
  UpdateInternalNoteInput,
  UserRole,
} from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreHelper';
import { auditLogService } from './auditLogService';

export const INTERNAL_NOTES_COLLECTION = 'internal_notes';

const MAX_CONTENT_LENGTH = 3000;
const MAX_CATEGORY_LENGTH = 50;
const MAX_ID_LENGTH = 128;

/**
 * [R3-2 1/3] 내부 메모 입력값 유효성 검증 헬퍼
 */
function validateNoteInput(
  params: {
    content?: string;
    category?: string;
    targetType?: string;
    targetId?: string;
    companyId?: string;
  },
  isCreate: boolean
): void {
  // 1. 생성 시 대상 유형 및 ID 검증, 수정 시 대상 변경 차단
  if (isCreate) {
    if (!params.targetType || (params.targetType !== 'COMPANY' && params.targetType !== 'WORKER')) {
      throw new Error("메모 대상 유형은 'COMPANY' 또는 'WORKER'여야 합니다.");
    }

    if (!params.targetId || !params.targetId.trim()) {
      throw new Error('메모 대상 고유 식별자(targetId)가 누락되었습니다.');
    }
    if (params.targetId.trim().length > MAX_ID_LENGTH) {
      throw new Error(`대상 식별자 길이는 ${MAX_ID_LENGTH}자 이내여야 합니다.`);
    }

    if (!params.companyId || !params.companyId.trim()) {
      throw new Error('회사 고유 식별자(companyId)가 누락되었습니다.');
    }
    if (params.companyId.trim().length > MAX_ID_LENGTH) {
      throw new Error(`회사 식별자 길이는 ${MAX_ID_LENGTH}자 이내여야 합니다.`);
    }
  } else {
    // [R3-2 3/3] 수정 시 대상 식별자(targetType, targetId, companyId) 변경 시도 차단
    if (params.targetType !== undefined || params.targetId !== undefined || params.companyId !== undefined) {
      throw new Error('메모 대상 식별자(targetType, targetId, companyId)는 생성 후 변경할 수 없습니다.');
    }
  }

  // 2. 메모 내용(content) 검증: 빈 메모/공백만 있는 메모 차단 및 길이 제한
  if (isCreate || params.content !== undefined) {
    if (!params.content || !params.content.trim()) {
      throw new Error('메모 내용을 입력해주세요. (공백만 입력할 수 없습니다.)');
    }
    if (params.content.trim().length > MAX_CONTENT_LENGTH) {
      throw new Error(`메모 내용은 최대 ${MAX_CONTENT_LENGTH}자까지 입력할 수 있습니다.`);
    }
  }

  // 3. 카테고리(category) 검증: 확장 가능한 문자열이되 과도한 길이 차단
  if (params.category !== undefined && params.category !== null) {
    const trimmedCategory = params.category.trim();
    if (trimmedCategory.length > MAX_CATEGORY_LENGTH) {
      throw new Error(`카테고리는 최대 ${MAX_CATEGORY_LENGTH}자까지 입력할 수 있습니다.`);
    }
  }
}

/**
 * [R3-2 1/3] 대상 정합성 검증 헬퍼
 * - targetType === 'COMPANY':
 *     - targetId === companyId 일치 검증
 *     - 실제 companies/{companyId} 문서 존재 여부 확인
 * - targetType === 'WORKER':
 *     - targetId = canonical worker.id 확인
 *     - 실제 workers/{targetId} 문서 존재 여부 확인
 *     - worker.companyId === companyId 소속 기업 일치 검증 (타사 근로자 ID 조합 차단)
 */
async function validateTargetIntegrity(
  targetType: InternalNoteTargetType,
  targetId: string,
  companyId: string
): Promise<{ companyName?: string; workerName?: string }> {
  // 1. 기업 대상 메모
  if (targetType === 'COMPANY') {
    if (targetId !== companyId) {
      throw new Error(`기업 메모의 targetId('${targetId}')는 companyId('${companyId}')와 일치해야 합니다.`);
    }

    const companyDocRef = doc(db, 'companies', companyId);
    const companySnap = await getDoc(companyDocRef);
    if (!companySnap.exists()) {
      throw new Error(`존재하지 않는 기업입니다. (companyId: ${companyId})`);
    }

    const compData = companySnap.data();
    return { companyName: compData?.companyName || '기업' };
  }

  // 2. 근로자 대상 메모
  if (targetType === 'WORKER') {
    const workerDocRef = doc(db, 'workers', targetId);
    const workerSnap = await getDoc(workerDocRef);
    if (!workerSnap.exists()) {
      throw new Error(`존재하지 않는 근로자입니다. (workerId: ${targetId})`);
    }

    const workerData = workerSnap.data();
    if (workerData?.companyId !== companyId) {
      throw new Error(
        `근로자의 실제 소속 기업(companyId: ${workerData?.companyId})과 전달된 기업 ID(${companyId})가 일치하지 않습니다.`
      );
    }

    return { workerName: workerData?.name || '근로자' };
  }

  throw new Error(`지원되지 않는 메모 대상 유형입니다: ${targetType}`);
}

export const internalNoteService = {
  /**
   * [R3-2 1/3] 기업별 내부 메모 목록 조회 (ADMIN 전용)
   * - targetType='COMPANY' 및 targetId=companyId 조건
   * - 기본값: 활성(isActive=true) 메모만 반환, includeInactive=true 시 비활성 포함
   * - 정렬: isPinned=true 우선, 최신 updatedAt 내림차순, 보조로 createdAt 내림차순
   */
  async getNotesByCompany(
    companyId: string,
    options?: { includeInactive?: boolean }
  ): Promise<InternalNote[]> {
    if (!companyId || !companyId.trim()) return [];
    const cleanCompanyId = companyId.trim();
    const colRef = collection(db, INTERNAL_NOTES_COLLECTION);

    try {
      const q = query(colRef, where('companyId', '==', cleanCompanyId));
      const snap = await getDocs(q);

      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InternalNote));

      // targetType이 COMPANY인 메모만 필터링
      list = list.filter((n) => n.targetType === 'COMPANY' && n.targetId === cleanCompanyId);

      // 활성 상태 필터링 (기본: 활성만)
      if (!options?.includeInactive) {
        list = list.filter((n) => n.isActive !== false);
      }

      // 정렬: isPinned=true 우선, 그 다음 최신 updatedAt desc, createdAt desc
      return list.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `${INTERNAL_NOTES_COLLECTION}?companyId=${cleanCompanyId}`);
      throw error;
    }
  },

  /**
   * [R3-2 1/3] 근로자별 내부 메모 목록 조회 (ADMIN 전용)
   * - targetType='WORKER' 및 targetId=workerId 조건
   * - 기본값: 활성(isActive=true) 메모만 반환, includeInactive=true 시 비활성 포함
   * - 정렬: isPinned=true 우선, 최신 updatedAt 내림차순, 보조로 createdAt 내림차순
   */
  async getNotesByWorker(
    workerId: string,
    options?: { includeInactive?: boolean; companyId?: string }
  ): Promise<InternalNote[]> {
    if (!workerId || !workerId.trim()) return [];
    const cleanWorkerId = workerId.trim();
    const cleanCompanyId = options?.companyId?.trim();
    const colRef = collection(db, INTERNAL_NOTES_COLLECTION);

    try {
      const q = query(colRef, where('targetId', '==', cleanWorkerId));
      const snap = await getDocs(q);

      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InternalNote));

      // targetType이 WORKER인 메모만 필터링
      list = list.filter((n) => n.targetType === 'WORKER');

      // companyId가 전달된 경우 소속 기업 일치 추가 검증
      if (cleanCompanyId) {
        list = list.filter((n) => n.companyId === cleanCompanyId);
      }

      // 활성 상태 필터링
      if (!options?.includeInactive) {
        list = list.filter((n) => n.isActive !== false);
      }

      // 정렬: isPinned=true 우선, 그 다음 최신 updatedAt desc, createdAt desc
      return list.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `${INTERNAL_NOTES_COLLECTION}?targetId=${cleanWorkerId}`);
      throw error;
    }
  },

  /**
   * [R3-2 1/3] 단일 내부 메모 상세 조회 (ADMIN 전용)
   */
  async getNoteById(noteId: string): Promise<InternalNote | null> {
    if (!noteId || !noteId.trim()) return null;
    const cleanNoteId = noteId.trim();
    try {
      const snap = await getDoc(doc(db, INTERNAL_NOTES_COLLECTION, cleanNoteId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as InternalNote;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${INTERNAL_NOTES_COLLECTION}/${cleanNoteId}`);
      throw error;
    }
  },

  /**
   * [R3-2 1/3] 내부 메모 생성 (ADMIN 전용)
   * - 대상(기업/근로자) 정합성 확인
   * - 빈 내용 차단 및 길이 검증
   * - 감사 로그(CREATE_INTERNAL_NOTE) 기록 (민감정보 미포함, 요약만 기록)
   */
  async createNote(
    input: CreateInternalNoteInput,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): Promise<InternalNote> {
    // 1. 기본 입력값 유효성 검증
    validateNoteInput(input, true);

    const cleanTargetId = input.targetId.trim();
    const cleanCompanyId = input.companyId.trim();

    // 2. 대상 정합성 검증 (회사 존재, 근로자 존재 및 소속 기업 일치 확인)
    await validateTargetIntegrity(input.targetType, cleanTargetId, cleanCompanyId);

    const noteId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const trimmedContent = input.content.trim();
    const trimmedCategory = input.category && input.category.trim().length > 0 ? input.category.trim() : undefined;

    const newNote: InternalNote = {
      id: noteId,
      targetType: input.targetType,
      targetId: cleanTargetId,
      companyId: cleanCompanyId,
      content: trimmedContent,
      category: trimmedCategory,
      isPinned: Boolean(input.isPinned),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdById: currentUser.uid,
      createdByName: currentUser.name || '노무법인 관리자',
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    try {
      const docRef = doc(db, INTERNAL_NOTES_COLLECTION, noteId);
      await setDoc(docRef, sanitizeFirestoreData(newNote));

      // 감사 로그 기록
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: currentUser.role || 'ADMIN',
        actorName: currentUser.name || '노무법인 관리자',
        companyId: cleanCompanyId,
        action: 'CREATE_INTERNAL_NOTE',
        resourceType: INTERNAL_NOTES_COLLECTION,
        resourceId: noteId,
        details: {
          noteId,
          targetType: input.targetType,
          targetId: cleanTargetId,
          companyId: cleanCompanyId,
          category: trimmedCategory,
          operation: 'CREATE',
          isPinned: newNote.isPinned,
        },
      });

      return newNote;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${INTERNAL_NOTES_COLLECTION}/${noteId}`);
      throw error;
    }
  },

  /**
   * [R3-2 1/3] 내부 메모 내용/카테고리 수정 (ADMIN 전용)
   * - 빈 내용 차단 및 길이 검증
   * - targetType, targetId, companyId 변조 방지 (수정 불가)
   * - 감사 로그(UPDATE_INTERNAL_NOTE) 기록
   */
  async updateNote(
    noteId: string,
    input: UpdateInternalNoteInput,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): Promise<InternalNote> {
    if (!noteId || !noteId.trim()) {
      throw new Error('수정할 메모의 ID가 필요합니다.');
    }
    const cleanNoteId = noteId.trim();

    // 1. 입력값 유효성 검증
    validateNoteInput(input, false);

    const docRef = doc(db, INTERNAL_NOTES_COLLECTION, cleanNoteId);
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      throw new Error(`수정할 메모를 찾을 수 없습니다. (ID: ${cleanNoteId})`);
    }

    const existingData = existingSnap.data() as InternalNote;
    const now = new Date().toISOString();

    const updates: Partial<InternalNote> = {
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    const changedFieldNames: string[] = [];

    if (input.content !== undefined) {
      updates.content = input.content.trim();
      changedFieldNames.push('content');
    }

    if (input.category !== undefined) {
      updates.category = input.category ? input.category.trim() : undefined;
      changedFieldNames.push('category');
    }

    if (input.isPinned !== undefined) {
      updates.isPinned = Boolean(input.isPinned);
      changedFieldNames.push('isPinned');
    }

    if (input.isActive !== undefined) {
      updates.isActive = Boolean(input.isActive);
      changedFieldNames.push('isActive');
    }

    try {
      await updateDoc(docRef, sanitizeFirestoreData(updates));

      const updatedNote: InternalNote = {
        ...existingData,
        ...updates,
      };

      // 감사 로그 기록
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: currentUser.role || 'ADMIN',
        actorName: currentUser.name || '노무법인 관리자',
        companyId: existingData.companyId,
        action: 'UPDATE_INTERNAL_NOTE',
        resourceType: INTERNAL_NOTES_COLLECTION,
        resourceId: cleanNoteId,
        details: {
          noteId: cleanNoteId,
          targetType: existingData.targetType,
          targetId: existingData.targetId,
          companyId: existingData.companyId,
          category: updatedNote.category,
          operation: 'UPDATE',
          changedFields: changedFieldNames,
          isPinned: updatedNote.isPinned,
          isActive: updatedNote.isActive,
        },
      });

      return updatedNote;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${INTERNAL_NOTES_COLLECTION}/${cleanNoteId}`);
      throw error;
    }
  },

  /**
   * [R3-2 1/3] 내부 메모 상단 고정/고정 해제 토글 (ADMIN 전용)
   * - 감사 로그(PIN_INTERNAL_NOTE / UNPIN_INTERNAL_NOTE) 기록
   */
  async togglePinNote(
    noteId: string,
    isPinned: boolean,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): Promise<InternalNote> {
    if (!noteId || !noteId.trim()) {
      throw new Error('고정 상태를 변경할 메모의 ID가 필요합니다.');
    }
    const cleanNoteId = noteId.trim();
    const docRef = doc(db, INTERNAL_NOTES_COLLECTION, cleanNoteId);

    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      throw new Error(`메모를 찾을 수 없습니다. (ID: ${cleanNoteId})`);
    }

    const existingData = existingSnap.data() as InternalNote;
    const now = new Date().toISOString();

    const updates: Partial<InternalNote> = {
      isPinned: Boolean(isPinned),
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    try {
      await updateDoc(docRef, sanitizeFirestoreData(updates));

      const updatedNote: InternalNote = {
        ...existingData,
        ...updates,
      };

      // 감사 로그 기록
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: currentUser.role || 'ADMIN',
        actorName: currentUser.name || '노무법인 관리자',
        companyId: existingData.companyId,
        action: isPinned ? 'PIN_INTERNAL_NOTE' : 'UNPIN_INTERNAL_NOTE',
        resourceType: INTERNAL_NOTES_COLLECTION,
        resourceId: cleanNoteId,
        details: {
          noteId: cleanNoteId,
          targetType: existingData.targetType,
          targetId: existingData.targetId,
          companyId: existingData.companyId,
          category: existingData.category,
          operation: isPinned ? 'PIN' : 'UNPIN',
          isPinned: Boolean(isPinned),
        },
      });

      return updatedNote;
    } catch (error)
      {
      handleFirestoreError(error, OperationType.UPDATE, `${INTERNAL_NOTES_COLLECTION}/${cleanNoteId}`);
      throw error;
    }
  },

  /**
   * [R3-2 1/3] 내부 메모 활성/비활성 토글 (ADMIN 전용)
   * - 하드 삭제를 대신하는 소프트 상태 토글
   * - 감사 로그(ACTIVATE_INTERNAL_NOTE / DEACTIVATE_INTERNAL_NOTE) 기록
   */
  async toggleActiveNote(
    noteId: string,
    isActive: boolean,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): Promise<InternalNote> {
    if (!noteId || !noteId.trim()) {
      throw new Error('활성 상태를 변경할 메모의 ID가 필요합니다.');
    }
    const cleanNoteId = noteId.trim();
    const docRef = doc(db, INTERNAL_NOTES_COLLECTION, cleanNoteId);

    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      throw new Error(`메모를 찾을 수 없습니다. (ID: ${cleanNoteId})`);
    }

    const existingData = existingSnap.data() as InternalNote;
    const now = new Date().toISOString();

    const updates: Partial<InternalNote> = {
      isActive: Boolean(isActive),
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    try {
      await updateDoc(docRef, sanitizeFirestoreData(updates));

      const updatedNote: InternalNote = {
        ...existingData,
        ...updates,
      };

      // 감사 로그 기록
      await auditLogService.logAction({
        actorUserId: currentUser.uid,
        actorRole: currentUser.role || 'ADMIN',
        actorName: currentUser.name || '노무법인 관리자',
        companyId: existingData.companyId,
        action: isActive ? 'ACTIVATE_INTERNAL_NOTE' : 'DEACTIVATE_INTERNAL_NOTE',
        resourceType: INTERNAL_NOTES_COLLECTION,
        resourceId: cleanNoteId,
        details: {
          noteId: cleanNoteId,
          targetType: existingData.targetType,
          targetId: existingData.targetId,
          companyId: existingData.companyId,
          category: existingData.category,
          operation: isActive ? 'ACTIVATE' : 'DEACTIVATE',
          isPinned: existingData.isPinned,
          isActive: Boolean(isActive),
        },
      });

      return updatedNote;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${INTERNAL_NOTES_COLLECTION}/${cleanNoteId}`);
      throw error;
    }
  },
};
