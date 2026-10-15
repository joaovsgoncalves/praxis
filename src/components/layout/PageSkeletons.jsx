import React from 'react';
import { cn } from '@/lib/utils';

/*
 * Skeletons na silhueta das telas (alturas medidas nas telas reais a 390 e 1440 px).
 * Servem de fallback do Suspense de cada rota, dentro do AppLayout (menu e topo não piscam),
 * e do carregamento inicial do Hoje. Pulso só de opacidade; com movimento reduzido, parado.
 */

function Bone({ className }) {
  return <div className={cn('praxis-skel rounded-2xl', className)} />;
}

function SkeletonPage({ className, children }) {
  return (
    <div className={cn('praxis-page', className)} role="status" aria-busy="true" aria-label="Carregando">
      {children}
    </div>
  );
}

/** Cabeçalho padrão (PageHero): kicker, título, descrição; opcionalmente ações e blocos de números. */
function HeroSkeleton({ tiles = 0, tileCols = 'sm:grid-cols-3', actions = false }) {
  return (
    <section className="praxis-page-hero">
      <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <Bone className="h-4 w-32 rounded-md" />
          <Bone className="h-9 w-56 rounded-lg sm:h-10 sm:w-72" />
          <Bone className="h-4 w-full max-w-md rounded-md" />
        </div>
        {actions ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row lg:self-center">
            <Bone className="h-11 w-full rounded-full sm:w-28" />
            <Bone className="h-11 w-full rounded-full sm:w-28" />
          </div>
        ) : null}
      </div>
      {tiles > 0 ? (
        <div className={cn('mt-5 grid gap-3', tileCols)}>
          {Array.from({ length: tiles }, (_, i) => (
            <Bone key={i} className="h-[70px] rounded-xl sm:h-[82px]" />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ListColumnSkeleton({ rows = 3 }) {
  return (
    <div className="min-w-0 space-y-3">
      <Bone className="h-7 w-36 rounded-lg" />
      {Array.from({ length: rows }, (_, i) => (
        <Bone key={i} className="h-[72px] rounded-xl" />
      ))}
    </div>
  );
}

/** Hoje: faixa do dia, Agora, trilha, hábitos; no xl, coluna direita com bento 2x2 e semana. */
export function DashboardSkeleton() {
  return (
    <div className="praxis-page praxis-dashboard flex flex-col gap-4 space-y-0 sm:gap-5" role="status" aria-busy="true" aria-label="Carregando">
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-6">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <Bone className="h-[70px]" />
          <Bone className="h-[403px] sm:h-[308px]" />
          <Bone className="h-[620px] sm:h-[584px]" />
          <Bone className="h-[560px]" />
        </div>
        <div className="min-w-0 space-y-3">
          <Bone className="hidden h-8 w-40 rounded-lg xl:block" />
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} className="h-[140px]" />
            ))}
          </div>
          <Bone className="h-[76px]" />
        </div>
      </div>
    </div>
  );
}

/** Hábitos e tarefas: cabeçalho com ações e números, filtros, semana larga (xl) e as duas colunas. */
export function HabitsTasksSkeleton() {
  return (
    <SkeletonPage className="overflow-x-hidden">
      <HeroSkeleton tiles={3} actions />
      <Bone className="h-[118px] rounded-3xl sm:h-[126px]" />
      <Bone className="hidden h-[140px] xl:block" />
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start xl:gap-8">
        <ListColumnSkeleton rows={4} />
        <ListColumnSkeleton rows={3} />
      </div>
    </SkeletonPage>
  );
}

/** Finanças: cabeçalho, resumo do mês, pilha de cartões + saldo, abas e o primeiro bloco. */
export function FinancasSkeleton() {
  return (
    <SkeletonPage className="space-y-8">
      <HeroSkeleton />
      <Bone className="h-[164px] sm:h-[87px]" />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
        <Bone className="h-[290px] lg:h-[348px]" />
        <Bone className="h-[388px] lg:h-[348px]" />
      </section>
      <div className="flex gap-2 overflow-hidden py-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-11 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Bone className="h-[116px] lg:h-[132px]" />
        <Bone className="h-[116px] lg:h-[132px]" />
      </div>
    </SkeletonPage>
  );
}

/** Foco: coluna estreita, cabeçalho com números e o cartão do timer. */
export function FocusSkeleton() {
  return (
    <SkeletonPage className="max-w-2xl">
      <HeroSkeleton tiles={3} tileCols="sm:grid-cols-3 lg:grid-cols-4" />
      <div className="space-y-3">
        <Bone className="h-7 w-40 rounded-lg" />
        <Bone className="h-[488px] sm:h-[386px]" />
      </div>
    </SkeletonPage>
  );
}

/** Revisar: cabeçalho e, no desktop, conteúdo + coluna lateral de 320 px. */
export function WeeklyReviewSkeleton() {
  return (
    <SkeletonPage className="max-w-5xl">
      <HeroSkeleton actions />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Bone className="h-[180px]" />
          <Bone className="h-[420px]" />
        </div>
        <div className="min-w-0 space-y-6">
          <Bone className="h-[220px]" />
          <Bone className="h-[200px]" />
        </div>
      </div>
    </SkeletonPage>
  );
}

/** Demais telas: cabeçalho e uma lista. */
export function GenericPageSkeleton({ className }) {
  return (
    <SkeletonPage className={className}>
      <HeroSkeleton />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
    </SkeletonPage>
  );
}

// Mesma largura máxima da tela real (as estreitas não podem nascer largas e encolher).
const PAGE_WIDTH = { '/captura': 'max-w-2xl', '/capturas': 'max-w-2xl', '/configuracoes': 'max-w-xl' };

/** Escolhe o skeleton pela rota (fallback do Suspense no AppLayout). */
export function RouteSkeleton({ pathname }) {
  switch (pathname) {
    case '/':
      return <DashboardSkeleton />;
    case '/habitos-tarefas':
      return <HabitsTasksSkeleton />;
    case '/financas':
      return <FinancasSkeleton />;
    case '/foco':
      return <FocusSkeleton />;
    case '/revisao-semanal':
      return <WeeklyReviewSkeleton />;
    default:
      return <GenericPageSkeleton className={PAGE_WIDTH[pathname]} />;
  }
}
