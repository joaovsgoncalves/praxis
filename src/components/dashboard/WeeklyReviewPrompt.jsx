import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { forjaApi } from '@/api/forjaClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, ArrowRight } from 'lucide-react';

// Show the prompt only on Sunday or Monday, and only if the *previous* week's
// review hasn't been written yet — Saturday's bias should not nag someone
// who already reviewed.
function shouldShowPrompt(today, lastReviewWeekStart) {
  const dow = today.getDay(); // 0 Sun, 1 Mon
  if (dow !== 0 && dow !== 1) return false;

  const monday = new Date(today);
  const diff = dow === 0 ? -6 : 1 - dow;
  monday.setDate(monday.getDate() + diff);
  const previousMonday = new Date(monday);
  previousMonday.setDate(previousMonday.getDate() - 7);
  const previousMondayStr = previousMonday.toISOString().split('T')[0];

  return lastReviewWeekStart !== previousMondayStr;
}

export default function WeeklyReviewPrompt() {
  const { data, isLoading } = useQuery({
    queryKey: ['weeklyReviewHistory', 1],
    queryFn: () => forjaApi.weeklyReviews.list(1),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return null;

  const lastReviewWeekStart = data?.[0]?.week_start || null;
  if (!shouldShowPrompt(new Date(), lastReviewWeekStart)) return null;

  return (
    <Card className="bg-gradient-to-br from-primary/15 to-primary/5 border-primary/30">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Revisão da semana passada</p>
          <p className="text-xs text-muted-foreground">5 minutos pra olhar pra trás antes de seguir.</p>
        </div>
        <Button asChild size="sm">
          <Link to="/revisao-semanal">
            Revisar <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
