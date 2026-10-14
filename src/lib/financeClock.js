/** Datas e horas de Finanças no fuso de Fortaleza (chips do banco e do Midas). */

const STAMP_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Fortaleza',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(STAMP_FORMAT.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "14/10 15:59" */
export function fortalezaStamp(iso) {
  const p = parts(iso);
  return p ? `${p.day}/${p.month} ${p.hour}:${p.minute}` : null;
}

/** "15:59" */
export function fortalezaClock(iso) {
  const p = parts(iso);
  return p ? `${p.hour}:${p.minute}` : null;
}

/** "Atualizado pelo Midas às 18:40" hoje; com a data quando foi outro dia. */
export function midasLabel(sync, now = new Date()) {
  const iso = sync?.finished_at || sync?.started_at;
  const p = parts(iso);
  if (!p) return 'Midas ainda não atualizou';
  const today = parts(now);
  const sameDay = today && today.day === p.day && today.month === p.month;
  return sameDay
    ? `Atualizado pelo Midas às ${p.hour}:${p.minute}`
    : `Atualizado pelo Midas em ${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}
