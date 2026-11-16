/** Montagem comum dos testes de frentes da fase 4 (paridade e testes antigos nos dois motores). */
import { createProjectsRouter as createOracleRouter } from './oracles/projectsRoute.bcbadad.js';
import { createProjectsRouter } from '../routes/projects.js';
import { createProjectsService } from '../services/personal/projects.js';
import { createGuidanceService } from '../services/personal/guidance.js';
import { seedProjectsIfEmpty } from '../projects.js';
import { createTestDb } from './helpers.mjs';
import { makeClockedParityApp, rowsInInsertOrder } from './httpParity.fase4.mjs';

/**
 * Firestore recebe a cópia das linhas que o preparo do banco legado grava (mesmo `seed`, num banco
 * de rascunho), na ordem de inserção. É migração de dado, sem regra nenhuma.
 */
async function copySeed(storage, seed) {
  const scratch = createTestDb({ withProjects: true });
  try {
    seed(scratch);
    for (const row of rowsInInsertOrder(scratch, 'projects')) await storage.projects.create(row);
    for (const row of rowsInInsertOrder(scratch, 'project_updates')) await storage.projectUpdates.create(row);
    for (const row of rowsInInsertOrder(scratch, 'continuity_guidance')) await storage.continuityGuidance.put(row);
  } finally { scratch.close(); }
}

export const projectsSetup = (every = 2, { seed = seedProjectsIfEmpty, getLocalDateString } = {}) => ({
  mount: '/api/projects',
  dbOptions: { withProjects: true },
  every,
  seedSqlite: (db) => seed(db),
  seedStorage: (storage) => copySeed(storage, seed),
  oracle: (db) => createOracleRouter({ db, getLocalDateString }),
  build: (storage, { clock }) => createProjectsRouter({
    projects: createProjectsService({ storage, now: clock.now }),
    guidance: createGuidanceService({ storage, now: clock.now }),
    getLocalDateString,
  }),
});

/**
 * Rota nova de frentes num motor ('sqlite' | 'firestore'), para os testes antigos.
 * `directWrite(slug, campos)` = escritor de fora da API (script do Sêneca): no SQLite é o UPDATE
 * direto (o gatilho sobe a revisão); no Firestore não há gatilho, então o escritor de fora passa pelo
 * domínio, que exige a revisão nova em toda alteração.
 */
export async function mountProjectsEngine(t, kind, options = {}) {
  const app = await makeClockedParityApp(kind, projectsSetup(1, options));
  t.after(app.dispose);
  const base = app.base.slice(0, -'/api/projects'.length);
  async function directWrite(slug, fields) {
    if (app.db) {
      const keys = Object.keys(fields);
      app.db.prepare(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE slug = ?`).run(...keys.map((k) => fields[k]), slug);
      return;
    }
    await app.as(() => app.storage.transaction(async (tx) => {
      const row = await tx.projects.get(slug);
      await tx.projects.patch(row.id, { ...fields, revision: row.revision + 1 });
    }));
  }
  return { server: { base }, db: app.db, storage: app.storage, as: app.as, directWrite };
}
