/**
 * POST /api/praxia/confront sem chave e com a OpenAI falhando, sem rede: rota antiga congelada × rota nova
 * (SQLite e emulador Firestore). `fetch` só é interceptado para api.openai.com; o resto passa. Prova também
 * o que a rota manda à OpenAI e que a chamada acontece com nenhuma transação aberta na camada nova.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parityEngines, runParityScript } from './test-support/httpParity.mjs';
import { makeClockedParityApp } from './test-support/httpParity.fase4.mjs';
import { insightsSetup } from './test-support/insightsParity.fase4.mjs';
import { seedInsights, TODAY } from './test-support/insightsFixture.fase4.mjs';

const KEY = 'chave-de-teste-sem-rede';
const CONFRONT = (body) => ['POST', '/api/praxia/confront', body];
const SCRIPT = [CONFRONT({}), CONFRONT({ date: TODAY, note: '  nota com espaços  ' }), CONFRONT({ date: '2026-09-01', note: 'x'.repeat(700) }), CONFRONT({ date: 'lixo' })];
/** Como a OpenAI pode falhar (ou responder algo inútil): em todos a rota devolve o espelho por regras. */
const MODES = {
  rede: () => { throw new Error('rede fora do ar'); },
  http500: () => ({ ok: false, text: async () => 'erro interno' }),
  naoJson: () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'isto não é JSON' } }] }) }),
  semLinhas: () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ lines: ['  ', null] }) } }] }) }),
  semChoices: () => ({ ok: true, json: async () => ({}) }),
  listaVazia: () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"lines":[]}' } }] }) }),
};

async function exercise(t, kind, setupOptions) {
  const track = { open: 0 };
  const app = await makeClockedParityApp(kind, insightsSetup({ seed: seedInsights, openaiApiKey: setupOptions.openaiApiKey, track }));
  t.after(app.dispose);
  return { app, track };
}

test('confronto da PraxIA sem chave: espelho por regras e nenhuma chamada externa', async (t) => {
  t.mock.method(console, 'error', () => {});
  const external = [];
  const real = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('openai.com')) { external.push(url); throw new Error('sem rede nos testes'); }
    return real(url, init);
  });
  const expected = await runParityScript((await exercise(t, 'oracle', {})).app, SCRIPT);
  for (const kind of parityEngines()) {
    const { app } = await exercise(t, kind, {});
    const actual = await runParityScript(app, SCRIPT);
    for (let i = 0; i < SCRIPT.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}`);
  }
  assert.equal(external.length, 0, 'sem chave não chama a OpenAI');
  assert.ok(expected.slice(0, 3).every((r) => r.status === 200 && JSON.parse(r.body).source === 'rules'));
  assert.equal(expected[3].status, 500);
});

test('confronto da PraxIA com a OpenAI falhando: mesmo espelho, mesmo pedido, chamada fora de transação', async (t) => {
  t.mock.method(console, 'error', () => {});
  let mode = 'rede', track = null;
  const calls = [];
  const real = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).includes('openai.com')) return real(url, init);
    calls.push({ url: String(url), method: init.method, auth: init.headers.Authorization, body: JSON.parse(init.body), open: track?.open ?? 0 });
    return MODES[mode]();
  });
  const outcomes = {};
  for (const kind of ['oracle', ...parityEngines()]) {
    const { app, track: tr } = await exercise(t, kind, { openaiApiKey: KEY });
    track = tr;
    outcomes[kind] = {};
    for (mode of Object.keys(MODES)) {
      calls.length = 0;
      const responses = await runParityScript(app, SCRIPT);
      outcomes[kind][mode] = { responses, calls: calls.map(({ open, ...call }) => call) };
      assert.ok(calls.every((call) => call.open === 0), `${kind}/${mode}: a OpenAI foi chamada com transação aberta`);
      assert.equal(calls.length, 3, `${kind}/${mode}: uma chamada por pedido que chegou à OpenAI (o 500 de data inválida não chega)`);
    }
  }
  for (const [kind, byMode] of Object.entries(outcomes)) {
    if (kind === 'oracle') continue;
    for (const [name, result] of Object.entries(byMode)) assert.deepEqual(result, outcomes.oracle[name], `${kind}/${name}`);
  }
  const sample = outcomes.oracle.rede;
  assert.ok(sample.responses.slice(0, 3).every((r) => r.status === 200 && JSON.parse(r.body).source === 'rules'), 'falha da OpenAI cai nas regras');
  assert.equal(sample.calls[0].auth, `Bearer ${KEY}`);
  assert.equal(sample.calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.ok(sample.calls[1].body.messages[1].content.includes('Nota do usuário: nota com espaços'));
  assert.equal(sample.calls[2].body.messages[1].content.split('Nota do usuário: ')[1].length, 500, 'nota cortada em 500');
  t.diagnostic(`modos=${Object.keys(MODES).length} motores=oráculo,${parityEngines().join(',')}`);
});
