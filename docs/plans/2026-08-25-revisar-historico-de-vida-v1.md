# Revisar como histórico de andamento da vida — Implementation Plan

> **For Hermes:** implementar com agente de código focado e verificar diff/testes/build/browser independentemente.

**Goal:** transformar a aba Revisar em um histórico semanal factual do andamento da vida de João, incorporando Continuidade e tarefas concluídas, sem alterar prioridades soberanas nem o fechamento read-only das 18:30.

**Architecture:** ampliar `buildWeeklyInsights` para usar somente dias transcorridos na semana atual e retornar uma camada `life_history` derivada de `project_updates`, projetos e tarefas concluídas. A tela `WeeklyReview` apresentará um bloco narrativo/cronológico antes das métricas, mantendo a revisão manual e o histórico já existentes.

**Tech Stack:** Node.js, Express, SQLite/better-sqlite3, React, TanStack Query, Tailwind, Node test runner.

---

### Task 1: Corrigir a janela de hábitos da semana em andamento

**Objective:** dias futuros não podem entrar no denominador nem aparecer como falha.

**Files:**
- Modify: `api/lib/weeklyInsights.js`
- Test: `api/lib/weeklyInsights.test.mjs`

**Steps:**
1. Criar teste determinístico para uma semana em andamento com `today` explícito.
2. Confirmar que o teste falha no código atual.
3. Fazer `buildWeeklyInsights(db, weekStart, options)` limitar os dias a `min(weekEnd, today)`.
4. Preservar semanas passadas completas e semana futura vazia.
5. Rodar `node --test api/lib/weeklyInsights.test.mjs`.

### Task 2: Construir histórico factual da semana

**Objective:** retornar avanços da Continuidade e tarefas concluídas agrupados por área/data, sem duplicação grosseira.

**Files:**
- Modify: `api/lib/weeklyInsights.js`
- Modify: `api/routes/insights.js`
- Test: `api/lib/weeklyInsights.test.mjs`

**Contract:**
- `life_history.project_updates`: data, frente, slug, resumo, fonte.
- `life_history.completed_by_area`: áreas com quantidade e amostras reais.
- `life_history.timeline`: eventos cronológicos combinando conclusões e updates, com tipo/fonte.
- `life_history.summary`: frase factual curta baseada nos dados, sem julgamento moral.

**Steps:**
1. Criar tabelas `projects`/`project_updates` no teste ou tornar a consulta compatível quando elas não existirem.
2. Testar inclusão de updates dentro da semana e exclusão fora dela.
3. Testar categorias de tarefa relevantes: RCA/trabalho, faculdade/estudo, treino/saúde, projetos/tecnologia e vida prática.
4. Implementar deduplicação conservadora por data + texto normalizado.
5. Passar `today` local do servidor a `buildWeeklyInsights`.
6. Rodar teste focal e suíte da API.

### Task 3: Atualizar a interface Revisar

**Objective:** apresentar o que realmente andou antes das métricas de hábitos.

**Files:**
- Modify: `src/pages/WeeklyReview.jsx`

**UX:**
1. Manter navegação semanal e formulário manual.
2. Adicionar bloco **Andamento da sua vida** com resumo factual.
3. Exibir chips/linhas por área e uma timeline curta da semana.
4. Identificar visualmente `Fiz isso`/conclusão como evidência forte quando a fonte vier como `conclusao`.
5. Tratar ausência de evidências sem acusação ou motivação vazia.
6. Renomear rótulos necessários para reduzir a sensação de dashboard estatístico.
7. Não criar tarefas automaticamente nem mudar Continuidade.

### Task 4: Verificação integrada

**Objective:** provar que o v1 funciona e não quebra o app.

**Commands:**
- `node --test api/lib/weeklyInsights.test.mjs`
- `npm run test:api`
- `npm run lint`
- `npm run build`
- `git diff --check`

**Browser QA:**
1. Abrir `/revisao-semanal` em preview local.
2. Confirmar semana atual sem dias futuros no denominador.
3. Confirmar timeline da Continuidade e tarefas concluídas.
4. Navegar para semana anterior.
5. Validar desktop e viewport móvel.
6. Checar console sem erros críticos.

**Out of scope:** novo cron, alteração dos campos `focus/column/live/kind/objective`, gravação automática do fechamento das 18:30, deploy/push sem autorização separada.
