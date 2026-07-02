#!/usr/bin/env bash
# Brief semanal Praxis — chama a API local (automação / cron).
# Uso: FORJA_API_KEY=... ./scripts/praxis-weekly-brief.sh [YYYY-MM-DD opcional = qualquer dia da semana]
set -euo pipefail

PORT="${FORJA_PORT:-18556}"
BASE="http://127.0.0.1:${PORT}"
DATE_ARG="${1:-}"

if [[ -z "${FORJA_API_KEY:-}" ]]; then
  echo "FORJA_API_KEY não definido (Bearer na API Praxis)." >&2
  exit 1
fi

QS=""
if [[ -n "$DATE_ARG" ]]; then
  QS="?week_start=${DATE_ARG}"
fi

curl -sf -H "Authorization: Bearer ${FORJA_API_KEY}" "${BASE}/api/insights/weekly${QS}" \
  | node -e "
const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
console.log('Praxis — semana', d.week_start, '→', d.week_end);
console.log('Vitórias:', d.victories?.tasks_completed_count, 'tarefas;', d.victories?.habits_completion_pct+'%', 'hábitos');
console.log('Padrões:', d.patterns?.summary);
console.log('Gargalos:', d.bottlenecks?.summary);
console.log('Prioridades:');
(d.suggested_priorities||[]).forEach((p,i)=>console.log(' ',i+1+'.',p));
"