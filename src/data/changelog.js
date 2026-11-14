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
    id: '2026-11-14-hoje-habitos-tarefas',
    date: '2026-11-14',
    title: 'Hoje, Hábitos e Tarefas mais curtos',
    items: [
      'A barra de baixo agora tem Hoje, Hábitos, Tarefas e Finanças. O resto continua no menu.',
      'No Hoje, a próxima tarefa e o primeiro hábito aparecem sem rolar a tela.',
      'Hábitos e Tarefas abrem direto na lista. Filtros e planejamento ficam em um botão.',
      'Hábito com quantidade só conta como feito quando bate a meta.',
      'Se algo não carregar, a tela avisa e oferece Tentar novamente, em vez de parecer vazia.',
      'O aviso de novidades espera você terminar o que está preenchendo.',
    ],
  },
  {
    id: '2026-11-13-check-do-dia',
    date: '2026-11-13',
    title: 'Concluir tarefa sem susto',
    items: [
      'Se a sessão terminar, a Praxis pede a senha uma vez, na mesma tela, e pergunta se você ainda quer concluir a tarefa.',
      'Sem conexão a tarefa não é marcada: aparece o aviso e nada fica concluído só na tela.',
      'Se a conexão cair no meio, a Praxis confere se salvou antes de avisar.',
      'Toque duplo conclui só a tarefa tocada, não a de baixo.',
      'Concluir vale inteiro: tarefa, pontos e próxima repetição juntos. A agenda sincroniza depois.',
    ],
  },
  {
    id: '2026-10-26-frentes',
    date: '2026-10-26',
    title: 'Frentes mais simples',
    items: [
      'Frentes agora em dois grupos: Dinheiro e Pessoal e estudo.',
      'Uma frente pode ficar dentro de outra. A de fora mostra quantas tem e se alguma está bloqueada.',
      'O detalhe da frente abre no próximo passo. Objetivo, bloqueio e links ficam em Mais.',
      'Quando o Sêneca não vê prioridade nova no dia, a tela diz isso com todas as letras.',
    ],
  },
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
