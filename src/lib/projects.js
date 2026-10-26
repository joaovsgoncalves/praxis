export const PROJECT_COLUMNS = ['andando', 'radar', 'aguardando', 'pausado'];

export const PROJECT_COLUMN_LABELS = {
  andando: 'Andando',
  radar: 'Radar',
  aguardando: 'Aguardando',
  pausado: 'Pausado',
};

export const FRONT_STATUS_LABELS = {
  andando: 'Em curso',
  radar: 'Depois',
  aguardando: 'Aguardando',
  pausado: 'Pausado',
};

export const PROJECT_STATUS_LABELS = FRONT_STATUS_LABELS;

export const PROJECT_COLUMN_EMPTY = {
  andando: 'Nada andando agora.',
  radar: 'Nada no radar.',
  aguardando: 'Nada aguardando.',
  pausado: 'Nada pausado.',
};

export const PROJECT_KIND_LABELS = {
  produto: 'Produto',
  cliente: 'Cliente',
  trabalho: 'Trabalho',
  estudo: 'Faculdade',
  pessoal: 'Pessoal',
};

export const PROJECT_KIND_OPTIONS = ['produto', 'cliente', 'trabalho', 'estudo', 'pessoal'];

export const GUIDANCE_REASON_LABELS = {
  deadline: 'Prazo',
  income: 'Receita',
  academic: 'Faculdade',
  client_commitment: 'Compromisso com cliente',
  continuity: 'Continuidade',
  basic_need: 'Necessidade básica',
  manual: 'Ajuste manual',
};

export const FRONT_GROUPS = [
  { id: 'dinheiro', title: 'Dinheiro', kinds: ['produto', 'cliente', 'trabalho'] },
  { id: 'pessoal', title: 'Pessoal e estudo', kinds: ['estudo', 'pessoal'] },
];

export function formatProjectMoveDate(value) {
  if (!value) return null;
  const key = String(value).slice(0, 10);
  const parts = key.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return `${d}/${m}`;
}

export function formatProjectUpdateDate(value) {
  if (!value) return '';
  const key = String(value).slice(0, 10);
  const [y, m, d] = key.split('-');
  if (!y || !m || !d) return key;
  return `${d}/${m}/${y}`;
}

export function formatGuidanceTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Fortaleza',
    });
    return `Atualizado às ${formatter.format(d)}`;
  } catch {
    return '';
  }
}

export function formatGuidanceReason(priority) {
  if (!priority) return '';
  if (priority.reason && String(priority.reason).trim()) {
    return String(priority.reason).trim();
  }
  if (priority.reason_code && GUIDANCE_REASON_LABELS[priority.reason_code]) {
    return GUIDANCE_REASON_LABELS[priority.reason_code];
  }
  return '';
}

export function findProjectForGuidancePriority(priorityOrProject, projects = []) {
  if (!priorityOrProject || !Array.isArray(projects)) return null;
  const targetSlug =
    priorityOrProject.project_slug ||
    priorityOrProject.project?.slug ||
    priorityOrProject.slug;
  const targetId = priorityOrProject.project?.id || priorityOrProject.id;

  return (
    projects.find((p) => {
      if (targetSlug && (p.slug === targetSlug || String(p.id) === String(targetSlug))) return true;
      if (targetId && String(p.id) === String(targetId)) return true;
      return false;
    }) ||
    priorityOrProject.project ||
    priorityOrProject ||
    null
  );
}

const COLUMN_ORDER = { andando: 0, radar: 1, aguardando: 2, pausado: 3 };

// Do pior para o melhor: é o que a linha da frente-mãe resume quando está recolhida.
const CHILD_STATES = [
  { id: 'bloqueada', one: 'bloqueada', many: 'bloqueadas' },
  { id: 'aguardando', one: 'aguardando', many: 'aguardando' },
  { id: 'pausado', one: 'pausada', many: 'pausadas' },
  { id: 'radar', one: 'para depois', many: 'para depois' },
  { id: 'andando', one: 'em curso', many: 'em curso' },
];

const slugKey = (value) => String(value || '').trim().toLowerCase();

export function isProjectBlocked(project) {
  return Boolean(String(project?.blocked_note || '').trim());
}

function childState(project) {
  if (isProjectBlocked(project)) return 'bloqueada';
  return COLUMN_ORDER[project.column] != null ? project.column : 'radar';
}

/** Resumo do pior estado entre as filhas, ex.: "1 bloqueada". */
export function summarizeChildren(children = []) {
  if (!children.length) return '';
  const counts = new Map();
  for (const child of children) {
    const state = childState(child);
    counts.set(state, (counts.get(state) || 0) + 1);
  }
  const worst = CHILD_STATES.find((state) => counts.has(state.id));
  const n = counts.get(worst.id);
  return `${n} ${n === 1 ? worst.one : worst.many}`;
}

/** Foco e prioridade do dia primeiro (por rank), depois Andando, Radar, Aguardando, Pausado. */
export function compareFronts(a, b) {
  const tier = (p) => (p.sortRank != null || p.sortFocus ? 0 : 1);
  if (tier(a) !== tier(b)) return tier(a) - tier(b);
  const rankA = a.sortRank ?? Infinity;
  const rankB = b.sortRank ?? Infinity;
  if (rankA !== rankB) return rankA - rankB;
  const colA = COLUMN_ORDER[a.column] ?? 9;
  const colB = COLUMN_ORDER[b.column] ?? 9;
  if (colA !== colB) return colA - colB;
  const sortA = a.sort_order ?? Infinity;
  const sortB = b.sort_order ?? Infinity;
  if (sortA !== sortB) return sortA - sortB;
  return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
}

export function buildFrontsViewModel(projects = [], guidance = null) {
  if (!Array.isArray(projects)) {
    return { groups: [] };
  }

  const priorityRankBySlug = new Map();
  if (guidance?.fresh && Array.isArray(guidance.priorities)) {
    for (const p of guidance.priorities) {
      if (p.rank != null) {
        if (p.project_slug) priorityRankBySlug.set(slugKey(p.project_slug), p.rank);
        if (p.project?.slug) priorityRankBySlug.set(slugKey(p.project.slug), p.rank);
        if (p.project?.id) priorityRankBySlug.set(String(p.project.id), p.rank);
      }
    }
  }

  const getRank = (project) => (
    priorityRankBySlug.get(slugKey(project.slug)) ?? priorityRankBySlug.get(String(project.id || '')) ?? null
  );

  const knownSlugs = new Set(projects.map((p) => slugKey(p.slug)));
  const childrenByParent = new Map();
  const roots = [];

  for (const project of projects) {
    const parentSlug = slugKey(project.parent_slug);
    // Filha de uma mãe que não existe vira frente solta, para não sumir da lista.
    if (parentSlug && parentSlug !== slugKey(project.slug) && knownSlugs.has(parentSlug)) {
      const list = childrenByParent.get(parentSlug) || [];
      list.push(project);
      childrenByParent.set(parentSlug, list);
    } else {
      roots.push(project);
    }
  }

  const buckets = new Map(FRONT_GROUPS.map((g) => [g.id, []]));

  for (const root of roots) {
    const subfronts = (childrenByParent.get(slugKey(root.slug)) || [])
      .map((child) => {
        const rank = getRank(child);
        return {
          ...child,
          isSubfront: true,
          parentName: root.name,
          recommendedRank: rank,
          sortRank: rank,
          sortFocus: Boolean(child.focus),
        };
      })
      .sort(compareFronts);

    const ownRank = getRank(root);
    const childRanks = subfronts.map((c) => c.recommendedRank).filter((r) => r != null);
    const sortRank = [ownRank, ...childRanks].filter((r) => r != null).sort((x, y) => x - y)[0] ?? null;

    const front = {
      ...root,
      isSubfront: false,
      recommendedRank: ownRank,
      sortRank,
      sortFocus: Boolean(root.focus) || subfronts.some((c) => c.sortFocus),
      subfronts,
      childCount: subfronts.length,
      childSummary: summarizeChildren(subfronts),
    };

    const group = FRONT_GROUPS.find((g) => g.kinds.includes(root.kind)) || FRONT_GROUPS[0];
    buckets.get(group.id).push(front);
  }

  return {
    groups: FRONT_GROUPS.map(({ id, title }) => ({
      id,
      title,
      fronts: buckets.get(id).sort(compareFronts),
    })).filter((g) => g.fronts.length > 0),
  };
}

/** Estado do card "O que vem primeiro": sem orientação, sem prioridade nova ou com prioridades. */
export function getGuidanceState(guidance, today = null) {
  const stale = !guidance?.fresh || (today && guidance.date && guidance.date !== today);
  if (stale) return { kind: 'missing', summary: '' };
  const priorities = Array.isArray(guidance.priorities) ? guidance.priorities : [];
  if (priorities.length === 0) {
    const firstLine = String(guidance.summary || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || '';
    return { kind: 'empty', summary: firstLine };
  }
  return { kind: 'ready', summary: '' };
}

/** "Onde ficou" e "Mexendo agora" num bloco só, sem repetir texto igual. */
export function buildWhereLines(project) {
  const summary = String(project?.status_summary || '').trim();
  const slice = String(project?.current_slice || '').trim();
  if (summary && slice && summary.toLowerCase() === slice.toLowerCase()) return [summary];
  return [summary, slice].filter(Boolean);
}

/** Frentes que podem ser mãe de `project`: soltas, diferentes dela, e só se ela não tiver filhas. */
export function listParentOptions(projects = [], project = null) {
  if (!Array.isArray(projects) || !project) return [];
  const ownSlug = slugKey(project.slug);
  const hasChildren = projects.some((p) => slugKey(p.parent_slug) === ownSlug);
  if (hasChildren) return [];
  return projects
    .filter((p) => slugKey(p.slug) !== ownSlug && !slugKey(p.parent_slug))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
}
