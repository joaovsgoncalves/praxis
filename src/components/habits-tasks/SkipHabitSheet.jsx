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

        <div className="mt-4 space-y-4 pb-5">
          {outcome !== 'skipped' || true ? (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Nome honesto (opcional, mas melhor)
                </p>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 280))}
                  placeholder={placeholder}
                  className="min-h-[88px] resize-none border-amber-500/20 bg-black/20 text-sm"
                  disabled={busy}
                />
                <p className="text-[11px] text-muted-foreground/80">
                  Ex.: “eu escolhi o fácil” · “tive medo de falhar” · “fui irresponsável com isso”
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Atalho (opcional)</p>
                <div className="flex flex-wrap gap-2">
                  {SKIP_REASONS.map((r) => (
                    <Button
                      key={r.value}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={
                        chip === r.value
                          ? 'rounded-full border-amber-400/50 bg-amber-500/25 text-amber-50'
                          : 'rounded-full border-amber-500/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      }
                      disabled={busy}
                      onClick={() => setChip((c) => (c === r.value ? null : r.value))}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              </div>

              {outcome !== 'skipped' ? (
                <Button
                  type="button"
                  className="w-full rounded-full bg-amber-600 text-white hover:bg-amber-500"
                  disabled={busy}
                  onClick={() => submit(chip)}
                >
                  Registrar: não rolou
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full rounded-full bg-amber-600 text-white hover:bg-amber-500"
                  disabled={busy}
                  onClick={() => submit(chip)}
                >
                  Atualizar nome da falha
                </Button>
              )}
            </>
          ) : null}

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
              variant={outcome === 'skipped' ? 'outline' : 'default'}
              className="w-full rounded-full"
              disabled={busy}
              onClick={onMarkDone}
            >
              Feito
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
