import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { forjaApi } from '@/api/forjaClient';
import { Button } from '@/components/ui/button';
import { Loader2, Share2 } from 'lucide-react';

function buildSharedText({ title, text, url }) {
  const parts = [];
  if (text?.trim()) parts.push(text.trim());
  if (title?.trim() && title.trim() !== text?.trim()) parts.push(title.trim());
  if (url?.trim()) parts.push(url.trim());
  return parts.join('\n').trim();
}

export default function ShareCapture() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState('');

  const payload = useMemo(
    () =>
      buildSharedText({
        title: searchParams.get('title') || '',
        text: searchParams.get('text') || '',
        url: searchParams.get('url') || '',
      }),
    [searchParams],
  );

  useEffect(() => {
    if (started.current) return;
    if (!payload || payload.length < 2) {
      setError('Nada para capturar. Compartilhe um texto ou link de outro app.');
      return;
    }
    started.current = true;
    (async () => {
      try {
        const res = await forjaApi.captures.createText(payload, 'share');
        navigate(`/captura?capture=${res.capture_id}`, { replace: true });
      } catch (e) {
        setError(e?.message || 'Falha ao enfileirar. Tente de novo.');
        started.current = false;
      }
    })();
  }, [payload, navigate]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
      <Share2 className="mx-auto h-10 w-10 text-primary" />
      <h1 className="text-xl font-semibold">Enviando para o Praxis…</h1>
      {error ? (
        <>
          <p className="text-sm text-destructive">{error}</p>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/captura">Ir para captura</Link>
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Organizando tarefas a partir do que você compartilhou.
        </p>
      )}
    </div>
  );
}