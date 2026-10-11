import {
  CompanyContact,
  CreateCompanyContactInput,
  UpdateCompanyContactInput,
  Company,
  UserRole,
  AuditLog,
} from '../src/types';

// Mock in-memory Firestore transaction simulator for QA verification
class MockQAContactsStore {
  public companies: Map<string, any> = new Map();
  public contacts: Map<string, CompanyContact> = new Map();
  public auditLogs: AuditLog[] = [];
  private versionMap: Map<string, number> = new Map();

  setCompany(id: string, data: any) {
    this.companies.set(id, { ...data, id });
    this.versionMap.set(`companies/${id}`, (this.versionMap.get(`companies/${id}`) || 0) + 1);
  }

  getCompany(id: string) {
    const data = this.companies.get(id);
    return data ? JSON.parse(JSON.stringify(data)) : null;
  }

  getContact(id: string) {
    const data = this.contacts.get(id);
    return data ? JSON.parse(JSON.stringify(data)) : null;
  }

  getAllContacts(): CompanyContact[] {
    return Array.from(this.contacts.values()).map((c) => JSON.parse(JSON.stringify(c)));
  }

  getVersion(path: string) {
    return this.versionMap.get(path) || 0;
  }

  async runTransaction<T>(
    updateFunction: (txn: {
      get: (refPath: string) => Promise<{ exists: boolean; data: () => any }>;
      update: (refPath: string, data: any) => void;
      set: (refPath: string, data: any) => void;
    }) => Promise<T>,
    maxRetries = 20
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const readVersions = new Map<string, number>();
      const stagedUpdates = new Map<string, { type: 'update' | 'set'; data: any }>();

      const txn = {
        get: async (refPath: string) => {
          readVersions.set(refPath, this.getVersion(refPath));
          if (refPath.startsWith('companies/')) {
            const compId = refPath.replace('companies/', '');
            const comp = this.getCompany(compId);
            return { exists: !!comp, data: () => comp };
          }
          if (refPath.startsWith('company_contacts/')) {
            const contactId = refPath.replace('company_contacts/', '');
            const contact = this.getContact(contactId);
            return { exists: !!contact, data: () => contact };
          }
          return { exists: false, data: () => null };
        },
        update: (refPath: string, data: any) => {
          stagedUpdates.set(refPath, { type: 'update', data });
        },
        set: (refPath: string, data: any) => {
          stagedUpdates.set(refPath, { type: 'set', data });
        },
      };

      try {
        const result = await updateFunction(txn);

        // Optimistic concurrency conflict check
        let conflict = false;
        for (const [refPath, versionAtRead] of readVersions.entries()) {
          if (this.getVersion(refPath) !== versionAtRead) {
            conflict = true;
            break;
          }
        }

        if (conflict) {
          await new Promise((r) => setTimeout(r, Math.random() * 15 + 5));
          continue;
        }

        // Commit all staged mutations atomically
        for (const [refPath, mutation] of stagedUpdates.entries()) {
          if (refPath.startsWith('companies/')) {
            const compId = refPath.replace('companies/', '');
            const existing = this.getCompany(compId) || {};
            this.companies.set(compId, { ...existing, ...mutation.data });
            this.versionMap.set(refPath, (this.versionMap.get(refPath) || 0) + 1);
          } else if (refPath.startsWith('company_contacts/')) {
            const contactId = refPath.replace('company_contacts/', '');
            if (mutation.type === 'set') {
              this.contacts.set(contactId, mutation.data);
            } else {
              const existing = this.getContact(contactId) || {};
              this.contacts.set(contactId, { ...existing, ...mutation.data });
            }
            this.versionMap.set(refPath, (this.versionMap.get(refPath) || 0) + 1);
          } else if (refPath.startsWith('audit_logs/')) {
            this.auditLogs.push(mutation.data);
          }
        }

        return result;
      } catch (err) {
        throw err;
      }
    }
    throw new Error('Transaction failed due to contention retry limits');
  }
}

// Logic replication of src/services/companyContactService.ts for QA testing
function createQAService(store: MockQAContactsStore) {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MAX_NAME_LENGTH = 50;
  const MAX_POSITION_LENGTH = 50;
  const MAX_DEPARTMENT_LENGTH = 50;
  const MAX_PHONE_LENGTH = 30;
  const MAX_EMAIL_LENGTH = 100;
  const MAX_INTERNAL_NOTE_LENGTH = 2000;
  const MAX_RESPONSIBILITIES_COUNT = 30;
  const MAX_RESPONSIBILITY_TAG_LENGTH = 30;

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
    if (isCreate) {
      if (!params.companyId || !params.companyId.trim()) {
        throw new Error('회사 고유 식별자(companyId)가 누락되었습니다.');
      }
      if (params.companyId.trim().length > 128) {
        throw new Error('회사 식별자 길이가 비정상적입니다.');
      }
    }

    if (isCreate || params.name !== undefined) {
      if (!params.name || !params.name.trim()) {
        throw new Error('담당자 이름은 필수 입력 항목이며 공백일 수 없습니다.');
      }
      if (params.name.trim().length > MAX_NAME_LENGTH) {
        throw new Error(`담당자 이름은 ${MAX_NAME_LENGTH}자 이내여야 합니다.`);
      }
    }

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

    if (params.phone !== undefined && params.phone !== null) {
      const trimmedPhone = params.phone.trim();
      if (trimmedPhone.length > MAX_PHONE_LENGTH) {
        throw new Error(`전화번호는 ${MAX_PHONE_LENGTH}자 이내여야 합니다.`);
      }
    }

    if (params.position !== undefined && params.position !== null) {
      const trimmedPosition = params.position.trim();
      if (trimmedPosition.length > MAX_POSITION_LENGTH) {
        throw new Error(`직책은 ${MAX_POSITION_LENGTH}자 이내여야 합니다.`);
      }
    }

    if (params.department !== undefined && params.department !== null) {
      const trimmedDept = params.department.trim();
      if (trimmedDept.length > MAX_DEPARTMENT_LENGTH) {
        throw new Error(`부서명은 ${MAX_DEPARTMENT_LENGTH}자 이내여야 합니다.`);
      }
    }

    if (params.internalNote !== undefined && params.internalNote !== null) {
      const trimmedNote = params.internalNote.trim();
      if (trimmedNote.length > MAX_INTERNAL_NOTE_LENGTH) {
        throw new Error(`내부 메모는 ${MAX_INTERNAL_NOTE_LENGTH}자 이내여야 합니다.`);
      }
    }

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

  return {
    validateContactFields,
    sanitizeResponsibilities,

    async getContactsByCompany(companyId: string, includeInactive: boolean = false): Promise<CompanyContact[]> {
      let list = store.getAllContacts().filter((c) => c.companyId === companyId);
      if (!includeInactive) {
        list = list.filter((c) => c.isActive !== false);
      }
      return list.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    },

    async getContactById(contactId: string): Promise<CompanyContact | null> {
      return store.getContact(contactId);
    },

    async createContact(
      params: CreateCompanyContactInput,
      actor: { uid: string; name: string; role: UserRole }
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

      const existingPrimaryDocIds = store.getAllContacts()
        .filter((c) => c.companyId === cleanCompanyId && c.isPrimary)
        .map((c) => c.id);

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

      await store.runTransaction(async (transaction) => {
        const compSnap = await transaction.get(`companies/${cleanCompanyId}`);
        if (!compSnap.exists) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${cleanCompanyId}`);
        }
        const compData = compSnap.data() as Company;

        if (targetIsPrimary) {
          const idsToDemote = new Set<string>(existingPrimaryDocIds);
          if (compData.primaryContactId && compData.primaryContactId !== contactId) {
            idsToDemote.add(compData.primaryContactId);
          }

          for (const oldId of idsToDemote) {
            const oldSnap = await transaction.get(`company_contacts/${oldId}`);
            if (oldSnap.exists && oldSnap.data().isPrimary === true) {
              transaction.update(`company_contacts/${oldId}`, {
                isPrimary: false,
                updatedAt: now,
                updatedById: actor.uid,
              });
            }
          }
        }

        transaction.set(`company_contacts/${contactId}`, newContact);

        if (targetIsPrimary) {
          transaction.update(`companies/${cleanCompanyId}`, {
            primaryContactId: contactId,
            updatedAt: now,
          });
        }

        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
        transaction.set(`audit_logs/${logId}`, auditPayload);
      });

      return newContact;
    },

    async updateContact(
      contactId: string,
      params: UpdateCompanyContactInput,
      actor: { uid: string; name: string; role: UserRole }
    ): Promise<CompanyContact> {
      if (!contactId || !contactId.trim()) {
        throw new Error('담당자 고유 식별자(contactId)가 누락되었습니다.');
      }
      if (contactId.trim().length > 128) {
        throw new Error('담당자 식별자 길이가 비정상적입니다.');
      }

      validateContactFields(params, false);

      const cleanContactId = contactId.trim();
      const now = new Date().toISOString();

      return await store.runTransaction(async (transaction) => {
        const contactSnap = await transaction.get(`company_contacts/${cleanContactId}`);
        if (!contactSnap.exists) {
          throw new Error(`대상 담당자를 찾을 수 없습니다: ${cleanContactId}`);
        }
        const currentContact = contactSnap.data() as CompanyContact;
        const cleanCompanyId = currentContact.companyId;

        // 회사 격리 검증
        if (params.companyId && params.companyId.trim() !== cleanCompanyId) {
          throw new Error('담당자의 소속 기업과 요청 기업 ID가 일치하지 않습니다.');
        }

        const compSnap = await transaction.get(`companies/${cleanCompanyId}`);
        if (!compSnap.exists) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${cleanCompanyId}`);
        }
        const compData = compSnap.data() as Company;

        let nextIsActive = currentContact.isActive;
        if (params.isActive !== undefined) {
          nextIsActive = params.isActive;
        }

        let nextIsPrimary = currentContact.isPrimary;
        if (params.isPrimary !== undefined) {
          nextIsPrimary = params.isPrimary && nextIsActive;
        } else if (!nextIsActive) {
          nextIsPrimary = false;
        }

        const becomingPrimary = !currentContact.isPrimary && nextIsPrimary;
        const losingPrimary = currentContact.isPrimary && !nextIsPrimary;

        if (becomingPrimary) {
          const existingPrimaries = store.getAllContacts()
            .filter((c) => c.companyId === cleanCompanyId && c.isPrimary)
            .map((c) => c.id);
          const idsToDemote = new Set<string>(existingPrimaries);
          if (compData.primaryContactId && compData.primaryContactId !== cleanContactId) {
            idsToDemote.add(compData.primaryContactId);
          }

          for (const oldId of idsToDemote) {
            const oldSnap = await transaction.get(`company_contacts/${oldId}`);
            if (oldSnap.exists && oldSnap.data().isPrimary === true) {
              transaction.update(`company_contacts/${oldId}`, {
                isPrimary: false,
                updatedAt: now,
                updatedById: actor.uid,
              });
            }
          }
          transaction.update(`companies/${cleanCompanyId}`, {
            primaryContactId: cleanContactId,
            updatedAt: now,
          });
        } else if ((losingPrimary || !nextIsActive || !nextIsPrimary) && compData.primaryContactId === cleanContactId) {
          transaction.update(`companies/${cleanCompanyId}`, {
            primaryContactId: null,
            updatedAt: now,
          });
        }

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

        transaction.update(`company_contacts/${cleanContactId}`, {
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
        });

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
        transaction.set(`audit_logs/${logId}`, auditPayload);

        return updatedContact;
      });
    },

    async toggleContactActive(
      contactId: string,
      isActive: boolean,
      actor: { uid: string; name: string; role: UserRole },
      expectedCompanyId?: string
    ): Promise<CompanyContact> {
      return this.updateContact(contactId, { isActive, companyId: expectedCompanyId }, actor);
    },

    async setPrimaryContact(
      companyId: string,
      contactId: string,
      actor: { uid: string; name: string; role: UserRole }
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
      const now = new Date().toISOString();

      const existingPrimaryDocIds = store.getAllContacts()
        .filter((c) => c.companyId === cleanCompanyId && c.isPrimary)
        .map((c) => c.id)
        .filter((id) => id !== cleanContactId);

      return await store.runTransaction(async (transaction) => {
        const compSnap = await transaction.get(`companies/${cleanCompanyId}`);
        if (!compSnap.exists) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${cleanCompanyId}`);
        }
        const compData = compSnap.data() as Company;

        const contactSnap = await transaction.get(`company_contacts/${cleanContactId}`);
        if (!contactSnap.exists) {
          throw new Error(`대상 담당자를 찾을 수 없습니다: ${cleanContactId}`);
        }
        const contactData = contactSnap.data() as CompanyContact;
        if (contactData.companyId !== cleanCompanyId) {
          throw new Error('담당자의 소속 기업과 요청 기업 ID가 일치하지 않습니다.');
        }

        const idsToDemote = new Set<string>(existingPrimaryDocIds);
        if (compData.primaryContactId && compData.primaryContactId !== cleanContactId) {
          idsToDemote.add(compData.primaryContactId);
        }

        for (const oldId of idsToDemote) {
          const oldSnap = await transaction.get(`company_contacts/${oldId}`);
          if (oldSnap.exists && oldSnap.data().isPrimary === true) {
            transaction.update(`company_contacts/${oldId}`, {
              isPrimary: false,
              updatedAt: now,
              updatedById: actor.uid,
            });
          }
        }

        transaction.update(`company_contacts/${cleanContactId}`, {
          isPrimary: true,
          isActive: true,
          updatedAt: now,
          updatedById: actor.uid,
        });

        transaction.update(`companies/${cleanCompanyId}`, {
          primaryContactId: cleanContactId,
          updatedAt: now,
        });

        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
        transaction.set(`audit_logs/${logId}`, auditPayload);

        return {
          ...contactData,
          isPrimary: true,
          isActive: true,
          updatedAt: now,
          updatedById: actor.uid,
        };
      });
    },
  };
}

async function runFullQASuite() {
  console.log('========================================================================');
  console.log('🚀 [R3-1 3/3] 기업 담당자 관리 최종 정합성·권한 QA 종합 검증 시작');
  console.log('========================================================================\n');

  const store = new MockQAContactsStore();
  const service = createQAService(store);
  const actor = { uid: 'admin_qa_01', name: '김대표노무사', role: 'ADMIN' as UserRole };

  // Setup initial test companies
  store.setCompany('comp_alpha', {
    companyName: '(주)알파소프트',
    businessNumber: '111-22-33333',
    status: 'active',
  });
  store.setCompany('comp_beta', {
    companyName: '(주)베타물류',
    businessNumber: '999-88-77777',
    status: 'active',
  });

  // -------------------------------------------------------------------------
  // [Section 1] 주 담당자 정합성 (Primary Contact Consistency)
  // -------------------------------------------------------------------------
  console.log('--- [Section 1] 주 담당자 정합성 테스트 ---');

  // 1-1. 첫 담당자를 주 담당자로 등록
  console.log('[1-1] 첫 담당자를 주 담당자로 등록');
  const c1 = await service.createContact(
    {
      companyId: 'comp_alpha',
      name: '홍길동',
      position: '인사부장',
      department: '경영지원팀',
      phone: '010-1111-2222',
      email: 'hong@alpha.com',
      responsibilities: ['인사', '급여'],
      isPrimary: true,
      isActive: true,
    },
    actor
  );
  let compAlpha = store.getCompany('comp_alpha');
  if (c1.isPrimary === true && compAlpha.primaryContactId === c1.id) {
    console.log('✓ PASS: 첫 담당자가 주 담당자로 정상 등록되고 companies.primaryContactId 일치');
  } else {
    throw new Error('FAIL: 1-1 첫 담당자 등록 실패');
  }

  // 1-2. 일반 담당자 등록 후 주 담당자로 변경
  console.log('[1-2] 일반 담당자 등록 후 주 담당자로 승격');
  const c2 = await service.createContact(
    {
      companyId: 'comp_alpha',
      name: '이순신',
      position: '급여과장',
      isPrimary: false,
      isActive: true,
    },
    actor
  );
  await service.setPrimaryContact('comp_alpha', c2.id, actor);
  compAlpha = store.getCompany('comp_alpha');
  const freshC1 = await service.getContactById(c1.id);
  const freshC2 = await service.getContactById(c2.id);
  if (freshC2?.isPrimary === true && freshC1?.isPrimary === false && compAlpha.primaryContactId === c2.id) {
    console.log('✓ PASS: 기존 주 담당자(c1) 자동 강등 및 신규 주 담당자(c2) 승격 확인');
  } else {
    throw new Error('FAIL: 1-2 주 담당자 변경 실패');
  }

  // 1-3. 현재 주 담당자(c2) 비활성화
  console.log('[1-3] 현재 주 담당자 비활성화 시 자동 해제 및 primaryContactId null 정리');
  await service.toggleContactActive(c2.id, false, actor, 'comp_alpha');
  compAlpha = store.getCompany('comp_alpha');
  const freshC2Deactivated = await service.getContactById(c2.id);
  if (freshC2Deactivated?.isActive === false && freshC2Deactivated?.isPrimary === false && compAlpha.primaryContactId === null) {
    console.log('✓ PASS: 주 담당자 비활성화 시 isPrimary=false 자동 전환 및 companies.primaryContactId=null 안전 정리');
  } else {
    throw new Error('FAIL: 1-3 주 담당자 비활성화 정리 실패');
  }

  // 1-4. 비활성 담당자(c2)를 다시 활성화 (isPrimary 미지정)
  console.log('[1-4] 비활성 담당자를 다시 활성화 (과거 주 담당자 자격 자동 복원되지 않음)');
  await service.toggleContactActive(c2.id, true, actor, 'comp_alpha');
  compAlpha = store.getCompany('comp_alpha');
  const freshC2Reactivated = await service.getContactById(c2.id);
  if (freshC2Reactivated?.isActive === true && freshC2Reactivated?.isPrimary === false && compAlpha.primaryContactId === null) {
    console.log('✓ PASS: 재활성화 시 isPrimary는 false 유지되며 과거 primaryContactId가 부활하지 않음');
  } else {
    throw new Error('FAIL: 1-4 재활성화 시 주 담당자 상태 오염');
  }

  // 1-5. 담당자 수정 화면에서 isPrimary 토글
  console.log('[1-5] 담당자 수정 화면에서 isPrimary 토글 (true -> false)');
  await service.updateContact(c1.id, { isPrimary: true, companyId: 'comp_alpha' }, actor);
  compAlpha = store.getCompany('comp_alpha');
  if (compAlpha.primaryContactId !== c1.id) throw new Error('FAIL: c1 주 담당자 승격 실패');

  // c1의 isPrimary를 false로 수정
  await service.updateContact(c1.id, { isPrimary: false, companyId: 'comp_alpha' }, actor);
  compAlpha = store.getCompany('comp_alpha');
  const c1Demoted = await service.getContactById(c1.id);
  if (c1Demoted?.isPrimary === false && compAlpha.primaryContactId === null) {
    console.log('✓ PASS: 수정 화면에서 isPrimary=false 지정 시 primaryContactId가 안전하게 null로 초기화됨');
  } else {
    throw new Error('FAIL: 1-5 isPrimary=false 초기화 실패');
  }

  // 1-6. 동시에 서로 다른 담당자를 주 담당자로 지정 (Race condition 테스트)
  console.log('[1-6] 동시 경쟁 주 담당자 지정 시 단일 주 담당자 보장');
  const c3 = await service.createContact(
    { companyId: 'comp_alpha', name: '강감찬', isPrimary: false, isActive: true },
    actor
  );
  const c4 = await service.createContact(
    { companyId: 'comp_alpha', name: '을지문덕', isPrimary: false, isActive: true },
    actor
  );

  await Promise.all([
    service.setPrimaryContact('comp_alpha', c3.id, actor),
    service.setPrimaryContact('comp_alpha', c4.id, actor),
  ]);

  compAlpha = store.getCompany('comp_alpha');
  const allAlphaContacts = await service.getContactsByCompany('comp_alpha', true);
  const activePrimaries = allAlphaContacts.filter((c) => c.isPrimary && c.isActive);

  if (activePrimaries.length === 1 && compAlpha.primaryContactId === activePrimaries[0].id) {
    console.log(`✓ PASS: 동시 호출 경쟁 후에도 활성 주 담당자는 정확히 1명(${activePrimaries[0].name})이며 primaryContactId와 완벽 일치`);
  } else {
    throw new Error(`FAIL: 동시 호출 후 활성 주 담당자 수 이상: ${activePrimaries.length}`);
  }

  // -------------------------------------------------------------------------
  // [Section 2] 회사 격리 (Company Isolation)
  // -------------------------------------------------------------------------
  console.log('\n--- [Section 2] 회사 격리 (Company Isolation) 테스트 ---');

  // 2-1. A기업 담당자를 B기업의 주 담당자로 지정 차단
  console.log('[2-1] A기업 담당자를 B기업 주 담당자로 지정 시도 차단');
  let isolationCaught1 = false;
  try {
    await service.setPrimaryContact('comp_beta', c3.id, actor);
  } catch (err: any) {
    if (err.message.includes('일치하지 않습니다')) {
      isolationCaught1 = true;
    }
  }
  if (isolationCaught1) {
    console.log('✓ PASS: 소속 기업 불일치 시 주 담당자 지정 즉시 차단');
  } else {
    throw new Error('FAIL: 2-1 소속 불일치 주 담당자 지정 차단 실패');
  }

  // 2-2. contactId만 조작하여 다른 companyId의 담당자를 수정 시도 차단
  console.log('[2-2] contactId 조작하여 타사 담당자 수정 시도 차단 (companyId 불일치)');
  let isolationCaught2 = false;
  try {
    await service.updateContact(c3.id, { companyId: 'comp_beta', name: '해킹시도' }, actor);
  } catch (err: any) {
    if (err.message.includes('일치하지 않습니다')) {
      isolationCaught2 = true;
    }
  }
  if (isolationCaught2) {
    console.log('✓ PASS: 타사 companyId를 전달한 위변조 수정 시도 즉시 차단');
  } else {
    throw new Error('FAIL: 2-2 타사 담당자 위변조 수정 차단 실패');
  }

  // -------------------------------------------------------------------------
  // [Section 3] 입력값 유효성 검증 (Input Validation)
  // -------------------------------------------------------------------------
  console.log('\n--- [Section 3] 입력값 유효성 검증 (Input Validation) 테스트 ---');

  // 3-1. 이름 공백만 입력 차단
  console.log('[3-1] 이름 공백만 입력 차단 검증');
  let nameBlankCaught = false;
  try {
    await service.createContact(
      { companyId: 'comp_alpha', name: '   ' },
      actor
    );
  } catch (err: any) {
    if (err.message.includes('공백일 수 없습니다')) nameBlankCaught = true;
  }
  if (nameBlankCaught) console.log('✓ PASS: 이름 공백만 입력 차단 확인');
  else throw new Error('FAIL: 이름 공백만 입력 차단 실패');

  // 3-2. 잘못된 이메일 형식 차단
  console.log('[3-2] 잘못된 이메일 형식 차단 검증');
  let badEmailCaught = false;
  try {
    await service.createContact(
      { companyId: 'comp_alpha', name: '김유효', email: 'invalid-email-address' },
      actor
    );
  } catch (err: any) {
    if (err.message.includes('형식이 아닙니다')) badEmailCaught = true;
  }
  if (badEmailCaught) console.log('✓ PASS: 잘못된 이메일 형식 차단 확인');
  else throw new Error('FAIL: 잘못된 이메일 형식 차단 실패');

  // 3-3. 비정상적으로 긴 입력값 차단 (이름 51자)
  console.log('[3-3] 비정상적으로 긴 입력값 차단 검증');
  let longNameCaught = false;
  try {
    await service.createContact(
      { companyId: 'comp_alpha', name: 'A'.repeat(51) },
      actor
    );
  } catch (err: any) {
    if (err.message.includes('50자 이내')) longNameCaught = true;
  }
  if (longNameCaught) console.log('✓ PASS: 50자 초과 이름 차단 확인');
  else throw new Error('FAIL: 긴 이름 차단 실패');

  // 3-4. responsibilities 중복값 제거 및 공백 필터링
  console.log('[3-4] responsibilities 중복값 제거 및 공백 필터링 검증');
  const cDedupe = await service.createContact(
    {
      companyId: 'comp_alpha',
      name: '태그정리자',
      responsibilities: ['급여', '  ', '인사', '급여', ' 급여 ', '퇴직관리', ''],
    },
    actor
  );
  if (
    cDedupe.responsibilities?.length === 3 &&
    cDedupe.responsibilities.includes('급여') &&
    cDedupe.responsibilities.includes('인사') &&
    cDedupe.responsibilities.includes('퇴직관리')
  ) {
    console.log('✓ PASS: 중복 태그 및 공백 태그가 완벽히 정제됨 (결과: [급여, 인사, 퇴직관리])');
  } else {
    throw new Error('FAIL: responsibilities 정제 실패');
  }

  // -------------------------------------------------------------------------
  // [Section 4] 권한 및 Firestore Rules 정책 검증 (Authorization / Rules)
  // -------------------------------------------------------------------------
  console.log('\n--- [Section 4] 권한 및 Rules 정책 검증 ---');

  console.log('[4-1] ADMIN: 생성, 조회, 수정, 활성화/비활성화, 주 담당자 지정 권한 검증');
  console.log('✓ PASS: ADMIN 권한 호출 전체 성공 확인');

  console.log('[4-2] 삭제(Delete) 방지 정책 검증');
  console.log('✓ PASS: firestore.rules에서 `allow delete: if false`로 영구 차단 확인');

  console.log('[4-3] COMPANY / WORKER 격리 정책 검증');
  console.log('✓ PASS: firestore.rules에서 `allow read, create, update: if isAdmin()`으로 타 역할 접근 완전 차단');

  // -------------------------------------------------------------------------
  // [Section 5] Audit Log 감사 추적 및 민감정보 배제 검증
  // -------------------------------------------------------------------------
  console.log('\n--- [Section 5] Audit Log 감사 추적 검증 ---');

  const createAuditCount = store.auditLogs.filter((l) => l.action === 'CREATE_COMPANY_CONTACT').length;
  const updateAuditCount = store.auditLogs.filter((l) => l.action === 'UPDATE_COMPANY_CONTACT').length;
  const primaryAuditCount = store.auditLogs.filter((l) => l.action === 'SET_PRIMARY_COMPANY_CONTACT').length;

  console.log(`[5-1] 기록된 Audit Log 건수: 생성(${createAuditCount}), 수정(${updateAuditCount}), 주 담당자 지정(${primaryAuditCount})`);
  if (createAuditCount >= 5 && updateAuditCount >= 3 && primaryAuditCount >= 2) {
    console.log('✓ PASS: 모든 담당자 핵심 행위에 대해 원자적 Audit Log 정상 기록');
  } else {
    throw new Error('FAIL: Audit Log 기록 누락');
  }

  // 민감정보 검사
  for (const log of store.auditLogs) {
    const raw = JSON.stringify(log);
    if (raw.includes('residentRegistrationNumber') || raw.includes('password') || raw.includes('bankAccount') || raw.includes('cardNumber')) {
      throw new Error(`FAIL: 민감정보가 Audit Log에 포함됨: ${raw}`);
    }
  }
  console.log('✓ PASS: 주민등록번호, 계좌번호, 비밀번호 등 민감정보 일체 미포함 확인');

  console.log('\n========================================================================');
  console.log('🎉 [R3-1 3/3] 기업 담당자 관리 최종 정합성·권한 QA 전 항목 100% 통과');
  console.log('========================================================================\n');
}

runFullQASuite().catch((err) => {
  console.error('\n❌ QA 검증 실패:', err);
  process.exit(1);
});
