/**
 * Vínculo de tarefa e hábito com meta. A coluna goal_id não tem chave estrangeira no SQLite,
 * então a regra mora aqui: só aponta para meta que existe, e excluir a meta solta os itens.
 */

export const GOAL_NOT_FOUND = {
  error: 'Essa meta não existe mais. Escolha outra meta ou salve sem meta.',
  code: 'goal_not_found',
};

const has = (body, key) => Object.prototype.hasOwnProperty.call(body || {}, key);
const isEmpty = (value) => value === null || value === undefined || value === '';

function goalExists(db, goalId) {
  return Boolean(db.prepare('SELECT 1 FROM goals WHERE id = ?').get(String(goalId)));
}

/** Criação: sem meta vira null; com meta, ela precisa existir. */
export function goalLinkForCreate(db, goalId) {
  if (isEmpty(goalId)) return { ok: true, value: null };
  if (!goalExists(db, goalId)) return { ok: false };
  return { ok: true, value: String(goalId) };
}

/**
 * Edição: campo ausente mantém; null ou '' desvincula; valor novo precisa existir.
 * Reenviar o mesmo valor que já está gravado não bloqueia a edição do resto.
 */
export function goalLinkForUpdate(db, body, existingGoalId) {
  if (!has(body, 'goal_id')) return { ok: true, change: false, value: null };
  const requested = body.goal_id;
  if (isEmpty(requested)) return { ok: true, change: true, value: null };
  if (String(requested) === String(existingGoalId ?? '')) return { ok: true, change: false, value: null };
  if (!goalExists(db, requested)) return { ok: false };
  return { ok: true, change: true, value: String(requested) };
}

/** Solta tarefas e hábitos de uma meta. Chamar dentro da transação que exclui a meta. */
export function unlinkGoal(db, goalId) {
  const tasks = db.prepare('UPDATE tasks SET goal_id = NULL WHERE goal_id = ?').run(goalId).changes;
  const habits = db.prepare('UPDATE habits SET goal_id = NULL WHERE goal_id = ?').run(goalId).changes;
  return { tasks, habits };
}

/**
 * Reparo dos vínculos que já ficaram apontando para meta excluída. O item é preservado
 * (só perde o vínculo) e o reparo fica registrado para conferência. Idempotente.
 */
export function repairOrphanGoalLinks(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_link_repairs (
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      missing_goal_id TEXT NOT NULL,
      repaired_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (item_type, item_id, missing_goal_id)
    )
  `);
  const repair = db.transaction(() => {
    let repaired = 0;
    for (const [type, table] of [['task', 'tasks'], ['habit', 'habits']]) {
      const orphans = db.prepare(`
        SELECT id, goal_id FROM ${table}
        WHERE goal_id IS NOT NULL AND goal_id != ''
          AND goal_id NOT IN (SELECT id FROM goals)
      `).all();
      for (const row of orphans) {
        db.prepare('INSERT OR IGNORE INTO goal_link_repairs (item_type, item_id, missing_goal_id) VALUES (?, ?, ?)')
          .run(type, row.id, row.goal_id);
        db.prepare(`UPDATE ${table} SET goal_id = NULL WHERE id = ?`).run(row.id);
        repaired += 1;
      }
      // Vínculo vazio gravado como '' (formulário antigo) vira ausência de vínculo.
      db.prepare(`UPDATE ${table} SET goal_id = NULL WHERE goal_id = ''`).run();
    }
    return repaired;
  });
  return repair();
}
