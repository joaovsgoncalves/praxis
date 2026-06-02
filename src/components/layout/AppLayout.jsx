import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ParticleBackground from '@/components/shared/ParticleBackground';
import { Menu } from 'lucide-react';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background relative">
      <ParticleBackground />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="lg:pl-72 relative z-10">
        <header className="sticky top-0 z-30 h-14 flex items-center px-4 lg:hidden bg-background/80 backdrop-blur-xl border-b border-border">
          <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
        </header>
        <main className="p-4 md:p-7 lg:p-10 max-w-[1480px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}