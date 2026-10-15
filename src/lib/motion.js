// Curvas e durações do movimento da Praxis (Emil: ease-out, UI < 300 ms, sem mola fora de gesto).
export const EASE_OUT = [0.23, 1, 0.32, 1];

/** Troca de estado comum (pílula que desliza, barra, ícone): 200 ms, ease-out. */
export const tweenFast = { type: 'tween', duration: 0.2, ease: EASE_OUT };

/** Hover/press de cartão: curto o bastante para não atrasar o toque. */
export const tweenPress = { type: 'tween', duration: 0.15, ease: EASE_OUT };
