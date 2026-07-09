import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Star, Pencil, Trash2 } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PraxisEmptyState } from '@/components/layout/PraxisPage';
import FoodForm from '@/components/nutrition/FoodForm';
import { formatGrams, formatKcal } from '@/lib/nutrition';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function FoodCatalog() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const listParams = useMemo(
    () => ({
      q: q.trim() || undefined,
      favorites: favoritesOnly || undefined,
      limit: 100,
    }),
    [q, favoritesOnly],
  );

  const { data: foods = [], isLoading, isError } = useQuery({
    queryKey: ['nutrition', 'foods', listParams],
    queryFn: () => forjaApi.nutrition.foods.list(listParams),
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['nutrition', 'foods'] });

  const createMut = useMutation({
    mutationFn: (data) => forjaApi.nutrition.foods.create(data),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      toast.success('Alimento criado');
    },
    onError: () => toast.error('Não deu pra criar o alimento'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => forjaApi.nutrition.foods.update(id, data),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Alimento atualizado');
    },
    onError: () => toast.error('Não deu pra atualizar'),
  });

  const toggleFav = useMutation({
    mutationFn: (food) =>
      forjaApi.nutrition.foods.update(food.id, {
        is_favorite: food.is_favorite ? 0 : 1,
      }),
    onSuccess: invalidate,
    onError: () => toast.error('Não deu pra favoritar'),
  });

  const archiveMut = useMutation({
    mutationFn: (id) => forjaApi.nutrition.foods.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Alimento arquivado');
    },
    onError: () => toast.error('Não deu pra arquivar'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar alimento…"
            className="pl-9 bg-secondary/40"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={favoritesOnly ? 'default' : 'outline'}
            className="rounded-full shrink-0"
            onClick={() => setFavoritesOnly((v) => !v)}
          >
            <Star className={cn('w-4 h-4 mr-1.5', favoritesOnly && 'fill-current')} />
            Favoritos
          </Button>
          <Button
            type="button"
            className="rounded-full shrink-0"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Novo
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando alimentos…</p>
      ) : isError ? (
        <PraxisEmptyState
          title="Não carregou o catálogo"
          description="Confere a conexão ou se a API de nutrição está no ar."
        />
      ) : foods.length === 0 ? (
        <PraxisEmptyState
          title={q || favoritesOnly ? 'Nenhum alimento neste filtro' : 'Catálogo vazio'}
          description="Cadastra ovo, arroz, frango… valores por porção. Seed grande vem na fase 7."
          action={
            <Button
              className="rounded-full"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Criar alimento
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {foods.map((food) => (
            <li key={food.id}>
              <Card className="border-border/80 bg-card/40 shadow-none">
                <CardContent className="px-4 py-3 flex items-start gap-3">
                  <button
                    type="button"
                    className="mt-0.5 p-1 rounded-md text-muted-foreground hover:text-amber-400"
                    aria-label={food.is_favorite ? 'Tirar dos favoritos' : 'Favoritar'}
                    onClick={() => toggleFav.mutate(food)}
                  >
                    <Star
                      className={cn(
                        'w-4 h-4',
                        food.is_favorite && 'fill-amber-400 text-amber-400',
                      )}
                    />
                  </button>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium truncate">
                      {food.name}
                      {food.brand ? (
                        <span className="text-muted-foreground font-normal"> · {food.brand}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {food.serving_label || 'porção'} · {formatKcal(food.kcal)} · P{' '}
                      {formatGrams(food.protein_g)} · C {formatGrams(food.carbs_g)} · G{' '}
                      {formatGrams(food.fat_g)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      aria-label="Editar"
                      onClick={() => {
                        setShowForm(false);
                        setEditing(food);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      aria-label="Arquivar"
                      onClick={() => {
                        if (window.confirm(`Arquivar “${food.name}”?`)) {
                          archiveMut.mutate(food.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={showForm || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar alimento' : 'Novo alimento'}</DialogTitle>
          </DialogHeader>
          <FoodForm
            key={editing?.id || 'new'}
            initial={editing || {}}
            submitting={createMut.isPending || updateMut.isPending}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
            onSubmit={(data) => {
              if (editing) updateMut.mutate({ id: editing.id, data });
              else createMut.mutate(data);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
