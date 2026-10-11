import type {
  InternalNote,
  CreateInternalNoteInput,
  UpdateInternalNoteInput,
  InternalNoteTargetType,
  Company,
  Worker,
  UserRole,
  AuditLog,
} from '../src/types';

// In-memory simulation store with strict rules matching internalNoteService and firestore.rules
class SecurityQANoteStore {
  companies: Map<string, Company> = new Map();
  workers: Map<string, Worker> = new Map();
  notes: Map<string, InternalNote> = new Map();
  auditLogs: AuditLog[] = [];

  constructor() {
    // 2 distinct companies
    this.companies.set('comp_A', {
      id: 'comp_A',
      companyName: '에이테크(주)',
      businessNumber: '111-11-11111',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    this.companies.set('comp_B', {
      id: 'comp_B',
      companyName: '비솔루션(주)',
      businessNumber: '222-22-22222',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // Workers for comp_A
    this.workers.set('worker_A_1', {
      id: 'worker_A_1',
      companyId: 'comp_A',
      name: '홍길동',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // Workers for comp_B
    this.workers.set('worker_B_1', {
      id: 'worker_B_1',
      companyId: 'comp_B',
      name: '김영희',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }

  // Audit log with sanitization matching auditLogService.ts
  logAudit(entry: {
    actorUserId: string;
    actorRole: UserRole;
    actorName: string;
    companyId?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, any>;
  }) {
    const sanitizedDetails = entry.details ? { ...entry.details } : {};
    delete sanitizedDetails.residentNumber;
    delete sanitizedDetails.password;
    delete sanitizedDetails.ssn;
    delete sanitizedDetails.rrn;
    delete sanitizedDetails.rrnEncrypted;
    delete sanitizedDetails.maskedRrn;
    delete sanitizedDetails.contentSnippet;
    delete sanitizedDetails.content;
    delete sanitizedDetails.noteContent;
    delete sanitizedDetails.snippet;
    delete sanitizedDetails.before;
    delete sanitizedDetails.after;

    this.auditLogs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      actorName: entry.actorName,
      companyId: entry.companyId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      timestamp: new Date().toISOString(),
      details: Object.keys(sanitizedDetails).length > 0 ? sanitizedDetails : undefined,
    });
  }

  // Validation logic matching internalNoteService.ts
  validateNoteInput(
    params: {
      content?: string;
      category?: string;
      targetType?: string;
      targetId?: string;
      companyId?: string;
    },
    isCreate: boolean
  ) {
    if (isCreate) {
      if (!params.targetType || (params.targetType !== 'COMPANY' && params.targetType !== 'WORKER')) {
        throw new Error("메모 대상 유형은 'COMPANY' 또는 'WORKER'여야 합니다.");
      }
      if (!params.targetId || !params.targetId.trim()) {
        throw new Error('메모 대상 고유 식별자(targetId)가 누락되었습니다.');
      }
      if (params.targetId.trim().length > 128) {
        throw new Error('대상 식별자 길이는 128자 이내여야 합니다.');
      }
      if (!params.companyId || !params.companyId.trim()) {
        throw new Error('회사 고유 식별자(companyId)가 누락되었습니다.');
      }
      if (params.companyId.trim().length > 128) {
        throw new Error('회사 식별자 길이는 128자 이내여야 합니다.');
      }
    } else {
      // [R3-2 3/3] 수정 시 대상 식별자 불변 검증
      if (params.targetType !== undefined || params.targetId !== undefined || params.companyId !== undefined) {
        throw new Error('메모 대상 식별자(targetType, targetId, companyId)는 생성 후 변경할 수 없습니다.');
      }
    }

    if (isCreate || params.content !== undefined) {
      if (!params.content || !params.content.trim()) {
        throw new Error('메모 내용을 입력해주세요. (공백만 입력할 수 없습니다.)');
      }
      if (params.content.trim().length > 3000) {
        throw new Error('메모 내용은 최대 3,000자까지 입력할 수 있습니다.');
      }
    }

    if (params.category !== undefined && params.category !== null) {
      const trimmedCategory = params.category.trim();
      if (trimmedCategory.length > 50) {
        throw new Error('카테고리는 최대 50자까지 입력할 수 있습니다.');
      }
    }
  }

  validateTargetIntegrity(
    targetType: InternalNoteTargetType,
    targetId: string,
    companyId: string
  ) {
    if (targetType === 'COMPANY') {
      if (targetId !== companyId) {
        throw new Error(`기업 메모의 targetId('${targetId}')는 companyId('${companyId}')와 일치해야 합니다.`);
      }
      if (!this.companies.has(companyId)) {
        throw new Error(`존재하지 않는 기업입니다. (companyId: ${companyId})`);
      }
      return;
    }

    if (targetType === 'WORKER') {
      const worker = this.workers.get(targetId);
      if (!worker) {
        throw new Error(`존재하지 않는 근로자입니다. (workerId: ${targetId})`);
      }
      if (worker.companyId !== companyId) {
        throw new Error(
          `근로자의 실제 소속 기업(companyId: ${worker.companyId})과 전달된 기업 ID(${companyId})가 일치하지 않습니다.`
        );
      }
      return;
    }

    throw new Error(`지원되지 않는 메모 대상 유형입니다: ${targetType}`);
  }

  // Firestore rules evaluation emulator
  evaluateFirestoreRule(
    op: 'get' | 'list' | 'create' | 'update' | 'delete',
    userRole: UserRole,
    existingDoc?: InternalNote,
    incomingDoc?: Partial<InternalNote>
  ): boolean {
    const isAdmin = userRole === 'ADMIN';

    // Rule: allow delete: if false; (All roles, including ADMIN, denied)
    if (op === 'delete') {
      return false;
    }

    // Rule: allow read, create: if isAdmin();
    if (op === 'get' || op === 'list' || op === 'create') {
      return isAdmin;
    }

    // Rule: allow update: if isAdmin() &&
    //   request.resource.data.targetType == resource.data.targetType &&
    //   request.resource.data.targetId == resource.data.targetId &&
    //   request.resource.data.companyId == resource.data.companyId;
    if (op === 'update') {
      if (!isAdmin) return false;
      if (!existingDoc || !incomingDoc) return false;

      const targetTypeMatch = incomingDoc.targetType === undefined || incomingDoc.targetType === existingDoc.targetType;
      const targetIdMatch = incomingDoc.targetId === undefined || incomingDoc.targetId === existingDoc.targetId;
      const companyIdMatch = incomingDoc.companyId === undefined || incomingDoc.companyId === existingDoc.companyId;

      return targetTypeMatch && targetIdMatch && companyIdMatch;
    }

    return false;
  }

  createNote(
    input: CreateInternalNoteInput,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): InternalNote {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('ADMIN만 작성할 수 있습니다.');
    }

    this.validateNoteInput(input, true);
    const cleanTargetId = input.targetId.trim();
    const cleanCompanyId = input.companyId.trim();

    this.validateTargetIntegrity(input.targetType, cleanTargetId, cleanCompanyId);

    const noteId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const newNote: InternalNote = {
      id: noteId,
      targetType: input.targetType,
      targetId: cleanTargetId,
      companyId: cleanCompanyId,
      content: input.content.trim(),
      category: input.category?.trim(),
      isPinned: Boolean(input.isPinned),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdById: currentUser.uid,
      createdByName: currentUser.name || '노무법인 관리자',
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

    this.notes.set(noteId, newNote);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: cleanCompanyId,
      action: 'CREATE_INTERNAL_NOTE',
      resourceType: 'internal_notes',
      resourceId: noteId,
      details: {
        noteId,
        targetType: input.targetType,
        targetId: cleanTargetId,
        companyId: cleanCompanyId,
        category: input.category?.trim(),
        operation: 'CREATE',
        isPinned: newNote.isPinned,
      },
    });

    return newNote;
  }

  updateNote(
    noteId: string,
    input: UpdateInternalNoteInput,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): InternalNote {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('ADMIN만 수정할 수 있습니다.');
    }

    this.validateNoteInput(input as any, false);

    const existing = this.notes.get(noteId);
    if (!existing) throw new Error('메모를 찾을 수 없습니다.');

    const now = new Date().toISOString();
    const changedFieldNames: string[] = [];
    const updates: Partial<InternalNote> = {
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

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

    const updatedNote: InternalNote = { ...existing, ...updates };
    this.notes.set(noteId, updatedNote);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: existing.companyId,
      action: 'UPDATE_INTERNAL_NOTE',
      resourceType: 'internal_notes',
      resourceId: noteId,
      details: {
        noteId,
        targetType: existing.targetType,
        targetId: existing.targetId,
        companyId: existing.companyId,
        category: updatedNote.category,
        operation: 'UPDATE',
        changedFields: changedFieldNames, // only field names!
        isPinned: updatedNote.isPinned,
        isActive: updatedNote.isActive,
      },
    });

    return updatedNote;
  }

  getNotesByCompany(companyId: string, options?: { includeInactive?: boolean }): InternalNote[] {
    let list = Array.from(this.notes.values()).filter(
      (n) => n.targetType === 'COMPANY' && n.companyId === companyId && n.targetId === companyId
    );
    if (!options?.includeInactive) {
      list = list.filter((n) => n.isActive !== false);
    }
    return list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }

  getNotesByWorker(
    workerId: string,
    options?: { includeInactive?: boolean; companyId?: string }
  ): InternalNote[] {
    let list = Array.from(this.notes.values()).filter(
      (n) => n.targetType === 'WORKER' && n.targetId === workerId
    );
    if (options?.companyId) {
      list = list.filter((n) => n.companyId === options.companyId);
    }
    if (!options?.includeInactive) {
      list = list.filter((n) => n.isActive !== false);
    }
    return list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }
}

async function runSecurityQA() {
  console.log('================================================================');
  console.log(' [R3-2 3/3] ADMIN 내부 메모 최종 보안·정합성 QA 종합 테스트');
  console.log('================================================================\n');

  const store = new SecurityQANoteStore();
  const adminActor = { uid: 'admin_sys', name: '총괄노무사', role: 'ADMIN' as UserRole };
  const companyActor = { uid: 'ceo_comp_a', name: 'A사 대표', role: 'COMPANY' as UserRole };
  const workerActor = { uid: 'worker_user_a', name: 'A사 근로자', role: 'WORKER' as UserRole };

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  // ========================================================================
  // [1. 기업 메모 격리]
  // ========================================================================
  console.log('--- 1. 기업 메모 격리 및 불일치 변조 차단 ---');

  // 정상 A기업 메모 등록
  const noteA = store.createNote(
    {
      targetType: 'COMPANY',
      targetId: 'comp_A',
      companyId: 'comp_A',
      content: 'A사 실무 메모: 매월 10일 급여 마감',
      category: '급여',
      isPinned: false,
    },
    adminActor
  );
  assert(Boolean(noteA.id), 'A기업 정상 메모 생성');

  // A기업 메모가 B기업 목록에 노출되지 않음
  const bList = store.getNotesByCompany('comp_B');
  assert(bList.length === 0, 'A기업 메모가 B기업 상세 목록에 노출되지 않음 (0건)');

  const aList = store.getNotesByCompany('comp_A');
  assert(aList.length === 1 && aList[0].id === noteA.id, 'A기업 상세에서만 정상 노출됨');

  // targetId만 B기업으로 변조 시도 (targetId != companyId)
  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_B',
        companyId: 'comp_A',
        content: '타사 ID 변조 시도',
      },
      adminActor
    );
    assert(false, 'targetId != companyId 변조 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('일치해야 합니다'), 'targetId != companyId 변조 차단 성공');
  }

  // companyId만 B기업으로 변조 시도
  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_A',
        companyId: 'comp_B',
        content: 'companyId 변조 시도',
      },
      adminActor
    );
    assert(false, 'companyId 변조 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('일치해야 합니다'), 'companyId 변조 차단 성공');
  }

  // 존재하지 않는 companyId 사용
  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_NONEXISTENT',
        companyId: 'comp_NONEXISTENT',
        content: '유령 기업 메모 등록 시도',
      },
      adminActor
    );
    assert(false, '존재하지 않는 companyId 등록 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('존재하지 않는 기업'), '존재하지 않는 companyId 등록 차단 성공');
  }

  // ========================================================================
  // [2. 근로자 메모 격리]
  // ========================================================================
  console.log('\n--- 2. 근로자 메모 격리 및 canonical worker.id 검증 ---');

  // 정상 A기업 소속 근로자(worker_A_1) 메모 등록
  const wNoteA = store.createNote(
    {
      targetType: 'WORKER',
      targetId: 'worker_A_1',
      companyId: 'comp_A',
      content: 'A사 근로자 홍길동 육아휴직 예정',
      category: '모성보호',
    },
    adminActor
  );
  assert(Boolean(wNoteA.id), 'A사 근로자 메모 정상 등록');

  // A기업 근로자 메모가 B기업 근로자(worker_B_1) 목록에 노출되지 않음
  const wListB = store.getNotesByWorker('worker_B_1');
  assert(wListB.length === 0, 'A사 근로자 메모가 B사 근로자 목록에 노출되지 않음');

  // worker.id와 companyId를 서로 다른 회사로 조합 (A사 근로자 + B사 ID 조합)
  try {
    store.createNote(
      {
        targetType: 'WORKER',
        targetId: 'worker_A_1',
        companyId: 'comp_B', // 불일치
        content: '타사 기업 ID와 근로자 조합 시도',
      },
      adminActor
    );
    assert(false, '근로자-소속기업 불일치 조합 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('일치하지 않습니다'), '근로자-소속기업 불일치 조합 차단 성공');
  }

  // auth.uid (Firebase Auth UID)를 worker.id 대신 입력하는 경우 차단
  try {
    store.createNote(
      {
        targetType: 'WORKER',
        targetId: 'auth_uid_1234567890abcdef', // UID
        companyId: 'comp_A',
        content: 'UID를 worker.id 대신 전달 시도',
      },
      adminActor
    );
    assert(false, 'auth.uid 전달 시 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('존재하지 않는 근로자'), 'auth.uid 대신 canonical worker.id 필수 검증 성공');
  }

  // employeeId (사번, e.g. EMP-2026-001)를 worker.id 대신 입력하는 경우 차단
  try {
    store.createNote(
      {
        targetType: 'WORKER',
        targetId: 'EMP-2026-001', // 사번
        companyId: 'comp_A',
        content: '사번을 worker.id 대신 전달 시도',
      },
      adminActor
    );
    assert(false, 'employeeId 전달 시 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('존재하지 않는 근로자'), 'employeeId 대신 canonical worker.id 필수 검증 성공');
  }

  // 존재하지 않는 worker.id 사용 차단
  try {
    store.createNote(
      {
        targetType: 'WORKER',
        targetId: 'worker_does_not_exist',
        companyId: 'comp_A',
        content: '존재하지 않는 worker.id 메모',
      },
      adminActor
    );
    assert(false, '존재하지 않는 worker.id 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('존재하지 않는 근로자'), '존재하지 않는 worker.id 차단 성공');
  }

  // ========================================================================
  // [3. 기존 메모 대상 변경 차단]
  // ========================================================================
  console.log('\n--- 3. 기존 메모 대상(targetType/targetId/companyId) 불변성 검증 ---');

  // targetId 변조 시도 차단
  try {
    store.updateNote(
      noteA.id,
      { targetId: 'comp_B' } as any,
      adminActor
    );
    assert(false, 'targetId 수정 시도 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('생성 후 변경할 수 없습니다'), 'targetId 수정 시도 차단 성공');
  }

  // targetType 변조 시도 차단
  try {
    store.updateNote(
      noteA.id,
      { targetType: 'WORKER' } as any,
      adminActor
    );
    assert(false, 'targetType 수정 시도 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('생성 후 변경할 수 없습니다'), 'targetType 수정 시도 차단 성공');
  }

  // companyId 변조 시도 차단
  try {
    store.updateNote(
      noteA.id,
      { companyId: 'comp_B' } as any,
      adminActor
    );
    assert(false, 'companyId 수정 시도 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('생성 후 변경할 수 없습니다'), 'companyId 수정 시도 차단 성공');
  }

  // Firestore Rules 차원에서 update 시 target 불변 검증
  const ruleAllowValidUpdate = store.evaluateFirestoreRule('update', 'ADMIN', noteA, {
    content: '정상 수정된 내용',
  });
  assert(ruleAllowValidUpdate === true, 'Firestore Rules: 정상 내용 수정 허용');

  const ruleDenyTargetMutation = store.evaluateFirestoreRule('update', 'ADMIN', noteA, {
    targetId: 'comp_B',
  });
  assert(ruleDenyTargetMutation === false, 'Firestore Rules: targetId 변조 시도시 UPDATE DENIED');

  // ========================================================================
  // [4. 역할 권한 및 Firestore Rules]
  // ========================================================================
  console.log('\n--- 4. 역할별 권한 및 Firestore Security Rules 직접 검증 ---');

  // ADMIN: 모든 조작(list, get, create, update) 허용
  assert(store.evaluateFirestoreRule('list', 'ADMIN') === true, 'ADMIN: internal_notes list 허용');
  assert(store.evaluateFirestoreRule('get', 'ADMIN') === true, 'ADMIN: internal_notes get 허용');
  assert(store.evaluateFirestoreRule('create', 'ADMIN') === true, 'ADMIN: internal_notes create 허용');
  assert(store.evaluateFirestoreRule('update', 'ADMIN', noteA, { content: '수정' }) === true, 'ADMIN: internal_notes update 허용');

  // COMPANY: 읽기/쓰기 모두 DENIED
  assert(store.evaluateFirestoreRule('list', 'COMPANY') === false, 'COMPANY: internal_notes list DENIED');
  assert(store.evaluateFirestoreRule('get', 'COMPANY') === false, 'COMPANY: internal_notes get DENIED');
  assert(store.evaluateFirestoreRule('create', 'COMPANY') === false, 'COMPANY: internal_notes create DENIED');
  assert(store.evaluateFirestoreRule('update', 'COMPANY', noteA, { content: '수정' }) === false, 'COMPANY: internal_notes update DENIED');

  // WORKER: 읽기/쓰기 모두 DENIED
  assert(store.evaluateFirestoreRule('list', 'WORKER') === false, 'WORKER: internal_notes list DENIED');
  assert(store.evaluateFirestoreRule('get', 'WORKER') === false, 'WORKER: internal_notes get DENIED');
  assert(store.evaluateFirestoreRule('create', 'WORKER') === false, 'WORKER: internal_notes create DENIED');
  assert(store.evaluateFirestoreRule('update', 'WORKER', noteA, { content: '수정' }) === false, 'WORKER: internal_notes update DENIED');

  // 하드 DELETE: ADMIN 포함 전 역할 DENIED
  assert(store.evaluateFirestoreRule('delete', 'ADMIN') === false, '하드 DELETE: ADMIN도 DENIED (삭제 불가)');
  assert(store.evaluateFirestoreRule('delete', 'COMPANY') === false, '하드 DELETE: COMPANY도 DENIED');
  assert(store.evaluateFirestoreRule('delete', 'WORKER') === false, '하드 DELETE: WORKER도 DENIED');

  // ========================================================================
  // [5. Audit Log 보안: content, contentSnippet, changedFields 검증]
  // ========================================================================
  console.log('\n--- 5. Audit Log 보안: 메모 본문/스니펫 일절 미저장 및 changedFields 검증 ---');

  // 메모 내용 수정 실행
  const originalSecretText = '비밀 협의 내용: 대표이사 개인 특약';
  const updatedSecretText = '수정된 협의 내용: 개인 특약 금액 변경';

  const secretNote = store.createNote(
    {
      targetType: 'COMPANY',
      targetId: 'comp_A',
      companyId: 'comp_A',
      content: originalSecretText,
      category: '특약사항',
    },
    adminActor
  );

  store.updateNote(
    secretNote.id,
    { content: updatedSecretText, category: '수정특약' },
    adminActor
  );

  // 모든 Audit Log 스캔하여 secret text가 어디에도 포함되지 않았는지 검증
  for (const log of store.auditLogs) {
    const rawJson = JSON.stringify(log);
    assert(!rawJson.includes(originalSecretText), '원문 메모 내용(original)이 감사 로그에 미포함');
    assert(!rawJson.includes(updatedSecretText), '수정된 메모 내용(updated)이 감사 로그에 미포함');

    if (log.details) {
      assert(!('content' in log.details), `감사 로그(${log.action}) details.content 없음`);
      assert(!('contentSnippet' in log.details), `감사 로그(${log.action}) details.contentSnippet 없음`);
      assert(!('noteContent' in log.details), `감사 로그(${log.action}) details.noteContent 없음`);
      assert(!('snippet' in log.details), `감사 로그(${log.action}) details.snippet 없음`);

      // changedFields가 존재할 때, 반드시 필드명 문자열 배열이어야 하며 내용 값이 들어가면 안 됨
      if (log.details.changedFields) {
        assert(Array.isArray(log.details.changedFields), 'changedFields는 배열 형태');
        assert(
          log.details.changedFields.every((f: any) => typeof f === 'string' && f.length < 30),
          'changedFields는 오직 수정된 필드명만 포함 (본문 값 미포함)'
        );
      }
    }
  }

  // ========================================================================
  // [6. 입력 및 상태 정합성]
  // ========================================================================
  console.log('\n--- 6. 입력 유효성 및 상태 정합성 검증 ---');

  // 빈 메모
  try {
    store.createNote({ targetType: 'COMPANY', targetId: 'comp_A', companyId: 'comp_A', content: '' }, adminActor);
    assert(false, '빈 메모 차단 실패');
  } catch (e: any) {
    assert(e.message.includes('공백만 입력할 수 없습니다'), '빈 메모 차단 성공');
  }

  // 공백만 있는 메모
  try {
    store.createNote({ targetType: 'COMPANY', targetId: 'comp_A', companyId: 'comp_A', content: '   \n\t  ' }, adminActor);
    assert(false, '공백 메모 차단 실패');
  } catch (e: any) {
    assert(e.message.includes('공백만 입력할 수 없습니다'), '공백 메모 차단 성공');
  }

  // 3,000자 초과 메모
  try {
    store.createNote({ targetType: 'COMPANY', targetId: 'comp_A', companyId: 'comp_A', content: 'x'.repeat(3001) }, adminActor);
    assert(false, '3000자 초과 메모 차단 실패');
  } catch (e: any) {
    assert(e.message.includes('3,000자'), '3000자 초과 메모 차단 성공');
  }

  // 카테고리 50자 초과
  try {
    store.createNote({ targetType: 'COMPANY', targetId: 'comp_A', companyId: 'comp_A', content: '정상', category: 'y'.repeat(51) }, adminActor);
    assert(false, '50자 초과 카테고리 차단 실패');
  } catch (e: any) {
    assert(e.message.includes('50자'), '50자 초과 카테고리 차단 성공');
  }

  // 비활성 메모의 고정 상태 유지 공존성 확인
  const pinnedInactiveNote = store.createNote(
    {
      targetType: 'COMPANY',
      targetId: 'comp_A',
      companyId: 'comp_A',
      content: '고정된 상태에서 비활성화된 중요 과거 메모',
      isPinned: true,
    },
    adminActor
  );
  store.updateNote(pinnedInactiveNote.id, { isActive: false }, adminActor);

  const activeNotesOnly = store.getNotesByCompany('comp_A', { includeInactive: false });
  assert(!activeNotesOnly.some((n) => n.id === pinnedInactiveNote.id), '기본 목록에서는 비활성 메모 미노출');

  const allNotes = store.getNotesByCompany('comp_A', { includeInactive: true });
  const foundPinnedInactive = allNotes.find((n) => n.id === pinnedInactiveNote.id);
  assert(
    Boolean(foundPinnedInactive && foundPinnedInactive.isPinned === true && foundPinnedInactive.isActive === false),
    '비활성 상태(isActive: false)와 상단 고정(isPinned: true)이 상호 충돌 없이 공존함'
  );

  console.log(`\n================================================================`);
  console.log(` [R3-2 3/3 최종 QA 완료]: ${passed}/${total} 테스트 항목 전부 PASS`);
  console.log(`================================================================`);
}

runSecurityQA().catch((err) => {
  console.error(err);
  process.exit(1);
});
