import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UtensilsCrossed, Plus } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import MacroBars from '@/components/nutrition/MacroBars';
import { formatKcal, isNutritionShowOnToday } from '@/lib/nutrition';

/**
 * Resumo de macros no Hoje (estilo água: 1 card compacto).
 */
export default function NutritionTodayCard() {
  const { data: settings } = useQuery({
    queryKey: ['me'],
    queryFn: () => forjaApi.user.getSettings(),
    staleTime: 60_000,
  });

  const show = isNutritionShowOnToday(settings);

  const { data: day, isLoading, isError } = useQuery({
    queryKey: ['nutrition', 'day', 'today'],
    queryFn: () => forjaApi.nutrition.day(),
    enabled: show,
    retry: 1,
    staleTime: 30_000,
  });

  if (!show) return null;

  const totals = day?.totals || { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const targets = day?.targets || {};
  const hasTarget = targets.kcal != null;
  const empty = !isLoading && !isError && (day?.logs?.length ?? 0) === 0;

  return (
    <Card className="border-border/80 bg-card/40 shadow-none">
      <CardContent className="px-4 py-4 sm:px-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <UtensilsCrossed className="w-4 h-4 text-amber-400/90 shrink-0" aria-hidden />
            <span className="text-sm font-semibold">Macros do dia</span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
            {isLoading
              ? '…'
              : isError
                ? '—'
                : hasTarget
                  ? `${Math.round(totals.kcal || 0).toLocaleString('pt-BR')} / ${Math.round(targets.kcal).toLocaleString('pt-BR')} kcal`
                  : formatKcal(totals.kcal)}
          </span>
        </div>

        {isError ? (
          <p className="text-xs text-muted-foreground">
            Não deu pra carregar macros. Abre Nutrição ou tenta de novo.
          </p>
        ) : empty && !hasTarget ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ainda não registrou comida hoje. Defina a meta e adicione refeições em Nutrição.
          </p>
        ) : empty && hasTarget ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ainda não registrou comida hoje — meta {formatKcal(targets.kcal)}.
          </p>
        ) : (
          <MacroBars totals={totals} targets={targets} variant="compact" />
        )}

        <div className="flex items-center gap-2 pt-0.5">
          <Button asChild size="sm" className="rounded-full h-9 flex-1">
            <Link to="/nutricao">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Comida
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="rounded-full h-9 text-muted-foreground">
            <Link to="/nutricao">Ver diário</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
