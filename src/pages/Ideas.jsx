// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lightbulb, Plus, CheckCircle2, Circle, Clock, Trash2 } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TaskForm from '@/components/habits-tasks/TaskForm';
import { CategoryBadge } from '@/lib/categories';
import { cn } from '@/lib/utils';

const priorityStyles = {
  high: 'bg-destructive/15 text-destructive border-destructive/20',
  medium: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const priorityLabels = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const statusLabels = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

function cleanIdeaTitle(title = '') {
  const cleaned = String(title).replace(/^\s*Ideia\s*:\s*/i, '').trim();
  return cleaned || title;
}

export default function Ideas() {
  const [showIdeaForm, setShowIdeaForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ['ideas'],
    queryFn: () => forjaApi.tasks.list({ category: 'ideias', limit: 100 }),
  });

  const sortedIdeas = useMemo(() => {
    return [...ideas].sort((a, b) => {
      const aTime = new Date(a.updated_date || a.created_date || a.date || 0).getTime();
      const bTime = new Date(b.updated_date || b.created_date || b.date || 0).getTime();
      return bTime - aTime;
    });
  }, [ideas]);

  const invalidateIdeas = () => {
    queryClient.invalidateQueries({ queryKey: ['ideas'] });
    queryClient.invalidateQueries({ queryKey: ['allTasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const createIdea = useMutation({
    mutationFn: (data) => forjaApi.tasks.create({
      ...data,
      category: 'ideias',
      source: data.source || 'manual_idea',
    }),
    onSuccess: () => {
      invalidateIdeas();
      setShowIdeaForm(false);
    },
  });

  const toggleIdea = useMutation({
    mutationFn: (idea) => forjaApi.tasks.update(idea.id, {
      status: idea.status === 'completed' ? 'pending' : 'completed',
    }),
    onSuccess: invalidateIdeas,
  });

  const deleteIdea = useMutation({
    mutationFn: (id) => forjaApi.tasks.delete(id),
    onSuccess: invalidateIdeas,
  });

  const openIdeas = sortedIdeas.filter(idea => idea.status !== 'completed');
  const completedIdeas = sortedIdeas.filter(idea => idea.status === 'completed');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="glass-surface rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="forja-kicker flex items-center gap-2 text-cyan-300">
              <Lightbulb className="h-4 w-4" /> Banco de Ideias
            </p>
            <h1 className="forja-title text-3xl font-bold sm:text-4xl">Ideias</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Capturas soltas, oportunidades e padrões para virar ação quando fizer sentido — sem virar uma lista esticada demais.
            </p>
          </div>

          <Button onClick={() => setShowIdeaForm(true)} className="h-10 self-start rounded-full px-4 shadow-lg shadow-primary/20 lg:self-auto">
            <Plus className="mr-1.5 h-4 w-4" /> Nova Ideia
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
            <p className="forja-kicker text-cyan-200/80">Abertas</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-100">{openIdeas.length}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Concluídas</p>
            <p className="mt-1 text-2xl font-semibold">{completedIdeas.length}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Total</p>
            <p className="mt-1 text-2xl font-semibold">{sortedIdeas.length}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="forja-kicker">Fila de captura</p>
              <h2 className="forja-title text-2xl font-semibold">Ideias registradas</h2>
            </div>
            <Badge variant="outline" className="rounded-full">{openIdeas.length} abertas</Badge>
          </div>

          {isLoading ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Carregando ideias...</CardContent></Card>
          ) : sortedIdeas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma ideia registrada ainda. Capture sem compromisso; na revisão você escolhe o que vira execução.
              </CardContent>
            </Card>
          ) : (
            sortedIdeas.map((idea) => (
              <Card key={idea.id} className="bg-card/95 border-border">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
                  <button onClick={() => toggleIdea.mutate(idea)} className="mt-0.5 self-start" aria-label={`Alternar ${cleanIdeaTitle(idea.title)}`}>
                    {idea.status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-accent" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className={cn('text-base font-semibold leading-snug', idea.status === 'completed' && 'line-through opacity-60')}>
                      {cleanIdeaTitle(idea.title)}
                    </p>
                    {idea.description && (
                      <p className="max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground line-clamp-4">
                        {idea.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <CategoryBadge category={idea.category} />
                      <Badge variant="outline" className="text-xs">{statusLabels[idea.status] || idea.status}</Badge>
                      {idea.priority && <Badge className={cn('text-xs', priorityStyles[idea.priority])}>{priorityLabels[idea.priority] || idea.priority}</Badge>}
                      {idea.date && <Badge variant="outline" className="text-xs">{idea.date}</Badge>}
                      {idea.time && <Badge variant="outline" className="text-xs"><Clock className="mr-1 h-3 w-3" />{idea.time}</Badge>}
                    </div>
                  </div>
                  <button onClick={() => deleteIdea.mutate(idea.id)} className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Excluir ${cleanIdeaTitle(idea.title)}`}>
                    <Trash2 className="mx-auto h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <aside className="space-y-4">
          <Card className="border-cyan-400/15 bg-cyan-500/5">
            <CardContent className="space-y-3 p-5">
              <p className="forja-kicker text-cyan-200/80">Uso certo</p>
              <p className="text-lg font-semibold text-cyan-50">Capturar agora, decidir depois.</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Esta área é um estacionamento: ideia boa fica visível, mas só vira tarefa quando tiver energia e contexto.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="forja-kicker">Próximo corte</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">1.</span> Manter o que tem próximo passo claro.</p>
                <p><span className="font-medium text-foreground">2.</span> Concluir o que era só lembrete.</p>
                <p><span className="font-medium text-foreground">3.</span> Transformar em tarefa só quando for execução real.</p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={showIdeaForm} onOpenChange={setShowIdeaForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Ideia</DialogTitle></DialogHeader>
          <TaskForm
            initial={{ category: 'ideias', priority: 'medium', source: 'manual_idea' }}
            onSubmit={(data) => createIdea.mutate(data)}
            onCancel={() => setShowIdeaForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
