import {
  LayoutDashboard,
  ListTodo,
  Mic,
  BookOpen,
  Lightbulb,
  ShoppingBag,
  Timer,
  Target,
  Link2,
  Trophy,
  BarChart3,
  Settings,
  Inbox,
} from 'lucide-react';

/** Dia a dia — bottom nav + topo da sidebar (sem hub /mais) */
export const primaryNavItems = [
  { path: '/', label: 'Hoje', icon: LayoutDashboard, end: true },
  { path: '/habitos-tarefas', label: 'Tarefas', icon: ListTodo },
  { path: '/captura', label: 'Falar', icon: Mic },
  { path: '/revisao-semanal', label: 'Revisar', icon: BookOpen },
];

/** Ferramentas na aba lateral (sidebar / menu hambúrguer) — sem página hub */
export const secondaryNavItems = [
  { path: '/ideias', label: 'Ideias', icon: Lightbulb },
  { path: '/foco', label: 'Modo Foco', icon: Timer },
  { path: '/compras', label: 'Compras', icon: ShoppingBag },
  { path: '/capturas', label: 'Fila de capturas', icon: Inbox },
  { path: '/metas', label: 'Metas', icon: Target, requiresActiveGoals: true },
  { path: '/rituais', label: 'Rituais', icon: Link2, requiresActiveRituals: true },
  { path: '/conquistas', label: 'Conquistas', icon: Trophy, requiresUnlockedAchievements: true },
  { path: '/historico', label: 'Histórico', icon: BarChart3 },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function filterSecondaryNav(items, ctx) {
  const {
    activeGoalCount = 0,
    activeRitualCount = 0,
    unlockedAchievementCount = 0,
  } = ctx;
  return items.filter((item) => {
    if (item.requiresActiveGoals) return activeGoalCount > 0;
    if (item.requiresActiveRituals) return activeRitualCount > 0;
    if (item.requiresUnlockedAchievements) return unlockedAchievementCount > 0;
    return true;
  });
}
