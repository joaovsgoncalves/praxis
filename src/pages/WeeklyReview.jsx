import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { praxisApi } from '@/api/praxisClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, ChevronLeft, ChevronRight, Save, Trash2, BarChart3, Wand2, ListChecks, History, CheckCircle2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { pickWeeklyTaskTitles, taskDatesForNextWeek } from '@/lib/weeklyReviewTasks';
import { PageHero } from '@/components/layout/PraxisPage';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Lightbulb, Mountain, Target, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const FORM_KEYS = Object.keys(empty);
const TEXT_KEYS = ['highlights', 'blockers', 'learnings', 'next_week_focus'];

const PRESS = 'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';

const AREA_LABELS = {
  rca: 'RCA / trabalho',
  faculdade: 'Faculdade',
  saude: 'Saúde / treino',
  gofluxo: 'GoFluxo',
  animalia: 'Animália',
  projetos: 'Projetos',
  'vida-pratica': 'Vida prática',
};

function areaLabel(area) {
  return AREA_LABELS[area] || area;
}

function formatDateShort(ymd) {
  try {
    return format(new Date(`${ymd}T12:00:00`), 'dd MMM', { locale: ptBR });
  } catch {
    return ymd;
  }
}

export default function WeeklyReview() {
  const queryClient = useQueryClient();
  const [weekDate, setWeekDate] = useState(() => mondayOf(new Date()));
  const weekStart = format(weekDate, 'yyyy-MM-dd');
  const weekEnd = format(addDays(weekDate, 6), 'yyyy-MM-dd');

  const { data: current } = useQuery({
    queryKey: ['weeklyReviewCurrent', weekStart],
    queryFn: () => praxisApi.weeklyReviews.current(weekStart),
  });

  const { data: auto, isLoading: autoLoading } = useQuery({
    queryKey: ['weeklyInsights', weekStart],
    queryFn: () => praxisApi.insights.weekly(weekStart),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['weeklyReviewHistory'],
    queryFn: () => praxisApi.weeklyReviews.list(8),
  });

  const [form, setForm] = useState(empty);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  // Texto digitado e não salvo não pode ser sobrescrito por refetch (foco na janela, etc.).
  const dirtyRef = useRef(false);

  const savedForm = useMemo(() => (current?.review
    ? {
        highlights: current.review.highlights || '',
        blockers: current.review.blockers || '',
        learnings: current.review.learnings || '',
        next_week_focus: current.review.next_week_focus || '',
        overall_score: current.review.overall_score || 3,
      }
    : empty), [current]);

  useEffect(() => {
    dirtyRef.current = false;
  }, [weekStart]);

  useEffect(() => {
    if (dirtyRef.current) return;
    setForm(savedForm);
  }, [savedForm]);

  const updateForm = (patch) => {
    dirtyRef.current = true;
    setForm((f) => ({ ...f, ...patch }));
  };

  const hasUnsaved = FORM_KEYS.some((key) => form[key] !== savedForm[key]);
  const filledCount = TEXT_KEYS.filter((key) => String(form[key] || '').trim()).length;

  const saveMutation = useMutation({
    mutationFn: () => praxisApi.weeklyReviews.save({ ...form, week_start: weekStart }),
    onSuccess: () => {
      dirtyRef.current = false;
      toast.success('Revisão salva');
      queryClient.invalidateQueries({ queryKey: ['weeklyReviewCurrent'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyReviewHistory'] });
    },
    onError: () => toast.error('Falha ao salvar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => praxisApi.weeklyReviews.delete(id),
    onSuccess: () => {
      toast.success('Revisão removida');
      queryClient.invalidateQueries({ queryKey: ['weeklyReviewCurrent'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyReviewHistory'] });
      dirtyRef.current = false;
      setForm(empty);
    },
  });

  const createWeekTasksMutation = useMutation({
    mutationFn: async () => {
      const suggested = auto?.suggested_priorities || [];
      const titles = pickWeeklyTaskTitles({
        suggestedPriorities: suggested,
        nextWeekFocus: form.next_week_focus,
      });
      const dates = taskDatesForNextWeek(weekStart);
      const created = [];
      for (let i = 0; i < titles.length; i++) {
        const t = await praxisApi.tasks.create({
          title: titles[i],
          date: dates[i],
          status: 'pending',
          priority: i === 0 ? 'high' : 'medium',
          category: 'pessoal',
          source: 'weekly_review',
        });
        created.push(t);
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success(`${created.length} tarefa(s) criadas para a próxima semana`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
    },
    onError: () => toast.error('Não foi possível criar as tarefas'),
  });

  const applyDrafts = () => {
    if (!auto?.drafts) return;
    dirtyRef.current = true;
    setReflectionOpen(true);
    setForm((f) => ({
      ...f,
      highlights: f.highlights.trim() ? f.highlights : auto.drafts.highlights || f.highlights,
      blockers: f.blockers.trim() ? f.blockers : auto.drafts.blockers || f.blockers,
      learnings: f.learnings.trim() ? f.learnings : auto.drafts.learnings || f.learnings,
      next_week_focus: f.next_week_focus.trim() ? f.next_week_focus : auto.drafts.next_week_focus || f.next_week_focus,
    }));
    toast.success('Rascunho automático aplicado nos campos vazios');
  };

  const goPrev = () => setWeekDate((d) => mondayOf(addDays(d, -7)));
  const goNext = () => setWeekDate((d) => mondayOf(addDays(d, 7)));
  const isCurrentWeek = useMemo(
    () => format(mondayOf(new Date()), 'yyyy-MM-dd') === weekStart,
    [weekStart],
  );

  const range = `${format(weekDate, 'dd MMM', { locale: ptBR })} – ${format(addDays(weekDate, 6), 'dd MMM yyyy', { locale: ptBR })}`;

  const v = auto?.victories;
  const priorities = auto?.suggested_priorities || [];

  return (
    <div className="praxis-page max-w-5xl">
      <PageHero
        kicker="Semana"
        kickerIcon={Sparkles}
        title="Revisão semanal"
        description="Resumo automático + seu texto — cerca de 10 minutos."
        action={(
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={goPrev} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setWeekDate(mondayOf(new Date()))} disabled={isCurrentWeek}>
              Esta semana
            </Button>
            <Button variant="outline" size="icon" onClick={goNext} aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      />

      {/* Desktop: resumo, prioridades e reflexão na coluna larga; andamento e histórico no trilho. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Resumo automático · {range}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {autoLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full max-w-md" />
              <Skeleton className="h-4 w-full max-w-lg" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : auto ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-black/15 px-4 py-3.5 sm:grid-cols-4">
                <WeekNumber label="Tarefas feitas" value={v?.tasks_completed_count ?? 0} />
                <WeekNumber
                  label="Hábitos"
                  value={`${v?.habits_done ?? 0}/${v?.habits_target ?? 0}`}
                  detail={v?.habits_completion_pct != null ? `${v.habits_completion_pct}%` : null}
                />
                <WeekNumber label="Foco" value={v?.focus_minutes ?? 0} detail="min" />
                <WeekNumber label="Ideias viraram tarefa" value={v?.ideas_promoted ?? 0} />
              </dl>

              <div className="grid gap-3 sm:grid-cols-2">
                <InsightBlock title="Padrões">
                  <p className="text-muted-foreground leading-relaxed">{auto.patterns?.summary}</p>
                </InsightBlock>
                <InsightBlock title="Gargalos">
                  <p className="text-muted-foreground leading-relaxed">{auto.bottlenecks?.summary}</p>
                </InsightBlock>
                <InsightBlock title="Ideias na semana">
                  <p className="text-muted-foreground">
                    {auto.ideas?.new_captures ?? 0} nova(s) · {auto.ideas?.promissoras_count ?? 0} promissora(s) no banco
                  </p>
                </InsightBlock>
              </div>

              <div className="space-y-3 border-t border-white/[0.06] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Prioridades sugeridas</h3>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className={cn('h-9 rounded-full', PRESS)}
                    disabled={createWeekTasksMutation.isPending || !auto}
                    onClick={() => createWeekTasksMutation.mutate()}
                  >
                    <ListChecks className="mr-1.5 h-4 w-4" />
                    {createWeekTasksMutation.isPending ? 'Criando…' : 'Criar 3 tarefas da semana'}
                  </Button>
                </div>
                {priorities.length > 0 ? (
                  <ol className="space-y-2">
                    {priorities.map((p, index) => (
                      <li key={p} className="flex gap-3 text-sm leading-relaxed text-stone-200">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold tabular-nums text-primary">
                          {index + 1}
                        </span>
                        <span className="min-w-0 [text-wrap:pretty]">{p}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-muted-foreground">Sem sugestão nesta semana. As tarefas saem do foco que você escrever.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Sem dados para esta semana.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <button
          type="button"
          aria-expanded={reflectionOpen}
          aria-controls="weekly-reflection"
          onClick={() => setReflectionOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-4 rounded-2xl p-5 text-left transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold">Sua reflexão</span>
            <span className="mt-1 block text-sm text-muted-foreground tabular-nums">
              {hasUnsaved
                ? 'Alterações não salvas'
                : current?.review
                  ? 'Salva'
                  : 'Ainda não escrita'}
              {' · '}
              {filledCount} de {TEXT_KEYS.length} campos
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
            {reflectionOpen ? 'Recolher' : current?.review || hasUnsaved ? 'Abrir' : 'Escrever'}
            <ChevronDown
              aria-hidden
              className={cn(
                'h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none',
                reflectionOpen && 'rotate-180',
              )}
            />
          </span>
        </button>

        <AnimatePresence initial={false}>
          {reflectionOpen ? (
            <motion.div
              id="weekly-reflection"
              key="reflection"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.12, ease: 'easeOut' } }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <CardContent className="space-y-5 border-t border-white/[0.06] pt-5 sm:pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground tabular-nums">{weekStart} → {weekEnd}</p>
                  {auto ? (
                    <Button type="button" variant="secondary" size="sm" className={cn('rounded-full', PRESS)} onClick={applyDrafts}>
                      <Wand2 className="mr-1.5 h-4 w-4" />
                      Preencher campos vazios com rascunho
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Section
                    id="review-highlights"
                    icon={ThumbsUp}
                    label="O que foi bem?"
                    placeholder="3 vitórias, momentos de orgulho, hábitos que funcionaram…"
                    value={form.highlights}
                    onChange={(val) => updateForm({ highlights: val })}
                  />
                  <Section
                    id="review-blockers"
                    icon={Mountain}
                    label="O que emperrou?"
                    placeholder="Bloqueios, distrações, hábitos que falharam, energia baixa…"
                    value={form.blockers}
                    onChange={(val) => updateForm({ blockers: val })}
                  />
                  <Section
                    id="review-learnings"
                    icon={Lightbulb}
                    label="O que aprendi?"
                    placeholder="Padrões, descobertas, ajustes de processo…"
                    value={form.learnings}
                    onChange={(val) => updateForm({ learnings: val })}
                  />
                  <Section
                    id="review-next-focus"
                    icon={Target}
                    label="Foco da próxima semana"
                    placeholder="3 prioridades concretas, mudança de rotina, coisa nova pra testar…"
                    value={form.next_week_focus}
                    onChange={(val) => updateForm({ next_week_focus: val })}
                  />
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium" id="review-score-label">Como foi a semana no geral?</p>
                  <div role="group" aria-labelledby="review-score-label" className="grid grid-cols-5 gap-1.5 sm:gap-2">
                    {SCORE_OPTIONS.map((opt) => {
                      const selected = form.overall_score === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => updateForm({ overall_score: opt.value })}
                          className={cn(
                            'relative min-h-[3.5rem] rounded-xl px-1 py-2 text-center outline-none',
                            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            PRESS,
                            selected
                              ? 'text-primary'
                              : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                          )}
                        >
                          {selected ? (
                            <motion.span
                              layoutId="praxis-review-score"
                              aria-hidden
                              className="absolute inset-0 rounded-xl bg-primary/15 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.55)]"
                              transition={reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
                            />
                          ) : null}
                          <span className="relative block text-lg leading-none" aria-hidden>{opt.emoji}</span>
                          <span className="relative mt-1.5 block text-[11px] font-medium">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  {current?.review && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteMutation.mutate(current.review.id)}
                      className="h-10 rounded-full text-rose-400 hover:text-rose-400"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                    </Button>
                  )}
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className={cn('h-10 rounded-full px-5', PRESS)}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saveMutation.isPending ? 'Salvando…' : 'Salvar revisão'}
                  </Button>
                </div>
              </CardContent>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Card>
      </div>

      <aside className="min-w-0 space-y-6">
      {auto?.life_history && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <History className="h-4 w-4 text-primary" />
              Andamento da sua vida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground leading-relaxed">{auto.life_history.summary}</p>

            {auto.life_history.completed_by_area.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Áreas com movimento
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {auto.life_history.completed_by_area.map((a) => (
                    <span
                      key={a.area}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2.5 py-1 text-xs"
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {areaLabel(a.area)}
                      </span>
                      <span className="tabular-nums text-foreground">{a.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {auto.life_history.timeline.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Linha do tempo
                </p>
                <ul className="space-y-2 border-l border-border pl-3">
                  {auto.life_history.timeline.map((ev, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[13px] top-1.5 h-2 w-2 rounded-full bg-primary/60" />
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{formatDateShort(ev.date)}</span>
                        {ev.source === 'conclusao' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                            <CheckCircle2 className="h-3 w-3" /> concluído
                          </span>
                        )}
                        {ev.name && <span className="font-medium text-foreground">{ev.name}</span>}
                      </div>
                      {ev.text && <p className="mt-0.5 text-sm text-muted-foreground">{ev.text}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {auto.life_history.completed_by_area.length === 0 && auto.life_history.timeline.length === 0 && (
              <p className="text-muted-foreground">Sem movimento registrado nesta semana.</p>
            )}
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Revisões anteriores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((r) => {
              const opt = SCORE_OPTIONS.find((o) => o.value === r.overall_score);
              const start = new Date(`${r.week_start}T12:00:00`);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setWeekDate(mondayOf(start))}
                  className="flex w-full items-center justify-between rounded-md bg-secondary/40 p-2.5 text-left hover:bg-secondary"
                >
                  <span className="text-sm">
                    {format(start, 'dd MMM', { locale: ptBR })} – {format(addDays(start, 6), 'dd MMM yyyy', { locale: ptBR })}
                  </span>
                  <span className="text-base">{opt?.emoji || '📝'}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
      </aside>
      </div>
    </div>
  );
}

function WeekNumber({ label, value, detail }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-xl font-semibold leading-none tabular-nums text-foreground">{value}</span>
        {detail ? <span className="text-xs text-muted-foreground tabular-nums">{detail}</span> : null}
      </dd>
    </div>
  );
}

function InsightBlock({ title, children }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3.5 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Section({ id, icon: Icon, label, placeholder, value, onChange }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        {Icon ? <Icon className="h-4 w-4 text-primary" aria-hidden /> : null}
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[96px] resize-y bg-secondary/40"
      />
    </div>
  );
}