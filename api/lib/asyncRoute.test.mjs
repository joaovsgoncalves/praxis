import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { asyncRoute } from './asyncRoute.js';

async function serve(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
const firstLine = (html) => (html.match(/<pre>([^<]*)/) || [])[1];

test('erro assíncrono tem o mesmo envelope do erro síncrono atual', async (t) => {
  const app = express();
  app.get('/sync', () => { throw new RangeError('Invalid time value'); });
  app.get('/async', asyncRoute(async () => { await null; throw new RangeError('Invalid time value'); }));
  app.get('/undefined', asyncRoute(() => Promise.reject(undefined)));
  app.get('/ok', asyncRoute(async (req, res) => { await null; res.status(201).json({ ok: true }); }));
  const { base, close } = await serve(app);
  t.after(close);
  const silence = t.mock.method(console, 'error', () => {});
  const sync = await fetch(`${base}/sync`), asyncRes = await fetch(`${base}/async`);
  const [a, b] = [await sync.text(), await asyncRes.text()];
  assert.equal(asyncRes.status, sync.status);
  assert.equal(asyncRes.status, 500);
  assert.equal(asyncRes.headers.get('content-type'), sync.headers.get('content-type'));
  assert.equal(firstLine(b), firstLine(a));
  assert.equal(firstLine(b), 'RangeError: Invalid time value');
  const undef = await fetch(`${base}/undefined`);
  assert.equal(undef.status, 500, 'rejeição sem motivo não pode cair na próxima rota (404)');
  const ok = await fetch(`${base}/ok`);
  assert.equal(ok.status, 201);
  assert.deepEqual(await ok.json(), { ok: true });
  assert.ok(silence.mock.callCount() >= 3);
});

test('contraprova: rota assíncrona crua no Express 4 pendura a requisição', async (t) => {
  const app = express();
  app.get('/raw', async () => { await null; throw new Error('perdido'); });
  const { base, close } = await serve(app);
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  const previous = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', onRejection);
  t.after(async () => {
    process.removeListener('unhandledRejection', onRejection);
    for (const listener of previous) process.on('unhandledRejection', listener);
    await close();
  });
  await assert.rejects(() => fetch(`${base}/raw`, { signal: AbortSignal.timeout(400) }), { name: 'TimeoutError' });
  assert.equal(rejections.length, 1);
  assert.equal(rejections[0].message, 'perdido');
});

test('erro depois de começar a responder não pendura o cliente', async (t) => {
  const app = express();
  app.get('/partial', asyncRoute(async (req, res) => { res.write('{"parcial":'); await null; throw new Error('no meio'); }));
  const { base, close } = await serve(app);
  t.after(close);
  t.mock.method(console, 'error', () => {});
  const result = await fetch(`${base}/partial`, { signal: AbortSignal.timeout(2000) })
    .then((res) => res.text())
    .then(() => 'terminou', (error) => (error.name === 'TimeoutError' ? 'pendurou' : 'conexão encerrada'));
  assert.notEqual(result, 'pendurou');
});
