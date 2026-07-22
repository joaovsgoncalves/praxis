# Praxis — auditoria UI 2026-07-22

**Escopo:** feedback João (prints) — símbolo vs logo, X da notificação, partículas sumidas, bolas de brilho sem sentido.  
**Base:** worktree `apps/praxis` @ `221ab9d` + bundle prod `dopraxis.vercel.app`.  
**Não é** nota de produto / ondas. Só visual + bugs de interação.

---

## Veredito em uma frase

Cores âmbar/obsidian melhoraram; marca está **tripla** (π ≠ P-seta ≠ favicon SVG velho), toast **X morto de verdade**, partículas ainda existem mas quase invisíveis + roxo proibido, e os glows viraram bolas decorativas sem âncora.

---

## P0 — bugs / inconsistência que o João sente

### 1. Símbolo no app ≠ logo canônica

| Superfície | O que mostra | Arquivo |
|------------|--------------|---------|
| Sidebar / brand in-app | **π** dourado + bolinha | `src/components/brand/PraxisBrand.jsx` |
| Landing (filosofia) | **π** de novo | `src/pages/Landing.jsx` ~L313 |
| Favicon / PWA / `praxis-logo.png` | monograma **P + seta** metálico | `public/praxis-logo.png`, `favicon.png`, icons |
| `favicon.svg` (legado) | **P** roxo→teal + barra verde | `public/favicon.svg` |

**Efeito:** tab do browser / install PWA / share = uma marca; header do app = outra. João tem razão.

**Fix class (não cosmética de um arquivo):**
1. Definir **1** monograma canônico = o PNG (P+seta) — já é o asset de marca.
2. `PraxisBrand` renderiza `<img src="/praxis-logo.png">` ou SVG extraído do PNG, **não** `π`.
3. Regenerar `favicon.svg` no mesmo monograma + gold/obsidian (matar roxo).
4. Grep `π` / `text-domain-gold\">π` no front e alinhar landing preview.

### 2. X da notificação (toast) não fecha — bug real

Causa em código (não “sensação”):

- `src/components/ui/toast.jsx` — `Toast` / `ToastProvider` / `ToastViewport` são **`<div>` plain**, não Radix.
- `ToastClose` é `<button>` **sem `onClick`** e sem chamar `dismiss`.
- `use-toast.jsx` coloca `open` + `onOpenChange` no objeto do toast, mas o `Toast` **ignora** `open` (não esconde) e **não seta** `data-state` (classes `data-[state=open]` nunca disparam).
- `TOAST_REMOVE_DELAY = 1_000_000` ms ≈ 16 min se alguém dismissar por outro caminho.

**Prova:** clicar no X não despacha `DISMISS_TOAST`.  
**Onde o João vê:** qualquer toast (captura pronta, sucesso, erro) — “quadradinho” com X no canto.

**Fix mínimo:**
```jsx
// ToastClose
onClick={() => props.onClick?.() /* ou */ dismiss via context}
```
Ou restaurar `@radix-ui/react-toast`, **ou** no `toaster.jsx`:

```jsx
<ToastClose onClick={() => dismiss(id)} />
```

e no `Toast` não renderizar se `open === false` (e remover do DOM após animação curta, delay ~300–400ms, não 1e6).

**Nota:** X do card “Criar sua primeira meta” (`SuggestedGoalCard`) **tem** `onClick={handleDismiss}` — esse deve funcionar. O bug reportado casa com **toast**, não com promo.

---

## P1 — motion / atmosfera (o que “sumiu”)

### 3. Partículas ainda montam, mas sumiram na prática

- `AppLayout` ainda renderiza `<ParticleBackground />` (`z-0`, `opacity-30`).
- Canvas: 34 dots, raio ~0.35–1.35px, ouro **+ roxo** `rgba(148,116,205,…)` — **roxo proibido** em `DESIGN.md`.
- Body ganhou radial amber forte (`index.css` L110–113); cards `bg-card/70–0.9` cobrem o canvas.
- `EmberCanvas` (brasas subindo, bem mais visível) **existe e não é importado em lugar nenhum** — código morto.

**Por que João vê “sumiram”:** opacidade baixa + dots minúsculos + fundo novo compete + cards opacos. Não é deploy stale: bundle prod ainda tem as strings das partículas.

**Fix class:**
1. Matar roxo → só gold/ember (`hsl(var(--primary))` / 224,169,42).
2. Subir legibilidade: `opacity-45~55`, r levemente maior, ou menos partículas com glow radial (como EmberCanvas).
3. Opcional premium: trocar ParticleBackground por EmberCanvas sutil no shell (`intensity` baixo), ou híbrido.
4. Respeitar `prefers-reduced-motion` (já tem freeze estático — manter).

### 4. Duas bolas de brilho “bonitas sem sentido”

Fontes (não aleatório de bug):

| Onde | O quê |
|------|--------|
| `body` | 2 radiais fixos (topo centro amber + canto inferior escuro) |
| `HeroDay` | orb `-right-16 -top-20` amber 14% |
| `NowBlock` empty + filled | orb `right-0 top-0` / `-right-20 -top-24` |
| Landing | vários orbs grandes (ok na landing) |

No print do João (card escuro vazio + ring **0%**): o orb do `HeroDay`/`NowBlock` vira **mancha no miolo** porque o card está quase vazio e o gradient não ancora em título/CTA — parece decoração solta.

**Fix class:**
1. **No máximo 1** orb por card hero, ancorado no canto **atrás** do título/ring (não no centro visual do empty).
2. Em empty `NowBlock`, orb mais fraco (`opacity` ↓) ou só no estado com tarefa.
3. Body: 1 radial sutil no topo **ou** partículas — não os dois competindo no mesmo peso.
4. Não copiar o mesmo orb em Hero + Agora + body (triplo glow = “sem sentido”).

---

## P2 — polish residual (mesmo lote se for shipar)

| Item | Notas |
|------|--------|
| Toast UI | `opacity-0` no X até hover — no mobile quase invisível; deixar sempre visível em touch |
| Toast duration | 1e6ms é absurdo; default 4–6s + swipe |
| `favicon.svg` vs png | index usa png `?v=4`; SVG stale confunde quem abre direto |
| Progress ring 0% | visual ok; orb ao lado grita mais que o ring — hierarquia invertida no empty day |
| Cores | commit `221ab9d` deixou Hoje mais âmbar — **acerto**; não reabrir rebrand |

---

## O que **não** está quebrado (pra não caçar fantasma)

- Partículas **não** foram removidas do layout (ainda no `AppLayout`).
- Alias prod serve bundle atual com Hero/Now amber + brand mark CSS.
- SuggestedGoal / PWA banner X têm handler.
- Dialog/Sheet Radix X deve fechar (outro stack).

---

## Lotes sugeridos (se João mandar arrocha)

### Lote A — confiança (ship rápido)
1. ToastClose + dismiss + open hide + duration sane  
2. PraxisBrand + landing π → logo P-seta  
3. favicon.svg alinhado + bump `?v=`

### Lote B — atmosfera
1. Particles gold-only + legível **ou** EmberCanvas no shell  
2. Unificar orbs Hero/Now/body (1 sistema)  
3. Empty day: glow subordinado ao ring/título

### Lote C — só se sobrar
- Dead code EmberCanvas se não usar  
- Toast mobile X always-on  
- Microcopy toast PT se ainda genérico

---

## Evidência

- Brand π: `PraxisBrand.jsx` L26  
- Logo P-seta: `public/praxis-logo.png` (vision)  
- Toast X morto: `toast.jsx` L63–74 sem onClick; `toaster.jsx` L26  
- Particles: `ParticleBackground.jsx` + `AppLayout.jsx` L25; prod bundle contém `rgba(224, 169, 42` e `rgba(148, 116, 205`  
- EmberCanvas orphan: só definição em `EmberCanvas.jsx`  
- Orbs: `HeroDay.jsx` L66, `NowBlock.jsx` L23/L75, `index.css` body L110–113  

**URL checada:** `https://dopraxis.vercel.app/` HTTP 200, asset `index-CM0sGf_6.js`.
