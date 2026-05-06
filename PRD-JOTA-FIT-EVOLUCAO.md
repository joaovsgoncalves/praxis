# PRD — Jota Fit: Evolução Completa
**Versão:** 1.0
**Data:** 2026-05-06
**Autor:** A.N.A. (agente) + João Victor (dono do produto)
**Status:** Planejamento — aguardando aprovação
**Plataforma:** Base44 (prototipagem) → migração futura pra self-hosted

---

## 1. Contexto do Ecossistema Jota

### Quem é João Victor
- **RCA farmacêutico** — visitas a farmácias, relacionamento comercial
- **@jotav.fit** — projeto de vida no Instagram (fitness, conteúdo)
- **Forja do Jota** — app pessoal de produtividade (tarefas, hábitos, foco, gamificação)

### O que é o Jota Fit
Plataforma de **gestão de calistenia com mecânica de RPG**. Transforma treinos em uma jornada progressiva com:
- Skills (habilidades a desbloquear)
- Bosses (chefes pra derrotar com treinos)
- XP, níveis e recompensas
- Checkins diários
- Missões e conquistas

### Público-alvo
- **Alunos do João** — pessoas que treinam calistenia com ele
- **Seguidores @jotav.fit** — audiência do Instagram que quer evoluir
- **Futuro: SaaS** — outros instrutores de calistenia podem usar a plataforma

### Posicionamento
> "O Duolingo da calistenia. Cada treino é uma missão, cada skill desbloqueada é uma evolução real."

---

## 2. Estado Atual (Base44)

### Páginas existentes (14)
**Admin:**
- `/admin` — Dashboard (métricas básicas)
- `/admin/students` — Lista de alunos
- `/admin/students/:email` — Detalhe do aluno
- `/admin/workouts` — Gestão de treinos
- `/admin/skills` — Árvore de skills
- `/admin/missions` — Missões
- `/admin/ranking` — Ranking geral

**Aluno:**
- `/` — Check-in diário
- `/treinos` — Meus treinos
- `/skills` — Minhas skills
- `/missoes` — Missões ativas
- `/perfil` — Meu perfil
- `/ranking` — Ranking geral

### Entidades (15)
| Entidade | Campos | Função |
|----------|--------|--------|
| StudentProfile | 8 | Perfil do aluno (XP, streak, avatar) |
| Skill | 7 | Habilidade na árvore RPG |
| Boss | 7 | Chefe associado a skill |
| Workout | 6 | Treino com exercícios |
| WorkoutAssignment | 5 | Atribuição de treino a aluno |
| WorkoutLog | 6 | Registro de conclusão |
| Checkin | 3 | Check-in diário |
| SkillProgress | 5 | Progresso na skill |
| BossProgress | 5 | Dano ao chefe |
| Mission | 9 | Missão temporária |
| MissionProgress | 5 | Progresso na missão |
| Achievement | 7 | Conquista desbloqueável |
| AchievementUnlock | 3 | Registro de desbloqueio |
| XPConfig | 2 | Configuração de XP |
| LevelConfig | 3 | Configuração de níveis |

### O que funciona bem
- ✅ Sistema RPG completo e bem estruturado
- ✅ Separação admin/aluno clara
- ✅ Gamificação profunda (XP, levels, bosses, achievements)
- ✅ Auth com Google login
- ✅ 15 entidades bem desenhadas

### O que falta (gaps identificados)
- ❌ Sem timer de treino durante exercício
- ❌ Sem feed social / comunidade
- ❌ Sem desafios entre alunos
- ❌ Sem medidas corporais / progresso físico
- ❌ Sem vídeos demonstrativos de exercícios
- ❌ Sem dashboard com métricas reais do admin
- ❌ Sem notificações in-app
- ❌ Sem landing page de conversão
- ❌ Sem integração com @jotav.fit (Instagram)
- ❌ Sem sistema de pagamento/planos
- ❌ Sem onboarding guiado pro aluno
- ❌ Sem IA pra sugestão de treinos

---

## 3. Fases de Evolução

### Premissas
- **Prototipagem no Base44** — usar créditos deles pra gerar código
- **Migração futura** — quando o app estiver maduro, migrar pra self-hosted (skill `base44-to-selfhosted-migration`)
- **Tokens da A.N.A.** — economizar, usar Base44 pra código, A.N.A. só pra orquestrar
- **@jotav.fit é o canal de aquisição** — Instagram traz os alunos, app retém

---

### FASE 1 — Experiência do Aluno (1-2 semanas)
> Tornar o uso diário viciante e útil.

#### 1.1 Timer de Treino com Cronômetro
**O que:** Timer integrado na página de treinos que o aluno usa durante o exercício.

**Por quê:** Hoje o aluno vê os exercícios mas não tem como cronometrar. Sem timer, não tem controle de descanso nem medição de duração.

**Prompt Base44:**
```
Adicione um componente WorkoutTimer na StudentWorkoutsPage com:
- Cronômetro crescente (tempo total de treino)
- Timer de descanso entre séries (contagem regressiva configurável: 30s, 60s, 90s, custom)
- Botões: Iniciar treino, Pausar, Finalizar
- Ao finalizar: salvar tempo total no WorkoutLog e calcular XP baseado na duração
- Vibração/áudio quando timer de descanso zera
- Design: fundo escuro, números grandes dourados, botões arredondados
```

**Critério de sucesso:** Aluno consegue treinar olhando o app, com timer de descanso automático.

---

#### 1.2 Medidas Corporais / Progresso Físico
**O que:** Página onde o aluno registra peso, medidas e vê a evolução em gráficos.

**Por quê:** Calistenia é sobre progressão. Sem dados visuais de evolução, o aluno perde motivação.

**Prompt Base44:**
```
Crie uma entidade BodyMeasurement com campos: student_email, date, weight_kg, body_fat_pct, arm_circumference (bíceps), leg_circumference (coxa), chest_circumference (peito), waist_circumference (cintura), notes.

Crie uma página /progresso com:
- Formulário rápido pra registrar medidas do dia
- Gráfico de linha mostrando evolução do peso últimos 30 dias (Recharts)
- Gráfico de barras mostrando evolução das medidas
- Comparação lado a lado: medidas atuais vs primeira medição
- Badges de conquista: "Perdeu 5kg", "Ganhou 2cm no braço"
- Design escuro com acentos dourados, consistente com o resto do app
```

**Critério de sucesso:** Aluno registra medidas e vê gráfico de evolução subindo.

---

#### 1.3 Vídeos Demonstrativos de Exercícios
**O que:** Cada exercício no treino tem vídeo + descrição detalhada.

**Por quê:** Aluno novato não sabe executar. Vídeo reduz lesão e aumenta retenção.

**Prompt Base44:**
```
Crie uma entidade Exercise com campos: name, description, muscle_groups (array), video_url, difficulty (beginner/intermediate/advanced), equipment_needed (array), tips.

Na StudentWorkoutsPage, ao clicar num exercício, abra um modal com:
- Vídeo embedado (YouTube ou upload)
- Descrição passo a passo
- Músculos trabalhados (badges)
- Dicas de execução
- Nível de dificuldade com ícone
```

**Critério de sucesso:** Aluno clica num exercício e vê vídeo + instruções.

---

#### 1.4 Onboarding Guiado do Aluno
**O que:** Quando o aluno entra pela primeira vez, um wizard coleta dados e monta plano inicial.

**Por quê:** Aluno novo sem treino atribuído fica perdido. Onboarding retenção.

**Prompt Base44:**
```
Melhore a OnboardingPage com um wizard de 4 etapas:

Etapa 1: "Qual seu nível?" — Iniciante / Intermediário / Avançado (cards com ícones)
Etapa 2: "Seu objetivo" — Ganhar massa / Perder gordura / Skills / Saúde geral (multi-select)
Etapa 3: "Quando treina?" — Dias da semana (checkboxes) + horário preferido
Etapa 4: "Seu primeiro treino" — Baseado nas respostas, sugira 1-2 treinos da árvore de skills

Ao finalizar: criar WorkoutAssignment automático com os treinos sugeridos e marcar onboarding_completed=true no StudentProfile.
```

**Critério de sucesso:** Aluno novo termina onboarding com treino atribuído em <2 minutos.

---

### FASE 2 — Comunidade e Engajamento (2-3 semanas)
> Transformar treino solitário em experiência social.

#### 2.1 Feed Social / Comunidade
**O que:** Feed onde alunos postam fotos do treino, comentam e reagem.

**Por quê:** Comunidade é o #1 de retenção em apps fitness. Aluno que posta volta mais.

**Prompt Base44:**
```
Crie uma entidade Post com campos: student_email, image_url, caption, workout_id (opcional), likes_count, comments_count, created_date.

Crie uma entidade Comment com campos: post_id, student_email, text, created_date.

Crie uma página /feed com:
- Lista de posts cronológica (mais recente primeiro)
- Cada post: avatar, nome, foto, caption, botão like (💪), contador de comentários
- Se o post veio de um treino: badge "Treino concluído 🏆" com nome do treino
- Expandir comentários inline
- Botão "Novo Post" com upload de foto + legenda
- Design: cards escuros com bordas sutis, animações de like
```

**Critério de sucesso:** Aluno abre o feed, vê posts de outros, curte e comenta.

---

#### 2.2 Desafios Entre Alunos
**O que:** Desafios temporários criados pelo admin onde alunos competem.

**Por quê:** Competição amigável aumenta engajamento em 3x (dados Duolingo).

**Prompt Base44:**
```
Crie entidade Challenge com campos: name, description, exercise_type, target_value, target_unit (reps, seconds, days), start_date, end_date, xp_reward, badge_icon, created_by.

Crie entidade ChallengeProgress com campos: challenge_id, student_email, current_value, completed, completed_date.

Na página /missoes, adicione aba "Desafios" com:
- Desafios ativos com countdown de tempo restante
- Barra de progresso individual
- Ranking dos participantes (top 5)
- Botão "Registrar progresso" que pede o valor (ex: 50 flexões)
- Badge de conclusão quando atinge o target
- Admin pode criar desafios em /admin/challenges
```

**Critério de sucesso:** Admin cria "30 dias de prancha", alunos se inscrevem e registram progresso diário.

---

#### 2.3 Notificações In-App
**O que:** Sistema de notificações dentro do app.

**Por quê:** Aluno esquece de treinar, perde missão, não vê conquista. Notificação traz de volta.

**Prompt Base44:**
```
Crie entidade Notification com campos: student_email, title, message, type (achievement, mission, workout_reminder, challenge, admin_message), read, action_url, created_date.

Adicione no layout principal:
- Ícone de sino no header com badge vermelho (contador de não lidas)
- Dropdown com últimas 10 notificações
- Click marca como lida e navega pra action_url
- Tipos com ícones diferentes: 🏆 conquista, 🎯 missão, 💪 treino, 🔥 desafio, 📢 admin

Gere notificações automaticamente quando:
- Aluno desbloqueia conquista
- Missão está prestes a expirar
- Aluno não faz check-in há 3+ dias
- Admin cria novo desafio
```

**Critério de sucesso:** Aluno vê badge vermelho, abre notificações, volta a treinar.

---

#### 2.4 Dashboard Admin com Métricas Reais
**O que:** Dashboard do admin com dados reais de uso.

**Por quê:** Sem dados, admin não sabe o que funciona. Precisa ver engajamento, retenção, crescimento.

**Prompt Base44:**
```
Refaça o DashboardPage do admin com métricas reais:

Cards superiores:
- Total alunos ativos (count StudentProfile where active=true)
- Checkins hoje (count Checkin where date=today)
- Treinos concluídos esta semana (count WorkoutLog where completion_date >= 7 days ago)
- Média de XP por aluno

Gráficos:
- Checkins dos últimos 7 dias (bar chart)
- Top 5 alunos por XP (leaderboard)
- Distribuição de nível dos alunos (pie chart)
- Taxa de retenção semanal (alunos que fizeram check-in nos últimos 7 dias / total)

Alertas:
- Alunos inativos há 7+ dias (lista com botão "Enviar lembrete")
- Missões expirando hoje
```

**Critério de sucesso:** Admin abre dashboard e vê exatamente como o app tá indo.

---

### FASE 3 — Monetização e Crescimento (3-4 semanas)
> Transformar o app em negócio.

#### 3.1 Landing Page de Conversão
**O que:** Página pública que convence visitantes a se cadastrarem.

**Por quê:** Seguidores do @jotav.fit precisam de um lugar pra chegar. Landing converte visitante em aluno.

**Prompt Base44:**
```
Crie uma LandingPage pública (sem login) com:

Hero: "Transforme seus treinos numa aventura RPG" + imagem de alguém fazendo muscle-up + botão "Começar grátis"

Seção "Como funciona": 3 cards com ícones
1. 🎯 Escolha suas skills — Árvore de progressão como jogo
2. ⚔️ Derrote chefes — Treinos causam dano nos bosses
3. 🏆 Suba de nível — XP, conquistas e ranking

Seção "Para quem": 
- Iniciantes que querem estrutura
- Intermediários que querem gamificação
- Instrutores que querem gerenciar alunos

Depoimentos: 3 cards com foto, nome, frase

Pricing (futuro): Planos Free / Pro / Academy

Footer com links úteis e contato
```

**Critério de sucesso:** Seguidor do Instagram clica no link, vê a landing, se cadastra.

---

#### 3.2 Sistema de Planos e Pagamento
**O que:** Planos Free, Pro e Academy com Stripe.

**Por quê:** Sem pagamento, não tem receita. Free atrai, Pro converte, Academy escala.

**Prompt Base44:**
```
Adicione integração com Stripe para 3 planos:

Free (R$0):
- 3 treinos por semana
- Check-in diário
- Ranking básico
- Sem acesso a missões premium

Pro (R$29/mês):
- Treinos ilimitados
- Todas as missões
- Feed social completo
- Medidas corporais com gráficos
- Conquistas exclusivas

Academy (R$99/mês):
- Tudo do Pro
- Painel de instrutor (até 50 alunos)
- IA sugere treinos personalizados
- Relatórios de progresso dos alunos
- Suporte prioritário

Crie página /planos com comparativo de features.
Integre Stripe Checkout pra upgrade.
No StudentProfile, adicione campo plan_type (free/pro/academy).
```

**Critério de sucesso:** Aluno Free vê limitação, faz upgrade pra Pro via Stripe.

---

#### 3.3 IA Sugere Treinos
**O que:** Baseado no nível, histórico e objetivos, a IA sugere treinos personalizados.

**Por quê:** Treino genérico não retém. Personalização = resultado = retenção.

**Prompt Base44:**
```
Adicione uma funcionalidade de "Treino Inteligente":

Quando o aluno clica em "Sugestão de treino" na StudentWorkoutsPage:
1. Coleta dados: nível atual, skills em progresso, último treino, dias desde último check-in, objetivo
2. Gera 3 sugestões de treino com: nome, exercícios, duração estimada, XP potencial, skill que evolui
3. Aluno escolhe 1 e cria WorkoutAssignment automático

No admin, adicione campo ai_generated na entidade Workout pra diferenciar treinos manuais dos gerados por IA.

Use o modelo configurado no app pra gerar as sugestões.
```

**Critério de sucesso:** Aluno clica "Sugerir treino", recebe 3 opções personalizadas, escolhe 1.

---

### FASE 4 — Integração Ecossistema (4-5 semanas)
> Conectar Jota Fit com @jotav.fit e Forja do Jota.

#### 4.1 Instagram ↔ Jota Fit
**O que:** Integrar conteúdo do @jotav.fit com a plataforma.

**Por quê:** Instagram é o funil de aquisição. App é a retenção. Conectar os dois = crescimento orgânico.

**Detalhes:**
- Posts do Instagram com treinos → viram "Desafios da Semana" no app
- Aluno que completa desafio → ganha badge compartilhável pro Instagram
- Link na bio do @jotav.fit → Landing page do Jota Fit
- Stories com "Treino de hoje" → link direto pro treino no app
- A.N.A. monitora @jotav.fit e sugere conteúdo → cria desafios automaticamente

**Prompt Base44:**
```
Crie uma entidade ShareableBadge com campos: student_email, achievement_id, image_url, share_text, created_date.

Quando aluno desbloqueia conquista rara+, gere automaticamente uma imagem compartilhável com:
- Logo do Jota Fit
- Nome da conquista
- Nome do aluno
- "Disponível em jota.fit"
- Design escuro com acentos dourados

Botão "Compartilhar no Instagram" que baixa a imagem.
```

---

#### 4.2 Forja do Jota ↔ Jota Fit
**O que:** Dados do Jota Fit aparecem na Forja e vice-versa.

**Por quê:** João precisa ver tudo num lugar só. Aluno que treina = task completada na Forja.

**Detalhes:**
- Checkin no Jota Fit → task "Checkin Jota Fit" completada na Forja
- XP do Jota Fit → gamificação da Forja (XP unificado)
- Treino concluído → evento no Google Calendar
- Relatório semanal da Forja inclui métricas do Jota Fit

---

#### 4.3 Migração Base44 → Self-Hosted
**O que:** Quando o app estiver maduro, migrar pra infra própria.

**Por quê:** Base44 é bom pra prototipar, mas limita: sem API direta, sem controle de deploy, dependência de terceiros.

**Quando migrar:**
- Quando tiver 50+ alunos ativos
- Quando precisar de API pra integrações
- Quando os limites do Base44 apertarem

**Como:** Skill `base44-to-selfhosted-migration` já existe. Fluxo:
1. Exportar código do Base44
2. Remover dependências Base44
3. Conectar na API própria (Express + SQLite, como a Forja)
4. Deploy na Vercel + VPS

---

## 4. Cronograma

| Fase | Duração | Entregáveis | Custo Base44 |
|------|---------|-------------|--------------|
| **Fase 1** | 1-2 sem | Timer, medidas, vídeos, onboarding | ~8 prompts |
| **Fase 2** | 2-3 sem | Feed, desafios, notificações, dashboard | ~12 prompts |
| **Fase 3** | 3-4 sem | Landing, Stripe, IA treinos | ~10 prompts |
| **Fase 4** | 4-5 sem | Instagram, Forja, migração | Integração |

**Total estimado:** ~30 prompts no Base44 (plano free: ~50 créditos/dia = suficiente em 1 semana)

---

## 5. Métricas de Sucesso

| Métrica | Meta (3 meses) | Meta (6 meses) |
|---------|----------------|----------------|
| Alunos cadastrados | 50 | 200 |
| Check-ins diários | 30+ | 100+ |
| Retenção semanal | 60% | 75% |
| Conversão Free→Pro | 10% | 15% |
| Posts no feed/semana | 20+ | 100+ |
| MRR (receita recorrente) | R$500 | R$3.000 |

---

## 6. Decisões Pendentes

1. **Preço do Pro?** — R$29/mês é bom ou testar R$19 primeiro? (Recomendo: R$29, mais fácil subir do que descer)
2. **Academy vale a pena agora?** — Só faz sentido quando João tiver alunos suficientes pra justificar (Recomendo: Phase 3.2 sem Academy, adicionar depois)
3. **Migrar pra self-hosted agora ou esperar?** — Base44 é suficiente pra prototipar, mas limita integrações (Recomendo: esperar 50+ alunos)
4. **IA de treino: usar qual modelo?** — Base44 já tem IA configurada (Claude Sonnet), pode usar pra sugestões (Recomendo: usar a deles enquanto estiver no Base44)
5. **Domínio próprio?** — jota.fit ou jotaft.com.br? (Recomendo: comprar agora, apontar pro Base44, depois migrar)

---

## 7. Próximos Passos Imediatos

1. **João aprova este PRD**
2. **A.N.A. gera os prompts** da Fase 1 prontos pra copiar/colar
3. **João cola os prompts** no Base44 (economiza tokens da A.N.A.)
4. **A.N.A. monitora** via API se o app evoluiu
5. **Deploy e teste** com 5-10 alunos beta
6. **Iterar** baseado no feedback

---

*PRD criado por A.N.A. — aguardando revisão e aprovação de João Victor.*
*Próximo passo: João aprova, e eu gero os prompts da Fase 1.*
