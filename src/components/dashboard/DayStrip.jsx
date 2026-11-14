import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check } from 'lucide-react';
import { fortalezaDisplayDate } from '@/lib/dates';

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Faixa do dia: data, hora, saudação e quanto falta pra fechar o dia.
 * Fechado = feito, não rolou ou não hoje.
 */
/** `unknown`: tarefas ou hábitos não foram lidos; zero ali seria mentira. */
export default function DayStrip({ greeting, clock, userName, left = 0, total = 0, unknown = false }) {
  const dateStr = format(fortalezaDisplayDate(), 'EEE d MMM', { locale: ptBR });
  const firstName = userName ? String(userName).split(' ')[0] : '';
  const closedRatio = !unknown && total > 0 ? (total - left) / total : 0;
  const dayClosed = !unknown && total > 0 && left === 0;

  return (
    <section
      className="praxis-dashboard-summary flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-card/60 px-4 py-2.5 sm:px-5"
      data-testid="day-strip"
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          <span>{dateStr}</span>
          <span aria-hidden> · </span>
          <time className="tabular-nums" dateTime={clock}>{clock}</time>
        </p>
        <h1 className="praxis-title mt-0.5 truncate text-lg font-semibold leading-tight tracking-[-0.03em] sm:text-xl">
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </h1>
      </div>

      <div
        className="flex shrink-0 items-center gap-2.5"
        role="img"
        aria-label={unknown ? 'Contagem do dia indisponível' : dayClosed ? 'Dia fechado' : `Faltam ${left} pra fechar o dia`}
      >
        <span className="text-right text-xs leading-tight text-muted-foreground" aria-hidden>
          {unknown ? '' : dayClosed ? 'dia fechado' : 'faltam'}
        </span>
        <span className="relative flex h-12 w-12 items-center justify-center" aria-hidden>
          <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={RING_R} fill="none" strokeWidth="4" className="stroke-white/[0.09]" />
            <circle
              cx="24"
              cy="24"
              r={RING_R}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-domain-gold transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - closedRatio)}
            />
          </svg>
          <span className="absolute text-base font-semibold tabular-nums text-foreground" data-testid="day-left">
            {unknown ? '–' : dayClosed ? <Check className="h-4 w-4 text-domain-gold" /> : left}
          </span>
        </span>
      </div>
    </section>
  );
}
