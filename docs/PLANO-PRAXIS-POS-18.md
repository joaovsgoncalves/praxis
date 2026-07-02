# Plano Praxis — evolução pós-18 (8,7 → 9,5+)

**Base:** auditoria `docs/AUDITORIA-PRAXIS-2026-07-02.md` (técnica **9,2**, confiança **8,7**).  
**Ondas 0–18:** fechadas. Este doc é a **continuação** — só começa quando você mandar **“onda 19”**, etc.

**Norte:** menos surpresa no dia a dia (voz, API, celular) + menos ruído na lista + operação que se auto-prova.

---

## Duas metas (não confundir)

| Meta | Hoje | Alvo | Quem faz |
|------|------|------|----------|
| **Técnica** | 9,4 | 9,5+ | Código + smoke + ops (ondas 20–21) |
| **Confiança** | 8,7 | 9,5+ | **Você** usa 14 dias + revisão semanal + 1 voz real |

Sem a linha “Confiança”, nota alta é só no papel.

---

## Mapa: gap da auditoria → onda

| Gap | Onda que ataca |
|-----|----------------|
| Smoke não testa voz / recorrência | **19** |
| Watchdog health sem cron | **20** |
| Dois URLs Vercel (`praxis-jota` + `forja-do-jota`) | **20** |
| Voz nota 7,8 (fila ok, UX/feedback fraco) | **21** |
| Mobile/PWA sem prova automatizada | **19** (smoke leve) + uso seu |
| Lista inchada / atrasadas (conteúdo) | **22** |
| Metas/rituais pouco usados | **23** |
| Captura fora do app (Telegram, etc.) | **24** (só se pedir) |

---

## Fase 0 — Uso (zero código, 2 semanas)

Faz **antes** ou **em paralelo** à onda 19. Não tem commit.

| # | Ação | Pronto quando |
|---|------|----------------|
| U1 | Abrir Praxis no **celular** todo dia útil | 10 dias de 14 |
| U2 | **Revisão semanal** 1× (domingo ou segunda) | 2 semanas seguidas |
| U3 | **1 gravação de voz** → texto ou `/capturas` | Você viu o resultado |

Marca no calendário. Isso sozinho pode levar confiança para **~9,0** se não quebrar nada.

---

## Onda 19 — Smoke “de verdade” (confiança técnica)

**Meta:** deploy quebrado ou API mentindo fica **impossível** passar no CI.

| ID | Entrega | Critério done |
|----|---------|----------------|
| P19-T01 | Smoke: criar tarefa + concluir + apagar | **done** |
| P19-T02 | Smoke: recorrência + `next_occurrence` | **done** |
| P19-T03 | Smoke: POST captura fixture WAV | **done** |
| P19-T04 | Smoke: GET captures + pending-count | **done** |
| P19-T05 | Doc `ONDA-19-SMOKE.md` | **done** |

Ver `docs/ONDA-19-SMOKE.md`. **Nota:** técnica **9,4** · voz **~8,5**.

---

## Onda 20 — Operação à prova de burrice

**Meta:** API cai → você sabe; link único; API = repo.

| ID | Entrega | Critério done |
|----|---------|----------------|
| P20-T01 | Cron health + `install-praxis-health-cron.sh` | **done** |
| P20-T02 | Redirect `forja-do-jota` → `praxis-jota` | **done** |
| P20-T03 | `npm run ship:api` + drift no checklist | **done** |
| P20-T04 | Discord no smoke | **fora** |

Ver `docs/ONDA-20-OPERACAO.md`. Operação **~9,6**.

---

## Onda 21 — Voz que não te deixa na mão

**Meta:** nota voz **8,5 → 9,0** no uso real.

| ID | Entrega | Critério done |
|----|---------|----------------|
| P21-T01 | Tela captura: estados claros (gravando / enviando / transcrevendo / falhou) | Copy PT, sem spinner genérico |
| P21-T02 | Toast ou badge quando STT termina em background (poll `pending-count`) | Dashboard reage |
| P21-T03 | `/capturas`: retry em 1 toque + mensagem **por que** falhou (timeout, sem áudio, STT) | Sem “erro genérico” |
| P21-T04 | Limite de tamanho/duração áudio com mensagem antes do upload | Menos fila zumbi |

---

## Onda 22 — Lista e atrasadas (conteúdo, não só UI)

**Meta:** cockpit não afoga em lixo antigo.

| ID | Entrega | Critério done |
|----|---------|----------------|
| P22-T01 | Ação “**Arquivar atrasadas**” (> N dias) com confirmação | Bulk API existente ou novo endpoint |
| P22-T02 | Filtro rápido Hoje / Atrasadas / Sem data na lista tarefas | Já parcial; unificar UX |
| P22-T03 | Dashboard: link “ver todas atrasadas” → filtro pronto | 1 clique |
| P22-T04 | Doc curto: quando usar arquivar vs concluir | `docs/PRAXIS-LISTA-LIMPA.md` |

**Nota esperada:** hábitos/tarefas **9,2**.

---

## Onda 23 — Metas e rituais úteis (não decoração)

**Meta:** nav condicional **vale** porque você usa.

| ID | Entrega | Critério done |
|----|---------|----------------|
| P23-T01 | Wizard meta: sugerir **1 meta ativa** se zero (template RCA / Encarte / corpo) | Opcional dismiss |
| P23-T02 | Ritual abertura 3 min no **Hoje** (card colapsável) | 1 preset default |
| P23-T03 | Revisão semanal: botão “criar 3 tarefas da semana” a partir do insight | Reduz fricção pós-wizard |

---

## Onda 24 — Entrada rápida (futuro)

Só se fizer sentido depois do EncarteZap estável.

| ID | Ideia |
|----|--------|
| P24-T01 | Webhook ou bot Telegram → fila `capture_queue` (texto) |
| P24-T02 | Compartilhar para Praxis (mobile share target PWA) |

**Não priorizar** enquanto Praxis ainda não estiver 9,5 na confiança.

---

## Ordem recomendada (ROI)

```
Fase 0 (uso)     ─────────────────────────────►  paralelo sempre
     │
     ▼
Onda 19 (smoke)  ──►  Onda 20 (ops)  ──►  Onda 21 (voz)
     │                                      │
     └──────────────►  Onda 22 (lista) ◄────┘
                           │
                           ▼
                    Onda 23 (metas/rituais)
                           │
                           ▼
                    Onda 24 (se pedir)
```

**Por quê:** 19 evita regressão; 20 evita “app morto”; 21 ataca o pior nota (voz); 22 ataca o que você **vê** todo dia; 23 aumenta valor sem feature nova gigante.

---

## Notas-alvo após cada bloco

| Depois de | Técnica | Confiança (se Fase 0 ok) |
|-----------|---------|---------------------------|
| Só Fase 0 | 9,2 | ~9,0 |
| 19 + 20 | 9,5 | ~9,1 |
| + 21 | 9,5 | ~9,3 |
| + 22 + 23 | 9,6 | **9,5+** |

---

## Como disparar (igual antes)

- **“onda 19”** → só P19-T01…T05  
- **“arrocha 19 e 20”** → duas ondas no mesmo ciclo ship (commit + push + smoke + API se precisar)  
- **“só plano, não codar”** → este doc basta  

Atualizar `docs/PRAXIS-NOTA-ATUAL.md` após cada onda entregue.

---

## Fora do escopo (proposital)

- Multi-usuário / times  
- Substituir SQLite por Postgres  
- IA em tudo (PraxIA continua **espelho**, não dono da agenda)  
- EncarteZap dentro do Praxis  

---

*Criado 2026-07-02 · pós-auditoria · continuação de `PLANO-IMPLEMENTACAO-PRAXIS.md`*