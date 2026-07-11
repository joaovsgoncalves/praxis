import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, Clock3, Dumbbell, Layers3 } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PraxisEmptyState, PraxisListSkeleton } from '@/components/layout/PraxisPage';
import { formatSessionDuration, formatSetResult, workoutDateLabel } from '@/lib/workouts';

export default function WorkoutHistory() {
  const [selectedId, setSelectedId] = useState(null);

  const { data: sessions = [], isLoading, isError, error } = useQuery({
    queryKey: ['workouts', 'history'],
    queryFn: () => forjaApi.workouts.sessions.list({ status: 'completed', limit: 50 }),
    staleTime: 15_000,
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['workouts', 'history', selectedId],
    queryFn: () => forjaApi.workouts.sessions.get(selectedId),
    enabled: Boolean(selectedId),
  });

  if (isLoading) return <PraxisListSkeleton rows={5} />;

  if (isError) {
    return (
      <PraxisEmptyState
        icon={CalendarClock}
        title="Não consegui abrir o histórico"
        description={error?.message || 'Tenta novamente daqui a pouco.'}
      />
    );
  }

  if (!sessions.length) {
    return (
      <PraxisEmptyState
        icon={CalendarClock}
        title="Nenhum treino concluído ainda"
        description="Quando você finalizar a primeira sessão, ela aparece aqui com duração, séries e exercícios."
      />
    );
  }

  return (
    <>
      <div className="space-y-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => setSelectedId(session.id)}
            className="w-full rounded-2xl border border-border/70 bg-card/35 px-4 py-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Dumbbell className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{session.workout_day_name_snapshot}</p>
                <p className="mt-1 text-xs text-muted-foreground">{workoutDateLabel(session.started_at)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {formatSessionDuration(session.duration_seconds)}</span>
                  <span className="inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" /> {session.completed_sets} séries</span>
                  <span>{session.exercise_count} {Number(session.exercise_count) === 1 ? 'exercício' : 'exercícios'}</span>
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="w-[calc(100%-1.25rem)] max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl">
          {loadingDetail || !detail ? (
            <div className="space-y-3 py-6">
              {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-secondary/45" />)}
            </div>
          ) : (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle>{detail.workout_day_name_snapshot}</DialogTitle>
                <DialogDescription>
                  {workoutDateLabel(detail.started_at)} · {formatSessionDuration(detail.duration_seconds)} · {detail.completed_sets} séries
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-2">
                {detail.exercises.map((exercise, index) => (
                  <Card key={exercise.id} className="border-border/70 bg-card/35 shadow-none">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-xs font-semibold tabular-nums text-muted-foreground">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{exercise.exercise_name_snapshot}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{exercise.sets.length} {exercise.sets.length === 1 ? 'série registrada' : 'séries registradas'}</p>
                        </div>
                      </div>

                      {exercise.sets.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {exercise.sets.map((set) => (
                            <span key={set.id} className="rounded-full border border-border/70 bg-secondary/30 px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                              {set.set_number}. {formatSetResult(set, exercise.tracking_type)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">Sem séries registradas.</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
