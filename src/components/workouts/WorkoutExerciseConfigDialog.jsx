import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TRACKING_LABELS, WORKOUT_CATEGORY_LABELS } from '@/lib/workouts';

function defaultsFor(exercise, initial) {
  const trackingType = exercise?.tracking_type || initial?.tracking_type || 'reps';
  return {
    target_sets: initial?.target_sets ?? 3,
    rep_min: initial?.rep_min ?? (['reps', 'weight_reps'].includes(trackingType) ? 8 : ''),
    rep_max: initial?.rep_max ?? (['reps', 'weight_reps'].includes(trackingType) ? 12 : ''),
    target_duration_seconds: initial?.target_duration_seconds ?? (trackingType === 'duration' ? 10 : ''),
    rest_seconds: initial?.rest_seconds ?? 90,
    notes: initial?.notes || '',
  };
}

export default function WorkoutExerciseConfigDialog({
  open,
  onOpenChange,
  exercise,
  initial = null,
  onSubmit,
  busy = false,
}) {
  const [form, setForm] = useState(() => defaultsFor(exercise, initial));
  const trackingType = exercise?.tracking_type || initial?.tracking_type || 'reps';
  const isRepBased = ['reps', 'weight_reps'].includes(trackingType);

  useEffect(() => {
    if (open) setForm(defaultsFor(exercise, initial));
  }, [open, exercise, initial]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (busy) return;
    onSubmit?.({
      target_sets: Number(form.target_sets) || 1,
      rep_min: isRepBased && form.rep_min !== '' ? Number(form.rep_min) : null,
      rep_max: isRepBased && form.rep_max !== '' ? Number(form.rep_max) : null,
      target_duration_seconds:
        trackingType === 'duration' && form.target_duration_seconds !== ''
          ? Number(form.target_duration_seconds)
          : null,
      rest_seconds: form.rest_seconds !== '' ? Number(form.rest_seconds) : 0,
      notes: form.notes.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Configurar exercício' : 'Adicionar ao treino'}</DialogTitle>
          <DialogDescription>
            {exercise?.name || initial?.exercise_name || 'Exercício'} · {WORKOUT_CATEGORY_LABELS[exercise?.category || initial?.exercise_category] || 'Exercício'} · {TRACKING_LABELS[trackingType] || 'Repetições'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="exercise-target-sets">Séries</Label>
              <Input
                id="exercise-target-sets"
                type="number"
                inputMode="numeric"
                min="1"
                max="20"
                value={form.target_sets}
                onChange={(event) => setForm((current) => ({ ...current, target_sets: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exercise-rest-seconds">Descanso <span className="text-muted-foreground">(s)</span></Label>
              <Input
                id="exercise-rest-seconds"
                type="number"
                inputMode="numeric"
                min="0"
                max="3600"
                step="15"
                value={form.rest_seconds}
                onChange={(event) => setForm((current) => ({ ...current, rest_seconds: event.target.value }))}
              />
            </div>
          </div>

          {isRepBased ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="exercise-rep-min">Reps mín.</Label>
                <Input
                  id="exercise-rep-min"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.rep_min}
                  onChange={(event) => setForm((current) => ({ ...current, rep_min: event.target.value }))}
                  placeholder="8"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exercise-rep-max">Reps máx.</Label>
                <Input
                  id="exercise-rep-max"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.rep_max}
                  onChange={(event) => setForm((current) => ({ ...current, rep_max: event.target.value }))}
                  placeholder="12"
                />
              </div>
            </div>
          ) : null}

          {trackingType === 'duration' ? (
            <div className="space-y-2">
              <Label htmlFor="exercise-duration-target">Meta por série <span className="text-muted-foreground">(segundos)</span></Label>
              <Input
                id="exercise-duration-target"
                type="number"
                inputMode="numeric"
                min="1"
                max="86400"
                value={form.target_duration_seconds}
                onChange={(event) => setForm((current) => ({ ...current, target_duration_seconds: event.target.value }))}
                placeholder="10"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="exercise-workout-notes">Notas <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              id="exercise-workout-notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              placeholder="Ex.: Straddle, foco em amplitude"
              maxLength={500}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !Number(form.target_sets)}>
              {busy ? 'Salvando...' : initial ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
