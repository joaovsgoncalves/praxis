import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { makeParityApp, parityEngines } from './test-support/httpParity.fase3.mjs';
import { taskRow } from './storage/contract.js';

test('junção 3+4: tarefa gravada pelo repositório real desempata no insight pela inserção, não pelo id', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, { mount: '/', oracle: () => express.Router(), build: () => express.Router() });
    t.after(app.dispose);
    await app.as(async () => {
      for (const id of ['z-last-in-alphabet', 'a-first-in-alphabet', 'm-middle']) {
        await app.storage.tasks.create(taskRow({ id, title: id, status: 'completed', category: 'pessoal', date: '2026-11-16', completed_date: '2026-11-16', created_date: '2026-11-16 10:00:00', updated_date: '2026-11-16 10:00:00' }, new Date('2026-11-16T10:00:00Z')));
      }
      const rows = await app.storage.insightsRead.completedTasksOfWeek('2026-11-16', '2026-11-22');
      assert.deepEqual(rows.map((r) => r.id), ['z-last-in-alphabet', 'a-first-in-alphabet', 'm-middle'], kind);
      await app.storage.tasks.patch('a-first-in-alphabet', { title: 'editada' });
      const again = await app.storage.insightsRead.completedTasksOfWeek('2026-11-16', '2026-11-22');
      assert.deepEqual(again.map((r) => r.id), rows.map((r) => r.id), 'editar não troca ordem de inserção');
    });
  }
});
