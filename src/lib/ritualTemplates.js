/** Presets Praxis onda 10 — espelham POST /api/rituals/from-template */

export const RITUAL_TEMPLATE_IDS = ['day_open', 'day_close'];

export const RITUAL_TEMPLATES = [
  {
    id: 'day_open',
    title: 'Abertura do dia',
    description: '3 passos leves: água, movimento, prioridade.',
    emoji: '🌅',
    period: 'Manhã',
  },
  {
    id: 'day_close',
    title: 'Fechamento do dia',
    description: 'Revisar, preparar amanhã, desligar.',
    emoji: '🌙',
    period: 'Noite',
  },
];