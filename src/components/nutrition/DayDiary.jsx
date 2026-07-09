import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Trash2, Search } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PraxisEmptyState } from '@/components/layout/PraxisPage';
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  formatGrams,
  formatKcal,
} from '@/lib/nutrition';
import MacroBars from '@/components/nutrition/MacroBars';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatDateLabel(iso) {
  if (iso === todayLocalISO()) return 'Hoje';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function defaultSlotForHour() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  if (h < 22) return 'dinner';
  return 'other';
}

export default function DayDiary({ date: controlledDate, onDateChange }) {
  const queryClient = useQueryClient();
  const [internalDate, setInternalDate] = useState(todayLocalISO);
  const date = controlledDate || internalDate;
  const setDate = (d) => {
    if (onDateChange) onDateChange(d);
    else setInternalDate(d);
  };

  const [addOpen, setAddOpen] = useState(false);
  const [addSlot, setAddSlot] = useState(defaultSlotForHour);
  const [foodQ, setFoodQ] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [servings, setServings] = useState('1');
  const [editLog, setEditLog] = useState(null);
  const [editServings, setEditServings] = useState('1');

  const { data: day, isLoading, isError } = useQuery({
    queryKey: ['nutrition', 'day', date],
    queryFn: () => forjaApi.nutrition.day(date),
    retry: 1,
  });

  const { data: foods = [] } = useQuery({
    queryKey: ['nutrition', 'foods', { q: foodQ, forAdd: true }],
    queryFn: () =>
      forjaApi.nutrition.foods.list({
        q: foodQ.trim() || undefined,
        limit: 30,
      }),
    enabled: addOpen,
    retry: 1,
  });

  const invalidateDay = () => {
    queryClient.invalidateQueries({ queryKey: ['nutrition', 'day'] });
  };

  const createMut = useMutation({
    mutationFn: (data) => forjaApi.nutrition.logs.create(data),
    onSuccess: () => {
      invalidateDay();
      setAddOpen(false);
      setSelectedFood(null);
      setServings('1');
      setFoodQ('');
      toast.success('Adicionado ao diário');
    },
    onError: () => toast.error('Não deu pra adicionar'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => forjaApi.nutrition.logs.update(id, data),
    onSuccess: () => {
      invalidateDay();
      setEditLog(null);
      toast.success('Quantidade atualizada');
    },
    onError: () => toast.error('Não deu pra atualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => forjaApi.nutrition.logs.delete(id),
    onSuccess: () => {
      invalidateDay();
      toast.success('Removido');
    },
    onError: () => toast.error('Não deu pra remover'),
  });

  const totals = day?.totals;
  const targets = day?.targets;
  const bySlot = day?.by_slot;

  const remaining = useMemo(() => {
    if (!totals || !targets) return null;
    const r = (t, u) => (t == null ? null : Math.round((Number(t) - Number(u || 0)) * 10) / 10);
    return {
      kcal: r(targets.kcal, totals.kcal),
      protein_g: r(targets.protein_g, totals.protein_g),
      carbs_g: r(targets.carbs_g, totals.carbs_g),
      fat_g: r(targets.fat_g, totals.fat_g),
    };
  }, [totals, targets]);

  const openAdd = (slot) => {
    setAddSlot(slot || defaultSlotForHour());
    setSelectedFood(null);
    setServings('1');
    setFoodQ('');
    setAddOpen(true);
  };

  const submitAdd = () => {
    if (!selectedFood) return;
    const s = Number(String(servings).replace(',', '.')) || 1;
    createMut.mutate({
      date,
      meal_slot: addSlot,
      food_item_id: selectedFood.id,
      servings: s,
    });
  };

  const submitEdit = () => {
    if (!editLog) return;
    const s = Number(String(editServings).replace(',', '.')) || 1;
    updateMut.mutate({ id: editLog.id, data: { servings: s } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10 rounded-full shrink-0"
          onClick={() => setDate(shiftDate(date, -1))}
          aria-label="Dia anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center min-w-0">
          <p className="text-sm font-semibold capitalize">{formatDateLabel(date)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{date}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10 rounded-full shrink-0"
          onClick={() => setDate(shiftDate(date, 1))}
          aria-label="Próximo dia"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando diário…</p>
      ) : isError ? (
        <PraxisEmptyState
          title="Não carregou o diário"
          description="Confere a API ou o login e tenta de novo."
        />
      ) : (
        <>
          <Card className="border-border/80 bg-card/40 shadow-none">
            <CardContent className="px-4 py-3 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Total do dia</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatKcal(totals?.kcal)}
                  {targets?.kcal != null ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      / {formatKcal(targets.kcal)}
                    </span>
                  ) : null}
                </p>
                {remaining && remaining.kcal != null ? (
                  <p className="text-xs text-muted-foreground tabular-nums pt-0.5">
                    Faltam {formatKcal(Math.max(0, remaining.kcal))}
                    {remaining.protein_g != null
                      ? ` · P ${formatGrams(Math.max(0, remaining.protein_g))}`
                      : ''}
                  </p>
                ) : null}
              </div>
              <MacroBars
                totals={totals || {}}
                targets={targets || {}}
                variant="full"
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="button" className="rounded-full" onClick={() => openAdd()}>
              <Plus className="w-4 h-4 mr-1.5" />
              Adicionar comida
            </Button>
          </div>

          {MEAL_SLOTS.map((slot) => {
            const items = bySlot?.[slot] || [];
            return (
              <section key={slot} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{MEAL_SLOT_LABELS[slot]}</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-full text-xs"
                    onClick={() => openAdd(slot)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Item
                  </Button>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">Nada neste horário.</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((log) => (
                      <li key={log.id}>
                        <Card className="border-border/80 bg-card/40 shadow-none">
                          <CardContent className="px-3 py-2.5 flex items-start gap-2">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => {
                                setEditLog(log);
                                setEditServings(String(log.servings ?? 1));
                              }}
                            >
                              <p className="text-sm font-medium truncate">{log.name_snapshot}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {log.servings != null && Number(log.servings) !== 1
                                  ? `${Number(log.servings)}× · `
                                  : ''}
                                {formatKcal(log.kcal)} · P {formatGrams(log.protein_g)} · C{' '}
                                {formatGrams(log.carbs_g)} · G {formatGrams(log.fat_g)}
                              </p>
                            </button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label="Remover"
                              onClick={() => {
                                if (window.confirm(`Remover “${log.name_snapshot}”?`)) {
                                  deleteMut.mutate(log.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {!day?.logs?.length ? (
            <PraxisEmptyState
              title="Diário vazio neste dia"
              description="Escolhe um alimento do catálogo e adiciona no café, almoço, lanche ou jantar."
              action={
                <Button className="rounded-full" onClick={() => openAdd()}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Adicionar comida
                </Button>
              }
            />
          ) : null}
        </>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar ao diário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Refeição</Label>
              <Select value={addSlot} onValueChange={setAddSlot}>
                <SelectTrigger className="bg-secondary/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_SLOTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {MEAL_SLOT_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Buscar alimento</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={foodQ}
                  onChange={(e) => setFoodQ(e.target.value)}
                  placeholder="Ovo, arroz…"
                  className="pl-9 bg-secondary/40"
                />
              </div>
            </div>
            <ul className="max-h-48 overflow-y-auto space-y-1 border border-border/60 rounded-lg p-1">
              {foods.length === 0 ? (
                <li className="text-xs text-muted-foreground p-3">
                  Nenhum alimento. Cadastra na aba Alimentos.
                </li>
              ) : (
                foods.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedFood(f)}
                      className={cn(
                        'w-full text-left rounded-md px-3 py-2 text-sm transition-colors',
                        selectedFood?.id === f.id
                          ? 'bg-primary/15 text-foreground'
                          : 'hover:bg-secondary/50 text-muted-foreground',
                      )}
                    >
                      <span className="font-medium text-foreground">{f.name}</span>
                      <span className="block text-xs tabular-nums">
                        {f.serving_label} · {formatKcal(f.kcal)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="space-y-1.5">
              <Label>Porções</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0.1"
                className="tabular-nums bg-secondary/40"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
              {selectedFood ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Preview ≈ {formatKcal((Number(selectedFood.kcal) || 0) * (Number(String(servings).replace(',', '.')) || 1))}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              className="w-full rounded-full"
              disabled={!selectedFood || createMut.isPending}
              onClick={submitAdd}
            >
              {createMut.isPending ? 'Salvando…' : 'Salvar no diário'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editLog} onOpenChange={(o) => !o && setEditLog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar quantidade</DialogTitle>
          </DialogHeader>
          {editLog ? (
            <div className="space-y-4">
              <p className="text-sm font-medium">{editLog.name_snapshot}</p>
              <div className="space-y-1.5">
                <Label>Porções</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0.1"
                  className="tabular-nums bg-secondary/40"
                  value={editServings}
                  onChange={(e) => setEditServings(e.target.value)}
                />
              </div>
              <Button
                type="button"
                className="w-full rounded-full"
                disabled={updateMut.isPending}
                onClick={submitEdit}
              >
                {updateMut.isPending ? 'Salvando…' : 'Atualizar'}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
