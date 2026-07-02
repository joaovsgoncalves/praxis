import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';

const ROUTE_TITLES = [
  { prefix: '/habitos-tarefas', title: 'Hábitos & Tarefas' },
  { prefix: '/capturas', title: 'Revisar capturas' },
  { prefix: '/captura', title: 'Captura por voz' },
  { prefix: '/ideias', title: 'Ideias' },
  { prefix: '/compras', title: 'Compras' },
  { prefix: '/foco', title: 'Modo Foco' },
  { prefix: '/metas', title: 'Metas' },
  { prefix: '/rituais', title: 'Rituais' },
  { prefix: '/conquistas', title: 'Conquistas' },
  { prefix: '/revisao-semanal', title: 'Revisão semanal' },
  { prefix: '/historico', title: 'Histórico' },
  { prefix: '/configuracoes', title: 'Configurações' },
  { prefix: '/login', title: 'Entrar' },
];

function titleForPath(pathname) {
  if (pathname === '/') return 'Hoje';
  const match = ROUTE_TITLES.find((r) => pathname.startsWith(r.prefix));
  return match?.title ?? 'Praxis';
}

export default function MobileTopBar({ onOpenMenu }) {
  const { pathname } = useLocation();
  const title = titleForPath(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl pt-[env(safe-area-inset-top)] lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        className="praxis-touch-target -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="forja-title truncate text-lg font-semibold">{title}</h1>
    </header>
  );
}