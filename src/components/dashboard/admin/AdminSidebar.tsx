import React, { useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  DollarSign,
  Clock,
  CalendarCheck,
  CheckSquare,
  FileCheck,
  HeartHandshake,
  Building2,
  Users,
  Tag,
  CreditCard,
  Receipt,
  Mail,
  FileText,
  FolderOpen,
  Bell,
  Network,
  Activity,
  Settings,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  LucideIcon,
} from 'lucide-react';

export type AdminMenuKey =
  | 'dashboard'
  | 'inquiries'
  | 'tasks'
  | 'ai-consulting'
  | 'payroll'
  | 'overtime'
  | 'attendance'
  | 'data-requests'
  | 'maternity'
  | 'companies'
  | 'workers'
  | 'pricing'
  | 'subscriptions'
  | 'messages'
  | 'templates'
  | 'documents'
  | 'notifications'
  | 'integrations'
  | 'audit-logs'
  | 'settings';

interface MenuItem {
  key: AdminMenuKey;
  label: string;
  icon: LucideIcon;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface AdminSidebarProps {
  activeKey: AdminMenuKey;
  onSelect: (key: AdminMenuKey) => void;
}

export const ADMIN_SECTIONS: MenuSection[] = [
  {
    title: '통합 노무실',
    items: [
      { key: 'dashboard', label: '대시보드', icon: LayoutDashboard },
      { key: 'inquiries', label: '통합 문의', icon: MessageSquare },
      { key: 'tasks', label: '할 일·마감일', icon: CheckSquare },
      { key: 'ai-consulting', label: 'AI 상담관리', icon: Bot },
    ],
  },
  {
    title: '아웃소싱 관리',
    items: [
      { key: 'payroll', label: '급여관리', icon: DollarSign },
      { key: 'overtime', label: '추가근무 출근부', icon: Clock },
      { key: 'attendance', label: '출근부', icon: CalendarCheck },
      { key: 'data-requests', label: '자료요청 관리', icon: FileCheck },
    ],
  },
  {
    title: '모성보호 관리',
    items: [{ key: 'maternity', label: '모성보호 업무', icon: HeartHandshake }],
  },
  {
    title: '기업·회원 관리',
    items: [
      { key: 'companies', label: '기업관리', icon: Building2 },
      { key: 'workers', label: '근로자관리', icon: Users },
    ],
  },
  {
    title: '서비스 관리',
    items: [
      { key: 'pricing', label: '요금제 안내', icon: Tag },
      { key: 'subscriptions', label: '기업 플랜 관리', icon: CreditCard },
    ],
  },
  {
    title: '문서·소통',
    items: [
      { key: 'messages', label: '메시지함', icon: Mail },
      { key: 'templates', label: '메시지 서식', icon: FileText },
      { key: 'documents', label: '문서관리', icon: FolderOpen },
    ],
  },
  {
    title: '시스템 관리',
    items: [
      { key: 'notifications', label: '알림관리', icon: Bell },
      { key: 'integrations', label: '외부연동', icon: Network },
      { key: 'audit-logs', label: '활동기록', icon: Activity },
      { key: 'settings', label: '설정', icon: Settings },
    ],
  },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeKey, onSelect }) => {
  // Collapsible sections state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // Mobile drawer state
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const handleSelect = (key: AdminMenuKey) => {
    onSelect(key);
    setIsMobileOpen(false);
  };

  const activeLabel =
    ADMIN_SECTIONS.flatMap((s) => s.items).find((i) => i.key === activeKey)?.label || '대시보드';

  const sidebarContent = (
    <div className="space-y-4 py-2">
      {ADMIN_SECTIONS.map((section) => {
        const isCollapsed = !!collapsedSections[section.title];
        const hasActiveItem = section.items.some((item) => item.key === activeKey);

        return (
          <div key={section.title} className="space-y-1">
            <button
              onClick={() => toggleSection(section.title)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-700 transition"
            >
              <span className="flex items-center gap-1.5">
                {hasActiveItem && (
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-900"></span>
                )}
                {section.title}
              </span>
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              )}
            </button>

            {!isCollapsed && (
              <div className="space-y-0.5 pl-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeKey === item.key;

                  return (
                    <button
                      key={item.key}
                      onClick={() => handleSelect(item.key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition font-medium text-left ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="lg:hidden flex items-center justify-between border-b border-slate-200 bg-white p-3 mb-4 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">메뉴:</span>
          <span className="text-xs font-bold text-slate-900">{activeLabel}</span>
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {isMobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          <span>{isMobileOpen ? '닫기' : '메뉴 열기'}</span>
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsMobileOpen(false)}
          ></div>
          <div className="relative w-72 max-w-xs bg-white h-full shadow-2xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <span className="text-sm font-bold text-slate-900">통합 노무실 메뉴</span>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs self-start sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
        <div className="mb-3 px-3 pb-2 border-b border-slate-100">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
            통합 노무실
          </span>
          <span className="block text-[11px] text-slate-400 mt-0.5">최고관리자 업무공간</span>
        </div>
        {sidebarContent}
      </aside>
    </>
  );
};
