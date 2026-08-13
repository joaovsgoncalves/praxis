import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PraxisEmptyState, PraxisListSkeleton } from '@/components/layout/PraxisPage';
import {
  REGIMEN_FREQUENCY_LABELS,
  REGIMEN_KIND_LABELS,
  REGIMEN_TIMING_LABELS,
} from '@/lib/nutrition';
import { toast } from 'sonner';

const EMPTY_FORM = {
  name: '',
  dose_label: '',
  kind: 'supplement',
  timing: 'morning',
  frequency: 'daily',
};

export default function RegimenCatalog() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['nutrition', 'regimen', 'items'],
    queryFn: () => praxisApi.nutrition.regimen.items({ status: 'active' }),
    retry: 1,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['nutrition', 'regimen'] });
  };

  const createMut = useMutation({
    mutationFn: (data) => praxisApi.nutrition.regimen.create(data),
    onSuccess: () => {
      invalidate();
      setForm(EMPTY_FORM);
      setOpen(false);
      toast.success('Item adicionado');
    },
    onError: () => toast.error('Não deu pra adicionar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => praxisApi.nutrition.regimen.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Item arquivado');
    },
    onError: () => toast.error('Não deu pra arquivar'),
  });

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/40 shadow-none">
        <CardContent className="px-4 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Rotina</p>
              <p className="text-xs text-muted-foreground">
                Remédio separado de suplemento. Whey continua no diário de comida.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="rounded-full shrink-0"
              onClick={() => setOpen((v) => !v)}
            >
              <Plus className="w-4 h-4 mr-1" />
              {open ? 'Fechar' : 'Novo'}
            </Button>
          </div>

          {open ? (
            <form
              className="space-y-3 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.name.trim()) {
                  toast.error('Põe um nome');
                  return;
                }
                createMut.mutate(form);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="regimen-name" className="text-xs text-muted-foreground">
                  Nome
                </Label>
                <Input
                  id="regimen-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Creatina"
                  className="bg-secondary/40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="regimen-dose" className="text-xs text-muted-foreground">
                  Dose
                </Label>
                <Input
                  id="regimen-dose"
                  value={form.dose_label}
                  onChange={(e) => setForm((f) => ({ ...f, dose_label: e.target.value }))}
                  placeholder="5 g"
                  className="bg-secondary/40"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FieldSelect
                  label="Tipo"
                  value={form.kind}
                  onChange={(kind) => setForm((f) => ({ ...f, kind }))}
                  options={REGIMEN_KIND_LABELS}
                />
                <FieldSelect
                  label="Quando"
                  value={form.timing}
                  onChange={(timing) => setForm((f) => ({ ...f, timing }))}
                  options={REGIMEN_TIMING_LABELS}
                />
                <FieldSelect
                  label="Frequência"
                  value={form.frequency}
                  onChange={(frequency) => setForm((f) => ({ ...f, frequency }))}
                  options={REGIMEN_FREQUENCY_LABELS}
                />
              </div>
              <Button type="submit" className="w-full rounded-full" disabled={createMut.isPending}>
                {createMut.isPending ? 'Salvando…' : 'Salvar na rotina'}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? (
        <PraxisListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <PraxisEmptyState
          title="Rotina vazia"
          description="Adiciona o que tu toma de verdade. Sem stack de influencer."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.name}
                  {item.kind === 'medication' ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">
                      remédio
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {[
                    item.dose_label,
                    REGIMEN_TIMING_LABELS[item.timing],
                    REGIMEN_FREQUENCY_LABELS[item.frequency],
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Arquivar ${item.name}`}
                onClick={() => {
                  if (window.confirm(`Arquivar ${item.name}?`)) {
                    deleteMut.mutate(item.id);
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-secondary/40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([id, text]) => (
            <SelectItem key={id} value={id}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
