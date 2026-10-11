import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskPriority,
  TaskStatus,
  TaskSourceType,
  Worker,
  UserRole,
} from '../../../types';
import { taskService } from '../../../services/taskService';
import { firmService } from '../../../services/firmService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  calculateTaskDueStatus,
  getDaysUntilDue,
  sortTasks,
} from '../../../utils/taskHelper';
import {
  CheckSquare,
  Plus,
  RefreshCw,
  Search,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Building2,
  User,
  AlertCircle,
  X,
  Edit2,
  FileText,
  RotateCcw,
  Ban,
  Tag,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

export interface EntityTasksSectionProps {
  entityType: 'COMPANY' | 'WORKER';
  companyId: string;
  workerId?: string; // canonical worker.id (WORKER 모드 시 필수)
  entityName?: string; // 기업명 또는 근로자명
  companyWorkers?: Worker[]; // 기업의 소속 근로자 목록 (선택)
  onNavigateToSource?: (
    sourceType: TaskSourceType,
    sourceId: string,
    companyId?: string,
    workerId?: string
  ) => void;
}

type SectionFilterType = 'ACTIVE' | 'ALL' | 'OVERDUE' | 'TODAY' | 'COMPLETED';

const PRIORITY_BADGES: Record<
  TaskPriority,
  { text: string; bg: string; textCol: string; border: string }
> = {
  URGENT: { text: '긴급', bg: 'bg-rose-50', textCol: 'text-rose-700', border: 'border-rose-200' },
  HIGH: { text: '높음', bg: 'bg-orange-50', textCol: 'text-orange-700', border: 'border-orange-200' },
  NORMAL: { text: '보통', bg: 'bg-blue-50', textCol: 'text-blue-700', border: 'border-blue-200' },
  LOW: { text: '낮음', bg: 'bg-slate-50', textCol: 'text-slate-600', border: 'border-slate-200' },
};

const STATUS_BADGES: Record<TaskStatus, { text: string; bg: string; textCol: string }> = {
  TODO: { text: '대기중', bg: 'bg-slate-100', textCol: 'text-slate-700' },
  IN_PROGRESS: { text: '진행중', bg: 'bg-amber-100', textCol: 'text-amber-800' },
  COMPLETED: { text: '완료됨', bg: 'bg-emerald-100', textCol: 'text-emerald-800' },
  CANCELLED: { text: '취소됨', bg: 'bg-slate-200', textCol: 'text-slate-500' },
};

const SOURCE_TYPE_LABELS: Record<TaskSourceType, string> = {
  MANUAL: '수동 등록',
  INQUIRY: '문의 연계',
  DATA_REQUEST: '자료요청',
  MATERNITY: '모성보호',
  PAYROLL: '급여업무',
  MESSAGE: '메시지',
  DOCUMENT: '문서',
  OTHER: '기타',
};

export const EntityTasksSection: React.FC<EntityTasksSectionProps> = ({
  entityType,
  companyId,
  workerId,
  entityName,
  companyWorkers: initialCompanyWorkers,
  onNavigateToSource,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Worker[]>(initialCompanyWorkers || []);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Filters State
  const [filterType, setFilterType] = useState<SectionFilterType>('ACTIVE');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Modals State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Create Form State
  const [createForm, setCreateForm] = useState<{
    title: string;
    description: string;
    workerId: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string;
  }>({
    title: '',
    description: '',
    workerId: workerId || '',
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: '',
  });

  // Edit Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    workerId: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string;
  }>({
    title: '',
    description: '',
    workerId: '',
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: '',
  });

  // Admin Actor Info
  const actor = useMemo(() => {
    return {
      uid: currentUser?.uid || 'admin',
      name: userProfile?.displayName || currentUser?.displayName || '노무법인 관리자',
      role: 'ADMIN' as const,
    };
  }, [currentUser, userProfile]);

  // Load Workers for Company if not provided
  useEffect(() => {
    if (initialCompanyWorkers && initialCompanyWorkers.length > 0) {
      setWorkers(initialCompanyWorkers);
      return;
    }

    if (companyId) {
      let isMounted = true;
      firmService
        .getWorkersByCompany(companyId)
        .then((res) => {
          if (isMounted && res) {
            setWorkers(res);
          }
        })
        .catch((err) => {
          console.error('Failed to load company workers in EntityTasksSection:', err);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [companyId, initialCompanyWorkers]);

  // Load Tasks strictly isolated by companyId / workerId
  const loadTasks = useCallback(
    async (isSilent = false) => {
      if (!companyId && !workerId) return;

      if (!isSilent) setLoading(true);
      else setIsRefreshing(true);

      try {
        let fetched: Task[] = [];
        if (entityType === 'COMPANY') {
          // 기업 상세: 해당 companyId의 task만 조회
          fetched = await taskService.getTasksByCompany(companyId);
          // 엄격한 격리 보장: 다른 기업 task 완벽 제외
          fetched = fetched.filter((t) => t.companyId === companyId);
        } else if (entityType === 'WORKER' && workerId) {
          // 근로자 상세: canonical worker.id 기준 조회
          fetched = await taskService.getTasksByWorker(workerId);
          // 엄격한 격리 보장: 해당 workerId 및 companyId 일치 필터
          fetched = fetched.filter(
            (t) => t.workerId === workerId && (!companyId || t.companyId === companyId)
          );
        }

        setTasks(sortTasks(fetched));
      } catch (err: any) {
        console.error('Failed to load entity tasks:', err);
        setFeedback({
          type: 'error',
          message: err.message || '할 일 목록을 불러오는 중 오류가 발생했습니다.',
        });
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [entityType, companyId, workerId]
  );

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Auto clear feedback after 4 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Filtered & Searched Tasks List
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Filter Type
      if (filterType === 'ACTIVE') {
        if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
      } else if (filterType === 'TODAY') {
        if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
        if (calculateTaskDueStatus(task) !== 'TODAY') return false;
      } else if (filterType === 'OVERDUE') {
        if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
        if (calculateTaskDueStatus(task) !== 'OVERDUE') return false;
      } else if (filterType === 'COMPLETED') {
        if (task.status !== 'COMPLETED') return false;
      }

      // 2. Search Keyword
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(kw);
        const matchDesc = task.description?.toLowerCase().includes(kw);
        const assignedWorker = workers.find((w) => w.id === task.workerId);
        const matchWorker = assignedWorker?.name.toLowerCase().includes(kw);
        if (!matchTitle && !matchDesc && !matchWorker) return false;
      }

      return true;
    });
  }, [tasks, filterType, searchKeyword, workers]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const total = tasks.length;
    const active = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length;
    const overdue = tasks.filter(
      (t) =>
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED' &&
        calculateTaskDueStatus(t) === 'OVERDUE'
    ).length;
    const today = tasks.filter(
      (t) =>
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED' &&
        calculateTaskDueStatus(t) === 'TODAY'
    ).length;
    const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
    return { total, active, overdue, today, completed };
  }, [tasks]);

  // Quick Complete Action
  const handleQuickComplete = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (task.status === 'COMPLETED') return;

    try {
      setActionLoading(true);
      await taskService.completeTask(task.id, actor);
      await loadTasks(true);
      setFeedback({ type: 'success', message: `'${task.title}' 업무를 완료 처리했습니다.` });
    } catch (err: any) {
      console.error('Failed to complete task:', err);
      setFeedback({ type: 'error', message: err.message || '업무 완료 처리에 실패했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setCreateForm({
      title: '',
      description: '',
      workerId: workerId || '',
      priority: 'NORMAL',
      status: 'TODO',
      dueDate: '',
    });
    setIsCreateModalOpen(true);
  };

  // Submit Create Task
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setFeedback({ type: 'error', message: '업무 제목을 입력해주세요.' });
      return;
    }

    try {
      setActionLoading(true);

      const input: CreateTaskInput = {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        // 기업 상세는 companyId 고정, 근로자 선택 시 workers/{workerId}
        companyId: companyId || undefined,
        workerId: entityType === 'WORKER' ? workerId : createForm.workerId || undefined,
        priority: createForm.priority,
        status: createForm.status,
        dueDate: createForm.dueDate || undefined,
        sourceType: 'MANUAL',
      };

      await taskService.createTask(input, actor);
      await loadTasks(true);
      setIsCreateModalOpen(false);
      setFeedback({ type: 'success', message: '새 업무를 성공적으로 등록했습니다.' });
    } catch (err: any) {
      console.error('Failed to create task:', err);
      setFeedback({ type: 'error', message: err.message || '업무 등록 중 오류가 발생했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open Detail / Edit Modal
  const handleOpenDetailModal = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(false);
    setEditForm({
      title: task.title,
      description: task.description || '',
      workerId: task.workerId || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate || '',
    });
  };

  // Submit Update Task
  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    if (!editForm.title.trim()) {
      setFeedback({ type: 'error', message: '업무 제목을 입력해주세요.' });
      return;
    }

    try {
      setActionLoading(true);

      const input: UpdateTaskInput = {
        title: editForm.title.trim(),
        description: editForm.description.trim() || undefined,
        // 기업 상세의 경우 소속 근로자 재할당 또는 해제 가능
        workerId:
          entityType === 'WORKER' ? selectedTask.workerId : editForm.workerId || null,
        priority: editForm.priority,
        status: editForm.status,
        dueDate: editForm.dueDate || null,
      };

      const updated = await taskService.updateTask(selectedTask.id, input, actor);
      setSelectedTask(updated);
      setIsEditing(false);
      await loadTasks(true);
      setFeedback({ type: 'success', message: '업무 내용을 성공적으로 수정했습니다.' });
    } catch (err: any) {
      console.error('Failed to update task:', err);
      setFeedback({ type: 'error', message: err.message || '업무 수정 중 오류가 발생했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Status Action Handlers inside Detail Modal
  const handleCompleteTask = async () => {
    if (!selectedTask) return;
    try {
      setActionLoading(true);
      const updated = await taskService.completeTask(selectedTask.id, actor);
      setSelectedTask(updated);
      await loadTasks(true);
      setFeedback({ type: 'success', message: '업무를 완료 처리했습니다.' });
    } catch (err: any) {
      console.error('Failed to complete task:', err);
      setFeedback({ type: 'error', message: err.message || '완료 처리에 실패했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenTask = async () => {
    if (!selectedTask) return;
    try {
      setActionLoading(true);
      const updated = await taskService.reopenTask(selectedTask.id, 'IN_PROGRESS', actor);
      setSelectedTask(updated);
      await loadTasks(true);
      setFeedback({ type: 'success', message: '업무를 다시 진행 중(재오픈) 상태로 변경했습니다.' });
    } catch (err: any) {
      console.error('Failed to reopen task:', err);
      setFeedback({ type: 'error', message: err.message || '재오픈 처리에 실패했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelTask = async () => {
    if (!selectedTask) return;
    try {
      setActionLoading(true);
      const updated = await taskService.cancelTask(selectedTask.id, actor);
      setSelectedTask(updated);
      await loadTasks(true);
      setFeedback({ type: 'success', message: '업무를 취소 상태로 변경했습니다.' });
    } catch (err: any) {
      console.error('Failed to cancel task:', err);
      setFeedback({ type: 'error', message: err.message || '업무 취소 처리에 실패했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Render Due Date Badge
  const renderDueBadge = (task: Task) => {
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      return (
        <span className="text-[11px] text-slate-400">
          {task.dueDate ? `마감: ${task.dueDate}` : '마감일 없음'}
        </span>
      );
    }

    const dueStatus = calculateTaskDueStatus(task);
    const days = getDaysUntilDue(task.dueDate);

    if (dueStatus === 'OVERDUE') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
          <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
          <span>기한 초과 ({days !== null ? `D+${Math.abs(days)}` : ''} {task.dueDate})</span>
        </span>
      );
    }

    if (dueStatus === 'TODAY') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3 text-amber-600 shrink-0" />
          <span>오늘 마감 ({task.dueDate})</span>
        </span>
      );
    }

    if (dueStatus === 'UPCOMING') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
          <Calendar className="h-3 w-3 text-blue-500 shrink-0" />
          <span>D-{days} ({task.dueDate})</span>
        </span>
      );
    }

    if (task.dueDate) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 border border-slate-200">
          <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
          <span>{task.dueDate} {days !== null ? `(D-${days})` : ''}</span>
        </span>
      );
    }

    return <span className="text-[11px] text-slate-400">마감일 없음</span>;
  };

  // RBAC Guard
  if (userProfile && userProfile.role !== 'ADMIN') {
    return (
      <div className="p-6 text-center text-xs text-rose-600 bg-rose-50 rounded-2xl border border-rose-200">
        <ShieldAlert className="mx-auto h-6 w-6 text-rose-500 mb-2" />
        <p className="font-semibold">접근 권한이 없습니다.</p>
        <p className="text-[11px] text-rose-500 mt-0.5">할 일 관리는 노무법인 ADMIN만 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <CheckSquare className="h-4 w-4 text-indigo-600" />
              <span>
                {entityType === 'COMPANY'
                  ? `${entityName || '기업'} 전용 할 일·마감일 관리`
                  : `${entityName || '근로자'} 전용 할 일·마감일 관리`}
              </span>
            </h4>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              전체 {summaryCounts.total}건
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {entityType === 'COMPANY'
              ? '해당 기업에 배정된 업무 및 마감 일정을 안전하게 통합 관리합니다.'
              : '해당 근로자에게 지정된 업무 및 마감 일정을 안전하게 관리합니다.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadTasks(true)}
            disabled={isRefreshing || loading}
            title="새로고침"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>할 일 추가</span>
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`rounded-xl p-3 text-xs flex items-center gap-2 font-medium transition ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setFilterType('ACTIVE')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              filterType === 'ACTIVE'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            미완료 ({summaryCounts.active})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('OVERDUE')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              filterType === 'OVERDUE'
                ? 'bg-rose-700 text-white'
                : summaryCounts.overdue > 0
                ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            기한 초과 ({summaryCounts.overdue})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('TODAY')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              filterType === 'TODAY'
                ? 'bg-amber-600 text-white'
                : summaryCounts.today > 0
                ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            오늘 마감 ({summaryCounts.today})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('COMPLETED')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              filterType === 'COMPLETED'
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            완료 ({summaryCounts.completed})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              filterType === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            전체 보기
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="업무 검색..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-slate-900"
          />
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-900 border-t-transparent mx-auto mb-2" />
          <span>할 일 목록을 불러오는 중입니다...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="py-12 text-center text-slate-400 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
          <CheckSquare className="mx-auto h-8 w-8 text-slate-300 mb-2" />
          <p className="text-xs font-bold text-slate-600">등록된 업무가 없습니다.</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {searchKeyword
              ? '검색 조건에 맞는 업무를 찾을 수 없습니다.'
              : '[할 일 추가] 버튼을 눌러 새로운 업무를 등록하세요.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
          {filteredTasks.map((task) => {
            const priorityBadge = PRIORITY_BADGES[task.priority];
            const statusBadge = STATUS_BADGES[task.status];
            const isDone = task.status === 'COMPLETED';
            const isCancelled = task.status === 'CANCELLED';
            const assignedWorker = workers.find((w) => w.id === task.workerId);

            return (
              <div
                key={task.id}
                onClick={() => handleOpenDetailModal(task)}
                className={`group flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer hover:shadow-xs ${
                  isDone
                    ? 'bg-slate-50/60 border-slate-200 opacity-75'
                    : isCancelled
                    ? 'bg-slate-100/50 border-slate-200 opacity-60'
                    : calculateTaskDueStatus(task) === 'OVERDUE'
                    ? 'bg-rose-50/30 border-rose-200 hover:border-rose-400'
                    : calculateTaskDueStatus(task) === 'TODAY'
                    ? 'bg-amber-50/30 border-amber-200 hover:border-amber-400'
                    : 'bg-white border-slate-200 hover:border-slate-400'
                }`}
              >
                {/* Checkbox for Quick Complete */}
                <button
                  type="button"
                  disabled={actionLoading || isDone || isCancelled}
                  onClick={(e) => handleQuickComplete(e, task)}
                  title={isDone ? '완료된 업무' : '클릭하여 완료 처리'}
                  className={`mt-0.5 rounded-md p-1 transition ${
                    isDone
                      ? 'text-emerald-600 bg-emerald-50'
                      : isCancelled
                      ? 'text-slate-400'
                      : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <div className="h-4 w-4 rounded border-2 border-slate-300 hover:border-emerald-600" />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    {/* Priority Badge */}
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${priorityBadge.bg} ${priorityBadge.textCol} ${priorityBadge.border}`}
                    >
                      {priorityBadge.text}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${statusBadge.bg} ${statusBadge.textCol}`}
                    >
                      {statusBadge.text}
                    </span>

                    {/* Due Date & D-Day */}
                    {renderDueBadge(task)}

                    {/* Assigned Worker Badge (if in COMPANY mode) */}
                    {entityType === 'COMPANY' && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        <User className="h-2.5 w-2.5" />
                        <span>{assignedWorker ? assignedWorker.name : '회사 공통'}</span>
                      </span>
                    )}

                    {/* Source Badge */}
                    {task.sourceType && task.sourceType !== 'MANUAL' && (
                      <span className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 border border-indigo-200">
                        {SOURCE_TYPE_LABELS[task.sourceType] || '기타'}
                      </span>
                    )}
                  </div>

                  <h5
                    className={`text-xs font-bold truncate ${
                      isDone ? 'line-through text-slate-500' : 'text-slate-900'
                    }`}
                  >
                    {task.title}
                  </h5>

                  {task.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {task.description}
                    </p>
                  )}
                </div>

                {/* Right Arrow */}
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-600 transition shrink-0 mt-1" />
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================== */}
      {/* Create Task Modal                                              */}
      {/* ============================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-600" />
                <span>
                  {entityType === 'COMPANY'
                    ? `기업 할 일 등록 (${entityName || '기업'})`
                    : `근로자 할 일 등록 (${entityName || '근로자'})`}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              {/* Target Notice */}
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-900">
                  {entityType === 'COMPANY' ? '기업 대상:' : '근로자 대상:'}
                </span>{' '}
                {entityName}
                {entityType === 'WORKER' && workerId && (
                  <span className="font-mono text-[10px] text-slate-400 ml-1">
                    (ID: {workerId})
                  </span>
                )}
              </div>

              {/* Title (Required) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  업무 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 10월 급여대장 확인, 모성보호 서류 보완"
                  maxLength={200}
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Description (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">상세 설명</label>
                <textarea
                  rows={3}
                  placeholder="업무 세부 내용이나 메모를 입력하세요 (선택)"
                  maxLength={5000}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none resize-none"
                />
              </div>

              {/* In COMPANY mode: Assigned Worker selection */}
              {entityType === 'COMPANY' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    담당/관련 근로자 지정 (선택)
                  </label>
                  <select
                    value={createForm.workerId}
                    onChange={(e) => setCreateForm({ ...createForm, workerId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:border-slate-900 focus:outline-none"
                  >
                    <option value="">회사 전체 공통 업무 (근로자 미지정)</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.department || '부서미지정'} / {w.position || '직급미지정'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Priority, Status, Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    중요도 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, priority: e.target.value as TaskPriority })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:border-slate-900 focus:outline-none font-medium"
                  >
                    <option value="URGENT">긴급 (URGENT)</option>
                    <option value="HIGH">높음 (HIGH)</option>
                    <option value="NORMAL">보통 (NORMAL)</option>
                    <option value="LOW">낮음 (LOW)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    상태 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={createForm.status}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, status: e.target.value as TaskStatus })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:border-slate-900 focus:outline-none font-medium"
                  >
                    <option value="TODO">대기중 (TODO)</option>
                    <option value="IN_PROGRESS">진행중 (IN_PROGRESS)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    마감일 (선택)
                  </label>
                  <input
                    type="date"
                    value={createForm.dueDate}
                    onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {actionLoading ? '등록 중...' : '할 일 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Detail / Edit Task Modal                                       */}
      {/* ============================================================== */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  {isEditing ? '업무 수정' : '업무 상세 정보'}
                </h3>
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    PRIORITY_BADGES[selectedTask.priority].bg
                  } ${PRIORITY_BADGES[selectedTask.priority].textCol}`}
                >
                  {PRIORITY_BADGES[selectedTask.priority].text}
                </span>
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    STATUS_BADGES[selectedTask.status].bg
                  } ${STATUS_BADGES[selectedTask.status].textCol}`}
                >
                  {STATUS_BADGES[selectedTask.status].text}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>수정</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
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

            {/* Quick Status Transition Bar */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">빠른 상태 전환:</span>

              {selectedTask.status !== 'COMPLETED' ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleCompleteTask}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  <span>완료 처리</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleReopenTask}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>재오픈 (진행중)</span>
                </button>
              )}

              {selectedTask.status !== 'CANCELLED' && selectedTask.status !== 'COMPLETED' && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleCancelTask}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
                >
                  <Ban className="h-3 w-3 text-slate-500" />
                  <span>업무 취소</span>
                </button>
              )}
            </div>

            {/* Content: Edit Form OR Read-Only Details */}
            {isEditing ? (
              <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    업무 제목 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    상세 설명
                  </label>
                  <textarea
                    rows={3}
                    maxLength={5000}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none resize-none"
                  />
                </div>

                {entityType === 'COMPANY' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      담당 근로자
                    </label>
                    <select
                      value={editForm.workerId}
                      onChange={(e) => setEditForm({ ...editForm, workerId: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:border-slate-900 focus:outline-none"
                    >
                      <option value="">회사 전체 공통 업무 (근로자 미지정)</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.department || '부서미지정'} / {w.position || '직급미지정'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      중요도
                    </label>
                    <select
                      value={editForm.priority}
                      onChange={(e) =>
                        setEditForm({ ...editForm, priority: e.target.value as TaskPriority })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:border-slate-900 focus:outline-none"
                    >
                      <option value="URGENT">긴급</option>
                      <option value="HIGH">높음</option>
                      <option value="NORMAL">보통</option>
                      <option value="LOW">낮음</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">상태</label>
                    <select
                      value={editForm.status}
                      onChange={(e) =>
                        setEditForm({ ...editForm, status: e.target.value as TaskStatus })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:border-slate-900 focus:outline-none"
                    >
                      <option value="TODO">대기중 (TODO)</option>
                      <option value="IN_PROGRESS">진행중 (IN_PROGRESS)</option>
                      <option value="COMPLETED">완료됨 (COMPLETED)</option>
                      <option value="CANCELLED">취소됨 (CANCELLED)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">마감일</label>
                    <input
                      type="date"
                      value={editForm.dueDate}
                      onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setIsEditing(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    수정 취소
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {actionLoading ? '저장 중...' : '변경사항 저장'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {/* Details view */}
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-3">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                      업무 제목
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{selectedTask.title}</h4>
                  </div>

                  {selectedTask.description && (
                    <div>
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                        상세 설명
                      </span>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {selectedTask.description}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 text-xs">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                        마감일 & 마감 상태
                      </span>
                      <div>{renderDueBadge(selectedTask)}</div>
                    </div>

                    <div>
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                        출처 유형
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedTask.sourceType
                          ? SOURCE_TYPE_LABELS[selectedTask.sourceType] || '기타'
                          : '수동 등록'}
                      </span>
                    </div>

                    {entityType === 'COMPANY' && (
                      <div className="col-span-2">
                        <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                          관련 근로자
                        </span>
                        <span className="font-medium text-slate-800">
                          {workers.find((w) => w.id === selectedTask.workerId)?.name ||
                            '회사 전체 공통 업무'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata */}
                <div className="text-[11px] text-slate-400 space-y-1">
                  <div>
                    생성: {selectedTask.createdByName || '관리자'} (
                    {selectedTask.createdAt?.split('T')[0]})
                  </div>
                  {selectedTask.updatedAt && (
                    <div>
                      최종 수정: {selectedTask.updatedByName || '관리자'} (
                      {selectedTask.updatedAt?.split('T')[0]})
                    </div>
                  )}
                  {selectedTask.completedAt && (
                    <div className="text-emerald-600 font-semibold">
                      완료 일시: {selectedTask.completedAt.replace('T', ' ').substring(0, 16)}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div>
                    {selectedTask.sourceType &&
                      ['INQUIRY', 'DATA_REQUEST', 'MATERNITY', 'PAYROLL'].includes(selectedTask.sourceType) &&
                      selectedTask.sourceId && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={async () => {
                          if (!selectedTask.sourceType || !selectedTask.sourceId) return;
                          try {
                            setActionLoading(true);
                            const exists = await taskService.verifySourceExists(
                              selectedTask.sourceType,
                              selectedTask.sourceId
                            );
                            if (!exists) {
                              setFeedback({ type: 'error', message: '원본 업무를 찾을 수 없습니다.' });
                              return;
                            }
                            if (onNavigateToSource) {
                              onNavigateToSource(
                                selectedTask.sourceType,
                                selectedTask.sourceId,
                                selectedTask.companyId,
                                selectedTask.workerId
                              );
                              setSelectedTask(null);
                            }
                          } catch (err) {
                            setFeedback({ type: 'error', message: '원본 업무를 찾을 수 없습니다.' });
                          } finally {
                            setActionLoading(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-xl transition shadow-2xs disabled:opacity-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        원본 업무 보기
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTask(null)}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                  >
                    닫기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
