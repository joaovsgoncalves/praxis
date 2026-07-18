# Praxis Nutrição — Fase 0 (checklist de código)

**Status:** done (2026-07-09)  
**PRD:** `docs/PLANO-PRAXIS-NUTRICAO-MACROS.md`  
**Taskflow:** `brains/ana-brain-core/taskflow/tasks/2026-07-09-praxis-nutricao-macros.md`  
**Padrão a copiar:** `api/purchaseList.js` + rotas Compras em `api/server.js` + `/compras` no front

---

## Objetivo da fase 0

Fundação **sem produto de macros ainda**: schema SQLite, módulo API, 2–3 rotas stub, flag em settings, página placeholder `/nutricao` na sidebar.  
João **não** registra comida nesta fase — só infraestrutura testável.

**Done quando:**

1. `GET /api/nutrition/day` → **401** anônimo  
2. Com login/`FORJA_API_KEY` → **200** e JSON vazio válido  
3. `GET /api/nutrition/profile` autenticado → **200** (defaults)  
4. UI: `/nutricao` abre com empty “em breve” (sem crash)  
5. Nav secondary: **Nutrição** visível  
6. `prepush:check` + push `main` + `ship:api` + `deploy:prod` (+ alias se preciso)

---

## Fora da fase 0

- CRUD alimentos / logs reais  
- Card no Hoje / barras  
- Cálculo TDEE / sugestão de meta  
- Seed de alimentos  
- Smoke E2E completo de nutrition (só checks manuais + 401/200 day)  
- Barcode, voz, revisão semanal  

---

## Tasks (ordem de implementação)

### P0-T01 — Módulo `api/nutrition.js`

| | |
|---|---|
| **Arquivo** | `apps/forja-do-jota/api/nutrition.js` (novo) |
| **Fazer** | Espelhar estilo `purchaseList.js` |

Exports mínimos:

```js
export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];

export function initNutritionSchema(db) { /* CREATE TABLE IF NOT EXISTS … */ }

export function getNutritionProfile(db) { /* SELECT ou seed default row */ }

export function getDayEmpty(date) {
  // puro: retorna shape estável sem query pesada se não houver logs
}

export function listLogsByDate(db, date) { /* SELECT … ORDER BY created_at */ }

export function sumTotals(logs) {
  // kcal, protein_g, carbs_g, fat_g, fiber_g a partir dos logs (fase 0: lista vazia → zeros)
}
```

**Tabelas (todas na fase 0, mesmo sem CRUD):**

1. `nutrition_profile` — linha `id = 'default'`  
2. `food_items`  
3. `food_meals`  
4. `food_meal_items`  
5. `food_logs`  

Campos: **iguais à §6 do PRD** (`PLANO-PRAXIS-NUTRICAO-MACROS.md`).  
Índices: `food_logs(date)`, `food_items(name)`, `food_items(is_favorite)`.

**Seed de profile no init:** se não existir row default, INSERT com targets null ou zeros explícitos:

```json
{
  "id": "default",
  "goal": "maintain",
  "target_kcal": null,
  "target_protein_g": null,
  "target_carbs_g": null,
  "target_fat_g": null,
  "use_net_carbs": 0
}
```

**Aceite T01:** import do módulo não quebra node; `initNutritionSchema` idempotente (rodar 2× ok).

---

### P0-T02 — Wire no `api/server.js`

| | |
|---|---|
| **Arquivo** | `api/server.js` |

1. `import { initNutritionSchema, getNutritionProfile, listLogsByDate, sumTotals, … } from './nutrition.js'`  
2. Após `initPurchaseSchema(db)` → `initNutritionSchema(db)`  
3. Migration `user_settings`:

```js
// padrão list_density
if (!settingsCols.includes('nutrition_enabled')) {
  db.exec("ALTER TABLE user_settings ADD COLUMN nutrition_enabled INTEGER DEFAULT 1");
}
if (!settingsCols.includes('nutrition_show_on_today')) {
  db.exec("ALTER TABLE user_settings ADD COLUMN nutrition_show_on_today INTEGER DEFAULT 1");
}
```

4. Expor nos GET/PUT settings existentes os dois campos (boolean/0|1 como o resto do app).

**Aceite T02:** API sobe; colunas novas aparecem no `PRAGMA` / settings JSON.

---

### P0-T03 — Rotas stub autenticadas

| Método | Rota | Resposta 200 (auth) |
|--------|------|---------------------|
| GET | `/api/nutrition/profile` | row profile (defaults) |
| GET | `/api/nutrition/day?date=YYYY-MM-DD` | ver shape abaixo |
| GET | `/api/nutrition/health` *(opcional)* | `{ ok: true, module: 'nutrition' }` — só se ajudar debug; **não** precisa ser público |

**Shape canônico `GET /api/nutrition/day`:**

```json
{
  "date": "2026-07-09",
  "logs": [],
  "totals": {
    "kcal": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0,
    "fiber_g": 0
  },
  "targets": {
    "kcal": null,
    "protein_g": null,
    "carbs_g": null,
    "fat_g": null
  },
  "by_slot": {
    "breakfast": [],
    "lunch": [],
    "snack": [],
    "dinner": [],
    "other": []
  }
}
```

Regras:

- `date` omitido → **hoje** em timezone **America/Sao_Paulo** (mesmo padrão que o app usa em tasks/calendar; se já houver helper de “hoje”, reusar — senão `date` local VPS documentado).  
- `date` inválido → **400** `{ error: '…' }` PT ou en curto.  
- Mesma auth middleware das outras rotas `/api/*` (401 sem cookie/key).  
- **Não** implementar POST logs ainda (404 ou 501 de propósito? → **melhor não registrar rota** para não travar cliente; só GET).

**Aceite T03 (manual na VPS após ship):**

```bash
# anônimo
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18556/api/nutrition/day
# → 401

# com key
curl -s -H "Authorization: Bearer $FORJA_API_KEY" \
  "http://127.0.0.1:18556/api/nutrition/day" | jq .
# → 200 + totals zero
```

---

### P0-T04 — Client API thin

| | |
|---|---|
| **Arquivo** | `src/api/forjaClient.js` |

```js
// forjaApi.nutrition
profile: () => get('/api/nutrition/profile'),
day: (date) => get(`/api/nutrition/day${date ? `?date=${date}` : ''}`),
```

Só GET. Sem mutações.

**Aceite T04:** import build não quebra; opcional console no DevTools com login.

---

### P0-T05 — Labels / constants front

| | |
|---|---|
| **Arquivo** | `src/lib/nutrition.js` (novo) |

Conteúdo mínimo fase 0:

- `MEAL_SLOT_LABELS` PT: Café, Almoço, Lanche, Jantar, Outro  
- `MACRO_COLORS` (kcal/protein/carbs/fat) — já fixar pra fase 4 não reinventar  
- `formatKcal`, `formatGrams` helpers stub (podem ser trivial)  
- `isNutritionEnabled(settings)` → `settings.nutrition_enabled !== 0 && !== false`

**Sem** componentes visuais de barra ainda.

---

### P0-T06 — Página placeholder

| | |
|---|---|
| **Arquivo** | `src/pages/Nutricao.jsx` (novo) |
| **Rota** | `App.jsx` → `<Route path="/nutricao" element={<Nutricao />} />` |

UI:

- `PraxisPage` (mesmo padrão Compras/Ideias)  
- Título: **Nutrição**  
- Sub: “Macros e refeições do dia — em construção”  
- Card: “Fase 0: base pronta. Em breve você registra comida aqui.”  
- Opcional: se `forjaApi.nutrition.day()` 200, mostrar “API ok · 0 kcal hoje” (prova de fiação); se erro, empty honesto.

**Não** botão de adicionar comida funcional.

---

### P0-T07 — Nav + chrome mobile

| Arquivo | Mudança |
|---------|---------|
| `src/lib/praxisNav.js` | secondary: `{ path: '/nutricao', label: 'Nutrição', icon: Apple ou UtensilsCrossed }` **depois de Compras** (ou antes de Histórico) |
| `src/components/layout/MobileTopBar.jsx` | prefix `/nutricao` → title `Nutrição` |
| Drawer/Menu mobile | herda secondary — só validar que aparece |

Icon: preferir `UtensilsCrossed` ou `Apple` do lucide (já usado no projeto se existir).

**Flag:** se quiser esconder nav quando `nutrition_enabled=0`, filtrar em `filterSecondaryNav` **ou** no Sidebar com settings — **nice-to-have fase 0**; default sempre show (flag só prepara coluna).

---

### P0-T08 — Docs curtas da fase

| Arquivo | Conteúdo |
|---------|----------|
| Este doc | marcar tasks **done** na execução |
| `docs/ONDE-ESTAMOS.md` | 1 bullet “Nutrição fase 0 shipped” **só após ship** |
| Skill ref opcional | `references/praxis-nutrition-fase-0.md` **só se** a execução descobrir pitfall (não criar vazio) |

---

### P0-T09 — Ship e verificação

Ordem obrigatória:

```bash
cd apps/forja-do-jota
npm run prepush:check
git status
git add api/nutrition.js api/server.js src/api/forjaClient.js src/lib/nutrition.js \
  src/pages/Nutricao.jsx src/lib/praxisNav.js src/App.jsx \
  src/components/layout/MobileTopBar.jsx docs/PRAXIS-NUTRICAO-FASE-0.md \
  docs/PLANO-PRAXIS-NUTRICAO-MACROS.md  # se status → fase 0 in progress/done
git commit -m "feat(praxis): nutrition fase 0 — schema, API day/profile, placeholder /nutricao"
git push origin main
npm run ship:api
npm run deploy:prod
# alias canônico se necessário
```

Verificação:

| Check | Como |
|-------|------|
| API local/VPS day 401 | curl anônimo |
| API day 200 | Bearer ou cookie smoke |
| Settings tem flags | GET `/api/user/settings` |
| Front | abrir `https://praxis-jota.vercel.app/nutricao` (login) |
| Nav | sidebar Desktop + Menu mobile |
| Bundle | Ctrl+F5; se “sumiu”, alias (playbook Vercel stale) |

Smoke script: **não** é obrigatório estender `smoke-praxis-prod.sh` na fase 0; se for trivial (+10 linhas day 401/200), pode entrar — senão fase 11.

---

## Ordem sugerida no “arrocha fase 0”

```
T01 nutrition.js schema
 → T02 server init + settings cols
 → T03 rotas GET
 → T04 forjaClient
 → T05 lib/nutrition.js
 → T06 page + App route
 → T07 nav + MobileTopBar
 → T09 ship + verify
 → T08 marcar docs done
```

Estimativa: **1 sessão** (API + placeholder front), sem design polish.

---

## Riscos fase 0

| Risco | Mitigação |
|-------|-----------|
| Schema grande cedo | OK: CREATE IF NOT EXISTS; CRUD vem nas fases 1–3 |
| Timezone “hoje” errado | Reusar helper de date do server se existir; senão documentar UTC vs SP |
| Poluir primary nav | Só secondary |
| Deploy front sem API | ship:api **antes** ou no mesmo lote; placeholder tolera 401 com empty |

---

## Critério “fase 0 fechada”

Checklist mental:

- [ ] `api/nutrition.js` no repo e no host da API (drift check limpo)  
- [ ] Tabelas criadas no SQLite de produção  
- [ ] GET day/profile auth OK  
- [ ] `/nutricao` + item Nutrição no menu  
- [ ] Commit + push main  
- [ ] João consegue abrir a página sem erro  

**Próxima:** Fase 1 — perfil + metas editáveis (`P1-T*` no PRD §9).

---

## Tabela rápida de arquivos tocados

| Path | Ação |
|------|------|
| `api/nutrition.js` | **criar** |
| `api/server.js` | import, init, migrations settings, 2 GET |
| `src/api/forjaClient.js` | `nutrition.profile` / `nutrition.day` |
| `src/lib/nutrition.js` | **criar** labels |
| `src/pages/Nutricao.jsx` | **criar** placeholder |
| `src/App.jsx` | route |
| `src/lib/praxisNav.js` | secondary item |
| `src/components/layout/MobileTopBar.jsx` | title |
| `docs/PRAXIS-NUTRICAO-FASE-0.md` | este checklist |
| settings GET/PUT handlers | 2 campos novos |

---

*Não codar até João disser “arrocha fase 0”.*
