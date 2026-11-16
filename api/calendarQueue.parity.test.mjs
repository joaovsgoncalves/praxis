import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { makeParityApp, parityEngines } from './test-support/httpParity.fase3.mjs';
import { createTaskCalendarQueue as oracleQueue } from './test-support/oracles/taskCalendarQueue.bcbadad.js';
import { createAsyncTaskCalendarQueue } from './services/routine/calendarQueue.js';
import { taskRow } from './storage/contract.js';

const START = '2026-11-16T12:00:00.000Z';
async function fixture(kind, t) {
  const app = await makeParityApp(kind, { mount: '/', dbOptions: { withTaskRoutine: true }, oracle: () => express.Router(), build: () => express.Router() });
  t.after(app.dispose);
  let ms = Date.parse(START), fn = () => ({ action: 'synced' });
  const calls = [];
  const now = () => new Date(ms);
  const sync = async (task) => { calls.push(task); return fn(task); };
  // O oráculo é síncrono. Caminhos assíncronos externos são testados só na camada nova.
  const queue = kind === 'oracle' ? oracleQueue({ db: app.db, now, syncTaskToCalendar: (task) => { calls.push(task); return fn(task); } })
    : createAsyncTaskCalendarQueue({ storage: app.storage, now, syncTaskToCalendar: sync });
  const run = (f) => kind === 'oracle' ? f() : app.as(f);
  const put = async (id, extra = {}, withTask = true) => run(async () => {
    const row = { task_id: id, snapshot: null, status: 'pending', attempts: 0, last_error: null, next_attempt_at: now().toISOString(), created_date: START, updated_date: now().toISOString(), ...extra };
    if (kind === 'oracle') {
      if (withTask) app.db.prepare('INSERT OR IGNORE INTO tasks(id,title,status) VALUES (?, ?, ?)').run(id, id, 'pending');
      const cols = Object.keys(row);
      app.db.prepare(`INSERT OR REPLACE INTO task_calendar_queue (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(row));
    } else {
      if (withTask && !await app.storage.tasks.get(id)) await app.storage.tasks.create(taskRow({ id, title: id }, now()));
      await app.storage.transaction(async (tx) => {
        const previous = await tx.taskCalendarQueue.get(id);
        const slot = previous ? null : await tx.taskCalendarQueue.nextRow();
        if (previous) { const fields = { ...row }; delete fields.task_id; delete fields.created_date; await tx.taskCalendarQueue.patch(id, fields); }
        else await tx.taskCalendarQueue.createAt(row, slot);
      });
    }
  });
  const rows = () => run(() => kind === 'oracle' ? app.db.prepare('SELECT * FROM task_calendar_queue ORDER BY rowid').all() : app.storage.taskCalendarQueue.list());
  return { app, queue, run, put, rows, calls, advance: (s) => { ms += s * 1000; }, setSync: (f) => { fn = f; } };
}

async function script(kind, t) {
  const f = await fixture(kind, t), out = [];
  await f.put('live');
  await f.put('gone', { snapshot: JSON.stringify({ id: 'gone', calendar_event_id: 'event' }) }, false);
  await f.put('bad-snapshot', { snapshot: 'invalid' }, false);
  await f.put('absent', {}, false);
  await f.put('later', { next_attempt_at: '2027-01-01T00:00:00.000Z' });
  out.push(await f.run(() => f.queue.drain({ limit: 2 })));
  assert.equal(f.calls.find((r) => r.id === 'gone').status, 'cancelled');
  out.push(await f.run(() => f.queue.drain()));
  out.push(await f.rows());
  assert.deepEqual((await f.rows()).map((r) => r.task_id), ['later']);
  await f.put('retry'); f.setSync(() => ({ action: 'sync_failed', error: 'offline' }));
  for (let i = 0; i < 8; i++) {
    out.push(await f.run(() => f.queue.drain()));
    const r = (await f.rows()).find((r) => r.task_id === 'retry');
    assert.equal(r.attempts, i + 1); assert.equal(r.status, i === 7 ? 'failed' : 'pending');
    out.push(r); f.advance(21600);
  }
  out.push(await f.run(() => f.queue.stats()));
  return out;
}

test('fila: mesma ordem, exclusão por snapshot, retentativa e oito falhas do oráculo nos dois motores', async (t) => {
  const expected = await script('oracle', t);
  for (const kind of parityEngines()) assert.deepEqual(await script(kind, t), expected, kind);
});

for (const kind of parityEngines()) {
  test(`${kind}: agenda fica fora de transação e intenção nova não é perdida na conclusão nem na falha`, async (t) => {
    const f = await fixture(kind, t);
    for (const fails of [false, true]) {
      await f.put('race');
      f.setSync(async () => {
        f.advance(1);
        // Se o dreno mantivesse transação, este acesso ao mesmo storage falharia ou penduraria.
        await f.put('race', { snapshot: JSON.stringify({ id: 'new' }) });
        return fails ? { action: 'sync_failed', error: 'offline' } : { action: 'synced' };
      });
      await f.run(() => f.queue.drain());
      const row = (await f.rows()).find((r) => r.task_id === 'race');
      assert.ok(row, 'finish/fail não pode apagar nem sobrescrever a intenção mais nova');
      assert.equal(row.attempts, 0); assert.equal(row.last_error, null);
      assert.equal(JSON.parse(row.snapshot).id, 'new');
    }
  });
  test(`${kind}: dois drenos na mesma instância compartilham a execução, sem chamada dupla`, async (t) => {
    const f = await fixture(kind, t); await f.put('once');
    let release, entered;
    const gate = new Promise((r) => { release = r; });
    const started = new Promise((r) => { entered = r; });
    f.setSync(async () => { entered(); await gate; return { action: 'synced' }; });
    const first = f.run(() => f.queue.drain()); await started;
    const second = f.run(() => f.queue.drain()); release();
    assert.deepEqual(await second, await first); assert.equal(f.calls.length, 1);
    assert.deepEqual(await f.rows(), []);
  });
}
