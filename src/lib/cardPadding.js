/**
 * Padding padrão do CardContent, por lado.
 *
 * O default antigo (`p-5 pt-0 sm:p-6 sm:pt-0`) quebrava quando o card não tinha header e
 * passava `p-5`: o tailwind-merge removia `p-5 pt-0`, mas mantinha `sm:p-6 sm:pt-0`
 * (variante diferente), e no desktop o conteúdo encostava no topo.
 *
 * Aqui cada lado tem base + `sm:`; o `sm:` de um lado sai quando o consumidor define esse
 * lado sem prefixo. Sem padding próprio, o resultado é o mesmo de antes.
 */
const CONTENT_SIDES = {
  t: ['pt-0', 'sm:pt-0'],
  b: ['pb-5', 'sm:pb-6'],
  x: ['px-5', 'sm:px-6'],
};

const SIDES_BY_PREFIX = {
  p: ['t', 'b', 'x'],
  py: ['t', 'b'],
  px: ['x'],
  pt: ['t'],
  pb: ['b'],
};

function sidesSetBy(className) {
  const sides = new Set();
  for (const token of String(className || '').split(/\s+/)) {
    const match = /^(p|py|px|pt|pb)-/.exec(token);
    if (!match) continue;
    for (const side of SIDES_BY_PREFIX[match[1]]) sides.add(side);
  }
  return sides;
}

export function cardContentPadding(className) {
  const own = sidesSetBy(className);
  const classes = [];
  for (const [side, [base, responsive]] of Object.entries(CONTENT_SIDES)) {
    classes.push(base);
    if (!own.has(side)) classes.push(responsive);
  }
  return classes.join(' ');
}
