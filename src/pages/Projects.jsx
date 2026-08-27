import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Layers, Pin, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { praxisApi } from '@/api/praxisClient';
import { PageHero, PraxisEmptyState, PraxisColumnsSkeleton } from '@/components/layout/PraxisPage';
import ProjectBoard from '@/components/projects/ProjectBoard';
import ProjectDetailDialog from '@/components/projects/ProjectDetailDialog';
import { PROJECT_KIND_LABELS } from '@/lib/projects';
import { fortalezaDateKey } from '@/lib/dates';

function FocusNow({ projects, onOpen, onComplete, completingId, onStartFocus, focusingId }) {
  const focused = useMemo(() => projects.filter((item) => item.focus).slice(0, 2), [projects]);
  if (!focused.length) return null;

  return (
    <section className="rounded-2xl border border-domain-gold/20 bg-domain-gold/[0.035] p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Pin className="h-3.5 w-3.5 fill-current text-domain-gold" />
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-domain-gold/90">Foco agora</p>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Se travou, começa por um destes.</p>
        </div>
        <span className="text-[10px] text-muted-foreground/50">máx. 2</span>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2">
        {focused.map((project, index) => {
          const hasNextStep = Boolean(String(project.next_step || '').trim());
          const nextStep = hasNextStep ? project.next_step : 'Próximo passo pendente de revisão';
          const slice = project.current_slice || project.status_summary || '';
          const isCompleting = String(completingId || '') === String(project.id);
          const isStartingFocus = String(focusingId || '') === String(project.id);

          return (
            <div
              key={project.id}
              className="min-w-0 rounded-xl border border-white/[0.07] bg-[#161a23]/90 p-4 transition-colors hover:border-domain-gold/25 hover:bg-[#1b202a]"
            >
              <button type="button" onClick={() => onOpen?.(project)} className="group block w-full text-left">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-domain-gold/20 bg-domain-gold/[0.06] text-[10px] font-semibold tabular-nums text-domain-gold">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-stone-100">{project.name}</p>
                      <span className="text-[10px] font-medium text-muted-foreground/60">
                        {PROJECT_KIND_LABELS[project.kind] || 'Frente'}
                      </span>
                    </div>
                    {slice ? (
                      <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/70">{slice}</p>
                    ) : null}
                    <div className="mt-3 flex items-start gap-2">
                      <ArrowRight className={hasNextStep ? 'mt-0.5 h-3.5 w-3.5 shrink-0 text-domain-gold' : 'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/35'} />
                      <p className={hasNextStep ? 'line-clamp-2 text-sm font-medium leading-snug text-stone-100/95' : 'line-clamp-2 text-sm leading-snug text-muted-foreground/55'}>
                        {nextStep}
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              {hasNextStep ? (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
                  <button
                    type="button"
                    disabled={isStartingFocus}
                    onClick={() => onStartFocus?.(project)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-domain-gold px-3 text-[11px] font-semibold text-black transition-colors hover:bg-domain-gold/90 disabled:opacity-50"
                  >
                    <Timer className="h-3.5 w-3.5" />
                    {isStartingFocus ? 'Abrindo…' : 'Modo foco'}
                  </button>
                  <button
                    type="button"
                    disabled={isCompleting}
                    onClick={() => onComplete?.(project)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.025] px-3 text-[11px] font-medium text-stone-300 transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isCompleting ? 'Registrando…' : 'Fiz isso'}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Projects() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [openProject, setOpenProject] = useState(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => praxisApi.projects.list(),
  });

  const {
    data: updates = [],
    isLoading: updatesLoading,
  } = useQuery({
    queryKey: ['project-updates', openProject?.id],
    queryFn: () => praxisApi.projects.listUpdates(openProject.id),
    enabled: Boolean(openProject?.id),
  });

  const updateProject = useMutation({
    mutationFn: ({ id, data }) => praxisApi.projects.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      const previous = queryClient.getQueryData(['projects']);
      queryClient.setQueryData(['projects'], (list) => {
        if (!Array.isArray(list)) return list;
        return list.map((item) => (
          item.id === id || item.slug === id ? { ...item, ...data } : item
        ));
      });
      return { previous };
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (openProject && row && (row.id === openProject.id || row.slug === openProject.slug)) {
        setOpenProject(row);
      }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['projects'], context.previous);
      if (err?.status === 409 || err?.body?.error === 'FOCUS_LIMIT') {
        toast('Já tem dois no foco', { description: 'Tira um pin pra caber este.' });
        return;
      }
      toast.error('Não deu pra atualizar', { description: err?.message || 'Tenta de novo.' });
    },
  });

  const addUpdate = useMutation({
    mutationFn: ({ id, summary }) => praxisApi.projects.addUpdate(id, { summary, source: 'manual', created_by: 'joao' }),
    onSuccess: (_row, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project-updates', vars.id] });
      toast.success('Avanço registrado');
    },
    onError: (err) => {
      toast.error('Não deu pra registrar', { description: err?.message || 'Tenta de novo.' });
    },
  });

  const completeNextStep = useMutation({
    mutationFn: ({ id }) => praxisApi.projects.completeNextStep(id),
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-updates', vars.id] });
      if (openProject && result?.project && String(openProject.id) === String(vars.id)) {
        setOpenProject(result.project);
      }
      toast.success('Feito e registrado', {
        description: 'Esse avanço entra no fechamento do Sêneca e o próximo passo fica pendente de revisão.',
      });
    },
    onError: (err) => {
      toast.error('Não deu pra concluir', { description: err?.message || 'Tenta de novo.' });
    },
  });

  const startProjectFocus = useMutation({
    mutationFn: async (project) => {
      const title = String(project?.next_step || '').trim();
      if (!title) throw new Error('Essa frente ainda não tem próximo passo.');

      const source = `project_focus:${project.slug}`;
      const pending = await praxisApi.tasks.list({ status: 'pending', limit: 100 });
      let task = Array.isArray(pending)
        ? pending.find((item) => item.source === source && String(item.title || '').trim() === title)
        : null;

      if (!task) {
        const category = project.slug === 'rca'
          ? 'farmacia'
          : project.kind === 'estudo'
            ? 'estudo'
            : (project.slug === 'gofluxo' || project.slug === 'animalia' ? 'gofluxo' : 'pessoal');

        const descriptionBits = [
          `Frente: ${project.name}`,
          project.current_slice ? `Agora: ${project.current_slice}` : null,
          'Criada pela Continuidade para uma sessão de foco.',
        ].filter(Boolean);

        task = await praxisApi.tasks.create({
          title,
          description: descriptionBits.join('\n'),
          date: fortalezaDateKey(),
          status: 'pending',
          priority: project.focus ? 'high' : 'medium',
          category,
          source,
          duration_minutes: 25,
        });
      }

      return { task, project };
    },
    onSuccess: ({ task, project }) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      navigate(`/foco?taskId=${encodeURIComponent(task.id)}&project=${encodeURIComponent(project.slug)}`);
    },
    onError: (err) => {
      toast.error('Não deu pra abrir o Modo Foco', { description: err?.message || 'Tenta de novo.' });
    },
  });

  const handleMove = (project, column) => {
    if (!project || project.column === column) return;
    updateProject.mutate({ id: project.id, data: { column } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-updates', project.id] }),
    });
  };

  const handleToggleFocus = (project) => {
    if (!project) return;
    const nextFocus = project.focus ? 0 : 1;
    if (nextFocus === 1) {
      const focusedCount = projects.filter((item) => item.focus && item.id !== project.id).length;
      if (focusedCount >= 2) {
        toast('Já tem dois no foco', { description: 'Tira um pin pra caber este.' });
        return;
      }
    }
    updateProject.mutate({ id: project.id, data: { focus: nextFocus } });
  };

  const handleSaveDetail = (project, data) => {
    updateProject.mutate(
      { id: project.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['project-updates', project.id] });
          toast.success('Estado salvo');
        },
      },
    );
  };

  const handleAddUpdate = async (project, summary) => {
    try {
      await addUpdate.mutateAsync({ id: project.id, summary });
      return true;
    } catch {
      return false;
    }
  };

  const handleStartFocus = async (project) => {
    if (!project?.next_step) return false;
    try {
      await startProjectFocus.mutateAsync(project);
      return true;
    } catch {
      return false;
    }
  };

  const handleCompleteNextStep = async (project) => {
    if (!project?.next_step) return false;
    try {
      await completeNextStep.mutateAsync({ id: project.id });
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="praxis-page">
      <PageHero
        kicker="Visão do momento"
        kickerIcon={Layers}
        title="Continuidade"
        description="O que merece energia agora e onde cada frente ficou."
      />

      <div className="mt-6 space-y-5">
        {!isLoading && projects.length > 0 ? <FocusNow projects={projects} onOpen={setOpenProject} onComplete={handleCompleteNextStep} completingId={completeNextStep.variables?.id} onStartFocus={handleStartFocus} focusingId={startProjectFocus.variables?.id} /> : null}

        {isLoading ? (
          <PraxisColumnsSkeleton columns={3} rowsPerColumn={2} />
        ) : projects.length === 0 ? (
          <PraxisEmptyState
            icon={Layers}
            title="Nenhuma frente ainda"
            description="Trabalho, faculdade e projetos aparecem aqui quando precisam de continuidade."
          />
        ) : (
          <section>
            <div className="mb-3 flex items-center justify-between gap-4 px-0.5">
              <div>
                <p className="text-sm font-semibold text-stone-100">Mapa das frentes</p>
                <p className="mt-0.5 text-xs text-muted-foreground/65">Aqui é só para saber onde cada coisa está. Clique para ver o contexto.</p>
              </div>
              <span className="hidden text-[10px] text-muted-foreground/45 lg:block">Arraste para mudar o estado</span>
            </div>
            <ProjectBoard
              projects={projects}
              onMoveToColumn={handleMove}
              onToggleFocus={handleToggleFocus}
              onOpen={setOpenProject}
            />
          </section>
        )}
      </div>

      <ProjectDetailDialog
        project={openProject}
        open={Boolean(openProject)}
        onOpenChange={(next) => {
          if (!next) setOpenProject(null);
        }}
        onSave={handleSaveDetail}
        saving={updateProject.isPending}
        updates={updates}
        updatesLoading={updatesLoading}
        onAddUpdate={handleAddUpdate}
        addingUpdate={addUpdate.isPending}
        onCompleteNextStep={handleCompleteNextStep}
        completingNextStep={completeNextStep.isPending}
        onStartFocus={handleStartFocus}
        startingFocus={startProjectFocus.isPending}
      />
    </div>
  );
}
