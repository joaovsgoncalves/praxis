# Jota Fit — Prompts Fase 3: Monetização e Crescimento
**Copie e cole cada prompt no Base44, um por vez. Teste antes de ir pro próximo.**

---

## 🌐 Prompt 1 — Landing Page de Conversão

```
Refaça a LandingPage (página pública, sem login) com o seguinte layout:

SEÇÃO 1 — HERO
- Fundo escuro com gradiente sutil (preto → cinza escuro)
- Título grande (48px): "Transforme seus treinos numa aventura RPG"
- Subtítulo: "Calistenia gamificada. Cada repetição te deixa mais forte, cada skill desbloqueada é uma evolução real."
- Botão grande dourado: "Começar grátis" (redireciona pra /onboarding)
- Imagem/mockup do app (pode ser placeholder com screenshot do dashboard)

SEÇÃO 2 — COMO FUNCIONA
- Título: "Como funciona"
- 3 cards lado a lado:
  Card 1: 🎯 "Escolha suas skills" — "Árvore de progressão como num jogo. Comece do básico e desbloqueie habilidades avançadas."
  Card 2: ⚔️ "Derrote chefes" — "Cada treino causa dano nos bosses. Vença-os pra avançar de nível."
  Card 3: 🏆 "Suba de nível" — "Ganhe XP, desbloqueie conquistas e compete no ranking."
- Cada card: fundo #1a1a1a, borda dourada sutil, ícone grande no topo, texto descritivo

SEÇÃO 3 — PARA QUEM
- Título: "Feito pra quem quer evoluir"
- 3 cards:
  Card 1: 🟢 "Iniciantes" — "Nunca fez barra? Sem problemas. A árvore começa do zero e te guia passo a passo."
  Card 2: 🟡 "Intermediários" — "Já treina? A gamificação te motiva a ir além e desbloquear skills avançadas."
  Card 3: 🔴 "Instrutores" — "Gerencie seus alunos, acompanhe progresso e crie treinos personalizados."

SEÇÃO 4 — DEPOIMENTOS
- Título: "O que dizem nossos alunos"
- 3 cards de depoimento (placeholder com nomes fictícios):
  "Em 2 meses desbloquei minha primeira muscle-up. O sistema de bosses vicia!" — Lucas, 24 anos
  "Nunca fui de treinar, mas ver meu XP subir me mantém consistente." — Marina, 19 anos
  "Como instrutor, consigo acompanhar 30 alunos sem perder tempo com planilha." — Rafael, Personal
- Cada card: avatar placeholder, nome, idade, texto em itálico, estrelas (⭐⭐⭐⭐⭐)

SEÇÃO 5 — PLANOS (preparação pro futuro)
- Título: "Escolha seu plano"
- 3 cards lado a lado:
  Free (R$0): 3 treinos/semana, check-in diário, ranking básico
  Pro (R$29/mês): treinos ilimitados, todas missões, feed social, medidas corporais — badge "Popular"
  Academy (R$99/mês): tudo do Pro + painel de instrutor + IA treinos — badge "Melhor valor"
- Botão "Começar grátis" em cada card

SEÇÃO 6 — CTA FINAL
- Fundo dourado escuro
- Título: "Pronto pra começar sua jornada?"
- Botão: "Criar conta grátis"
- Texto pequeno: "Sem cartão de crédito. Cancele quando quiser."

FOOTER
- Logo Jota Fit
- Links: Sobre, Contato, Instagram, Termos de Uso, Privacidade
- © 2026 Jota Fit. Todos os direitos reservados.

Design geral: tema escuro (#0d0d0d), acentos dourados (#D4A853), tipografia bold, espaçamento generoso, responsivo.
```

---

## 💳 Prompt 2 — Sistema de Planos e Pagamento

```
Crie uma entidade Plan com os campos:
- name (string, obrigatório: "free", "pro", "academy")
- display_name (string, ex: "Pro")
- price_monthly (number, ex: 29)
- price_yearly (number, ex: 290, com desconto)
- features (array de strings, features do plano)
- max_workouts_week (number, -1 = ilimitado)
- max_students (number, -1 = N/A, usado no academy)
- has_feed (boolean)
- has_missions_premium (boolean)
- has_body_measurement (boolean)
- has_ai_workouts (boolean)
- has_instructor_panel (boolean)
- stripe_price_id_monthly (string, ID do preço no Stripe)
- stripe_price_id_yearly (string)
- active (boolean, default true)

No StudentProfile, adicione os campos:
- plan_type (enum: free, pro, academy, default "free")
- plan_expires_at (date, opcional)
- stripe_customer_id (string, opcional)
- stripe_subscription_id (string, opcional)

Crie uma página /planos (acessível por alunos logados) com:
- Comparativo dos 3 planos em cards lado a lado
- Toggle mensal/anual com desconto visível ("-17%")
- Features de cada plano com check (✅) ou X (❌)
- Plano atual do aluno destacado com badge "Seu plano"
- Botão "Assinar" nos planos pagos (desabilitado no plano atual)
- Badge "Popular" no Pro, "Melhor valor" no Academy

Ao clicar em "Assinar":
- Redirecionar pro Stripe Checkout (use stripe_price_id do plano escolhido)
- Após pagamento: atualizar plan_type, plan_expires_at, stripe_customer_id e stripe_subscription_id no StudentProfile

Crie webhook endpoint pra Stripe (ou lógica no frontend) que atualiza o status do plano quando pagamento é confirmado ou cancelado.

Implemente restrições baseadas no plano:
- Free: se tentar acessar feed/medidas premium, mostrar modal "Upgrade pra Pro" com botão pra /planos
- Dashboard admin: mostrar total de assinantes, MRR, churn rate

Cadastre os 3 planos padrão:
- Free: R$0, 3 treinos/semana, sem feed, sem medidas
- Pro: R$29/mês (R$290/ano), ilimitado, tudo incluso exceto painel instrutor
- Academy: R$99/mês (R$990/ano), tudo + painel instrutor até 50 alunos + IA treinos
```

---

## 🤖 Prompt 3 — IA Sugere Treinos Personalizados

```
Adicione uma funcionalidade de "Treino Inteligente" no app.

Na StudentWorkoutsPage, adicione um botão "🤖 Sugerir Treino" no topo.

Ao clicar, abra um modal que:

1. Coleta dados do aluno automaticamente:
   - Nível atual (do StudentProfile ou onboarding)
   - Skills em progresso (da SkillProgress)
   - Último treino realizado (do WorkoutLog mais recente)
   - Dias desde último check-in
   - Dias de treino preferidos (do onboarding)
   - Medidas corporais recentes (se tiver BodyMeasurement)
   - Missões ativas

2. Gera 3 sugestões de treino personalizadas usando IA:
   Cada sugestão mostra:
   - Nome criativo do treino (ex: "Força do Guerreiro", "Resistência Épica")
   - Descrição: "Focado em {skill} pra causar dano no boss {boss_name}"
   - Lista de exercícios com sets x reps
   - Duração estimada (minutos)
   - XP potencial
   - Skill que vai evoluir (com ícone e nome)
   - Boss que vai causar dano (com HP restante)
   - Badge de dificuldade: "Leve 🟢", "Moderado 🟡", "Intenso 🔴"

3. Aluno escolhe 1 sugestão clicando nela (destaca com borda dourada)

4. Botão "Iniciar este treino" que:
   - Cria WorkoutAssignment automaticamente
   - Redireciona pra StudentWorkoutsPage com o treino selecionado
   - Inicia o WorkoutTimer (se existir)

Se o aluno tiver plano Free e já fez 3 treinos esta semana, mostrar:
"Limits reached! Upgrade pra Pro pra treinos ilimitados 🚀" com botão pra /planos

No admin, ao criar/editar Workout, adicione campo:
- ai_generated (boolean, default false) — marca treinos gerados por IA
- Badge "🤖 IA" visível nos cards de treino gerados por IA
```

---

## 📱 Prompt 4 — Página de Perfil Completa do Aluno

```
Refaça a MyProfilePage do aluno com seções ricas:

SEÇÃO 1 — HEADER DO PERFIL
- Avatar grande (upload ou URL) com borda dourada
- Nome do aluno + badge de nível (ex: "Nível 5 — Forjador")
- Barra de XP: "{xp_atual} / {xp_proximo_nível} XP"
- Plano atual (Free/Pro/Academy) com cor diferente
- Streak atual com emoji 🔥 e número de dias
- Botão "Editar perfil"

SEÇÃO 2 — ESTATÍSTICAS RÁPIDAS (grid 4 colunas)
- Total de treinos concluídos
- Total de check-ins
- Melhor streak
- XP total acumulado
Cada stat: número grande + label pequeno + ícone

SEÇÃO 3 — SKILLS DESBLOQUEADAS
- Grid de skills com status:
  - Desbloqueada: corida, com data de conclusão
  - Em progresso: barra de progresso
  - Bloqueada: cinza com 🔒 e pré-requisito
- Clicável pra ver detalhes da skill

SEÇÃO 4 — CONQUISTAS (Achievements)
- Grid de conquistas desbloqueadas com emoji, nome, raridade (cor da borda: common=cinza, rare=azul, epic=roxo, legendary=dourado)
- Conquistas bloqueadas: cinza com 🔒
- Contador: "X/20 conquistas desbloqueadas"

SEÇÃO 5 — MEDIDAS CORPORAIS (se tiver BodyMeasurement)
- Mini gráfico de evolução do peso
- Últimas medidas registradas em cards
- Botão "Ver completo" que vai pra /progresso

SEÇÃO 6 — HISTÓRICO DE TREINOS
- Lista dos últimos 10 treinos com: data, nome, duração, XP ganho
- Cada item clicável pra ver detalhes

SEÇÃO 7 — RANKING
- Posição atual no ranking geral
- XP dos 3 alunos acima e abaixo (pra motivar a subir)

Design: seções com cards escuros, separadores sutis, scrollável, responsivo. Adicione botão "Compartilhar perfil" que gera imagem compartilhável com stats do aluno.
```

---

## Checklist de Validação (após cada prompt)

- [ ] Entidade(s) criada(s) corretamente
- [ ] Página renderiza sem erros
- [ ] Fluxo completo funciona (do início ao fim)
- [ ] Design consistente com o resto do app
- [ ] Mobile responsivo
- [ ] Restrições de plano funcionam (Free vs Pro)
- [ ] Dados persistem após refresh
- [ ] Integrações externas testadas (Stripe, IA)

---

*Gerado por A.N.A. em 2026-05-06*
