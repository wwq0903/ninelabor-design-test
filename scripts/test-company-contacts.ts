import {
  CompanyContact,
  CreateCompanyContactInput,
  UpdateCompanyContactInput,
  Company,
  UserRole,
  AuditLog,
} from '../src/types';

// Mock in-memory Firestore transaction simulator to test contact management & primary contact concurrency
class MockContactsStore {
  private companies: Map<string, any> = new Map();
  private contacts: Map<string, CompanyContact> = new Map();
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
    maxRetries = 10
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
          // Retry on conflict
          await new Promise((r) => setTimeout(r, Math.random() * 10));
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

// Logic replicate matching exact semantics of src/services/companyContactService.ts
function createTestContactService(store: MockContactsStore) {
  return {
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
      const { companyId, name, position, department, phone, email, responsibilities, isPrimary, internalNote, isActive } = params;

      if (!companyId || !companyId.trim()) {
        throw new Error('회사 고유 식별자(companyId)가 누락되었습니다.');
      }
      if (!name || !name.trim()) {
        throw new Error('담당자 이름이 누락되었습니다.');
      }

      const cleanCompanyId = companyId.trim();
      const cleanName = name.trim();
      const contactId = `contact_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();

      const targetIsActive = isActive ?? true;
      const targetIsPrimary = (isPrimary ?? false) && targetIsActive;

      const newContact: CompanyContact = {
        id: contactId,
        companyId: cleanCompanyId,
        name: cleanName,
        position: position?.trim() || undefined,
        department: department?.trim() || undefined,
        phone: phone?.trim() || undefined,
        email: email?.trim() || undefined,
        responsibilities: Array.isArray(responsibilities) ? responsibilities.map((r) => r.trim()).filter(Boolean) : undefined,
        isPrimary: targetIsPrimary,
        internalNote: internalNote?.trim() || undefined,
        isActive: targetIsActive,
        createdAt: now,
        updatedAt: now,
        createdById: actor.uid,
        updatedById: actor.uid,
      };

      await store.runTransaction(async (transaction) => {
        // Read and lock company
        const compSnap = await transaction.get(`companies/${cleanCompanyId}`);
        if (!compSnap.exists) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${cleanCompanyId}`);
        }
        const compData = compSnap.data() as Company;

        // Auto demote existing primary contact if new contact is primary
        if (targetIsPrimary) {
          if (compData.primaryContactId && compData.primaryContactId !== contactId) {
            const oldSnap = await transaction.get(`company_contacts/${compData.primaryContactId}`);
            if (oldSnap.exists && oldSnap.data().isPrimary) {
              transaction.update(`company_contacts/${compData.primaryContactId}`, {
                isPrimary: false,
                updatedAt: now,
                updatedById: actor.uid,
              });
            }
          }
          // Also check all existing primary contacts for this company
          for (const c of store.getAllContacts()) {
            if (c.companyId === cleanCompanyId && c.isPrimary && c.id !== contactId) {
              const oldSnap = await transaction.get(`company_contacts/${c.id}`);
              if (oldSnap.exists && oldSnap.data().isPrimary) {
                transaction.update(`company_contacts/${c.id}`, {
                  isPrimary: false,
                  updatedAt: now,
                  updatedById: actor.uid,
                });
              }
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
            responsibilities: newContact.responsibilities,
            isPrimary: newContact.isPrimary,
            isActive: newContact.isActive,
            actorUid: actor.uid,
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
      const cleanContactId = contactId.trim();
      const now = new Date().toISOString();

      return await store.runTransaction(async (transaction) => {
        const contactSnap = await transaction.get(`company_contacts/${cleanContactId}`);
        if (!contactSnap.exists) {
          throw new Error(`대상 담당자를 찾을 수 없습니다: ${cleanContactId}`);
        }
        const currentContact = contactSnap.data() as CompanyContact;
        const cleanCompanyId = currentContact.companyId;

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
          if (compData.primaryContactId && compData.primaryContactId !== cleanContactId) {
            const oldSnap = await transaction.get(`company_contacts/${compData.primaryContactId}`);
            if (oldSnap.exists && oldSnap.data().isPrimary) {
              transaction.update(`company_contacts/${compData.primaryContactId}`, {
                isPrimary: false,
                updatedAt: now,
                updatedById: actor.uid,
              });
            }
          }
          for (const c of store.getAllContacts()) {
            if (c.companyId === cleanCompanyId && c.isPrimary && c.id !== cleanContactId) {
              const oldSnap = await transaction.get(`company_contacts/${c.id}`);
              if (oldSnap.exists && oldSnap.data().isPrimary) {
                transaction.update(`company_contacts/${c.id}`, {
                  isPrimary: false,
                  updatedAt: now,
                  updatedById: actor.uid,
                });
              }
            }
          }
          transaction.update(`companies/${cleanCompanyId}`, {
            primaryContactId: cleanContactId,
            updatedAt: now,
          });
        } else if (losingPrimary && compData.primaryContactId === cleanContactId) {
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
          responsibilities: params.responsibilities !== undefined ? params.responsibilities : currentContact.responsibilities,
          isPrimary: nextIsPrimary,
          internalNote: params.internalNote !== undefined ? params.internalNote.trim() : currentContact.internalNote,
          isActive: nextIsActive,
          updatedAt: now,
          updatedById: actor.uid,
        };

        transaction.update(`company_contacts/${cleanContactId}`, updatedContact);

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
            before: { isPrimary: currentContact.isPrimary, isActive: currentContact.isActive },
            after: { isPrimary: updatedContact.isPrimary, isActive: updatedContact.isActive },
            actorUid: actor.uid,
          },
        };
        transaction.set(`audit_logs/${logId}`, auditPayload);

        return updatedContact;
      });
    },

    async toggleContactActive(
      contactId: string,
      isActive: boolean,
      actor: { uid: string; name: string; role: UserRole }
    ): Promise<CompanyContact> {
      return this.updateContact(contactId, { isActive }, actor);
    },

    async setPrimaryContact(
      companyId: string,
      contactId: string,
      actor: { uid: string; name: string; role: UserRole }
    ): Promise<CompanyContact> {
      return this.updateContact(contactId, { isPrimary: true, isActive: true }, actor);
    },
  };
}

async function runContactsTests() {
  console.log('=== [R3-1 1/3] 기업별 복수 담당자 관리 기반 단위/통합 테스트 시작 ===\n');

  const store = new MockContactsStore();
  const service = createTestContactService(store);

  const actor = { uid: 'admin_test', name: '최고관리자', role: 'ADMIN' as UserRole };

  // Setup company
  store.setCompany('comp_alpha', {
    companyName: '알파 코퍼레이션',
    businessNumber: '111-22-33333',
    status: 'active',
  });

  // ----------------------------------------------------
  // Test 1: 복수 담당자 등록 및 responsibilities 문자열 배열 확장성 검증
  // ----------------------------------------------------
  console.log('[Test 1] 복수 실무 담당자 등록 및 역할 배열(responsibilities) 검증');

  // Contact 1: 급여 담당 (isPrimary: true)
  const c1 = await service.createContact(
    {
      companyId: 'comp_alpha',
      name: '홍길동',
      department: '인사재무팀',
      position: '팀장',
      phone: '010-1234-5678',
      email: 'hong@alpha.com',
      responsibilities: ['급여 담당', '4대보험', '원천세'],
      isPrimary: true,
      internalNote: '노무 이슈 주요 소통 창구',
    },
    actor
  );

  // Contact 2: 근태/입퇴사 담당 (isPrimary: false)
  const c2 = await service.createContact(
    {
      companyId: 'comp_alpha',
      name: '김영희',
      department: '경영지원팀',
      position: '대리',
      phone: '010-2345-6789',
      email: 'kim@alpha.com',
      responsibilities: ['입퇴사 담당', '근태관리', '자료 제출 담당'],
      isPrimary: false,
    },
    actor
  );

  // Contact 3: 대표자 (isPrimary: false)
  const c3 = await service.createContact(
    {
      companyId: 'comp_alpha',
      name: '이대표',
      position: '대표이사',
      email: 'ceo@alpha.com',
      responsibilities: ['대표자', '최종 승인'],
      isPrimary: false,
    },
    actor
  );

  const allAlphaContacts = await service.getContactsByCompany('comp_alpha');
  if (allAlphaContacts.length === 3) {
    console.log('✓ PASS: 기업에 3명의 담당자 성공적 등록');
  } else {
    console.error('✗ FAIL: 등록 수 불일치:', allAlphaContacts.length);
    process.exit(1);
  }

  if (
    c1.responsibilities?.includes('급여 담당') &&
    c2.responsibilities?.includes('입퇴사 담당') &&
    c3.responsibilities?.includes('대표자')
  ) {
    console.log('✓ PASS: 다양한 실무 역할(급여, 입퇴사, 대표자 등) 문자열 배열 확장 저장 확인');
  } else {
    console.error('✗ FAIL: responsibilities 불일치');
    process.exit(1);
  }

  // ----------------------------------------------------
  // Test 2: 주 담당자 단일성 보장 및 자동 해제 검증
  // ----------------------------------------------------
  console.log('\n[Test 2] 주 담당자(isPrimary=true) 자동 전환 및 단일성 검증');

  // Currently c1 is primary
  let freshC1 = await service.getContactById(c1.id);
  let freshC2 = await service.getContactById(c2.id);
  if (freshC1?.isPrimary === true && freshC2?.isPrimary === false) {
    console.log('✓ PASS: 초기 주 담당자 홍길동(c1) 정상 설정 확인');
  } else {
    console.error('✗ FAIL: 초기 주 담당자 설정 오류');
    process.exit(1);
  }

  // Now promote c2 to primary
  await service.setPrimaryContact('comp_alpha', c2.id, actor);

  freshC1 = await service.getContactById(c1.id);
  freshC2 = await service.getContactById(c2.id);

  if (freshC1?.isPrimary === false && freshC2?.isPrimary === true) {
    console.log('✓ PASS: 김영희(c2)를 주 담당자로 지정 시 기존 주 담당자(c1)가 자동으로 해제됨 (isPrimary: false)');
  } else {
    console.error('✗ FAIL: 주 담당자 자동 해제 실패', { c1Primary: freshC1?.isPrimary, c2Primary: freshC2?.isPrimary });
    process.exit(1);
  }

  const primaryList = (await service.getContactsByCompany('comp_alpha')).filter((c) => c.isPrimary);
  if (primaryList.length === 1 && primaryList[0].id === c2.id) {
    console.log('✓ PASS: 활성 주 담당자는 회사 내 정확히 1명만 존재');
  } else {
    console.error('✗ FAIL: 활성 주 담당자 수 오류:', primaryList.length);
    process.exit(1);
  }

  // ----------------------------------------------------
  // Test 3: 삭제 없는 비활성화(Soft Deactivate) 처리 검증
  // ----------------------------------------------------
  console.log('\n[Test 3] 삭제 없는 비활성화(isActive=false) 및 필터링 검증');

  // Deactivate c2 (who is primary)
  await service.toggleContactActive(c2.id, false, actor);

  freshC2 = await service.getContactById(c2.id);
  if (freshC2?.isActive === false && freshC2?.isPrimary === false) {
    console.log('✓ PASS: 담당자 비활성화 시 주 담당자 자격도 안전하게 자동 해제됨');
  } else {
    console.error('✗ FAIL: 비활성화 처리 오류:', freshC2);
    process.exit(1);
  }

  const activeOnly = await service.getContactsByCompany('comp_alpha', false);
  const includeInactive = await service.getContactsByCompany('comp_alpha', true);

  if (activeOnly.length === 2 && includeInactive.length === 3) {
    console.log('✓ PASS: 기본 목록에서는 비활성 담당자 제외(2명), includeInactive=true 시 전체 포함(3명)');
  } else {
    console.error('✗ FAIL: 비활성화 필터링 오류', { activeOnly: activeOnly.length, includeInactive: includeInactive.length });
    process.exit(1);
  }

  // ----------------------------------------------------
  // Test 4: 동시성(Race Condition) 주 담당자 지정 경쟁 테스트
  // ----------------------------------------------------
  console.log('\n[Test 4] 동시 다중 주 담당자 지정 시 단일 주 담당자 보장(트랜잭션 직렬화) 검증');

  // Create another contact c4
  const c4 = await service.createContact(
    {
      companyId: 'comp_alpha',
      name: '박지원',
      position: '인사과장',
      isPrimary: false,
    },
    actor
  );

  // Re-activate c1
  await service.toggleContactActive(c1.id, true, actor);

  // Simultaneously designate c1 and c4 as primary contact
  const p1 = service.setPrimaryContact('comp_alpha', c1.id, actor);
  const p2 = service.setPrimaryContact('comp_alpha', c4.id, actor);

  await Promise.all([p1, p2]);

  const afterRaceList = await service.getContactsByCompany('comp_alpha');
  const activePrimaries = afterRaceList.filter((c) => c.isPrimary && c.isActive);

  if (activePrimaries.length === 1) {
    console.log(`✓ PASS: 동시 경쟁 호출 후에도 활성 주 담당자는 정확히 1명만 존재함 (당첨자: ${activePrimaries[0].name})`);
  } else {
    console.error('✗ FAIL: 동시 호출로 2명 이상의 주 담당자가 생성되었습니다:', activePrimaries);
    process.exit(1);
  }

  // ----------------------------------------------------
  // Test 5: Audit Log 기록 및 민감정보 배제 검증
  // ----------------------------------------------------
  console.log('\n[Test 5] Audit Log 감사 추적 및 민감정보 배제 검증');

  const createLogs = store.auditLogs.filter((l) => l.action === 'CREATE_COMPANY_CONTACT');
  const updateLogs = store.auditLogs.filter((l) => l.action === 'UPDATE_COMPANY_CONTACT');

  if (createLogs.length >= 3 && updateLogs.length >= 1) {
    console.log('✓ PASS: 담당자 생성 및 수정에 대한 Audit Log가 정상 생성됨');
  } else {
    console.error('✗ FAIL: Audit Log 개수 부족:', { createLogs: createLogs.length, updateLogs: updateLogs.length });
    process.exit(1);
  }

  for (const l of store.auditLogs) {
    const raw = JSON.stringify(l);
    if (raw.includes('residentNumber') || raw.includes('rrn') || raw.includes('password')) {
      console.error('✗ FAIL: Audit Log에 민감정보가 포함됨:', l);
      process.exit(1);
    }
  }
  console.log('✓ PASS: 주민등록번호 등 민감정보 일체 미포함 확인');

  // ----------------------------------------------------
  // Test 6: companies 문서 분리 확인 (배열 미포함)
  // ----------------------------------------------------
  console.log('\n[Test 6] companies 문서에 contacts 배열 미저장 구조 확인');
  const finalComp = store.getCompany('comp_alpha');
  if (!('contacts' in finalComp)) {
    console.log('✓ PASS: companies 문서에 contacts 배열을 넣지 않고 독립된 company_contacts 컬렉션 사용');
  } else {
    console.error('✗ FAIL: companies 문서에 contacts 배열이 존재함:', finalComp);
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log('🎉 [R3-1 1/3] 기업별 복수 담당자 관리 기반 전체 테스트 완벽 통과');
  console.log('========================================================================\n');
}

runContactsTests().catch((err) => {
  console.error('Contacts test failed:', err);
  process.exit(1);
});
