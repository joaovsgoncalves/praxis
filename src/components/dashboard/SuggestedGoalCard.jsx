import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Target, X } from 'lucide-react';
import {
  GOAL_STARTER_TEMPLATES,
  isGoalSuggestDismissed,
  dismissGoalSuggest,
} from '@/lib/goalStarterTemplates';

export default function SuggestedGoalCard() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => isGoalSuggestDismissed());

  const { data: goals = [] } = useQuery({
    queryKey: ['allGoals'],
    queryFn: () => forjaApi.goals.list(),
    staleTime: 120_000,
  });

  const activeCount = goals.filter((g) => g.status === 'active').length;
  if (dismissed || activeCount > 0) return null;

  const handlePick = (id) => {
    navigate(`/metas?starter=${id}`);
  };

  const handleDismiss = () => {
    dismissGoalSuggest();
    setDismissed(true);
  };

  return (
    <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Sua primeira meta em 1 toque</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Escolha um template (RCA, Encarte ou corpo). O menu Metas aparece quando você tiver meta ativa.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={handleDismiss} aria-label="Agora não">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {GOAL_STARTER_TEMPLATES.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={() => handlePick(t.id)}
            >
              {t.emoji} {t.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}