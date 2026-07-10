import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Search,
  Star,
  Clock,
  Minus,
  Copy,
  UtensilsCrossed,
  Type,
  ScanBarcode,
} from 'lucide-react';
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
import { PraxisEmptyState, PraxisListSkeleton } from '@/components/layout/PraxisPage';
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  formatGrams,
  formatKcal,
} from '@/lib/nutrition';
import MacroBars from '@/components/nutrition/MacroBars';
import NutritionTextEntry from '@/components/nutrition/NutritionTextEntry';
import NutritionBarcodeEntry from '@/components/nutrition/NutritionBarcodeEntry';
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

function parseServings(v) {
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(n * 100) / 100;
}

function stepServings(current, delta) {
  const n = parseServings(current);
  const next = Math.max(0.5, Math.round((n + delta) * 2) / 2);
  return String(next);
}

function ServingsStepper({ value, onChange, id }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-10 w-10 rounded-full shrink-0"
        onClick={() => onChange(stepServings(value, -0.5))}
        aria-label="Menos meia porção"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.5"
        min="0.5"
        className="tabular-nums bg-secondary/40 text-center"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-10 w-10 rounded-full shrink-0"
        onClick={() => onChange(stepServings(value, 0.5))}
        aria-label="Mais meia porção"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

const PICKER_TABS = [
  { id: 'recent', label: 'Recentes', icon: Clock },
  { id: 'fav', label: 'Favoritos', icon: Star },
  { id: 'meals', label: 'Refeições', icon: UtensilsCrossed },
  { id: 'search', label: 'Buscar', icon: Search },
];

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
  const [pickerTab, setPickerTab] = useState('recent');
  const [foodQ, setFoodQ] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [servings, setServings] = useState('1');
  const [editLog, setEditLog] = useState(null);
  const [editServings, setEditServings] = useState('1');
  const [textOpen, setTextOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  const { data: day, isLoading, isError } = useQuery({
    queryKey: ['nutrition', 'day', date],
    queryFn: () => forjaApi.nutrition.day(date),
    retry: 1,
  });

  const { data: recentFoods = [] } = useQuery({
    queryKey: ['nutrition', 'foods', 'recent'],
    queryFn: () => forjaApi.nutrition.foods.recent({ limit: 12 }),
    enabled: addOpen,
    retry: 1,
  });

  const { data: favFoods = [] } = useQuery({
    queryKey: ['nutrition', 'foods', { favorites: true }],
    queryFn: () => forjaApi.nutrition.foods.list({ favorites: true, limit: 30 }),
    enabled: addOpen,
    retry: 1,
  });

  const { data: savedMeals = [] } = useQuery({
    queryKey: ['nutrition', 'meals', { forAdd: true }],
    queryFn: () => forjaApi.nutrition.meals.list({ limit: 30 }),
    enabled: addOpen,
    retry: 1,
  });

  const { data: searchFoods = [] } = useQuery({
    queryKey: ['nutrition', 'foods', { q: foodQ, forAdd: true }],
    queryFn: () =>
      forjaApi.nutrition.foods.list({
        q: foodQ.trim() || undefined,
        limit: 30,
      }),
    enabled: addOpen && pickerTab === 'search',
    retry: 1,
  });

  const invalidateDay = () => {
    queryClient.invalidateQueries({ queryKey: ['nutrition', 'day'] });
    queryClient.invalidateQueries({ queryKey: ['nutrition', 'foods', 'recent'] });
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

  const fromMealMut = useMutation({
    mutationFn: (data) => forjaApi.nutrition.logs.fromMeal(data),
    onSuccess: (res) => {
      invalidateDay();
      setAddOpen(false);
      setSelectedFood(null);
      toast.success(
        res?.created
          ? `Refeição adicionada (${res.created} item(ns))`
          : 'Refeição adicionada',
      );
    },
    onError: () => toast.error('Não deu pra adicionar a refeição'),
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

  const copyYesterdayMut = useMutation({
    mutationFn: () =>
      forjaApi.nutrition.copyDay({
        to_date: date,
        from_date: shiftDate(date, -1),
      }),
    onSuccess: (res) => {
      invalidateDay();
      toast.success(
        res?.copied
          ? `Copiei ${res.copied} item(ns) de ontem`
          : 'Ontem estava vazio — nada pra copiar',
      );
    },
    onError: (err) => {
      const msg =
        err?.status === 409
          ? 'Este dia já tem comida. Apaga os itens se quiser copiar ontem.'
          : 'Não deu pra copiar ontem';
      toast.error(msg);
    },
  });

  const totals = day?.totals;
  const targets = day?.targets;
  const bySlot = day?.by_slot;
  const isEmptyDay = !isLoading && !isError && !(day?.logs?.length > 0);

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
    setPickerTab('recent');
    setAddOpen(true);
  };

  const quickAdd = (food, slot = addSlot) => {
    createMut.mutate({
      date,
      meal_slot: slot,
      food_item_id: food.id,
      servings: 1,
    });
  };

  const quickAddMeal = (meal, slot = addSlot) => {
    fromMealMut.mutate({
      meal_id: meal.id,
      date,
      meal_slot: slot,
      servings: 1,
    });
  };

  const submitAdd = () => {
    if (!selectedFood) return;
    createMut.mutate({
      date,
      meal_slot: addSlot,
      food_item_id: selectedFood.id,
      servings: parseServings(servings),
    });
  };

  const submitEdit = () => {
    if (!editLog) return;
    updateMut.mutate({
      id: editLog.id,
      data: { servings: parseServings(editServings) },
    });
  };

  const isMealsTab = pickerTab === 'meals';

  const pickerList =
    pickerTab === 'recent'
      ? recentFoods
      : pickerTab === 'fav'
        ? favFoods
        : pickerTab === 'meals'
          ? savedMeals
          : searchFoods;

  const pickerEmptyMsg =
    pickerTab === 'recent'
      ? 'Nada recente ainda. Busca ou cadastra um alimento e loga uma vez.'
      : pickerTab === 'fav'
        ? 'Sem favoritos. Marca ⭐ na aba Alimentos.'
        : pickerTab === 'meals'
          ? 'Nenhuma refeição salva. Cria na aba Refeições.'
          : foodQ.trim()
            ? 'Nenhum alimento com esse nome.'
            : 'Digita pra buscar no catálogo.';

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
        <PraxisListSkeleton rows={3} />
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
              </div>
              <MacroBars totals={totals || {}} targets={targets || {}} variant="full" />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              {remaining && remaining.kcal != null ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Faltam {formatKcal(Math.max(0, remaining.kcal))}
                  {remaining.protein_g != null
                    ? ` · P ${formatGrams(Math.max(0, remaining.protein_g))}`
                    : ''}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Diário do dia</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {isEmptyDay ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full min-h-11"
                  disabled={copyYesterdayMut.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Copiar tudo que registrou no dia anterior para este dia?',
                      )
                    ) {
                      copyYesterdayMut.mutate();
                    }
                  }}
                >
                  <Copy className="w-4 h-4 mr-1.5" />
                  {copyYesterdayMut.isPending ? 'Copiando…' : 'Copiar ontem'}
                </Button>
              ) : null}
              <Button
                type="button"
                className="rounded-full min-h-11"
                onClick={() => openAdd()}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Adicionar
              </Button>
            </div>
          </div>

          <NutritionTextEntry
            date={date}
            defaultSlot={addSlot}
            showTrigger={false}
            open={textOpen}
            onOpenChange={setTextOpen}
          />
          <NutritionBarcodeEntry
            date={date}
            defaultSlot={addSlot}
            showTrigger={false}
            open={barcodeOpen}
            onOpenChange={setBarcodeOpen}
          />

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
                          <CardContent className="flex items-center gap-2 px-3 py-2.5">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => {
                                setEditLog(log);
                                setEditServings(String(log.servings ?? 1));
                              }}
                            >
                              <p className="truncate text-sm font-medium leading-snug">
                                {log.name_snapshot}
                              </p>
                              <p className="mt-0.5 text-xs leading-snug text-muted-foreground tabular-nums">
                                <span className="text-muted-foreground/90">
                                  {log.grams != null && Number(log.grams) > 0
                                    ? `${Number(log.grams)} g`
                                    : log.servings != null && Number(log.servings) !== 1
                                      ? `${Number(log.servings)}×`
                                      : null}
                                  {(log.grams != null && Number(log.grams) > 0) ||
                                  (log.servings != null && Number(log.servings) !== 1)
                                    ? ' · '
                                    : null}
                                </span>
                                {formatKcal(log.kcal)}
                                <span className="text-muted-foreground/70"> · </span>
                                P {formatGrams(log.protein_g)}
                                <span className="text-muted-foreground/70"> · </span>
                                C {formatGrams(log.carbs_g)}
                                <span className="text-muted-foreground/70"> · </span>
                                G {formatGrams(log.fat_g)}
                              </p>
                            </button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 shrink-0 self-center text-muted-foreground hover:text-destructive"
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

          {isEmptyDay ? (
            <PraxisEmptyState
              title="Diário vazio neste dia"
              description="Toque num recente/favorito pra logar em 1 segundo, ou copie o dia de ontem."
              action={
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button className="rounded-full" onClick={() => openAdd()}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Adicionar comida
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={copyYesterdayMut.isPending}
                    onClick={() => copyYesterdayMut.mutate()}
                  >
                    <Copy className="w-4 h-4 mr-1.5" />
                    Copiar ontem
                  </Button>
                </div>
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
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full min-h-11"
                onClick={() => {
                  setAddOpen(false);
                  setTextOpen(true);
                }}
              >
                <Type className="w-4 h-4 mr-1.5" />
                Texto
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full min-h-11"
                onClick={() => {
                  setAddOpen(false);
                  setBarcodeOpen(true);
                }}
              >
                <ScanBarcode className="w-4 h-4 mr-1.5" />
                Código
              </Button>
            </div>
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

            <div className="flex gap-1 rounded-full bg-secondary/40 p-1">
              {PICKER_TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setPickerTab(t.id);
                      setSelectedFood(null);
                    }}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors',
                      pickerTab === t.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {pickerTab === 'search' ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={foodQ}
                  onChange={(e) => setFoodQ(e.target.value)}
                  placeholder="Ovo, arroz…"
                  className="pl-9 bg-secondary/40"
                  autoFocus
                />
              </div>
            ) : null}

            <ul className="max-h-52 overflow-y-auto space-y-1 border border-border/60 rounded-lg p-1">
              {pickerList.length === 0 ? (
                <li className="text-xs text-muted-foreground p-3 leading-relaxed">
                  {pickerEmptyMsg}
                </li>
              ) : isMealsTab ? (
                pickerList.map((m) => (
                  <li key={m.id}>
                    <div className="flex items-center gap-1 rounded-md">
                      <div className="min-w-0 flex-1 rounded-md px-3 py-2 text-sm">
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          {m.name}
                          {m.is_favorite ? (
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                          ) : null}
                        </span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {m.item_count} item(ns) · {formatKcal(m.totals?.kcal)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-full shrink-0 text-xs mr-1"
                        disabled={fromMealMut.isPending}
                        onClick={() => quickAddMeal(m)}
                        title="Adicionar refeição inteira"
                      >
                        +tudo
                      </Button>
                    </div>
                  </li>
                ))
              ) : (
                pickerList.map((f) => (
                  <li key={f.id}>
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-md',
                        selectedFood?.id === f.id && 'bg-primary/15',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFood(f)}
                        className={cn(
                          'min-w-0 flex-1 text-left rounded-md px-3 py-2 text-sm transition-colors',
                          selectedFood?.id === f.id
                            ? 'text-foreground'
                            : 'hover:bg-secondary/50 text-muted-foreground',
                        )}
                      >
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          {f.name}
                          {f.is_favorite ? (
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                          ) : null}
                        </span>
                        <span className="block text-xs tabular-nums">
                          {f.serving_label} · {formatKcal(f.kcal)}
                        </span>
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-full shrink-0 text-xs mr-1"
                        disabled={createMut.isPending}
                        onClick={() => quickAdd(f)}
                        title="Adicionar 1 porção"
                      >
                        +1
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>

            {!isMealsTab && selectedFood ? (
              <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
                <p className="text-sm font-medium truncate">{selectedFood.name}</p>
                <Label className="text-xs text-muted-foreground">Porções</Label>
                <ServingsStepper value={servings} onChange={setServings} id="add-servings" />
                <p className="text-xs text-muted-foreground tabular-nums">
                  Preview ≈{' '}
                  {formatKcal(
                    (Number(selectedFood.kcal) || 0) * parseServings(servings),
                  )}
                </p>
                <Button
                  type="button"
                  className="w-full rounded-full"
                  disabled={createMut.isPending}
                  onClick={submitAdd}
                >
                  {createMut.isPending ? 'Salvando…' : 'Salvar no diário'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                Toque no alimento pra ajustar porções, ou em <strong>+1</strong> pra
                logar na hora.
              </p>
            )}
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
                <ServingsStepper
                  value={editServings}
                  onChange={setEditServings}
                  id="edit-servings"
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
