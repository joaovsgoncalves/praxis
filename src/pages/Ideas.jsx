// @ts-nocheck
import React, { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Lightbulb, Plus, Trash2, Sparkles, Archive, ArrowRightCircle, Star } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import IdeaForm from '@/components/ideas/IdeaForm';
import { fortalezaDateKey } from '@/lib/dates';
import {
  cleanIdeaTitle,
  IDEA_STATUS_LABELS,
  IDEA_STATUSES,
  ideasForWeeklyReview,
} from '@/lib/ideas';
import { toast } from '@/components/ui/use-toast';
import { stripQueryParam } from '@/lib/urlDeepLinks';

const statusFilterOptions = [
  { value: 'ativas', label: 'Ativas (captura + promissoras)' },
  ...IDEA_STATUSES.map((s) => ({ value: s, label: IDEA_STATUS_LABELS[s] })),
  { value: 'all', label: 'Todas' },
];

export default function Ideas() {
  const [showIdeaForm, setShowIdeaForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ativas');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (searchParams.get('from') === 'capture') {
      setShowIdeaForm(true);
      setSearchParams(stripQueryParam(searchParams, 'from'), { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ['ideas'],
    queryFn: () => forjaApi.ideas.list(),
  });

  const filteredIdeas = useMemo(() => {
    if (statusFilter === 'all') return ideas;
    if (statusFilter === 'ativas') {
      return ideas.filter((i) => i.idea_status !== 'arquivada' && i.idea_status !== 'virou_tarefa');
    }
    return ideas.filter((i) => (i.idea_status || 'capturada') === statusFilter);
  }, [ideas, statusFilter]);

  const sortedIdeas = useMemo(() => {
    return [...filteredIdeas].sort((a, b) => {
      const aTime = new Date(a.updated_date || a.created_date || 0).getTime();
      const bTime = new Date(b.updated_date || b.created_date || 0).getTime();
      return bTime - aTime;
    });
  }, [filteredIdeas]);

  const weeklyReview = useMemo(() => ideasForWeeklyReview(ideas, 7), [ideas]);

  const invalidateIdeas = () => {
    queryClient.invalidateQueries({ queryKey: ['ideas'] });
    queryClient.invalidateQueries({ queryKey: ['allTasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
  };

  const createIdea = useMutation({
    mutationFn: (data) => forjaApi.tasks.create(data),
    onSuccess: () => {
      invalidateIdeas();
      setShowIdeaForm(false);
    },
  });

  const updateIdea = useMutation({
    mutationFn: ({ id, data }) => forjaApi.tasks.update(id, data),
    onSuccess: invalidateIdeas,
  });

  const deleteIdea = useMutation({
    mutationFn: (id) => forjaApi.tasks.delete(id),
    onSuccess: invalidateIdeas,
  });

  const promoteIdea = useMutation({
    mutationFn: (id) => forjaApi.ideas.promoteToTask(id, { date: fortalezaDateKey(), priority: 'medium' }),
    onSuccess: (res) => {
      invalidateIdeas();
      toast({
        title: 'Virou tarefa',
        description: res?.task?.title ? `"${cleanIdeaTitle(res.task.title)}" está no radar de hoje.` : 'Tarefa criada.',
      });
    },
    onError: (err) => {
      toast({ title: 'Não deu', description: err?.message || 'Tente de novo.', variant: 'destructive' });
    },
  });

  const counts = useMemo(() => {
    const c = { capturada: 0, promissora: 0, virou_tarefa: 0, arquivada: 0 };
    ideas.forEach((i) => {
      const s = i.idea_status || 'capturada';
      if (c[s] !== undefined) c[s] += 1;
    });
    return c;
  }, [ideas]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="glass-surface rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="forja-kicker flex items-center gap-2 text-cyan-300">
              <Lightbulb className="h-4 w-4" /> Banco de ideias
            </p>
            <h1 className="forja-title text-3xl font-bold sm:text-4xl">Ideias</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Estacionamento sem pressão de prazo — capture agora, promova quando brilhar, execute quando virar tarefa.
            </p>
          </div>
          <Button onClick={() => setShowIdeaForm(true)} className="h-10 self-start rounded-full px-4 lg:self-auto">
            <Plus className="mr-1.5 h-4 w-4" /> Nova ideia
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
            <p className="forja-kicker text-cyan-200/80">Capturadas</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-100">{counts.capturada}</p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
            <p className="forja-kicker text-amber-200/80">Promissoras</p>
            <p className="mt-1 text-2xl font-semibold">{counts.promissora}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Viraram tarefa</p>
            <p className="mt-1 text-2xl font-semibold">{counts.virou_tarefa}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Arquivadas</p>
            <p className="mt-1 text-2xl font-semibold">{counts.arquivada}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="forja-kicker">Fila</p>
              <h2 className="forja-title text-2xl font-semibold">Suas ideias</h2>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-full rounded-full border-white/10 bg-black/20 sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilterOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Carregando…</CardContent></Card>
          ) : sortedIdeas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nada neste filtro. Capture uma ideia sem compromisso de data ou prioridade.
              </CardContent>
            </Card>
          ) : (
            sortedIdeas.map((idea) => {
              const status = idea.idea_status || 'capturada';
              const canPromote = status !== 'virou_tarefa' && status !== 'arquivada';
              return (
                <Card key={idea.id} className="border-border/80 bg-card/90 shadow-sm">
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-base font-medium leading-snug text-foreground">
                          {cleanIdeaTitle(idea.title)}
                        </p>
                        {idea.description && (
                          <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                            {idea.description}
                          </p>
                        )}
                        <Badge variant="outline" className="text-xs font-normal">
                          {IDEA_STATUS_LABELS[status] || status}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Excluir esta ideia?')) deleteIdea.mutate(idea.id);
                        }}
                        className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Excluir"
                      >
                        <Trash2 className="mx-auto h-4 w-4" />
                      </button>
                    </div>

                    {canPromote && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {status !== 'promissora' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => updateIdea.mutate({ id: idea.id, data: { idea_status: 'promissora' } })}
                          >
                            <Star className="mr-1 h-3.5 w-3.5" /> Promissora
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full"
                          disabled={promoteIdea.isPending}
                          onClick={() => promoteIdea.mutate(idea.id)}
                        >
                          <ArrowRightCircle className="mr-1 h-3.5 w-3.5" /> Transformar em tarefa
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="rounded-full text-muted-foreground"
                          onClick={() => updateIdea.mutate({ id: idea.id, data: { idea_status: 'arquivada' } })}
                        >
                          <Archive className="mr-1 h-3.5 w-3.5" /> Arquivar
                        </Button>
                      </div>
                    )}
                    {status === 'virou_tarefa' && (
                      <p className="text-xs text-muted-foreground">Já virou tarefa — veja em Hábitos & Tarefas ou no Dashboard.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>

        <aside className="space-y-4">
          <Card className="border-cyan-400/15 bg-cyan-500/5">
            <CardContent className="space-y-3 p-5">
              <p className="forja-kicker text-cyan-200/80 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> Revisão desta semana
              </p>
              <p className="text-sm text-muted-foreground">
                Promissoras e capturas dos últimos 7 dias — o que merece virar execução?
              </p>
              {weeklyReview.length === 0 ? (
                <p className="text-sm text-muted-foreground/80">Nada na fila de revisão agora.</p>
              ) : (
                <ul className="space-y-2">
                  {weeklyReview.slice(0, 8).map((idea) => (
                    <li key={idea.id} className="text-sm leading-snug">
                      <span className="font-medium text-foreground">{cleanIdeaTitle(idea.title)}</span>
                      <span className="text-muted-foreground"> · {IDEA_STATUS_LABELS[idea.idea_status || 'capturada']}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="outline" size="sm" className="w-full rounded-full">
                <Link to="/habitos-tarefas">Abrir tarefas de hoje</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
              <p className="forja-kicker">Tom certo</p>
              <p>Ideia não carrega hora nem prioridade alta por padrão — isso fica na tarefa, quando você decidir.</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={showIdeaForm} onOpenChange={setShowIdeaForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova ideia</DialogTitle></DialogHeader>
          <IdeaForm onSubmit={(data) => createIdea.mutate(data)} onCancel={() => setShowIdeaForm(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}