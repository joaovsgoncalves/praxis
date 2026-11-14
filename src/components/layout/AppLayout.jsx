import React, { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import MobileTopBar from './MobileTopBar';
import { RouteSkeleton } from './PageSkeletons';
import ParticleBackground from '@/components/shared/ParticleBackground';
import PraxisLevelUpListener from '@/components/gamification/PraxisLevelUpListener';
import OfflineBanner from '@/components/shared/OfflineBanner';
import WhatsNewDialog from '@/components/shared/WhatsNewDialog';
import PendingIntentPrompt from '@/components/shared/PendingIntentPrompt';
import { tweenFast } from '@/lib/motion';
import { mobileNavItems, primaryNavItems } from '@/lib/praxisNav';
import { prefetchWhenIdle } from '@/lib/routePrefetch';

// Abas do dia a dia: depois que a primeira tela assenta, já ficam baixadas.
const IDLE_PREFETCH = [...new Set([...mobileNavItems, ...primaryNavItems].map((item) => item.path))];

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

  useEffect(() => prefetchWhenIdle(IDLE_PREFETCH), []);

  return (
    // reducedMotion="user": com movimento reduzido no sistema, o framer-motion não move nada.
    // transition padrão = tween curto; sem mola implícita onde a tela não definiu transição.
    <MotionConfig reducedMotion="user" transition={tweenFast}>
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
            {/* Troca de aba: só o conteúdo entra em fade de opacidade; menu e topo ficam parados. */}
            <div key={location.pathname} className="praxis-route-fade">
              <Suspense fallback={<RouteSkeleton pathname={location.pathname} />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>

        {!isLogin ? <MobileBottomNav /> : null}
        <WhatsNewDialog />
        <PendingIntentPrompt />
      </div>
    </MotionConfig>
  );
}
