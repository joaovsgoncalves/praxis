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

/** Frases honestas — toque preenche o nome (ainda dá pra editar / escrever do zero) */
const HONEST_PHRASES = [
  'eu escolhi o fácil',
  'eu tive medo de tentar e falhar',
  'eu fui irresponsável com isso',
  'eu priorizei o conforto no lugar disso',
];

/**
 * Sheet de “Não rolou” com nome honesto em texto livre (+ atalhos opcionais).
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
              : 'Quando falhar, nomeia sem romance — sem “falta disciplina” / “sou procrastinador”.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3 pb-5">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Nome honesto
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 280))}
              placeholder="escreve o teu — ou toca um abaixo"
              className="min-h-[88px] resize-none border-amber-500/20 bg-white/[0.03] text-sm"
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">Toque pra preencher (edita depois se quiser)</p>
            <div className="flex flex-col gap-1.5">
              {HONEST_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  disabled={busy}
                  onClick={() => setNote(phrase)}
                  className={
                    note === phrase
                      ? 'rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2.5 text-left text-sm text-amber-50'
                      : 'rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left text-sm text-foreground/90 hover:border-amber-500/25 hover:bg-amber-500/[0.08]'
                  }
                >
                  “{phrase}”
                </button>
              ))}
            </div>
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
                    : 'shrink-0 rounded-full border-white/10 text-muted-foreground hover:bg-white/[0.04]'
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
