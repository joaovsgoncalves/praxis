import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { toast } from 'sonner';
import { praxisApi } from '@/api/praxisClient';
import { PageHero, PraxisEmptyState, PraxisColumnsSkeleton } from '@/components/layout/PraxisPage';
import ProjectBoard from '@/components/projects/ProjectBoard';
import ProjectDetailDialog from '@/components/projects/ProjectDetailDialog';

export default function Projects() {
  const queryClient = useQueryClient();
  const [openProject, setOpenProject] = useState(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => praxisApi.projects.list(),
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
      if (context?.previous) {
        queryClient.setQueryData(['projects'], context.previous);
      }
      if (err?.status === 409 || err?.body?.error === 'FOCUS_LIMIT') {
        toast('Já tem dois no foco', {
          description: 'Tira um pin pra caber este.',
        });
        return;
      }
      toast.error('Não deu pra atualizar', {
        description: err?.message || 'Tenta de novo.',
      });
    },
  });

  const handleMove = (project, column) => {
    if (!project || project.column === column) return;
    updateProject.mutate({ id: project.id, data: { column } });
  };

  const handleToggleFocus = (project) => {
    if (!project) return;
    const nextFocus = project.focus ? 0 : 1;
    if (nextFocus === 1) {
      const focusedCount = projects.filter((item) => item.focus && item.id !== project.id).length;
      if (focusedCount >= 2) {
        toast('Já tem dois no foco', {
          description: 'Tira um pin pra caber este.',
        });
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
          toast.success('Projeto atualizado');
        },
      },
    );
  };

  return (
    <div className="praxis-page">
      <PageHero
        kicker="Produtos vivos"
        kickerIcon={Layers}
        title="Projetos"
        description="O que existe, o que está na mesa, o que pausou de propósito. E a fatia de cada um agora."
      />

      <div className="mt-6">
        {isLoading ? (
          <PraxisColumnsSkeleton columns={4} rowsPerColumn={2} />
        ) : projects.length === 0 ? (
          <PraxisEmptyState
            icon={Layers}
            title="Nenhum produto ainda"
            description="Quando os produtos aparecerem, cada um vira um card neste quadro."
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
      />
    </div>
  );
}
