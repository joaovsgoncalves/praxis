import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { forjaApi } from '@/api/forjaClient';
import { fortalezaDateKey } from '@/lib/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, AlertCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEVERITY_STYLES = {
  high: 'border-destructive/40 bg-destructive/5',
  medium: 'border-amber-500/30 bg-amber-500/5',
  low: 'border-border bg-secondary/20',
};

export default function AvoidanceCockpit() {
  const today = fortalezaDateKey();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['avoidance', today],
    queryFn: () => forjaApi.insights.avoidance({ date: today }),
    staleTime: 60_000,
  });

  const praxiaMutation = useMutation({
    mutationFn: () => forjaApi.praxia.confront({ date: today }),
  });

  const items = data?.items ?? [];

  return (
    <Card className="border-white/10 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              O que estou evitando?
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? 'Lendo padrões…' : data?.headline}
            </p>
          </div>
          {data?.pressure > 0 && (
            <Badge variant="outline" className="shrink-0">
              pressão {data.pressure}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.action?.href || '/'}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-white/5',
                    SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.low,
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-50 mt-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {!isLoading && items.length === 0 && !isError && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Radar limpo. Se algo incomoda, grava na captura por voz.
          </p>
        )}

        <div className="border-t border-white/5 pt-4 space-y-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            disabled={praxiaMutation.isPending || isLoading}
            onClick={() => praxiaMutation.mutate()}
          >
            {praxiaMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2 text-primary" />
            )}
            PraxIA — espelhar padrão
          </Button>

          {praxiaMutation.data?.lines?.length > 0 && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-2">
              <p className="text-xs forja-kicker text-primary">PraxIA</p>
              {praxiaMutation.data.lines.map((line, i) => (
                <p key={i} className="text-sm text-foreground/90 leading-relaxed">
                  {line}
                </p>
              ))}
              {praxiaMutation.data.source === 'llm' && (
                <p className="text-[10px] text-muted-foreground">Interpretação com IA · você decide o que fazer</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}