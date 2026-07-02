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
    setLoading(true);
    try {
      await forjaApi.auth.login(password);
      onSuccess?.();
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('503')) {
        setError('Login ainda não configurado no servidor. Avise a A.N.A.');
      } else if (msg.includes('401')) {
        setError('Senha incorreta.');
      } else {
        setError('Não foi possível entrar. Tenta de novo.');
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
          <h1 className="forja-title text-2xl">Entrar no cockpit</h1>
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