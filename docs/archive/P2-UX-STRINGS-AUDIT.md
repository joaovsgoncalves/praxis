# P2 — Auditoria UX (strings legado)

**Data:** 2026-07-02  
**Escopo:** `src/pages`, `src/components`, `index.html` (user-facing)

## Ocorrências corrigidas nesta onda

| Arquivo | Antes | Depois |
|---------|--------|--------|
| `src/pages/Ideas.jsx` | "a Forja decide…" | Praxis / você decide na revisão |
| `src/components/dashboard/HeroDay.jsx` | "dias forjando" | "dias em sequência" |
| `src/components/layout/Sidebar.jsx` | "N pro próximo" | "Faltam N XP" |
| `src/pages/Focus.jsx` | "Deep Work", "Iniciar Sessão" | "Foco profundo", "Iniciar foco de N min" |
| `src/pages/Login.jsx` | "Avise a A.N.A." | mensagem neutra |
| `src/pages/VoiceCapture.jsx` | comentário A.N.A.; copy "A IA está…" | backend Praxis; tom assistente de planejamento |
| `src/components/dashboard/GamificationWidget.jsx` | toast "Level Up!" | "Subiu de nível no Praxis" |
| `index.html` | título longo | **Praxis** |

## Mantido de propósito (interno / não UX)

- Classes CSS `forja-*`, `forjaClient.js`, `forjaApi`, prefixo `forja:offline:` no localStorage
- Eventos `forja-level-up`, `forja-confetti` (código interno)
- Comentário dev em `forjaClient.js` (não renderizado)

## Verificação pós-onda

```bash
rg -n 'Forja|A\.N\.A|forjando|Deep Work|pro próximo' src/pages src/components index.html
```

Esperado: **0** matches user-facing (comentários em `.js` de API client podem permanecer).