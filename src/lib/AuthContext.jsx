import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { praxisApi } from '@/api/praxisClient';
import { setSessionHint } from '@/lib/sessionHint';
import { clearSessionLost, subscribeSessionLost } from '@/lib/sessionGate';
import { clearPendingIntent, userKeyOf } from '@/lib/pendingIntent';
import { queryClientInstance } from '@/lib/query-client';
import { adoptAccount, purgeTabData, releaseAccount, subscribeAccountChanged, watchOtherTabs } from '@/lib/accountScope';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [webAuthEnabled, setWebAuthEnabled] = useState(true);
  // O login pode responder antes da checagem inicial (a landing/login já pintam sem esperar
  // por ela). Cada checagem tem um número; resposta de checagem velha é descartada.
  const checkSeq = useRef(0);
  const authedRef = useRef(false);
  authedRef.current = isAuthenticated;

  // A sessão caiu no meio do uso (401 em qualquer chamada protegida): um pedido de login só,
  // na mesma tela. O usuário anterior fica guardado para conferir quem entra de volta.
  useEffect(
    () =>
      subscribeSessionLost(({ reason }) => {
        if (!authedRef.current) return;
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', sessionLost: true, reason });
      }),
    [],
  );

  // A conta deste navegador mudou por fora desta aba (outra aba saiu ou entrou com outra conta,
  // ou o servidor respondeu por outra conta). Nada do que está na tela vale: recomeça do zero.
  useEffect(() => {
    const restart = () => {
      purgeTabData();
      queryClientInstance.clear();
      window.location.reload();
    };
    const offChanged = subscribeAccountChanged(restart);
    const offTabs = watchOtherTabs();
    return () => {
      offChanged();
      offTabs();
    };
  }, []);

  /** O servidor confirmou a conta: o que estiver guardado de outra conta sai antes de a tela pintar. */
  const enterAccount = useCallback((nextUser) => {
    const { switched } = adoptAccount(userKeyOf(nextUser));
    if (switched) queryClientInstance.clear();
    return switched;
  }, []);

  const checkUserAuth = useCallback(async () => {
    const seq = ++checkSeq.current;
    const stale = () => seq !== checkSeq.current;
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const config = await praxisApi.auth.config();
      if (stale()) return;
      setWebAuthEnabled(Boolean(config.webAuthEnabled));
      if (!config.webAuthEnabled) {
        enterAccount({ username: 'local' });
        setUser({ username: 'local', display_name: 'Local dev' });
        setIsAuthenticated(true);
        setAuthChecked(true);
        return;
      }
      if (!config.loginAvailable) {
        setAuthError({ type: 'auth_required', message: 'login_not_configured' });
        setIsAuthenticated(false);
        setAuthChecked(true);
        return;
      }
      const me = await praxisApi.auth.me();
      if (stale()) return;
      clearSessionLost();
      enterAccount(me.user);
      setUser(me.user);
      setIsAuthenticated(true);
      setAuthChecked(true);
      setSessionHint(true);
    } catch (err) {
      if (stale()) return;
      const status = err?.status || (err?.message?.includes('401') ? 401 : null);
      if (status === 401 || err?.message?.includes('401')) {
        setIsAuthenticated(false);
        setUser(null);
        setAuthError({ type: 'auth_required' });
        setSessionHint(false);
      } else {
        setAuthError({ type: 'network', message: err?.message });
      }
      setAuthChecked(true);
    } finally {
      if (!stale()) setIsLoadingAuth(false);
    }
  }, [enterAccount]);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const logout = async () => {
    try {
      await praxisApi.auth.logout();
    } catch {}
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required' });
    setSessionHint(false);
    clearPendingIntent();
    // Saiu: nada desta conta fica no navegador nem na memória da aba.
    releaseAccount();
    queryClientInstance.clear();
  };

  const navigateToLogin = () => {
    setAuthError({ type: 'auth_required' });
    setIsAuthenticated(false);
  };

  const onLoginSuccess = (session) => {
    setAuthError(null);
    clearSessionLost();
    // Entrou outra pessoa: nada do que estava guardado, em memória ou pendente vale para ela.
    // Quem diz se é a mesma conta é o que o navegador guardava, não o que esta aba lembra.
    if (session?.user) {
      const switched = enterAccount(session.user);
      if (switched) clearPendingIntent();
      else queryClientInstance.invalidateQueries();
    }
    if (session?.user) {
      checkSeq.current += 1;
      setSessionHint(true);
      setUser(session.user);
      setIsAuthenticated(true);
      setAuthChecked(true);
      setIsLoadingAuth(false);
    } else {
      checkUserAuth();
    }
  };

  const checkAppState = () => {};

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      webAuthEnabled,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      onLoginSuccess,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};