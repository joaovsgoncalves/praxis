# Rituais em Hábitos & Tarefas — Implementation Plan

> **For Hermes:** implement only the UI grouping described below; the user’s habits and rituals are configured separately through the authenticated Praxis API.

**Goal:** Mostrar os rituais ativos dentro da aba **Hábitos**, com checklists marcáveis, sem duplicar seus hábitos na lista geral.

**Architecture:** Reutilizar `RitualWidget`, que já usa os logs reais de hábitos e a API de rituais. Adicionar um modo recolhível para a tela de Hábitos & Tarefas e filtrar os hábitos que já pertencem a um ritual do bloco “Outros hábitos”. Nenhuma alteração de API ou banco é necessária.

**Tech Stack:** React, TanStack Query, shadcn/ui, Vite.

---

### Task 1: Tornar o widget de rituais recolhível

**Files:**
- Modify: `src/components/dashboard/RitualWidget.jsx`

**Steps:**
1. Adicionar uma prop opcional `collapsible`, desligada por padrão para preservar o Dashboard.
2. No modo recolhível, cada ritual abre/fecha seu checklist sem impedir os checkboxes individuais.
3. Manter progresso e estado de marcação sincronizados com os logs de hábitos.

**Verification:** `npm run lint` e `npm run build`.

### Task 2: Exibir rituais no topo de Hábitos & Tarefas

**Files:**
- Modify: `src/pages/HabitsTasks.jsx`

**Steps:**
1. Consultar os rituais ativos na mesma data dos logs.
2. Exibir `RitualWidget collapsible` no topo da seção de hábitos ativos.
3. Remover da lista plana apenas hábitos pertencentes a um ritual ativo; eles continuam visíveis e marcáveis dentro do ritual.
4. Renomear a lista inferior para “Outros hábitos” quando houver rituais.

**Verification:** `npm run lint`, `npm run build`, deploy e smoke de produção.
