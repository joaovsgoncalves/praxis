import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { lazy, Suspense, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { routeLoaders } from '@/lib/routePrefetch';
import { hasSessionHint } from '@/lib/sessionHint';
import { PraxisLoadingSplash, PraxisCenteredShell } from '@/components/layout/PraxisPage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Cada tela é um chunk próprio: quem abre a landing não baixa o app logado (recharts, dnd, finanças…).
const Landing = lazy(routeLoaders.landing);
const Login = lazy(routeLoaders.login);
const AppLayout = lazy(routeLoaders.layout);
const Dashboard = lazy(routeLoaders['/']);
const HabitsTasks = lazy(routeLoaders['/habitos-tarefas']);
const Ideas = lazy(routeLoaders['/ideias']);
const Compras = lazy(routeLoaders['/compras']);
const Financas = lazy(routeLoaders['/financas']);
const Projects = lazy(routeLoaders['/frentes']);
const Focus = lazy(routeLoaders['/foco']);
const Goals = lazy(routeLoaders['/metas']);
const History = lazy(routeLoaders['/historico']);
const Settings = lazy(routeLoaders['/configuracoes']);
const VoiceCapture = lazy(routeLoaders['/captura']);
const ShareCapture = lazy(routeLoaders['/compartilhar']);
const CaptureInbox = lazy(routeLoaders['/capturas']);
const Achievements = lazy(routeLoaders['/conquistas']);
const WeeklyReview = lazy(routeLoaders['/revisao-semanal']);
const JotaFitRedirect = lazy(() => import('@/components/jota-fit/JotaFitRedirect'));

/** Página pública: enquanto o chunk chega, fica o fundo escuro do index.html (sem splash, sem branco). */
function PublicPage({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

const AuthenticatedApp = () => {
  const location = useLocation();
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    isAuthenticated,
    onLoginSuccess,
    webAuthEnabled,
  } = useAuth();

  const isLandingPath = location.pathname === '/';
  const isLoginPath = location.pathname === '/entrar';
  // Visitante sem pista de sessão (é o caso do teste do Google): landing e login pintam
  // na hora, sem esperar /api/auth/me. Quem já entrou neste navegador vê o splash.
  const [guestFirst] = useState(() => !hasSessionHint());
  const isWaiting = isLoadingPublicSettings || isLoadingAuth;

  if (isWaiting && !(guestFirst && (isLandingPath || isLoginPath))) {
    return <PraxisLoadingSplash message="Carregando o Praxis…" />;
  }

  if (isLandingPath && !isAuthenticated) {
    return (
      <PublicPage>
        <Landing />
      </PublicPage>
    );
  }

  if (isLoginPath && !isAuthenticated && webAuthEnabled) {
    return (
      <PublicPage>
        <Login onSuccess={onLoginSuccess} />
      </PublicPage>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required' || !isAuthenticated) {
      if (webAuthEnabled) {
        return (
          <PublicPage>
            <Login onSuccess={onLoginSuccess} />
          </PublicPage>
        );
      }
    }
    if (authError.type === 'network') {
      return (
        <PraxisCenteredShell>
          <Card className="glass-surface border-white/10">
            <CardContent className="p-8 text-center space-y-4">
              <p className="praxis-kicker text-destructive">Sem conexão</p>
              <h1 className="praxis-title text-xl font-semibold">API fora do ar</h1>
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

  if (isLoginPath && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!isAuthenticated && webAuthEnabled) {
    return (
      <PublicPage>
        <Login onSuccess={onLoginSuccess} />
      </PublicPage>
    );
  }

  // Splash só enquanto o layout (menu, topo) chega; a troca de tela usa o skeleton dentro dele.
  return (
    <Suspense fallback={<PraxisLoadingSplash message="Carregando o Praxis…" />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/habitos-tarefas" element={<HabitsTasks />} />
          <Route path="/ideias" element={<Ideas />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/financas" element={<Financas />} />
          <Route path="/frentes" element={<Projects />} />
          <Route path="/projetos" element={<Navigate to="/frentes" replace />} />
          <Route path="/jota-fit/*" element={<JotaFitRedirect />} />
          <Route path="/treinos" element={<JotaFitRedirect />} />
          <Route path="/nutricao" element={<JotaFitRedirect />} />
          <Route path="/foco" element={<Focus />} />
          <Route path="/metas" element={<Goals />} />
          <Route path="/rituais" element={<Navigate to="/habitos-tarefas?tab=habits" replace />} />
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
    </Suspense>
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
