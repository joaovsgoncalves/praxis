import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Layers, Pin } from 'lucide-react';
import { toast } from 'sonner';
import { praxisApi } from '@/api/praxisClient';
import { PageHero, PraxisEmptyState, PraxisColumnsSkeleton } from '@/components/layout/PraxisPage';
import ProjectBoard from '@/components/projects/ProjectBoard';
import ProjectDetailDialog from '@/components/projects/ProjectDetailDialog';

function FocusNow({ projects, onOpen }) {
  const focused = useMemo(() => projects.filter((item) => item.focus).slice(0, 2), [projects]);
  if (!focused.length) return null;

  return (
    <section className="rounded-2xl border border-domain-gold/15 bg-domain-gold/[0.025] p-3.5 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <Pin className="h-3.5 w-3.5 fill-current text-domain-gold" />
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-domain-gold/85">Foco agora</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {focused.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onOpen?.(project)}
            className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-[#161a23]/80 px-3.5 py-3 text-left transition-colors hover:border-white/[0.12] hover:bg-[#1c212c]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-100">{project.name}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
                {project.next_step || project.current_slice || 'Definir o próximo passo.'}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-domain-gold" />
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Projects() {
  const queryClient = useQueryClient();
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
      { onSuccess: () => toast.success('Estado salvo') },
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

  return (
    <div className="praxis-page">
      <PageHero
        kicker="Continuidade"
        kickerIcon={Layers}
        title="Projetos"
        description="Onde cada frente ficou, o que está na mesa e qual é o próximo passo."
      />

      <div className="mt-6 space-y-4">
        {!isLoading && projects.length > 0 ? <FocusNow projects={projects} onOpen={setOpenProject} /> : null}

        {isLoading ? (
          <PraxisColumnsSkeleton columns={4} rowsPerColumn={2} />
        ) : projects.length === 0 ? (
          <PraxisEmptyState
            icon={Layers}
            title="Nenhuma frente ainda"
            description="Projetos, trabalho e faculdade aparecem aqui quando precisam de continuidade."
          />
        ) : (
          <ProjectBoard
            projects={projects}
            onMoveToColumn={handleMove}
            onToggleFocus={handleToggleFocus}
            onOpen={setOpenProject}
          />
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
      />
    </div>
  );
}
