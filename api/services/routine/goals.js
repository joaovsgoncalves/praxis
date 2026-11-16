/**
 * Metas sobre a camada assíncrona, com o comportamento da rota antiga (oráculo em
 * test-support/oracles/goals.bcbadad.js):
 *
 * - lista: todas, `created_date DESC` (empate na ordem de inserção); detalhe: 404 'Goal not found';
 * - criar: título aparado obrigatório; prazo '' vira NULL; vínculo inicial opcional (tarefa ou hábito)
 *   com as mesmas validações e mensagens; tarefa/hábito criado com posição `MAX(sort_order) + 1`
 *   da tabela dele e `source = 'goal_wizard'`;
 * - editar: só o que veio (COALESCE), título presente precisa ser texto não vazio, prazo presente
 *   com null/'' limpa e ausente mantém;
 * - excluir: solta tarefas e hábitos da meta e apaga a meta na MESMA transação; falha = 500
 *   `goal_delete_failed` e nada muda.
 *
 * Meta, tarefa e hábito do vínculo nascem na MESMA transação (todas as leituras antes das escritas).
 *
 * Diferenças intencionais (nenhum consumidor manda; tela e Alfred mandam texto e número):
 * (1) erro na tarefa/hábito do vínculo (ex.: `initial_link.date` objeto) não deixa a meta gravada
 *     como a antiga deixava: a criação inteira é desfeita, mesmo erro 500;
 * (2) lista/objeto que desloca parâmetros sem mudar a contagem vira `sqlite_coercion_unsupported`;
 * (3) id com mais de 1500 bytes no caminho responde 404 (nenhum registro pode ter esse id).
 */
import { randomUUID } from 'node:crypto';
import { bindRow, nextSort, sqlStamp } from './affinity.js';
import { habitRow } from '../../storage/domains/phase3.js';

const GOAL_INSERT = [['id', 'TEXT'], ['title', 'TEXT'], ['description', 'TEXT'], ['deadline', 'TEXT'], ['timeframe', 'TEXT'], ['category', 'TEXT'], ['status', 'TEXT'], ['manual_progress', 'INTEGER']];
const GOAL_UPDATE = [['title', 'TEXT'], ['description', 'TEXT'], ['deadline', 'TEXT'], ['timeframe', 'TEXT'], ['category', 'TEXT'], ['status', 'TEXT'], ['manual_progress', 'INTEGER'], ['id', 'TEXT']];
const LINK_INSERT = [['id', 'TEXT'], ['title', 'TEXT'], ['description', 'TEXT'], ['date', 'TEXT'], ['goal_id', 'TEXT'], ['sort_order', 'INTEGER']];
const HABIT_INSERT = [['id', 'TEXT'], ['title', 'TEXT'], ['description', 'TEXT'], ['frequency', 'TEXT'], ['goal_id', 'TEXT'], ['sort_order', 'INTEGER']];
const NOT_FOUND = { status: 404, body: { error: 'Goal not found' } };
const DELETE_FAILED = { error: 'Não foi possível excluir a meta. Nada foi alterado.', code: 'goal_delete_failed' };

/** Normalize optional deadline: empty string → null; omit → undefined (keep existing on update). */
function normalizeDeadline(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}

/** Id que nenhum registro pode ter (longo demais para guardar) = registro inexistente. */
async function orMissing(promise, missing) {
  try { return await promise; } catch (error) { if (error?.code === 'invalid_record_id') return missing; throw error; }
}

export function createGoalsService({ storage, getLocalDateString, now = () => new Date(), newId = randomUUID, log = console }) {
  if (!storage?.goals || !storage?.tasks || !storage?.habits || typeof storage.transaction !== 'function') throw new TypeError('goals service requires storage');
  if (typeof getLocalDateString !== 'function') throw new TypeError('goals service requires getLocalDateString');

  const list = () => storage.goals.list();
  const get = (id) => orMissing(storage.goals.get(id), null);

  async function create(body) {
    const id = newId();
    const {
      title, description = '', deadline, timeframe = 'short', category = 'personal',
      status = 'active', manual_progress = 0, initial_link,
    } = body;

    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) return { status: 400, body: { error: 'Title is required' } };

    const deadlineValue = normalizeDeadline(deadline) ?? null;

    // initial_link is optional (quick create). When present, validate before insert.
    if (initial_link != null) {
      if (!initial_link.type || !['task', 'habit'].includes(initial_link.type)) {
        return {
          status: 400,
          body: { error: 'Goal must include initial_link (task or habit)', code: 'goal_link_required' },
        };
      }
      const linkTitle = (initial_link.title || trimmedTitle).trim();
      if (!linkTitle) {
        return { status: 400, body: { error: 'Link title is required', code: 'goal_link_title_required' } };
      }
    }

    const goalValues = bindRow(GOAL_INSERT, [id, trimmedTitle, description, deadlineValue, timeframe, category, status, manual_progress]);
    const stamp = sqlStamp(now());
    const linkTitle = initial_link != null ? (initial_link.title || trimmedTitle).trim() : null;
    const type = initial_link != null ? initial_link.type : null;

    return storage.transaction(async (tx) => {
      // Leituras primeiro: ordem da meta, posição e ordem do item vinculado.
      const goalRow = await tx.goals.nextRow();
      let top = null, habitSlot = null;
      if (type === 'task') top = await tx.tasks.maxSort();
      if (type === 'habit') { top = await tx.habits.maxSort(); habitSlot = await tx.habits.nextRow(); }

      let linked = null, linkWrite = null;
      if (type === 'task') {
        const taskId = newId();
        const taskDate = initial_link.date || deadlineValue || getLocalDateString();
        const values = bindRow(LINK_INSERT, [taskId, linkTitle, description || '', taskDate, id, nextSort(top)]);
        linkWrite = () => tx.tasks.create({ ...values, status: 'pending', priority: 'medium', category: 'pessoal', source: 'goal_wizard' });
        linked = { type: 'task', id: taskId, title: linkTitle };
      } else if (type === 'habit') {
        const habitId = newId();
        const freq = initial_link.frequency || 'daily';
        const values = bindRow(HABIT_INSERT, [habitId, linkTitle, description || '', freq, id, nextSort(top)]);
        linkWrite = () => tx.habits.createAt(habitRowFor(values, stamp), habitSlot);
        linked = { type: 'habit', id: habitId, title: linkTitle };
      }

      const goal = await tx.goals.createAt({ ...goalValues, created_date: stamp }, goalRow);
      if (linkWrite) await linkWrite();
      return { status: 201, body: { goal, linked } };
    });
  }

  async function update(id, body) {
    return orMissing(storage.transaction(async (tx) => {
      const existing = await tx.goals.get(id);
      if (!existing) return NOT_FOUND;

      const { description, timeframe, category, status, manual_progress } = body;

      let nextTitle;
      if (Object.prototype.hasOwnProperty.call(body, 'title')) {
        nextTitle = typeof body.title === 'string' ? body.title.trim() : '';
        if (!nextTitle) return { status: 400, body: { error: 'Title is required' } };
      }

      // Explicit deadline semantics: key present with null/'' clears; omitted keeps existing.
      const hasDeadline = Object.prototype.hasOwnProperty.call(body, 'deadline');
      const nextDeadline = hasDeadline ? normalizeDeadline(body.deadline) : existing.deadline;

      const values = bindRow(GOAL_UPDATE, [nextTitle, description, nextDeadline, timeframe, category, status, manual_progress, id]);
      // `deadline = ?` sempre; o resto é `COALESCE(?, coluna)`: NULL mantém o gravado.
      const fields = { deadline: values.deadline };
      for (const key of ['title', 'description', 'timeframe', 'category', 'status', 'manual_progress']) if (values[key] !== null) fields[key] = values[key];
      await tx.goals.patch(id, fields);
      return { status: 200, body: { ...existing, ...fields } };
    }), NOT_FOUND);
  }

  async function remove(id) {
    let outcome;
    try {
      outcome = await storage.transaction(async (tx) => {
        const existing = await tx.goals.get(id);
        if (!existing) return null;
        const taskIds = await tx.tasks.idsByGoal(id), habitIds = await tx.habits.idsByGoal(id);
        await tx.tasks.clearGoal(taskIds);
        await tx.habits.clearGoal(habitIds);
        await tx.goals.remove(id);
        return { tasks: taskIds.length, habits: habitIds.length };
      });
    } catch (error) {
      if (error?.code === 'invalid_record_id') return NOT_FOUND;
      log.error('[metas] exclusão desfeita:', error?.message || error);
      return { status: 500, body: DELETE_FAILED };
    }
    if (!outcome) return NOT_FOUND;
    return { status: 200, body: { success: true, unlinked: outcome } };
  }

  return Object.freeze({ list, get, create, update, remove });
}

/** Hábito do vínculo: colunas do INSERT antigo + constantes; o resto é DEFAULT da tabela. */
function habitRowFor(values, stamp) {
  return habitRow({ ...values, category: 'wellness', source: 'goal_wizard', status: 'active', created_date: stamp });
}
