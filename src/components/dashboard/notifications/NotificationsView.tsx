import React, { useEffect, useState } from 'react';
import { NotificationItem, UserRole } from '../../../types';
import { notificationService } from '../../../services/notificationService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Bell,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  CheckCheck,
  Send,
  X,
} from 'lucide-react';

interface NotificationsViewProps {
  role: UserRole;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ role }) => {
  const { currentUser, userProfile } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notifType, setNotifType] = useState('공지사항');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchNotifications = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const list = await notificationService.getUserNotifications(currentUser.uid);
      setNotifications(list || []);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [currentUser]);

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !title.trim() || !content.trim()) return;

    try {
      setIsSubmitting(true);
      await notificationService.createNotification({
        userId: targetUserId.trim() || currentUser.uid,
        type: notifType,
        title: title.trim(),
        content: content.trim(),
        isRead: false,
      });

      setIsModalOpen(false);
      setTitle('');
      setContent('');
      await fetchNotifications();
    } catch (err) {
      console.error('Failed to create notification', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications(
        notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark read', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await notificationService.deleteNotification(id);
      setNotifications(notifications.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification', err);
    }
  };

  const filtered = notifications.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              시스템 관리
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              총 {notifications.length}건
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Bell className="h-6 w-6 text-slate-700" />
            알림 관리
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            시스템 전체 공지, 개별 회원사 알림 발송 및 사용자별 알림 수신 내역을 관리합니다.
          </p>
        </div>

        {role === 'ADMIN' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition"
          >
            <Plus className="h-4 w-4" />
            알림 발송
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex justify-between items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="알림 제목 또는 본문 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs focus:border-slate-800 focus:outline-none"
          />
        </div>
      </div>

      {/* Notifications List */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">알림 목록 불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Bell className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">도착한 알림이 없습니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <div
                key={item.id}
                className={`p-4 hover:bg-slate-50 transition flex items-start justify-between gap-3 ${
                  item.isRead ? 'bg-white' : 'bg-blue-50/30'
                }`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {item.type}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.createdAt).toLocaleString('ko-KR')}
                    </span>
                    {!item.isRead && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                        NEW
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.content}</p>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {!item.isRead && (
                    <button
                      onClick={() => handleMarkAsRead(item.id)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                      읽음 처리
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                    title="알림 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Notification Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Bell className="h-4 w-4 text-slate-700" />
                알림 발송
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNotification} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">알림 분류</label>
                <select
                  value={notifType}
                  onChange={(e) => setNotifType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white"
                >
                  <option value="공지사항">공지사항</option>
                  <option value="급여알림">급여알림</option>
                  <option value="자료요청">자료요청</option>
                  <option value="모성보호">모성보호</option>
                  <option value="법률자문">법률자문</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  알림 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 3월 노무자문 리포트가 발행되었습니다."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  알림 본문 내용 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="회원에게 전송할 알림 상세 내용을 입력해 주세요."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-slate-900 focus:outline-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isSubmitting ? '발송 중...' : '알림 발송'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
