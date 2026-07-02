# Praxis — DESIGN (produto)

Registro mínimo para polish visual (fluxo Impeccable / typeset + layout).

## Tom

- **Simples:** sem jargão (“cockpit”, “painel operacional”).
- **Premium minimalista:** escuro, vidro leve, ouro só em XP/nav ativo.
- **Organizado:** rótulos alinhados à esquerda do bloco; números com `tabular-nums`.

## Tipografia

| Papel | Classe / fonte |
|--------|----------------|
| Título de página | `.forja-title` + Space Grotesk |
| Rótulo de seção | `.forja-kicker` ou `.praxis-kicker-row` (Inter, tracking moderado) |
| Corpo | Inter 16px, `leading-relaxed` em descrições |

## Layout de página

- Container: `.praxis-page` (max-w-6xl).
- Hero: `PageHero` + `StatGrid` / `StatTile` (`src/components/layout/PraxisPage.jsx`).
- Seções: `SectionHeading` (kicker + h2 + ação à direita).

## Cores por área (domain)

Manter tokens em `index.css` (`--domain-*`). Ideias = ciano suave; metas = primary; hábitos = wellness/ember.

## Anti-slop (evitar)

- Mono + letter-spacing enorme em labels de métrica.
- Subtítulo “cockpit” na marca.
- Cards dentro de cards sem necessidade.

## Próximo polish (fila)

- Metas, Hábitos & Tarefas, Capturas — migrar para `PraxisPage`.
- Passada Playwright 390px após cada lote.