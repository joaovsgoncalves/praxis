import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { PageHero } from '@/components/layout/PraxisPage';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { secondaryNavItems, filterSecondaryNav } from '@/lib/praxisNav';

export default function Mais() {
  const { data: goals = [] } = useQuery({
    queryKey: ['allGoals'],
    queryFn: () => forjaApi.goals.list(),
    staleTime: 60_000,
  });
  const { data: rituals = [] } = useQuery({
    queryKey: ['rituals', 'nav'],
    queryFn: () => forjaApi.rituals.list({ status: 'active' }),
    staleTime: 60_000,
  });
  const { data: gamificationNav } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => forjaApi.gamification.get(),
    staleTime: 120_000,
  });

  const activeGoalCount = goals.filter((g) => g.status === 'active').length;
  const activeRitualCount = rituals.length;
  const unlockedAchievementCount = (gamificationNav?.achievements || []).filter((a) => a.unlocked).length;

  const links = filterSecondaryNav(secondaryNavItems, {
    activeGoalCount,
    activeRitualCount,
    unlockedAchievementCount,
  });

  return (
    <div className="praxis-page">
      <PageHero
        kicker="Mais"
        kickerIcon={LayoutGrid}
        title="Mais ferramentas"
        description="Ideias, foco, compras, histórico e ajustes — fora do caminho do dia a dia."
      />

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {links.map((item) => (
          <li key={item.path}>
            <Link
              to={item.path}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-white/10 bg-card/60 px-4 py-4',
                'text-[15px] font-medium transition-colors hover:bg-card hover:border-white/15',
              )}
            >
              <item.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}