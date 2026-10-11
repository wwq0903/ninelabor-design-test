import React, { useEffect, useState, useRef } from 'react';
import { NotificationItem } from '../../../types';
import { notificationService } from '../../../services/notificationService';
import { useAuth } from '../../../contexts/AuthContext';
import { Bell, Check, Trash2, X, CheckCheck, Clock } from 'lucide-react';

export const NotificationsPopover: React.FC = () => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications(
        notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark as read', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead(notifications);
      setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Failed to mark all as read', err);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
        title="알림 확인"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl z-50 overflow-hidden">
          {/* Popover Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 px-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">알림</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.2 text-[10px] font-bold text-rose-700 border border-rose-200">
                  {unreadCount}개 읽지 않음
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" />
                모두 읽음
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 my-1">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-400">알림 불러오는 중...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                수신된 새로운 알림이 없습니다.
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3 transition flex items-start justify-between gap-2 ${
                    notif.isRead ? 'bg-white opacity-70' : 'bg-blue-50/40 font-medium'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-500">
                        {notif.type || '업무 알림'}
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {new Date(notif.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 truncate">{notif.title}</h5>
                    <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                      {notif.content}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <button
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="shrink-0 p-1 text-blue-600 hover:bg-blue-100 rounded transition"
                      title="읽음 표시"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 pt-2 px-2 text-center">
            <span className="text-[10px] text-slate-400">노무법인 나인 통합 노무관리 알림 서비스</span>
          </div>
        </div>
      )}
    </div>
  );
};
