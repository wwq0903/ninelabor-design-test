import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AuditLog,
  Company,
  CompanyContact,
  CreateCompanyContactInput,
  UpdateCompanyContactInput,
  UserRole,
} from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreHelper';

export const COMPANY_CONTACTS_COLLECTION = 'company_contacts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 50;
const MAX_POSITION_LENGTH = 50;
const MAX_DEPARTMENT_LENGTH = 50;
const MAX_PHONE_LENGTH = 30;
const MAX_EMAIL_LENGTH = 100;
const MAX_INTERNAL_NOTE_LENGTH = 2000;
const MAX_RESPONSIBILITIES_COUNT = 30;
const MAX_RESPONSIBILITY_TAG_LENGTH = 30;

/**
 * [R3-1 3/3] 입력값 유효성 검증 헬퍼
 */
function validateContactFields(
  params: {
    companyId?: string;
    name?: string;
    position?: string;
    department?: string;
    phone?: string;
    email?: string;
    responsibilities?: string[];
    internalNote?: string;
  },
  isCreate: boolean
): void {
  // 1. companyId 검증
  if (isCreate) {
    if (!params.companyId || !params.companyId.trim()) {
      throw new Error('회사 고유 식별자(companyId)가 누락되었습니다.');
    }
    if (params.companyId.trim().length > 128) {
      throw new Error('회사 식별자 길이가 비정상적입니다.');
    }
  }

  // 2. name 검증 (공백만 입력 차단 및 길이 제한)
  if (isCreate || params.name !== undefined) {
    if (!params.name || !params.name.trim()) {
      throw new Error('담당자 이름은 필수 입력 항목이며 공백일 수 없습니다.');
    }
    if (params.name.trim().length > MAX_NAME_LENGTH) {
      throw new Error(`담당자 이름은 ${MAX_NAME_LENGTH}자 이내여야 합니다.`);
    }
  }

  // 3. email 검증 (이메일 포맷 및 길이)
  if (params.email !== undefined && params.email !== null) {
    const trimmedEmail = params.email.trim();
    if (trimmedEmail.length > 0) {
      if (trimmedEmail.length > MAX_EMAIL_LENGTH) {
        throw new Error(`이메일은 ${MAX_EMAIL_LENGTH}자 이내여야 합니다.`);
      }
      if (!EMAIL_REGEX.test(trimmedEmail)) {
        throw new Error('올바른 이메일 형식이 아닙니다. (예: user@example.com)');
      }
    }
  }

  // 4. phone 검증 (길이 제한)
  if (params.phone !== undefined && params.phone !== null) {
    const trimmedPhone = params.phone.trim();
    if (trimmedPhone.length > MAX_PHONE_LENGTH) {
      throw new Error(`전화번호는 ${MAX_PHONE_LENGTH}자 이내여야 합니다.`);
    }
  }

  // 5. position 검증
  if (params.position !== undefined && params.position !== null) {
    const trimmedPosition = params.position.trim();
    if (trimmedPosition.length > MAX_POSITION_LENGTH) {
      throw new Error(`직책은 ${MAX_POSITION_LENGTH}자 이내여야 합니다.`);
    }
  }

  // 6. department 검증
  if (params.department !== undefined && params.department !== null) {
    const trimmedDept = params.department.trim();
    if (trimmedDept.length > MAX_DEPARTMENT_LENGTH) {
      throw new Error(`부서명은 ${MAX_DEPARTMENT_LENGTH}자 이내여야 합니다.`);
    }
  }

  // 7. internalNote 검증
  if (params.internalNote !== undefined && params.internalNote !== null) {
    const trimmedNote = params.internalNote.trim();
    if (trimmedNote.length > MAX_INTERNAL_NOTE_LENGTH) {
      throw new Error(`내부 메모는 ${MAX_INTERNAL_NOTE_LENGTH}자 이내여야 합니다.`);
    }
  }

  // 8. responsibilities 검증 (배열, 개수, 개별 태그 길이)
  if (params.responsibilities !== undefined && params.responsibilities !== null) {
    if (!Array.isArray(params.responsibilities)) {
      throw new Error('담당업무 목록은 배열 형태여야 합니다.');
    }
    if (params.responsibilities.length > MAX_RESPONSIBILITIES_COUNT) {
      throw new Error(`담당업무 태그는 최대 ${MAX_RESPONSIBILITIES_COUNT}개까지 등록할 수 있습니다.`);
    }
    for (const tag of params.responsibilities) {
      if (typeof tag !== 'string') {
        throw new Error('담당업무 태그는 문자열이어야 합니다.');
      }
      if (tag.trim().length > MAX_RESPONSIBILITY_TAG_LENGTH) {
        throw new Error(`담당업무 태그('${tag.trim().substring(0, 10)}...')는 ${MAX_RESPONSIBILITY_TAG_LENGTH}자 이내여야 합니다.`);
      }
    }
  }
}

/**
 * [R3-1 3/3] responsibilities 중복 제거 및 공백 필터링 헬퍼
 */
function sanitizeResponsibilities(responsibilities?: string[]): string[] | undefined {
  if (!responsibilities || !Array.isArray(responsibilities)) return undefined;
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const item of responsibilities) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
  }

  return cleaned;
}

export const companyContactService = {
  /**
   * [R3-1 1/3] 기업별 담당자 목록 조회 (ADMIN 전용)
   * - 기본적으로 활성(isActive=true) 담당자만 반환하며, includeInactive=true 시 비활성 포함
   * - 정렬: 주 담당자(isPrimary=true) 우선, 이후 생성일 최신순
   */
  async getContactsByCompany(
    companyId: string,
    includeInactive: boolean = false
  ): Promise<CompanyContact[]> {
    if (!companyId || !companyId.trim()) return [];
    const cleanCompanyId = companyId.trim();
    const colRef = collection(db, COMPANY_CONTACTS_COLLECTION);

    try {
      const q = query(colRef, where('companyId', '==', cleanCompanyId));
      const snap = await getDocs(q);

      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyContact));

      if (!includeInactive) {
        list = list.filter((c) => c.isActive !== false);
      }

      // 정렬: 주 담당자(isPrimary) 우선, 그 후 최신 등록순
      return list.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `${COMPANY_CONTACTS_COLLECTION}?companyId=${cleanCompanyId}`);
      throw error;
    }
  },

  /**
   * [R3-1 1/3] 단일 담당자 상세 조회 (ADMIN 전용)
   */
  async getContactById(contactId: string): Promise<CompanyContact | null> {
    if (!contactId || !contactId.trim()) return null;
    const cleanContactId = contactId.trim();
    const docRef = doc(db, COMPANY_CONTACTS_COLLECTION, cleanContactId);

    try {
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as CompanyContact;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${COMPANY_CONTACTS_COLLECTION}/${cleanContactId}`);
      throw error;
    }
  },

  /**
   * [R3-1 1/3, R3-1 3/3] 담당자 생성 (ADMIN 전용)
   * - 주 담당자(isPrimary=true) 지정 시, Firestore transaction을 통해 기존 주 담당자를 원자적으로 해제
   * - companies/{companyId} 문서의 primaryContactId 및 감사 로그(Audit Log)를 원자적으로 동시 기록
   */
  async createContact(
    params: CreateCompanyContactInput,
    actor: {
      uid: string;
      name: string;
      role: UserRole;
    }
  ): Promise<CompanyContact> {
    validateContactFields(params, true);

    const { companyId, name, position, department, phone, email, responsibilities, isPrimary, internalNote, isActive } = params;

    const cleanCompanyId = companyId.trim();
    const cleanName = name.trim();
    const contactId = `contact_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const targetIsActive = isActive ?? true;
    const targetIsPrimary = (isPrimary ?? false) && targetIsActive;
    const cleanResponsibilities = sanitizeResponsibilities(responsibilities);

    // 사전에 해당 회사의 기존 주 담당자 문서 조회 (트랜잭션 내부에서 읽고 해제하기 위함)
    let existingPrimaryDocIds: string[] = [];
    if (targetIsPrimary) {
      try {
        const q = query(
          collection(db, COMPANY_CONTACTS_COLLECTION),
          where('companyId', '==', cleanCompanyId),
          where('isPrimary', '==', true)
        );
        const primarySnap = await getDocs(q);
        existingPrimaryDocIds = primarySnap.docs.map((d) => d.id);
      } catch (e) {
        console.warn('Pre-fetch existing primary contacts note:', e);
      }
    }

    const companyDocRef = doc(db, 'companies', cleanCompanyId);
    const newContactDocRef = doc(db, COMPANY_CONTACTS_COLLECTION, contactId);

    const newContact: CompanyContact = {
      id: contactId,
      companyId: cleanCompanyId,
      name: cleanName,
      position: position?.trim() || undefined,
      department: department?.trim() || undefined,
      phone: phone?.trim() || undefined,
      email: email?.trim() || undefined,
      responsibilities: cleanResponsibilities,
      isPrimary: targetIsPrimary,
      internalNote: internalNote?.trim() || undefined,
      isActive: targetIsActive,
      createdAt: now,
      updatedAt: now,
      createdById: actor.uid,
      updatedById: actor.uid,
    };

    try {
      await runTransaction(db, async (transaction) => {
        // 1. 기업 문서 확인 및 동시성 락
        const compSnap = await transaction.get(companyDocRef);
        if (!compSnap.exists()) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${cleanCompanyId}`);
        }
        const compData = compSnap.data() as Company;

        // 2. 주 담당자 지정 시 기존 주 담당자들 확인 및 해제
        if (targetIsPrimary) {
          const idsToDemote = new Set<string>(existingPrimaryDocIds);
          if (compData.primaryContactId && compData.primaryContactId !== contactId) {
            idsToDemote.add(compData.primaryContactId);
          }

          for (const oldId of idsToDemote) {
            const oldRef = doc(db, COMPANY_CONTACTS_COLLECTION, oldId);
            const oldSnap = await transaction.get(oldRef);
            if (oldSnap.exists() && oldSnap.data().isPrimary === true) {
              transaction.update(oldRef, sanitizeFirestoreData({
                isPrimary: false,
                updatedAt: now,
                updatedById: actor.uid,
              }));
            }
          }
        }

        // 3. 신규 담당자 생성
        transaction.set(newContactDocRef, sanitizeFirestoreData(newContact));

        // 4. 회사 문서 primaryContactId 갱신 (주 담당자인 경우)
        if (targetIsPrimary) {
          transaction.update(companyDocRef, sanitizeFirestoreData({
            primaryContactId: contactId,
            updatedAt: now,
          }));
        }

        // 5. Audit Log 원자적 기록
        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const auditDocRef = doc(db, 'audit_logs', logId);
        const auditPayload: AuditLog = {
          id: logId,
          actorUserId: actor.uid,
          actorRole: actor.role,
          actorName: actor.name,
          companyId: cleanCompanyId,
          action: 'CREATE_COMPANY_CONTACT',
          resourceType: 'COMPANY_CONTACT',
          resourceId: contactId,
          timestamp: now,
          details: {
            contactId,
            companyId: cleanCompanyId,
            name: newContact.name,
            position: newContact.position,
            department: newContact.department,
            phone: newContact.phone,
            email: newContact.email,
            responsibilities: newContact.responsibilities,
            isPrimary: newContact.isPrimary,
            isActive: newContact.isActive,
            actorUid: actor.uid,
            actorName: actor.name,
          },
        };
        transaction.set(auditDocRef, sanitizeFirestoreData(auditPayload));
      });

      return newContact;
    } catch (error: any) {
      if (error instanceof Error && (error.message.includes('누락되었습니다') || error.message.includes('찾을 수 없습니다') || error.message.includes('이내여야 합니다') || error.message.includes('형식이 아닙니다'))) {
        throw error;
      }
      handleFirestoreError(error, OperationType.CREATE, `${COMPANY_CONTACTS_COLLECTION}/${contactId}`);
      throw error;
    }
  },

  /**
   * [R3-1 1/3, R3-1 3/3] 담당자 수정 (ADMIN 전용)
   * - 회사 격리 검증 (params.companyId 위변조 차단)
   * - isPrimary가 true로 변경되면 기존 주 담당자 자동 해제 (원자적 트랜잭션)
   * - isActive가 false로 변경되거나 isPrimary가 해제되면 primaryContactId null 정리
   */
  async updateContact(
    contactId: string,
    params: UpdateCompanyContactInput,
    actor: {
      uid: string;
      name: string;
      role: UserRole;
    }
  ): Promise<CompanyContact> {
    if (!contactId || !contactId.trim()) {
      throw new Error('담당자 고유 식별자(contactId)가 누락되었습니다.');
    }
    if (contactId.trim().length > 128) {
      throw new Error('담당자 식별자 길이가 비정상적입니다.');
    }

    validateContactFields(params, false);

    const cleanContactId = contactId.trim();
    const contactDocRef = doc(db, COMPANY_CONTACTS_COLLECTION, cleanContactId);
    const now = new Date().toISOString();

    // 주 담당자로 승격 지정 시 사전 쿼리로 기존 주 담당자 ID 수집
    let existingPrimaryDocIds: string[] = [];
    if (params.isPrimary === true) {
      try {
        const contactSnapEarly = await getDoc(contactDocRef);
        if (contactSnapEarly.exists()) {
          const compIdEarly = (contactSnapEarly.data() as CompanyContact).companyId;
          const q = query(
            collection(db, COMPANY_CONTACTS_COLLECTION),
            where('companyId', '==', compIdEarly),
            where('isPrimary', '==', true)
          );
          const primarySnap = await getDocs(q);
          existingPrimaryDocIds = primarySnap.docs.map((d) => d.id).filter((id) => id !== cleanContactId);
        }
      } catch (e) {
        console.warn('Pre-fetch existing primary contacts note in update:', e);
      }
    }

    try {
      return await runTransaction(db, async (transaction) => {
        // 1. 기존 담당자 조회
        const contactSnap = await transaction.get(contactDocRef);
        if (!contactSnap.exists()) {
          throw new Error(`대상 담당자를 찾을 수 없습니다: ${cleanContactId}`);
        }
        const currentContact = contactSnap.data() as CompanyContact;
        const cleanCompanyId = currentContact.companyId;

        // [R3-1 3/3] 회사 격리 검증: 요청 params에 companyId가 포함된 경우 동일 기업인지 엄격 검증
        if (params.companyId && params.companyId.trim() !== cleanCompanyId) {
          throw new Error('담당자의 소속 기업과 요청 기업 ID가 일치하지 않습니다.');
        }

        const companyDocRef = doc(db, 'companies', cleanCompanyId);

        // 2. 기업 문서 조회
        const compSnap = await transaction.get(companyDocRef);
        if (!compSnap.exists()) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${cleanCompanyId}`);
        }
        const compData = compSnap.data() as Company;

        // 3. 필드 계산
        let nextIsActive = currentContact.isActive;
        if (params.isActive !== undefined) {
          nextIsActive = params.isActive;
        }

        let nextIsPrimary = currentContact.isPrimary;
        if (params.isPrimary !== undefined) {
          nextIsPrimary = params.isPrimary && nextIsActive;
        } else if (!nextIsActive) {
          // 비활성화되면 주 담당자 자격도 자동 상실
          nextIsPrimary = false;
        }

        const becomingPrimary = !currentContact.isPrimary && nextIsPrimary;
        const losingPrimary = currentContact.isPrimary && !nextIsPrimary;

        // 4. 주 담당자로 승격 시 기존 주 담당자들 해제
        if (becomingPrimary) {
          const idsToDemote = new Set<string>(existingPrimaryDocIds);
          if (compData.primaryContactId && compData.primaryContactId !== cleanContactId) {
            idsToDemote.add(compData.primaryContactId);
          }

          for (const oldId of idsToDemote) {
            const oldRef = doc(db, COMPANY_CONTACTS_COLLECTION, oldId);
            const oldSnap = await transaction.get(oldRef);
            if (oldSnap.exists() && oldSnap.data().isPrimary === true) {
              transaction.update(oldRef, sanitizeFirestoreData({
                isPrimary: false,
                updatedAt: now,
                updatedById: actor.uid,
              }));
            }
          }
          transaction.update(companyDocRef, sanitizeFirestoreData({
            primaryContactId: cleanContactId,
            updatedAt: now,
          }));
        } else if ((losingPrimary || !nextIsActive || !nextIsPrimary) && compData.primaryContactId === cleanContactId) {
          // [R3-1 3/3] 비활성화 또는 주 담당자 해제 시 회사 문서의 primaryContactId를 안전하게 null로 초기화
          transaction.update(companyDocRef, sanitizeFirestoreData({
            primaryContactId: null,
            updatedAt: now,
          }));
        }

        // 5. 담당자 문서 업데이트
        const updatedContact: CompanyContact = {
          ...currentContact,
          name: params.name !== undefined ? params.name.trim() : currentContact.name,
          position: params.position !== undefined ? (params.position.trim() || undefined) : currentContact.position,
          department: params.department !== undefined ? (params.department.trim() || undefined) : currentContact.department,
          phone: params.phone !== undefined ? (params.phone.trim() || undefined) : currentContact.phone,
          email: params.email !== undefined ? (params.email.trim() || undefined) : currentContact.email,
          responsibilities: params.responsibilities !== undefined
            ? sanitizeResponsibilities(params.responsibilities)
            : currentContact.responsibilities,
          isPrimary: nextIsPrimary,
          internalNote: params.internalNote !== undefined ? (params.internalNote.trim() || undefined) : currentContact.internalNote,
          isActive: nextIsActive,
          updatedAt: now,
          updatedById: actor.uid,
        };

        transaction.update(contactDocRef, sanitizeFirestoreData({
          name: updatedContact.name,
          position: updatedContact.position || null,
          department: updatedContact.department || null,
          phone: updatedContact.phone || null,
          email: updatedContact.email || null,
          responsibilities: updatedContact.responsibilities || [],
          isPrimary: updatedContact.isPrimary,
          internalNote: updatedContact.internalNote || null,
          isActive: updatedContact.isActive,
          updatedAt: now,
          updatedById: actor.uid,
        }));

        // 6. Audit Log 기록
        const isOnlyActiveToggle =
          params.isActive !== undefined &&
          params.name === undefined &&
          params.position === undefined &&
          params.department === undefined &&
          params.phone === undefined &&
          params.email === undefined &&
          params.responsibilities === undefined &&
          params.internalNote === undefined &&
          (params.isPrimary === undefined || params.isPrimary === nextIsPrimary);

        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const auditDocRef = doc(db, 'audit_logs', logId);
        const auditPayload: AuditLog = {
          id: logId,
          actorUserId: actor.uid,
          actorRole: actor.role,
          actorName: actor.name,
          companyId: cleanCompanyId,
          action: 'UPDATE_COMPANY_CONTACT',
          resourceType: 'COMPANY_CONTACT',
          resourceId: cleanContactId,
          timestamp: now,
          details: {
            contactId: cleanContactId,
            companyId: cleanCompanyId,
            operation: isOnlyActiveToggle ? (nextIsActive ? 'ACTIVATE' : 'DEACTIVATE') : 'UPDATE_FIELDS',
            before: {
              name: currentContact.name,
              isPrimary: currentContact.isPrimary,
              isActive: currentContact.isActive,
              position: currentContact.position,
              department: currentContact.department,
            },
            after: {
              name: updatedContact.name,
              isPrimary: updatedContact.isPrimary,
              isActive: updatedContact.isActive,
              position: updatedContact.position,
              department: updatedContact.department,
            },
            actorUid: actor.uid,
            actorName: actor.name,
          },
        };
        transaction.set(auditDocRef, sanitizeFirestoreData(auditPayload));

        return updatedContact;
      });
    } catch (error: any) {
      if (error instanceof Error && (error.message.includes('누락되었습니다') || error.message.includes('찾을 수 없습니다') || error.message.includes('일치하지 않습니다') || error.message.includes('이내여야 합니다') || error.message.includes('형식이 아닙니다'))) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `${COMPANY_CONTACTS_COLLECTION}/${cleanContactId}`);
      throw error;
    }
  },

  /**
   * [R3-1 1/3, R3-1 3/3] 활성/비활성 상태 변경 (ADMIN 전용)
   * - 비활성화 시 주 담당자(isPrimary) 상태였던 경우 자동으로 해제
   * - expectedCompanyId 지정 시 회사 격리 검증 수행
   */
  async toggleContactActive(
    contactId: string,
    isActive: boolean,
    actor: {
      uid: string;
      name: string;
      role: UserRole;
    },
    expectedCompanyId?: string
  ): Promise<CompanyContact> {
    const updated = await this.updateContact(contactId, { isActive, companyId: expectedCompanyId }, actor);
    return updated;
  },

  /**
   * [R3-1 1/3, R3-1 3/3] 주 담당자 지정 (ADMIN 전용)
   * - 해당 담당자를 활성화 및 주 담당자로 지정
   * - 기존 주 담당자는 원자적 트랜잭션을 통해 자동으로 해제
   * - 회사 격리 검증 (A사 담당자를 B사의 주 담당자로 지정 불가)
   */
  async setPrimaryContact(
    companyId: string,
    contactId: string,
    actor: {
      uid: string;
      name: string;
      role: UserRole;
    }
  ): Promise<CompanyContact> {
    if (!companyId || !companyId.trim()) {
      throw new Error('회사 고유 식별자(companyId)가 누락되었습니다.');
    }
    if (!contactId || !contactId.trim()) {
      throw new Error('담당자 고유 식별자(contactId)가 누락되었습니다.');
    }
    if (companyId.trim().length > 128) {
      throw new Error('회사 식별자 길이가 비정상적입니다.');
    }
    if (contactId.trim().length > 128) {
      throw new Error('담당자 식별자 길이가 비정상적입니다.');
    }

    const cleanCompanyId = companyId.trim();
    const cleanContactId = contactId.trim();
    const contactDocRef = doc(db, COMPANY_CONTACTS_COLLECTION, cleanContactId);
    const companyDocRef = doc(db, 'companies', cleanCompanyId);
    const now = new Date().toISOString();

    // 기존 주 담당자들 사전 쿼리
    let existingPrimaryDocIds: string[] = [];
    try {
      const q = query(
        collection(db, COMPANY_CONTACTS_COLLECTION),
        where('companyId', '==', cleanCompanyId),
        where('isPrimary', '==', true)
      );
      const primarySnap = await getDocs(q);
      existingPrimaryDocIds = primarySnap.docs.map((d) => d.id).filter((id) => id !== cleanContactId);
    } catch (e) {
      console.warn('Pre-fetch primary contacts note:', e);
    }

    try {
      return await runTransaction(db, async (transaction) => {
        // 1. 기업 확인
        const compSnap = await transaction.get(companyDocRef);
        if (!compSnap.exists()) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${cleanCompanyId}`);
        }
        const compData = compSnap.data() as Company;

        // 2. 대상 담당자 확인
        const contactSnap = await transaction.get(contactDocRef);
        if (!contactSnap.exists()) {
          throw new Error(`대상 담당자를 찾을 수 없습니다: ${cleanContactId}`);
        }
        const contactData = contactSnap.data() as CompanyContact;
        if (contactData.companyId !== cleanCompanyId) {
          throw new Error('담당자의 소속 기업과 요청 기업 ID가 일치하지 않습니다.');
        }

        // 3. 기존 주 담당자 해제 (동일 트랜잭션)
        const idsToDemote = new Set<string>(existingPrimaryDocIds);
        if (compData.primaryContactId && compData.primaryContactId !== cleanContactId) {
          idsToDemote.add(compData.primaryContactId);
        }

        for (const oldId of idsToDemote) {
          const oldRef = doc(db, COMPANY_CONTACTS_COLLECTION, oldId);
          const oldSnap = await transaction.get(oldRef);
          if (oldSnap.exists() && oldSnap.data().isPrimary === true) {
            transaction.update(oldRef, sanitizeFirestoreData({
              isPrimary: false,
              updatedAt: now,
              updatedById: actor.uid,
            }));
          }
        }

        // 4. 대상 담당자 주 담당자 및 활성화 설정
        transaction.update(contactDocRef, sanitizeFirestoreData({
          isPrimary: true,
          isActive: true,
          updatedAt: now,
          updatedById: actor.uid,
        }));

        // 5. 기업 문서 primaryContactId 갱신
        transaction.update(companyDocRef, sanitizeFirestoreData({
          primaryContactId: cleanContactId,
          updatedAt: now,
        }));

        // 6. Audit Log 기록
        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const auditDocRef = doc(db, 'audit_logs', logId);
        const auditPayload: AuditLog = {
          id: logId,
          actorUserId: actor.uid,
          actorRole: actor.role,
          actorName: actor.name,
          companyId: cleanCompanyId,
          action: 'SET_PRIMARY_COMPANY_CONTACT',
          resourceType: 'COMPANY_CONTACT',
          resourceId: cleanContactId,
          timestamp: now,
          details: {
            contactId: cleanContactId,
            contactName: contactData.name,
            companyId: cleanCompanyId,
            previousPrimaryId: compData.primaryContactId || null,
            actorUid: actor.uid,
            actorName: actor.name,
          },
        };
        transaction.set(auditDocRef, sanitizeFirestoreData(auditPayload));

        return {
          ...contactData,
          isPrimary: true,
          isActive: true,
          updatedAt: now,
          updatedById: actor.uid,
        };
      });
    } catch (error: any) {
      if (error instanceof Error && (error.message.includes('누락되었습니다') || error.message.includes('찾을 수 없습니다') || error.message.includes('일치하지 않습니다'))) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `${COMPANY_CONTACTS_COLLECTION}/${cleanContactId}`);
      throw error;
    }
  },
};
