import { useEffect } from 'react';
import { JOTA_FIT_URL } from '@/lib/praxisNav';

// Fase 7 (2026-10-15): treino e alimentação moram no app Jota Fit.
// Links antigos (/jota-fit, /treinos, /nutricao) só levam para lá.
export default function JotaFitRedirect() {
  useEffect(() => {
    window.location.replace(JOTA_FIT_URL);
  }, []);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">Abrindo o Jota Fit…</p>
      <a className="text-sm font-medium text-domain-gold underline-offset-4 hover:underline" href={JOTA_FIT_URL}>
        Se não abrir, toque aqui
      </a>
    </div>
  );
}
