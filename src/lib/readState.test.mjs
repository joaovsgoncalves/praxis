import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSectionRead,
  combineReadStates,
  isReadable,
  queryReadState,
  readErrorMessage,
  staleCopyLabel,
} from './readState.js';

const T_1432 = Date.UTC(2026, 10, 14, 17, 32); // 14:32 em Fortaleza

test('lista vazia lida com sucesso é vazio real, não erro nem carregando', () => {
  assert.equal(queryReadState({ data: [], isError: false, fetchStatus: 'idle' }).status, 'ready');
});

test('sem dado e com erro é falha de leitura, e a causa segue junto', () => {
  const error = { status: 500, requestId: 'abcdef123456' };
  const s = queryReadState({ data: undefined, isError: true, error, fetchStatus: 'idle' });
  assert.equal(s.status, 'error');
  assert.equal(s.error, error);
});

test('sem dado e ainda buscando é carregando', () => {
  assert.equal(queryReadState({ data: undefined, isError: false, fetchStatus: 'fetching' }).status, 'loading');
});

test('leitura pausada por falta de rede não fica carregando para sempre', () => {
  const s = queryReadState({ data: undefined, isError: false, fetchStatus: 'paused' });
  assert.equal(s.status, 'error');
  assert.equal(s.error.kind, 'offline');
});

test('cópia do aparelho é identificada com a hora em que foi salva', () => {
  const data = Object.assign([{ id: 1 }], { __stale: true, __cachedAt: T_1432 });
  const s = queryReadState({ data, isError: false, fetchStatus: 'idle' });
  assert.equal(s.status, 'stale');
  assert.equal(s.cachedAt, T_1432);
});

test('releitura que falha com dado em memória vira cópia, não erro', () => {
  const s = queryReadState({ data: [{ id: 1 }], isError: true, error: { status: 503 }, dataUpdatedAt: T_1432, fetchStatus: 'idle' });
  assert.equal(s.status, 'stale');
  assert.equal(s.cachedAt, T_1432);
});

test('na seção o pior estado vence e a cópia mais antiga dá a hora', () => {
  const ready = { status: 'ready', cachedAt: null, error: null };
  const staleNew = { status: 'stale', cachedAt: T_1432 + 60_000, error: null };
  const staleOld = { status: 'stale', cachedAt: T_1432, error: null };
  const loading = { status: 'loading', cachedAt: null, error: null };
  const failed = { status: 'error', cachedAt: null, error: { status: 500 } };
  assert.equal(combineReadStates(ready, ready).status, 'ready');
  assert.deepEqual(combineReadStates(ready, staleNew, staleOld), { status: 'stale', cachedAt: T_1432, error: null });
  assert.equal(combineReadStates(staleOld, loading).status, 'loading');
  assert.equal(combineReadStates(loading, failed, staleOld).status, 'error');
});

test('Tentar novamente relê só o que não veio inteiro', () => {
  const calls = [];
  const ok = { data: [], isError: false, fetchStatus: 'idle', refetch: () => calls.push('ok') };
  const bad = { data: undefined, isError: true, error: { status: 500 }, fetchStatus: 'idle', refetch: () => calls.push('bad') };
  const read = buildSectionRead([ok, bad]);
  assert.equal(read.status, 'error');
  assert.equal(read.retrying, false);
  read.retry();
  assert.deepEqual(calls, ['bad']);
  assert.equal(buildSectionRead([ok, { ...bad, fetchStatus: 'fetching' }]).retrying, true);
});

test('hábitos sem os registros do dia não podem aparecer como não feitos', () => {
  const habits = { data: [{ id: 'h1' }], isError: false, fetchStatus: 'idle' };
  const logs = { data: undefined, isError: true, error: { kind: 'network' }, fetchStatus: 'idle' };
  assert.equal(buildSectionRead([habits, logs]).status, 'error');
});

test('a mensagem de erro diz a causa', () => {
  assert.equal(readErrorMessage('as tarefas', { kind: 'offline' }), 'Sem conexão. Não deu para carregar as tarefas.');
  assert.equal(readErrorMessage('os hábitos', { kind: 'network' }), 'A conexão caiu antes de carregar os hábitos.');
  assert.equal(
    readErrorMessage('as tarefas', { status: 500, requestId: 'abcdef123456' }),
    'O servidor falhou ao carregar as tarefas. (ref. abcdef12)',
  );
  assert.equal(readErrorMessage('as tarefas', null), 'Não deu para carregar as tarefas.');
});

test('contagem só vale com leitura concluída: erro e carregando não contam', () => {
  assert.equal(isReadable({ status: 'ready' }), true);
  assert.equal(isReadable({ status: 'stale' }), true);
  assert.equal(isReadable({ status: 'error' }), false);
  assert.equal(isReadable({ status: 'loading' }), false);
  assert.equal(isReadable(undefined), true);
});

test('a cópia mostra a hora de Fortaleza e a data quando é de outro dia', () => {
  assert.equal(staleCopyLabel(T_1432, T_1432 + 3_600_000), 'Cópia salva às 14:32');
  assert.equal(staleCopyLabel(T_1432, T_1432 + 26 * 3_600_000), 'Cópia salva em 14/11 às 14:32');
  assert.equal(staleCopyLabel(null), 'Cópia salva no aparelho');
});
