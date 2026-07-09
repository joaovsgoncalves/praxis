import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import HabitsTasks from '@/pages/HabitsTasks';
import Ideas from '@/pages/Ideas';
import Compras from '@/pages/Compras';
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
import { PraxisLoadingSplash, PraxisCenteredShell } from '@/components/layout/PraxisPage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
    return <PraxisLoadingSplash message="Carregando o Praxis…" />;
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
        <PraxisCenteredShell>
          <Card className="glass-surface border-white/10">
            <CardContent className="p-8 text-center space-y-4">
              <p className="forja-kicker text-destructive">Sem conexão</p>
              <h1 className="forja-title text-xl font-semibold">API fora do ar</h1>
              <p className="text-sm text-muted-foreground">{authError.message}</p>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => window.location.reload()}>
                Tentar de novo
              </Button>
            </CardContent>
          </Card>
        </PraxisCenteredShell>
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
        <Route path="/compras" element={<Compras />} />
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
        <Route path="/mais" element={<Navigate to="/" replace />} />
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
