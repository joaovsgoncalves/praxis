# Jota Fit — Prompts Fase 4: Integração do Ecossistema
**Copie e cole cada prompt no Base44, um por vez. Teste antes de ir pro próximo.**
**Alguns prompts dependem de integrações externas (Instagram, Forja, Migração) — leia as notas no final de cada prompt.**

---

## 📸 Prompt 1 — Instagram ↔ Jota Fit (Badges Compartilháveis)

```
Crie uma entidade ShareableBadge com os campos:
- student_email (string, obrigatório)
- achievement_id (string, referência ao Achievement)
- achievement_name (string, nome da conquista)
- achievement_emoji (string, emoji da conquista)
- student_name (string, nome do aluno)
- image_url (string, URL da imagem gerada)
- share_text (string, texto pra legenda do Instagram)
- shared (boolean, default false)
- shared_at (date-time, opcional)
- created_date (date-time, auto)

Quando um aluno desbloqueia uma conquista (AchievementUnlock), gere automaticamente uma ShareableBadge com:
- Imagem estilizada contendo: logo do Jota Fit no topo, emoji da conquista grande no centro, nome da conquista, nome do aluno, "Disponível em jota.fit" no rodapé
- Fundo escuro com gradient dourado
- Texto sugerido: "🏆 Desbloquei {achievement_name} no Jota Fit! 💪 #JotaFit #Calistenia #RPG"

Na MyProfilePage, seção "Conquistas", adicione botão "Compartilhar" em cada conquista desbloqueada:
- Ao clicar: abre modal com preview da imagem + texto sugerido editável
- Botão "Baixar imagem" que faz download da imagem gerada
- Botão "Copiar texto" que copia a legenda pro clipboard
- Se possível: botão "Compartilhar" que usa Web Share API (mobile)

Crie página /admin/shareables onde o admin vê:
- Total de badges geradas
- Total compartilhadas
- Taxa de compartilhamento (%)
- Lista de badges mais compartilhadas

Design da imagem compartilhável: 1080x1080px (formato Instagram), fundo escuro (#0d0d0d), borda dourada (#D4A853), logo no topo, emoji grande no centro, texto limpo e legível.
```

---

## 🔗 Prompt 2 — Forja do Jota ↔ Jota Fit (Dados Unificados)

```
Crie uma integração entre o Jota Fit e um app externo chamado "Forja do Jota" (API em http://100.110.93.24:18556).

Objetivo: quando o aluno completa ações no Jota Fit, dados vão pra Forja automaticamente.

Crie uma entidade IntegrationConfig com os campos:
- service_name (string, ex: "forja_do_jota")
- api_url (string, URL da API externa)
- api_key (string, chave de autenticação)
- enabled (boolean, default false)
- sync_tasks (boolean, default true)
- sync_achievements (boolean, default true)
- sync_focus (boolean, default false)
- last_sync (date-time)
- student_mappings (object, mapeamento email_jotafit → forja_user_id)

Crie página /admin/integrations com:
- Toggle pra ativar/desativar cada integração
- Configuração de URL e API key
- Log de últimas sincronizações
- Botão "Testar conexão" que faz GET /api/health na API da Forja

Quando integração estiver ativa, sincronize automaticamente:

1. CHECK-IN → TASK na Forja:
   Quando aluno faz check-in no Jota Fit → criar task "Checkin Jota Fit - {nome}" com category="treino", status="completed", date=today na API da Forja

2. TREINO CONCLUÍDO → TASK na Forja:
   Quando WorkoutLog é criado → criar task "Treino: {workout_name}" com category="treino", status="completed", description="{exercícios} | XP: {xp}" na API da Forja

3. CONQUISTA → TASK na Forja:
   Quando AchievementUnlock é criado → criar task "Conquista: {achievement_name} 🏆" com category="pessoal", status="completed" na API da Forja

4. STREAK 7+ → NOTIFICAÇÃO na Forja:
   Quando streak do aluno chega em 7+ → criar evento no Google Calendar via Forja (se disponível)

Para cada sincronização, log em IntegrationSyncLog com: integration_id, action, external_id, status (success/error), response_code, timestamp.

Se a API da Forja estiver offline, fila de retry (tenta 3x com 5min de intervalo).
```

---

## 🏋️ Prompt 3 — Dashboard do Instrutor (Academy)

```
Se o plano do usuário for "academy", adicione um painel de instrutor em /admin/instructor.

ENTIDADE NECESSÁRIA: InstructorStudent com os campos:
- instructor_email (string, email do instrutor/owner)
- student_email (string, email do aluno)
- assigned_at (date-time)
- notes (string, notas do instrutor sobre o aluno)
- status (enum: active, paused, removed)

PÁGINA /admin/instructor com:

SEÇÃO 1 — MEUS ALUNOS
- Tabela com: avatar, nome, email, nível, XP, streak, último check-in, ações
- Ações: ver detalhes, enviar notificação, pausar, remover
- Busca por nome/email
- Filtro: ativos, pausados, todos

SEÇÃO 2 — ALERTAS
- Cards de alerta:
  - "Alunos inativos há 7+ dias" com botão "Enviar lembrete"
  - "Alunos que atingiram meta de streak" com botão "Parabenizar"
  - "Alunos com plano expirando" com botão "Enviar aviso"

SEÇÃO 3 — RELATÓRIOS
- Seletor de período (7, 30, 90 dias)
- Métricas: total alunos ativos, retenção média, check-ins totais, treinos concluídos
- Gráfico de engajamento diário (check-ins por dia)
- Gráfico de evolução de XP (média da turma)
- Botão "Exportar CSV" com dados dos alunos

SEÇÃO 4 — CRIAR TREINO PERSONALIZADO
- Formulário: selecionar aluno(s), nome do treino, exercícios, data, recorrência
- Ao criar: gerar WorkoutAssignment pra cada aluno selecionado
- Notificar alunos via Notification

Limites do Academy: máximo 50 alunos. Se tentar adicionar 51º → "Upgrade necessário. Fale conosco."

No header, quando logado como Academy, adicione link "Painel do Instrutor" com ícone 👨‍🏫.
```

---

## 🚀 Prompt 4 — Sistema de Referral (Indicações)

```
Crie uma entidade Referral com os campos:
- referrer_email (string, quem indicou)
- referred_email (string, quem foi indicado)
- referral_code (string, código único do indicador)
- status (enum: pending, completed, rewarded)
- reward_xp (number, XP de recompensa, default 500)
- completed_at (date-time, quando o indicado fez primeiro check-in)
- rewarded_at (date-time, quando XP foi creditado)
- created_date (date-time, auto)

No StudentProfile, adicione:
- referral_code (string, código único gerado automaticamente, ex: "JOTA-LUCAS-7X")
- referral_count (number, quantas pessoas indicou)
- referral_xp_earned (number, XP total ganho com indicações)

Na MyProfilePage, adicione seção "Indique e Ganhe":
- Código de indicação grande e copiável
- Contador: "Você indicou X amigos"
- XP ganho com indicações
- Botão "Compartilhar código" que gera texto: "Treina comigo no Jota Fit! Usa meu código {referral_code} e ganhe bônus. jota.fit"
- Lista de indicações (pendentes e completas)

Na OnboardingPage, etapa 4 ("Sobre você"), adicione campo opcional:
"Código de indicação" (input)
- Se preenchido: validar código, vincular referrer → referred
- Se vazio: pular

Quando referred faz primeiro check-in:
- Mudar status da Referral pra "completed"
- Creditar reward_xp (500 XP) pro referrer
- Criar Notification pro referrer: "🎉 {nome} se juntou usando seu código! +500 XP"
- Incrementar referral_count do referrer
- Criar Notification pro referred: "Bônus de indicação! Comece com 100 XP extra"
- Creditar 100 XP pro referred como bônus inicial

Gamificação de referrals:
- 3 indicações: badge "Embaixador 🌟" + 200 XP bônus
- 10 indicações: badge "Lenda da Comunidade 👑" + 1000 XP bônus
- Top indicador do mês: badge dourada "Indicador do Mês 🥇"

Dashboard admin: seção "Referrals" com total de indicações, taxa de conversão, top indicadores, XP distribuído em indicações.
```

---

## Notas de Implementação

**Prompt 1 (Instagram):**
- A imagem compartilhável pode ser gerada com Canvas API (HTML → imagem)
- Web Share API funciona em mobile (Chrome, Safari)
- Pra desktop: botão de download é suficiente

**Prompt 2 (Forja):**
- A API da Forja já tá rodando em 100.110.93.24:18556
- Endpoints disponíveis: POST /api/tasks, GET /api/health
- Autenticação: não precisa de API key (interna via Tailscale)
- Se Base44 não conseguir chamar API externa: usar webhook ou integração via Zapier/Make

**Prompt 3 (Instrutor):**
- Só disponível pra planos Academy
- Limitar a 50 alunos por instrutor
- Futuro: multi-instrutor (cada instrutor com seus alunos)

**Prompt 4 (Referral):**
- Código gerado automaticamente: "JOTA-{NOME}-{4chars}"
- Anti-fraude: não permitir auto-indicação (mesmo email)
- Rate limit: máximo 50 indicações por mês por aluno

---

## Checklist de Validação (após cada prompt)

- [ ] Entidade(s) criada(s) corretamente
- [ ] Página renderiza sem erros
- [ ] Fluxo completo funciona do início ao fim
- [ ] Integrações externas testadas (API, Instagram, Stripe)
- [ ] Design consistente
- [ ] Mobile responsivo
- [ ] Dados persistem após refresh
- [ ] Tratamento de erros (API offline, pagamento falhou, etc)

---

*Gerado por A.N.A. em 2026-05-06*
