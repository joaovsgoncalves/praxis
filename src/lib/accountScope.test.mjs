import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __test, activeAccount, adoptAccount, isForeignResponse, isPersonalKey, readOfflineEntry,
  releaseAccount, reportAccountChanged, storedAccount, subscribeAccountChanged, watchOtherTabs, writeOfflineEntry,
} from './accountScope.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    keys: () => [...map.keys()].sort(),
  };
}
const fresh = (local = {}, session = {}) => ({ local: fakeStorage(local), session: fakeStorage(session) });
test.beforeEach(() => __test.reset());

test('dados guardados sem dono (antes das contas) são apagados na primeira entrada', () => {
  const s = fresh({ 'praxis:offline:/api/tasks': '{"data":[1]}', 'forja:offline:/api/habits': '{}', 'praxis:session-hint': '1' });
  const result = adoptAccount('conta-a', s);
  assert.equal(result.switched, true);
  assert.deepEqual(s.local.keys(), ['praxis:account', 'praxis:session-hint']);
  assert.equal(storedAccount(s), 'conta-a');
  assert.equal(activeAccount(), 'conta-a');
});

test('a mesma conta de volta (sessão caiu e entrou de novo) mantém tudo', () => {
  const s = fresh({}, {});
  adoptAccount('conta-a', s);
  writeOfflineEntry('/api/tasks', [{ id: 1 }], 'conta-a', s);
  s.session.setItem('praxis:pending-intent', '{"taskId":"1"}');
  s.local.setItem('praxis:finance:hide-values', '1');
  __test.reset(); // recarregou a página
  assert.equal(readOfflineEntry('/api/tasks', s), null, 'antes de o servidor confirmar a conta, nada é lido');
  assert.equal(adoptAccount('conta-a', s).switched, false);
  assert.deepEqual(readOfflineEntry('/api/tasks', s).data, [{ id: 1 }]);
  assert.equal(s.session.getItem('praxis:pending-intent'), '{"taskId":"1"}');
  assert.equal(s.local.getItem('praxis:finance:hide-values'), '1');
});

test('entrou outra conta: nada da anterior sobra, nas duas gavetas', () => {
  const s = fresh();
  adoptAccount('conta-a', s);
  writeOfflineEntry('/api/finance/overview', { saldo: 1234 }, 'conta-a', s);
  s.local.setItem('praxis:focus:active-v1', '{"title":"tarefa do A"}');
  s.local.setItem('praxis:board:collapsed', '1');
  s.local.setItem('praxis:last-seen-release', '2026-11-15');
  s.local.setItem('tema-de-outro-app', 'x');
  s.session.setItem('praxis:finance:intents', '{"x":1}');
  s.session.setItem('praxis:pending-intent', '{"taskId":"9"}');
  const result = adoptAccount('conta-b', s);
  assert.deepEqual(result, { switched: true, previous: 'conta-a' });
  assert.deepEqual(s.local.keys(), ['praxis:account', 'praxis:last-seen-release', 'tema-de-outro-app']);
  assert.deepEqual(s.session.keys(), []);
  assert.equal(readOfflineEntry('/api/finance/overview', s), null);
  assert.equal(storedAccount(s), 'conta-b');
});

test('cópia offline: só lê a que tem o carimbo da conta ativa', () => {
  const s = fresh();
  adoptAccount('conta-b', s);
  s.local.setItem('praxis:offline:/api/tasks', JSON.stringify({ data: ['do A'], timestamp: 1, account: 'conta-a' }));
  s.local.setItem('praxis:offline:/api/habits', JSON.stringify({ data: ['sem dono'], timestamp: 1 }));
  s.local.setItem('praxis:offline:/api/goals', 'isto não é json');
  assert.equal(readOfflineEntry('/api/tasks', s), null);
  assert.equal(readOfflineEntry('/api/habits', s), null);
  assert.equal(readOfflineEntry('/api/goals', s), null);
});

test('resposta que chega depois da troca de conta não é guardada', () => {
  const s = fresh();
  adoptAccount('conta-a', s);
  const contaNoEnvio = activeAccount();
  adoptAccount('conta-b', s); // trocou enquanto a resposta viajava
  assert.equal(writeOfflineEntry('/api/tasks', ['do A'], contaNoEnvio, s), false);
  assert.equal(s.local.getItem('praxis:offline:/api/tasks'), null);
  assert.equal(writeOfflineEntry('/api/tasks', ['do B'], activeAccount(), s), true);
  assert.equal(writeOfflineEntry('/api/tasks', ['sem conta'], null, s), false);
});

test('sair da conta apaga tudo e tira o dono', () => {
  const s = fresh();
  adoptAccount('conta-a', s);
  writeOfflineEntry('/api/tasks', [1], 'conta-a', s);
  s.session.setItem('praxis:pending-intent', '{}');
  releaseAccount(s);
  assert.deepEqual(s.local.keys(), []);
  assert.deepEqual(s.session.keys(), []);
  assert.equal(activeAccount(), null);
  assert.equal(readOfflineEntry('/api/tasks', s), null);
});

test('o que é do aparelho não é pessoal; o resto com prefixo da Praxis é', () => {
  assert.equal(isPersonalKey('praxis:session-hint'), false);
  assert.equal(isPersonalKey('praxis:account'), false);
  assert.equal(isPersonalKey('praxis:offline:/api/tasks'), true);
  assert.equal(isPersonalKey('forja:offline:/api/tasks'), true);
  assert.equal(isPersonalKey('praxis:chave-que-ainda-vai-existir'), true, 'chave nova nasce pessoal, salvo decisão em contrário');
  assert.equal(isPersonalKey('outra-coisa'), false);
});

test('resposta assinada por outra conta e troca feita em outra aba avisam a tela', () => {
  assert.equal(isForeignResponse('conta-b', 'conta-a'), true);
  assert.equal(isForeignResponse('conta-a', 'conta-a'), false);
  assert.equal(isForeignResponse(null, 'conta-a'), false, 'servidor antigo, sem assinatura: não acusa');
  assert.equal(isForeignResponse('conta-b', null), false);

  const s = fresh();
  adoptAccount('conta-a', s);
  const seen = [];
  const off = subscribeAccountChanged((detail) => seen.push(detail.source));
  let handler;
  const stop = watchOtherTabs({ addEventListener: (_n, fn) => { handler = fn; }, removeEventListener: () => { handler = null; } });
  handler({ key: 'praxis:account', newValue: 'conta-a' });
  handler({ key: 'praxis:offline:/api/tasks', newValue: 'x' });
  assert.deepEqual(seen, []);
  handler({ key: 'praxis:account', newValue: 'conta-b' });
  handler({ key: 'praxis:account', newValue: null });
  assert.deepEqual(seen, ['outra-aba', 'outra-aba']);
  reportAccountChanged({ source: 'resposta' });
  assert.deepEqual(seen, ['outra-aba', 'outra-aba', 'resposta']);
  off(); stop();
  assert.equal(handler, null);
});

test('navegador sem armazenamento: nada quebra e nada é lido', () => {
  const broken = { local: { get length() { throw new Error('bloqueado'); }, getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } }, session: null };
  assert.equal(adoptAccount('conta-a', broken).switched, true);
  assert.equal(activeAccount(), 'conta-a');
  assert.equal(readOfflineEntry('/api/tasks', broken), null);
  assert.equal(writeOfflineEntry('/api/tasks', [1], 'conta-a', broken), false);
  releaseAccount(broken);
  assert.equal(activeAccount(), null);
});
