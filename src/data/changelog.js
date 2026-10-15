/*
 * Últimas atualizações da Praxis, a mais nova primeiro.
 *
 * REGRA: toda publicação nova que o usuário percebe adiciona UMA release no TOPO deste array,
 * com id novo (data + apelido curto). O diálogo "Últimas atualizações" aparece uma vez para
 * quem ainda não viu esse id. Texto em PT-BR simples, sem jargão, no máximo 6 itens,
 * só o que muda para quem usa. O teste src/lib/changelog.test.mjs confere o formato.
 */
export const changelog = [
  {
    id: '2026-10-15-hoje',
    date: '2026-10-15',
    title: 'O Hoje com suas ferramentas',
    items: [
      'O Hoje agora mostra suas ferramentas: finanças, foco, frentes, metas e revisão.',
      'Hábitos do dia viram uma linha de marcas que você toca para concluir.',
      'Semana com barras do que foi feito em cada dia.',
    ],
  },
  {
    id: '2026-10-15-evolucao',
    date: '2026-10-15',
    title: 'Praxis mais clara e mais rápida',
    items: [
      'O Hoje ficou mais curto: o que fazer agora, a trilha do dia com seus horários e os hábitos.',
      'Tarefa que ficou aberta de um dia anterior vira "não rolou" sozinha, sem pesar na lista.',
      'Desmarcar uma tarefa ou um hábito tira o XP que ele deu.',
      'Meta semanal de foco opcional, em Configurações ou no Foco.',
      'Telas carregam mais rápido e trocar de aba não pisca mais.',
      'Com "reduzir movimento" ligado no celular, a Praxis fica sem confete e sem animação.',
    ],
  },
];

export const latestRelease = changelog[0];
