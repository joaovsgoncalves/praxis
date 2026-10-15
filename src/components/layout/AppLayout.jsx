import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import MobileTopBar from './MobileTopBar';
import ParticleBackground from '@/components/shared/ParticleBackground';
import PraxisLevelUpListener from '@/components/gamification/PraxisLevelUpListener';
import OfflineBanner from '@/components/shared/OfflineBanner';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isLogin = location.pathname === '/login';

  useEffect(() => {
    document.title = 'Praxis';
  }, [location.pathname]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="praxis-app min-h-screen bg-background relative">
      <PraxisLevelUpListener />
      <ParticleBackground />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-72 relative z-10">
        {!isLogin ? <MobileTopBar onOpenMenu={() => setSidebarOpen(true)} /> : null}
        <main
          className={
            isLogin
              ? 'p-4 max-w-[1480px] mx-auto'
              : 'mx-auto max-w-[1480px] p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-5 md:pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:p-6 lg:pb-10'
          }
        >
          {!isLogin ? <OfflineBanner /> : null}
          <Outlet />
        </main>
      </div>

      {!isLogin ? <MobileBottomNav onOpenMenu={() => setSidebarOpen(true)} /> : null}
    </div>
  );
}
