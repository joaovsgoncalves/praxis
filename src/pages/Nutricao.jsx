import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { PageHero, PraxisEmptyState } from '@/components/layout/PraxisPage';
import NutritionMetaForm from '@/components/nutrition/NutritionMetaForm';
import { formatKcal, formatGrams, GOAL_LABELS } from '@/lib/nutrition';
import { Card, CardContent } from '@/components/ui/card';

export default function Nutricao() {
  const {
    data: profile,
    isLoading: loadingProfile,
    isError: profileError,
  } = useQuery({
    queryKey: ['nutrition', 'profile'],
    queryFn: () => forjaApi.nutrition.profile(),
    retry: 1,
  });

  const { data: day } = useQuery({
    queryKey: ['nutrition', 'day'],
    queryFn: () => forjaApi.nutrition.day(),
    retry: 1,
  });

  const goalLabel = GOAL_LABELS[profile?.goal] || 'Manter';
  const hasTargets = profile?.target_kcal != null;

  return (
    <div className="praxis-page space-y-6 pb-24 max-w-xl">
      <PageHero
        kicker="Ferramentas"
        title="Nutrição"
        description="Defina a meta do dia. Log de comida vem nas próximas fases."
      />

      {hasTargets && (
        <Card className="border-border/80 bg-card/40 shadow-none">
          <CardContent className="px-5 py-4 space-y-1">
            <p className="text-xs text-muted-foreground">Meta de hoje · {goalLabel}</p>
            <p className="text-lg font-semibold tabular-nums tracking-tight">
              {formatKcal(profile.target_kcal)}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              P {formatGrams(profile.target_protein_g)} · C {formatGrams(profile.target_carbs_g)} · G{' '}
              {formatGrams(profile.target_fat_g)}
            </p>
            {day?.totals ? (
              <p className="text-xs text-muted-foreground/90 pt-1 tabular-nums">
                Registrado hoje: {formatKcal(day.totals.kcal)} (diário ainda em construção)
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {loadingProfile ? (
        <p className="text-sm text-muted-foreground">Carregando perfil…</p>
      ) : profileError ? (
        <PraxisEmptyState
          title="Não carregou o perfil"
          description="A API de nutrição não respondeu. Tenta de novo ou confere se está logado."
        />
      ) : (
        <NutritionMetaForm profile={profile} />
      )}

      <PraxisEmptyState
        title="Diário de comida em breve"
        description="Fase 2–3: cadastrar alimentos e registrar refeições. Agora o foco é acertar a meta."
      />
    </div>
  );
}
