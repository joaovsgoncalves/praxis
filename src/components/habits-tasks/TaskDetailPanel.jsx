import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowRightLeft,
  CalendarClock,
  CalendarIcon,
  Check,
  ChevronDown,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { CATEGORIES } from '@/lib/categories';
import { cleanPriorityPrefix, isTaskDone, isTaskOpen } from '@/lib/tasks';
import { fortalezaAddDays } from '@/lib/dates';
import { BOARD_COLUMNS, boardColumnForTask } from '@/lib/taskLenses';
import { dispatchPraxisLevelUpFromResponse } from '@/lib/praxisLevelUp';
import { notifyPraxisRecurrenceSpawned } from '@/lib/praxisRecurrenceToast';
import { useTaskStatus } from '@/hooks/useTaskStatus';
import { useTaskBusy } from '@/lib/taskBusy';
import { reportTaskWriteFailure } from '@/lib/taskStatus';
import TaskChecklist from './TaskChecklist';
import { BOARD_COLUMN_NAMES } from './TaskBoardCard';
import { PRIORITY_CONFIG, taskPriorityKey } from './TaskCardParts';

const LIST_KEYS = [['tasks'], ['allTasks'], ['dashboardTasks']];
const TEXT_DEBOUNCE_MS = 500;
const DRAFT_KEYS = ['title', 'description', 'time', 'duration_minutes'];

const WEEKDAYS = [
  { value: 1, short: 'Seg' },
  { value: 2, short: 'Ter' },
  { value: 3, short: 'Qua' },
  { value: 4, short: 'Qui' },
  { value: 5, short: 'Sex' },
  { value: 6, short: 'Sáb' },
  { value: 0, short: 'Dom' },
];

const RECURRENCE_LABELS = {
  none: 'Não repete',
  daily: 'Todo dia',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

function parseRecurrenceDays(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function draftValue(task, key) {
  if (key === 'title') return cleanPriorityPrefix(task?.title || '');
  if (key === 'time') return task?.time ? String(task.time).slice(0, 5) : '';
  if (key === 'duration_minutes') return Number(task?.duration_minutes) > 0 ? String(task.duration_minutes) : '';
  return task?.[key] || '';
}

function draftFromTask(task) {
  return Object.fromEntries(DRAFT_KEYS.map((key) => [key, draftValue(task, key)]));
}

/** Patch do painel → corpo do PUT (COALESCE: '' limpa data/hora) e valores para o cache. */
function toRequest(patch, today) {
  const body = {};
  const cache = {};
  Object.entries(patch).forEach(([key, value]) => {
    if (key === 'date' || key === 'time') {
      body[key] = value || '';
      cache[key] = value || null;
    } else if (key === 'duration_minutes') {
      const minutes = Number(value) > 0 ? Math.round(Number(value)) : 0;
      body[key] = minutes;
      cache[key] = minutes || null;
    } else {
      body[key] = value;
      cache[key] = value;
    }
  });
  if (patch.status) {
    const done = patch.status === 'completed';
    cache.completed_date = done ? today : null;
    cache.completed_at = done ? new Date().toISOString() : null;
  }
  return { body, cache };
}

function AutoGrowTextarea({ value, className, minRows = 1, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return <textarea ref={ref} rows={minRows} value={value} className={cn('resize-none', className)} {...props} />;
}

function FieldLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

function SaveIndicator({ state }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex min-h-6 items-center gap-1 text-xs tabular-nums transition-opacity duration-200 ease-out',
        state === 'idle' ? 'opacity-0' : 'opacity-100',
        state === 'error' ? 'text-rose-300' : 'text-muted-foreground'
      )}
    >
      {state === 'saving' ? 'Salvando…' : null}
      {state === 'saved' ? (
        <>
          <Check className="h-3.5 w-3.5 text-domain-wellness" aria-hidden /> Salvo
        </>
      ) : null}
      {state === 'error' ? 'Não salvou' : null}
    </span>
  );
}

const chipClass =
  'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function TaskDetailBody({ task, today, onClose, onDelete, onNotToday, onMoveToColumn, isMobile, TitleComponent, DescriptionComponent }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => draftFromTask(task));
  const [saveState, setSaveState] = useState('idle');
  const [dateOpen, setDateOpen] = useState(false);
  const { setStatus } = useTaskStatus();
  const statusBusy = Boolean(useTaskBusy(task?.id));
  const taskRef = useRef(task);
  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const focusedRef = useRef(null);
  const inflightRef = useRef(0);
  taskRef.current = task;

  const applyToCaches = (id, values) => {
    const patchList = (old) =>
      Array.isArray(old) ? old.map((t) => (String(t.id) === String(id) ? { ...t, ...values } : t)) : old;
    LIST_KEYS.forEach((queryKey) => queryClient.setQueriesData({ queryKey }, patchList));
    queryClient.setQueryData(['task', String(id)], (old) => (old ? { ...old, ...values } : old));
  };

  const save = useMutation({
    mutationFn: ({ id, body }) => praxisApi.tasks.update(id, body),
    onMutate: async ({ id, cache, previous }) => {
      inflightRef.current += 1;
      setSaveState('saving');
      await Promise.all(LIST_KEYS.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      applyToCaches(id, cache);
      return { id, previous };
    },
    onError: (err, _vars, context) => {
      if (context) {
        // Rollback só dos campos desta gravação — outras edições em voo ficam intactas.
        applyToCaches(context.id, context.previous);
        setDraft((d) => {
          const next = { ...d };
          DRAFT_KEYS.forEach((key) => {
            if (key in context.previous) next[key] = draftValue(context.previous, key);
          });
          return next;
        });
      }
      setSaveState('error');
      reportTaskWriteFailure(err, { fallback: 'Não deu pra salvar. Voltei o valor anterior.' });
    },
    onSuccess: (data) => {
      dispatchPraxisLevelUpFromResponse(data);
      notifyPraxisRecurrenceSpawned(data);
    },
    onSettled: (_data, error) => {
      inflightRef.current = Math.max(0, inflightRef.current - 1);
      if (inflightRef.current > 0) return;
      if (!error) setSaveState('saved');
      LIST_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      queryClient.invalidateQueries({ queryKey: ['gamification'] });
    },
  });

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length === 0) return;
    const current = taskRef.current;
    const { body, cache } = toRequest(patch, today);
    const previous = Object.fromEntries(Object.keys(cache).map((key) => [key, current?.[key] ?? null]));
    save.mutate({ id: current.id, body, cache, previous });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  /** Texto espera ~500 ms; check e chips gravam na hora (levando junto o que estava pendente). */
  const queue = (patch, { immediate = false } = {}) => {
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (immediate) {
      flush();
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), TEXT_DEBOUNCE_MS);
  };

  // Fechou ou trocou de tarefa: grava o que ficou pendente.
  useEffect(() => () => flushRef.current(), []);

  // Mudança vinda de fora (quadro, "Não hoje", refetch) atualiza o rascunho que não está em edição.
  useEffect(() => {
    setDraft((d) => {
      let changed = false;
      const next = { ...d };
      DRAFT_KEYS.forEach((key) => {
        if (key in pendingRef.current || focusedRef.current === key) return;
        const value = draftValue(task, key);
        if (next[key] !== value) {
          next[key] = value;
          changed = true;
        }
      });
      return changed ? next : d;
    });
  }, [task.title, task.description, task.time, task.duration_minutes]);

  const setText = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key === 'title' && !value.trim()) {
      delete pendingRef.current.title;
      return;
    }
    queue({ [key]: key === 'title' ? value.trim() : value });
  };

  const focusProps = (key) => ({
    onFocus: () => {
      focusedRef.current = key;
    },
    onBlur: () => {
      focusedRef.current = null;
      if (key === 'title' && !draft.title.trim()) {
        setDraft((d) => ({ ...d, title: draftValue(taskRef.current, 'title') }));
      }
      flush();
    },
  });

  const isDone = isTaskDone(task);
  const title = cleanPriorityPrefix(task.title);
  const priority = taskPriorityKey(task);
  const category = CATEGORIES[task.category];
  const recurrence = task.recurrence || 'none';
  const recurrenceDays = parseRecurrenceDays(task.recurrence_days);
  const currentColumn = boardColumnForTask(task, today);
  const isIdea = task.category === 'ideias';
  const showNotToday = isTaskOpen(task) && !isIdea && (!task.date || task.date <= today);
  const dateValue = task.date ? new Date(String(task.date).slice(0, 10) + 'T12:00:00') : undefined;

  // Concluir/reabrir usa o mesmo caminho das outras telas; o texto pendente é gravado antes.
  const toggleDone = async () => {
    if (statusBusy) return;
    flush();
    setSaveState('saving');
    const outcome = await setStatus(taskRef.current, isDone ? 'pending' : 'completed');
    if (outcome.kind === 'ignored') return;
    setSaveState(outcome.ok ? 'saved' : 'error');
  };

  const setDate = (dateKey) => {
    const patch = { date: dateKey };
    if (!dateKey) patch.time = null;
    if (!dateKey) setDraft((d) => ({ ...d, time: '' }));
    queue(patch, { immediate: true });
    setDateOpen(false);
  };

  const toggleWeekday = (value) => {
    const next = recurrenceDays.includes(value)
      ? recurrenceDays.filter((d) => d !== value)
      : [...recurrenceDays, value].sort();
    queue({ recurrence_days: next }, { immediate: true });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Topo: concluir, título editável, prioridade e área */}
      <div className="px-5 pb-4 pt-5">
        <TitleComponent className="sr-only">Detalhes da tarefa</TitleComponent>
        <DescriptionComponent className="sr-only">
          Cada mudança salva sozinha. Esc fecha.
        </DescriptionComponent>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-6 shrink-0 items-center justify-center">
            <Checkbox
              checked={isDone}
              disabled={statusBusy}
              aria-busy={statusBusy || undefined}
              onCheckedChange={toggleDone}
              aria-label={(isDone ? 'Reabrir ' : 'Concluir ') + title}
              className="h-5 w-5 rounded-md border-white/30 data-[state=checked]:border-domain-wellness data-[state=checked]:bg-domain-wellness data-[state=checked]:text-black"
            />
          </div>
          <AutoGrowTextarea
            value={draft.title}
            onChange={(e) => setText('title', e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            {...focusProps('title')}
            aria-label="Título da tarefa"
            maxLength={240}
            className={cn(
              'min-h-9 w-full min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-lg font-semibold leading-snug outline-none [text-wrap:pretty]',
              'transition-colors duration-150 hover:bg-white/[0.03] focus-visible:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring',
              isDone ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'text-foreground'
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="-mr-2 h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 pl-9">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(chipClass, 'bg-white/[0.05] text-foreground hover:bg-white/[0.08]')}
                aria-label={'Prioridade: ' + PRIORITY_CONFIG[priority].label + '. Trocar'}
              >
                <span aria-hidden className={cn('h-2 w-2 rounded-full', PRIORITY_CONFIG[priority].barClass)} />
                {PRIORITY_CONFIG[priority].label}
                <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuRadioGroup value={priority} onValueChange={(value) => queue({ priority: value }, { immediate: true })}>
                {Object.entries(PRIORITY_CONFIG).map(([key, info]) => (
                  <DropdownMenuRadioItem key={key} value={key}>
                    <span aria-hidden className={cn('mr-2 h-2 w-2 rounded-full', info.barClass)} />
                    {info.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(chipClass, category ? category.color : 'bg-white/[0.05] text-foreground', 'hover:brightness-110')}
                aria-label={'Área: ' + (category?.label || 'sem área') + '. Trocar'}
              >
                {category ? <span aria-hidden>{category.emoji}</span> : null}
                <span className="truncate">{category?.label || 'Área'}</span>
                <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-48 overflow-y-auto">
              <DropdownMenuRadioGroup value={task.category || ''} onValueChange={(value) => queue({ category: value }, { immediate: true })}>
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <DropdownMenuRadioItem key={key} value={key}>
                    <span aria-hidden className="mr-2">{cat.emoji}</span>
                    {cat.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {currentColumn ? (
            <span className="text-xs text-muted-foreground">{BOARD_COLUMN_NAMES[currentColumn]}</span>
          ) : null}

          <span className="ml-auto">
            <SaveIndicator state={saveState} />
          </span>
        </div>
      </div>

      {/* Corpo */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-6">
        <section aria-label="Quando" className="grid grid-cols-2 gap-x-3 gap-y-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="task-detail-date">Data</FieldLabel>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="task-detail-date"
                  type="button"
                  variant="outline"
                  className="h-10 justify-start gap-2 bg-secondary/40 px-3 font-normal tabular-nums"
                >
                  <CalendarIcon className="h-4 w-4 opacity-70" aria-hidden />
                  {dateValue ? format(dateValue, 'dd/MM/yyyy') : <span className="text-muted-foreground">Sem data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex gap-1.5 border-b border-white/[0.06] p-2">
                  <Button type="button" size="sm" variant="secondary" className="h-8 rounded-full text-xs" onClick={() => setDate(today)}>
                    Hoje
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-full text-xs"
                    onClick={() => setDate(fortalezaAddDays(today, 1))}
                  >
                    Amanhã
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={() => setDate(null)}>
                    Sem data
                  </Button>
                </div>
                <Calendar
                  mode="single"
                  selected={dateValue}
                  defaultMonth={dateValue}
                  onSelect={(d) => d && setDate(format(d, 'yyyy-MM-dd'))}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="task-detail-time">Hora</FieldLabel>
            <div className="relative">
              <Input
                id="task-detail-time"
                type="time"
                value={draft.time}
                disabled={!task.date}
                onChange={(e) => setText('time', e.target.value)}
                {...focusProps('time')}
                className="h-10 bg-secondary/40 pr-9 tabular-nums"
              />
              {draft.time ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft((d) => ({ ...d, time: '' }));
                    queue({ time: null }, { immediate: true });
                  }}
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Tirar horário"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="task-detail-duration">Duração</FieldLabel>
            <div className="relative">
              <Input
                id="task-detail-duration"
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                placeholder="—"
                value={draft.duration_minutes}
                onChange={(e) => setText('duration_minutes', e.target.value)}
                {...focusProps('duration_minutes')}
                className="h-10 bg-secondary/40 pr-12 tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="task-detail-recurrence">Repetir</FieldLabel>
            <Select
              value={recurrence}
              disabled={!task.date && recurrence === 'none'}
              onValueChange={(value) => queue({ recurrence: value }, { immediate: true })}
            >
              <SelectTrigger id="task-detail-recurrence" className="h-10 bg-secondary/40">
                <span className="flex min-w-0 items-center gap-2">
                  <Repeat className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <SelectValue>{RECURRENCE_LABELS[recurrence] || RECURRENCE_LABELS.none}</SelectValue>
                </span>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!task.date ? (
            <p className="col-span-2 -mt-1 text-xs text-muted-foreground">Dê uma data para marcar hora e repetir.</p>
          ) : null}

          {recurrence === 'weekly' ? (
            <div className="col-span-2 flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
              {WEEKDAYS.map((d) => {
                const active = recurrenceDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleWeekday(d.value)}
                    className={cn(
                      chipClass,
                      'h-9 px-3',
                      active ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="task-detail-notes">Notas</FieldLabel>
          <AutoGrowTextarea
            id="task-detail-notes"
            minRows={3}
            value={draft.description}
            onChange={(e) => setText('description', e.target.value)}
            {...focusProps('description')}
            placeholder="Contexto, links, o que destrava a tarefa…"
            className="max-h-[40vh] min-h-[5.5rem] w-full overflow-y-auto rounded-lg bg-secondary/40 px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </section>

        {!isIdea ? <TaskChecklist taskId={task.id} /> : null}
      </div>

      {/* Rodapé */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-background px-5 pt-3',
          isMobile ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]' : 'pb-3'
        )}
      >
        {showNotToday ? (
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => onNotToday?.(task)}>
            <CalendarClock className="h-4 w-4" aria-hidden /> Não hoje
          </Button>
        ) : null}
        {!isIdea ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-full">
                <ArrowRightLeft className="h-4 w-4" aria-hidden /> Mover para…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-44">
              {BOARD_COLUMNS.map((columnId) => (
                <DropdownMenuItem
                  key={columnId}
                  disabled={currentColumn === columnId}
                  onClick={() => onMoveToColumn?.(task, columnId)}
                >
                  {BOARD_COLUMN_NAMES[columnId]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-9 gap-1.5 rounded-full text-rose-300 hover:bg-destructive/10 hover:text-rose-200"
          onClick={() => onDelete?.(task)}
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Excluir
        </Button>
      </div>
    </div>
  );
}

/**
 * Detalhe da tarefa — sheet à direita no desktop, drawer de baixo no celular.
 * Sem botão Salvar: cada mudança grava sozinha, otimista, com rollback.
 */
export default function TaskDetailPanel({ task, open, onOpenChange, today, onDelete, onNotToday, onMoveToColumn }) {
  const isMobile = useIsMobile();
  // Mantém a última tarefa durante a animação de saída (ex.: depois de excluir).
  const lastTaskRef = useRef(task);
  if (task) lastTaskRef.current = task;
  const shown = task || lastTaskRef.current;

  const close = () => onOpenChange?.(false);
  const body = shown ? (
    <TaskDetailBody
      key={shown.id}
      task={shown}
      today={today}
      onClose={close}
      onDelete={onDelete}
      onNotToday={onNotToday}
      onMoveToColumn={onMoveToColumn}
      isMobile={isMobile}
      TitleComponent={isMobile ? DrawerTitle : SheetTitle}
      DescriptionComponent={isMobile ? DrawerDescription : SheetDescription}
    />
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[92dvh] border-white/[0.08] bg-background outline-none">
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="flex w-full flex-col gap-0 border-white/[0.08] p-0 sm:max-w-[440px]"
      >
        {body}
      </SheetContent>
    </Sheet>
  );
}
