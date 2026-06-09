# PRD — Praxis v1

**Versão:** 1.0
**Data:** 2026-06-09
**Dono do produto:** João Victor
**Status:** Conceito fechado, aguardando aprovação para execução

---

## 1. Identidade

**Praxis** é o cockpit diário pessoal para transformar intenção em execução.

Não é um app de hábitos. Não é um app de tarefas. É um sistema operacional pessoal, simples e forte, que responde rápido a quatro perguntas:

- O que importa hoje?
- O que está atrasado?
- O que eu preciso fazer agora?
- O que eu estou evitando?

Dentro do produto, a IA se chama **PraxIA** — copiloto de rotina, foco e revisão. Não é o centro da marca, é o diferencial invisível.

---

## 2. Tagline

> **Praxis — Fale. Organize. Execute.**

Variação institucional: *"Menos plano. Mais prática."*

---

## 3. Promessa de produto

> Mande um áudio solto sobre o seu dia. O Praxis transforma em tarefas, hábitos, blocos de foco e revisão diária.

A alma do produto é tirar a pessoa do pensamento solto e levar à execução organizada, sem o atrito de formulários, categorias, datas e horários escolhidos manualmente.

---

## 4. Princípios

| Princípio | Tradução prática |
|---|---|
| **Menos atrito** | Editar tarefa/hábito sem abrir mil telas. Swipe, toque longo, arrasto. |
| **Execução antes de estética** | A tela principal precisa levar à ação, não à contemplação. |
| **Rotina como identidade** | Hábito não é checklist, é evidência de quem você está virando. |
| **IA como copiloto** | PraxIA orienta, resume, reorganiza e confronta padrões. Nunca decide sozinha. |
| **Revisão curta** | Fechar o dia não pode virar tarefa chata. 3 perguntas, 1 minuto. |

---

## 5. Diferencial central — Áudio como input primário

A maioria dos apps exige:
> abrir app → criar tarefa → escolher data → escolher horário → categoria → salvar

Praxis faz:
> falar → revisar → executar

**Fluxo de uso real:**

1. Usuário abre o site e aperta **"Falar meu dia"**
2. Manda áudio bagunçado, humano, do tipo:
   > *"Hoje eu preciso treinar, responder o Breno, estudar 40 minutos, resolver aquele negócio do EncarteZap, beber água e revisar meu dia à noite."*
3. PraxIA devolve uma interpretação organizada:
   - **3 tarefas** (responder Breno, resolver EncarteZap, revisar à noite)
   - **2 hábitos** (treinar, beber água)
   - **1 bloco de foco** (estudar 40min)
4. Tela de confirmação rápida: salvar / editar / refazer / tornar recorrente
5. Cockpit do dia entra em ação

**À noite**, mesma lógica: *"Me conta como foi o dia"* → PraxIA resume em 4 linhas (o que foi feito, o que travou, o que ficou, sugestão pra amanhã).

---

## 6. MVP — 5 telas

### 1. Captura por áudio
Botão central: **"Falar meu dia"**. Microfone, gravação, envio.

### 2. Interpretação
PraxIA devolve os blocos identificados (tarefas, hábitos, foco, projetos, revisão) com cards visuais.

### 3. Confirmação rápida
Antes de salvar:
- Salvar tudo
- Editar
- Refazer
- Transformar em rotina recorrente

### 4. Cockpit do dia
Tela principal com:
- Tarefa principal do dia (hero)
- Tarefas de hoje
- Tarefas atrasadas (sempre visíveis, sem esconder)
- Hábitos pendentes
- Bloco de foco ativo
- Botão **"Reorganizar com PraxIA"**

### 5. Revisão por áudio
À noite, prompt: *"Me conta como foi o dia."* Áudio → PraxIA devolve 4 linhas.

---

## 7. Identidade verbal

**Tom:** direto, útil, sem coach, sem misticismo, sem positividade tóxica.

**Frases aprovadas para uso:**

- **Tagline principal:** *"Fale. Organize. Execute."*
- **Subtítulo:** *"Menos plano. Mais prática."*
- **Hero da landing:** *"Mande um áudio. O Praxis organiza seu dia."*
- **Posicionamento forte:** *"Praxis é pra quem cansou de planejar a própria vida e quer começar a executá-la."*
- **CTA principal:** **"Falar meu dia"** (substitui "Adicionar tarefa")
- **Prompt da PraxIA:** *"Fale com a PraxIA — conte o que precisa fazer hoje. Eu organizo em tarefas, hábitos e blocos de foco."*

**O que Praxis NÃO é:**
- Não é "A Forja Diária" (descartado)
- Não é "O Espelho" (descartado)
- Não é "Mnemósine / Prometeu / Quíron" (descartado — peso demais, mitologia desnecessária)
- Não é um app místico ou poético
- Não é um coach empolgado
- Não é "PraxIA" como nome principal (PraxIA é o agente, não o produto)

---

## 8. Métricas de sucesso do MVP

| Métrica | Meta |
|---|---|
| Tempo entre abrir o app e primeira ação | < 5 segundos |
| % de dias com cockpit aberto | > 70% |
| % de áudios que viram pelo menos 1 tarefa salva | > 80% |
| % de dias com revisão noturna feita | > 60% |
| Streak médio de hábitos | crescente mês a mês |

---

## 9. Out of scope (v1)

- Gamificação complexa (badges, níveis, XP)
- Integração com CRMs externos
- Múltiplos perfis / times
- PWA offline
- Compartilhamento social de rotina

---

## 10. Próximo passo

1. **Decisão de domínio:** `praxis-do-jota.vercel.app` ou outro?
2. **Definir stack final do rename** (Vercel domain, package name, variáveis de ambiente, Google Calendar account branding)
3. **Wireframe de baixa fidelidade** das 5 telas do MVP
4. **Implementação por fase:**
   - Fase 1: rename + tagline + identidade visual mínima
   - Fase 2: cockpit do dia (Dashboard reformatado)
   - Fase 3: edição rápida (toque longo / swipe / arrasto)
   - Fase 4: captura por áudio funcional
   - Fase 5: revisão por áudio

Aprovação do conceito trava a Fase 1.
