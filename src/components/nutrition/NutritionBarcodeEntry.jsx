import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MEAL_SLOTS, MEAL_SLOT_LABELS, formatGrams, formatKcal } from '@/lib/nutrition';
import { toast } from 'sonner';

/**
 * Fase 12 — barcode: cola o código (ou digita) → Open Food Facts / cache → loga.
 * Câmera nativa fica pra mobile nativo; no web colar EAN basta.
 */
export default function NutritionBarcodeEntry({
  date,
  defaultSlot = 'other',
  onLogged,
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [slot, setSlot] = useState(defaultSlot);
  const [servings, setServings] = useState('1');
  const [result, setResult] = useState(null);

  const reset = () => {
    setCode('');
    setResult(null);
    setServings('1');
  };

  const lookupMut = useMutation({
    mutationFn: (raw) => forjaApi.nutrition.barcode.lookup(raw),
    onSuccess: (data) => {
      setResult(data);
      toast.success(
        data.source === 'cache'
          ? 'Achei no teu catálogo'
          : 'Achei no Open Food Facts (salvo no catálogo)',
      );
    },
    onError: (err) => {
      setResult(null);
      const msg =
        err?.message ||
        (String(err).includes('404')
          ? 'Produto não encontrado'
          : 'Não deu pra buscar o código');
      toast.error(msg);
    },
  });

  const logMut = useMutation({
    mutationFn: ({ foodId, meal_slot, servings: s }) =>
      forjaApi.nutrition.logs.create({
        date,
        food_item_id: foodId,
        meal_slot,
        servings: s,
        source: 'barcode',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'day'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'foods'] });
      toast.success('No diário');
      setOpen(false);
      reset();
      onLogged?.();
    },
    onError: () => toast.error('Não deu pra logar'),
  });

  const food = result?.food;
  const onSearch = () => {
    const digits = String(code).replace(/\D/g, '');
    if (digits.length < 8) {
      toast.error('Código precisa ter pelo menos 8 dígitos');
      return;
    }
    lookupMut.mutate(digits);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        onClick={() => {
          setSlot(defaultSlot || 'other');
          setOpen(true);
        }}
      >
        <ScanBarcode className="w-4 h-4 mr-1.5" />
        Código
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Código de barras</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cola o número do pacote (EAN). Busca no teu catálogo e, se precisar, no{' '}
              <span className="text-foreground">Open Food Facts</span> (internet). O
              produto fica salvo pra próxima. Câmera nativa fica pra depois — no celular
              dá pra colar do leitor.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="barcode-code">Código</Label>
              <Input
                id="barcode-code"
                inputMode="numeric"
                autoComplete="off"
                className="bg-secondary/40 tabular-nums tracking-wide"
                placeholder="Ex.: 7891000100103"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSearch();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              className="w-full rounded-full"
              disabled={lookupMut.isPending || !code.trim()}
              onClick={onSearch}
            >
              {lookupMut.isPending ? 'Buscando…' : 'Buscar produto'}
            </Button>

            {food ? (
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold leading-snug">{food.name}</p>
                  {food.brand ? (
                    <p className="text-xs text-muted-foreground">{food.brand}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground tabular-nums pt-1">
                    {food.serving_label || 'porção'} · {formatKcal(food.kcal)} · P{' '}
                    {formatGrams(food.protein_g)} · C {formatGrams(food.carbs_g)} · G{' '}
                    {formatGrams(food.fat_g)}
                  </p>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Fonte: {result.source === 'cache' ? 'catálogo local' : 'Open Food Facts'}
                    {result.barcode ? ` · ${result.barcode}` : ''}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Refeição</Label>
                    <Select value={slot} onValueChange={setSlot}>
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
                    <Label className="text-xs" htmlFor="bc-serv">
                      Porções
                    </Label>
                    <Input
                      id="bc-serv"
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0.25"
                      className="bg-secondary/40 tabular-nums"
                      value={servings}
                      onChange={(e) => setServings(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  className="w-full rounded-full"
                  disabled={logMut.isPending}
                  onClick={() => {
                    const s = Number(String(servings).replace(',', '.')) || 1;
                    logMut.mutate({
                      foodId: food.id,
                      meal_slot: slot,
                      servings: s,
                    });
                  }}
                >
                  {logMut.isPending ? 'Gravando…' : 'Adicionar ao diário'}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
