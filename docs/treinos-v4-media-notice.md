# Treinos V4 — Aviso de Mídia, Licenciamento e Arquitetura

**Data:** 2026-08-22  
**Referência / PRD:** [PLANO-PRAXIS-TREINOS-V4-OPENGYM.md](./PLANO-PRAXIS-TREINOS-V4-OPENGYM.md)  
**Status:** Fase 0 (Scaffold & Governança de Mídia)

---

## 1. Mídia e Licenciamento (Modo A — CDN)

O Treinos V4 consome metadados e mídia do dataset público [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset):

- **Metadados (JSON):** Licenciados sob **MIT License** (`data/exercises.json`), contendo nomes de exercícios, categorização anatômica (`body_part`, `target`, `secondary_muscles`), instruções passo a passo e paths de mídia.
- **Mídia (Imagens e GIFs animados):** **© Gym visual** ([gymvisual.com](https://gymvisual.com/)). A redistribuição no dataset foi autorizada para fins de referência. O uso em produto pessoal obedece aos termos do autor.
- **Atribuição obrigatória:** Em qualquer interface com exibição de mídia do catálogo, a string de atribuição canônica deve estar visível:
  ```text
  © Gym visual — https://gymvisual.com/
  ```

---

## 2. Decisões Arquiteturais e Restrições de Git

1. **Zero Binários no Git:** Nenhum arquivo `.gif`, `.jpg`, `.png` ou `.mp4` do catálogo (~140 MB) deve ser commitado no repositório Git da Praxis. O banco de dados armazena apenas paths relativos (`thumb_path`, `gif_path`) e URLs resolvidas.
2. **Modo A (CDN Default):**
   - **Thumbnails:** `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/`
   - **GIFs Animados:** `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/`
3. **Isolamento de Código AGPL:** O projeto openGym serviu apenas de inspiração conceitual e de UX. Todo o código frontend e backend da Praxis foi e continuará sendo implementado do zero, de forma limpa e independente (MIT-clean).

---

## 3. Feature Flag

O Treinos V4 opera sob a feature flag `VITE_TREINOS_V4`:

```bash
# Habilitar recursos V4 localmente ou em preview (.env / .env.local)
VITE_TREINOS_V4=1
```

- **Padrão:** Desativado (`false` ou unset) até a entrega das interfaces das fases subsequentes.
- **Helper de leitura:** `src/lib/workouts/featureFlags.js` (`isTreinosV4Enabled()`).

---

## 4. Vocabulário Muscular Canônico (18 Músculos)

A anatomia canônica do Treinos V4 é ordenada da cabeça aos pés:

| ID Canônico | Label PT-BR | Principais Aliases Dataset / Sinônimos |
|-------------|-------------|----------------------------------------|
| `trapezius` | Trapézio | `traps`, `neck`, `levator scapulae`, `sternocleidomastoid` |
| `deltoids` | Deltoides | `delts`, `shoulders`, `rear deltoids`, `rotator cuff` |
| `chest` | Peitoral | `pecs`, `pectorals`, `upper chest`, `lower chest` |
| `upper-back` | Dorsal | `lats`, `latissimus dorsi`, `rhomboids`, `upper back`, `back` |
| `serratus` | Serrátil | `serratus anterior` |
| `biceps` | Bíceps | `brachialis` |
| `triceps` | Tríceps | `tricep` |
| `forearm` | Antebraço | `forearms`, `lower arms`, `wrists`, `wrist flexors`, `grip muscles` |
| `abs` | Abdômen | `abdominals`, `core`, `lower abs`, `waist` |
| `obliques` | Oblíquos | `side abs` |
| `lower-back` | Lombar | `spine`, `erector spinae`, `lower back` |
| `gluteal` | Glúteos | `glutes`, `abductors`, `gluteus maximus`, `buttocks` |
| `quadriceps` | Quadríceps | `quads`, `upper legs`, `thighs` |
| `hamstring` | Posteriores | `hamstrings`, `rear thighs`, `biceps femoris` |
| `adductors` | Adutores | `groin`, `inner thighs` |
| `hip-flexors` | Flexores de quadril | `hip flexors`, `iliopsoas`, `psoas` |
| `calves` | Panturrilhas | `soleus`, `gastrocnemius`, `lower legs`, `ankles` |
| `tibialis` | Tibial | `shins`, `tibialis anterior` |
