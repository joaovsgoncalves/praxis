import React, { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import MobileTopBar from './MobileTopBar';
import ParticleBackground from '@/components/shared/ParticleBackground';
import PraxisLevelUpListener from '@/components/gamification/PraxisLevelUpListener';
import OfflineBanner from '@/components/shared/OfflineBanner';

const WorkoutSessionModeContext = createContext(null);

export function useWorkoutSessionMode(active) {
  const setWorkoutSessionMode = useContext(WorkoutSessionModeContext);

  useEffect(() => {
    if (!setWorkoutSessionMode) return undefined;
    setWorkoutSessionMode(Boolean(active));
    return () => setWorkoutSessionMode(false);
  }, [active, setWorkoutSessionMode]);
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workoutSessionMode, setWorkoutSessionMode] = useState(false);
  const location = useLocation();
  const isLogin = location.pathname === '/login';

  useEffect(() => {
    document.title = 'Praxis';
  }, [location.pathname]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <WorkoutSessionModeContext.Provider value={setWorkoutSessionMode}>
      <div className="praxis-app min-h-screen bg-background relative">
        <PraxisLevelUpListener />
        {!workoutSessionMode ? <ParticleBackground /> : null}
        {!workoutSessionMode ? <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} /> : null}

        <div className={workoutSessionMode ? 'relative z-10' : 'lg:pl-72 relative z-10'}>
          {!isLogin && !workoutSessionMode ? <MobileTopBar onOpenMenu={() => setSidebarOpen(true)} /> : null}
          <main
            className={
              isLogin
                ? 'p-4 max-w-[1480px] mx-auto'
                : workoutSessionMode
                  ? 'mx-auto max-w-xl px-3 py-3 sm:px-4 sm:py-5'
                  : 'mx-auto max-w-[1480px] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-5 md:pb-10 lg:p-6 lg:pb-10'
            }
          >
            {!isLogin && !workoutSessionMode ? <OfflineBanner /> : null}
            <Outlet />
          </main>
        </div>

        {!isLogin && !workoutSessionMode ? <MobileBottomNav onOpenMenu={() => setSidebarOpen(true)} /> : null}
      </div>
    </WorkoutSessionModeContext.Provider>
  );
}
