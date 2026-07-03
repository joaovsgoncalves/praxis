import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ShoppingBag, ExternalLink, Check, Pause, Trash2 } from 'lucide-react';
import { PageHero, StatGrid, StatTile, SectionHeading, PraxisEmptyState, PraxisColumnsSkeleton } from '@/components/layout/PraxisPage';
import PurchaseForm from '@/components/purchases/PurchaseForm';
import {
  PURCHASE_HORIZON_LABELS,
  PURCHASE_HORIZON_HINTS,
  PURCHASE_STATUS_LABELS,
} from '@/lib/purchases';
import { cn } from '@/lib/utils';

const HORIZON_ORDER = ['short', 'medium', 'long'];

const filterOptions = [
  { value: 'ativas', label: 'Na lista' },
  { value: 'bought', label: 'Comprei' },
  { value: 'paused', label: 'Pausados' },
  { value: 'all', label: 'Tudo' },
];

export default function Compras() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ativas');
  const [horizonView, setHorizonView] = useState('all');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['purchases', statusFilter],
    queryFn: () => {
      if (statusFilter === 'ativas') return forjaApi.purchases.list({ status: 'want' });
      if (statusFilter === 'all') return forjaApi.purchases.list({ status: 'all' });
      return forjaApi.purchases.list({ status: statusFilter });
    },
  });

  const createItem = useMutation({
    mutationFn: (data) => forjaApi.purchases.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setShowForm(false);
    },
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data }) => forjaApi.purchases.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchases'] }),
  });

  const deleteItem = useMutation({
    mutationFn: (id) => forjaApi.purchases.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchases'] }),
  });

  const counts = useMemo(() => {
    const c = { short: 0, medium: 0, long: 0 };
    for (const it of items) {
      if (it.status !== 'want') continue;
      if (c[it.horizon] !== undefined) c[it.horizon] += 1;
    }
    return c;
  }, [items]);

  const visible = useMemo(() => {
    let list = items;
    if (horizonView !== 'all') list = list.filter((i) => i.horizon === horizonView);
    return list;
  }, [items, horizonView]);

  const grouped = useMemo(() => {
    const map = { short: [], medium: [], long: [] };
    for (const it of visible) {
      if (map[it.horizon]) map[it.horizon].push(it);
    }
    return map;
  }, [visible]);

  return (
    <div className="praxis-page">
      <PageHero
        kicker="Lista de compras"
        kickerIcon={ShoppingBag}
        kickerClassName="text-cyan-300/90"
        title="O que quero comprar"
        description="Curto, médio e longo prazo — sem misturar com tarefa do dia."
        action={(
          <Button onClick={() => setShowForm(true)} className="h-10 rounded-full px-4">
            <Plus className="mr-1.5 h-4 w-4" /> Novo item
          </Button>
        )}
      >
        <StatGrid>
          <StatTile label="Curto prazo" value={String(counts.short)} tone="cyan" valueClassName="tabular-nums" />
          <StatTile label="Médio prazo" value={String(counts.medium)} valueClassName="tabular-nums" />
          <StatTile label="Longo prazo" value={String(counts.long)} tone="amber" valueClassName="tabular-nums" />
          <StatTile
            label="Total na lista"
            value={String(counts.short + counts.medium + counts.long)}
            valueClassName="tabular-nums"
          />
        </StatGrid>
      </PageHero>

      <div className="mt-6 space-y-6">
      <SectionHeading
        kicker="Filtro"
        title="Sua lista"
        trailing={(
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-full rounded-full border-white/10 bg-black/20 sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filterOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={horizonView} onValueChange={setHorizonView}>
              <SelectTrigger className="h-10 w-full rounded-full border-white/10 bg-black/20 sm:w-44">
                <SelectValue placeholder="Prazo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os prazos</SelectItem>
                {HORIZON_ORDER.map((h) => (
                  <SelectItem key={h} value={h}>{PURCHASE_HORIZON_LABELS[h]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      {isLoading ? (
        <PraxisColumnsSkeleton columns={3} rowsPerColumn={2} />
      ) : visible.length === 0 ? (
        <PraxisEmptyState
          icon={ShoppingBag}
          title="Lista vazia neste filtro"
          description="Anote o que quer comprar — curto, médio ou longo prazo. Sem data obrigatória."
          action={(
            <Button onClick={() => setShowForm(true)} className="rounded-full praxis-touch-target">
              <Plus className="mr-1.5 h-4 w-4" /> Novo item
            </Button>
          )}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {HORIZON_ORDER.map((h) => {
            const col = grouped[h];
            if (horizonView !== 'all' && horizonView !== h) return null;
            if (!col.length && horizonView === 'all') {
              return (
                <div key={h} className="space-y-2">
                  <p className="praxis-kicker-row">{PURCHASE_HORIZON_LABELS[h]}</p>
                  <p className="text-xs text-muted-foreground">{PURCHASE_HORIZON_HINTS[h]}</p>
                  <Card className="border-dashed border-white/5 bg-card/30">
                    <CardContent className="py-8 text-center text-xs text-muted-foreground leading-relaxed px-4">
                      Nenhum item aqui ainda.
                    </CardContent>
                  </Card>
                </div>
              );
            }
            if (!col.length) return null;
            return (
              <div key={h} className="space-y-3">
                <div>
                  <p className="praxis-kicker-row">{PURCHASE_HORIZON_LABELS[h]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{PURCHASE_HORIZON_HINTS[h]}</p>
                </div>
                <ul className="space-y-2">
                  {col.map((item) => (
                    <li key={item.id}>
                      <Card className={cn('border-white/8', item.status === 'bought' && 'opacity-70')}>
                        <CardContent className="space-y-2 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium leading-snug">{item.title}</p>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {PURCHASE_STATUS_LABELS[item.status] || item.status}
                            </Badge>
                          </div>
                          {item.price_estimate ? (
                            <p className="text-xs text-muted-foreground tabular-nums">{item.price_estimate}</p>
                          ) : null}
                          {item.notes ? (
                            <p className="text-xs text-muted-foreground line-clamp-2">{item.notes}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.url ? (
                              <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                                <a href={item.url} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            ) : null}
                            {item.status === 'want' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 rounded-full text-xs"
                                  onClick={() => updateItem.mutate({ id: item.id, data: { status: 'bought' } })}
                                >
                                  <Check className="h-3 w-3 mr-1" /> Comprei
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-full text-xs"
                                  onClick={() => updateItem.mutate({ id: item.id, data: { status: 'paused' } })}
                                >
                                  <Pause className="h-3 w-3 mr-1" /> Pausar
                                </Button>
                              </>
                            ) : null}
                            {item.status === 'paused' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-full text-xs"
                                onClick={() => updateItem.mutate({ id: item.id, data: { status: 'want' } })}
                              >
                                Voltar à lista
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-destructive/80"
                              onClick={() => deleteItem.mutate(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Novo item</DialogTitle>
          </DialogHeader>
          <PurchaseForm onSubmit={(data) => createItem.mutate(data)} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}