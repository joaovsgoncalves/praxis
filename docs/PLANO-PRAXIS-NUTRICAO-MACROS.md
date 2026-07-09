# Plano / PRD — Nutrição (Macros) dentro da Praxis

**Data:** 2026-07-09  
**Status:** plano (sem código ainda)  
**Produto:** módulo **Nutrição** na Praxis (não app paralelo)  
**URL canônica (quando existir):** `https://praxis-jota.vercel.app/nutricao`  
**Inspiração:** Macros (JosmanTek) — diário calórico + macros, simples e visual  
**Não-alvo:** clonar MyFitnessPal / barcode global / rede social / ads

---

## 1. Por que existe

João precisa **bater macros no dia a dia** (qualquer alimento ou refeição), de forma:

1. **rápida** (menos fricção que abrir app de nutrição separado);
2. **visual** (barras claras de kcal + P/C/G);
3. **dentro da Praxis** (mesmo login, mesmo “Hoje”, mesma voz/captura no futuro).

A Praxis já tem hábitos quantitativos, água no Hoje, captura, revisão semanal e API SQLite. Nutrição entra como **módulo de ferramenta** (como Compras), com **resumo no Hoje**.

---

## 2. Problema e promessa

| | |
|---|---|
| **Problema** | Contar macros exige app separado, base genérica, ads/paywall e troca de contexto. |
| **Promessa** | Em ≤30 s registrar o que comeu; ver se fechou proteína/carbo/gordura/kcal; reutilizar refeições típicas do João. |
| **Veredito de sucesso** | 7 dias seguidos com log real no celular; Hoje mostra macros sem poluir Agora. |

---

## 3. Princípios de produto

1. **Simplicidade radical** — zero jargão (nada de “TDEE” na UI; “meta do dia”, “proteína”, “carbo”, “gordura”).
2. **Teu banco primeiro** — alimentos e refeições **do João** > base mundial.
3. **Visual primeiro** — barras e totais; tabela densa só no detalhe.
4. **Não poluir o Hoje** — 1 card resumo + CTA “+ comida”; diário completo em `/nutricao`.
5. **Nav = sidebar** — Nutrição em **Ferramentas** (secondary), **não** no primary Hoje·Tarefas·Falar·Revisar (regra nav 2026-07-09).
6. **Cálculo confiável** — 4 kcal/g P e C, 9 kcal/g G; meta kcal ≈ 4P+4C+9G (aviso se divergir >5%).
7. **Ship por fase** — cada fase fecha com `prepush:check` + push + `ship:api` se API + `deploy:prod` + smoke do endpoint novo.
8. **Feature flag** — `nutrition_enabled` em settings (default on pra João single-user; fácil desligar UI se regredir).

---

## 4. Escopo

### In scope (produto “bom o bastante”)

- Meta diária: kcal + proteína + carbo + gordura (g); opcional fibra / carbo líquido.
- Perfil: peso, altura, idade, sexo, atividade, objetivo (perder / manter / ganhar) → **sugestão** de meta (editável).
- Catálogo pessoal de alimentos (por porção ou por 100 g).
- Refeições salvas (ex.: “almoço padrão cut”) = soma de alimentos.
- Diário do dia: slots Café / Almoço / Lanche / Jantar / Outro.
- Log por: busca no catálogo, recente, favorito, quantidade × porção.
- Totais do dia + barras % meta.
- Histórico por dia + totais na revisão semanal (média P/C/G, dias com log).
- Entrada rápida texto (fase depois): “150g frango 100g arroz”.
- Seed BR enxuto (arroz, frango, ovo, whey, azeite, banana…) — dezenas, não milhões.

### Out of scope (proposital v1–v1.5)

- Scanner de código de barras (fase opcional no fim).
- Open Food Facts online como dependência obrigatória.
- Foto do prato → IA.
- Sync Garmin/Fitbit.
- Micronutrientes completos (Cronometer).
- Social / amigos / ranking.
- Multi-usuário / coach de alunos (isso é outro PRD Jota Fit).
- Anúncios / freemium.

---

## 5. UX alvo (simples e visual)

### 5.1 Hoje (`/`)

Card **Macros do dia** (mesmo “peso visual” da água):

- Linha: `1.820 / 2.200 kcal` + chips P · C · G com % ou g restantes.
- 4 barras horizontais finas (kcal + 3 macros), cores fixas:
  - kcal: primary
  - proteína: azul
  - carbo: âmbar
  - gordura: roxo/violeta
- Botões: **+ Comida** (abre sheet) · link texto “Ver diário”.
- Empty: “Ainda não registrou comida hoje” + 1 CTA.

**Não** empilhar formulário longo no Hoje.

### 5.2 Página `/nutricao`

Layout `PraxisPage`:

1. **Header** — data (hoje / setas dia anterior) + resumo barras grandes.
2. **Slots** — seções por refeição; cada item: nome, qtd, P/C/G, kcal; ⋯ editar/apagar.
3. **FAB / botão fixo** — + Adicionar.
4. Abas ou chips secundários: **Diário · Alimentos · Refeições · Meta**.

### 5.3 Sheet “+ Comida” (fluxo crítico)

1. Busca (debounce).
2. Atalhos: **Recentes · Favoritos · Refeições**.
3. Toque no item → stepper quantidade (0,5 / 1 / 1,5 porção ou g) → preview macros → **Salvar**.
4. Se não achar: **Criar alimento** (nome + 100 g ou porção: kcal, P, C, G) → salva no catálogo e no diário.

### 5.4 Meta

Tela simples:

- Objetivo: emagrecer / manter / ganhar.
- Campos editáveis de meta (g e kcal).
- “Calcular sugestão” a partir do perfil (mostra números; João confirma ou edita).
- Copy humana: “Sugestão com base no seu peso e objetivo — pode mudar à vontade.”

### 5.5 Mobile

- Bottom sheet para + Comida.
- Barras legíveis a 390px.
- Números `tabular-nums`.
- Sem “50 da API” / jargão na UI (regra copy Praxis).

---

## 6. Modelo de dados (SQLite)

Padrão Compras: módulo `api/nutrition.js` + `initNutritionSchema(db)` no boot.

### 6.1 `nutrition_profile` (1 linha `id='default'`)

| Campo | Tipo | Notas |
|-------|------|--------|
| sex | text | `male`/`female`/`other` |
| birth_year | int | opcional; idade derivada |
| height_cm | real | |
| weight_kg | real | atual |
| activity | text | `sedentary`…`very` |
| goal | text | `lose`/`maintain`/`gain` |
| target_kcal | int | |
| target_protein_g | real | |
| target_carbs_g | real | |
| target_fat_g | real | |
| target_fiber_g | real | opcional |
| use_net_carbs | int | 0/1 |
| updated_at | text | |

### 6.2 `food_items`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | uuid |
| name | text | “Frango peito grelhado” |
| brand | text | opcional |
| serving_label | text | “100 g”, “1 unidade”, “1 scoop” |
| serving_grams | real | nullable se porção unitária |
| kcal | real | **por serving** |
| protein_g | real | |
| carbs_g | real | |
| fat_g | real | |
| fiber_g | real | default 0 |
| is_favorite | int | 0/1 |
| source | text | `custom` / `seed` / `import` |
| status | text | `active` / `archived` |
| created_at / updated_at | text | |

### 6.3 `food_meals` (refeição salva / template)

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| name | text | “Almoço cut” |
| notes | text | |
| is_favorite | int | |
| status | text | active/archived |
| created_at | text | |

### 6.4 `food_meal_items`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| meal_id | text FK | |
| food_item_id | text FK | |
| servings | real | default 1 |
| sort_order | int | |

Macros da refeição = Σ (item × servings).

### 6.5 `food_logs` (diário)

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| date | text | `YYYY-MM-DD` |
| meal_slot | text | `breakfast`/`lunch`/`snack`/`dinner`/`other` |
| food_item_id | text | nullable se snapshot-only |
| meal_id | text | nullable (log veio de template) |
| name_snapshot | text | nome na hora do log |
| servings | real | |
| grams | real | opcional override |
| kcal | real | **snapshot** |
| protein_g / carbs_g / fat_g / fiber_g | real | snapshot |
| note | text | |
| source | text | `manual`/`meal`/`text`/`voice`/`seed` |
| created_at | text | |

**Snapshot:** ao logar, copiar macros calculados — se o alimento mudar depois, o diário histórico **não** reescreve.

### 6.6 Índices

- `food_logs(date)`, `food_items(name)`, `food_items(is_favorite)`, `food_meals(status)`.

### 6.7 Settings

- `user_settings.nutrition_enabled` INTEGER DEFAULT 1 (migration).
- Opcional: `nutrition_show_on_today` DEFAULT 1.

---

## 7. API (esboço)

Auth: igual ao resto (sessão cookie ou `FORJA_API_KEY`).

| Método | Rota | Função |
|--------|------|--------|
| GET/PUT | `/api/nutrition/profile` | perfil + metas |
| POST | `/api/nutrition/profile/suggest` | body perfil → metas sugeridas (puro cálculo) |
| GET | `/api/nutrition/foods?q=&favorites=1` | busca catálogo |
| POST | `/api/nutrition/foods` | criar alimento |
| PATCH/DELETE | `/api/nutrition/foods/:id` | editar / arquivar |
| GET/POST | `/api/nutrition/meals` | refeições salvas |
| PATCH/DELETE | `/api/nutrition/meals/:id` | |
| GET | `/api/nutrition/day?date=` | totais + logs do dia |
| POST | `/api/nutrition/logs` | adicionar log |
| PATCH/DELETE | `/api/nutrition/logs/:id` | |
| POST | `/api/nutrition/logs/from-meal` | expande meal → N logs |
| GET | `/api/nutrition/summary?from=&to=` | agregados p/ revisão |
| POST | `/api/nutrition/parse-text` | (fase 8) texto → candidatos |

**Cálculo servidor:** `scale = servings` (ou grams/serving_grams); macros = base × scale; arredondar 1 casa g / kcal inteiro na resposta UI.

**Fórmulas sugestão (backend, PT comments):**

- BMR Mifflin-St Jeor.
- TDEE = BMR × fator atividade.
- lose: TDEE×0,80; maintain: TDEE; gain: TDEE×1,10 (ajustável).
- Proteína default: ~2,0 g/kg (cut) / 1,6–1,8 maintain (editável).
- Gordura: ~0,8–1,0 g/kg.
- Carbo: resto das kcal.

UI **não** mostra nomes das fórmulas; só números e “sugestão”.

---

## 8. Front (arquivos previstos)

```
src/lib/nutrition.js          # labels PT, cores, formatMacros, meal slots
src/lib/nutritionMath.js      # client mirror de scale (opcional; prefer server)
src/api/forjaClient.js        # forjaApi.nutrition.*
src/pages/Nutricao.jsx
src/components/nutrition/
  MacroBars.jsx               # reutilizável Hoje + página
  NutritionTodayCard.jsx      # card no Dashboard
  AddFoodSheet.jsx
  FoodForm.jsx
  MealForm.jsx
  DayDiary.jsx
  NutritionMetaForm.jsx
api/nutrition.js              # schema + helpers
```

Nav: `secondaryNavItems` + rota `/nutricao` + título mobile.

Dashboard: card abaixo/acima da água (ordem a definir no design da fase 4 — default: **depois da água**).

---

## 9. Fases de implementação

**Regra:** “arrocha fase N” = só a fase N, ship completo.  
**Ship multi-fase:** opção **B** (um deploy no fim do lote) se João pedir “faz 1–3 de uma vez”.  
**Default:** 1 fase por vez.

| # | Nome | Entrega | Done quando |
|---|------|---------|-------------|
| **0** | Fundação | Schema + módulo API vazio + flag + rota placeholder `/nutricao` “em breve” **ou** só backend migrations sem UI | `GET /api/nutrition/day` 401 anônimo; 200 auth com `{totals: zero, logs:[]}`; `prepush` + ship api. **Checklist código:** `docs/PRAXIS-NUTRICAO-FASE-0.md` (P0-T01…T09) |
| **1** | Meta e perfil | PUT/GET profile + tela Meta (sem diário) + cálculo sugestão | João salva meta kcal/P/C/G; recarrega e persiste |
| **2** | Catálogo de alimentos | CRUD foods + busca + favorito + form simples (100 g ou porção) | Criar “Ovo” e “Arroz”; listar/buscar |
| **3** | Diário (core) | POST/PATCH/DELETE logs + GET day com totais + slots | Logar 2 itens no almoço; totais batem; apagar item atualiza |
| **4** | Visual Hoje + página Diário | `MacroBars`, card no Hoje, `/nutricao` diário por data | Mobile 390px: barras legíveis; + Comida sheet mínimo |
| **5** | UX rápida | Recentes, favoritos, stepper qtd, duplicar ontem (opcional), empty states bons | Fluxo ≤30 s alimento já existente |
| **6** | Refeições salvas | Meals + from-meal + UI “salvar seleção como refeição” | 1 toque adiciona almoço cut inteiro |
| **7** | Seed BR + onboarding | ~40–80 alimentos comuns PT-BR; wizard 1ª visita (peso + objetivo → meta) | Conta nova (ou flag reset) cai em setup; seed idempotente |
| **8** | Texto / voz | `parse-text` heurístico + captura Praxis “comi X no almoço” (confirm sheet) | Áudio/texto vira candidatos; João confirma antes de gravar |
| **9** | Histórico e revisão | Calendário simples / lista dias; bloco macros em `/revisao-semanal` | Semana mostra média kcal e P e dias logados |
| **10** | Peso e tendência | Log de peso (tabela `body_weight_logs` ou wellness) + sparkline leve na Nutrição | Peso semanal visível; não vira app de antropometria |
| **11** | Polish produto | Copy, motion leve, a11y barras, smoke E2E nutrition, checklist, nota de produto | `smoke` cobre day+log; doc `ONDA-NUTRICAO` ou fechamento no plano |
| **12** | Opcional barcode | Integração OFF **opt-in** (rede); cache local do produto | Só se João pedir depois de usar 2+ semanas o core |

### Dependências entre fases

```
0 → 1 → 2 → 3 → 4 → 5
              ↘ 6 (pode paralelizar após 3)
4 → 7 (seed melhora 5)
5 → 8
3 → 9
1 → 10 (peso)
11 fecha qualidade
12 só sob pedido
```

**MVP usável de verdade:** fases **0–5** (idealmente + **6** refeições).  
**MVP “bom visual diário”:** **0–6**.  
**“Parecido com Macros free no dia a dia”:** **0–9**.  
**Clone ambicioso:** +12.

---

## 10. Critérios de aceite (MVP 0–5)

1. Definir meta e ver barras no Hoje em 0%.
2. Cadastrar alimento custom em &lt;1 min.
3. Registrar refeição com 3 itens e ver P/C/G atualizar na hora.
4. Editar quantidade e apagar item sem bug de total.
5. Trocar de dia (ontem) e voltar sem misturar logs.
6. Offline: se React Query falhar, empty honesto (não inventar totais).
7. Auth: rotas nutrition 401 sem sessão.
8. Copy: zero “TDEE/BMR/API” na interface.

---

## 11. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Poluir o Hoje | 1 card compacto; detalhe em `/nutricao` |
| Scope creep barcode/IA | Fases 12 e foto **fora** até pedido explícito |
| Base de alimentos infinita | Seed pequeno + custom; sem scraping |
| Macros não batem kcal | Validação na criação do alimento + normalizar no server |
| Água vs macros confusão | Água fica; macros é card separado |
| Água ainda em localStorage | Fora deste PRD (débito separado); não bloquear nutrition API |
| Multiplicar código dashboard | `MacroBars` compartilhado; não copiar WaterTracker |
| Deploy só front / só API | Ship rule Praxis: api → `ship:api`; front → `deploy:prod` + alias |

---

## 12. Métricas de confiança (pós-ship)

Não são analytics SaaS — checklist do João:

1. 7 dias com ≥1 log.
2. ≥5 alimentos custom ou seed usados de verdade.
3. ≥1 refeição salva reutilizada 3×.
4. Card do Hoje não atrapalha Agora (feedback subjetivo).

---

## 13. Relação com o que já existe

| Existe | Uso |
|--------|-----|
| Hábitos quantitativos | **Não** reusar como diário de comida (modelo errado). Água pode continuar hábito/card. |
| `wellness_checks` | Humor/sono; peso pode viver em tabela própria ou wellness estendido na fase 10. |
| Captura voz / webhook | Fase 8: classificar intent comida → nutrition parse. |
| Revisão semanal | Fase 9: seção macros no insight. |
| Gamificação | Opcional depois: XP por “dia com proteína ≥ meta” — **não** no MVP. |
| Compras | Padrão de módulo secondary nav + `api/*.js`. |

---

## 14. Ordem de leitura para implementar

1. Este doc.
2. `references/praxis-compras-wishlist.md` (padrão módulo).
3. `references/praxis-nav-sidebar-tools.md` (secondary).
4. `references/praxis-ui-copy-hygiene.md`.
5. `references/praxis-plan-phases-before-code.md` + ship A/B.
6. `WaterTracker.jsx` / Lote 8 água — referência visual de barra + linguagem humana.

---

## 15. Comandos de ship (por fase que toca API)

```bash
cd apps/forja-do-jota
npm run prepush:check
git add -A && git commit -m "feat(praxis): nutrition fase N — …"
git push origin main
# se api/:
npm run ship:api
npm run deploy:prod
# alias canônico se deploy:prod não aliasar
# smoke: login + GET /api/nutrition/day
```

---

## 16. Decisões abertas (defaults se João não escolher)

| Decisão | Default do plano |
|---------|------------------|
| Nome na UI | **Nutrição** (label); subtítulo “Macros do dia” |
| Rota | `/nutricao` |
| Carbo líquido | off por default; toggle na Meta |
| Unidade | g e kcal (sem oz) |
| Refeição default do sheet | slot por horário (manhã=café, etc.) com override |
| Seed | sim na fase 7, não bloquear 2–5 |
| Barcode | só fase 12 sob pedido |

---

## 17. Resumo executivo

| | |
|---|---|
| **Fases totais** | **12** (0–11 core+polish; 12 opcional barcode) |
| **MVP diário bom** | **0–6** (fundação → refeições salvas + visual) |
| **Esforço relativo** | Médio-alto (novo domínio de dados); padrão técnico já existe na Praxis |
| **Próximo passo** | João: “arrocha fase 0” **ou** “arrocha MVP 0–5 ship B” **ou** ajuste de escopo |

**Não implementar até João disparar fase.**
