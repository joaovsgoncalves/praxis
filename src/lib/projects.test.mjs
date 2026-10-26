import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRONT_STATUS_LABELS,
  GUIDANCE_REASON_LABELS,
  formatGuidanceTime,
  formatGuidanceReason,
  buildFrontsViewModel,
  findProjectForGuidancePriority,
  getGuidanceState,
  buildWhereLines,
  listParentOptions,
  summarizeChildren,
} from './projects.js';

test('FRONT_STATUS_LABELS maps columns to human readable visual labels', () => {
  assert.equal(FRONT_STATUS_LABELS.andando, 'Em curso');
  assert.equal(FRONT_STATUS_LABELS.radar, 'Depois');
  assert.equal(FRONT_STATUS_LABELS.aguardando, 'Aguardando');
  assert.equal(FRONT_STATUS_LABELS.pausado, 'Pausado');
});

test('formatGuidanceReason returns human reason or reason code label', () => {
  assert.equal(
    formatGuidanceReason({ reason: 'Entrega do cliente', reason_code: 'client_commitment' }),
    'Entrega do cliente'
  );
  assert.equal(
    formatGuidanceReason({ reason: '', reason_code: 'client_commitment' }),
    'Compromisso com cliente'
  );
  assert.equal(
    formatGuidanceReason({ reason: '', reason_code: 'deadline' }),
    'Prazo'
  );
});

test('buildFrontsViewModel separa Dinheiro de Pessoal e estudo e aninha filhas na mãe', () => {
  const sampleProjects = [
    { id: '1', slug: 'rca', name: 'RCA', kind: 'trabalho', column: 'andando' },
    { id: '2', slug: 'gofluxo', name: 'GoFluxo', kind: 'trabalho', column: 'radar' },
    { id: '3', slug: 'animalia', name: 'Animália', kind: 'cliente', parent_slug: 'gofluxo', column: 'andando' },
    { id: '4', slug: 'faculdade', name: 'Faculdade', kind: 'estudo', column: 'andando' },
    { id: '5', slug: 'praxis', name: 'Praxis', kind: 'produto', column: 'andando' },
    { id: '6', slug: 'jota-fit', name: 'Jota Fit', kind: 'pessoal', column: 'radar' },
  ];

  const guidance = {
    fresh: true,
    priorities: [
      { rank: 1, project_slug: 'praxis', action: 'Polir tela de frentes' },
      { rank: 2, project_slug: 'animalia', action: 'Revisar piloto' },
    ],
  };

  const vm = buildFrontsViewModel(sampleProjects, guidance);

  assert.deepEqual(vm.groups.map((g) => g.id), ['dinheiro', 'pessoal']);
  assert.deepEqual(vm.groups.map((g) => g.title), ['Dinheiro', 'Pessoal e estudo']);
  assert.deepEqual(vm.groups[1].fronts.map((f) => f.slug), ['faculdade', 'jota-fit']);

  const dinheiro = vm.groups[0].fronts.map((f) => f.slug);
  // Animália não aparece solta: fica dentro da GoFluxo.
  assert.deepEqual(dinheiro, ['praxis', 'gofluxo', 'rca']);

  const gofluxo = vm.groups[0].fronts.find((f) => f.slug === 'gofluxo');
  assert.equal(gofluxo.childCount, 1);
  assert.equal(gofluxo.childSummary, '1 em curso');
  assert.equal(gofluxo.subfronts[0].slug, 'animalia');
  assert.equal(gofluxo.subfronts[0].isSubfront, true);
  assert.equal(gofluxo.subfronts[0].parentName, 'GoFluxo');
  assert.equal(gofluxo.subfronts[0].recommendedRank, 2);
  // A mãe sobe pela prioridade da filha, mas o selo próprio continua vazio.
  assert.equal(gofluxo.recommendedRank, null);
  assert.equal(gofluxo.sortRank, 2);

  const praxis = vm.groups[0].fronts.find((f) => f.slug === 'praxis');
  assert.equal(praxis.recommendedRank, 1);
});

test('buildFrontsViewModel ordena foco e prioridade primeiro, depois Andando, Radar, Aguardando, Pausado', () => {
  const vm = buildFrontsViewModel([
    { id: 'p', slug: 'pausada', name: 'Pausada', kind: 'produto', column: 'pausado' },
    { id: 'g', slug: 'aguarda', name: 'Aguarda', kind: 'produto', column: 'aguardando' },
    { id: 'r', slug: 'radar', name: 'Radar', kind: 'produto', column: 'radar' },
    { id: 'a', slug: 'andando', name: 'Andando', kind: 'produto', column: 'andando' },
    { id: 'f', slug: 'foco', name: 'Foco', kind: 'produto', column: 'pausado', focus: 1 },
    { id: 'h', slug: 'hoje', name: 'Hoje', kind: 'produto', column: 'radar' },
  ], { fresh: true, priorities: [{ rank: 1, project_slug: 'hoje' }] });

  assert.deepEqual(
    vm.groups[0].fronts.map((f) => f.slug),
    ['hoje', 'foco', 'andando', 'radar', 'aguarda', 'pausada'],
  );
});

test('frente-mãe resume o pior estado entre as filhas', () => {
  const projects = [
    { id: 'v', slug: 'varejo', name: 'Varejo farmacêutico com IA', kind: 'produto', column: 'andando' },
    { id: '1', slug: 'farmagente', name: 'FarmAgente', kind: 'produto', column: 'andando', parent_slug: 'varejo' },
    { id: '2', slug: 'encartezap', name: 'EncarteZap', kind: 'produto', column: 'pausado', parent_slug: 'varejo' },
    { id: '3', slug: 'catalogozap', name: 'CatálogoZap', kind: 'produto', column: 'andando', parent_slug: 'varejo', blocked_note: 'Esperando API' },
    { id: '4', slug: 'carteirazap', name: 'CarteiraZap', kind: 'produto', column: 'radar', parent_slug: 'varejo' },
  ];
  const vm = buildFrontsViewModel(projects, null);
  assert.equal(vm.groups[0].fronts.length, 1);
  const varejo = vm.groups[0].fronts[0];
  assert.equal(varejo.childCount, 4);
  assert.equal(varejo.childSummary, '1 bloqueada');
  assert.deepEqual(varejo.subfronts.map((f) => f.slug), ['catalogozap', 'farmagente', 'carteirazap', 'encartezap']);

  assert.equal(summarizeChildren([{ column: 'pausado' }, { column: 'pausado' }, { column: 'andando' }]), '2 pausadas');
  assert.equal(summarizeChildren([{ column: 'aguardando' }, { column: 'pausado' }]), '1 aguardando');
  assert.equal(summarizeChildren([]), '');
});

test('filha de mãe inexistente aparece como frente solta', () => {
  const vm = buildFrontsViewModel([
    { id: '1', slug: 'animalia', name: 'Animália', kind: 'cliente', column: 'andando', parent_slug: 'sumiu' },
  ]);
  assert.equal(vm.groups[0].fronts[0].slug, 'animalia');
  assert.equal(vm.groups[0].fronts[0].isSubfront, false);
});

test('getGuidanceState: sem orientação de hoje', () => {
  assert.equal(getGuidanceState(null).kind, 'missing');
  assert.equal(getGuidanceState({ fresh: false, priorities: [] }).kind, 'missing');
  // Orientação de outro dia conta como ausente mesmo marcada fresh.
  assert.equal(
    getGuidanceState({ fresh: true, date: '2026-10-25', priorities: [{ rank: 1 }] }, '2026-10-26').kind,
    'missing',
  );
});

test('getGuidanceState: Sêneca atualizou e não há prioridade nova', () => {
  const state = getGuidanceState(
    { fresh: true, date: '2026-10-26', summary: 'Só o RCA hoje.\nResto segue.', priorities: [] },
    '2026-10-26',
  );
  assert.deepEqual(state, { kind: 'empty', summary: 'Só o RCA hoje.' });
  assert.deepEqual(getGuidanceState({ fresh: true, priorities: [] }), { kind: 'empty', summary: '' });
});

test('getGuidanceState: com prioridades mantém o card cheio', () => {
  const state = getGuidanceState({ fresh: true, summary: 'x', priorities: [{ rank: 1, action: 'A' }] });
  assert.equal(state.kind, 'ready');
});

test('buildWhereLines junta Onde ficou e Mexendo agora sem repetir', () => {
  assert.deepEqual(buildWhereLines({ status_summary: 'Piloto ativo', current_slice: 'Fluxo de agenda' }), ['Piloto ativo', 'Fluxo de agenda']);
  assert.deepEqual(buildWhereLines({ status_summary: 'Piloto ativo', current_slice: ' piloto ativo ' }), ['Piloto ativo']);
  assert.deepEqual(buildWhereLines({ status_summary: '', current_slice: 'Fluxo de agenda' }), ['Fluxo de agenda']);
  assert.deepEqual(buildWhereLines({ status_summary: 'Piloto ativo' }), ['Piloto ativo']);
  assert.deepEqual(buildWhereLines({}), []);
});

test('listParentOptions só oferece frentes soltas e nada para quem já tem filhas', () => {
  const projects = [
    { slug: 'gofluxo', name: 'GoFluxo', parent_slug: '' },
    { slug: 'animalia', name: 'Animália', parent_slug: 'gofluxo' },
    { slug: 'praxis', name: 'Praxis', parent_slug: '' },
    { slug: 'rca', name: 'RCA', parent_slug: '' },
  ];
  assert.deepEqual(listParentOptions(projects, projects[2]).map((p) => p.slug), ['gofluxo', 'rca']);
  assert.deepEqual(listParentOptions(projects, projects[1]).map((p) => p.slug), ['gofluxo', 'praxis', 'rca']);
  assert.deepEqual(listParentOptions(projects, projects[0]), []);
});

test('buildFrontsViewModel sets recommendedRank to null when guidance is not fresh', () => {
  const sampleProjects = [
    { id: '1', slug: 'praxis', name: 'Praxis', kind: 'produto', column: 'andando' },
  ];
  const guidance = {
    fresh: false,
    priorities: [
      { rank: 1, project_slug: 'praxis', action: 'Polir tela' },
    ],
  };

  const vm = buildFrontsViewModel(sampleProjects, guidance);
  assert.equal(vm.groups[0].fronts[0].recommendedRank, null);
});

test('findProjectForGuidancePriority matches priority to project by slug or id', () => {
  const projects = [
    { id: '10', slug: 'praxis', name: 'Praxis' },
    { id: '20', slug: 'rca', name: 'RCA' },
  ];
  const priority = { project_slug: 'rca', rank: 1 };
  const found = findProjectForGuidancePriority(priority, projects);
  assert.equal(found.id, '20');
});
