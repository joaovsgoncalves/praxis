import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { latestRelease } from '@/data/changelog';
import { readPendingIntent } from '@/lib/pendingIntent';
import {
  OPEN_WHATS_NEW_EVENT,
  isUserBusy,
  markReleaseSeen,
  readLastSeenRelease,
  shouldShowWhatsNew,
} from '@/lib/whatsNew';

// Espera a primeira tela assentar antes de abrir (não disputa a primeira pintura).
const OPEN_DELAY_MS = 1200;
// Pessoa ocupada: confere de novo neste intervalo até ela terminar.
const RECHECK_MS = 1000;

const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
const FIELD_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]';

function readUserBusy(lastInputAt) {
  return isUserBusy({
    overlayOpen: Boolean(document.querySelector(OVERLAY_SELECTOR)),
    focusInField: Boolean(document.activeElement?.matches?.(FIELD_SELECTOR)),
    msSinceLastInput: lastInputAt ? Date.now() - lastInputAt : null,
  });
}

function formatReleaseDate(isoDay) {
  const [year, month, day] = isoDay.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * "Últimas atualizações": abre uma vez por publicação, só no app logado (vive no AppLayout),
 * e só quando a pessoa não está editando nada.
 * Reabre pelo link em Configurações (evento OPEN_WHATS_NEW_EVENT).
 */
export default function WhatsNewDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldShowWhatsNew(readLastSeenRelease(), latestRelease)) return undefined;
    // Voltando de sessão perdida há uma pergunta mais urgente na tela; as novidades ficam para depois.
    if (readPendingIntent()) return undefined;
    // O aviso nunca abre por cima de formulário, painel ou menu: espera a pessoa terminar.
    let lastInputAt = 0;
    const onInput = () => { lastInputAt = Date.now(); };
    document.addEventListener('input', onInput, true);
    let timer = 0;
    const tryOpen = () => {
      if (readUserBusy(lastInputAt)) {
        timer = window.setTimeout(tryOpen, RECHECK_MS);
        return;
      }
      setOpen(true);
    };
    timer = window.setTimeout(tryOpen, OPEN_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('input', onInput, true);
    };
  }, []);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_WHATS_NEW_EVENT, reopen);
    return () => window.removeEventListener(OPEN_WHATS_NEW_EVENT, reopen);
  }, []);

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next && latestRelease) markReleaseSeen(latestRelease.id);
  };

  if (!latestRelease) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader className="space-y-1.5 text-left">
          <p className="text-xs font-medium text-muted-foreground">
            Últimas atualizações · {formatReleaseDate(latestRelease.date)}
          </p>
          <DialogTitle className="praxis-title text-xl font-semibold leading-snug text-balance">
            {latestRelease.title}
          </DialogTitle>
          <DialogDescription className="sr-only">O que mudou na Praxis nesta publicação.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2.5 text-sm leading-relaxed text-foreground/85">
          {latestRelease.items.map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-domain-gold" aria-hidden />
              <span className="text-pretty">{item}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" className="praxis-touch-target w-full rounded-full sm:w-auto" onClick={() => handleOpenChange(false)}>
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
