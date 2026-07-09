import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { PageHero, PraxisEmptyState } from '@/components/layout/PraxisPage';
import NutritionMetaForm from '@/components/nutrition/NutritionMetaForm';
import FoodCatalog from '@/components/nutrition/FoodCatalog';
import DayDiary from '@/components/nutrition/DayDiary';
import MacroBars from '@/components/nutrition/MacroBars';
import { formatKcal, GOAL_LABELS } from '@/lib/nutrition';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'diario', label: 'Diário' },
  { id: 'alimentos', label: 'Alimentos' },
  { id: 'meta', label: 'Meta' },
];

export default function Nutricao() {
  const [tab, setTab] = useState('diario');
  const [diaryDate, setDiaryDate] = useState(null);

  const {
    data: profile,
    isLoading: loadingProfile,
    isError: profileError,
  } = useQuery({
    queryKey: ['nutrition', 'profile'],
    queryFn: () => forjaApi.nutrition.profile(),
    retry: 1,
  });

  const dayKey = diaryDate || undefined;
  const { data: day } = useQuery({
    queryKey: ['nutrition', 'day', dayKey || 'today'],
    queryFn: () => forjaApi.nutrition.day(dayKey),
    retry: 1,
  });

  const goalLabel = GOAL_LABELS[profile?.goal] || 'Manter';
  const hasTargets = profile?.target_kcal != null;
  const totals = day?.totals || { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const targets = {
    kcal: profile?.target_kcal ?? day?.targets?.kcal ?? null,
    protein_g: profile?.target_protein_g ?? day?.targets?.protein_g ?? null,
    carbs_g: profile?.target_carbs_g ?? day?.targets?.carbs_g ?? null,
    fat_g: profile?.target_fat_g ?? day?.targets?.fat_g ?? null,
  };

  return (
    <div className="praxis-page space-y-6 pb-24 max-w-xl">
      <PageHero
        kicker="Ferramentas"
        title="Nutrição"
        description="Registre o que comeu e acompanhe a meta do dia."
      />

      {(hasTargets || (totals.kcal ?? 0) > 0) && (
        <Card className="border-border/80 bg-card/40 shadow-none">
          <CardContent className="px-5 py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {hasTargets ? `Meta · ${goalLabel}` : 'Consumido hoje'}
                </p>
                <p className="text-lg font-semibold tabular-nums tracking-tight">
                  {formatKcal(totals.kcal ?? 0)}
                  {hasTargets ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      / {formatKcal(targets.kcal)}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <MacroBars totals={totals} targets={targets} variant="full" />
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1 rounded-full bg-secondary/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-full px-2 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'diario' ? (
        <DayDiary date={diaryDate || undefined} onDateChange={setDiaryDate} />
      ) : tab === 'alimentos' ? (
        <FoodCatalog />
      ) : loadingProfile ? (
        <p className="text-sm text-muted-foreground">Carregando perfil…</p>
      ) : profileError ? (
        <PraxisEmptyState
          title="Não carregou o perfil"
          description="A API de nutrição não respondeu. Tenta de novo ou confere se está logado."
        />
      ) : (
        <NutritionMetaForm profile={profile} />
      )}
    </div>
  );
}
