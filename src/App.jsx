import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import HabitsTasks from '@/pages/HabitsTasks';
import Ideas from '@/pages/Ideas';
import Focus from '@/pages/Focus';
import Goals from '@/pages/Goals';
import Rituais from '@/pages/Rituais';
import History from '@/pages/History';
import Settings from '@/pages/Settings';
import VoiceCapture from '@/pages/VoiceCapture';
import CaptureInbox from '@/pages/CaptureInbox';
import Achievements from '@/pages/Achievements';
import WeeklyReview from '@/pages/WeeklyReview';
import ShareCapture from '@/pages/ShareCapture';
import Login from '@/pages/Login';

const AuthenticatedApp = () => {
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    isAuthenticated,
    onLoginSuccess,
    webAuthEnabled,
  } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required' || !isAuthenticated) {
      if (webAuthEnabled) {
        return <Login onSuccess={onLoginSuccess} />;
      }
    }
    if (authError.type === 'network') {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">
          <p>Não consegui falar com a API. {authError.message}</p>
        </div>
      );
    }
  }

  if (!isAuthenticated && webAuthEnabled) {
    return <Login onSuccess={onLoginSuccess} />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/habitos-tarefas" element={<HabitsTasks />} />
        <Route path="/ideias" element={<Ideas />} />
        <Route path="/foco" element={<Focus />} />
        <Route path="/metas" element={<Goals />} />
        <Route path="/rituais" element={<Rituais />} />
        <Route path="/historico" element={<History />} />
        <Route path="/configuracoes" element={<Settings />} />
        <Route path="/captura" element={<VoiceCapture />} />
        <Route path="/compartilhar" element={<ShareCapture />} />
        <Route path="/capturas" element={<CaptureInbox />} />
        <Route path="/conquistas" element={<Achievements />} />
        <Route path="/revisao-semanal" element={<WeeklyReview />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
