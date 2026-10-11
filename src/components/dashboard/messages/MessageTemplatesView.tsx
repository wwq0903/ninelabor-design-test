import React, { useEffect, useState } from 'react';
import { MessageTemplate } from '../../../types';
import { messageService } from '../../../services/messageService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  FileText,
  Plus,
  Edit2,
  CheckCircle2,
  X,
  Search,
  Power,
  Clock,
  AlertCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

export const MessageTemplatesView: React.FC = () => {
  const { currentUser } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const list = await messageService.getTemplates();
      setTemplates(list || []);
    } catch (err: any) {
      console.error('Failed to fetch templates:', err);
      setErrorMessage(err?.message || '메시지 서식 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleOpenAdd = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      content: '',
      isActive: true,
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tmpl: MessageTemplate) => {
    setEditingTemplate(tmpl);
    setFormData({
      name: tmpl.name,
      content: tmpl.content,
      isActive: tmpl.isActive,
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (tmpl: MessageTemplate) => {
    if (!currentUser) {
      setErrorMessage('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }
    try {
      setTogglingId(tmpl.id);
      setErrorMessage(null);
      const nextState = await messageService.toggleTemplateActive(tmpl, currentUser.uid);
      setTemplates((prev) =>
        prev.map((t) => (t.id === tmpl.id ? { ...t, isActive: nextState } : t))
      );
      setSuccessMessage(
        `'${tmpl.name}' 서식이 ${nextState ? '활성' : '비활성'} 상태로 변경되었습니다.`
      );
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to toggle template active status:', err);
      setErrorMessage(err?.message || '서식 활성 상태 변경에 실패했습니다.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setErrorMessage('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }

    const trimmedName = formData.name.trim();
    const trimmedContent = formData.content.trim();

    if (!trimmedName) {
      setErrorMessage('서식 이름을 입력해 주세요.');
      return;
    }
    if (!trimmedContent) {
      setErrorMessage('서식 본문을 입력해 주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (editingTemplate) {
        await messageService.updateTemplate(editingTemplate.id, {
          name: trimmedName,
          content: trimmedContent,
          isActive: formData.isActive,
          adminUid: currentUser.uid,
          createdById: editingTemplate.createdById || currentUser.uid,
        });
        setSuccessMessage(`'${trimmedName}' 서식이 성공적으로 수정되었습니다.`);
      } else {
        await messageService.createTemplate({
          name: trimmedName,
          content: trimmedContent,
          isActive: formData.isActive,
          adminUid: currentUser.uid,
        });
        setSuccessMessage(`신규 서식 '${trimmedName}'이(가) 등록되었습니다.`);
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccessMessage(null), 3500);
      await fetchTemplates();
    } catch (err: any) {
      console.error('Failed to save template:', err);
      setErrorMessage(err?.message || '서식 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered Templates
  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      (t.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.content || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return t.isActive === true;
    if (statusFilter === 'inactive') return t.isActive === false;
    return true;
  });

  const activeCount = templates.filter((t) => t.isActive).length;
  const inactiveCount = templates.filter((t) => !t.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              문서·소통
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              총 {templates.length}건 (활성 {activeCount}건 / 비활성 {inactiveCount}건)
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <FileText className="h-6 w-6 text-slate-700" />
            메시지 서식 관리
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            관리자가 직접 메시지 서식(이름 및 본문)을 등록·수정하고 활성/비활성 상태를 관리합니다.
            활성화된 서식은 향후 기업 고객과의 소통에 활용됩니다.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-medium text-white shadow-xs hover:bg-slate-800 transition"
        >
          <Plus className="h-4 w-4" />
          신규 서식 등록
        </button>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-rose-500 hover:text-rose-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="서식 이름 또는 본문 내용 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            전체 ({templates.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              statusFilter === 'active'
                ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            활성 ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              statusFilter === 'inactive'
                ? 'bg-white text-slate-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            비활성 ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Grid of Templates */}
      {loading ? (
        <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span>메시지 서식 목록을 불러오는 중입니다...</span>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-3">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="text-sm font-bold text-slate-800">
            {searchQuery || statusFilter !== 'all'
              ? '검색 조건과 일치하는 서식이 없습니다.'
              : '등록된 메시지 서식이 없습니다.'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {searchQuery || statusFilter !== 'all'
              ? '검색어나 필터 조건을 변경해 보세요.'
              : '신규 서식 등록 버튼을 클릭하여 자주 사용하는 업무 서식(이름과 본문)을 등록해 주세요.'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <button
              onClick={handleOpenAdd}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              첫 서식 등록하기
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTemplates.map((tmpl) => (
            <div
              key={tmpl.id}
              className={`rounded-2xl border transition bg-white p-5 shadow-2xs flex flex-col justify-between space-y-3.5 ${
                tmpl.isActive
                  ? 'border-slate-200 hover:border-slate-300'
                  : 'border-slate-200/80 bg-slate-50/50 opacity-90'
              }`}
            >
              <div>
                {/* Header: Title and Status/Actions */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 leading-snug break-words">
                      {tmpl.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
                        tmpl.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          tmpl.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      {tmpl.isActive ? '활성' : '비활성'}
                    </span>

                    {/* Edit Button */}
                    <button
                      onClick={() => handleOpenEdit(tmpl)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                      title="서식 수정"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content Body */}
                <div className="mt-2.5 rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-[12px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                  {tmpl.content}
                </div>
              </div>

              {/* Card Footer: Metadata and Quick Status Toggle */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-slate-400" />
                  <span>
                    등록 {tmpl.createdAt ? new Date(tmpl.createdAt).toLocaleDateString('ko-KR') : '-'}
                  </span>
                </div>

                {/* Quick Toggle Button */}
                <button
                  onClick={() => handleToggleActive(tmpl)}
                  disabled={togglingId === tmpl.id}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                    tmpl.isActive
                      ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                  title={tmpl.isActive ? '비활성으로 전환' : '활성으로 전환'}
                >
                  {togglingId === tmpl.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Power className="h-3 w-3" />
                  )}
                  <span>{tmpl.isActive ? '비활성 전환' : '활성화'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-700" />
                {editingTemplate ? '메시지 서식 수정' : '신규 메시지 서식 등록'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Form Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  서식 이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 입사자 등록 서식, 월 정기 급여대장 요청"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Active Toggle Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  사용 상태
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: true })}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      formData.isActive
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    활성 (사용 가능)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: false })}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      !formData.isActive
                        ? 'border-slate-800 bg-slate-100 text-slate-900 ring-1 ring-slate-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5 text-slate-500" />
                    비활성 (미사용)
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  비활성 서식은 삭제되지 않으며 관리자 화면에 보존됩니다.
                </p>
              </div>

              {/* Form Content */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  서식 본문 내용 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={8}
                  placeholder={`예:
- 입사일:
- 이름:
- 주민등록번호:
- 월 급여:
- 직책:`}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-3.5 text-xs font-mono focus:border-slate-900 focus:outline-none leading-relaxed"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isSubmitting ? '저장 중...' : editingTemplate ? '수정 완료' : '서식 등록'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
