# PRD — Forja do Jota: Evolução Completa
**Versão:** 1.0
**Data:** 2026-05-06
**Autor:** A.N.A. (agente) + João Victor (dono do produto)
**Status:** Planejamento — aguardando aprovação

---

## 1. Visão Geral

A Forja do Jota é o hub pessoal de produtividade e bem-estar de João Victor. O app já funciona com dashboard, tarefas, hábitos, foco, metas, histórico e captura de voz. Este PRD define a evolução para transformar a Forja no **sistema operacional pessoal** do João — integrando Google Agenda, Telegram, categorias do trabalho (RCA), e inteligência contextual.

### Premissas
- **PWA está fora** (por agora) — cedo demais, custo alto, complexidade desnecessária
- **CRM do RCA** está sendo desenvolvido com o Atlas — integração futura via API compartilhada
- **Voice capture** agora funciona via Telegram (A.N.A. recebe áudio → cria tarefa/hábito na API + Google Calendar)
- **Google Calendar** já autenticado (`joaovs.goncalves1@gmail.com`, fuso America/Fortaleza)
- **API** rodando em `100.110.93.24:18556` (Tailscale, Express + SQLite)
- **Frontend** deployado na Vercel (`forja-do-jota.vercel.app`)

### Stack Atual
- **Frontend:** React 18 + Vite + Tailwind + shadcn/ui + Recharts + TanStack Query
- **Backend:** Express + better-sqlite3 (SQLite WAL) + Multer + UUID
- **Deploy:** Vercel (front) + VPS Tailscale (API)
- **Integrações:** Google Calendar (gog CLI), Telegram (A.N.A. bot)

---

## 2. Fases de Evolução

### FASE 1 — Fundação Inteligente (1-2 semanas)
> Quick wins que mudam o uso diário sem grandes mudanças de arquitetura.

#### 1.1 Streaks de Hábitos
**O que:** Calcular e exibir sequências consecutivas de hábitos completados.

**Por quê:** Streaks são o mecanismo #1 de retenção em apps de hábitos. "🔥 7 dias" motiva mais que qualquer outra feature.

**Detalhes técnicos:**
- Backend: criar endpoint `GET /api/habits/:id/streak` ou calcular no `GET /api/habits`
- Lógica: contar dias consecutivos com `habit_logs.completed = 1` a partir de hoje, olhando pra trás
- `current_streak`: dias consecutivos até hoje
- `best_streak`: maior sequência já registrada
- Frontend: badge de fogo 🔥 com número ao lado do hábito no Dashboard e na lista de hábitos
- Quando quebrar o streak: toast "Streak zerado 😢" ao marcar hábito perdido

**Arquivos a alterar:**
- `api/server.js` — lógica de cálculo de streak no GET habits
- `src/pages/HabitsTasks.jsx` — exibir streak
- `src/components/dashboard/TodayHabits.jsx` — badge de fogo
- `src/components/dashboard/WeeklyProgress.jsx` — incluir streak info

**Critério de sucesso:** João vê "🔥 3 dias" ao lado de cada hábito no dashboard.

---

#### 1.2 Categorias RCA
**O que:** Categorias personalizadas para o contexto de trabalho do João (RCA farmacêutico) + projetos pessoais.

**Por quê:** Categorias genéricas ("trabalho", "pessoal") não refletem a rotina. Categorias específicas facilitam filtro e visualização.

**Categorias propostas:**
| Emoji | Categoria | Contexto |
|-------|-----------|----------|
| 💊 | Visita Médica | Visitas a médicos, CRM, agenda de rotas |
| 🏪 | Farmácia | Entregas, pedidos, estoque, relacionamento |
| 💪 | Treino | Academia, cardio, treinos @jotav.fit |
| 📚 | Estudo | Cursos, leitura, RCA knowledge, certificações |
| 📸 | @jotav.fit | Conteúdo, posts, reels, respostas DM |
| 🏠 | Pessoal | Casa, família, saúde, finanças |
| 🔥 | Rotina | Hábitos diários (água, sono, meditação) |

**Detalhes técnicos:**
- Backend: adicionar coluna `category` como enum ou tabela separada
- Frontend: dropdown seletor com emojis nos formulários de tarefa e hábito
- Dashboard: filtro por categoria (tabs ou chips)
- Cores diferentes por categoria nos cards

**Arquivos a alterar:**
- `api/server.js` — validação de categorias, seed data
- `src/components/forms/TaskForm.jsx` — seletor de categoria
- `src/components/forms/HabitForm.jsx` — seletor de categoria
- `src/pages/HabitsTasks.jsx` — filtro por categoria
- `src/components/dashboard/TodayTasks.jsx` — badge de categoria

**Critério de sucesso:** João cria tarefa com categoria "💊 Visita Médica" e vê o emoji no dashboard.

---

#### 1.3 Google Agenda no Dashboard
**O que:** Widget mostrando os próximos eventos do dia no dashboard da Forja.

**Por quê:** João já usa Google Agenda. Ver os eventos junto com as tarefas evita ficar alternando entre apps.

**Detalhes técnicos:**
- Backend: novo endpoint `GET /api/calendar/today` que chama `gog calendar list` via subprocess
- Cache: resultado em memória por 5 minutos (evitar chamada excessiva)
- Frontend: novo componente `TodayCalendar.jsx` no dashboard
- Mostrar: próximos 3-5 eventos com horário, título, localização
- Link pra abrir no Google Agenda

**Arquivos a criar:**
- `src/components/dashboard/TodayCalendar.jsx` — novo widget
- `api/server.js` — novo endpoint `/api/calendar/today`

**Arquivos a alterar:**
- `src/pages/Dashboard.jsx` — incluir widget TodayCalendar

**Critério de sucesso:** Dashboard mostra "15:00 - Reunião com Dr. Silva" ao lado das tarefas.

---

#### 1.4 Lembrete via Telegram
**O que:** A.N.A. envia lembretes pro João no Telegram quando hábitos/tarefas do dia não foram completados.

**Por quê:** Push notification precisa de service worker, HTTPS, permissão do browser. Telegram já funciona, é mais confiável, e o João já tá lá o dia todo.

**Detalhes técnicos:**
- Cron job (A.N.A.) roda 1x por dia às 20:00 (horário de Fortaleza)
- Verifica: tarefas do dia com status != done, hábitos não completados
- Se houver pendências: manda mensagem no Telegram listando o que falta
- Se tudo completo: manda "🏆 Dia completo! Todos os hábitos e tarefas feitos."
- Segundo lembrete opcional às 12:00 (meio-dia): "Faltam 3 tarefas e 2 hábitos hoje"

**Implementação via cron:**
```yaml
schedule: "0 23 * * *"  # 20:00 BRT = 23:00 UTC
prompt: "Verifique as tarefas e hábitos de hoje na Forja do Jota (API em 100.110.93.24:18556). Liste o que está pendente e envie um lembrete amigável pro João no Telegram."
```

**Critério de sucesso:** Às 20h, João recebe "Ei João! Faltam 2 hábitos hoje: treino 💪 e leitura 📚. Bora?"

---

### FASE 2 — Automação e Sincronização (2-3 semanas)
> Conectar os pontos entre Telegram, App e Google Agenda.

#### 2.1 Telegram ↔ App Sync
**O que:** Quando A.N.A. cria tarefa/hábito via Telegram, ele aparece em tempo real no app.

**Por quê:** Hoje a A.N.A. cria na API, mas o app não atualiza automaticamente. João precisa dar refresh.

**Detalhes técnicos:**
- Frontend: TanStack Query já tem `refetchInterval` — configurar para 30 segundos nas queries de tasks/habits
- Alternativa melhor: Server-Sent Events (SSE) no backend — quando nova task é criada, o server notifica o frontend
- Simpler approach: `refetchOnWindowFocus: true` (já deve estar) + polling de 60s

**Arquivos a alterar:**
- `src/pages/Dashboard.jsx` — configurar refetchInterval
- `src/pages/HabitsTasks.jsx` — configurar refetchInterval
- `api/server.js` — (opcional) adicionar SSE endpoint

**Critério de sucesso:** A.N.A. cria tarefa no Telegram, João abre o app, tarefa já tá lá.

---

#### 2.2 Criação de Eventos no Google Calendar via A.N.A.
**O que:** Quando João pede pra criar uma tarefa com data/hora, a A.N.A. cria tanto na Forja quanto no Google Calendar com lembretes.

**Por quê:** Já implementado parcialmente (teste funcionou). Falta automatizar o fluxo completo.

**Detalhes técnicos:**
- Skill da A.N.A.: ao receber "criar tarefa X amanhã às 14h", fazer:
  1. `POST /api/tasks` na Forja
  2. `gog calendar create` no Google Calendar
  3. Retornar confirmação com links de ambos
- Lembretes padrão: popup 30min + 10min antes
- Se a task não tem horário específico: criar como "all-day event" no Calendar
- Sync bidirecional: se João editar no Calendar, refletir na Forja (futuro)

**Critério de sucesso:** "A.N.A., marca consulta médica segunda 10h" → tarefa no app + evento no Calendar + confirmação no Telegram.

---

#### 2.3 Relatório Semanal Automático
**O que:** Toda segunda-feira, A.N.A. gera e envia um resumo da semana anterior.

**Por quê:** Visão macro ajuda a identificar padrões: quais hábitos estão falhando, se o foco tá caindo, humor em tendência.

**Conteúdo do relatório:**
```
📊 RELATÓRIO SEMANAL — Forja do Jota
28/04 a 04/05/2026

✅ HÁBITOS
• Treino: 6/7 dias (🔥 streak: 12 dias)
• Leitura: 5/7 dias (streak: 3 dias)  
• Água 2L: 7/7 dias (🔥 perfeito!)
• Meditação: 2/7 dias (⚠️ caiu 50%)

🎯 TAREFAS
• Completadas: 12/15 (80%)
• Pendentes: 3 (arrastraram pra essa semana)

⏱️ FOCO
• Total: 4h32min (8 pomodoros)
• Média: 38min/dia
• Melhor dia: Quarta (1h20min)

😊 BEM-ESTAR
• Humor médio: 3.8/5
• Sono médio: 6.5h
• Produtividade: 3.5/5

💡 OBSERVAÇÕES
• Meditação caiu muito — tentar 5min/dia em vez de 20min?
• Quarta é seu melhor dia de foco — agendar tarefas importantes
• Sono abaixo de 7h pode estar afetando humor
```

**Implementação:**
- Cron job semanal: segunda 08:00 BRT
- Coleta dados da API (últimos 7 dias de tasks, habits, focus, wellness)
- Gera resumo com análise contextual
- Envia no Telegram

**Critério de sucesso:** Segunda 8h, João recebe o relatório completo no Telegram.

---

### FASE 3 — Inteligência Contextual (3-4 semanas)
> O app começa a pensar junto com o João.

#### 3.1 Rituais/Cadeias de Hábitos
**O que:** Agrupar hábitos em rotinas sequenciais. "Manhã": acordar → meditação → treino → café. "Noite": leitura → skincare → sono.

**Por quê:** Hábitos isolados são frágeis. Cadeias criam gatilhos: "já meditei, agora treino".

**Detalhes técnicos:**
- Nova tabela `rituals` no SQLite:
  ```sql
  CREATE TABLE rituals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,        -- "Rotina Manhã"
    emoji TEXT,                -- "🌅"
    time_of_day TEXT,          -- "morning" | "afternoon" | "evening"
    habits_order TEXT,         -- JSON array de habit_ids em ordem
    created_date TEXT
  );
  ```
- Novos endpoints: `GET/POST/PUT/DELETE /api/rituals`
- Dashboard: seção "Rituais" com progresso sequencial (checklist visual)
- Marcar hábito dentro do ritual: destaca o próximo como "agora"
- Todos completados: animação de confetti + streak do ritual

**Arquivos a criar:**
- `api/server.js` — endpoints de rituals + tabela
- `src/components/dashboard/RitualWidget.jsx` — widget de ritual no dashboard
- `src/pages/Rituals.jsx` (opcional) — página de gestão de rituais

**Critério de sucesso:** João vê "🌅 Rotina Manhã" com 4 hábitos em sequência, marca um por um.

---

#### 3.2 IA Sugere Horários
**O que:** Baseado no histórico de foco e tarefas, a A.N.A. sugere os melhores horários pra cada tipo de atividade.

**Por quê:** João tem picos de produtividade em certos horários. Se o app aprender isso, pode otimizar a agenda.

**Detalhes técnicos:**
- Analisar `focus_sessions` agrupados por hora do dia
- Identificar janelas de alto foco (ex: 9h-11h)
- Quando João criar tarefa sem horário, sugerir: "Seus melhores horários de foco são 9h-11h. Quer agendar nesse horário?"
- Implementar como endpoint `GET /api/insights/best-hours` que retorna as top 3 janelas de foco
- Frontend: toast/sugestão ao criar tarefa sem hora

**Critério de sucesso:** Ao criar tarefa "Estudar farmacologia" sem hora, app sugere "Você foca melhor entre 9h-11h. Quer agendar?"

---

#### 3.3 Integração @jotav.fit
**O que:** Ideias de conteúdo que surgem na A.N.A. (conversas, vídeos, trends) viram tarefas no app com prazo e categoria.

**Por quê:** Hoje as ideias de conteúdo ficam soltas em conversas. Integrar no app garante que nada se perde.

**Detalhes técnicos:**
- Quando A.N.A. identificar ideia de conteúdo durante conversa:
  1. Cria tarefa na Forja com category="@jotav.fit"
  2. Define prazo sugerido (ex: post pra terça)
  3. Adiciona descrição com o briefing da ideia
  4. Cria evento no Google Calendar se tiver horário definido
- Dashboard: widget "Próximos Posts" mostrando tarefas @jotav.fit pendentes

**Critério de sucesso:** A.N.A. sugere "Post sobre whey vs caseína", cria task "Post whey vs caseína - terça 10h 📸" no app.

---

#### 3.4 Gamificação
**O que:** Sistema de XP, níveis e conquistas baseado em produtividade.

**Por quê:** Gamificação ativa o circuito de recompensa. Cada tarefa completada = progresso visível.

**Sistema proposto:**
| Ação | XP |
|------|-----|
| Tarefa completada | +10 XP |
| Hábito do dia | +5 XP |
| Streak de 7 dias | +50 XP (bônus) |
| Streak de 30 dias | +200 XP (bônus) |
| Ritual completo | +25 XP |
| Sessão de foco (25min) | +15 XP |
| Dia 100% completo | +100 XP (bônus) |

**Níveis:**
| Nível | XP Total | Título |
|-------|----------|--------|
| 1 | 0 | Iniciante |
| 2 | 100 | Aprendiz |
| 3 | 300 | Disciplinado |
| 4 | 600 | Focado |
| 5 | 1000 | Forjador |
| 6 | 1500 | Mestre |
| 7 | 2500 | Lenda da Forja |

**Detalhes técnicos:**
- Nova tabela `gamification` no SQLite:
  ```sql
  CREATE TABLE gamification (
    id TEXT PRIMARY KEY,
    xp_total INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    achievements TEXT,  -- JSON array de conquistas desbloqueadas
    updated_date TEXT
  );
  ```
- Tabela `achievements` com conquistas desbloqueáveis
- Endpoint `POST /api/gamification/add-xp` (chamado automaticamente ao completar tarefa/hábito)
- Frontend: barra de XP no sidebar, badge de nível, popup de level up com confetti
- Conquistas: "Primeira tarefa 🎯", "7 dias seguidos 🔥", "100 tarefas 🏆"

**Conquistas desbloqueáveis:**
- 🎯 Primeira Tarefa — complete 1 tarefa
- 🔥 Em Chamas — 7 dias de streak em qualquer hábito
- 💎 Diamante — 30 dias de streak
- 🏆 Centurião — 100 tarefas completadas
- ⏱️ Mestre do Foco — 10 horas de foco total
- 🌅 Madrugador — complete ritual da manhã 5x
- 🧘 Equilibrado — 7 dias consecutivos de wellness preenchido
- 📸 Criador — 10 posts @jotav.fit criados pelo app

**Critério de sucesso:** João vê "Nível 3 — Disciplinado | 450/600 XP" no sidebar e desbloqueia "🔥 Em Chamas".

---

## 3. Integração Futura — CRM RCA

### Contexto
João está desenvolvendo um CRM para trabalho de Representante Comercial Autônomo (RCA) farmacêutico junto com o Atlas. Esse CRM vai gerenciar médicos, farmácias, rotas, pedidos e relacionamento.

### Oportunidade de Integração
A Forja do Jota pode se tornar o **hub pessoal** que puxa dados do CRM:

| Dados do CRM | Na Forja |
|--------------|----------|
| Visitas agendadas | → Tarefas automáticas com categoria "💊 Visita Médica" |
| Metas de vendas | → Metas com progresso automático |
| Rota do dia | → Eventos no Google Calendar |
| Lembrete de follow-up | → Tarefa + notificação Telegram |
| Pedidos fechados | → XP de gamificação (recompensa por venda) |

### Pré-requisitos
- CRM precisa de API REST com endpoints de leitura
- Forja precisa de adapter/consumer que puxa dados do CRM
- Autenticação compartilhada (mesmo usuário)

### Quando implementar
- **Fase 4** (após CRM estar estável)
- Não bloqueia nenhuma fase deste PRD

---

## 4. Arquitetura Técnica

### Diagrama de Componentes (Fase Final)

```
┌─────────────────────────────────────────────────┐
│                  JOÃO VICTOR                     │
│         (Telegram + App + Google Calendar)        │
└──────────┬──────────────┬──────────────┬─────────┘
           │              │              │
     ┌─────▼─────┐  ┌────▼────┐  ┌──────▼──────┐
     │ Telegram   │  │ Forja   │  │   Google    │
     │ Bot        │  │ App     │  │   Calendar  │
     │ (A.N.A.)   │  │ (Vercel)│  │   (gog CLI) │
     └─────┬──────┘  └────┬────┘  └──────┬──────┘
           │              │              │
           │         ┌────▼────┐         │
           └────────►│ Forja   │◄────────┘
                     │ API     │
                     │ (VPS)   │
                     └────┬────┘
                          │
                     ┌────▼────┐
                     │ SQLite  │
                     │ (WAL)   │
                     └─────────┘
```

### Fluxos de Dados

**Fluxo 1: Criação via Telegram**
```
João manda áudio → A.N.A. transcreve → interpreta intent
→ POST /api/tasks (Forja) + gog calendar create (Calendar)
→ Confirma no Telegram
```

**Fluxo 2: Lembrete diário**
```
Cron 20:00 BRT → GET /api/tasks?date=today&status=pending
→ GET /api/habit-logs?date=today
→ Se pendências: mensagem Telegram pro João
```

**Fluxo 3: Relatório semanal**
```
Cron segunda 08:00 BRT → coleta 7 dias de dados
→ Gera resumo analítico → envia no Telegram
```

**Fluxo 4: Gamificação**
```
João completa tarefa → POST /api/tasks/:id (status=done)
→ Sistema calcula XP → atualiza level
→ Se level up: confetti + toast no app + notificação Telegram
```

---

## 5. Priorização e Cronograma

### Matriz de Impacto vs Esforço

| Feature | Impacto | Esforço | Prioridade | Fase |
|---------|---------|---------|------------|------|
| Streaks de hábitos | 🔴 Alto | 🟢 Baixo | **P0** | 1 |
| Categorias RCA | 🔴 Alto | 🟢 Baixo | **P0** | 1 |
| Google Agenda no Dashboard | 🟡 Médio | 🟢 Baixo | **P1** | 1 |
| Lembrete Telegram | 🔴 Alto | 🟢 Baixo | **P1** | 1 |
| Telegram ↔ App Sync | 🟡 Médio | 🟡 Médio | **P2** | 2 |
| Calendar via A.N.A. | 🔴 Alto | 🟡 Médio | **P1** | 2 |
| Relatório semanal | 🔴 Alto | 🟡 Médio | **P2** | 2 |
| Rituais/Cadeias | 🟡 Médio | 🟡 Médio | **P3** | 3 |
| IA sugere horários | 🟡 Médio | 🟡 Médio | **P3** | 3 |
| Integração @jotav.fit | 🟡 Médio | 🟢 Baixo | **P3** | 3 |
| Gamificação | 🔴 Alto | 🔴 Alto | **P3** | 3 |
| CRM RCA (futuro) | 🔴 Alto | 🔴 Alto | **P4** | 4 |

### Cronograma Estimado

| Fase | Duração | Entregáveis |
|------|---------|-------------|
| **Fase 1** | 1-2 semanas | Streaks, Categorias, Calendar widget, Lembretes |
| **Fase 2** | 2-3 semanas | Sync, Calendar automático, Relatório semanal |
| **Fase 3** | 3-4 semanas | Rituais, IA horários, @jotav.fit, Gamificação |
| **Fase 4** | TBD | Integração CRM RCA |

**Total estimado:** 6-9 semanas para Fases 1-3.

---

## 6. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| API cai e app fica sem dados | Média | Alto | Cache offline no localStorage + retry com backoff |
| Google Calendar rate limit | Baixa | Médio | Cache de 5min no endpoint de calendar |
| SQLite lock em writes concorrentes | Baixa | Médio | WAL mode já ativado, connection pooling |
| Gamificação vira distração | Média | Baixo | Tornar opcional nas Settings, não intrusivo |
| Streaks causam ansiedade | Baixa | Baixo | Permitir "freeze day" (1x por semana) |
| A.N.A. cria tarefa errada via voz | Média | Baixo | Sempre confirmar antes de criar (já faz) |

---

## 7. Critérios de Sucesso (Gerais)

- [ ] João usa o app **diariamente** (pelo menos 1x por dia)
- [ ] Streak médio de hábitos > **5 dias**
- [ ] Relatório semanal é lido toda segunda
- [ ] 80% das tarefas criadas via Telegram (não manualmente no app)
- [ ] Google Calendar mostra eventos da Forja automaticamente
- [ ] Gamificação não é intrusiva mas motiva (XP subindo naturalmente)
- [ ] CRM RCA integrado sem duplicar dados

---

## 8. Decisões Pendentes

1. **Freeze day nos streaks?** — Permitir 1 dia de "pausa" sem quebrar o streak? (Recomendo: sim)
2. **Gamificação visível ou oculta?** — Mostrar XP sempre ou só quando sobe de nível? (Recomendo: barra discreta no sidebar)
3. **Relatório semanal no Telegram ou no app?** — Telegram é mais acessível, mas app permite drill-down. (Recomendo: Telegram com link pro app)
4. **Rituais substituem o sistema de hábitos atual?** — Ou são uma camada por cima? (Recomendo: camada por cima, hábitos individuais continuam funcionando)
5. **XP por venda no CRM?** — Gamificação ligada a resultados reais de trabalho? (Recomendo: sim, quando CRM estiver pronto)

---

*PRD criado por A.N.A. — aguardando revisão e aprovação de João Victor.*
*Próximo passo: João aprova, e eu começo pela Fase 1.*
