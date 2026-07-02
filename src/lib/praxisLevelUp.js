import { useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';

const shownLevels = new Set();

/** Dispara toast Praxis quando API retorna xp_sync.leveled_up (evento interno: forja-level-up). */
export function notifyPraxisLevelUp(detail) {
  if (!detail?.leveled_up) return;
  const level = detail.level;
  if (shownLevels.has(level)) return;
  shownLevels.add(level);
  toast({
    title: 'Subiu de nível no Praxis',
    description: `Nível ${level} — ${detail.level_name || ''}`.trim(),
    duration: 6000,
  });
  window.dispatchEvent(new CustomEvent('forja-confetti'));
}

export function usePraxisLevelUpListener() {
  useEffect(() => {
    const handler = (e) => notifyPraxisLevelUp(e.detail);
    window.addEventListener('forja-level-up', handler);
    return () => window.removeEventListener('forja-level-up', handler);
  }, []);
}

export function dispatchPraxisLevelUpFromResponse(payload) {
  const xp = payload?.xp_sync;
  if (!xp?.leveled_up) return;
  window.dispatchEvent(new CustomEvent('forja-level-up', { detail: xp }));
}