import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Timer, Pencil, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PROJECT_COLUMNS,
  PROJECT_COLUMN_LABELS,
  PROJECT_KIND_LABELS,
  PROJECT_KIND_OPTIONS,
  FRONT_STATUS_LABELS,
  buildWhereLines,
  formatProjectUpdateDate,
  isProjectBlocked,
  listParentOptions,
} from '@/lib/projects';
import { cn } from '@/lib/utils';

const PRESS = 'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';
const RECENT_UPDATES = 3;
// O Select do Radix não aceita valor vazio; este marca "sem frente-mãe".
const NO_PARENT = '__sem_mae__';

function Field({ id, label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor={id} className="text-xs font-medium text-stone-200">
          {label}
        </Label>
        {hint ? <span className="text-[10px] text-muted-foreground/55">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

const UPDATE_SOURCE_LABELS = {
  conclusao: 'feito',
  seneca: 'Sêneca',
  praxis: 'Praxis',
  manual: 'manual',
};

function Timeline({ updates = [] }) {
  if (!updates.length) {
    return <p className="text-xs text-muted-foreground/60">Ainda não há avanços registrados.</p>;
  }

  return (
    <div className="space-y-3">
      {updates.map((update) => (
        <div key={update.id} className="relative pl-4">
          <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-domain-gold/70" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground/65">
              {formatProjectUpdateDate(update.date)}
            </span>
            <Badge variant="outline" className="h-5 border-white/10 bg-white/[0.03] px-1.5 text-[9px] font-medium text-muted-foreground/70">
              {UPDATE_SOURCE_LABELS[update.source] || update.source || 'manual'}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-stone-200/90">{update.summary}</p>
        </div>
      ))}
    </div>
  );
}

export default function ProjectDetailDialog({
  project,
  projects = [],
  open,
  onOpenChange,
  onSave,
  saving = false,
  updates = [],
  updatesLoading = false,
  onAddUpdate,
  addingUpdate = false,
  onCompleteNextStep,
  completingNextStep = false,
  onStartFocus,
  startingFocus = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    kind: 'produto',
    parent_slug: '',
    column: 'radar',
    live: false,
    objective: '',
    status_summary: '',
    current_slice: '',
    next_step: '',
    blocked_note: '',
    shipped_note: '',
    notes: '',
  });
  const [newUpdate, setNewUpdate] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const reduceMotion = useReducedMotion();

  const syncFormFromProject = () => {
    if (!project) return;
    setForm({
      kind: project.kind || 'produto',
      parent_slug: project.parent_slug || '',
      column: project.column || 'radar',
      live: Boolean(project.live),
      objective: project.objective || '',
      status_summary: project.status_summary || '',
      current_slice: project.current_slice || '',
      next_step: project.next_step || '',
      blocked_note: project.blocked_note || '',
      shipped_note: project.shipped_note || '',
      notes: project.notes || '',
    });
  };

  useEffect(() => {
    syncFormFromProject();
    setIsEditing(false);
    setNewUpdate('');
  }, [project, open]);

  // Expansões voltam fechadas ao trocar de frente (não a cada refetch da mesma).
  useEffect(() => {
    setShowMore(false);
    setShowAllUpdates(false);
  }, [project?.id, open]);

  const parentOptions = useMemo(() => listParentOptions(projects, project), [projects, project]);
  const hasChildren = useMemo(() => {
    const slug = String(project?.slug || '').toLowerCase();
    return Boolean(slug) && projects.some((p) => String(p.parent_slug || '').trim().toLowerCase() === slug);
  }, [projects, project]);

  if (!project) return null;

  const setField = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const { parent_slug: parentSlug, ...rest } = form;
    const data = { ...rest, live: form.live ? 1 : 0 };
    // Só manda a mãe quando mudou, para não revalidar um vínculo antigo sem motivo.
    if (parentSlug !== (project.parent_slug || '')) data.parent_slug = parentSlug;
    onSave?.(project, data);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    syncFormFromProject();
    setIsEditing(false);
  };

  const handleAddUpdate = async () => {
    const summary = newUpdate.trim();
    if (!summary) return;
    const ok = await onAddUpdate?.(project, summary);
    if (ok !== false) setNewUpdate('');
  };

  const hasNextStep = Boolean(String(project.next_step || '').trim());
  const blocked = isProjectBlocked(project);
  const whereLines = buildWhereLines(project);
  const statusLabel = FRONT_STATUS_LABELS[project.column] || project.column;
  const prodUrl = String(project.prod_url || '').trim();
  const repoPath = String(project.repo_path || '').trim();
  const moreContext = [
    String(project.objective || '').trim() && { label: 'Objetivo', text: project.objective },
    String(project.shipped_note || '').trim() && { label: 'O que já existe', text: project.shipped_note },
    String(project.notes || '').trim() && { label: 'Notas', text: project.notes },
  ].filter(Boolean);
  const reveal = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : {
        initial: { opacity: 0, y: -4 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: 'easeOut' } },
        transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
      };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(760px,96vw)] overflow-y-auto border-white/10 bg-[#101319] px-5 py-6 sm:max-w-[760px] sm:px-7"
      >
        <SheetHeader className="pr-8">
          <SheetTitle className="praxis-title text-left text-2xl">{project.name}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2 text-left">
              <span>{statusLabel}</span>
              {blocked ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  Bloqueada
                </span>
              ) : null}
            </div>
          </SheetDescription>
        </SheetHeader>

        {isEditing ? (
          /* MODO EDIÇÃO: Revela o formulário completo existente */
          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <div className="rounded-xl border border-domain-gold/20 bg-domain-gold/[0.03] px-3.5 py-2 text-xs font-medium text-domain-gold">
              Editando estado da frente
            </div>

            <section className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="project-kind" label="Tipo">
                  <Select value={form.kind} onValueChange={(value) => setForm((prev) => ({ ...prev, kind: value }))}>
                    <SelectTrigger id="project-kind" className="w-full border-white/10 bg-black/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_KIND_OPTIONS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {PROJECT_KIND_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field id="project-column" label="Estado">
                  <Select value={form.column} onValueChange={(value) => setForm((prev) => ({ ...prev, column: value }))}>
                    <SelectTrigger id="project-column" className="w-full border-white/10 bg-black/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_COLUMNS.map((column) => (
                        <SelectItem key={column} value={column}>
                          {PROJECT_COLUMN_LABELS[column] || column}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-stone-200">No ar</p>
                    <p className="text-[10px] text-muted-foreground/60">Independente do quadro.</p>
                  </div>
                  <Switch checked={form.live} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, live: checked }))} />
                </div>
              </div>

              <Field
                id="project-parent"
                label="Dentro de"
                hint={hasChildren ? 'Tem frentes dentro, então fica solta' : 'Frente-mãe, se houver'}
              >
                <Select
                  value={form.parent_slug || NO_PARENT}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, parent_slug: value === NO_PARENT ? '' : value }))}
                  disabled={hasChildren}
                >
                  <SelectTrigger id="project-parent" className="w-full border-white/10 bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>Nenhuma, frente solta</SelectItem>
                    {parentOptions.map((option) => (
                      <SelectItem key={option.slug} value={option.slug}>
                        {option.name}
                      </SelectItem>
                    ))}
                    {form.parent_slug && !parentOptions.some((o) => o.slug === form.parent_slug) ? (
                      <SelectItem value={form.parent_slug}>{form.parent_slug}</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </Field>

              <Field id="project-objective" label="Objetivo" hint="Por que isso existe">
                <Textarea id="project-objective" value={form.objective} onChange={setField('objective')} placeholder="A razão desta frente existir" className="min-h-[82px] border-white/10 bg-black/20" />
              </Field>

              <Field id="project-status" label="Onde ficou" hint="Resumo honesto de agora">
                <Textarea id="project-status" value={form.status_summary} onChange={setField('status_summary')} placeholder="Resumo honesto do estado atual" className="min-h-[82px] border-white/10 bg-black/20" />
              </Field>
            </section>

            <section className="space-y-4 rounded-2xl border border-domain-gold/15 bg-domain-gold/[0.025] p-4">
              <Field id="project-slice" label="Mexendo agora" hint="O que está na mesa">
                <Input id="project-slice" value={form.current_slice} onChange={setField('current_slice')} placeholder="O que está sendo trabalhado agora" className="border-white/10 bg-black/20" />
              </Field>

              <Field id="project-next" label="Próximo passo" hint="Uma ação executável">
                <Textarea id="project-next" value={form.next_step} onChange={setField('next_step')} placeholder="A menor próxima ação que realmente move esta frente" className="min-h-[92px] border-domain-gold/20 bg-black/20 text-stone-100" />
              </Field>

              <Field id="project-blocked" label="Travado por" hint="Vazio se não houver bloqueio">
                <Textarea id="project-blocked" value={form.blocked_note} onChange={setField('blocked_note')} placeholder="Dependência, decisão ou impedimento real" className="min-h-[72px] border-white/10 bg-black/20" />
              </Field>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <Field id="project-shipped" label="O que já existe">
                <Textarea id="project-shipped" value={form.shipped_note} onChange={setField('shipped_note')} placeholder="Entregas já disponíveis ou capacidades consolidadas" className="min-h-[82px] border-white/10 bg-black/20" />
              </Field>
              <Field id="project-notes" label="Notas">
                <Textarea id="project-notes" value={form.notes} onChange={setField('notes')} placeholder="Contexto que vale preservar" className="min-h-[82px] border-white/10 bg-black/20" />
              </Field>
            </section>

            <div className="sticky bottom-0 -mx-2 flex justify-end gap-2 border-t border-white/[0.06] bg-[#101319]/95 px-2 py-3 backdrop-blur">
              <Button type="button" variant="ghost" className="rounded-full" onClick={handleCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-full" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar estado'}
              </Button>
            </div>
          </form>
        ) : (
          /* Leitura: próximo passo, onde está, linha do tempo; o resto fica em "Mais". */
          <div className="mt-6 space-y-4">
            <section
              aria-labelledby="project-next-heading"
              className="rounded-2xl border border-domain-gold/20 bg-domain-gold/[0.04] p-4 sm:p-5"
            >
              <h3 id="project-next-heading" className="text-sm font-semibold text-domain-gold">
                Próximo passo
              </h3>

              {hasNextStep ? (
                <>
                  <p className="mt-2 text-base font-medium leading-snug text-stone-100 [text-wrap:pretty]">
                    {project.next_step}
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className={cn('h-10 flex-1 rounded-full text-xs font-medium', PRESS)}
                      disabled={startingFocus || !hasNextStep}
                      onClick={() => onStartFocus?.(project)}
                    >
                      <Timer className="mr-1.5 h-3.5 w-3.5" />
                      {startingFocus ? 'Abrindo…' : 'Começar no Modo Foco'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-10 flex-1 rounded-full border-domain-gold/30 bg-domain-gold/[0.04] text-xs font-medium text-domain-gold hover:bg-domain-gold/[0.08] hover:text-domain-gold',
                        PRESS,
                      )}
                      disabled={completingNextStep || !hasNextStep}
                      onClick={() => onCompleteNextStep?.(project)}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      {completingNextStep ? 'Registrando…' : 'Fiz isso'}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
                  Próximo passo pendente de revisão. Dá pra definir um em Editar estado ou esperar o Sêneca no próximo ciclo.
                </p>
              )}
            </section>

            {whereLines.length > 0 ? (
              <section
                aria-labelledby="project-where-heading"
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
              >
                <h3 id="project-where-heading" className="text-xs font-medium text-muted-foreground">
                  Onde está
                </h3>
                {whereLines.map((line, index) => (
                  <p
                    key={line}
                    className={cn(
                      'text-sm leading-relaxed [text-wrap:pretty]',
                      index === 0 ? 'mt-1 text-stone-200' : 'mt-2 text-stone-300/85',
                    )}
                  >
                    {line}
                  </p>
                ))}
              </section>
            ) : null}
          </div>
        )}

        {/* Linha do tempo: os mais recentes à vista, o resto sob pedido */}
        {isEditing ? null : (
          <section className="mt-6 space-y-4">
            <h3 className="text-sm font-semibold text-stone-100">Linha do tempo</h3>

            {updatesLoading ? (
              <p className="text-xs text-muted-foreground/60">Carregando histórico…</p>
            ) : (
              <div>
                <Timeline updates={showAllUpdates ? updates : updates.slice(0, RECENT_UPDATES)} />
                {updates.length > RECENT_UPDATES ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 h-9 rounded-full px-3 text-xs text-muted-foreground hover:text-stone-200"
                    aria-expanded={showAllUpdates}
                    onClick={() => setShowAllUpdates((value) => !value)}
                  >
                    {showAllUpdates ? 'Ver só os recentes' : `Ver todos (${updates.length})`}
                  </Button>
                ) : null}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={newUpdate}
                onChange={(event) => setNewUpdate(event.target.value)}
                placeholder="Registrar um avanço curto…"
                aria-label="Registrar um avanço curto"
                className="border-white/10 bg-black/20"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddUpdate();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className={cn('shrink-0 border-white/10', PRESS)}
                disabled={addingUpdate || !newUpdate.trim()}
                onClick={handleAddUpdate}
              >
                Registrar
              </Button>
            </div>
          </section>
        )}

        {/* Mais: objetivo, bloqueio, links e edição, recolhidos por padrão */}
        {isEditing ? null : (
          <section className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.015]">
            <button
              type="button"
              aria-expanded={showMore}
              aria-controls="project-more"
              onClick={() => setShowMore((value) => !value)}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-stone-200 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-domain-gold/50 sm:px-5"
            >
              <span>
                Mais
                {blocked ? (
                  <span className="ml-2 text-xs font-normal text-amber-400">tem bloqueio</span>
                ) : null}
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
                  showMore && 'rotate-180',
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {showMore ? (
                <motion.div
                  id="project-more"
                  key="more"
                  initial={reveal.initial}
                  animate={reveal.animate}
                  exit={reveal.exit}
                  transition={reveal.transition}
                  className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-4 sm:px-5 sm:pb-5"
                >
                  {blocked ? (
                    <div className="flex gap-2.5">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-rose-300">Travado por</h4>
                        <p className="mt-0.5 text-sm leading-relaxed text-rose-100/85 [text-wrap:pretty]">
                          {project.blocked_note}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {moreContext.map((item) => (
                    <div key={item.label}>
                      <h4 className="text-xs font-medium text-muted-foreground">{item.label}</h4>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-300 [text-wrap:pretty]">
                        {item.text}
                      </p>
                    </div>
                  ))}

                  {prodUrl || repoPath ? (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground">Links</h4>
                      <div className="mt-1 space-y-1 text-sm">
                        {prodUrl ? (
                          <a
                            href={prodUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1.5 text-domain-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-domain-gold/50"
                          >
                            <span className="truncate">{prodUrl.replace(/^https?:\/\//, '')}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          </a>
                        ) : null}
                        {repoPath ? (
                          <p className="break-all text-xs text-muted-foreground">Código em {repoPath}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      'h-10 rounded-full border-white/10 px-4 text-xs font-medium text-stone-200 hover:border-white/20 hover:bg-white/[0.05]',
                      PRESS,
                    )}
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Editar estado
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        )}
      </SheetContent>
    </Sheet>
  );
}
