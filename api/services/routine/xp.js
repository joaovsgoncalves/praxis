/**
 * Registro de XP por origem sobre a camada assíncrona: as mesmas contas de lib/xpEvents.js (oráculo em
 * test-support/oracles/xpEvents.bcbadad.js), em duas fases porque o Firestore exige ler tudo antes de
 * gravar e a transação recusa leitura depois de escrita:
 *
 *   plan  = leituras (soma ativa, linha 'main', evento ativo de cada origem);
 *   apply = escritas (eventos novos, estorno, espelho xp_total/level em `gamification`).
 *
 * Quem junta XP com outra gravação (tarefa concluída, conquista) faz TODAS as leituras, depois chama
 * `apply*`. O total e o nível SEMPRE saem da soma dos eventos ativos; `gamification.xp_total` é espelho.
 *
 * Diferença intencional: valor que não é inteiro seguro depois de `Math.trunc` (texto, 1e300) vira
 * `sqlite_coercion_unsupported`; a antiga gravaria NULL/REAL. A tela e o Alfred mandam inteiro.
 */
import { randomUUID } from 'node:crypto';
import { getLevel } from '../../lib/gamification.js';
import { GAMIFICATION_ID } from '../../storage/domains/phase3.js';
import { unsupported, sqlStamp } from './affinity.js';

/** `getXpTotal` da antiga: nunca negativo, nunca NaN. */
export const clampTotal = (raw) => Math.max(0, Number(raw) || 0);

/** Leituras de um lote de prêmios (`awards`: { sourceType, sourceId, amount, reason }) e/ou estornos. */
export async function planXp(tx, { awards = [], reverses = [] } = {}) {
  const raw = await tx.xpEvents.activeTotal();
  const mirror = await tx.gamification.get(GAMIFICATION_ID);
  const seen = new Set();
  const key = ({ sourceType, sourceId }) => JSON.stringify([sourceType, String(sourceId)]);
  const active = async (spec) => {
    if (seen.has(key(spec))) throw new TypeError('planXp: origem repetida no mesmo lote');
    seen.add(key(spec));
    return tx.xpEvents.findActive(spec.sourceType, String(spec.sourceId));
  };
  const items = [];
  for (const spec of awards) items.push({ kind: 'award', spec, existing: await active(spec) });
  for (const spec of reverses) items.push({ kind: 'reverse', spec, existing: await active(spec) });
  return { raw, mirror, items };
}

/**
 * Grava o plano e devolve o resultado de cada item na mesma ordem, mais o total e o nível finais.
 * award: { awarded, leveled_up? } ; reverse: { reversed }.
 */
export async function applyXp(tx, plan, { now = () => new Date(), newId = randomUUID } = {}) {
  const stamp = sqlStamp(now());
  const oldLevel = getLevel(clampTotal(plan.raw)).level;
  let raw = Number(plan.raw) || 0;
  const results = [];
  for (const { kind, spec, existing } of plan.items) {
    if (kind === 'award') {
      // Origem já ativa ou valor vazio: nada a gravar (a antiga só recalculava o espelho).
      if (existing || !spec.amount) { results.push({ awarded: 0 }); continue; }
      const amount = Math.trunc(spec.amount);
      if (!Number.isSafeInteger(amount)) throw unsupported(`XP ${typeof spec.amount} ${spec.amount} não vira inteiro`);
      await tx.xpEvents.create({
        id: newId(), source_type: spec.sourceType, source_id: String(spec.sourceId), amount,
        reason: spec.reason ?? null, created_date: stamp, reversed_date: null,
      });
      raw += amount;
      results.push({ awarded: amount });
    } else if (!existing) {
      results.push({ reversed: 0 });
    } else {
      await tx.xpEvents.reverse(existing.id, stamp);
      raw -= existing.amount;
      results.push({ reversed: existing.amount });
    }
  }
  const xp_total = clampTotal(raw);
  const level = getLevel(xp_total).level;
  if (plan.mirror) await tx.gamification.patch(GAMIFICATION_ID, { xp_total, level, updated_date: stamp });
  return { results, xp_total, level, leveled_up: level > oldLevel };
}

/** `awardXp` da antiga: { awarded, xp_total, level, leveled_up }. */
export async function awardXp(tx, spec, deps) {
  const plan = await planXp(tx, { awards: [spec] });
  const out = await applyXp(tx, plan, deps);
  const awarded = out.results[0].awarded;
  return { awarded, xp_total: out.xp_total, level: out.level, leveled_up: awarded ? out.leveled_up : false };
}

/** `reverseXp` da antiga: { reversed, xp_total, level }. */
export async function reverseXp(tx, spec, deps) {
  const plan = await planXp(tx, { reverses: [spec] });
  const out = await applyXp(tx, plan, deps);
  return { reversed: out.results[0].reversed, xp_total: out.xp_total, level: out.level };
}
