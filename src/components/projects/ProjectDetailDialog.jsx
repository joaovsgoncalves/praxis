import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PROJECT_COLUMN_LABELS } from '@/lib/projects';

function Field({ id, label, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export default function ProjectDetailDialog({
  project,
  open,
  onOpenChange,
  onSave,
  saving = false,
}) {
  const [form, setForm] = useState({
    current_slice: '',
    last_move_at: '',
    last_move_note: '',
    notes: '',
    shipped_note: '',
    blocked_note: '',
  });

  useEffect(() => {
    if (!project) return;
    setForm({
      current_slice: project.current_slice || '',
      last_move_at: String(project.last_move_at || '').slice(0, 10),
      last_move_note: project.last_move_note || '',
      notes: project.notes || '',
      shipped_note: project.shipped_note || '',
      blocked_note: project.blocked_note || '',
    });
  }, [project]);

  if (!project) return null;

  const setField = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave?.(project, {
      current_slice: form.current_slice,
      last_move_at: form.last_move_at,
      last_move_note: form.last_move_note,
      notes: form.notes,
      shipped_note: form.shipped_note,
      blocked_note: form.blocked_note,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#12151c] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="praxis-title text-left text-xl">
            {project.name}
          </DialogTitle>
          <p className="text-left text-sm text-muted-foreground">
            {PROJECT_COLUMN_LABELS[project.column] || project.column}
            {project.focus ? ' · Foco' : ''}
          </p>
          {project.tagline ? (
            <p className="text-left text-sm leading-relaxed text-muted-foreground">
              {project.tagline}
            </p>
          ) : null}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id="project-slice" label="Fatia agora">
            <Input
              id="project-slice"
              value={form.current_slice}
              onChange={setField('current_slice')}
              placeholder="O que está na mesa neste produto"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="project-move-date" label="Último movimento">
              <Input
                id="project-move-date"
                type="date"
                value={form.last_move_at}
                onChange={setField('last_move_at')}
              />
            </Field>
            <Field id="project-move-note" label="O que mudou">
              <Input
                id="project-move-note"
                value={form.last_move_note}
                onChange={setField('last_move_note')}
                placeholder="Uma frase curta"
              />
            </Field>
          </div>

          <Field id="project-notes" label="Notas da fatia">
            <Textarea
              id="project-notes"
              value={form.notes}
              onChange={setField('notes')}
              placeholder="O que importa nesta fatia"
            />
          </Field>

          <Field id="project-shipped" label="O que já está no ar">
            <Textarea
              id="project-shipped"
              value={form.shipped_note}
              onChange={setField('shipped_note')}
              placeholder="O que o mundo já usa"
            />
          </Field>

          <Field id="project-blocked" label="O que está travado">
            <Textarea
              id="project-blocked"
              value={form.blocked_note}
              onChange={setField('blocked_note')}
              placeholder="O que segura o próximo passo"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => onOpenChange?.(false)}
            >
              Fechar
            </Button>
            <Button type="submit" className="rounded-full" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
