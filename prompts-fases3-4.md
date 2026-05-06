# Jota Fit — Prompts Fases 3+4: Monetização, Crescimento e Integração
**Ajustado por A.N.A. em 2026-05-06**
**Contexto: Jota Fit é o app pessoal do João Victor (Jota) para seus alunos de calistenia.**
**João é o instrutor. O app é a ferramenta de ensino dele. Não é SaaS genérico.**

---

## 🌐 Prompt 1 — Landing Page Pessoal do Jota

```
Refaça a LandingPage como a página pessoal do instrutor Jota (João Victor).
Esta é a porta de entrada dos alunos. Não é landing genérica — é a cara do Jota.

SEÇÃO 1 — HERO
- Fundo escuro com gradiente (preto → cinza escuro)
- Foto do Jota (placeholder por enquanto, fundo transparente)
- Título (48px): "Aprenda calistenia do zero ao avançado com o Jota"
- Subtítulo: "Treinos gamificados, acompanhamento real e uma jornada que te faz evoluir de verdade."
- Botão grande dourado: "Começar agora" (redireciona pra /onboarding)
- Badge: "💪 +X alunos já evoluíram"

SEÇÃO 2 — QUEM É O JOTA
- Título: "Seu instrutor"
- Card com foto, bio curta: "João Victor — Jota. Estudante de Educação Física, apaixonado por calistenia. Missão: te levar do primeiro pull-up ao muscle-up com método, consistência e gamificação."
- Badges: "🎓 Ed. Física", "💪 Calistenia", "🎯 Método próprio"

SEÇÃO 3 — COMO FUNCIONA
- Título: "Como funciona o Jota Fit"
- 3 cards lado a lado:
  Card 1: 🎯 "Treinos sob medida" — "O Jota monta treinos baseados no seu nível e objetivo. Cada exercício tem vídeo e instrução."
  Card 2: ⚔️ "Gamificação real" — "XP, níveis, bosses, conquistas. Cada treino te aproxima da próxima skill."
  Card 3: 📊 "Acompanhamento" — "Medidas, evolução, streak. O Jota vê seu progresso e ajusta seu plano."

SEÇÃO 4 — O QUE VOCÊ VAI APRENDER
- Título: "Trilhas de aprendizado"
- 4 cards:
  Card 1: 🟢 "Calistenia Básica" — "Flexões, barras, dips. A base de tudo."
  Card 2: 🟡 "Calistenia Intermediária" — "Muscle-up, handstand, L-sit."
  Card 3: 🔴 "Calistenia Avançada" — "Planche, front lever, back lever."
  Card 4: 🔵 "Treino Híbrido" — "Calistenia + musculação. O melhor dos dois mundos."

SEÇÃO 5 — DEPOIMENTOS
- 3 cards de alunos (placeholder):
  "Em 3 meses fui de 0 barras pra 8 repetições. O Jota sabe o que faz." — Lucas, 24 anos
  "Nunca achei que ia gostar de treinar. O app me prendeu." — Marina, 19 anos
  "O sistema de bosses vicia. Quero derrotar todos!" — Pedro, 21 anos

SEÇÃO 6 — PLANOS
- Título: "Escolha seu plano"
- 3 cards:
  Free (R$0): 3 treinos/semana, check-in diário, ranking básico
  Pro (R$29/mês): treinos ilimitados, todas missões, medidas corporais — badge "Mais popular"
  Premium (R$59/mês): tudo do Pro + treinos personalizados pelo Jota + feedback semanal — badge "Melhor resultado"
- Botão "Começar grátis" em cada card

SEÇÃO 7 — CTA FINAL
- "Pronto pra começar sua jornada?"
- Botão "Criar conta grátis"
- "Sem cartão de crédito. Cancele quando quiser."

FOOTER
- Logo Jota Fit
- Instagram: @jotav.fit
- Contato: jotav.fit@gmail.com
- © 2026 Jota Fit — João Victor

Design: tema escuro (#0d0d0d), acentos dourados (#D4A853), fotos com borda dourada, responsivo.
```

---

## 💳 Prompt 2 — Sistema de Planos e Pagamento

```
Crie uma entidade Plan com os campos:
- name (string: "free", "pro", "premium")
- display_name (string, ex: "Pro")
- price_monthly (number)
- price_yearly (number, com desconto)
- features (array de strings, features do plano)
- max_workouts_week (number, -1 = ilimitado)
- has_missions_premium (boolean)
- has_body_measurement (boolean)
- has_personalized_training (boolean, treinos montados pelo Jota)
- has_weekly_feedback (boolean, feedback semanal do Jota)
- stripe_price_id_monthly (string)
- stripe_price_id_yearly (string)
- active (boolean, default true)

No StudentProfile, adicione: plan_type (enum: free, pro, premium), plan_expires_at (date), stripe_customer_id, stripe_subscription_id.

Crie página /planos com comparativo, toggle mensal/anual ("-17%"), features com ✅/❌, plano atual destacado.

Restrições por plano:
- Free: 3 treinos/semana, sem medidas, sem missões premium
- Pro: ilimitado, medidas, missões, sem personalização do Jota
- Premium: tudo + treinos montados pelo Jota + feedback semanal em áudio/texto

Se Free tentar acessar recurso premium → modal "Faça upgrade pra evoluir mais rápido 🚀" com botão pra /planos.

Ao assinar → Stripe Checkout → webhook atualiza plano.

Cadastre: Free R$0, Pro R$29/mês (R$290/ano), Premium R$59/mês (R$590/ano).

O plano Premium é o mais valioso: o aluno recebe treinos que o Jota monta pessoalmente pra ele, com feedback semanal. Isso é o diferencial.
```

---

## 🤖 Prompt 3 — IA Baseada no Manifesto do Jota

```
Crie uma entidade InstructorProfile com os campos:
- name (string, default "Jota")
- full_name (string, "João Victor")
- bio (string, bio curta do instrutor)
- specialties (array de strings, ex: ["calistenia", "musculação", "treino híbrido"])
- philosophy (string, filosofia de treino do Jota)
- manifesto (string, texto longo com tudo sobre o método do Jota: como ele ensina, progressões que usa, princípios, estilo de motivação, erros comuns que ele vê, como ele adapta treinos)
- training_methods (object, métodos de treino: progressões, periodização, etc)
- avatar_url (string)
- instagram (string, "@jotav.fit")
- contact_email (string)

O manifesto é o "cérebro" da IA. Ele define como a IA responde, sugere treinos e interage com os alunos. Deve conter:
- Filosofia: "Progressão > intensidade. Consistência > perfeição."
- Método: "Sempre começar com a versão mais fácil do exercício e progredir."
- Estilo de motivação: "Direto, sem frescura, mas empático."
- Erros comuns: "Pular progressões, ignorar descanso, não registrar treinos."
- Como adapta: "Se o aluno não consegue 3x8, regredir. Se consegue 3x12 facilmente, progredir."

Na StudentWorkoutsPage, botão "🤖 Pedir sugestão pro Jota":
- Coleta dados do aluno (nível, skills, último treino, medidas, streak)
- Gera sugestão baseada no manifesto do Jota
- Responde como se fosse o Jota falando (tom direto, motivacional, sem frescura)
- Exemplo: "Fala! Vi que você tá focado em barra. Sugiro: 4x6 barra pronada + 3x8 remada invertida + 3x10 flexão. Descansa 90s. Bora!"

No admin (/admin/instructor), o Jota pode:
- Editar o manifesto a qualquer momento
- Ver pedidos de sugestão dos alunos
- Responder manualmente (Premium) ou deixar a IA responder

A IA SEMPRE usa o manifesto como base. Se o manifesto mudar, as sugestões mudam.
```

---

## 📊 Prompt 4 — Painel do Jota (Dashboard do Instrutor)

```
Refaça o dashboard do admin como "Painel do Jota" — o centro de comando pessoal do instrutor.

Página /admin com 5 seções:

SEÇÃO 1 — VISÃO GERAL (topo)
- 4 cards:
  "Alunos Ativos" — count StudentProfile active=true. Ícone 👥.
  "Check-ins Hoje" — count Check-in date=today. Ícone ✅.
  "Treinos esta Semana" — count WorkoutLog últimos 7 dias. Íicone 🏋️.
  "Receita Mensal" — soma de planos pagos. Ícone 💰.

SEÇÃO 2 — ALERTAS DO DIA
- Cards de alerta com ação rápida:
  - "X alunos não treinaram há 3+ dias" → botão "Enviar lembrete" (cria Notification)
  - "X alunos atingiram novo nível" → botão "Parabenizar"
  - "X alunos com plano expirando" → botão "Enviar aviso"
  - "X pedidos de feedback pendentes (Premium)" → botão "Responder"

SEÇÃO 3 — ALUNOS PREMIUM (feedback semanal)
- Lista de alunos Premium com:
  - Nome, nível, streak, último treino
  - Status do feedback da semana: "Pendente ⏳" ou "Enviado ✅"
  - Botão "Dar feedback" que abre modal com:
    - Resumo da semana do aluno (treinos, check-ins, evolução)
    - Campo de texto ou áudio (upload) pro feedback
    - Botão "Enviar"
    - Ao enviar: criar Notification pro aluno com o feedback

SEÇÃO 4 — MÉTRICAS
- Gráfico de check-ins dos últimos 7 dias (BarChart)
- Top 5 alunos por XP (leaderboard)
- Distribuição de níveis (PieChart)
- Taxa de retenção semanal (%)

SEÇÃO 5 — GERENCIAMENTO RÁPIDO
- Botões: "Criar treino", "Criar missão", "Criar skill", "Editar manifesto"
- Cada botão leva pra página respectiva

Design: tema escuro, acentos dourados, cards compactos, informação densa mas organizada. É o painel que o Jota abre todo dia.
```

---

## 📸 Prompt 5 — Badges Compartilháveis pro Instagram

```
Crie entidade ShareableBadge: student_email, achievement_id, achievement_name, achievement_emoji, student_name, image_url, share_text, shared (boolean), shared_at, created_date.

Quando aluno desbloqueia conquista → gere ShareableBadge automaticamente com:
- Imagem 1080x1080px (formato Instagram)
- Fundo escuro (#0d0d0d), borda dourada (#D4A853)
- Logo "Jota Fit" + "@jotav.fit" no topo
- Emoji grande no centro
- Nome da conquista + nome do aluno
- Rodapé: "Disponível em jota.fit"
- Texto sugerido: "🏆 Desbloquei {achievement_name} no Jota Fit! 💪 @jotav.fit #JotaFit #Calistenia #RPG"

Na MyProfilePage, botão "Compartilhar" em cada conquista:
- Modal com preview da imagem + legenda editável
- Botão "Baixar imagem" + "Copiar texto"
- Web Share API no mobile (abre Instagram direto)

Quando aluno compartilha badge no Instagram e marca @jotav.fit:
- Isso é marketing orgânico gratuito
- O Jota pode repostar nos stories
- Futuro: integrar API do Instagram pra detectar menções (skill instagram-graph-publishing já existe)

Admin (/admin/shareables): total geradas, compartilhadas, taxa %, mais populares.
```

---

## 📱 Prompt 6 — Perfil Completo do Aluno

```
Refaça MyProfilePage com seções ricas:

1. HEADER: avatar grande com borda dourada, nome + badge nível, barra de XP, plano atual (Free/Pro/Premium), streak 🔥, botão "Editar perfil"

2. STATS (grid 4): treinos concluídos, check-ins total, melhor streak, XP total

3. SKILLS DESBLOQUEADAS: grid com status (desbloqueada=colorida, em progresso=barra, bloqueada=cinza+🔒)

4. CONQUISTAS: grid com emoji, nome, raridade (common=cinza, rare=azul, epic=roxo, legendary=dourado). Contador "X/20". Botão "Compartilhar" em cada uma.

5. MEDIDAS: mini gráfico peso + últimas medidas + botão "Ver completo"

6. HISTÓRICO: últimos 10 treinos (data, nome, duração, XP)

7. RANKING: posição atual + 3 alunos acima/abaixo

8. FEEDBACK DO JOTA (Premium): últimos 3 feedbacks recebidos com data e texto/áudio

Botão "Compartilhar perfil" gera imagem com stats + "@jotav.fit"
Design: cards escuros, scrollável, responsivo.
```

---

## 🏋️ Prompt 7 — Trilhas de Aprendizado

```
Crie uma entidade LearningPath com os campos:
- name (string, ex: "Calistenia Básica")
- description (string)
- emoji (string, ex: "🟢")
- difficulty (enum: beginner, intermediate, advanced, hybrid)
- skills_order (array de skill_ids em ordem de progressão)
- estimated_weeks (number, semanas estimadas pra completar)
- icon_url (string, opcional)
- active (boolean, default true)

Crie uma página /trilhas com:
- Cards das trilhas disponíveis:
  🟢 Calistenia Básica — "Do zero à primeira barra"
  🟡 Calistenia Intermediária — "Muscle-up, handstand, L-sit"
  🔴 Calistenia Avançada — "Planche, front lever, back lever"
  🔵 Treino Híbrido — "Calistenia + musculação"
- Cada card: emoji, nome, descrição, skills na trilha (badges), semanas estimadas, botão "Começar esta trilha"

Ao clicar "Começar":
- Cria vinculação do aluno com a trilha
- Mostra roadmap visual: skills em sequência (linha vertical com nós)
  - Skill concluída: nó verde ✅
  - Skill atual: nó dourado pulsante 🎯
  - Skill bloqueada: nó cinza 🔒 com pré-requisito
- Cada skill clicável mostra: descrição, exercícios associados, boss, XP

Na StudentWorkoutsPage, quando aluno tem trilha ativa:
- Badge "Trilha: Calistenia Básica 🟢" no topo
- Próximo skill a desbloquear em destaque
- Treinos sugeridos baseados na skill atual

Cadastre 4 trilhas:
1. Calistenia Básica: Flexão → Barra australiana → Barra fixa → Dips → Agachamento
2. Calistenia Intermediária: L-sit → Handstand (parede) → Muscle-up (assistido) → Pistol squat
3. Calistenia Avançada: Planche (tuck) → Front lever (tuck) → Back lever → Human flag
4. Treino Híbrido: Agachamento com peso → Barra com peso → Dips com peso → Core avançado

Adicione link "/trilhas" na sidebar do aluno.
```

---

## Notas Importantes

**Sobre o Jota como instrutor:**
- O app reflete a marca pessoal do João Victor (@jotav.fit)
- O tom é dele: direto, motivacional, sem frescura
- A IA usa o manifesto dele pra responder como ele
- O Premium é o diferencial: treinos que o Jota monta pessoalmente

**Sobre o público:**
- Alunos de calistenia (iniciantes a avançados)
- Pessoas que querem treinar com método, não aleatoriamente
- Futuros: alunos de musculação e treino híbrido

**Sobre monetização:**
- Free atrai, Pro converte, Premium é o ouro (R$59/mês com feedback pessoal)
- Instagram (@jotav.fit) é o funil de aquisição
- Badges compartilháveis = marketing orgânico

---

*Gerado por A.N.A. em 2026-05-06*
