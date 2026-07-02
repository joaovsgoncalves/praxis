import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { forjaApi } from '@/api/forjaClient';
import { Progress } from '@/components/ui/progress';
import { ChevronRight } from 'lucide-react';

/** Barra compacta de XP — rodapé do dashboard, sem competir com Agora. */
export default function XpProgressStrip({ className = '' }) {
  const { data, isLoading } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => forjaApi.gamification.get(),
    staleTime: 45_000,
  });

  if (isLoading || !data) return null;

  const { level, level_name, xp_total, next_level_xp, progress_pct } = data;
  const unlocked = (data.achievements || []).filter((a) => a.unlocked).length;

  return (
    <div
      className={`rounded-xl border border-white/5 bg-black/25 px-4 py-3 ${className}`}
      aria-label="Progresso de nível no Praxis"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Praxis · Nv. {level} {level_name}
        </span>
        <span className="font-mono">
          {xp_total.toLocaleString('pt-BR')}
          {next_level_xp ? ` / ${next_level_xp.toLocaleString('pt-BR')} XP` : ' XP'}
        </span>
      </div>
      <Progress value={progress_pct} className="mt-2 h-1.5 [&>div]:bg-gold" />
      {unlocked > 0 && (
        <Link
          to="/conquistas"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-gold/90 hover:text-gold"
        >
          {unlocked} conquista{unlocked !== 1 ? 's' : ''} desbloqueada{unlocked !== 1 ? 's' : ''}
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}