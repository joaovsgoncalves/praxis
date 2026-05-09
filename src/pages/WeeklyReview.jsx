import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, ChevronLeft, ChevronRight, Save, Trash2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const SCORE_OPTIONS = [
  { value: 1, emoji: '😞', label: 'Difícil' },
  { value: 2, emoji: '😕', label: 'Abaixo' },
  { value: 3, emoji: '😐', label: 'Mediano' },
  { value: 4, emoji: '🙂', label: 'Bom' },
  { value: 5, emoji: '🤩', label: 'Excelente' },
];

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

const empty = {
  highlights: '',
  blockers: '',
  learnings: '',
  next_week_focus: '',
  overall_score: 3,
};

export default function WeeklyReview() {
  const queryClient = useQueryClient();
  const [weekDate, setWeekDate] = useState(() => mondayOf(new Date()));
  const weekStart = format(weekDate, 'yyyy-MM-dd');
  const weekEnd = format(addDays(weekDate, 6), 'yyyy-MM-dd');

  const { data: current } = useQuery({
    queryKey: ['weeklyReviewCurrent', weekStart],
    queryFn: () => forjaApi.weeklyReviews.current(weekStart),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['weeklyReviewHistory'],
    queryFn: () => forjaApi.weeklyReviews.list(8),
  });

  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (current?.review) {
      setForm({
        highlights: current.review.highlights || '',
        blockers: current.review.blockers || '',
        learnings: current.review.learnings || '',
        next_week_focus: current.review.next_week_focus || '',
        overall_score: current.review.overall_score || 3,
      });
    } else {
      setForm(empty);
    }
  }, [current]);

  const saveMutation = useMutation({
    mutationFn: () => forjaApi.weeklyReviews.save({ ...form, week_start: weekStart }),
    onSuccess: () => {
      toast.success('Revisão salva');
      queryClient.invalidateQueries({ queryKey: ['weeklyReviewCurrent'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyReviewHistory'] });
    },
    onError: () => toast.error('Falha ao salvar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => forjaApi.weeklyReviews.delete(id),
    onSuccess: () => {
      toast.success('Revisão removida');
      queryClient.invalidateQueries({ queryKey: ['weeklyReviewCurrent'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyReviewHistory'] });
      setForm(empty);
    },
  });

  const goPrev = () => setWeekDate(d => mondayOf(addDays(d, -7)));
  const goNext = () => setWeekDate(d => mondayOf(addDays(d, 7)));
  const isCurrentWeek = useMemo(
    () => format(mondayOf(new Date()), 'yyyy-MM-dd') === weekStart,
    [weekStart]
  );

  const range = `${format(weekDate, 'dd MMM', { locale: ptBR })} – ${format(addDays(weekDate, 6), 'dd MMM yyyy', { locale: ptBR })}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Revisão Semanal
          </h1>
          <p className="text-sm text-muted-foreground">Olhar pra trás pra olhar pra frente.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={goPrev}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setWeekDate(mondayOf(new Date()))} disabled={isCurrentWeek}>
            Esta semana
          </Button>
          <Button variant="outline" size="icon" onClick={goNext}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">{range}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Section
            label="✨ O que foi bem?"
            placeholder="3 vitórias, momentos de orgulho, hábitos que funcionaram…"
            value={form.highlights}
            onChange={v => setForm(f => ({ ...f, highlights: v }))}
          />
          <Section
            label="🪨 O que emperrou?"
            placeholder="Bloqueios, distrações, hábitos que falharam, energia baixa…"
            value={form.blockers}
            onChange={v => setForm(f => ({ ...f, blockers: v }))}
          />
          <Section
            label="💡 O que aprendi?"
            placeholder="Padrões, descobertas, ajustes de processo…"
            value={form.learnings}
            onChange={v => setForm(f => ({ ...f, learnings: v }))}
          />
          <Section
            label="🎯 Foco da próxima semana"
            placeholder="3 prioridades concretas, mudança de rotina, coisa nova pra testar…"
            value={form.next_week_focus}
            onChange={v => setForm(f => ({ ...f, next_week_focus: v }))}
          />

          <div>
            <p className="text-sm font-medium mb-2">Como foi a semana no geral?</p>
            <div className="flex gap-2">
              {SCORE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, overall_score: opt.value }))}
                  className={`flex-1 py-2 px-3 rounded-lg border text-center transition-colors ${
                    form.overall_score === opt.value
                      ? 'bg-primary/15 border-primary text-primary'
                      : 'bg-secondary/40 border-border hover:bg-secondary'
                  }`}
                >
                  <div className="text-lg">{opt.emoji}</div>
                  <div className="text-[10px]">{opt.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {current?.review && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteMutation.mutate(current.review.id)}
                className="text-rose-400 hover:text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover
              </Button>
            )}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Salvando…' : 'Salvar revisão'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Revisões anteriores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map(r => {
              const opt = SCORE_OPTIONS.find(o => o.value === r.overall_score);
              const start = new Date(r.week_start + 'T12:00:00');
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setWeekDate(mondayOf(start))}
                  className="w-full flex items-center justify-between p-2.5 rounded-md bg-secondary/40 hover:bg-secondary text-left"
                >
                  <span className="text-sm">
                    {format(start, "dd MMM", { locale: ptBR })} – {format(addDays(start, 6), "dd MMM yyyy", { locale: ptBR })}
                  </span>
                  <span className="text-base">{opt?.emoji || '📝'}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ label, placeholder, value, onChange }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1.5">{label}</label>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-secondary/40 min-h-[80px] resize-y"
      />
    </div>
  );
}
