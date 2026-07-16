import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SKIP_REASONS } from '@/lib/habits';

const PLACEHOLDERS = [
  'eu escolhi o fácil',
  'eu tive medo de tentar e falhar',
  'eu fui irresponsável com isso',
  'eu priorizei o conforto no lugar disso',
];

/**
 * Sheet de “Não rolou” com nome honesto em texto livre (+ chips opcionais).
 */
export default function SkipHabitSheet({
  open,
  onOpenChange,
  habitTitle = 'Hábito',
  outcome = 'open',
  initialNote = '',
  busy = false,
  onConfirm,
  onUndo,
  onMarkDone,
}) {
  const [note, setNote] = useState('');
  const [chip, setChip] = useState(null);
  const [placeholder] = useState(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
  );

  useEffect(() => {
    if (open) {
      setNote(initialNote || '');
      setChip(null);
    }
  }, [open, initialNote, habitTitle]);

  const submit = (skipReason = chip) => {
    const cleaned = String(note || '').trim().slice(0, 280);
    onConfirm?.({
      skipReason: skipReason || null,
      skipNote: cleaned || null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl border-white/10 bg-card">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">{habitTitle}</SheetTitle>
          <SheetDescription>
            {outcome === 'skipped'
              ? 'Já registrado como não rolou. Pode desfazer, editar o nome ou marcar feito.'
              : 'Quando falhar, nomeia sem romance — sem “falta disciplina”. O nome honesto.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3 pb-5">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Nome honesto (opcional, mas melhor)
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 280))}
              placeholder={placeholder}
              className="min-h-[80px] resize-none border-amber-500/20 bg-white/[0.03] text-sm"
              disabled={busy}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground/80">
              Em vez de “falta disciplina” — fala o nome real.
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SKIP_REASONS.map((r) => (
              <Button
                key={r.value}
                type="button"
                variant="outline"
                size="sm"
                className={
                  chip === r.value
                    ? 'shrink-0 rounded-full border-amber-400/50 bg-amber-500/25 text-amber-50'
                    : 'shrink-0 rounded-full border-amber-500/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                }
                disabled={busy}
                onClick={() => setChip((c) => (c === r.value ? null : r.value))}
              >
                {r.label}
              </Button>
            ))}
          </div>

          <Button
            type="button"
            className="w-full rounded-full bg-amber-600 text-white hover:bg-amber-500"
            disabled={busy}
            onClick={() => submit(chip)}
          >
            {outcome === 'skipped' ? 'Atualizar nome da falha' : 'Registrar: não rolou'}
          </Button>

          {outcome === 'skipped' && onUndo ? (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              disabled={busy}
              onClick={onUndo}
            >
              Desfazer
            </Button>
          ) : null}

          {outcome !== 'done' && onMarkDone ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full rounded-full text-muted-foreground"
              disabled={busy}
              onClick={onMarkDone}
            >
              Na verdade fiz — marcar feito
            </Button>
          ) : null}

          {outcome === 'done' && onUndo ? (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              disabled={busy}
              onClick={onUndo}
            >
              Desfazer feito
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
