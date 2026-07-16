# Jota Fit — Prompts Fase 2: Comunidade e Engajamento
**Copie e cole cada prompt no Base44, um por vez. Teste antes de ir pro próximo.**

---

## 👥 Prompt 1 — Feed Social / Comunidade

```
Crie uma entidade Post com os campos:
- student_email (string, obrigatório)
- image_url (string, URL da foto)
- caption (string, legenda do post)
- workout_id (string, opcional, ID do treino associado)
- likes_count (number, default 0)
- comments_count (number, default 0)
- created_date (date-time, auto)

Crie uma entidade Comment com os campos:
- post_id (string, obrigatório, referência ao Post)
- student_email (string, obrigatório)
- text (string, obrigatório)
- created_date (date-time, auto)

Crie uma página /feed com:

1. Header com título "Comunidade 🔥" e botão "Novo Post" (canto superior direito).

2. Lista de posts ordenados por created_date descendente (mais recente primeiro):
   Cada post é um card com:
   - Avatar do aluno + nome + tempo relativo ("2h atrás", "Ontem")
   - Imagem do post (largura total do card, bordas arredondadas)
   - Se veio de um treino: badge "🏆 Treino concluído" com nome do treino
   - Legenda completa
   - Linha de ações: botão 💪 Like (toggle, incrementa/decrementa likes_count), botão 💬 Comentar (abre seção de comentários), contador de likes e comentários
   - Seção de comentários expansível: mostra últimos 3 comentários, input pra novo comentário, botão "Ver todos" se houver mais

3. Modal "Novo Post" ao clicar no botão:
   - Upload de imagem (ou URL)
   - Campo de legenda (textarea, placeholder "Conte sobre seu treino...")
   - Seletor opcional de treino concluído (dropdown com treinos recentes do aluno)
   - Botão "Publicar"
   - Ao publicar: fechar modal, adicionar post no topo do feed, toast "Post publicado! 💪"

Design: cards escuros (#1a1a1a) com bordas sutis (#333), imagem com borderRadius 12px, botão de like com animação de escala ao clicar (scale 1.2 → 1). Adicione link "/feed" na sidebar do aluno.
```

---

## 🔥 Prompt 2 — Desafios Entre Alunos

```
Crie uma entidade Challenge com os campos:
- name (string, obrigatório, ex: "30 Dias de Prancha")
- description (string, descrição do desafio)
- exercise_type (string, tipo de exercício: "prancha", "flexão", "barra", etc)
- target_value (number, meta a atingir, ex: 300)
- target_unit (enum: reps, seconds, days, minutes)
- start_date (date, obrigatório)
- end_date (date, obrigatório)
- xp_reward (number, XP ao completar)
- badge_icon (string, emoji da badge, ex: "🏅")
- created_by (string, email do admin que criou)
- participants_count (number, default 0)
- created_date (date-time, auto)

Crie uma entidade ChallengeProgress com os campos:
- challenge_id (string, obrigatório, referência ao Challenge)
- student_email (string, obrigatório)
- current_value (number, default 0, progresso atual)
- completed (boolean, default false)
- completed_date (date, opcional)
- last_update (date-time, auto)

Crie uma página /admin/challenges para o admin criar e gerenciar desafios:
- Formulário: nome, descrição, exercício, meta, unidade, datas, XP, emoji
- Lista de desafios criados com status (ativo, expirado, rascunho)
- Botão "Ver participantes" mostra ranking com progresso de cada aluno

Na página /missoes do aluno, adicione aba "Desafios" ao lado das missões:
- Cards de desafios ativos com:
  - Nome + emoji + badge "Ativo"
  - Countdown: "Restam X dias"
  - Barra de progresso individual (current_value / target_value)
  - Porcentagem concluída
  - Ranking top 5 participantes (nome + progresso)
  - Botão "Registrar progresso" que abre modal com input numérico
  - Quando completed: confetti animation + badge desbloqueada + toast "Desafio completo! 🏅 +{xp_reward} XP"
- Desafios expirados aparecem cinza com status (completo/incompleto)
```

---

## 🔔 Prompt 3 — Notificações In-App

```
Crie uma entidade Notification com os campos:
- student_email (string, obrigatório)
- title (string, obrigatório, ex: "Nova conquista desbloqueada!")
- message (string, corpo da notificação)
- type (enum: achievement, mission, workout_reminder, challenge, admin_message, streak)
- read (boolean, default false)
- action_url (string, URL pra navegar ao clicar)
- icon (string, emoji do tipo)
- created_date (date-time, auto)

No layout principal (sidebar ou header), adicione:
- Ícone de sino (🔔) no canto superior direito
- Badge vermelho com contador de notificações não lidas (oculto se 0)
- Ao clicar: dropdown com últimas 10 notificações, cada uma com:
  - Ícone do tipo (🏆 achievement, 🎯 mission, 💪 workout, 🔥 challenge, 📢 admin, 🔥 streak)
  - Título em negrito
  - Mensagem truncada (máx 80 chars)
  - Tempo relativo ("Agora", "5min", "2h", "Ontem")
  - Fundo mais claro se não lida, escuro se lida
  - Ao clicar: marcar como lida + navegar pra action_url
- Botão "Marcar todas como lida" no topo do dropdown
- Link "Ver todas" no final que leva pra página /notificacoes

Crie página /notificacoes com lista completa de notificações, filtros por tipo, e botão de limpar lidas.

Gere notificações automaticamente nestes cenários:
- Quando aluno desbloqueia Achievement: criar Notification type=achievement com título "🏆 {achievement.name} desbloqueada!"
- Quando missão está a 24h de expirar: criar Notification type=mission com título "⏰ Missão expirando!"
- Quando aluno não faz check-in há 3+ dias: criar Notification type=workout_reminder com título "Sentimos sua falta! 💪"
- Quando admin cria novo Challenge: criar Notification type=challenge pra todos os alunos ativos
```

---

## 📊 Prompt 4 — Dashboard Admin com Métricas Reais

```
Refaça completamente o DashboardPage do admin com métricas reais baseadas nos dados do app.

LAYOUT:

Linha 1 — 4 Cards de métricas (grid 4 colunas):
Card 1: "Alunos Ativos" — count de StudentProfile onde active=true. Ícone 👥, cor verde.
Card 2: "Check-ins Hoje" — count de Check-in onde date=today. Íicone ✅, cor dourada.
Card 3: "Treinos esta Semana" — count de WorkoutLog onde completion_date >= 7 dias atrás. Ícone 🏋️, cor azul.
Card 4: "XP Total da Turma" — soma de xp_total de todos os StudentProfile. Ícone ⭐, cor roxa.

Cada card: fundo escuro (#1a1a1a), borda sutil, número grande (32px), label pequeno abaixo.

Linha 2 — 2 Gráficos (grid 2 colunas):

Gráfico 1: "Check-ins dos Últimos 7 Dias" (BarChart Recharts)
- Eixo X: dias da semana (Seg, Ter, Qua...)
- Eixo Y: count de check-ins por dia
- Barras douradas (#D4A853)
- Tooltip customizado

Gráfico 2: "Top 5 Alunos por XP" (Leaderboard)
- Tabela com avatar, nome, XP total, nível atual
- Ordenado por XP descendente
- Destaque dourado pro 1º lugar

Linha 3 — 2 Seções (grid 2 colunas):

Seção 1: "Distribuição de Níveis" (PieChart Recharts)
- Fatias por nível (Iniciante, Aprendiz, etc.)
- Cores diferentes por nível
- Legenda abaixo

Seção 2: "Alunos Inativos (7+ dias)"
- Lista de alunos sem check-in nos últimos 7 dias
- Cada item: avatar, nome, dias desde último check-in
- Botão "Enviar lembrete" que cria Notification type=workout_reminder pra cada aluno

Linha 4 — "Retenção Semanal"
- Card grande mostrando: X alunos fizeram check-in nos últimos 7 dias / Y alunos totais = Z%
- Barra de progresso visual
- Verde se > 60%, amarelo se 40-60%, vermelho se < 40%

Design: todos os gráficos com tema escuro, acentos dourados, tooltips claros, responsivo.
```

---

## Checklist de Validação (após cada prompt)

- [ ] Entidade(s) criada(s) corretamente no painel de entidades
- [ ] Página renderiza sem erros
- [ ] CRUD funciona (criar, ler, editar, deletar)
- [ ] Dados persistem após refresh
- [ ] Design consistente com o resto do app
- [ ] Mobile responsivo
- [ ] Interações funcionam (likes, comentários, notificações)
- [ ] Dados aparecem em tempo real (sem delay de cache)

---

*Gerado por A.N.A. em 2026-05-06*
