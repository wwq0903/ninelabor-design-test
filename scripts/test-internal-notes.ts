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

// In-memory simulation store for Internal Notes testing
class MockInternalNoteStore {
  companies: Map<string, Company> = new Map();
  workers: Map<string, Worker> = new Map();
  notes: Map<string, InternalNote> = new Map();
  auditLogs: AuditLog[] = [];

  constructor() {
    // Seed companies
    this.companies.set('comp_alpha', {
      id: 'comp_alpha',
      companyName: '알파건설(주)',
      businessNumber: '111-22-33333',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    this.companies.set('comp_beta', {
      id: 'comp_beta',
      companyName: '베타테크(주)',
      businessNumber: '222-33-44444',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // Seed workers
    this.workers.set('worker_kim_alpha', {
      id: 'worker_kim_alpha',
      companyId: 'comp_alpha',
      name: '김철수',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    this.workers.set('worker_lee_beta', {
      id: 'worker_lee_beta',
      companyId: 'comp_beta',
      name: '이영희',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }

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
    delete sanitizedDetails.maskedRrn;

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

  createNote(
    input: CreateInternalNoteInput,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): InternalNote {
    this.validateNoteInput(input, true);
    const cleanTargetId = input.targetId.trim();
    const cleanCompanyId = input.companyId.trim();

    this.validateTargetIntegrity(input.targetType, cleanTargetId, cleanCompanyId);

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
        targetType: input.targetType,
        targetId: cleanTargetId,
        companyId: cleanCompanyId,
        category: trimmedCategory,
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
    if (!noteId || !noteId.trim()) throw new Error('수정할 메모의 ID가 필요합니다.');
    const cleanNoteId = noteId.trim();

    this.validateNoteInput(input, false);

    const existing = this.notes.get(cleanNoteId);
    if (!existing) throw new Error(`수정할 메모를 찾을 수 없습니다. (ID: ${cleanNoteId})`);

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

    const updatedNote: InternalNote = { ...existing, ...updates };
    this.notes.set(cleanNoteId, updatedNote);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: existing.companyId,
      action: 'UPDATE_INTERNAL_NOTE',
      resourceType: 'internal_notes',
      resourceId: cleanNoteId,
      details: {
        targetType: existing.targetType,
        targetId: existing.targetId,
        companyId: existing.companyId,
        changedFields: changedFieldNames,
        isPinned: updatedNote.isPinned,
        isActive: updatedNote.isActive,
        category: updatedNote.category,
      },
    });

    return updatedNote;
  }

  togglePinNote(
    noteId: string,
    isPinned: boolean,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): InternalNote {
    if (!noteId || !noteId.trim()) throw new Error('고정 상태를 변경할 메모의 ID가 필요합니다.');
    const cleanNoteId = noteId.trim();
    const existing = this.notes.get(cleanNoteId);
    if (!existing) throw new Error(`메모를 찾을 수 없습니다. (ID: ${cleanNoteId})`);

    const now = new Date().toISOString();
    const updatedNote: InternalNote = {
      ...existing,
      isPinned: Boolean(isPinned),
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };
    this.notes.set(cleanNoteId, updatedNote);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: existing.companyId,
      action: isPinned ? 'PIN_INTERNAL_NOTE' : 'UNPIN_INTERNAL_NOTE',
      resourceType: 'internal_notes',
      resourceId: cleanNoteId,
      details: {
        targetType: existing.targetType,
        targetId: existing.targetId,
        companyId: existing.companyId,
        isPinned: Boolean(isPinned),
      },
    });

    return updatedNote;
  }

  toggleActiveNote(
    noteId: string,
    isActive: boolean,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): InternalNote {
    if (!noteId || !noteId.trim()) throw new Error('활성 상태를 변경할 메모의 ID가 필요합니다.');
    const cleanNoteId = noteId.trim();
    const existing = this.notes.get(cleanNoteId);
    if (!existing) throw new Error(`메모를 찾을 수 없습니다. (ID: ${cleanNoteId})`);

    const now = new Date().toISOString();
    const updatedNote: InternalNote = {
      ...existing,
      isActive: Boolean(isActive),
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };
    this.notes.set(cleanNoteId, updatedNote);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: existing.companyId,
      action: isActive ? 'ACTIVATE_INTERNAL_NOTE' : 'DEACTIVATE_INTERNAL_NOTE',
      resourceType: 'internal_notes',
      resourceId: cleanNoteId,
      details: {
        targetType: existing.targetType,
        targetId: existing.targetId,
        companyId: existing.companyId,
        isActive: Boolean(isActive),
      },
    });

    return updatedNote;
  }

  getNotesByCompany(
    companyId: string,
    options?: { includeInactive?: boolean }
  ): InternalNote[] {
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
    options?: { includeInactive?: boolean }
  ): InternalNote[] {
    let list = Array.from(this.notes.values()).filter(
      (n) => n.targetType === 'WORKER' && n.targetId === workerId
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
}

async function runTests() {
  console.log('=== [R3-2 1/3] 내부 메모 기반 구축 테스트 시작 ===\n');
  const store = new MockInternalNoteStore();
  const adminUser = { uid: 'admin_001', name: '김노무사', role: 'ADMIN' as UserRole };

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, title: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${title}`);
      throw new Error(`Assertion failed: ${title}`);
    }
  }

  // 1. 기업 메모 생성 및 조회
  console.log('1. 기업 메모 생성 및 정렬 테스트');
  const note1 = store.createNote(
    {
      targetType: 'COMPANY',
      targetId: 'comp_alpha',
      companyId: 'comp_alpha',
      content: '급여 확정 전 대표 확인 필수',
      category: '급여관리',
      isPinned: false,
    },
    adminUser
  );
  assert(note1.id.startsWith('note_'), '메모 ID 생성 확인');
  assert(note1.targetType === 'COMPANY', 'targetType=COMPANY 확인');
  assert(note1.companyId === 'comp_alpha', 'companyId 일치 확인');
  assert(note1.createdByName === '김노무사', '작성자명 기록 확인');

  const note2 = store.createNote(
    {
      targetType: 'COMPANY',
      targetId: 'comp_alpha',
      companyId: 'comp_alpha',
      content: '★중요: 전화보다 이메일 연락 선호',
      category: '소통방식',
      isPinned: true,
    },
    adminUser
  );
  assert(note2.isPinned === true, 'isPinned=true 설정 확인');

  const compNotes = store.getNotesByCompany('comp_alpha');
  assert(compNotes.length === 2, '기업 메모 2건 조회 확인');
  assert(compNotes[0].id === note2.id, '고정(isPinned=true) 메모 최상단 노출 확인');
  assert(compNotes[1].id === note1.id, '일반 메모 다음 노출 확인');

  // 2. 근로자 메모 생성 및 소속 검증
  console.log('\n2. 근로자 메모 생성 및 대상 정합성 검증 테스트');
  const wNote1 = store.createNote(
    {
      targetType: 'WORKER',
      targetId: 'worker_kim_alpha',
      companyId: 'comp_alpha',
      content: '다음 급여 처리 시 수당 변경 확인 (비과세 자가운전보조금 20만원)',
      category: '급여산정',
    },
    adminUser
  );
  assert(wNote1.targetType === 'WORKER', 'targetType=WORKER 확인');
  assert(wNote1.targetId === 'worker_kim_alpha', 'targetId=worker.id 확인');

  const workerNotes = store.getNotesByWorker('worker_kim_alpha');
  assert(workerNotes.length === 1, '근로자 메모 1건 조회 확인');
  assert(workerNotes[0].id === wNote1.id, '근로자 메모 매칭 확인');

  // 3. 잘못된 대상 조합 차단 (회사 격리 / 위변조 방지)
  console.log('\n3. 잘못된 대상 조합 차단 테스트');
  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_beta',
        companyId: 'comp_alpha', // 불일치
        content: '타사 위조 메모',
      },
      adminUser
    );
    assert(false, '기업 메모 targetId != companyId 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('일치해야 합니다'), '기업 메모 targetId != companyId 차단 성공');
  }

  try {
    store.createNote(
      {
        targetType: 'WORKER',
        targetId: 'worker_lee_beta', // 베타 소속
        companyId: 'comp_alpha', // 알파로 등록 시도
        content: '타사 소속 근로자 메모 위조 시도',
      },
      adminUser
    );
    assert(false, '타사 근로자 대상 메모 생성 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('일치하지 않습니다'), '타사 근로자 대상 메모 생성 차단 성공');
  }

  try {
    store.createNote(
      {
        targetType: 'WORKER',
        targetId: 'non_existent_worker',
        companyId: 'comp_alpha',
        content: '존재하지 않는 근로자',
      },
      adminUser
    );
    assert(false, '존재하지 않는 근로자 메모 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('존재하지 않는 근로자'), '존재하지 않는 근로자 메모 차단 성공');
  }

  // 4. 입력값 유효성 검증
  console.log('\n4. 입력값 유효성 검증 테스트');
  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_alpha',
        companyId: 'comp_alpha',
        content: '', // 빈 내용
      },
      adminUser
    );
    assert(false, '빈 메모 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('공백만 입력할 수 없습니다'), '빈 메모 차단 성공');
  }

  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_alpha',
        companyId: 'comp_alpha',
        content: '   \n   \t  ', // 공백만
      },
      adminUser
    );
    assert(false, '공백 메모 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('공백만 입력할 수 없습니다'), '공백 메모 차단 성공');
  }

  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_alpha',
        companyId: 'comp_alpha',
        content: 'a'.repeat(3001), // 초과
      },
      adminUser
    );
    assert(false, '3000자 초과 메모 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('3,000자'), '3000자 초과 메모 차단 성공');
  }

  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_alpha',
        companyId: 'comp_alpha',
        content: '정상 내용',
        category: 'c'.repeat(51),
      },
      adminUser
    );
    assert(false, '50자 초과 카테고리 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('50자'), '50자 초과 카테고리 차단 성공');
  }

  // 5. 메모 수정 및 상태 변경
  console.log('\n5. 메모 수정 및 상태 변경 테스트');
  const updatedNote = store.updateNote(
    note1.id,
    { content: '급여 확정 전 대표 유선 확인 필수로 변경', category: '급여확정' },
    adminUser
  );
  assert(updatedNote.content === '급여 확정 전 대표 유선 확인 필수로 변경', '내용 수정 확인');
  assert(updatedNote.category === '급여확정', '카테고리 수정 확인');

  // 고정 토글
  const pinnedNote = store.togglePinNote(note1.id, true, adminUser);
  assert(pinnedNote.isPinned === true, '고정 토글(true) 확인');
  const unpinnedNote = store.togglePinNote(note1.id, false, adminUser);
  assert(unpinnedNote.isPinned === false, '고정 해제(false) 확인');

  // 비활성화 토글
  store.toggleActiveNote(note1.id, false, adminUser);
  const activeOnlyList = store.getNotesByCompany('comp_alpha');
  assert(activeOnlyList.length === 1, '비활성화 시 기본 목록 제외 확인 (1건만 조회)');
  assert(activeOnlyList[0].id === note2.id, '활성 메모만 조회됨 확인');

  const withInactiveList = store.getNotesByCompany('comp_alpha', { includeInactive: true });
  assert(withInactiveList.length === 2, 'includeInactive=true 시 비활성 포함 2건 조회 확인');

  // 6. 감사 로그 검증
  console.log('\n6. Audit Log 기록 및 민감정보 보호 검증');
  const noteAuditLogs = store.auditLogs.filter((l) => l.resourceType === 'internal_notes');
  assert(noteAuditLogs.length >= 6, `감사 로그 기록 건수 확인 (${noteAuditLogs.length}건)`);

  const actions = noteAuditLogs.map((l) => l.action);
  assert(actions.includes('CREATE_INTERNAL_NOTE'), 'CREATE_INTERNAL_NOTE 기록 확인');
  assert(actions.includes('UPDATE_INTERNAL_NOTE'), 'UPDATE_INTERNAL_NOTE 기록 확인');
  assert(actions.includes('PIN_INTERNAL_NOTE'), 'PIN_INTERNAL_NOTE 기록 확인');
  assert(actions.includes('UNPIN_INTERNAL_NOTE'), 'UNPIN_INTERNAL_NOTE 기록 확인');
  assert(actions.includes('DEACTIVATE_INTERNAL_NOTE'), 'DEACTIVATE_INTERNAL_NOTE 기록 확인');

  // 민감정보 검증
  for (const log of noteAuditLogs) {
    if (log.details) {
      assert(!('residentNumber' in log.details), '주민등록번호 미포함 확인');
      assert(!('rrn' in log.details), 'RRN 미포함 확인');
      assert(!('password' in log.details), '비밀번호 미포함 확인');
    }
  }

  console.log(`\n=== 테스트 완료: ${passed}/${total} 통과 ===`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
