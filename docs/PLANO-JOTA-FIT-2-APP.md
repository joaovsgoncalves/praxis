# Jota Fit 2.0 — correção de produto (app, não aba)

**Data:** 2026-08-25
**Status:** substitui a leitura “módulo de ferramenta da Praxis” do `PLANO-JOTA-FIT-2-CONVERGENCIA.md`.
**O que NÃO muda:** tabelas `workout_*` continuam a fonte de treino. Sem iframe. Sem segundo banco. Sem port Base44.

---

## 0. O que o João quis dizer (e a A.N.A. errou)

Jota Fit **não** é “Treinos com outro nome” dentro do casco da Praxis.

Jota Fit **é um aplicativo de treino e nutrição**.

- **Pra João, agora:** abre **dentro** da Praxis, um toque, mesmo login, mesmo dia. Facilita a vida. Não é um segundo site pra ele treinar.
- **No lançamento:** o mesmo app, casco próprio, domínio próprio. Alguém pode comprar Jota Fit junto com a Praxis. Pode comprar só o Jota Fit. São produtos.
- Clicar em Jota Fit na Praxis tem que **entrar no app**. Não pode parecer mais uma aba com PageHero da Praxis, sidebar de finanças e 5 chips.

O Jota Fit antigo (Base44) acertou a **cara de app**: header `JOTA FIT`, bottom nav própria, CTA grande de treino, fundo próprio. Errou o motor (Base44, XP, ranking). A Praxis acertou o **motor** (logbook, GIF, mapa, histórico). Errou a **cara**.

Referência visual/produto: **Fitness Online** (`fitnessonline.app`). Não copiar comunidade, chat, coach marketplace, farmacologia. Copiar o recorte: **um app = treino + dieta + diário + enciclopédia com animação**.

---

## 1. Arquitetura alvo (corrigida)

```
            Jota Fit App
            treino + nutrição
            casco próprio
                  │
     ┌────────────┴────────────┐
     │                         │
Praxis /jota-fit          jotafit.<domínio>
João (mesmo login)        aluno / loja / standalone
     │                         │
     └────────────┬────────────┘
                  │
         Jota Fit Core
         workout_* + nutrition_*
         (hoje no SQLite da Praxis)
```

Praxis continua o sistema da vida (Hoje, Lista, Foco, Finanças).
Jota Fit é o sistema do **corpo**.

Quando João toca Jota Fit:

- some sidebar / bottom nav / partículas / PageHero da Praxis
- aparece o **shell do Jota Fit** (header + bottom nav do app)
- nutrição **mora aqui**, não numa aba irmã da Praxis

`/nutricao` da Praxis passa a ser porta: redirect para `/jota-fit/nutricao` (ou equivalente). Um diário de comida. Não dois.

---

## 2. O que pegar do Fitness Online

O app (Play: *Fitness Treino: Casa, Academia*) vende isto, e as reviews batem:

| Pegar | Por quê |
|---|---|
| Cara de app nativo (header + bottom nav, full bleed) | É o gap atual |
| Enciclopédia de exercício + animação/GIF | Praxis já tem 1324 GIF. Precisa **parecer** enciclopédia, não lista de ferramenta |
| Diário de treino (registrar série, ver histórico) | Motor Praxis já é mais forte que o FO |
| Dieta no **mesmo** app | João pediu. Macros da Praxis entram no shell Jota Fit |
| Músculo visível (o que trabalha / o que treinei) | Mapa V4 já existe |
| Programa + execução no mesmo fluxo | Já temos |

| Não pegar | Por quê |
|---|---|
| Feed, chat, comunidade | Fora do norte |
| Marketplace de personal | F8+ de verdade, não agora |
| Farmacologia | Fora |
| Dieta “4500 alimentos exóticos” | Reviews do FO chamam a dieta de pobre/cara. Nosso diário em gramas já é melhor |
| XP / ranking / missões | Continua KILL |

Reviews úteis do FO (o que o usuário ama): montar treino, trocar exercício quando o aparelho está ocupado, GIF/animação, funciona offline na academia, próximo treino visível. Isso é F4/F3 nosso, com cara de app.

---

## 3. O que pegar do Jota Fit Base44 (cara, não motor)

| Pegar | Onde estava |
|---|---|
| Header com marca **JOTA FIT** | `StudentLayout` |
| Bottom nav do app (não chips de aba Praxis) | Home / Rotina / Semana / Progresso / (Nutrição no 2.0) |
| CTA enorme “treino de hoje” | `HomeDashboard` ActiveRoutineCard |
| Display condensado, cards full-bleed | Orbitron + laranja no legado |

| Não pegar |
|---|
| Laranja #F97316 como marca (Praxis é preto+ouro; Jota Fit pode ter **acento** próprio, mas não virar FO laranja genérico sem decisão) |
| XP, nível, streak no header |
| Admin/aluno Base44 |

Decisão de cor (travar na próxima onda visual, não agora no texto):
- **A (recomendado):** preto + ouro Praxis, mas **casco de app** (header/nav/CTA). Identidade João, não skin FO.
- **B:** preto + laranja do Jota Fit antigo só dentro do shell `/jota-fit`. Praxis lá fora continua ouro.

João escolhe A ou B na hora de redesenhar o shell. Sem isso, não inventar terceira paleta.

---

## 4. Shell alvo (o que “entrar no app” significa)

```
┌─────────────────────────────────┐
│  JOTA FIT                  ⋯    │  header do app (não MobileTopBar Praxis)
├─────────────────────────────────┤
│                                 │
│  Treino de hoje                 │
│  Pull 1                         │
│  5 exercícios · ~90 min         │
│                                 │
│  [  ▶  COMEÇAR TREINO  ]        │
│                                 │
│  Nutrição de hoje    1820 / 2200│
│  Último treino · peso           │
│                                 │
├─────────────────────────────────┤
│ Hoje  Treino  Dieta  Progresso  │  bottom nav Jota Fit
└─────────────────────────────────┘
```

Rotas internas (ainda sob `/jota-fit/...` enquanto mora na Praxis):

| Rota | Papel |
|---|---|
| `/jota-fit` | Home do app |
| `/jota-fit/treino` | sessão (já overlay) |
| `/jota-fit/programa` | editor |
| `/jota-fit/biblioteca` | enciclopédia + GIF |
| `/jota-fit/nutricao` | diário/macros (hoje `/nutricao`) |
| `/jota-fit/progresso` | última/melhor/1RM + histórico |
| `/jota-fit/corpo` | mapa + peso |

Praxis: um item de menu **Jota Fit**. Nutrição some da secondary (vira dentro do app). Sem 5 chips Praxis no meio da tela.

---

## 5. Por que F8–F12 não rodaram

O plano original mandava parar no **product gate** (10 treinos do João) antes de aluno/IA/standalone. A A.N.A. obedeceu esse gate e parou em F6.

O João depois pediu o plano **por completo**. Aí o certo era:

1. não pular aluno/SaaS no escuro
2. **mas** não entregar “aba Treinos renomeada” e chamar de pronto
3. a fatia que faltava não era F8 aluno. Era **shell de app + nutrição dentro**

F8–F12 do doc antigo (Athlete, painel personal, IA, domínio próprio, arquivar Base44) continuam válidas **depois** do app ter cara. Não são a próxima onda.

---

## 6. O que já está feito (não jogar fora)

Motor, na Praxis, produção `dopraxis.vercel.app/jota-fit` (`ae92378`):

- `workout_*` canônico, 1324 GIF, mapa, logbook, PR, 1RM, Trocar, treino livre no client
- 5 seções (Hoje/Programa/Biblioteca/Progresso/Corpo)
- Progresso última/melhor/1RM
- Corpo lê peso da nutrição

Isso é **core**. Falta **produto**.

---

## 7. Próximas ondas (substitui “F3 visual” raso)

Uma onda por vez. Grok 4.6 high. A.N.A. QA + ship.

| Onda | Nome | Done-when |
|---|---|---|
| **S1** | Shell de app | `/jota-fit` full-viewport: header JOTA FIT + bottom nav do app. Chrome Praxis off. Paleta A ou B travada. |
| **S2** | Home de app | First fold = treino de hoje + CTA enorme. Dieta do dia no mesmo ecrã (macros). Sem ciclo aberto. |
| **S3** | Nutrição dentro | `/nutricao` redirect. Diário/peso/macros renderizam no shell Jota Fit. Um write, um banco. |
| **S4** | Enciclopédia | Biblioteca com cara de app (GIF grande, músculo, troca). Não lista de ferramenta. |
| **S5** | Sessão academia | Conferir 390px no aparelho: números, 1 CTA, GIF, Trocar, timer. João treina 1× de verdade. |
| **S6** | Standalone mínimo | Mesmo shell em host próprio quando existir motivo (aluno ou loja). Mesma API. |

S6 = antigo F11, sem inventar billing antes.

Aluno / painel / IA = antigo F8–F10, **depois** de S5.

---

## 8. Repos

- **Agora:** código do core e do shell na Praxis. Repo `jota-fit` Base44 congelado (referência de cara, não motor).
- **S6:** extrair `modules/jota-fit` (+ nutrition que o app usa) para o GitHub Jota Fit **limpo**, Praxis importa. Não ressuscitar Base44.

---

## 9. Bloqueios

- Não voltar a parecer aba Praxis
- Não dois diários de comida
- Não portar XP/ranking
- Não copiar feed/chat do Fitness Online
- Não segundo SQLite
- Não F8 aluno antes do shell existir
