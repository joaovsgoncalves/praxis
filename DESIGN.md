# DESIGN.md — Praxis Superpowers Design System

Especificação formal do sistema visual e diretrizes de interface para o **Praxis**.

---

## 🎨 1. Diretrizes & Filosofia Visual

> **Postura:** O Praxis é um cockpit tático pessoal. Não é uma planilha colorida, nem um app genérico de lista. É uma ferramenta de disciplina, foco e execução rápida.

### Regras Anti-AI-Slop (Proibições Estritas):
- ❌ **Não usar roxo/violeta de template:** Usar o Obsidian Dark (`#09090B`) com Cobre Vulcânico / Gold Ember (`#F59E0B`).
- ❌ **Não usar listas planas sem relevo:** Usar cartões com relevo tátil de hardware (`inset 0 1px 0 rgba(255,255,255,0.08)`).
- ❌ **Não usar animações lentas:** Usar físicas de mola ágeis com Framer Motion (`stiffness: 400, damping: 25`).

---

## 💎 2. Tokens de Cor & Superfície

```css
--background: 240 6% 5.5%;      /* #09090B - Preto Ônix Profundo */
--card: 240 5% 9%;             /* #16161A - Cartão Relevado */
--primary: 38 85% 52%;          /* #F59E0B - Gold Ember / Cobre Vulcânico */
--border: 240 4% 16%;           /* #282830 - Borda Tática */
```

---

## ⚡ 3. Tipografia & Hierarquia

- **Display & Títulos:** `Space Grotesk`, `Inter Tight`, sans-serif (peso 700 / 800, tracking-tight).
- **Corpo & Rótulos:** `Inter`, sans-serif (peso 400 / 500 / 600).
- **Contadores & Métricas:** `JetBrains Mono`, monospace (`tabular-nums`).

---

## 🌀 4. Animação & Micro-interações

- **Clique / Toque:** `whileTap={{ scale: 0.95 }}`.
- **Hover:** `whileHover={{ scale: 1.015, y: -1 }}`.
- **Mola:** `type: "spring", stiffness: 450, damping: 28`.
