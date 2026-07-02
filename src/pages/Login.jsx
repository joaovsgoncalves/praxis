import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forjaApi } from '@/api/forjaClient';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const pwd = password.trim();
    if (!pwd) return;
    setLoading(true);
    try {
      const session = await forjaApi.auth.login(pwd);
      onSuccess?.(session);
    } catch (err) {
      const msg = err?.message || '';
      const status = err?.status;
      if (msg.includes('503') || status === 503) {
        setError('Login ainda não configurado no servidor. Defina PRAXIS_APP_PASSWORD na VPS.');
      } else if (msg.includes('401') || status === 401) {
        setError('Senha incorreta. Confere maiúsculas, símbolos e tenta de novo.');
      } else if (msg.includes('429') || status === 429) {
        setError('Muitas tentativas — espera uns 15 min e tenta de novo.');
      } else {
        setError('Não foi possível entrar. Tenta de novo ou abre em aba anônima.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 forja-panel p-8">
        <div className="text-center space-y-2">
          <p className="forja-kicker text-primary">Praxis</p>
          <h1 className="forja-title text-2xl">Entrar</h1>
          <p className="text-sm text-muted-foreground">
            Uso pessoal — senha definida no servidor.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}