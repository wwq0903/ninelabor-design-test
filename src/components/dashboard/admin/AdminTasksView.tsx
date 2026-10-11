import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
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
  calculateTaskDueStatus,
  getDaysUntilDue,
  getTaskSummaryStats,
  sortTasks,
} from '../../../utils/taskHelper';
import {
  CheckSquare,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Building2,
  User,
  AlertCircle,
  ChevronRight,
  X,
  Edit2,
  FileText,
  RotateCcw,
  Ban,
  Tag,
  Briefcase,
  Layers,
  ExternalLink,
} from 'lucide-react';

type QuickFilterType = 'ALL' | 'TODAY' | 'OVERDUE' | 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED';

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

const PRIORITY_LABELS: Record<TaskPriority, { text: string; bg: string; textCol: string; border: string }> = {
  URGENT: { text: '긴급', bg: 'bg-rose-50', textCol: 'text-rose-700', border: 'border-rose-200' },
  HIGH: { text: '높음', bg: 'bg-orange-50', textCol: 'text-orange-700', border: 'border-orange-200' },
  NORMAL: { text: '보통', bg: 'bg-blue-50', textCol: 'text-blue-700', border: 'border-blue-200' },
  LOW: { text: '낮음', bg: 'bg-slate-50', textCol: 'text-slate-600', border: 'border-slate-200' },
};

const STATUS_LABELS: Record<TaskStatus, { text: string; bg: string; textCol: string }> = {
  TODO: { text: '대기중', bg: 'bg-slate-100', textCol: 'text-slate-700' },
  IN_PROGRESS: { text: '진행중', bg: 'bg-amber-100', textCol: 'text-amber-800' },
  COMPLETED: { text: '완료됨', bg: 'bg-emerald-100', textCol: 'text-emerald-800' },
  CANCELLED: { text: '취소됨', bg: 'bg-slate-200', textCol: 'text-slate-500' },
};

interface AdminTasksViewProps {
  companies?: Company[];
  onNavigateToSource?: (
    sourceType: TaskSourceType,
    sourceId: string,
    companyId?: string,
    workerId?: string
  ) => void;
}

export const AdminTasksView: React.FC<AdminTasksViewProps> = ({
  companies: initialCompanies,
  onNavigateToSource,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>(initialCompanies || []);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  // Filters State
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('ALL');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [hideCompleted, setHideCompleted] = useState<boolean>(true);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Create Form State
  const [createForm, setCreateForm] = useState<{
    title: string;
    description: string;
    companyId: string;
    workerId: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string;
  }>({
    title: '',
    description: '',
    companyId: '',
    workerId: '',
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: '',
  });

  // Edit Form State (for detail modal)
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    companyId: string;
    workerId: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string;
  }>({
    title: '',
    description: '',
    companyId: '',
    workerId: '',
    priority: 'NORMAL',
    status: 'TODO',
    dueDate: '',
  });

  const actor = useMemo(() => {
    return {
      uid: currentUser?.uid || 'admin',
      name: userProfile?.displayName || currentUser?.displayName || '노무법인 관리자',
      role: 'ADMIN' as const,
    };
  }, [currentUser, userProfile]);

  // Load All Required Data
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const [fetchedTasks, fetchedCompanies, fetchedWorkers] = await Promise.all([
        taskService.getAllTasks(),
        initialCompanies && initialCompanies.length > 0
          ? Promise.resolve(initialCompanies)
          : firmService.getAllCompanies().catch(() => []),
        firmService.getAllWorkers().catch(() => []),
      ]);

      setTasks(fetchedTasks);
      if (fetchedCompanies && fetchedCompanies.length > 0) {
        setCompanies(fetchedCompanies);
      }
      setWorkers(fetchedWorkers || []);
    } catch (err: any) {
      console.error('Failed to load tasks data:', err);
      setFeedback({
        type: 'error',
        message: err.message || '할 일 목록을 불러오는 중 오류가 발생했습니다.',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [initialCompanies]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Companies Map for Quick Name Lookup
  const companyMap = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => {
      map.set(c.id, c.companyName);
    });
    return map;
  }, [companies]);

  // Workers Map for Quick Name Lookup
  const workerMap = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((w) => {
      map.set(w.id, w.name);
    });
    return map;
  }, [workers]);

  // Summary Stats calculated using central helper
  const stats = useMemo(() => {
    return getTaskSummaryStats(tasks);
  }, [tasks]);

  // Filtered & Sorted Tasks
  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // Quick Filter
    if (quickFilter === 'TODAY') {
      result = result.filter(
        (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && calculateTaskDueStatus(t) === 'TODAY'
      );
    } else if (quickFilter === 'OVERDUE') {
      result = result.filter(
        (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && calculateTaskDueStatus(t) === 'OVERDUE'
      );
    } else if (quickFilter === 'UPCOMING') {
      result = result.filter(
        (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && calculateTaskDueStatus(t) === 'UPCOMING'
      );
    } else if (quickFilter === 'IN_PROGRESS') {
      result = result.filter((t) => t.status === 'IN_PROGRESS');
    } else if (quickFilter === 'COMPLETED') {
      result = result.filter((t) => t.status === 'COMPLETED');
    } else {
      // 'ALL' filter: 기본 화면은 미완료 중심 (hideCompleted toggle 적용)
      if (hideCompleted) {
        result = result.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
      }
    }

    // Company Filter
    if (companyFilter !== 'all') {
      if (companyFilter === '__NONE__') {
        result = result.filter((t) => !t.companyId);
      } else {
        result = result.filter((t) => t.companyId === companyFilter);
      }
    }

    // Priority Filter
    if (priorityFilter !== 'all') {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    // Status Filter
    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter);
    }

    // Search Keyword Filter
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      result = result.filter((t) => {
        const titleMatch = t.title.toLowerCase().includes(keyword);
        const compName = t.companyId ? companyMap.get(t.companyId) || '' : '노무법인 내부';
        const compMatch = compName.toLowerCase().includes(keyword);
        const workerName = t.workerId ? workerMap.get(t.workerId) || '' : '';
        const workerMatch = workerName.toLowerCase().includes(keyword);
        return titleMatch || compMatch || workerMatch;
      });
    }

    // Always sort by central sortTasks helper
    return sortTasks(result);
  }, [
    tasks,
    quickFilter,
    companyFilter,
    priorityFilter,
    statusFilter,
    searchKeyword,
    hideCompleted,
    companyMap,
    workerMap,
  ]);

  // Filtered workers for Create / Edit modal depending on selected company
  const availableWorkersForCreate = useMemo(() => {
    if (!createForm.companyId) return [];
    return workers.filter((w) => w.companyId === createForm.companyId);
  }, [workers, createForm.companyId]);

  const availableWorkersForEdit = useMemo(() => {
    if (!editForm.companyId) return [];
    return workers.filter((w) => w.companyId === editForm.companyId);
  }, [workers, editForm.companyId]);

  // Open Detail Modal
  const handleOpenDetail = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(false);
    setSourceError(null);
    setEditForm({
      title: task.title,
      description: task.description || '',
      companyId: task.companyId || '',
      workerId: task.workerId || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate || '',
    });
  };

  // Close Detail Modal
  const handleCloseDetail = () => {
    setSelectedTask(null);
    setIsEditing(false);
    setSourceError(null);
  };

  // Create Task Submission
  const handleCreateTask = async (e: React.FormEvent) => {
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
        companyId: createForm.companyId || undefined,
        workerId: createForm.workerId || undefined,
        priority: createForm.priority,
        status: createForm.status,
        dueDate: createForm.dueDate || undefined,
        sourceType: 'MANUAL',
      };

      const created = await taskService.createTask(input, actor);

      // Reset and refresh
      setTasks((prev) => sortTasks([created, ...prev]));
      setIsCreateModalOpen(false);
      setCreateForm({
        title: '',
        description: '',
        companyId: '',
        workerId: '',
        priority: 'NORMAL',
        status: 'TODO',
        dueDate: '',
      });
      setFeedback({ type: 'success', message: '새 업무가 성공적으로 등록되었습니다.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      console.error('Failed to create task:', err);
      setFeedback({ type: 'error', message: err.message || '업무 등록 중 오류가 발생했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Update Task Submission
  const handleUpdateTask = async (e: React.FormEvent) => {
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
        companyId: editForm.companyId || null,
        workerId: editForm.workerId || null,
        priority: editForm.priority,
        status: editForm.status,
        dueDate: editForm.dueDate || null,
      };

      const updated = await taskService.updateTask(selectedTask.id, input, actor);

      setTasks((prev) => sortTasks(prev.map((t) => (t.id === updated.id ? updated : t))));
      setSelectedTask(updated);
      setIsEditing(false);
      setFeedback({ type: 'success', message: '업무 정보가 성공적으로 수정되었습니다.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      console.error('Failed to update task:', err);
      setFeedback({ type: 'error', message: err.message || '업무 수정 중 오류가 발생했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Quick Complete Toggle from Row
  const handleToggleComplete = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setActionLoading(true);
      let updated: Task;
      if (task.status === 'COMPLETED') {
        updated = await taskService.reopenTask(task.id, 'IN_PROGRESS', actor);
        setFeedback({ type: 'success', message: '업무가 다시 진행 중으로 변경되었습니다.' });
      } else {
        updated = await taskService.completeTask(task.id, actor);
        setFeedback({ type: 'success', message: '업무가 완료 처리되었습니다.' });
      }
      setTasks((prev) => sortTasks(prev.map((t) => (t.id === updated.id ? updated : t))));
      if (selectedTask?.id === updated.id) {
        setSelectedTask(updated);
      }
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      console.error('Failed to toggle complete:', err);
      setFeedback({ type: 'error', message: err.message || '상태 변경 중 오류가 발생했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Cancel Task
  const handleCancelTask = async (taskId: string) => {
    try {
      setActionLoading(true);
      const updated = await taskService.cancelTask(taskId, actor);
      setTasks((prev) => sortTasks(prev.map((t) => (t.id === updated.id ? updated : t))));
      setSelectedTask(updated);
      setFeedback({ type: 'success', message: '업무가 취소 상태로 변경되었습니다.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      console.error('Failed to cancel task:', err);
      setFeedback({ type: 'error', message: err.message || '업무 취소 중 오류가 발생했습니다.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                통합 노무실
              </span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 border border-indigo-200">
                ADMIN 전용
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <CheckSquare className="h-6 w-6 text-indigo-600" />
              할 일·마감일 통합 관리
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              노무법인 전체 고객사의 주요 업무, 마감 일정 및 내부 할 일을 체계적으로 통합 관리합니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50 shadow-xs"
              title="목록 새로고침"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
              새로고침
            </button>
            <button
              onClick={() => {
                setCreateForm({
                  title: '',
                  description: '',
                  companyId: '',
                  workerId: '',
                  priority: 'NORMAL',
                  status: 'TODO',
                  dueDate: '',
                });
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-xs"
            >
              <Plus className="h-4 w-4" />
              할 일 추가
            </button>
          </div>
        </div>
      </div>

      {/* Global Toast / Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Requirement 2: 상단 요약 카드 (중앙 helper getTaskSummaryStats 기반 계산) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* 1. 오늘 할 일 */}
        <div
          onClick={() => {
            setQuickFilter('TODAY');
          }}
          className={`cursor-pointer rounded-2xl border p-4 transition shadow-xs ${
            quickFilter === 'TODAY'
              ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">오늘 할 일</span>
            <Clock className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats.dueToday}</span>
            <span className="text-xs text-slate-400">건</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">오늘 처리 목표 업무</p>
        </div>

        {/* 2. 오늘 마감 */}
        <div
          onClick={() => {
            setQuickFilter('TODAY');
          }}
          className={`cursor-pointer rounded-2xl border p-4 transition shadow-xs ${
            quickFilter === 'TODAY'
              ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-200'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700 font-semibold">오늘 마감</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-900">{stats.dueToday}</span>
            <span className="text-xs text-amber-600/70">건 마감</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-600">오늘 자정 마감 도래</p>
        </div>

        {/* 3. 기한 초과 */}
        <div
          onClick={() => {
            setQuickFilter('OVERDUE');
          }}
          className={`cursor-pointer rounded-2xl border p-4 transition shadow-xs ${
            quickFilter === 'OVERDUE'
              ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-200'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-700 font-semibold">기한 초과</span>
            <AlertCircle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-700">{stats.overdue}</span>
            <span className="text-xs text-rose-500">건 지연</span>
          </div>
          <p className="mt-1 text-[11px] text-rose-600">마감일이 지난 미완료</p>
        </div>

        {/* 4. 진행 중 */}
        <div
          onClick={() => {
            setQuickFilter('IN_PROGRESS');
          }}
          className={`cursor-pointer rounded-2xl border p-4 transition shadow-xs ${
            quickFilter === 'IN_PROGRESS'
              ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-200'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">진행 중</span>
            <Layers className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {tasks.filter((t) => t.status === 'IN_PROGRESS').length}
            </span>
            <span className="text-xs text-slate-400">건 진행</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">현재 담당 진행 업무</p>
        </div>

        {/* 5. 완료 */}
        <div
          onClick={() => {
            setQuickFilter('COMPLETED');
          }}
          className={`cursor-pointer rounded-2xl border p-4 transition shadow-xs col-span-2 sm:col-span-1 ${
            quickFilter === 'COMPLETED'
              ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">완료</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">{stats.completed}</span>
            <span className="text-xs text-emerald-600/70">건 완료</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">처리가 종결된 업무</p>
        </div>
      </div>

      {/* Requirement 4: 필터 및 검색 컨트롤 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5 shadow-xs">
        {/* Quick Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'ALL', label: '전체', count: stats.incomplete },
              { key: 'TODAY', label: '오늘', count: stats.dueToday },
              { key: 'OVERDUE', label: '기한 초과', count: stats.overdue },
              { key: 'UPCOMING', label: '예정 (7일내)', count: stats.upcoming },
              { key: 'IN_PROGRESS', label: '진행 중', count: tasks.filter((t) => t.status === 'IN_PROGRESS').length },
              { key: 'COMPLETED', label: '완료', count: stats.completed },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setQuickFilter(tab.key as QuickFilterType)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 ${
                  quickFilter === tab.key
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    quickFilter === tab.key
                      ? 'bg-slate-800 text-slate-200'
                      : tab.key === 'OVERDUE' && tab.count > 0
                      ? 'bg-rose-100 text-rose-700'
                      : tab.key === 'TODAY' && tab.count > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* 완료·취소 업무 숨기기/보기 토글 (ALL 필터일 때 활성화) */}
          {quickFilter === 'ALL' && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!hideCompleted}
                onChange={(e) => setHideCompleted(!e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>완료·취소 업무 포함하여 전체보기</span>
            </label>
          )}
        </div>

        {/* Detailed Filters & Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="업무 제목, 기업명, 근로자명 검색..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition"
            />
            {searchKeyword && (
              <button
                onClick={() => setSearchKeyword('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Company Filter Dropdown */}
          <div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition"
            >
              <option value="all">전체 기업 (내부 업무 포함)</option>
              <option value="__NONE__">노무법인 내부 업무 (기업 미지정)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter Dropdown */}
          <div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition"
            >
              <option value="all">전체 중요도</option>
              <option value="URGENT">긴급 (URGENT)</option>
              <option value="HIGH">높음 (HIGH)</option>
              <option value="NORMAL">보통 (NORMAL)</option>
              <option value="LOW">낮음 (LOW)</option>
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition"
            >
              <option value="all">전체 상태</option>
              <option value="TODO">대기중 (TODO)</option>
              <option value="IN_PROGRESS">진행중 (IN_PROGRESS)</option>
              <option value="COMPLETED">완료 (COMPLETED)</option>
              <option value="CANCELLED">취소됨 (CANCELLED)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requirement 3: 기본 목록 (미완료 중심 & sortTasks 정렬 적용) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">업무 목록</span>
            <span className="text-xs text-slate-500 font-medium">
              (총 {filteredTasks.length}건)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            * 기한초과 &gt; 오늘마감 &gt; 긴급도 &gt; 마감임박순으로 자동 정렬됩니다.
          </span>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mx-auto" />
            <p className="mt-2 text-xs text-slate-500">할 일 목록을 불러오는 중입니다...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="py-16 text-center">
            <CheckSquare className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">해당 조건의 업무가 없습니다.</p>
            <p className="mt-1 text-xs text-slate-400">
              새로운 업무를 등록하거나 필터 조건을 조정해보세요.
            </p>
            <button
              onClick={() => {
                setQuickFilter('ALL');
                setCompanyFilter('all');
                setPriorityFilter('all');
                setStatusFilter('all');
                setSearchKeyword('');
                setHideCompleted(false);
              }}
              className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              <RotateCcw className="h-3 w-3" />
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTasks.map((task) => {
              const dueStatus = calculateTaskDueStatus(task);
              const daysUntil = getDaysUntilDue(task.dueDate);
              const companyName = task.companyId
                ? companyMap.get(task.companyId) || '고객사'
                : '노무법인 내부';
              const workerName = task.workerId ? workerMap.get(task.workerId) || '근로자' : null;
              const isDone = task.status === 'COMPLETED';
              const isCancelled = task.status === 'CANCELLED';

              return (
                <div
                  key={task.id}
                  onClick={() => handleOpenDetail(task)}
                  className={`p-4 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/80 ${
                    dueStatus === 'OVERDUE'
                      ? 'bg-rose-50/20'
                      : dueStatus === 'TODAY'
                      ? 'bg-amber-50/20'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Quick Complete Button */}
                    <button
                      type="button"
                      disabled={actionLoading || isCancelled}
                      onClick={(e) => handleToggleComplete(task, e)}
                      title={isDone ? '완료 취소 (진행중으로 복원)' : '업무 완료 처리'}
                      className={`mt-0.5 shrink-0 h-5 w-5 rounded border flex items-center justify-center transition ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : isCancelled
                          ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed'
                          : 'border-slate-300 bg-white hover:border-indigo-500 hover:bg-indigo-50 text-transparent hover:text-indigo-600'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      {/* Top Badges: Priority, Status, SourceType */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Priority Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            PRIORITY_LABELS[task.priority].bg
                          } ${PRIORITY_LABELS[task.priority].textCol} ${
                            PRIORITY_LABELS[task.priority].border
                          }`}
                        >
                          {PRIORITY_LABELS[task.priority].text}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            STATUS_LABELS[task.status].bg
                          } ${STATUS_LABELS[task.status].textCol}`}
                        >
                          {STATUS_LABELS[task.status].text}
                        </span>

                        {/* Source Type Badge */}
                        {task.sourceType && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium border border-slate-200">
                            {SOURCE_TYPE_LABELS[task.sourceType]}
                          </span>
                        )}

                        {/* Due Status Warning Badge (기한초과 / 오늘마감) */}
                        {dueStatus === 'OVERDUE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <AlertCircle className="h-3 w-3" />
                            기한 초과 {daysUntil !== null && `(D+${Math.abs(daysUntil)})`}
                          </span>
                        )}
                        {dueStatus === 'TODAY' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <Clock className="h-3 w-3" />
                            오늘 마감 (D-Day)
                          </span>
                        )}
                        {dueStatus === 'UPCOMING' && daysUntil !== null && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            D-{daysUntil}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3
                        className={`text-sm font-semibold text-slate-900 line-clamp-1 ${
                          isDone ? 'line-through text-slate-400' : isCancelled ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {task.title}
                      </h3>

                      {/* Description Preview (if exists) */}
                      {task.description && (
                        <p className="text-xs text-slate-500 line-clamp-1">
                          {task.description}
                        </p>
                      )}

                      {/* Metadata Details: Company, Worker, Due Date */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-0.5">
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          {companyName}
                        </span>

                        {workerName && (
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            {workerName}
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {task.dueDate ? (
                            <span
                              className={
                                dueStatus === 'OVERDUE'
                                  ? 'text-rose-600 font-semibold'
                                  : dueStatus === 'TODAY'
                                  ? 'text-amber-700 font-semibold'
                                  : ''
                              }
                            >
                              마감: {task.dueDate}
                            </span>
                          ) : (
                            <span className="text-slate-400">마감일 미지정</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Quick Action Arrow */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className="text-xs text-slate-400 sm:hidden">상세보기</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Requirement 5: 새 업무 등록 모달 ([할 일 추가]) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">새 할 일 등록</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              {/* Title (필수) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  업무 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="예: (주)알파 10월 급여자료 검토 및 확인"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Description (선택) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  상세 설명 (선택)
                </label>
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="업무 진행 시 확인할 세부 사항이나 참고 메모를 입력하세요."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Target: Company & Worker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Company Select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    관련 기업 (선택)
                  </label>
                  <select
                    value={createForm.companyId}
                    onChange={(e) => {
                      const newCompanyId = e.target.value;
                      setCreateForm({
                        ...createForm,
                        companyId: newCompanyId,
                        // reset workerId if company changes
                        workerId: '',
                      });
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">선택 안 함 (노무법인 내부 업무)</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Worker Select (해당 기업 근로자만 노출) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    관련 근로자 (선택)
                  </label>
                  <select
                    disabled={!createForm.companyId}
                    value={createForm.workerId}
                    onChange={(e) => setCreateForm({ ...createForm, workerId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">
                      {!createForm.companyId
                        ? '기업을 먼저 선택해주세요'
                        : '선택 안 함 (기업 공통)'}
                    </option>
                    {availableWorkersForCreate.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.department ? `(${w.department})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Priority */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    중요도 (Priority)
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, priority: e.target.value as TaskPriority })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="LOW">낮음 (LOW)</option>
                    <option value="NORMAL">보통 (NORMAL)</option>
                    <option value="HIGH">높음 (HIGH)</option>
                    <option value="URGENT">긴급 (URGENT)</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    초기 상태
                  </label>
                  <select
                    value={createForm.status}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, status: e.target.value as TaskStatus })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="TODO">대기중 (TODO)</option>
                    <option value="IN_PROGRESS">진행중 (IN_PROGRESS)</option>
                  </select>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  마감일자 (선택)
                </label>
                <input
                  type="date"
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-xs disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Requirement 6: 업무 상세 / 수정 모달 ([업무 상세/수정]) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">업무 상세 정보</h3>
              </div>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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

            <div className="p-6 space-y-5">
              {/* Quick Status Action Bar */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">현재 상태:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                      STATUS_LABELS[selectedTask.status].bg
                    } ${STATUS_LABELS[selectedTask.status].textCol}`}
                  >
                    {STATUS_LABELS[selectedTask.status].text}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {selectedTask.status !== 'COMPLETED' ? (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleToggleComplete(selectedTask, {} as any)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      완료 처리
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleToggleComplete(selectedTask, {} as any)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      재오픈 (진행중으로 복원)
                    </button>
                  )}

                  {selectedTask.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleCancelTask(selectedTask.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition disabled:opacity-50"
                    >
                      <Ban className="h-3 w-3" />
                      업무 취소
                    </button>
                  )}
                </div>
              </div>

              {/* View / Edit Mode Toggle */}
              {!isEditing ? (
                /* VIEW MODE */
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 break-words">
                      {selectedTask.title}
                    </h2>
                    {selectedTask.description ? (
                      <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {selectedTask.description}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400 italic">상세 설명이 없습니다.</p>
                    )}
                  </div>

                  {/* Attributes Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block mb-0.5">관련 기업</span>
                      <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        {selectedTask.companyId
                          ? companyMap.get(selectedTask.companyId) || selectedTask.companyId
                          : '노무법인 내부 업무 (공통)'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block mb-0.5">관련 근로자</span>
                      <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        {selectedTask.workerId
                          ? workerMap.get(selectedTask.workerId) || selectedTask.workerId
                          : '지정 안 됨'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block mb-0.5">중요도</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                          PRIORITY_LABELS[selectedTask.priority].bg
                        } ${PRIORITY_LABELS[selectedTask.priority].textCol} ${
                          PRIORITY_LABELS[selectedTask.priority].border
                        }`}
                      >
                        {PRIORITY_LABELS[selectedTask.priority].text}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block mb-0.5">마감일자</span>
                      <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {selectedTask.dueDate || '미지정'}
                      </span>
                    </div>

                    {/* 출처 정보 */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 col-span-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-slate-400 block mb-0.5">출처 정보</span>
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 text-slate-400" />
                            {SOURCE_TYPE_LABELS[selectedTask.sourceType || 'MANUAL']}
                            {selectedTask.sourceId && (
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                ({selectedTask.sourceId})
                              </span>
                            )}
                          </span>
                        </div>
                        {/* [R3-3 3/3-B-④-A] 원본 업무 보기 버튼 (MANUAL 미노출, 4개 출처 대상: INQUIRY, DATA_REQUEST, MATERNITY, PAYROLL) */}
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
                                setSourceError(null);
                                const exists = await taskService.verifySourceExists(
                                  selectedTask.sourceType,
                                  selectedTask.sourceId
                                );
                                if (!exists) {
                                  setSourceError('원본 업무를 찾을 수 없습니다.');
                                  setFeedback({ type: 'error', message: '원본 업무를 찾을 수 없습니다.' });
                                  setTimeout(() => setFeedback(null), 4000);
                                  return;
                                }
                                if (onNavigateToSource) {
                                  onNavigateToSource(
                                    selectedTask.sourceType,
                                    selectedTask.sourceId,
                                    selectedTask.companyId,
                                    selectedTask.workerId
                                  );
                                  handleCloseDetail();
                                }
                              } catch (err) {
                                setSourceError('원본 업무를 찾을 수 없습니다.');
                                setFeedback({ type: 'error', message: '원본 업무를 찾을 수 없습니다.' });
                                setTimeout(() => setFeedback(null), 4000);
                              } finally {
                                setActionLoading(false);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg transition shadow-2xs disabled:opacity-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            원본 업무 보기
                          </button>
                        )}
                      </div>
                      {sourceError && (
                        <div className="pt-1.5 border-t border-rose-200/60 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>{sourceError}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      내용 수정하기
                    </button>
                  </div>
                </div>
              ) : (
                /* EDIT MODE */
                <form onSubmit={handleUpdateTask} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      업무 제목 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={200}
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        관련 기업
                      </label>
                      <select
                        value={editForm.companyId}
                        onChange={(e) => {
                          const newCompId = e.target.value;
                          setEditForm({
                            ...editForm,
                            companyId: newCompId,
                            workerId: '', // 기업 변경 시 기존 근로자 초기화
                          });
                        }}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="">선택 안 함 (노무법인 내부 업무)</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.companyName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        관련 근로자
                      </label>
                      <select
                        disabled={!editForm.companyId}
                        value={editForm.workerId}
                        onChange={(e) => setEditForm({ ...editForm, workerId: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">
                          {!editForm.companyId ? '기업을 먼저 선택해주세요' : '선택 안 함'}
                        </option>
                        {availableWorkersForEdit.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} {w.department ? `(${w.department})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

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
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="LOW">낮음 (LOW)</option>
                        <option value="NORMAL">보통 (NORMAL)</option>
                        <option value="HIGH">높음 (HIGH)</option>
                        <option value="URGENT">긴급 (URGENT)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        상태
                      </label>
                      <select
                        value={editForm.status}
                        onChange={(e) =>
                          setEditForm({ ...editForm, status: e.target.value as TaskStatus })
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="TODO">대기중 (TODO)</option>
                        <option value="IN_PROGRESS">진행중 (IN_PROGRESS)</option>
                        <option value="COMPLETED">완료됨 (COMPLETED)</option>
                        <option value="CANCELLED">취소됨 (CANCELLED)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        마감일자
                      </label>
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      disabled={actionLoading}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                    >
                      수정 취소
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-xs disabled:opacity-50"
                    >
                      {actionLoading ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      저장하기
                    </button>
                  </div>
                </form>
              )}

              {/* Metadata & Audit Trail Section */}
              <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span>
                    등록: {selectedTask.createdByName || '관리자'} ({new Date(selectedTask.createdAt).toLocaleString()})
                  </span>
                  <span>
                    최종수정: {selectedTask.updatedByName || '관리자'} ({new Date(selectedTask.updatedAt).toLocaleString()})
                  </span>
                </div>
                {selectedTask.completedAt && (
                  <div className="text-emerald-600 font-medium">
                    완료일시: {new Date(selectedTask.completedAt).toLocaleString()}
                  </div>
                )}
                {selectedTask.sourceType && selectedTask.sourceType !== 'MANUAL' && (
                  <div>
                    출처 정보: {SOURCE_TYPE_LABELS[selectedTask.sourceType]}{' '}
                    {selectedTask.sourceId && `(ID: ${selectedTask.sourceId})`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
