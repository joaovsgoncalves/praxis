/** Nutrição / macros — schema + helpers (fase 0–1: day/profile/meta) */

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];

export const NUTRITION_GOALS = ['lose', 'maintain', 'gain'];
export const NUTRITION_ACTIVITIES = ['sedentary', 'light', 'moderate', 'active', 'very'];
export const NUTRITION_SEXES = ['male', 'female', 'other'];

const ACTIVITY_FACTOR = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very: 1.9,
};

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

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function intOrNull(v) {
  const n = numOrNull(v);
  if (n == null) return null;
  return Math.round(n);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Sugestão de metas (Mifflin-St Jeor + macros simples).
 * UI não expõe nomes de fórmula — só números.
 */
export function suggestNutritionTargets(input = {}) {
  const weight = numOrNull(input.weight_kg);
  const height = numOrNull(input.height_cm);
  const birthYear = intOrNull(input.birth_year);
  const sex = NUTRITION_SEXES.includes(input.sex) ? input.sex : 'male';
  const activity = NUTRITION_ACTIVITIES.includes(input.activity) ? input.activity : 'moderate';
  const goal = NUTRITION_GOALS.includes(input.goal) ? input.goal : 'maintain';

  if (weight == null || weight <= 0) {
    return { error: 'informe o peso (kg)' };
  }
  if (height == null || height <= 0) {
    return { error: 'informe a altura (cm)' };
  }

  const yearNow = new Date().getFullYear();
  let age = 30;
  if (birthYear != null && birthYear >= 1920 && birthYear <= yearNow) {
    age = clamp(yearNow - birthYear, 14, 100);
  }

  // Mifflin-St Jeor
  let bmr =
    sex === 'female'
      ? 10 * weight + 6.25 * height - 5 * age - 161
      : 10 * weight + 6.25 * height - 5 * age + 5;

  const tdee = bmr * (ACTIVITY_FACTOR[activity] || ACTIVITY_FACTOR.moderate);
  let targetKcal = tdee;
  if (goal === 'lose') targetKcal = tdee * 0.8;
  if (goal === 'gain') targetKcal = tdee * 1.1;
  targetKcal = Math.round(clamp(targetKcal, 1200, 6000) / 10) * 10;

  const proteinPerKg = goal === 'lose' ? 2.0 : goal === 'gain' ? 1.8 : 1.7;
  const fatPerKg = goal === 'lose' ? 0.8 : 1.0;
  let protein_g = Math.round(weight * proteinPerKg);
  let fat_g = Math.round(weight * fatPerKg);
  const proteinKcal = protein_g * 4;
  const fatKcal = fat_g * 9;
  let carbs_g = Math.round((targetKcal - proteinKcal - fatKcal) / 4);
  if (carbs_g < 50) {
    carbs_g = 50;
    // rebalance fat slightly if carbs hit floor
    const leftover = targetKcal - proteinKcal - carbs_g * 4;
    fat_g = Math.max(20, Math.round(leftover / 9));
  }

  const fiber_g = Math.round(clamp(targetKcal / 1000 * 14, 20, 45));

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    target_kcal: targetKcal,
    target_protein_g: protein_g,
    target_carbs_g: carbs_g,
    target_fat_g: fat_g,
    target_fiber_g: fiber_g,
    goal,
    activity,
    sex,
    weight_kg: weight,
    height_cm: height,
    birth_year: birthYear,
  };
}

export function updateNutritionProfile(db, body = {}) {
  const existing = getNutritionProfile(db);
  const next = {
    sex:
      body.sex !== undefined
        ? body.sex === null || body.sex === ''
          ? null
          : NUTRITION_SEXES.includes(body.sex)
            ? body.sex
            : existing.sex
        : existing.sex,
    birth_year:
      body.birth_year !== undefined ? intOrNull(body.birth_year) : existing.birth_year,
    height_cm: body.height_cm !== undefined ? numOrNull(body.height_cm) : existing.height_cm,
    weight_kg: body.weight_kg !== undefined ? numOrNull(body.weight_kg) : existing.weight_kg,
    activity:
      body.activity !== undefined && NUTRITION_ACTIVITIES.includes(body.activity)
        ? body.activity
        : existing.activity || 'moderate',
    goal:
      body.goal !== undefined && NUTRITION_GOALS.includes(body.goal)
        ? body.goal
        : existing.goal || 'maintain',
    target_kcal:
      body.target_kcal !== undefined ? intOrNull(body.target_kcal) : existing.target_kcal,
    target_protein_g:
      body.target_protein_g !== undefined
        ? numOrNull(body.target_protein_g)
        : existing.target_protein_g,
    target_carbs_g:
      body.target_carbs_g !== undefined
        ? numOrNull(body.target_carbs_g)
        : existing.target_carbs_g,
    target_fat_g:
      body.target_fat_g !== undefined ? numOrNull(body.target_fat_g) : existing.target_fat_g,
    target_fiber_g:
      body.target_fiber_g !== undefined
        ? numOrNull(body.target_fiber_g)
        : existing.target_fiber_g,
    use_net_carbs:
      body.use_net_carbs !== undefined
        ? body.use_net_carbs === true ||
          body.use_net_carbs === 1 ||
          body.use_net_carbs === '1'
          ? 1
          : 0
        : existing.use_net_carbs ?? 0,
  };

  // soft bounds
  if (next.weight_kg != null) next.weight_kg = clamp(next.weight_kg, 30, 300);
  if (next.height_cm != null) next.height_cm = clamp(next.height_cm, 100, 250);
  if (next.target_kcal != null) next.target_kcal = clamp(next.target_kcal, 800, 8000);
  for (const k of ['target_protein_g', 'target_carbs_g', 'target_fat_g', 'target_fiber_g']) {
    if (next[k] != null) next[k] = Math.round(clamp(next[k], 0, 1000) * 10) / 10;
  }

  db.prepare(`
    UPDATE nutrition_profile SET
      sex = ?,
      birth_year = ?,
      height_cm = ?,
      weight_kg = ?,
      activity = ?,
      goal = ?,
      target_kcal = ?,
      target_protein_g = ?,
      target_carbs_g = ?,
      target_fat_g = ?,
      target_fiber_g = ?,
      use_net_carbs = ?,
      updated_at = datetime('now')
    WHERE id = 'default'
  `).run(
    next.sex,
    next.birth_year,
    next.height_cm,
    next.weight_kg,
    next.activity,
    next.goal,
    next.target_kcal,
    next.target_protein_g,
    next.target_carbs_g,
    next.target_fat_g,
    next.target_fiber_g,
    next.use_net_carbs,
  );

  return getNutritionProfile(db);
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
