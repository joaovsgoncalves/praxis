import {
  LayoutDashboard,
  ListTodo,
  Mic,
  BookOpen,
  Lightbulb,
  ShoppingBag,
  Timer,
  Target,
  Trophy,
  BarChart3,
  Settings,
  UtensilsCrossed,
  Dumbbell,
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
  { path: '/treinos', label: 'Treinos', icon: Dumbbell },
  { path: '/nutricao', label: 'Nutrição', icon: UtensilsCrossed },
  // /capturas fica acessível por banner/links do Falar — fora do menu (João 2026-07-16)
  { path: '/metas', label: 'Metas', icon: Target, requiresActiveGoals: true },
  { path: '/conquistas', label: 'Conquistas', icon: Trophy, requiresUnlockedAchievements: true },
  { path: '/historico', label: 'Histórico', icon: BarChart3 },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function filterSecondaryNav(items, ctx) {
  const {
    activeGoalCount = 0,
    unlockedAchievementCount = 0,
  } = ctx;
  return items.filter((item) => {
    if (item.requiresActiveGoals) return activeGoalCount > 0;
    if (item.requiresUnlockedAchievements) return unlockedAchievementCount > 0;
    return true;
  });
}
