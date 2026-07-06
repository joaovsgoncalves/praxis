# Praxis — DESIGN (produto)

Registro mínimo para polish visual (fluxo Impeccable / typeset + layout).

## Regra (pedido do João)

Quando o pedido for **ajuste geral de design**, aplicar o mesmo padrão em **todas as abas** (`praxis-page`, `PageHero`, `StatGrid`, kickers `praxis-kicker-row`) — não só na tela que apareceu no print.

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

## Lote 7 — app quieto (2026-07-06)

- **Subtrair:** mesh fraco, glass flat, kickers sentence-case, `card-domain` sem hover lift, sidebar menos ouro/sombra, Dashboard sem glow por widget.
- **Manter:** Agora, voz, hierarquia `PageHero`, ouro só nav/XP.
- Calendar: ver `docs/PRAXIS-CALENDAR-SYNC.md`.

## E2E mobile (390px)

```bash
npm run test:e2e:mobile:prod
# rotas logadas: PRAXIS_E2E_PASSWORD='…' npm run test:e2e:mobile:prod
```

## Opcional (pós-fechamento)

- Status vivo: `docs/ONDE-ESTAMOS.md`.