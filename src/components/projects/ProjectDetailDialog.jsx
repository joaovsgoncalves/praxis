import React, { useEffect, useMemo, useState } from 'react';
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
  formatProjectUpdateDate,
} from '@/lib/projects';

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
              {update.source || 'manual'}
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
  open,
  onOpenChange,
  onSave,
  saving = false,
  updates = [],
  updatesLoading = false,
  onAddUpdate,
  addingUpdate = false,
}) {
  const [form, setForm] = useState({
    kind: 'produto',
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

  useEffect(() => {
    if (!project) return;
    setForm({
      kind: project.kind || 'produto',
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
    setNewUpdate('');
  }, [project]);

  const subtitle = useMemo(() => {
    if (!project) return '';
    const bits = [PROJECT_KIND_LABELS[project.kind] || 'Frente', PROJECT_COLUMN_LABELS[project.column] || project.column];
    if (project.focus) bits.push('Foco');
    if (project.live) bits.push('No ar');
    return bits.join(' · ');
  }, [project]);

  if (!project) return null;

  const setField = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave?.(project, {
      ...form,
      live: form.live ? 1 : 0,
    });
  };

  const handleAddUpdate = async () => {
    const summary = newUpdate.trim();
    if (!summary) return;
    const ok = await onAddUpdate?.(project, summary);
    if (ok !== false) setNewUpdate('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(760px,96vw)] overflow-y-auto border-white/10 bg-[#101319] px-5 py-6 sm:max-w-[760px] sm:px-7"
      >
        <SheetHeader className="pr-8">
          <SheetTitle className="praxis-title text-left text-2xl">{project.name}</SheetTitle>
          <SheetDescription className="text-left">{subtitle}</SheetDescription>
          {project.tagline ? (
            <p className="text-left text-sm leading-relaxed text-muted-foreground">{project.tagline}</p>
          ) : null}
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <section className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="project-kind" label="Tipo">
                <Select value={form.kind} onValueChange={(value) => setForm((prev) => ({ ...prev, kind: value }))}>
                  <SelectTrigger id="project-kind" className="w-full border-white/10 bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="produto">Produto</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                    <SelectItem value="trabalho">Trabalho</SelectItem>
                    <SelectItem value="estudo">Faculdade</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field id="project-column" label="Estado no quadro">
                <Select value={form.column} onValueChange={(value) => setForm((prev) => ({ ...prev, column: value }))}>
                  <SelectTrigger id="project-column" className="w-full border-white/10 bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_COLUMNS.map((column) => (
                      <SelectItem key={column} value={column}>{PROJECT_COLUMN_LABELS[column]}</SelectItem>
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

            <Field id="project-objective" label="Objetivo" hint="Por que isso existe">
              <Textarea id="project-objective" value={form.objective} onChange={setField('objective')} placeholder="A razão desta frente existir" className="min-h-[82px] border-white/10 bg-black/20" />
            </Field>

            <Field id="project-status" label="Estado atual" hint="Onde ficou de verdade">
              <Textarea id="project-status" value={form.status_summary} onChange={setField('status_summary')} placeholder="Resumo honesto do estado atual" className="min-h-[82px] border-white/10 bg-black/20" />
            </Field>
          </section>

          <section className="space-y-4 rounded-2xl border border-domain-gold/15 bg-domain-gold/[0.025] p-4">
            <Field id="project-slice" label="Agora" hint="A fatia na mesa">
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
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange?.(false)}>
              Fechar
            </Button>
            <Button type="submit" className="rounded-full" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar estado'}
            </Button>
          </div>
        </form>

        <section className="mt-7 border-t border-white/[0.06] pt-6">
          <div className="mb-4">
            <p className="text-sm font-semibold text-stone-100">Linha do tempo</p>
            <p className="mt-1 text-xs text-muted-foreground">Movimentos que ajudam a retomar a frente sem reconstruir tudo na cabeça.</p>
          </div>

          <div className="mb-5 flex gap-2">
            <Input
              value={newUpdate}
              onChange={(event) => setNewUpdate(event.target.value)}
              placeholder="Registrar um avanço curto…"
              className="border-white/10 bg-black/20"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAddUpdate();
                }
              }}
            />
            <Button type="button" variant="outline" className="shrink-0 border-white/10" disabled={addingUpdate || !newUpdate.trim()} onClick={handleAddUpdate}>
              Registrar
            </Button>
          </div>

          {updatesLoading ? (
            <p className="text-xs text-muted-foreground/60">Carregando histórico…</p>
          ) : (
            <Timeline updates={updates} />
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}
