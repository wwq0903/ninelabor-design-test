import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { PublicWebsite } from './components/public/PublicWebsite';
import { PortalShell } from './components/dashboard/PortalShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'website' | 'portal'>('website');

  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-[Pretendard,sans-serif]">
        <Navbar currentTab={currentTab} onSelectTab={setCurrentTab} />
        <main className="flex-1">
          <ErrorBoundary key={currentTab} fallbackTitle="화면을 표시할 수 없습니다.">
            {currentTab === 'website' ? (
              <PublicWebsite onGoToPortal={() => setCurrentTab('portal')} />
            ) : (
              <PortalShell />
            )}
          </ErrorBoundary>
        </main>
      </div>
    </AuthProvider>
  );
}
