# Praxis Treinos V2 — logbook + elástico (plano)

**Direção:** A (tabela logbook) + chips de elástico do C · freio visual B (quieto)  
**North-star:** `docs/design-direction/treinos-v2/dir-A-logbook.png` (+ C ref elástico)  
**Base:** V1 shipped `WorkoutSessionView` + `api/workouts.js` — **evoluir, não reescrever**  
**Data:** 2026-07-24

## Critério de pronto

1. Em sessão ativa, cada série aparece em **tabela** `# | reps | carga | ✓/apagar`.
2. Carga = **kg** (weight_reps) **ou** **elástico** (calistenia/reps) com chips: nenhum · leve · médio · forte · (opcional cor se couber no enum).
3. Prefill da próxima série com último treino **incluindo elástico**.
4. Não forçar kg em exercício `reps` puro; não esconder reps.
5. Polish Praxis quieto: sem glow confete; ouro só CTA/progresso; hit targets ~44px; `tabular-nums`.
6. Testes API de set com band passam; `prepush:check`; push + ship api + deploy + grep bundle.

## Fora deste lote

- Gráficos de progressão / PRs
- GIFs de exercício
- Vincular hábito
- RPE/RIR (pode vir depois no mesmo row)
- Redesign completo de Programa/Histórico (só o necessário se quebrar)

## Dados / API

| Campo | Onde | Notas |
|-------|------|--------|
| `band_level` | `workout_session_sets` | `null \| none \| light \| medium \| heavy` (PT na UI: nenhum/leve/médio/forte) |
| migrate | `ensureWorkoutSchema` | `ALTER` idempotente se coluna faltar |
| POST add set | body aceita `band_level` | validar enum; permitir com `reps` |
| GET session | sets já `SELECT *` | passa o campo |
| previous_sets | mesmo | prefill `band_level` |
| tracking | manter `reps` / `weight_reps` / … | UI: se `weight_reps` → kg; se `reps` → elástico opcional; se ambos fizer sentido no custom, mostrar o relevante |

Opcional leve (se barato): `equipment` no exercício já existe — não bloquear.

## UI sessão (`WorkoutSessionView.jsx`)

1. **Header** enxuto: back · nome dia · timer · % (já existe; limpar ruído).
2. **Chips de exercício** (já existe) — manter.
3. **Bloco exercício:** título + alvo + “Última: …” numa linha.
4. **Tabela de séries** (núcleo A):
   - header sticky leve: `#` · `Reps` · `Kg` ou `Elástico` · ação
   - rows completas: valores + trash
   - **row de entrada** no fim: inputs inline + botão check “Registrar”
5. **Chips elástico** na row de entrada quando tracking ∈ `reps` (e opcionalmente weight_reps se quiser anotar band+kg depois — **V2: só reps** pra não confundir).
6. Rest timer card — manter comportamento.
7. Footer: Finalizar / Encerrar — hit area ok.

## Lib

- `formatSetResult`: incluir elástico PT se `band_level`
- labels `BAND_LEVELS` em `src/lib/workouts.js`
- `initialSetForm`: prefill `band_level`

## Testes

- `api/workouts.test.mjs`: add set com `band_level: 'medium'` + reps; reject enum inválido
- Ajustar e2e só se seletor quebrar (smoke manual browser se der)

## Ship

```text
npm run test:workouts
npm run prepush:check
git commit + push main
npm run ship:api + systemctl restart praxis-api|forja-api
npm run deploy:prod + alias dopraxis.vercel.app
grep bundle + smoke:prod parcial/completo
```

## Ordem de execução

1. Schema + API + testes  
2. lib format  
3. UI tabela + chips  
4. prepush + ship  

## Não esquecer

- [ ] João Image2 A+C elástico  
- [ ] Não inventar tracking type novo se `band_level` no set bastar  
- [ ] Copy PT simples (Elástico, não “accommodation load”)  
- [ ] Committer canônico João  
- [ ] Alias canônico pós-deploy  
