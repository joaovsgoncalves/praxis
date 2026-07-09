import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { UtensilsCrossed } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Card, CardContent } from '@/components/ui/card';
import { PageHero, PraxisEmptyState } from '@/components/layout/PraxisPage';
import { formatKcal } from '@/lib/nutrition';

export default function Nutricao() {
  const { data: day, isLoading, isError } = useQuery({
    queryKey: ['nutrition', 'day'],
    queryFn: () => forjaApi.nutrition.day(),
    retry: 1,
  });

  const apiLine = (() => {
    if (isLoading) return 'Conferindo API…';
    if (isError) return 'Não deu pra carregar o diário agora. Tenta de novo em instantes.';
    if (day?.totals) return `API ok · ${formatKcal(day.totals.kcal)} hoje`;
    return null;
  })();

  return (
    <div className="praxis-page space-y-6 pb-24">
      <PageHero
        kicker="Ferramentas"
        title="Nutrição"
        description="Macros e refeições do dia — em construção."
      />

      <Card className="border-border/80 bg-card/40 shadow-none">
        <CardContent className="p-5 sm:p-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/60">
              <UtensilsCrossed className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold">Fase 0: base pronta</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Em breve você registra qualquer alimento ou refeição aqui, com barras de
                proteína, carbo e gordura no dia.
              </p>
              {apiLine ? (
                <p className="text-xs text-muted-foreground/90 tabular-nums pt-1">{apiLine}</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <PraxisEmptyState
        title="Ainda sem diário de comida"
        description="Quando as próximas fases saírem, o log rápido e as metas de macros aparecem nesta tela."
      />
    </div>
  );
}
