/** Nutrição / macros — schema + helpers (fase 0: leitura day/profile) */

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function initNutritionSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nutrition_profile (
      id TEXT PRIMARY KEY DEFAULT 'default',
      sex TEXT,
      birth_year INTEGER,
      height_cm REAL,
      weight_kg REAL,
      activity TEXT DEFAULT 'moderate',
      goal TEXT DEFAULT 'maintain',
      target_kcal INTEGER,
      target_protein_g REAL,
      target_carbs_g REAL,
      target_fat_g REAL,
      target_fiber_g REAL,
      use_net_carbs INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS food_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      serving_label TEXT DEFAULT '100 g',
      serving_grams REAL,
      kcal REAL NOT NULL DEFAULT 0,
      protein_g REAL NOT NULL DEFAULT 0,
      carbs_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      fiber_g REAL NOT NULL DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      source TEXT DEFAULT 'custom',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS food_meals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS food_meal_items (
      id TEXT PRIMARY KEY,
      meal_id TEXT NOT NULL,
      food_item_id TEXT NOT NULL,
      servings REAL DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (meal_id) REFERENCES food_meals(id),
      FOREIGN KEY (food_item_id) REFERENCES food_items(id)
    );

    CREATE TABLE IF NOT EXISTS food_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      meal_slot TEXT DEFAULT 'other',
      food_item_id TEXT,
      meal_id TEXT,
      name_snapshot TEXT NOT NULL DEFAULT '',
      servings REAL DEFAULT 1,
      grams REAL,
      kcal REAL NOT NULL DEFAULT 0,
      protein_g REAL NOT NULL DEFAULT 0,
      carbs_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      fiber_g REAL NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);
    CREATE INDEX IF NOT EXISTS idx_food_items_name ON food_items(name);
    CREATE INDEX IF NOT EXISTS idx_food_items_favorite ON food_items(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_food_meals_status ON food_meals(status);
  `);

  const row = db.prepare('SELECT id FROM nutrition_profile WHERE id = ?').get('default');
  if (!row) {
    db.prepare(`
      INSERT INTO nutrition_profile (id, goal, use_net_carbs)
      VALUES ('default', 'maintain', 0)
    `).run();
  }
}

export function getNutritionProfile(db) {
  let profile = db.prepare('SELECT * FROM nutrition_profile WHERE id = ?').get('default');
  if (!profile) {
    db.prepare(`
      INSERT INTO nutrition_profile (id, goal, use_net_carbs)
      VALUES ('default', 'maintain', 0)
    `).run();
    profile = db.prepare('SELECT * FROM nutrition_profile WHERE id = ?').get('default');
  }
  return profile;
}

export function listLogsByDate(db, date) {
  return db
    .prepare(
      `SELECT * FROM food_logs WHERE date = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(date);
}

export function sumTotals(logs = []) {
  const totals = {
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  };
  for (const log of logs) {
    totals.kcal += Number(log.kcal) || 0;
    totals.protein_g += Number(log.protein_g) || 0;
    totals.carbs_g += Number(log.carbs_g) || 0;
    totals.fat_g += Number(log.fat_g) || 0;
    totals.fiber_g += Number(log.fiber_g) || 0;
  }
  return {
    kcal: Math.round(totals.kcal),
    protein_g: Math.round(totals.protein_g * 10) / 10,
    carbs_g: Math.round(totals.carbs_g * 10) / 10,
    fat_g: Math.round(totals.fat_g * 10) / 10,
    fiber_g: Math.round(totals.fiber_g * 10) / 10,
  };
}

function emptyBySlot() {
  return {
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: [],
    other: [],
  };
}

export function buildDayPayload(db, date) {
  const logs = listLogsByDate(db, date);
  const profile = getNutritionProfile(db);
  const by_slot = emptyBySlot();
  for (const log of logs) {
    const slot = MEAL_SLOTS.includes(log.meal_slot) ? log.meal_slot : 'other';
    by_slot[slot].push(log);
  }
  return {
    date,
    logs,
    totals: sumTotals(logs),
    targets: {
      kcal: profile.target_kcal ?? null,
      protein_g: profile.target_protein_g ?? null,
      carbs_g: profile.target_carbs_g ?? null,
      fat_g: profile.target_fat_g ?? null,
    },
    by_slot,
  };
}

/** Shape estável sem DB (testes / fallback) */
export function getDayEmpty(date) {
  return {
    date,
    logs: [],
    totals: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    targets: {
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    },
    by_slot: emptyBySlot(),
  };
}
