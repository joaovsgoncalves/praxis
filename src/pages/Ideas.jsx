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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-300 mb-2">
            <Lightbulb className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wide">Banco de Ideias</span>
          </div>
          <h1 className="text-2xl font-bold">Ideias</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capturas soltas, oportunidades e padrões para virar ação quando fizer sentido.
          </p>
        </div>
        <Button onClick={() => setShowIdeaForm(true)} size="sm" className="self-start sm:self-auto">
          <Plus className="w-4 h-4 mr-1" />Nova Ideia
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-cyan-500/10 border-cyan-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-cyan-200/80">Abertas</p>
            <p className="text-2xl font-bold text-cyan-100">{openIdeas.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30 border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Concluídas</p>
            <p className="text-2xl font-bold">{completedIdeas.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30 border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{sortedIdeas.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <Card className="bg-secondary/30"><CardContent className="py-8 text-center text-muted-foreground">Carregando ideias...</CardContent></Card>
        ) : sortedIdeas.length === 0 ? (
          <Card className="bg-secondary/30">
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhuma ideia registrada ainda. Capture sem compromisso; depois a Forja decide o que vira execução.
            </CardContent>
          </Card>
        ) : (
          sortedIdeas.map((idea) => (
            <Card key={idea.id} className="bg-card border-border">
              <CardContent className="p-4 flex items-start gap-3">
                <button onClick={() => toggleIdea.mutate(idea)} className="mt-0.5" aria-label={`Alternar ${cleanIdeaTitle(idea.title)}`}>
                  {idea.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-accent" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium', idea.status === 'completed' && 'line-through opacity-60')}>
                    {cleanIdeaTitle(idea.title)}
                  </p>
                  {idea.description && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">
                      {idea.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <CategoryBadge category={idea.category} />
                    <Badge variant="outline" className="text-xs">{statusLabels[idea.status] || idea.status}</Badge>
                    {idea.priority && <Badge className={cn('text-xs', priorityStyles[idea.priority])}>{priorityLabels[idea.priority] || idea.priority}</Badge>}
                    {idea.date && <Badge variant="outline" className="text-xs">{idea.date}</Badge>}
                    {idea.time && <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />{idea.time}</Badge>}
                  </div>
                </div>
                <button onClick={() => deleteIdea.mutate(idea.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Excluir ${cleanIdeaTitle(idea.title)}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </CardContent>
            </Card>
          ))
        )}
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
