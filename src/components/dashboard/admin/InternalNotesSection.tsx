import React, { useState, useEffect, useCallback } from 'react';
import {
  InternalNote,
  InternalNoteTargetType,
  CreateInternalNoteInput,
  UpdateInternalNoteInput,
  UserRole,
} from '../../../types';
import { internalNoteService } from '../../../services/internalNoteService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  StickyNote,
  Plus,
  Pin,
  PinOff,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  Power,
  RotateCcw,
  Tag,
  Clock,
  User,
  ShieldAlert,
} from 'lucide-react';

interface InternalNotesSectionProps {
  targetType: InternalNoteTargetType;
  targetId: string;
  companyId: string;
  targetName?: string; // 기업명 또는 근로자명
}

// 자주 쓰이는 추천 카테고리 빠른 선택 태그 (고정 enum이 아니며, 직접 자유 입력도 가능)
const PRESET_CATEGORIES = [
  '급여',
  '연락',
  '인사',
  '입퇴사',
  '모성보호',
  '주의사항',
  '기타',
];

export const InternalNotesSection: React.FC<InternalNotesSectionProps> = ({
  targetType,
  targetId,
  companyId,
  targetName,
}) => {
  const { userProfile } = useAuth();
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<InternalNote | null>(null);
  const [saving, setSaving] = useState(false);

  // 폼 입력 상태
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formIsPinned, setFormIsPinned] = useState(false);

  // [보안] ADMIN 전용 가드: ADMIN이 아닌 경우 UI 및 데이터 노출 차단
  if (userProfile && userProfile.role !== 'ADMIN') {
    return (
      <div className="p-6 text-center text-xs text-rose-600 bg-rose-50 rounded-2xl border border-rose-200">
        <ShieldAlert className="mx-auto h-6 w-6 text-rose-500 mb-2" />
        <p className="font-semibold">접근 권한이 없습니다.</p>
        <p className="text-[11px] text-rose-500 mt-0.5">내부 업무 메모는 노무법인 ADMIN만 접근할 수 있습니다.</p>
      </div>
    );
  }

  // 현재 실행 관리자 (Actor) 정보
  const getActor = useCallback(() => {
    return {
      uid: userProfile?.uid || 'admin_operator',
      name: userProfile?.displayName || '노무법인 관리자',
      role: (userProfile?.role as UserRole) || 'ADMIN',
    };
  }, [userProfile]);

  // 메모 목록 불러오기
  const loadNotes = useCallback(async () => {
    if (!targetId || !companyId) return;
    try {
      setLoading(true);
      setErrorMessage(null);

      let fetched: InternalNote[] = [];
      if (targetType === 'COMPANY') {
        fetched = await internalNoteService.getNotesByCompany(companyId, { includeInactive });
      } else {
        fetched = await internalNoteService.getNotesByWorker(targetId, { includeInactive, companyId });
      }

      setNotes(fetched);
    } catch (err: any) {
      console.error('Failed to load internal notes:', err);
      setErrorMessage(err.message || '내부 메모 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId, companyId, includeInactive]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // 등록 모달 열기
  const handleOpenAddModal = () => {
    setEditingNote(null);
    setFormContent('');
    setFormCategory('');
    setFormIsPinned(false);
    setIsModalOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // 수정 모달 열기
  const handleOpenEditModal = (note: InternalNote) => {
    setEditingNote(note);
    setFormContent(note.content);
    setFormCategory(note.category || '');
    setFormIsPinned(Boolean(note.isPinned));
    setIsModalOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // 모달 닫기
  const handleCloseModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingNote(null);
  };

  // 메모 저장 (생성 또는 수정)
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedContent = formContent.trim();
    if (!trimmedContent) {
      setErrorMessage('메모 내용을 입력해주세요. (공백만 입력할 수 없습니다)');
      return;
    }
    if (trimmedContent.length > 3000) {
      setErrorMessage('메모 내용은 최대 3,000자까지 입력 가능합니다.');
      return;
    }

    const trimmedCategory = formCategory.trim();
    if (trimmedCategory.length > 50) {
      setErrorMessage('카테고리는 최대 50자까지 입력 가능합니다.');
      return;
    }

    try {
      setSaving(true);
      setErrorMessage(null);
      const actor = getActor();

      if (editingNote) {
        const updateInput: UpdateInternalNoteInput = {
          content: trimmedContent,
          category: trimmedCategory || undefined,
          isPinned: formIsPinned,
        };
        await internalNoteService.updateNote(editingNote.id, updateInput, actor);
        setSuccessMessage('내부 메모가 성공적으로 수정되었습니다.');
      } else {
        const createInput: CreateInternalNoteInput = {
          targetType,
          targetId: targetId.trim(),
          companyId: companyId.trim(),
          content: trimmedContent,
          category: trimmedCategory || undefined,
          isPinned: formIsPinned,
        };
        await internalNoteService.createNote(createInput, actor);
        setSuccessMessage('새 내부 메모가 성공적으로 등록되었습니다.');
      }

      setIsModalOpen(false);
      await loadNotes();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to save internal note:', err);
      setErrorMessage(err.message || '메모 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 상단 고정 / 고정 해제 토글
  const handleTogglePin = async (note: InternalNote) => {
    const nextPinState = !note.isPinned;
    try {
      setErrorMessage(null);
      const actor = getActor();
      await internalNoteService.togglePinNote(note.id, nextPinState, actor);
      setSuccessMessage(
        nextPinState ? '메모가 상단에 고정되었습니다.' : '메모 고정이 해제되었습니다.'
      );
      await loadNotes();
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err: any) {
      console.error('Failed to toggle pin:', err);
      setErrorMessage(err.message || '고정 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 활성 / 비활성 토글 (삭제 대신 보관/재활성화)
  const handleToggleActive = async (note: InternalNote) => {
    const nextActiveState = !note.isActive;
    const actionText = nextActiveState ? '재활성화' : '비활성화';

    try {
      setErrorMessage(null);
      const actor = getActor();
      await internalNoteService.toggleActiveNote(note.id, nextActiveState, actor);
      setSuccessMessage(`메모가 ${actionText}되었습니다.`);
      await loadNotes();
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err: any) {
      console.error('Failed to toggle active status:', err);
      setErrorMessage(err.message || '상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 날짜/시간 포맷 헬퍼
  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
        d.getDate()
      ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes()
      ).padStart(2, '0')}`;
    } catch {
      return isoString;
    }
  };

  const activeNotesCount = notes.filter((n) => n.isActive !== false).length;
  const pinnedNotesCount = notes.filter((n) => n.isActive !== false && n.isPinned).length;

  return (
    <div className="space-y-4">
      {/* 알림 메시지 */}
      {successMessage && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 상단 헤더 및 툴바 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <StickyNote className="h-4 w-4 text-amber-600" />
              <span>노무법인 전용 내부 업무 메모</span>
            </h4>
            <span className="rounded-md bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold">
              ADMIN 전용
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            고객(기업/근로자)에게 노출되지 않는 노무법인 내부 실무 참고용 메모입니다.
            {targetName ? ` (${targetName})` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
            />
            <span className="text-[11px] font-medium">비활성 메모 포함</span>
          </label>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>새 메모 작성</span>
          </button>
        </div>
      </div>

      {/* 요약 뱃지 */}
      <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
        <span>
          활성 메모 <strong>{activeNotesCount}</strong>건
        </span>
        {pinnedNotesCount > 0 && (
          <>
            <span>•</span>
            <span className="text-amber-700 font-medium flex items-center gap-1">
              <Pin className="h-3 w-3 fill-amber-500 text-amber-600" />
              상단 고정 <strong>{pinnedNotesCount}</strong>건
            </span>
          </>
        )}
        {includeInactive && (
          <>
            <span>•</span>
            <span className="text-slate-400">
              전체(비활성 포함) <strong>{notes.length}</strong>건
            </span>
          </>
        )}
      </div>

      {/* 메모 목록 */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent mb-2" />
          <p>내부 메모를 불러오는 중입니다...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2">
          <StickyNote className="mx-auto h-7 w-7 text-slate-300" />
          <p className="text-xs font-semibold text-slate-700">
            {includeInactive
              ? '등록된 내부 메모가 없습니다.'
              : '등록된 활성 내부 메모가 없습니다.'}
          </p>
          <p className="text-[11px] text-slate-400">
            급여 처리 시 주의사항, 서류 요청 일정 등 노무법인 내부 실무 메모를 작성해보세요.
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            첫 메모 작성하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const isInactive = note.isActive === false;
            return (
              <div
                key={note.id}
                className={`relative rounded-2xl border p-4 transition ${
                  isInactive
                    ? 'bg-slate-50/60 border-slate-200 opacity-65'
                    : note.isPinned
                    ? 'bg-amber-50/45 border-amber-300 shadow-2xs ring-1 ring-amber-200/50'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* 상단 핀 & 태그 바 */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* 상단 고정 뱃지 */}
                    {note.isPinned && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold border border-amber-200">
                        <Pin className="h-2.5 w-2.5 fill-amber-600 text-amber-700" />
                        상단 고정
                      </span>
                    )}

                    {/* 카테고리 태그 */}
                    {note.category ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 text-indigo-700 px-2 py-0.5 text-[10px] font-semibold border border-indigo-100">
                        <Tag className="h-2.5 w-2.5 text-indigo-500" />
                        {note.category}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-medium">
                        기본
                      </span>
                    )}

                    {/* 활성/비활성 뱃지 */}
                    {isInactive ? (
                      <span className="inline-flex items-center rounded-md bg-rose-100 text-rose-700 px-2 py-0.5 text-[10px] font-bold border border-rose-200">
                        비활성화됨
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-medium border border-emerald-100">
                        활성
                      </span>
                    )}
                  </div>

                  {/* 액션 버튼 (상단 고정, 수정, 활성/비활성화 토글 - 삭제 없음) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* 상단 고정 토글 버튼 */}
                    <button
                      type="button"
                      onClick={() => handleTogglePin(note)}
                      title={note.isPinned ? '상단 고정 해제' : '상단 고정'}
                      className={`rounded-lg p-1.5 text-xs transition ${
                        note.isPinned
                          ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {note.isPinned ? (
                        <PinOff className="h-3.5 w-3.5" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* 수정 버튼 */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(note)}
                      title="메모 수정"
                      className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xs transition"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>

                    {/* 활성/비활성 토글 버튼 (하드 삭제 없음) */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(note)}
                      title={isInactive ? '메모 재활성화' : '메모 비활성화 (보관)'}
                      className={`rounded-lg p-1.5 text-xs transition ${
                        isInactive
                          ? 'text-emerald-700 hover:bg-emerald-100 bg-emerald-50'
                          : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                    >
                      {isInactive ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* 메모 본문 (작성 내용 줄바꿈 보존) */}
                <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans mb-3 select-text">
                  {note.content}
                </div>

                {/* 하단 메타 정보 (작성자, 작성일, 마지막 수정자, 마지막 수정일) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-3 text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 truncate">
                    <User className="h-3 w-3 text-slate-400 shrink-0" />
                    <span>작성: {note.createdByName || '관리자'}</span>
                    <span>•</span>
                    <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="font-mono">{formatDateTime(note.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 truncate text-slate-400 sm:justify-end">
                    <span>최종 수정: {note.updatedByName || note.createdByName || '관리자'}</span>
                    <span>•</span>
                    <span className="font-mono">{formatDateTime(note.updatedAt || note.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 메모 작성/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <StickyNote className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingNote ? '내부 업무 메모 수정' : '새 내부 업무 메모 작성'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 입력 폼 */}
            <form onSubmit={handleSaveNote} className="space-y-4">
              {/* 카테고리 선택 및 직접 입력 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  카테고리 구분 (선택 또는 직접 입력)
                </label>
                {/* 빠른 선택 태그 */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_CATEGORIES.map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setFormCategory(preset)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition ${
                        formCategory === preset
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  {formCategory && !PRESET_CATEGORIES.includes(formCategory) && (
                    <span className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                      직접입력: {formCategory}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="카테고리를 직접 입력하거나 위의 태그를 선택하세요 (예: 급여, 모성보호)"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  maxLength={50}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* 메모 내용 (필수) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    메모 내용 <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {formContent.length} / 3,000자
                  </span>
                </div>
                <textarea
                  required
                  rows={5}
                  placeholder={`노무법인 내부 실무 참고 메모를 입력하세요.\n예:\n- 급여 확정 전 대표 확인 필요\n- 급여자료는 매월 5일까지 요청\n- 다음 급여 처리 시 자녀출산 축하금 수당 반영`}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  maxLength={3000}
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-slate-900 focus:outline-none leading-relaxed"
                />
              </div>

              {/* 상단 고정 체크박스 */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50/50 border border-amber-200/60">
                <input
                  type="checkbox"
                  id="formIsPinned"
                  checked={formIsPinned}
                  onChange={(e) => setFormIsPinned(e.target.checked)}
                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <label
                  htmlFor="formIsPinned"
                  className="text-xs font-medium text-slate-800 cursor-pointer select-none"
                >
                  <span className="font-bold text-amber-800">목록 최상단에 고정 (중요 메모)</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    체크 시 메모 목록 가장 위에 우선 표시됩니다.
                  </span>
                </label>
              </div>

              {/* 안내 문구 */}
              <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>
                  이 메모는 노무법인 ADMIN만 볼 수 있으며, 고객사나 근로자 화면에는 노출되지 않습니다.
                </span>
              </div>

              {/* 모달 버튼 */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving || !formContent.trim()}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {saving ? '저장 중...' : editingNote ? '변경사항 저장' : '메모 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
