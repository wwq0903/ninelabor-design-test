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

// In-memory simulation store for Internal Notes UI and Audit Log Security testing
class MockInternalNoteStore {
  companies: Map<string, Company> = new Map();
  workers: Map<string, Worker> = new Map();
  notes: Map<string, InternalNote> = new Map();
  auditLogs: AuditLog[] = [];

  constructor() {
    this.companies.set('comp_001', {
      id: 'comp_001',
      companyName: '(주)나인소프트',
      businessNumber: '123-45-67890',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    this.workers.set('worker_canon_001', {
      id: 'worker_canon_001',
      companyId: 'comp_001',
      name: '홍길동',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }

  // auditLogService.logAction emulation with strict sanitization
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

  createNote(
    input: CreateInternalNoteInput,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): InternalNote {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('ADMIN 권한만 내부 메모를 작성할 수 있습니다.');
    }

    if (!input.content || !input.content.trim()) {
      throw new Error('메모 내용을 입력해주세요. (공백만 입력할 수 없습니다.)');
    }

    const noteId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const cleanTargetId = input.targetId.trim();
    const cleanCompanyId = input.companyId.trim();

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

    // Audit Log: Strict field specification (no content, no contentSnippet)
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
      throw new Error('ADMIN 권한만 내부 메모를 수정할 수 있습니다.');
    }

    const existing = this.notes.get(noteId);
    if (!existing) throw new Error('메모를 찾을 수 없습니다.');

    const now = new Date().toISOString();
    const updatedNote: InternalNote = {
      ...existing,
      content: input.content !== undefined ? input.content.trim() : existing.content,
      category: input.category !== undefined ? input.category.trim() : existing.category,
      isPinned: input.isPinned !== undefined ? Boolean(input.isPinned) : existing.isPinned,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };

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
        isPinned: updatedNote.isPinned,
        isActive: updatedNote.isActive,
      },
    });

    return updatedNote;
  }

  togglePinNote(
    noteId: string,
    isPinned: boolean,
    currentUser: { uid: string; name?: string; role?: UserRole }
  ): InternalNote {
    const existing = this.notes.get(noteId);
    if (!existing) throw new Error('메모를 찾을 수 없습니다.');

    const updatedNote: InternalNote = {
      ...existing,
      isPinned: Boolean(isPinned),
      updatedAt: new Date().toISOString(),
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };
    this.notes.set(noteId, updatedNote);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: existing.companyId,
      action: isPinned ? 'PIN_INTERNAL_NOTE' : 'UNPIN_INTERNAL_NOTE',
      resourceType: 'internal_notes',
      resourceId: noteId,
      details: {
        noteId,
        targetType: existing.targetType,
        targetId: existing.targetId,
        companyId: existing.companyId,
        category: existing.category,
        operation: isPinned ? 'PIN' : 'UNPIN',
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
    const existing = this.notes.get(noteId);
    if (!existing) throw new Error('메모를 찾을 수 없습니다.');

    const updatedNote: InternalNote = {
      ...existing,
      isActive: Boolean(isActive),
      updatedAt: new Date().toISOString(),
      updatedById: currentUser.uid,
      updatedByName: currentUser.name || '노무법인 관리자',
    };
    this.notes.set(noteId, updatedNote);

    this.logAudit({
      actorUserId: currentUser.uid,
      actorRole: currentUser.role || 'ADMIN',
      actorName: currentUser.name || '노무법인 관리자',
      companyId: existing.companyId,
      action: isActive ? 'ACTIVATE_INTERNAL_NOTE' : 'DEACTIVATE_INTERNAL_NOTE',
      resourceType: 'internal_notes',
      resourceId: noteId,
      details: {
        noteId,
        targetType: existing.targetType,
        targetId: existing.targetId,
        companyId: existing.companyId,
        category: existing.category,
        operation: isActive ? 'ACTIVATE' : 'DEACTIVATE',
        isPinned: existing.isPinned,
        isActive: Boolean(isActive),
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

  getNotesByWorker(workerId: string, options?: { includeInactive?: boolean }): InternalNote[] {
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

async function run() {
  console.log('=== [R3-2 2/3] 기업·근로자 내부 메모 UI 및 감사 로그 보안 종합 검증 ===\n');

  const store = new MockInternalNoteStore();
  const adminActor = { uid: 'admin_1', name: '이노무사', role: 'ADMIN' as UserRole };
  const companyActor = { uid: 'company_ceo_1', name: '대표이사', role: 'COMPANY_CEO' as UserRole };
  const workerActor = { uid: 'worker_user_1', name: '홍길동', role: 'WORKER' as UserRole };

  let passed = 0;
  let total = 0;

  function assert(cond: boolean, desc: string) {
    total++;
    if (cond) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      throw new Error(`Failed: ${desc}`);
    }
  }

  // [1] 기업 내부 메모 동작 검증
  console.log('1. 기업 내부 메모 (targetType=COMPANY, targetId=companyId)');
  const cNote1 = store.createNote(
    {
      targetType: 'COMPANY',
      targetId: 'comp_001',
      companyId: 'comp_001',
      content: '매월 10일 급여 마감 전 추가 수당 명세서 교차 확인 요망',
      category: '급여',
      isPinned: false,
    },
    adminActor
  );
  assert(cNote1.targetType === 'COMPANY', 'targetType이 COMPANY임');
  assert(cNote1.targetId === 'comp_001', 'targetId가 comp_001과 일치');
  assert(cNote1.companyId === 'comp_001', 'companyId가 comp_001과 일치');

  const cNote2 = store.createNote(
    {
      targetType: 'COMPANY',
      targetId: 'comp_001',
      companyId: 'comp_001',
      content: '★대표 직통 연락 전 담당 이사님에게 1차 유선 확인',
      category: '연락',
      isPinned: true,
    },
    adminActor
  );
  assert(cNote2.isPinned === true, '상단 고정 플래그 true');

  const compList = store.getNotesByCompany('comp_001');
  assert(compList.length === 2, '기업 메모 2건 조회');
  assert(compList[0].id === cNote2.id, '고정 메모(cNote2)가 목록 최상단에 정렬됨');

  // [2] 근로자 내부 메모 동작 검증
  console.log('\n2. 근로자 내부 메모 (targetType=WORKER, canonical worker.id)');
  const wNote1 = store.createNote(
    {
      targetType: 'WORKER',
      targetId: 'worker_canon_001',
      companyId: 'comp_001',
      content: '육아휴직 종료 후 복직 예정일자 사전 확인 필요',
      category: '모성보호',
      isPinned: false,
    },
    adminActor
  );
  assert(wNote1.targetType === 'WORKER', 'targetType이 WORKER임');
  assert(wNote1.targetId === 'worker_canon_001', 'canonical worker.id 사용');
  assert(wNote1.companyId === 'comp_001', '소속 회사 ID 일치');

  const workerList = store.getNotesByWorker('worker_canon_001');
  assert(workerList.length === 1, '근로자 메모 1건 조회 성공');

  // [3] 메모 관리 (수정, 고정 토글, 비활성화/재활성화, 비활성 필터)
  console.log('\n3. 메모 관리 기능 (수정, 고정, 비활성화 토글)');
  const updated = store.updateNote(
    wNote1.id,
    { content: '육아휴직 복직 후 부서 변경 여부 확인', category: '인사' },
    adminActor
  );
  assert(updated.content === '육아휴직 복직 후 부서 변경 여부 확인', '내용 수정 완료');
  assert(updated.category === '인사', '카테고리 수정 완료');

  // 비활성화
  store.toggleActiveNote(wNote1.id, false, adminActor);
  const activeOnly = store.getNotesByWorker('worker_canon_001');
  assert(activeOnly.length === 0, '기본 조회 시 비활성 메모 미노출');

  const withInactive = store.getNotesByWorker('worker_canon_001', { includeInactive: true });
  assert(withInactive.length === 1, 'includeInactive=true 시 비활성 메모 포함 노출');
  assert(withInactive[0].isActive === false, 'isActive=false 확인');

  // 재활성화
  store.toggleActiveNote(wNote1.id, true, adminActor);
  const restored = store.getNotesByWorker('worker_canon_001');
  assert(restored.length === 1 && restored[0].isActive === true, '재활성화 성공');

  // [4] COMPANY / WORKER 비노출 및 차단 검증
  console.log('\n4. COMPANY / WORKER 권한 비노출 및 작성 차단 검증');
  try {
    store.createNote(
      {
        targetType: 'COMPANY',
        targetId: 'comp_001',
        companyId: 'comp_001',
        content: '기업 대표가 메모 작성 시도',
      },
      companyActor
    );
    assert(false, 'COMPANY 권한의 내부 메모 작성 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('ADMIN 권한만'), 'COMPANY 권한의 내부 메모 작성 차단 확인');
  }

  try {
    store.createNote(
      {
        targetType: 'WORKER',
        targetId: 'worker_canon_001',
        companyId: 'comp_001',
        content: '근로자가 메모 작성 시도',
      },
      workerActor
    );
    assert(false, 'WORKER 권한의 내부 메모 작성 차단 실패');
  } catch (err: any) {
    assert(err.message.includes('ADMIN 권한만'), 'WORKER 권한의 내부 메모 작성 차단 확인');
  }

  // [5] Audit Log content / contentSnippet 미저장 검증 (Requirement 7)
  console.log('\n5. Audit Log 보안: content 및 contentSnippet 일절 미저장 확인');
  const allAuditLogs = store.auditLogs;
  assert(allAuditLogs.length >= 6, `감사 로그 총 ${allAuditLogs.length}건 기록`);

  for (const log of allAuditLogs) {
    assert(!log.details || !('content' in log.details), `감사 로그 (${log.action})에 content 미포함`);
    assert(!log.details || !('contentSnippet' in log.details), `감사 로그 (${log.action})에 contentSnippet 미포함`);
    assert(!log.details || !('noteContent' in log.details), `감사 로그 (${log.action})에 noteContent 미포함`);
    assert(!log.details || !('snippet' in log.details), `감사 로그 (${log.action})에 snippet 미포함`);

    // Audit log required attributes check
    if (log.details && log.resourceType === 'internal_notes') {
      assert('noteId' in log.details, `감사 로그 (${log.action})에 noteId 포함`);
      assert('targetType' in log.details, `감사 로그 (${log.action})에 targetType 포함`);
      assert('targetId' in log.details, `감사 로그 (${log.action})에 targetId 포함`);
      assert('companyId' in log.details, `감사 로그 (${log.action})에 companyId 포함`);
      assert('operation' in log.details, `감사 로그 (${log.action})에 operation 포함`);
    }
  }

  // PII injection test: even if caller tries to pass contentSnippet, it is scrubbed
  store.logAudit({
    actorUserId: 'admin_1',
    actorRole: 'ADMIN',
    actorName: '이노무사',
    companyId: 'comp_001',
    action: 'TEST_SNIPPET_LEAK_PREVENTION',
    resourceType: 'internal_notes',
    resourceId: 'note_test',
    details: {
      contentSnippet: '이 문장은 유출되면 안 되는 메모 앞부분입니다...',
      content: '메모 본문 전체 내용...',
      noteId: 'note_test',
      targetType: 'COMPANY',
      targetId: 'comp_001',
      companyId: 'comp_001',
      operation: 'CREATE',
      isPinned: false,
    },
  });

  const testLeakLog = store.auditLogs.find((l) => l.action === 'TEST_SNIPPET_LEAK_PREVENTION');
  assert(Boolean(testLeakLog), '보안 테스트 로그 검색 성공');
  assert(!('contentSnippet' in (testLeakLog?.details || {})), 'contentSnippet이 완벽히 스크러빙/제거됨');
  assert(!('content' in (testLeakLog?.details || {})), 'content가 완벽히 스크러빙/제거됨');

  console.log(`\n=== 종합 검증 완료: ${passed}/${total} 항목 통과 ===`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
