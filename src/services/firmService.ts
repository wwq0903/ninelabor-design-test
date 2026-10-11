import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { validatePlanDateRange } from '../utils/planDates';
import {
  AuditLog,
  Company,
  CompanySubscription,
  CompanySubscriptionUpdateResult,
  FirmInfo,
  PlanCode,
  SubscriptionStatus,
  UserRole,
  Worker,
} from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreHelper';

// Firm Information Service
export const firmService = {
  async getFirmInfo(): Promise<FirmInfo | null> {
    const docRef = doc(db, 'firm_info', 'main');
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as FirmInfo;
      }
      return null;
    } catch (error: any) {
      // 비로그인 공개 웹사이트 또는 Firestore 권한 미비 시 콘솔 런타임 에러 대신 graceful fallback
      if (
        error?.code === 'permission-denied' ||
        error?.message?.includes('permission') ||
        error?.message?.includes('insufficient')
      ) {
        return null;
      }
      handleFirestoreError(error, OperationType.GET, 'firm_info/main');
    }
  },

  async updateFirmInfo(data: Partial<FirmInfo>): Promise<void> {
    const docRef = doc(db, 'firm_info', 'main');
    try {
      await setDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'firm_info/main');
    }
  },

  // Administrator-only company registration approval. All three records are
  // committed atomically, preventing a half-created tenant or active orphan user.
  async getPendingCompanyRegistrations(): Promise<import('../types').UserProfile[]> {
    const snap = await getDocs(query(
      collection(db, 'users'),
      where('role', '==', 'COMPANY'),
      where('membershipStatus', '==', 'PENDING_COMPANY_VERIFICATION')
    ));
    return snap.docs.map((d) => ({ ...d.data(), uid: d.id } as import('../types').UserProfile));
  },

  async approveCompanyRegistration(userId: string, branchId: 'jeonju' | 'gwangju'): Promise<string> {
    if (!auth.currentUser || !userId || !['jeonju', 'gwangju'].includes(branchId)) {
      throw new Error('관리자 로그인과 지부 선택이 필요합니다.');
    }
    const currentBranch = await this.getCurrentAdminBranchId();
    if (currentBranch !== branchId) throw new Error('다른 지부의 가입을 승인할 수 없습니다.');
    const userRef = doc(db, 'users', userId);
    const companyRef = doc(collection(db, 'companies'));
    const directoryRef = doc(db, 'company_directory', companyRef.id);
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error('가입 신청을 찾을 수 없습니다.');
      const applicant = userSnap.data();
      if (applicant.branchId && applicant.branchId !== branchId) throw new Error('가입 신청 지부가 일치하지 않습니다.');
      if (applicant.role !== 'COMPANY' || applicant.membershipStatus !== 'PENDING_COMPANY_VERIFICATION' || applicant.companyId) {
        throw new Error('이미 처리되었거나 승인 대상이 아닌 신청입니다.');
      }
      const companyName = String(applicant.requestedCompanyName || '').trim();
      const businessNumber = String(applicant.requestedBusinessNumber || '').trim();
      if (!companyName || !businessNumber) throw new Error('기업명 또는 사업자등록번호가 누락되었습니다.');
      transaction.set(companyRef, {
        id: companyRef.id, companyName, businessNumber,
        representativeName: applicant.displayName || '',
        contactEmail: applicant.email || '', contactPhone: applicant.phone || '',
        status: 'active', branchId, representativeUserId: userId,
        createdAt: now, updatedAt: now,
      });
      transaction.set(directoryRef, {
        companyId: companyRef.id, companyName,
        businessNumberMasked: businessNumber.length >= 7 ? `${businessNumber.slice(0, 7)}***` : '***-**-*****',
        createdAt: now,
      });
      transaction.update(userRef, {
        companyId: companyRef.id, companyName, branchId,
        membershipStatus: 'ACTIVE', updatedAt: now,
      });
    });
    return companyRef.id;
  },

  // Company Management (Admin / Company)
  // Public directory search: accesses minimal non-sensitive data in company_directory
  async searchPublicCompanies(term: string): Promise<{ id: string; companyName: string; businessNumberMasked: string }[]> {
    if (!term || term.trim().length === 0) return [];
    const cleanTerm = term.trim().toLowerCase();
    const colRef = collection(db, 'company_directory');
    try {
      const snap = await getDocs(colRef);
      const matches: { id: string; companyName: string; businessNumberMasked: string }[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const cName = (data.companyName || '').toString();
        if (cName.toLowerCase().includes(cleanTerm)) {
          matches.push({
            id: d.id,
            companyName: cName,
            businessNumberMasked: data.businessNumberMasked || '***-**-*****',
          });
        }
      }
      return matches.slice(0, 10);
    } catch (error) {
      console.warn('Company directory search notice:', error);
      return [];
    }
  },

  // Never query the entire cross-branch companies collection. Firestore rules
  // are not filters: queries must include the branch constraint themselves.
  async getCurrentAdminBranchId(): Promise<string> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('관리자 로그인이 필요합니다.');
    const [adminSnap, userSnap] = await Promise.all([
      getDoc(doc(db, 'admins', uid)), getDoc(doc(db, 'users', uid)),
    ]);
    const admin = adminSnap.data();
    if (!adminSnap.exists() || !userSnap.exists() || userSnap.data()?.role !== 'ADMIN' ||
        admin?.active !== true || typeof admin.branchId !== 'string' || !admin.branchId.trim()) {
      throw new Error('활성 관리자 지부 정보가 필요합니다.');
    }
    return admin.branchId;
  },

  async getAllCompanies(): Promise<Company[]> {
    const branchId = await this.getCurrentAdminBranchId();
    const colRef = collection(db, 'companies');
    try {
      const q = query(colRef, where('branchId', '==', branchId), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Company));

      // Asynchronously ensure existing companies are mirrored to company_directory
      this.syncExistingCompaniesToDirectory(list).catch(() => {});

      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'companies');
    }
  },

  async syncExistingCompaniesToDirectory(companies: Company[]): Promise<void> {
    try {
      const dirCol = collection(db, 'company_directory');
      const dirSnap = await getDocs(dirCol);
      const existingDirIds = new Set(dirSnap.docs.map(d => d.id));

      for (const comp of companies) {
        if (!existingDirIds.has(comp.id)) {
          const bn = comp.businessNumber || '';
          const masked = bn.length >= 7 ? `${bn.substring(0, 7)}***` : '***-**-*****';
          const dirRef = doc(db, 'company_directory', comp.id);
          await setDoc(dirRef, sanitizeFirestoreData({
            companyId: comp.id,
            companyName: comp.companyName,
            businessNumberMasked: masked,
            createdAt: comp.createdAt || new Date().toISOString(),
          }));
        }
      }
    } catch (e) {
      console.warn('Directory sync notice:', e);
    }
  },

  async getAssignedCompanies(attorneyUid: string): Promise<Company[]> {
    const branchId = await this.getCurrentAdminBranchId();
    const colRef = collection(db, 'companies');
    try {
      const q = query(colRef, where('branchId', '==', branchId), where('assignedAttorneyId', '==', attorneyUid));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'companies');
    }
  },

  async getCompanyById(companyId: string): Promise<Company | null> {
    if (!companyId) return null;
    const docRef = doc(db, 'companies', companyId);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Company;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `companies/${companyId}`);
    }
  },

  async createCompany(data: Omit<Company, 'id' | 'createdAt' | 'updatedAt'>, customId?: string): Promise<Company> {
    const branchId = await this.getCurrentAdminBranchId();
    if (data.branchId && data.branchId !== branchId) throw new Error('다른 지부 기업을 생성할 수 없습니다.');
    const companyId = customId || doc(collection(db, 'companies')).id;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId)) throw new Error('기업 ID 형식이 올바르지 않습니다.');
    const docRef = doc(db, 'companies', companyId);
    const directoryRef = doc(db, 'company_directory', companyId);
    const now = new Date().toISOString();

    const bn = data.businessNumber || '';
    const masked = bn.length >= 7 ? `${bn.substring(0, 7)}***` : '***-**-*****';

    const newCompany: Company = sanitizeFirestoreData({
      ...data,
      branchId,
      id: companyId,
      createdAt: now,
      updatedAt: now,
    });

    const directoryEntry = sanitizeFirestoreData({
      companyId,
      companyName: data.companyName,
      businessNumberMasked: masked,
      createdAt: now,
    });

    try {
      // The tenant and its public directory entry must commit together.
      // A transaction also rejects an existing custom ID instead of overwriting it.
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(docRef);
        if (existing.exists()) throw new Error('이미 사용 중인 기업 ID입니다.');
        transaction.set(docRef, newCompany);
        transaction.set(directoryRef, directoryEntry);
      });
      return newCompany;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `companies/${companyId}`);
    }
  },

  async updateCompany(companyId: string, data: Partial<Company>): Promise<void> {
    const docRef = doc(db, 'companies', companyId);
    try {
      const sanitized = sanitizeFirestoreData({
        ...data,
        updatedAt: new Date().toISOString(),
      });
      await updateDoc(docRef, sanitized);

      // If companyName or businessNumber changed, mirror to company_directory
      if (data.companyName || data.businessNumber) {
        try {
          const directoryRef = doc(db, 'company_directory', companyId);
          const dirUpdate: Record<string, any> = { updatedAt: new Date().toISOString() };
          if (data.companyName) dirUpdate.companyName = data.companyName;
          if (data.businessNumber) {
            const bn = data.businessNumber;
            dirUpdate.businessNumberMasked = bn.length >= 7 ? `${bn.substring(0, 7)}***` : '***-**-*****';
          }
          await setDoc(directoryRef, dirUpdate, { merge: true });
        } catch (dirErr) {
          console.warn('Directory update notice:', dirErr);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `companies/${companyId}`);
    }
  },

  async deleteCompany(companyId: string): Promise<void> {
    const docRef = doc(db, 'companies', companyId);
    try {
      await deleteDoc(docRef);
      try {
        await deleteDoc(doc(db, 'company_directory', companyId));
      } catch (dirErr) {
        console.warn('Directory delete notice:', dirErr);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `companies/${companyId}`);
    }
  },

  async updateCompanyStatus(companyId: string, status: import('../types').CompanyStatus): Promise<void> {
    return this.updateCompany(companyId, { status });
  },

  // [R2-8 2/4-B-②] 기업 구독 정보 조회 (Source of Truth: companies/{companyId}.subscription)
  async getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
    const company = await this.getCompanyById(companyId);
    return company?.subscription || null;
  },

  // [R2-8 2/4-C-⑩-3] 기업 구독 정보 업데이트 (관리자 직접 변경 트랜잭션 + Audit Log 기록)
  // - runTransaction을 사용하여 companies/{companyId} 문서를 트랜잭션 내부에서 다시 읽고
  //   현재 subscription 값을 확인한 뒤 원자적으로 변경
  // - subscription과 currentPlanId를 항상 동일한 planCode로 원자적으로 갱신
  // - 변경 전(oldSubscription)과 변경 후(newSubscription) 값을 확보하여 결과값으로 반환
  // - 트랜잭션 완료 후 확보한 CompanySubscriptionUpdateResult를 기반으로 Audit Log 기록
  //   (액션: UPDATE_COMPANY_SUBSCRIPTION)
  //   (기록 필드: companyId, oldSubscription, newSubscription, 변경 관리자 UID, 변경 관리자 이름, 변경 시각)
  //   (결제정보 및 민감정보 일체 제외)
  // - 기존 검증 유지 (유효한 planCode, 유효한 status, endDate >= startDate)
  // - 별도의 subscription_history 컬렉션은 생성하지 않음
  async updateCompanySubscription(
    companyId: string,
    subscription: CompanySubscription,
    syncLegacyCurrentPlanId: boolean = true,
    actor?: {
      uid: string;
      name?: string;
      role?: UserRole;
    }
  ): Promise<CompanySubscriptionUpdateResult> {
    const VALID_PLAN_CODES: PlanCode[] = ['FREE', 'BASIC', 'STANDARD', 'CUSTOM', 'OUTSOURCING'];
    const VALID_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED'];

    if (!companyId || !companyId.trim()) {
      throw new Error('회사 고유 식별자(companyId)가 누락되었습니다.');
    }
    if (!subscription || !VALID_PLAN_CODES.includes(subscription.planCode)) {
      throw new Error(`유효하지 않은 플랜 코드입니다: ${subscription?.planCode}`);
    }
    if (!VALID_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      throw new Error(`유효하지 않은 구독 상태입니다: ${subscription?.status}`);
    }
    validatePlanDateRange(subscription.startDate?.trim(), subscription.endDate?.trim());

    const cleanCompanyId = companyId.trim();
    const cleanSubscription: CompanySubscription = {
      planCode: subscription.planCode,
      status: subscription.status,
    };
    if (subscription.startDate && subscription.startDate.trim()) {
      cleanSubscription.startDate = subscription.startDate.trim();
    }
    if (subscription.endDate && subscription.endDate.trim()) {
      cleanSubscription.endDate = subscription.endDate.trim();
    }

    const companyDocRef = doc(db, 'companies', cleanCompanyId);

    try {
      return await runTransaction(db, async (transaction) => {
        // 1. 트랜잭션 내부에서 companies/{companyId} 재조회
        const compSnap = await transaction.get(companyDocRef);
        if (!compSnap.exists()) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${cleanCompanyId}`);
        }

        const compData = compSnap.data() as Company;

        // 2. 변경 전 subscription 확보 (없을 경우 null)
        const oldSubscription: CompanySubscription | null = compData.subscription
          ? { ...compData.subscription }
          : null;

        const now = new Date().toISOString();
        const updatePayload: Record<string, any> = {
          subscription: cleanSubscription,
          updatedAt: now,
        };

        // 3. currentPlanId와 subscription은 항상 동일한 planCode로 원자적 저장
        if (syncLegacyCurrentPlanId) {
          updatePayload.currentPlanId = cleanSubscription.planCode;
        }

        // [R2-8 2/4-C-⑩-4] 관리자 직접 구독 변경 Audit Log 원자적 동시 기록
        // - 같은 트랜잭션 안에서 audit_logs 문서도 생성하여 subscription + currentPlanId 변경과 원자화
        // - 둘 중 하나라도 실패 시 전체 롤백되어 데이터 불일치 및 고아 로그/누락 방지
        // - 결제 정보나 민감 정보는 일체 기록하지 않음
        const actorUid = auth.currentUser?.uid;
        if (!actorUid) throw new Error('플랜 변경에는 관리자 로그인이 필요합니다.');
        if (actor?.uid && actor.uid !== actorUid) throw new Error('관리자 계정 정보가 일치하지 않습니다.');
        const actorName = actor?.name || auth.currentUser?.displayName || '최고관리자';
        if (actor?.role && actor.role !== 'ADMIN') throw new Error('플랜 변경은 관리자만 가능합니다.');
        const actorRole: UserRole = 'ADMIN';

        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const auditDocRef = doc(db, 'audit_logs', logId);

        const auditLogPayload: AuditLog = {
          id: logId,
          actorUserId: actorUid,
          actorRole,
          actorName,
          companyId: cleanCompanyId,
          action: 'UPDATE_COMPANY_SUBSCRIPTION',
          resourceType: 'SUBSCRIPTION',
          resourceId: cleanCompanyId,
          timestamp: now,
          details: {
            companyId: cleanCompanyId,
            oldSubscription,
            newSubscription: cleanSubscription,
            actorUid,
            actorName,
            updatedAt: now,
          },
        };

        // 4. 원자적 동시 쓰기 (companies 갱신 + audit_logs 생성)
        transaction.update(companyDocRef, sanitizeFirestoreData(updatePayload));
        transaction.set(auditDocRef, sanitizeFirestoreData(auditLogPayload));

        // 5. oldSubscription 및 newSubscription 명확히 확보하여 반환
        return {
          companyId: cleanCompanyId,
          oldSubscription,
          newSubscription: cleanSubscription,
          updatedAt: now,
        };
      });
    } catch (error: any) {
      if (
        error instanceof Error &&
        (error.message.includes('유효하지 않은') ||
          error.message.includes('종료일은 시작일보다') ||
          error.message.includes('대상 기업을 찾을 수 없습니다') ||
          error.message.includes('누락되었습니다'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `companies/${cleanCompanyId}`);
      throw error;
    }
  },

  async assignAttorneyToCompany(companyId: string, assignedAttorneyId?: string): Promise<void> {
    return this.updateCompany(companyId, { assignedAttorneyId: assignedAttorneyId || '' });
  },

  // Worker Management (Tenant Isolated strictly by companyId)
  async getAllWorkers(): Promise<Worker[]> {
    const colRef = collection(db, 'workers');
    try {
      const snap = await getDocs(colRef);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'workers');
    }
  },

  async getWorkersByCompany(companyId: string): Promise<Worker[]> {
    if (!companyId) return [];
    const colRef = collection(db, 'workers');
    try {
      const q = query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `workers?companyId=${companyId}`);
    }
  },

  async getWorkerById(workerId: string): Promise<Worker | null> {
    if (!workerId) return null;
    const docRef = doc(db, 'workers', workerId);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Worker;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `workers/${workerId}`);
    }
  },

  async getWorkerByUserId(userId: string): Promise<Worker | null> {
    if (!userId) return null;
    const colRef = collection(db, 'workers');
    try {
      const q = query(colRef, where('userId', '==', userId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as Worker;
      }
      return null;
    } catch (error) {
      console.warn('getWorkerByUserId fetch note:', error);
      return null;
    }
  },

  async createWorker(workerData: Omit<Worker, 'id' | 'createdAt' | 'updatedAt'>): Promise<Worker> {
    const workerId = `wrk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'workers', workerId);
    const now = new Date().toISOString();
    const newWorker: Worker = sanitizeFirestoreData({
      ...workerData,
      id: workerId,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await setDoc(docRef, newWorker);
      return newWorker;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workers/${workerId}`);
    }
  },

  async updateWorker(workerId: string, data: Partial<Worker>): Promise<void> {
    const docRef = doc(db, 'workers', workerId);
    try {
      const sanitized = sanitizeFirestoreData({
        ...data,
        updatedAt: new Date().toISOString(),
      });
      await updateDoc(docRef, sanitized);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workers/${workerId}`);
    }
  },

  async deleteWorker(workerId: string): Promise<void> {
    const docRef = doc(db, 'workers', workerId);
    try {
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `workers/${workerId}`);
    }
  },

  async getPendingAffiliationWorkers(): Promise<import('../types').UserProfile[]> {
    const colRef = collection(db, 'users');
    try {
      const q = query(
        colRef,
        where('role', '==', 'WORKER'),
        where('membershipStatus', '==', 'PENDING_COMPANY_VERIFICATION')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as import('../types').UserProfile));
    } catch (error) {
      console.warn('Pending workers fetch note:', error);
      return [];
    }
  },

  async getPendingWorkersByCompany(companyId: string): Promise<import('../types').UserProfile[]> {
    if (!companyId) return [];
    const colRef = collection(db, 'users');
    try {
      const q = query(
        colRef,
        where('role', '==', 'WORKER'),
        where('membershipStatus', '==', 'PENDING_COMPANY_VERIFICATION'),
        where('requestedCompanyId', '==', companyId)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as import('../types').UserProfile));
    } catch (error) {
      console.warn('Pending workers by company fetch note:', error);
      return [];
    }
  },

  async approveWorkerAffiliation(
    userId: string,
    requestedCompanyId: string,
    workerInfo: {
      name: string;
      email?: string;
      phone?: string;
      department?: string;
      position?: string;
      joinDate?: string;
    }
  ): Promise<Worker | undefined> {
    const now = new Date().toISOString();
    const company = await this.getCompanyById(requestedCompanyId);
    const companyName = company?.companyName || '';

    // Check if worker document already exists for this userId
    let worker = await this.getWorkerByUserId(userId);

    if (worker) {
      // Update existing worker record
      await this.updateWorker(worker.id, {
        companyId: requestedCompanyId,
        name: workerInfo.name || worker.name,
        email: workerInfo.email || worker.email,
        phone: workerInfo.phone || worker.phone,
        department: workerInfo.department || worker.department || '미배정',
        position: workerInfo.position || worker.position || '사원',
        joinDate: workerInfo.joinDate || worker.joinDate || now.split('T')[0],
        status: 'active',
        updatedAt: now,
      });
      worker = {
        ...worker,
        companyId: requestedCompanyId,
        status: 'active',
        updatedAt: now,
      };
    } else {
      // Create new worker record
      worker = await this.createWorker({
        companyId: requestedCompanyId,
        userId,
        name: workerInfo.name,
        email: workerInfo.email || '',
        phone: workerInfo.phone || '',
        department: workerInfo.department || '미배정',
        position: workerInfo.position || '사원',
        status: 'active',
        joinDate: workerInfo.joinDate || now.split('T')[0],
      });
    }

    if (worker) {
      const userDocRef = doc(db, 'users', userId);
      try {
        await updateDoc(userDocRef, {
          companyId: requestedCompanyId,
          companyName,
          employeeId: worker.id,
          membershipStatus: 'ACTIVE',
          membershipType: 'COMPANY_AFFILIATED',
          workerStatus: 'active',
          updatedAt: now,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      }
    }
    return worker;
  },

  async rejectWorkerAffiliation(userId: string, reason?: string): Promise<void> {
    const userDocRef = doc(db, 'users', userId);
    try {
      await updateDoc(userDocRef, {
        membershipStatus: 'REJECTED',
        companyId: null,
        employeeId: null,
        rejectionReason: reason || '관리자에 의해 소속 신청이 반려되었습니다.',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  },

  // Update worker full details (both workers doc and users doc if linked)
  async updateWorkerFull(
    workerId: string,
    workerData: Partial<Worker>,
    userId?: string,
    userData?: Partial<import('../types').UserProfile>
  ): Promise<void> {
    const now = new Date().toISOString();
    const workerDocRef = doc(db, 'workers', workerId);
    const sanitizedWorker = sanitizeFirestoreData({
      ...workerData,
      updatedAt: now,
    });
    await updateDoc(workerDocRef, sanitizedWorker);

    if (userId) {
      const userDocRef = doc(db, 'users', userId);
      try {
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const sanitizedUser = sanitizeFirestoreData({
            ...userData,
            updatedAt: now,
          });
          await updateDoc(userDocRef, sanitizedUser);
        }
      } catch (e) {
        console.warn('User profile sync note on worker update:', e);
      }
    }
  },

  // Change worker's company affiliation (Requirement 6, 7)
  // Safely updates only current affiliation without altering historical payrolls/docs
  async changeWorkerCompany(
    workerId: string,
    newCompanyId: string,
    newCompanyName: string,
    userId?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const workerDocRef = doc(db, 'workers', workerId);
    await updateDoc(workerDocRef, {
      companyId: newCompanyId,
      updatedAt: now,
    });

    if (userId) {
      const userDocRef = doc(db, 'users', userId);
      try {
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          await updateDoc(userDocRef, {
            companyId: newCompanyId,
            companyName: newCompanyName,
            updatedAt: now,
          });
        }
      } catch (e) {
        console.warn('User profile sync note on company change:', e);
      }
    }
  },

  // Terminate worker (Requirement 8)
  // Keeps user account and historical documents, records resigned status and date
  async terminateWorker(
    workerId: string,
    resignedDate: string,
    userId?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const workerDocRef = doc(db, 'workers', workerId);
    await updateDoc(workerDocRef, {
      status: 'resigned',
      resignedDate,
      updatedAt: now,
    });

    if (userId) {
      const userDocRef = doc(db, 'users', userId);
      try {
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          await updateDoc(userDocRef, {
            workerStatus: 'resigned',
            resignedDate,
            updatedAt: now,
          });
        }
      } catch (e) {
        console.warn('User profile sync note on worker termination:', e);
      }
    }
  },

  // Inquiry Operations (Isolated by Tenant / RBAC)
  async getAllInquiries(): Promise<import('../types').Inquiry[]> {
    const colRef = collection(db, 'inquiries');
    try {
      let snap;
      try {
        const q = query(colRef, orderBy('createdAt', 'desc'));
        snap = await getDocs(q);
      } catch (orderErr) {
        console.warn('getAllInquiries orderBy fallback:', orderErr);
        snap = await getDocs(colRef);
      }
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').Inquiry));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'inquiries');
    }
  },

  async getInquiryById(inquiryId: string): Promise<import('../types').Inquiry | null> {
    if (!inquiryId || !inquiryId.trim()) return null;
    const docRef = doc(db, 'inquiries', inquiryId.trim());
    try {
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as import('../types').Inquiry;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `inquiries/${inquiryId}`);
      return null;
    }
  },

  async getInquiriesByCompany(companyId: string): Promise<import('../types').Inquiry[]> {
    if (!companyId || typeof companyId !== 'string' || !companyId.trim()) return [];
    const colRef = collection(db, 'inquiries');
    try {
      const q = query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').Inquiry));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `inquiries?companyId=${companyId}`);
    }
  },

  async getInquiriesByAttorney(attorneyUid: string): Promise<import('../types').Inquiry[]> {
    if (!attorneyUid || typeof attorneyUid !== 'string' || !attorneyUid.trim()) return [];
    const colRef = collection(db, 'inquiries');
    try {
      const q = query(colRef, where('assignedAttorneyId', '==', attorneyUid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').Inquiry));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `inquiries?attorneyUid=${attorneyUid}`);
    }
  },

  async getInquiriesByRequester(requesterId: string): Promise<import('../types').Inquiry[]> {
    if (!requesterId || typeof requesterId !== 'string' || !requesterId.trim()) return [];
    const colRef = collection(db, 'inquiries');
    try {
      const q = query(colRef, where('requesterId', '==', requesterId));
      let snap = await getDocs(q);
      if (snap.empty) {
        const fallbackQ = query(colRef, where('authorId', '==', requesterId));
        snap = await getDocs(fallbackQ);
      }
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').Inquiry));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `inquiries?requesterId=${requesterId}`);
    }
  },

  async getInquiriesByAuthor(authorId: string): Promise<import('../types').Inquiry[]> {
    return this.getInquiriesByRequester(authorId);
  },

  async createInquiry(data: Omit<import('../types').Inquiry, 'id' | 'createdAt' | 'updatedAt'>): Promise<import('../types').Inquiry> {
    const inquiryId = `inq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'inquiries', inquiryId);
    const now = new Date().toISOString();
    const newInquiry: import('../types').Inquiry = {
      ...data,
      id: inquiryId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await setDoc(docRef, newInquiry);
      return newInquiry;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `inquiries/${inquiryId}`);
    }
  },

  async updateInquiry(inquiryId: string, data: Partial<import('../types').Inquiry>): Promise<void> {
    const docRef = doc(db, 'inquiries', inquiryId);
    try {
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inquiries/${inquiryId}`);
    }
  },

  /**
   * [R2-5 1/3-C-2-①] 문의 원문(title, content) 수정
   * - COMPANY / 비소속 개인 WORKER 전용
   * - status == 'RECEIVED' && ADMIN 답변(answer)이 없는 경우에만 수정 허용
   * - 불변 필드(status, answer, requesterId 등)를 보호하고 오직 title, content, updatedAt 만 전달
   */
  async editInquiryContent(
    inquiryId: string,
    params: {
      title: string;
      content: string;
    }
  ): Promise<void> {
    const { title, content } = params;
    if (!inquiryId || !title.trim() || !content.trim()) {
      throw new Error('제목과 문의 내용을 모두 입력해주세요.');
    }
    const docRef = doc(db, 'inquiries', inquiryId);
    try {
      await updateDoc(docRef, {
        title: title.trim(),
        content: content.trim(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inquiries/${inquiryId}`);
    }
  },

  async saveInquiryAnswer(
    inquiryId: string,
    answer: string,
    adminUid: string,
    adminName: string
  ): Promise<void> {
    if (!inquiryId || !answer.trim()) {
      throw new Error('답변 내용이 비어있습니다.');
    }
    const now = new Date().toISOString();
    await this.updateInquiry(inquiryId, {
      answer: answer.trim(),
      answeredAt: now,
      answeredById: adminUid,
      answeredByName: adminName,
      status: 'ANSWERED',
      reply: answer.trim(),
      replyAuthorName: adminName,
    });
  },

  async updateInquiryStatus(inquiryId: string, status: import('../types').InquiryStatus): Promise<void> {
    if (!inquiryId) return;
    await this.updateInquiry(inquiryId, {
      status,
    });
  },

  // Maternity Protection Operations
  async getAllMaternityCases(): Promise<import('../types').MaternityCase[]> {
    const colRef = collection(db, 'maternity_cases');
    try {
      let snap;
      try {
        const q = query(colRef, orderBy('createdAt', 'desc'));
        snap = await getDocs(q);
      } catch (orderErr) {
        console.warn('getAllMaternityCases orderBy fallback to collection getDocs:', orderErr);
        snap = await getDocs(colRef);
      }
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').MaternityCase));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'maternity_cases');
    }
  },

  async getMaternityCaseById(caseId: string): Promise<import('../types').MaternityCase | null> {
    if (!caseId || !caseId.trim()) return null;
    const docRef = doc(db, 'maternity_cases', caseId.trim());
    try {
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as import('../types').MaternityCase;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `maternity_cases/${caseId}`);
      return null;
    }
  },

  async getMaternityCasesByCompany(companyId: string): Promise<import('../types').MaternityCase[]> {
    if (!companyId || typeof companyId !== 'string' || !companyId.trim()) return [];
    const colRef = collection(db, 'maternity_cases');
    try {
      const q = query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => {
        const data = d.data();
        // Strict Data Isolation: COMPANY must never receive internalNotes in raw or parsed payload
        delete data.internalNotes;
        return { id: d.id, ...data } as import('../types').MaternityCase;
      });
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `maternity_cases?companyId=${companyId}`);
    }
  },

  async getMaternityCasesByAttorney(attorneyUid: string): Promise<import('../types').MaternityCase[]> {
    if (!attorneyUid || typeof attorneyUid !== 'string' || !attorneyUid.trim()) return [];
    const colRef = collection(db, 'maternity_cases');
    try {
      const q = query(colRef, where('assignedAttorneyId', '==', attorneyUid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').MaternityCase));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `maternity_cases?attorneyUid=${attorneyUid}`);
    }
  },

  async getMaternityCasesByEmployee(employeeId: string): Promise<import('../types').MaternityCase[]> {
    if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) return [];
    const colRef = collection(db, 'maternity_cases');
    try {
      const q = query(colRef, where('employeeId', '==', employeeId));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => {
        const data = d.data();
        // Strict Data Isolation: WORKER must never receive internalNotes in raw or parsed payload
        delete data.internalNotes;
        return { id: d.id, ...data } as import('../types').MaternityCase;
      });
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `maternity_cases?employeeId=${employeeId}`);
    }
  },

  // Confidential Admin-Only Private Notes for Maternity Cases
  async getMaternityCasePrivate(caseId: string): Promise<import('../types').MaternityCasePrivate | null> {
    if (!caseId) return null;
    const docRef = doc(db, 'maternity_case_private', caseId);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as import('../types').MaternityCasePrivate;
      }
      return null;
    } catch (error) {
      console.warn('getMaternityCasePrivate read failure or not found:', error);
      return null;
    }
  },

  async saveMaternityCasePrivate(caseId: string, internalNotes: string, updatedById: string): Promise<void> {
    if (!caseId) return;
    const docRef = doc(db, 'maternity_case_private', caseId);
    const now = new Date().toISOString();
    try {
      await setDoc(docRef, {
        caseId,
        internalNotes,
        updatedAt: now,
        updatedById,
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `maternity_case_private/${caseId}`);
    }
  },

  async migrateLegacyInternalNotes(caseId: string, legacyNotes: string, updatedById: string): Promise<void> {
    if (!caseId || !legacyNotes) return;
    try {
      // 1. Ensure private document exists with the legacy notes
      const existing = await this.getMaternityCasePrivate(caseId);
      if (!existing || !existing.internalNotes) {
        await this.saveMaternityCasePrivate(caseId, legacyNotes, updatedById);
      }
      // 2. Remove internalNotes from the public maternity_cases document permanently
      const publicDocRef = doc(db, 'maternity_cases', caseId);
      await updateDoc(publicDocRef, {
        internalNotes: deleteField(),
      });
    } catch (error) {
      console.warn(`Migration of internalNotes for ${caseId} skipped or failed:`, error);
    }
  },

  async createMaternityCase(
    data: Omit<import('../types').MaternityCase, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<import('../types').MaternityCase> {
    const caseId = `mat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'maternity_cases', caseId);
    const now = new Date().toISOString();

    const notesToSave = data.internalNotes;
    const caseData = { ...data };
    delete caseData.internalNotes;

    const newCase: import('../types').MaternityCase = {
      ...caseData,
      id: caseId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await setDoc(docRef, newCase);

      // Save internalNotes strictly to maternity_case_private (ADMIN isolated)
      if (notesToSave && notesToSave.trim()) {
        await this.saveMaternityCasePrivate(caseId, notesToSave.trim(), data.createdById);
      }

      return newCase;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `maternity_cases/${caseId}`);
    }
  },

  async updateMaternityCase(
    caseId: string,
    data: Partial<import('../types').MaternityCase>
  ): Promise<void> {
    const docRef = doc(db, 'maternity_cases', caseId);
    const updatePayload = { ...data };

    // If internalNotes is updated in payload, route it to maternity_case_private
    if ('internalNotes' in updatePayload) {
      if (updatePayload.internalNotes && updatePayload.updatedById) {
        await this.saveMaternityCasePrivate(caseId, updatePayload.internalNotes, updatePayload.updatedById);
      }
      // Remove internalNotes from public maternity_cases document
      updatePayload.internalNotes = deleteField() as any;
    }

    try {
      await updateDoc(docRef, {
        ...updatePayload,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `maternity_cases/${caseId}`);
    }
  },

  // [R2-8 2/4-A-⑥-9 & ⑥-10] 상태 전이(UNDER_REVIEW, IN_PROGRESS, SUPPLEMENT_REQUESTED)와 모성보호 차감 단일 원자적 트랜잭션 실행
  async transitionMaternityCaseStatusWithDeduction(params: {
    caseId: string;
    targetCompanyId: string;
    targetStatus: import('../types').MaternityStatus;
    currentUser: { uid: string; getIdToken?: () => Promise<string> };
    callerRole: import('../types').UserRole;
    callerDisplayName?: string;
    newHistoryItem: import('../types').MaternityCaseHistoryItem;
    extraCaseUpdates?: Partial<import('../types').MaternityCase>;
    notes?: string;
    assignedAttorneyId?: string;
  }): Promise<import('../types').MaternityDeductionTransactionResult> {
    const {
      caseId,
      targetCompanyId,
      targetStatus,
      currentUser,
      callerRole,
      callerDisplayName,
      newHistoryItem,
      extraCaseUpdates,
      notes,
      assignedAttorneyId,
    } = params;

    // 1. 서버 Firestore Admin 트랜잭션 API 엔드포인트 호출 시도
    let token = '';
    if (currentUser?.getIdToken) {
      try {
        token = await currentUser.getIdToken();
      } catch (tokenErr) {
        console.warn('Failed to retrieve ID token:', tokenErr);
      }
    }

    if (token) {
      try {
        const response = await fetch(`/api/admin/maternity-cases/${caseId}/status-transition`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            targetCompanyId,
            targetStatus,
            statusChangeHistoryItem: newHistoryItem,
            extraCaseUpdates,
            allowSkipIfAlreadyDeducted: true,
            notes,
            assignedAttorneyId,
          }),
        });

        if (response.ok) {
          const resData = await response.json();
          return resData as import('../types').MaternityDeductionTransactionResult;
        }

        const errData = await response.json().catch(() => ({}));
        // 업무 판정 실패 (QUOTA_EXHAUSTED, ALREADY_DEDUCTED 등): 명확한 에러를 throw하여 상태 변경 차단
        if (response.status === 400 || response.status === 403 || response.status === 401) {
          throw new Error(errData.message || errData.error || '모성보호 상태 전이 차감에 실패했습니다.');
        }

        // 503 (FIREBASE_SERVICE_ACCOUNT_KEY 미설정 등): 클라이언트 Firestore Transaction으로 원자적 폴백
        if (response.status !== 503) {
          throw new Error(errData.message || '서버 오류로 모성보호 상태 전이 차감에 실패했습니다.');
        }
      } catch (fetchErr: any) {
        // 비즈니스 로직 거부(QUOTA_EXHAUSTED 등)는 그대로 전파하여 중단
        if (
          fetchErr.message &&
          !fetchErr.message.includes('503') &&
          !fetchErr.message.includes('Failed to fetch') &&
          !fetchErr.message.includes('NetworkError')
        ) {
          throw fetchErr;
        }
        // 서버 키 미설정 환경에서는 아래의 클라이언트 Firestore Transaction으로 원자적 폴백 진행
      }
    }

    // 2. Client-side Firestore Transaction (ADMIN 권한으로 원자적 차감 + 상태 전이 실행)
    const {
      MATERNITY_DEDUCTIONS_COLLECTION,
      buildDeductionLedgerDocId,
      createDeductionLedgerPayload,
      evaluateMaternityDeductionEligibility,
    } = await import('./maternityUsageService');
    const { getPlan, MATERNITY_QUOTA_POLICY } = await import('../config/plans');

    return await runTransaction(db, async (transaction) => {
      const caseDocRef = doc(db, 'maternity_cases', caseId);
      const caseSnap = await transaction.get(caseDocRef);
      if (!caseSnap.exists()) {
        throw new Error(`대상 사건(${caseId})을 찾을 수 없습니다.`);
      }
      const caseData = caseSnap.data() as import('../types').MaternityCase;

      if (caseData.companyId !== targetCompanyId) {
        throw new Error('사건의 소속 기업과 요청 기업 ID가 일치하지 않습니다. (데이터 격리 위반)');
      }

      // 이미 deductionInfo가 존재하는 사건인 경우: 재차감 없이 상태만 업데이트
      if (caseData.deductionInfo && caseData.deductionInfo.deductionId) {
        const now = new Date().toISOString();
        const existingHist = Array.isArray(caseData.history) ? caseData.history : [];
        const caseUpdatePayload: Record<string, any> = {
          status: targetStatus,
          history: [...existingHist, newHistoryItem],
          updatedAt: now,
          updatedById: currentUser.uid,
          ...(assignedAttorneyId ? { assignedAttorneyId } : {}),
          ...(extraCaseUpdates || {}),
        };
        transaction.update(caseDocRef, sanitizeFirestoreData(caseUpdatePayload));

        return {
          success: true,
          deductionId: caseData.deductionInfo.deductionId,
          caseId,
          companyId: targetCompanyId,
          source: caseData.deductionInfo.source,
          yearMonth: caseData.deductionInfo.yearMonth,
          deductedAt: caseData.deductionInfo.deductedAt,
          remainingMonthlyFree: 0,
          remainingPurchasedTickets: 0,
          totalRemaining: 0,
          ledgerItem: null as any,
          caseDeductionInfo: caseData.deductionInfo,
          targetStatus,
          alreadyDeducted: true,
        };
      }

      const ledgerDocId = buildDeductionLedgerDocId(targetCompanyId, caseId);
      const ledgerDocRef = doc(db, MATERNITY_DEDUCTIONS_COLLECTION, ledgerDocId);
      const ledgerSnap = await transaction.get(ledgerDocRef);
      if (ledgerSnap.exists()) {
        const existingL = ledgerSnap.data() as any;
        if (existingL.status === 'DEDUCTED') {
          throw new Error('동일 사건에 대한 차감 원장이 이미 존재합니다. (중복 차감 차단)');
        }
      }

      const companyDocRef = doc(db, 'companies', targetCompanyId);
      const companySnap = await transaction.get(companyDocRef);
      if (!companySnap.exists()) {
        throw new Error(`기업 정보(${targetCompanyId})를 찾을 수 없습니다.`);
      }
      const companyData = companySnap.data() as import('../types').Company;

      // [R2-8 2/4-C-⑨-3] 실제 업무 착수 시점 확정 (사건 신청일 배제, 실제 업무 착수 시점 기준)
      const workStartTimestamp = newHistoryItem?.timestamp || new Date().toISOString();
      const workStartReferenceDate = workStartTimestamp.slice(0, 10);
      const resolvedYearMonth = workStartReferenceDate.slice(0, 7);

      // 당월 사용 건수 집계 (이중 집계 방지)
      const deductionsCol = collection(db, MATERNITY_DEDUCTIONS_COLLECTION);
      const dSnap = await getDocs(
        query(deductionsCol, where('companyId', '==', targetCompanyId), where('yearMonth', '==', resolvedYearMonth))
      );
      const casesCol = collection(db, 'maternity_cases');
      const cSnap = await getDocs(query(casesCol, where('companyId', '==', targetCompanyId)));

      const freeQuotaConsumedCaseIds = new Set<string>();
      for (const dDoc of dSnap.docs) {
        const item = dDoc.data() as any;
        if (item.status === 'DEDUCTED' && item.source === 'MONTHLY_FREE') {
          freeQuotaConsumedCaseIds.add(item.maternityCaseId);
        }
      }
      for (const cDoc of cSnap.docs) {
        const c = cDoc.data() as import('../types').MaternityCase;
        if (c.id === caseId || c.status === 'CANCELLED') continue;
        const cMonth = c.applicationDate?.slice(0, 7) || c.createdAt?.slice(0, 7) || '';
        if (cMonth === resolvedYearMonth && (!c.deductionInfo || !c.deductionInfo.deductionId) && c.status === 'COMPLETED') {
          freeQuotaConsumedCaseIds.add(c.id);
        }
      }

      const currentMonthFreeUsed = freeQuotaConsumedCaseIds.size;
      const currentPurchasedTickets = Math.max(0, companyData.purchasedMaternityTickets || 0);

      // [R2-8 2/4-C-⑨-2 & ⑨-3] 단일 자격 판정 (evaluateMaternityDeductionEligibility 내부에서 1회 수행, 착수일 기준)
      const eligibility = evaluateMaternityDeductionEligibility({
        maternityCase: caseData,
        companyId: targetCompanyId,
        company: companyData,
        subscription: companyData.subscription,
        referenceDateString: workStartReferenceDate,
        targetYearMonth: resolvedYearMonth,
        currentMonthFreeUsed,
        purchasedTicketsRemaining: currentPurchasedTickets,
        existingLedgerItem: ledgerSnap.exists() ? (ledgerSnap.data() as any) : null,
      });

      if (!eligibility.canDeduct || !eligibility.determinedSource) {
        throw new Error(eligibility.reason || '모성보호 이용 횟수가 모두 소진되어 차감할 수 없습니다. (선불 이용권 충전 필요)');
      }

      const determinedSource = eligibility.determinedSource;
      const monthlyFreeQuota = eligibility.monthlyFreeQuota ?? 0;
      const now = new Date().toISOString();

      const { ledgerItem, caseDeductionInfo } = createDeductionLedgerPayload({
        companyId: targetCompanyId,
        maternityCaseId: caseId,
        source: determinedSource,
        yearMonth: resolvedYearMonth,
        actorUid: currentUser.uid,
        actorRole: callerRole,
        actorName: callerDisplayName,
        notes,
      });

      // 1) 차감 원장 기록
      transaction.set(ledgerDocRef, sanitizeFirestoreData(ledgerItem));

      // 2) 사건 문서 원자적 갱신 (상태 + deductionInfo + 이력)
      const existingHist = Array.isArray(caseData.history) ? caseData.history : [];
      const caseUpdatePayload: Record<string, any> = {
        status: targetStatus,
        deductionInfo: caseDeductionInfo,
        history: [...existingHist, newHistoryItem],
        updatedAt: now,
        updatedById: currentUser.uid,
        ...(assignedAttorneyId ? { assignedAttorneyId } : {}),
        ...(extraCaseUpdates || {}),
      };
      transaction.update(caseDocRef, sanitizeFirestoreData(caseUpdatePayload));

      // 3) 회사 문서 갱신
      let newPurchasedTickets = currentPurchasedTickets;
      if (determinedSource === 'PREPAID_TICKET') {
        newPurchasedTickets = Math.max(0, currentPurchasedTickets - 1);
        transaction.update(companyDocRef, {
          purchasedMaternityTickets: newPurchasedTickets,
          lastMaternityDeductionAt: now,
          updatedAt: now,
        });
      } else {
        transaction.update(companyDocRef, {
          lastMaternityDeductionAt: now,
          updatedAt: now,
        });
      }

      const remainingMonthlyFree =
        determinedSource === 'MONTHLY_FREE'
          ? Math.max(0, monthlyFreeQuota - (currentMonthFreeUsed + 1))
          : Math.max(0, monthlyFreeQuota - currentMonthFreeUsed);

      return {
        success: true,
        deductionId: ledgerItem.deductionId,
        caseId,
        companyId: targetCompanyId,
        source: determinedSource,
        yearMonth: resolvedYearMonth,
        deductedAt: now,
        remainingMonthlyFree,
        remainingPurchasedTickets: newPurchasedTickets,
        totalRemaining: remainingMonthlyFree + newPurchasedTickets,
        ledgerItem,
        caseDeductionInfo,
        targetStatus,
        alreadyDeducted: false,
      };
    });
  },

  // [R2-8 2/4-A-⑥-10] 담당 노무사 배정과 모성보호 차감 단일 원자적 트랜잭션 실행
  async assignAttorneyToMaternityCaseWithDeduction(params: {
    caseId: string;
    targetCompanyId: string;
    assignedAttorneyId: string;
    currentUser: { uid: string; getIdToken?: () => Promise<string> };
    callerRole: import('../types').UserRole;
    callerDisplayName?: string;
    notes?: string;
    targetStatus?: import('../types').MaternityStatus;
    extraCaseUpdates?: Partial<import('../types').MaternityCase>;
  }): Promise<import('../types').MaternityDeductionTransactionResult> {
    const {
      caseId,
      targetCompanyId,
      assignedAttorneyId,
      currentUser,
      callerRole,
      callerDisplayName,
      notes,
      targetStatus,
      extraCaseUpdates,
    } = params;

    let token = '';
    if (currentUser?.getIdToken) {
      try {
        token = await currentUser.getIdToken();
      } catch (tokenErr) {
        console.warn('Failed to retrieve ID token:', tokenErr);
      }
    }

    if (token) {
      try {
        const response = await fetch(`/api/admin/maternity-cases/${caseId}/assign-attorney`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            targetCompanyId,
            assignedAttorneyId,
            targetStatus,
            extraCaseUpdates,
            allowSkipIfAlreadyDeducted: true,
            notes,
          }),
        });

        if (response.ok) {
          const resData = await response.json();
          return resData as import('../types').MaternityDeductionTransactionResult;
        }

        const errData = await response.json().catch(() => ({}));
        if (response.status === 400 || response.status === 403 || response.status === 401) {
          throw new Error(errData.message || errData.error || '담당 노무사 배정 차감에 실패했습니다.');
        }

        if (response.status !== 503) {
          throw new Error(errData.message || '서버 오류로 담당 노무사 배정에 실패했습니다.');
        }
      } catch (fetchErr: any) {
        if (
          fetchErr.message &&
          !fetchErr.message.includes('503') &&
          !fetchErr.message.includes('Failed to fetch') &&
          !fetchErr.message.includes('NetworkError')
        ) {
          throw fetchErr;
        }
      }
    }

    // Client-side Firestore Transaction fallback
    const {
      MATERNITY_DEDUCTIONS_COLLECTION,
      buildDeductionLedgerDocId,
      createDeductionLedgerPayload,
      evaluateMaternityDeductionEligibility,
    } = await import('./maternityUsageService');
    const { getPlan, MATERNITY_QUOTA_POLICY } = await import('../config/plans');

    return await runTransaction(db, async (transaction) => {
      const caseDocRef = doc(db, 'maternity_cases', caseId);
      const caseSnap = await transaction.get(caseDocRef);
      if (!caseSnap.exists()) {
        throw new Error(`대상 사건(${caseId})을 찾을 수 없습니다.`);
      }
      const caseData = caseSnap.data() as import('../types').MaternityCase;

      if (caseData.companyId !== targetCompanyId) {
        throw new Error('사건의 소속 기업과 요청 기업 ID가 일치하지 않습니다. (데이터 격리 위반)');
      }

      const now = new Date().toISOString();
      const existingHist = Array.isArray(caseData.history) ? caseData.history : [];
      const historyItem: import('../types').MaternityCaseHistoryItem = {
        action: '담당 노무사 배정',
        previousStatus: caseData.status,
        newStatus: targetStatus || caseData.status,
        timestamp: now,
        actor: callerDisplayName || '관리자',
        actorUid: currentUser.uid,
        notes: notes || `담당 노무사 배정 (${assignedAttorneyId})`,
      };

      // 이미 deductionInfo가 존재하는 사건인 경우: 재차감 없이 담당 노무사만 업데이트
      if (caseData.deductionInfo && caseData.deductionInfo.deductionId) {
        const caseUpdatePayload: Record<string, any> = {
          assignedAttorneyId,
          history: [...existingHist, historyItem],
          updatedAt: now,
          updatedById: currentUser.uid,
          ...(targetStatus ? { status: targetStatus } : {}),
          ...(extraCaseUpdates || {}),
        };
        transaction.update(caseDocRef, sanitizeFirestoreData(caseUpdatePayload));

        return {
          success: true,
          deductionId: caseData.deductionInfo.deductionId,
          caseId,
          companyId: targetCompanyId,
          source: caseData.deductionInfo.source,
          yearMonth: caseData.deductionInfo.yearMonth,
          deductedAt: caseData.deductionInfo.deductedAt,
          remainingMonthlyFree: 0,
          remainingPurchasedTickets: 0,
          totalRemaining: 0,
          ledgerItem: null as any,
          caseDeductionInfo: caseData.deductionInfo,
          targetStatus: targetStatus || caseData.status,
          alreadyDeducted: true,
        };
      }

      const ledgerDocId = buildDeductionLedgerDocId(targetCompanyId, caseId);
      const ledgerDocRef = doc(db, MATERNITY_DEDUCTIONS_COLLECTION, ledgerDocId);
      const ledgerSnap = await transaction.get(ledgerDocRef);
      if (ledgerSnap.exists()) {
        const existingL = ledgerSnap.data() as any;
        if (existingL.status === 'DEDUCTED') {
          throw new Error('동일 사건에 대한 차감 원장이 이미 존재합니다. (중복 차감 차단)');
        }
      }

      const companyDocRef = doc(db, 'companies', targetCompanyId);
      const companySnap = await transaction.get(companyDocRef);
      if (!companySnap.exists()) {
        throw new Error(`기업 정보(${targetCompanyId})를 찾을 수 없습니다.`);
      }
      const companyData = companySnap.data() as import('../types').Company;

      // [R2-8 2/4-C-⑨-3] 담당 노무사 배정 시점 = 실제 업무 착수 시점 (사건 신청일 배제)
      const workStartTimestamp = historyItem?.timestamp || new Date().toISOString();
      const workStartReferenceDate = workStartTimestamp.slice(0, 10);
      const resolvedYearMonth = workStartReferenceDate.slice(0, 7);

      const deductionsCol = collection(db, MATERNITY_DEDUCTIONS_COLLECTION);
      const dSnap = await getDocs(
        query(deductionsCol, where('companyId', '==', targetCompanyId), where('yearMonth', '==', resolvedYearMonth))
      );
      const casesCol = collection(db, 'maternity_cases');
      const cSnap = await getDocs(query(casesCol, where('companyId', '==', targetCompanyId)));

      const freeQuotaConsumedCaseIds = new Set<string>();
      for (const dDoc of dSnap.docs) {
        const item = dDoc.data() as any;
        if (item.status === 'DEDUCTED' && item.source === 'MONTHLY_FREE') {
          freeQuotaConsumedCaseIds.add(item.maternityCaseId);
        }
      }
      for (const cDoc of cSnap.docs) {
        const c = cDoc.data() as import('../types').MaternityCase;
        if (c.id === caseId || c.status === 'CANCELLED') continue;
        const cMonth = c.applicationDate?.slice(0, 7) || c.createdAt?.slice(0, 7) || '';
        if (cMonth === resolvedYearMonth && (!c.deductionInfo || !c.deductionInfo.deductionId) && c.status === 'COMPLETED') {
          freeQuotaConsumedCaseIds.add(c.id);
        }
      }

      const currentMonthFreeUsed = freeQuotaConsumedCaseIds.size;
      const currentPurchasedTickets = Math.max(0, companyData.purchasedMaternityTickets || 0);

      // [R2-8 2/4-C-⑨-2 & ⑨-3] 단일 자격 판정 (evaluateMaternityDeductionEligibility 내부에서 1회 수행, 착수일 기준)
      const eligibility = evaluateMaternityDeductionEligibility({
        maternityCase: caseData,
        companyId: targetCompanyId,
        company: companyData,
        subscription: companyData.subscription,
        referenceDateString: workStartReferenceDate,
        targetYearMonth: resolvedYearMonth,
        currentMonthFreeUsed,
        purchasedTicketsRemaining: currentPurchasedTickets,
        existingLedgerItem: ledgerSnap.exists() ? (ledgerSnap.data() as any) : null,
      });

      if (!eligibility.canDeduct || !eligibility.determinedSource) {
        throw new Error(eligibility.reason || '모성보호 이용 횟수가 모두 소진되어 차감할 수 없습니다. (선불 이용권 충전 필요)');
      }

      const determinedSource = eligibility.determinedSource;
      const monthlyFreeQuota = eligibility.monthlyFreeQuota ?? 0;

      const { ledgerItem, caseDeductionInfo } = createDeductionLedgerPayload({
        companyId: targetCompanyId,
        maternityCaseId: caseId,
        source: determinedSource,
        yearMonth: resolvedYearMonth,
        actorUid: currentUser.uid,
        actorRole: callerRole,
        actorName: callerDisplayName,
        notes,
      });

      // 1) 차감 원장 기록
      transaction.set(ledgerDocRef, sanitizeFirestoreData(ledgerItem));

      // 2) 사건 문서 원자적 갱신 (담당 노무사 + deductionInfo + 이력)
      const caseUpdatePayload: Record<string, any> = {
        assignedAttorneyId,
        deductionInfo: caseDeductionInfo,
        history: [...existingHist, historyItem],
        updatedAt: now,
        updatedById: currentUser.uid,
        ...(targetStatus ? { status: targetStatus } : {}),
        ...(extraCaseUpdates || {}),
      };
      transaction.update(caseDocRef, sanitizeFirestoreData(caseUpdatePayload));

      // 3) 회사 문서 갱신
      let newPurchasedTickets = currentPurchasedTickets;
      if (determinedSource === 'PREPAID_TICKET') {
        newPurchasedTickets = Math.max(0, currentPurchasedTickets - 1);
        transaction.update(companyDocRef, {
          purchasedMaternityTickets: newPurchasedTickets,
          lastMaternityDeductionAt: now,
          updatedAt: now,
        });
      } else {
        transaction.update(companyDocRef, {
          lastMaternityDeductionAt: now,
          updatedAt: now,
        });
      }

      const remainingMonthlyFree =
        determinedSource === 'MONTHLY_FREE'
          ? Math.max(0, monthlyFreeQuota - (currentMonthFreeUsed + 1))
          : Math.max(0, monthlyFreeQuota - currentMonthFreeUsed);

      return {
        success: true,
        deductionId: ledgerItem.deductionId,
        caseId,
        companyId: targetCompanyId,
        source: determinedSource,
        yearMonth: resolvedYearMonth,
        deductedAt: now,
        remainingMonthlyFree,
        remainingPurchasedTickets: newPurchasedTickets,
        totalRemaining: remainingMonthlyFree + newPurchasedTickets,
        ledgerItem,
        caseDeductionInfo,
        targetStatus: targetStatus || caseData.status,
        alreadyDeducted: false,
      };
    });
  },

  async assignAttorneyToMaternityCase(
    caseId: string,
    targetCompanyId: string,
    assignedAttorneyId: string,
    currentUser: { uid: string; getIdToken?: () => Promise<string> },
    callerRole: import('../types').UserRole,
    callerDisplayName?: string,
    notes?: string
  ): Promise<import('../types').MaternityDeductionTransactionResult> {
    return this.assignAttorneyToMaternityCaseWithDeduction({
      caseId,
      targetCompanyId,
      assignedAttorneyId,
      currentUser,
      callerRole,
      callerDisplayName,
      notes,
    });
  },

  // Maternity Documents Operations (R2-4 보안 보완 2/3)
  // 1. ADMIN: 전체 사건의 제출서류 조회
  async getAllMaternityDocuments(): Promise<import('../types').MaternityDocument[]> {
    const colRef = collection(db, 'maternity_documents');
    try {
      let snap;
      try {
        const q = query(colRef, orderBy('createdAt', 'desc'));
        snap = await getDocs(q);
      } catch (orderErr) {
        console.warn('getAllMaternityDocuments orderBy fallback:', orderErr);
        snap = await getDocs(colRef);
      }
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as import('../types').MaternityDocument));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'maternity_documents');
    }
  },

  // 1-B. ADMIN: 특정 사건의 제출서류 조회
  async getMaternityDocumentsByCaseForAdmin(caseId: string): Promise<import('../types').MaternityDocument[]> {
    if (!caseId || typeof caseId !== 'string' || !caseId.trim()) return [];
    const colRef = collection(db, 'maternity_documents');
    try {
      const q = query(colRef, where('caseId', '==', caseId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as import('../types').MaternityDocument));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `maternity_documents?caseId=${caseId}`);
    }
  },

  // 2. COMPANY: 자기 회사 문서만 조회 (companyId 조건 필수 포함, caseId 필터링 옵션 지원)
  async getMaternityDocumentsByCompany(
    companyId: string,
    caseId?: string
  ): Promise<import('../types').MaternityDocument[]> {
    if (!companyId || typeof companyId !== 'string' || !companyId.trim()) return [];
    const colRef = collection(db, 'maternity_documents');
    try {
      const q = caseId
        ? query(colRef, where('companyId', '==', companyId), where('caseId', '==', caseId))
        : query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as import('../types').MaternityDocument));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `maternity_documents?companyId=${companyId}`);
    }
  },

  // 3. WORKER: 본인 사건의 제출서류만 조회 (canonical employeeId 기준)
  async getMaternityDocumentsByEmployee(
    employeeId: string,
    caseId?: string
  ): Promise<import('../types').MaternityDocument[]> {
    if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) return [];
    const colRef = collection(db, 'maternity_documents');
    try {
      const q = caseId
        ? query(colRef, where('employeeId', '==', employeeId), where('caseId', '==', caseId))
        : query(colRef, where('employeeId', '==', employeeId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as import('../types').MaternityDocument));
      return list.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `maternity_documents?employeeId=${employeeId}`);
    }
  },

  // 4. Create Maternity Document
  async createMaternityDocument(
    data: Omit<import('../types').MaternityDocument, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<import('../types').MaternityDocument> {
    const docId = `matdoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'maternity_documents', docId);
    const now = new Date().toISOString();
    const newDoc: import('../types').MaternityDocument = {
      ...data,
      id: docId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await setDoc(docRef, newDoc);
      return newDoc;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `maternity_documents/${docId}`);
    }
  },

  // Administrator User Account Creation
  // SECURITY REQUIREMENT:
  // Must NOT call createUserWithEmailAndPassword() on the client, as that overwrites the logged-in ADMIN session.
  // Other users' Firebase Auth accounts must be created via Firebase Admin SDK or safe server API.
  async adminCreateUserAccount(_params: {
    email: string;
    role: import('../types').UserRole;
    displayName: string;
    companyId?: string;
  }): Promise<never> {
    throw new Error('관리자 회원 생성 서버 기능 설정 필요: 다른 사용자의 Firebase Auth 계정 생성은 Firebase Admin SDK 또는 안전한 서버 API 연동이 필요합니다.');
  },
};
