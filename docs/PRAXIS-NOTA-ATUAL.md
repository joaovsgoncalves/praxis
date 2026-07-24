# Praxis — nota de produto (atual)

**Data:** 2026-07-24  
**HEAD:** `ca7ff9a` — `fix(focus): persist active session so leaving Foco can resume`  
**Prod:** https://dopraxis.vercel.app · deploy Ready 2026-07-22 21:11 UTC  
**Evidência:** `npm run smoke:prod` **completo OK** (2026-07-24, VPS) + health/backup-meta vivos  
**Status narrativo:** `docs/ONDE-ESTAMOS.md` (mesma data; se divergir do git/prod, confia no git/prod)

---

## Notas (duas leituras)

| Leitura | Nota | Quando usar |
|---------|------|-------------|
| **Técnica / operação** | **9,7 / 10** | Smoke E2E completo + nutrition smoke + backup hoje + CI verde no HEAD |
| **Confiança no dia a dia** | **8,9 / 10** | Produto no ar e correções recentes de honestidade (lista/foco/hábitos); 9,5+ ainda pede **hábito teu** no celular |

**Uma frase:** ops e código de produção estão sólidos; o teto agora é **uso real + marca/DNS**, não “falta onda N”.

---

## Por dimensão

| Dimensão | Nota | Evidência |
|----------|------|-----------|
| **Clareza do dia (Hoje)** | 9,3 | Agora first (lotes 9–10); hero hora + linha estoica; outcomes Não rolou / Não hoje |
| **Hábitos & tarefas** | 9,4 | Lista operacional com abertas futuras; editar no ritual + `preferred_time`; delete AlertDialog; E2E task/recurrence |
| **Auth & confiança** | 9,1 | Login prod 200; tasks anônimo 401; webAuth on |
| **UX / marca Praxis** | 8,9 | P+seta ouro, favicon legível, partículas/toast; ainda dark premium, não “app genérico AI” no miolo |
| **Voz & captura** | 9,2 | E2E `POST /api/captures` → transcribed; fallback browser no código |
| **Foco** | 9,0 | Wall-clock + persistência `localStorage` ao sair da aba; ring centrado — fora do smoke automatizado de timer |
| **Revisão / metas / insights** | 9,2 | `/api/insights/weekly` + avoidance 200 no smoke |
| **Nutrição** | 9,3 | Smoke nutrition completo (day/log/weight/barcode OFF/parse-text) |
| **Operação** | 9,8 | Backup 2026-07-24; health cron; CI success no HEAD; prepush/smoke path |
| **Design system (código)** | 8,9 | Lotes 7–10 + brand/motion 22/07; audits em `docs/PRAXIS-DESIGN-AUDIT-*.md` |
| **Experiência visual no uso** | 8,4 | Melhor que nota de 09/07; celular real + Ctrl+F5/PWA reinstall ainda mandam na percepção |

---

## Design (não misturar com nota de produto)

- Audits: `docs/PRAXIS-DESIGN-AUDIT-2026-07-16.md`, `docs/PRAXIS-DESIGN-AUDIT-2026-07-22-marca-motion-toast.md`  
- Design **não** vira 9,5+ só com ship: precisa respirar estável no **teu** celular e DNS/marca canônica se importar pra ti.

---

## Confiança 9,5+ (só uso — não é task de código)

1. ~14 dias no celular como app principal do dia  
2. Revisão semanal de verdade  
3. Pelo menos 1 gravação **tua** de voz no app  

---

## Smoke / checklist (2026-07-24)

```text
smoke:prod → completo OK
  front 200 + bundle Agora
  health 200 · tasks 401 anon · login 200
  weekly · avoidance · captures pending-count · backup-meta
  nutrition full (incl. barcode OFF)
  E2E task + recurrence + capture transcribed
backup-meta last → 2026-07-24T03:15:01Z · source praxis.db
CI (GitHub) → success no push ca7ff9a
```

`dopraxis.app` apex: **não resolve** (não conta como regressão de app; é DNS/compra).

---

## Comandos

```bash
cd apps/praxis
git log -1 --oneline
npm run smoke:prod
npm run checklist:10
```
