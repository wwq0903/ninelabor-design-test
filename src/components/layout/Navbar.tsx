import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { RoleBadge } from '../common/RoleBadge';
import { NotificationsPopover } from '../dashboard/notifications/NotificationsPopover';
import { LoginModal } from '../auth/LoginModal';
import { RegisterModal } from '../auth/RegisterModal';
import { PolicyModal } from '../common/PolicyModal';
import {
  Briefcase,
  LogOut,
  LogIn,
  ChevronDown,
  Globe,
  UserPlus,
  FileText,
  AlertTriangle,
} from 'lucide-react';

interface NavbarProps {
  currentTab: 'website' | 'portal';
  onSelectTab: (tab: 'website' | 'portal') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab }) => {
  const { currentUser, userProfile, isProfileIncomplete, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => onSelectTab('website')}
            className="flex items-center gap-3 text-left transition hover:opacity-90"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white font-bold tracking-wider shadow-sm">
              9
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  노무법인 나인
                </span>
                <span className="text-[10px] font-semibold tracking-wider text-blue-600 uppercase bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  NINELABOR
                </span>
              </div>
              <p className="text-[11px] text-slate-500">기업을 위한 통합 노무관리</p>
            </div>
          </button>

          {/* Primary View Switcher */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => onSelectTab('website')}
              aria-label="노무법인 나인 홈페이지로 이동"
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition ${
                currentTab === 'website'
                  ? 'bg-slate-100 text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Globe className="h-4 w-4" />
              법인 소개
            </button>
            <button
              aria-current={currentTab === 'portal' ? 'page' : undefined}
              onClick={() => {
                if (!currentUser) {
                  setIsLoginOpen(true);
                } else {
                  onSelectTab('portal');
                }
              }}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition ${
                currentTab === 'portal'
                  ? 'bg-slate-900 text-white shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Briefcase className="h-4 w-4" />
              통합 노무실
            </button>
          </nav>
        </div>

        {/* User / Auth Info */}
        <div className="flex items-center gap-3">
          {currentUser && userProfile ? (
            <div className="flex items-center gap-3">
              {/* User Profile Badge (Read-only, no role switching) */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-expanded={showUserMenu}
                  aria-haspopup="menu"
                  aria-label="내 계정 메뉴 열기"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition"
                  title="내 계정 정보"
                >
                  <RoleBadge role={userProfile.role} size="sm" />
                  <span className="hidden sm:inline font-medium text-slate-800">
                    {userProfile.displayName}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-50">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <div className="text-xs text-slate-500">로그인 계정</div>
                      <div className="text-xs font-medium text-slate-800 truncate">
                        {userProfile.email}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span>현재 역할:</span>
                        <RoleBadge role={userProfile.role} size="sm" />
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setIsPolicyOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded-lg transition"
                      >
                        <FileText className="h-3.5 w-3.5 text-slate-500" />
                        이용약관 및 정책
                      </button>
                    </div>

                    <div className="border-t border-slate-100 pt-1">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        로그아웃
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notification Popover */}
              <NotificationsPopover />

              <button
                onClick={() => logout()}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                title="로그아웃"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">로그아웃</span>
              </button>
            </div>
          ) : currentUser && isProfileIncomplete ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span>회원정보 미완성</span>
              </div>
              <button
                onClick={() => onSelectTab('portal')}
                className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-xs"
              >
                <span>설정 완료</span>
              </button>
              <button
                onClick={() => logout()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                title="로그아웃"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPolicyOpen(true)}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                이용약관
              </button>
              <button
                onClick={() => setIsRegisterOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
              >
                <UserPlus className="h-4 w-4 text-blue-600" />
                회원가입
              </button>
              <button
                onClick={() => setIsLoginOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
              >
                <LogIn className="h-4 w-4" />
                로그인
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Mobile navigation remains available to signed-in and signed-out visitors. */}
      <nav aria-label="모바일 주요 메뉴" className="flex md:hidden border-t border-slate-100 bg-white px-3 py-2 gap-2">
        <button type="button" aria-current={currentTab === 'website' ? 'page' : undefined}
          onClick={() => onSelectTab('website')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${currentTab === 'website' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-700'}`}>
          <Globe className="h-4 w-4" /> 법인 소개
        </button>
        <button type="button" aria-current={currentTab === 'portal' ? 'page' : undefined}
          onClick={() => currentUser ? onSelectTab('portal') : setIsLoginOpen(true)}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${currentTab === 'portal' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-700'}`}>
          <Briefcase className="h-4 w-4" /> 통합노무실
        </button>
      </nav>
    </header>

    {/* Modals placed outside header containing block */}
    <LoginModal
      isOpen={isLoginOpen}
      onClose={() => setIsLoginOpen(false)}
      onOpenRegister={() => {
        setIsLoginOpen(false);
        setIsRegisterOpen(true);
      }}
      onSuccess={() => onSelectTab('portal')}
    />
    <RegisterModal
      isOpen={isRegisterOpen}
      onClose={() => setIsRegisterOpen(false)}
      onOpenLogin={() => {
        setIsRegisterOpen(false);
        setIsLoginOpen(true);
      }}
      onSuccess={() => onSelectTab('portal')}
    />
    <PolicyModal isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />
  </>
  );
};
