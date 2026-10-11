import React, { useState, useEffect, useMemo } from 'react';
import {
  Task,
  CreateTaskInput,
  TaskPriority,
  TaskStatus,
  TaskSourceType,
  Company,
  Worker,
} from '../../../types';
import { taskService } from '../../../services/taskService';
import { firmService } from '../../../services/firmService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  CheckSquare,
  Plus,
  RefreshCw,
  Tag,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  Eye,
  ArrowLeft,
  Building2,
  User,
  Calendar,
  Lock,
} from 'lucide-react';

export interface CreateTaskFromSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceType: TaskSourceType;
  sourceId: string;
  sourceTitle?: string;
  companyId?: string;
  workerId?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultDueDate?: string;
  defaultPriority?: TaskPriority;
  initialCompanies?: Company[];
  initialWorkers?: Worker[];
  onTaskCreated?: (task: Task) => void;
  onOpenExistingTask?: (existingTask: Task) => void;
  onNavigateToSource?: (
    sourceType: TaskSourceType,
    sourceId: string,
    companyId?: string,
    workerId?: string
  ) => void;
}

const SOURCE_TYPE_LABELS: Record<TaskSourceType, string> = {
  MANUAL: '수동 등록',
  INQUIRY: '통합 문의',
  DATA_REQUEST: '자료요청',
  MATERNITY: '모성보호',
  PAYROLL: '급여관리',
  MESSAGE: '메시지',
  DOCUMENT: '문서',
  OTHER: '기타',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: '대기중 (TODO)',
  IN_PROGRESS: '진행중 (IN_PROGRESS)',
  COMPLETED: '완료됨 (COMPLETED)',
  CANCELLED: '취소됨 (CANCELLED)',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  URGENT: '긴급 (URGENT)',
  HIGH: '높음 (HIGH)',
  NORMAL: '보통 (NORMAL)',
  LOW: '낮음 (LOW)',
};

export const CreateTaskFromSourceModal: React.FC<CreateTaskFromSourceModalProps> = ({
  isOpen,
  onClose,
  sourceType,
  sourceId,
  sourceTitle,
  companyId,
  workerId,
  defaultTitle = '',
  defaultDescription = '',
  defaultDueDate = '',
  defaultPriority = 'NORMAL',
  initialCompanies,
  initialWorkers,
  onTaskCreated,
  onOpenExistingTask,
}) => {
  const { currentUser, userProfile } = useAuth();

  // State
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Duplicate Task State (R3-3 3/3-B-③-A)
  const [existingActiveTask, setExistingActiveTask] = useState<Task | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [viewingExistingDetail, setViewingExistingDetail] = useState(false);

  // Entities for lookup
  const [companies, setCompanies] = useState<Company[]>(initialCompanies || []);
  const [workers, setWorkers] = useState<Worker[]>(initialWorkers || []);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCompanyId, setFormCompanyId] = useState('');
  const [formWorkerId, setFormWorkerId] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('NORMAL');
  const [formStatus, setFormStatus] = useState<TaskStatus>('TODO');
  const [formDueDate, setFormDueDate] = useState('');

  const actor = useMemo(() => ({
    uid: currentUser?.uid || 'admin',
    name: userProfile?.displayName || currentUser?.displayName || '노무법인 관리자',
    role: 'ADMIN' as const,
  }), [currentUser, userProfile]);

  // Load companies and workers
  useEffect(() => {
    let isMounted = true;
    const fetchEntities = async () => {
      try {
        if (
          initialCompanies &&
          initialCompanies.length > 0 &&
          initialWorkers &&
          initialWorkers.length > 0
        ) {
          if (isMounted) {
            setCompanies(initialCompanies);
            setWorkers(initialWorkers);
          }
          return;
        }

        const [cList, wList] = await Promise.all([
          initialCompanies && initialCompanies.length > 0
            ? Promise.resolve(initialCompanies)
            : firmService.getAllCompanies().catch(() => []),
          initialWorkers && initialWorkers.length > 0
            ? Promise.resolve(initialWorkers)
            : firmService.getAllWorkers().catch(() => []),
        ]);
        if (isMounted) {
          setCompanies(cList);
          setWorkers(wList);
        }
      } catch (err) {
        console.error('Failed to load companies/workers:', err);
      }
    };
    if (isOpen) {
      fetchEntities();
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, initialCompanies, initialWorkers]);

  // [R3-3 3/3-B-③-A] 출처 기반 진행 중 할 일 중복 검사
  useEffect(() => {
    if (!isOpen) {
      setExistingActiveTask(null);
      setViewingExistingDetail(false);
      return;
    }
    setViewingExistingDetail(false);
    if (!sourceType || !sourceId || sourceType === 'MANUAL') {
      setExistingActiveTask(null);
      return;
    }

    let isMounted = true;
    const checkDuplicate = async () => {
      setCheckingDuplicate(true);
      try {
        const { isDuplicate, existingTask } = await taskService.checkDuplicateSourceTask(sourceType, sourceId);
        if (isMounted) {
          if (isDuplicate && existingTask) {
            setExistingActiveTask(existingTask);
          } else {
            setExistingActiveTask(null);
          }
        }
      } catch (err) {
        console.warn('Failed to check duplicate task:', err);
      } finally {
        if (isMounted) {
          setCheckingDuplicate(false);
        }
      }
    };

    checkDuplicate();

    return () => {
      isMounted = false;
    };
  }, [isOpen, sourceType, sourceId]);

  // Initialize form when opened
  useEffect(() => {
    if (!isOpen) return;

    setFeedback(null);
    setFormTitle(defaultTitle || `[${SOURCE_TYPE_LABELS[sourceType] || sourceType}] 업무`);
    setFormDescription(defaultDescription || '');
    setFormCompanyId(companyId || '');
    setFormWorkerId(workerId || '');
    setFormPriority(defaultPriority || 'NORMAL');
    setFormStatus('TODO');
    setFormDueDate(defaultDueDate || '');
  }, [isOpen, sourceType, sourceId, companyId, workerId, defaultTitle, defaultDescription, defaultDueDate, defaultPriority]);

  // [R3-3 3/3-B-③-B] 출처 기반 기업·근로자 고정 여부
  const isSourceBound = Boolean(sourceType && sourceType !== 'MANUAL');

  const targetCompany = useMemo(() => {
    if (!companyId) return null;
    return companies.find((c) => c.id === companyId) || null;
  }, [companies, companyId]);

  const targetWorker = useMemo(() => {
    if (!workerId) return null;
    return workers.find((w) => w.id === workerId) || null;
  }, [workers, workerId]);

  // Filter available workers by selected company (수동 일반 업무 시 사용)
  const availableWorkers = useMemo(() => {
    if (!formCompanyId) return [];
    return workers.filter((w) => w.companyId === formCompanyId);
  }, [workers, formCompanyId]);

  // Submit New Task
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (existingActiveTask) {
      setFeedback({ type: 'error', message: '이 업무와 연결된 진행 중 할 일이 이미 있습니다.' });
      return;
    }
    if (!formTitle.trim()) {
      setFeedback({ type: 'error', message: '업무 제목을 입력해주세요.' });
      return;
    }

    try {
      setActionLoading(true);
      setFeedback(null);

      // [R3-3 3/3-B-③-B] 출처 기반 task의 companyId, workerId 변조 방지
      // 원본 업무가 지정한 대상(companyId, workerId)을 엄격히 강제 (UI 변조 원천 차단)
      const finalCompanyId = isSourceBound
        ? (companyId && companyId.trim() ? companyId.trim() : undefined)
        : (formCompanyId.trim() || undefined);

      const finalWorkerId = isSourceBound
        ? (workerId && workerId.trim() ? workerId.trim() : undefined)
        : (formWorkerId.trim() || undefined);

      const input: CreateTaskInput = {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        companyId: finalCompanyId,
        workerId: finalWorkerId,
        priority: formPriority,
        status: formStatus,
        dueDate: formDueDate || undefined,
        sourceType,
        sourceId,
      };

      const created = await taskService.createTask(input, actor);
      setFeedback({ type: 'success', message: '할 일로 등록되었습니다.' });

      if (onTaskCreated) {
        onTaskCreated(created);
      }

      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      console.error('Failed to create task from source:', err);
      if (err.code === 'DUPLICATE_ACTIVE_TASK' || err.message?.includes('진행 중 할 일이 이미 있습니다')) {
        const dupTask = err.existingTask || (await taskService.getActiveTaskBySource(sourceType, sourceId));
        if (dupTask) {
          setExistingActiveTask(dupTask);
        }
      }
      setFeedback({
        type: 'error',
        message: err.message || '할 일 등록 중 오류가 발생했습니다.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  // [R3-3 3/3-B-③-A] 기존 할 일 상세 모달 뷰
  if (viewingExistingDetail && existingActiveTask) {
    const matchedCompany = companies.find((c) => c.id === existingActiveTask.companyId);
    const matchedWorker = workers.find((w) => w.id === existingActiveTask.workerId);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
        <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">기존 연결 할 일 상세</h3>
                <p className="text-[11px] text-slate-500">
                  {(existingActiveTask.sourceType && SOURCE_TYPE_LABELS[existingActiveTask.sourceType]) || existingActiveTask.sourceType || '출처'} 연계 업무
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewingExistingDetail(false)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              title="뒤로 가기"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Status & Priority badges */}
            <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">진행 상태:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  existingActiveTask.status === 'TODO' ? 'bg-slate-200 text-slate-800' :
                  existingActiveTask.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' :
                  existingActiveTask.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  {STATUS_LABELS[existingActiveTask.status]}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">중요도:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  existingActiveTask.priority === 'URGENT' ? 'bg-rose-100 text-rose-800' :
                  existingActiveTask.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                  existingActiveTask.priority === 'NORMAL' ? 'bg-blue-100 text-blue-800' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {PRIORITY_LABELS[existingActiveTask.priority]}
                </span>
              </div>
            </div>

            {/* Title */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">업무 제목</span>
              <h4 className="text-base font-bold text-slate-900 break-words">{existingActiveTask.title}</h4>
            </div>

            {/* Description */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">상세 설명</span>
              {existingActiveTask.description ? (
                <p className="text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {existingActiveTask.description}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">상세 설명이 없습니다.</p>
              )}
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[11px] mb-0.5">관련 기업</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {matchedCompany ? matchedCompany.companyName : (existingActiveTask.companyId || '노무법인 공통')}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[11px] mb-0.5">관련 근로자</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {matchedWorker ? `${matchedWorker.name} (${matchedWorker.department || '부서미지정'})` : (existingActiveTask.workerId || '근로자 미지정')}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[11px] mb-0.5">마감일자</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {existingActiveTask.dueDate || '미지정'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[11px] mb-0.5">출처 정보</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 font-mono text-[11px]">
                  <Tag className="h-3.5 w-3.5 text-indigo-500" />
                  ID: {existingActiveTask.sourceId || '없음'}
                </span>
              </div>
            </div>

            {/* Footer / Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setViewingExistingDetail(false)}
                className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                이전으로
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  창 닫기
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={async () => {
                    try {
                      setActionLoading(true);
                      await taskService.completeTask(existingActiveTask.id, actor);
                      setExistingActiveTask(null);
                      setViewingExistingDetail(false);
                      setFeedback({ type: 'success', message: '기존 업무가 완료 처리되었습니다. 이제 새 할 일을 등록할 수 있습니다.' });
                    } catch (err: any) {
                      setFeedback({ type: 'error', message: err.message || '업무 완료 처리에 실패했습니다.' });
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  기존 업무 완료 처리
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">할 일로 추가</h3>
              <p className="text-[11px] text-slate-500">
                {sourceTitle || SOURCE_TYPE_LABELS[sourceType]} 연계 업무
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Duplicate Task Warning Banner (R3-3 3/3-B-③-A) */}
        {existingActiveTask && (
          <div className="mx-6 mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <p className="text-xs font-bold text-amber-900">
                  이 업무와 연결된 진행 중 할 일이 이미 있습니다.
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  현재 상태: {STATUS_LABELS[existingActiveTask.status]} ({existingActiveTask.title})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setViewingExistingDetail(true);
                if (onOpenExistingTask) {
                  onOpenExistingTask(existingActiveTask);
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 rounded-lg shadow-2xs transition shrink-0 cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
              기존 할 일 보기
            </button>
          </div>
        )}

        {/* Feedback Message */}
        {feedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Create Task Form */}
        <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
          {/* Source Reference Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold text-indigo-950">
                연결 출처: {SOURCE_TYPE_LABELS[sourceType] || sourceType}
              </span>
            </div>
            <span className="font-mono text-[10px] text-indigo-600 font-medium">
              ID: {sourceId}
            </span>
          </div>

          {/* Title (필수, 자동 입력되지만 수정 가능) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              업무 제목 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="할 일 제목을 입력하세요"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            />
          </div>

          {/* Description (선택, 수정 가능) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              상세 설명 (선택)
            </label>
            <textarea
              rows={3}
              maxLength={5000}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="업무 내용 및 메모를 입력하세요"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Company & Worker (출처 기반 정합성 보장 & 변조 방지) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  관련 기업
                </label>
                {isSourceBound && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                    {companyId ? '원본 기업 고정' : '소속 기업 없음'}
                  </span>
                )}
              </div>
              {isSourceBound ? (
                <div>
                  <select
                    disabled
                    value={companyId || ''}
                    className="w-full px-3 py-2 text-xs border border-slate-200 bg-slate-50 text-slate-700 font-medium rounded-xl cursor-not-allowed select-none"
                  >
                    <option value={companyId || ''}>
                      {companyId
                        ? (targetCompany?.companyName || `소속 기업 (${companyId})`)
                        : '비소속 개인 업무 (소속 기업 없음)'}
                    </option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {companyId
                      ? '원본 업무와 연계된 소속 기업으로 고정되어 변경할 수 없습니다.'
                      : '비소속 개인 문의로 가짜 기업 ID 생성이 방지됩니다.'}
                  </p>
                </div>
              ) : (
                <select
                  value={formCompanyId}
                  onChange={(e) => {
                    setFormCompanyId(e.target.value);
                    setFormWorkerId('');
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="">노무법인 공통 업무 (기업 미지정)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  관련 근로자
                </label>
                {isSourceBound && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                    {workerId ? '원본 근로자 고정' : '근로자 미지정'}
                  </span>
                )}
              </div>
              {isSourceBound ? (
                <div>
                  <select
                    disabled
                    value={workerId || ''}
                    className="w-full px-3 py-2 text-xs border border-slate-200 bg-slate-50 text-slate-700 font-medium rounded-xl cursor-not-allowed select-none"
                  >
                    <option value={workerId || ''}>
                      {workerId
                        ? (targetWorker
                            ? `${targetWorker.name}${targetWorker.department ? ` (${targetWorker.department})` : ''}`
                            : `대상 근로자 (${workerId})`)
                        : '원본 업무에 지정된 근로자 없음'}
                    </option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {workerId
                      ? '원본 업무의 대상 근로자(canonical worker.id)로 고정되어 변경할 수 없습니다.'
                      : '원본에 근로자가 없는 업무로 임의 근로자 생성이 방지됩니다.'}
                  </p>
                </div>
              ) : (
                <select
                  disabled={!formCompanyId}
                  value={formWorkerId}
                  onChange={(e) => setFormWorkerId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {!formCompanyId ? '기업을 먼저 선택해주세요' : '회사 전체 공통 (근로자 미지정)'}
                  </option>
                  {formWorkerId && !availableWorkers.some((w) => w.id === formWorkerId) && (
                    <option value={formWorkerId}>
                      {workers.find((w) => w.id === formWorkerId)?.name || `선택된 근로자 (${formWorkerId})`}
                    </option>
                  )}
                  {availableWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.department ? `(${w.department})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Priority & Status & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                중요도
              </label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="URGENT">긴급</option>
                <option value="HIGH">높음</option>
                <option value="NORMAL">보통</option>
                <option value="LOW">낮음</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                초기 상태
              </label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="TODO">대기중 (TODO)</option>
                <option value="IN_PROGRESS">진행중 (IN_PROGRESS)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                마감일자
              </label>
              <input
                type="date"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={actionLoading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={actionLoading || Boolean(existingActiveTask)}
              title={existingActiveTask ? '진행 중인 할 일이 이미 있어 등록할 수 없습니다.' : undefined}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {actionLoading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              등록
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
