import { randomUUID } from 'crypto';

export const WORKOUT_TRACKING_TYPES = [
  'reps',
  'weight_reps',
  'duration',
  'distance',
  'distance_duration',
];

export const WORKOUT_EXERCISE_CATEGORIES = [
  'strength',
  'calisthenics',
  'skill',
  'cardio',
  'mobility',
  'other',
];

const WORKOUT_DAY_TYPES = ['training', 'rest'];
const WORKOUT_SESSION_STATUSES = ['active', 'completed', 'abandoned'];

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function intOrNull(value, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  let n = Math.round(parsed);
  if (min !== null) n = Math.max(min, n);
  if (max !== null) n = Math.min(max, n);
  return n;
}

function numberOrNull(value, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  let n = parsed;
  if (min !== null) n = Math.max(min, n);
  if (max !== null) n = Math.min(max, n);
  return n;
}

function boolInt(value, fallback = 0) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function safeLimit(value, fallback = 30, max = 100) {
  const n = intOrNull(value, { min: 1, max });
  return n ?? fallback;
}

function nextPosition(db, table, parentColumn, parentId) {
  const allowed = {
    workout_days: 'program_id',
    workout_day_exercises: 'workout_day_id',
  };
  if (allowed[table] !== parentColumn) throw new Error('Invalid sortable workout table');
  const row = db
    .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM ${table} WHERE ${parentColumn} = ?`)
    .get(parentId);
  return Number(row?.next_position || 0);
}

export function initWorkoutSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workout_exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'strength',
      muscle_group TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      tracking_type TEXT DEFAULT 'reps',
      instructions TEXT DEFAULT '',
      is_custom INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workout_programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 0,
      current_day_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workout_days (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      name TEXT NOT NULL,
      day_type TEXT DEFAULT 'training',
      position INTEGER DEFAULT 0,
      estimated_duration_minutes INTEGER,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (program_id) REFERENCES workout_programs(id)
    );

    CREATE TABLE IF NOT EXISTS workout_day_exercises (
      id TEXT PRIMARY KEY,
      workout_day_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      target_sets INTEGER DEFAULT 3,
      rep_min INTEGER,
      rep_max INTEGER,
      target_duration_seconds INTEGER,
      rest_seconds INTEGER DEFAULT 90,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workout_day_id) REFERENCES workout_days(id),
      FOREIGN KEY (exercise_id) REFERENCES workout_exercises(id)
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      workout_program_id TEXT,
      workout_day_id TEXT,
      program_name_snapshot TEXT DEFAULT '',
      workout_day_name_snapshot TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_seconds INTEGER,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workout_program_id) REFERENCES workout_programs(id),
      FOREIGN KEY (workout_day_id) REFERENCES workout_days(id)
    );

    CREATE TABLE IF NOT EXISTS workout_session_exercises (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workout_day_exercise_id TEXT,
      exercise_id TEXT,
      exercise_name_snapshot TEXT NOT NULL,
      tracking_type TEXT DEFAULT 'reps',
      position INTEGER DEFAULT 0,
      target_sets INTEGER DEFAULT 3,
      rep_min INTEGER,
      rep_max INTEGER,
      target_duration_seconds INTEGER,
      rest_seconds INTEGER DEFAULT 90,
      notes TEXT DEFAULT '',
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
      FOREIGN KEY (workout_day_exercise_id) REFERENCES workout_day_exercises(id),
      FOREIGN KEY (exercise_id) REFERENCES workout_exercises(id)
    );

    CREATE TABLE IF NOT EXISTS workout_session_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      session_exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight_kg REAL,
      reps INTEGER,
      duration_seconds INTEGER,
      distance_m REAL,
      notes TEXT DEFAULT '',
      completed_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
      FOREIGN KEY (session_exercise_id) REFERENCES workout_session_exercises(id)
    );

    CREATE INDEX IF NOT EXISTS idx_workout_exercises_name ON workout_exercises(name);
    CREATE INDEX IF NOT EXISTS idx_workout_exercises_status ON workout_exercises(status);
    CREATE INDEX IF NOT EXISTS idx_workout_programs_active ON workout_programs(is_active);
    CREATE INDEX IF NOT EXISTS idx_workout_days_program_position ON workout_days(program_id, position);
    CREATE INDEX IF NOT EXISTS idx_workout_day_exercises_day_position ON workout_day_exercises(workout_day_id, position);
    CREATE INDEX IF NOT EXISTS idx_workout_sessions_status_started ON workout_sessions(status, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workout_sessions_day_started ON workout_sessions(workout_day_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workout_session_exercises_session_position ON workout_session_exercises(session_id, position);
    CREATE INDEX IF NOT EXISTS idx_workout_session_sets_exercise_number ON workout_session_sets(session_exercise_id, set_number);
  `);
}

function normalizeExerciseBody(body = {}, existing = null) {
  const name = text(body.name, existing?.name || '');
  const category = WORKOUT_EXERCISE_CATEGORIES.includes(body.category)
    ? body.category
    : existing?.category || 'strength';
  const trackingType = WORKOUT_TRACKING_TYPES.includes(body.tracking_type)
    ? body.tracking_type
    : existing?.tracking_type || 'reps';

  return {
    name,
    category,
    muscle_group: body.muscle_group !== undefined ? text(body.muscle_group) : existing?.muscle_group || '',
    equipment: body.equipment !== undefined ? text(body.equipment) : existing?.equipment || '',
    tracking_type: trackingType,
    instructions: body.instructions !== undefined ? text(body.instructions) : existing?.instructions || '',
  };
}

function exerciseRowsForDay(db, dayId) {
  return db.prepare(`
    SELECT
      wde.id,
      wde.workout_day_id,
      wde.exercise_id,
      wde.position,
      wde.target_sets,
      wde.rep_min,
      wde.rep_max,
      wde.target_duration_seconds,
      wde.rest_seconds,
      wde.notes,
      e.name AS exercise_name,
      e.category AS exercise_category,
      e.muscle_group AS muscle_group,
      e.equipment AS equipment,
      e.tracking_type AS tracking_type,
      e.instructions AS instructions
    FROM workout_day_exercises wde
    JOIN workout_exercises e ON e.id = wde.exercise_id
    WHERE wde.workout_day_id = ?
    ORDER BY wde.position ASC, wde.created_at ASC
  `).all(dayId);
}

function dayRowsForProgram(db, programId, { withExercises = true } = {}) {
  const days = db.prepare(`
    SELECT
      d.*,
      (SELECT COUNT(*) FROM workout_day_exercises wde WHERE wde.workout_day_id = d.id) AS exercise_count
    FROM workout_days d
    WHERE d.program_id = ?
    ORDER BY d.position ASC, d.created_at ASC
  `).all(programId);

  if (!withExercises) return days;
  return days.map((day) => ({ ...day, exercises: exerciseRowsForDay(db, day.id) }));
}

function getProgram(db, programId, { withExercises = true } = {}) {
  const program = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(programId);
  if (!program) return null;
  return {
    ...program,
    days: dayRowsForProgram(db, program.id, { withExercises }),
  };
}

function currentDayForProgram(program) {
  if (!program?.days?.length) return null;
  return program.days.find((day) => day.id === program.current_day_id) || program.days[0];
}

function getActiveProgram(db, { withExercises = true } = {}) {
  let program = db.prepare(`
    SELECT * FROM workout_programs
    WHERE is_active = 1
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get();

  if (!program) {
    program = db.prepare('SELECT * FROM workout_programs ORDER BY created_at ASC LIMIT 1').get();
  }
  if (!program) return null;
  return getProgram(db, program.id, { withExercises });
}

function getSessionSummary(db, sessionId) {
  return db.prepare(`
    SELECT
      s.*,
      (SELECT COUNT(*) FROM workout_session_exercises se WHERE se.session_id = s.id) AS exercise_count,
      (SELECT COUNT(*) FROM workout_session_sets ss WHERE ss.session_id = s.id) AS completed_sets
    FROM workout_sessions s
    WHERE s.id = ?
  `).get(sessionId);
}

function getPreviousSets(db, sessionExercise, session) {
  if (!sessionExercise?.exercise_id || !session?.started_at) return [];
  const previousExercise = db.prepare(`
    SELECT se.id
    FROM workout_session_exercises se
    JOIN workout_sessions s ON s.id = se.session_id
    WHERE se.exercise_id = ?
      AND s.status = 'completed'
      AND s.started_at < ?
      AND s.id != ?
    ORDER BY s.started_at DESC
    LIMIT 1
  `).get(sessionExercise.exercise_id, session.started_at, session.id);
  if (!previousExercise) return [];
  return db.prepare(`
    SELECT * FROM workout_session_sets
    WHERE session_exercise_id = ?
    ORDER BY set_number ASC, completed_at ASC
  `).all(previousExercise.id);
}

function getSessionDetail(db, sessionId) {
  const session = getSessionSummary(db, sessionId);
  if (!session) return null;
  const exercises = db.prepare(`
    SELECT * FROM workout_session_exercises
    WHERE session_id = ?
    ORDER BY position ASC
  `).all(sessionId).map((exercise) => ({
    ...exercise,
    sets: db.prepare(`
      SELECT * FROM workout_session_sets
      WHERE session_exercise_id = ?
      ORDER BY set_number ASC, completed_at ASC
    `).all(exercise.id),
    previous_sets: getPreviousSets(db, exercise, session),
  }));
  return { ...session, exercises };
}

function normalizeDayExerciseBody(body = {}, existing = null) {
  const targetSets = intOrNull(body.target_sets, { min: 1, max: 20 }) ?? existing?.target_sets ?? 3;
  let repMin = intOrNull(body.rep_min, { min: 0, max: 10000 });
  let repMax = intOrNull(body.rep_max, { min: 0, max: 10000 });
  if (body.rep_min === undefined && existing) repMin = existing.rep_min;
  if (body.rep_max === undefined && existing) repMax = existing.rep_max;
  if (repMin !== null && repMax !== null && repMax < repMin) {
    [repMin, repMax] = [repMax, repMin];
  }

  return {
    target_sets: targetSets,
    rep_min: repMin,
    rep_max: repMax,
    target_duration_seconds:
      body.target_duration_seconds === undefined && existing
        ? existing.target_duration_seconds
        : intOrNull(body.target_duration_seconds, { min: 1, max: 86400 }),
    rest_seconds:
      intOrNull(body.rest_seconds, { min: 0, max: 3600 }) ?? existing?.rest_seconds ?? 90,
    notes: body.notes !== undefined ? text(body.notes) : existing?.notes || '',
  };
}

function nextDayId(db, programId, currentDayId) {
  const days = dayRowsForProgram(db, programId, { withExercises: false });
  if (!days.length) return null;
  const index = days.findIndex((day) => day.id === currentDayId);
  if (index < 0) return days[0].id;
  return days[(index + 1) % days.length].id;
}

function advanceProgram(db, programId, currentDayId = null) {
  const program = getProgram(db, programId, { withExercises: false });
  if (!program) return null;
  const current = currentDayId || currentDayForProgram(program)?.id || null;
  const next = nextDayId(db, programId, current);
  db.prepare(`
    UPDATE workout_programs
    SET current_day_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(next, programId);
  return getProgram(db, programId);
}

function setActiveProgram(db, programId) {
  const program = db.prepare('SELECT id FROM workout_programs WHERE id = ?').get(programId);
  if (!program) return null;
  const tx = db.transaction(() => {
    db.prepare('UPDATE workout_programs SET is_active = 0').run();
    db.prepare(`
      UPDATE workout_programs
      SET is_active = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(programId);
  });
  tx();
  return getProgram(db, programId);
}

function sessionSetPayload(body = {}, existing = null) {
  return {
    weight_kg:
      body.weight_kg === undefined && existing
        ? existing.weight_kg
        : numberOrNull(body.weight_kg, { min: 0, max: 5000 }),
    reps:
      body.reps === undefined && existing
        ? existing.reps
        : intOrNull(body.reps, { min: 0, max: 100000 }),
    duration_seconds:
      body.duration_seconds === undefined && existing
        ? existing.duration_seconds
        : intOrNull(body.duration_seconds, { min: 0, max: 86400 }),
    distance_m:
      body.distance_m === undefined && existing
        ? existing.distance_m
        : numberOrNull(body.distance_m, { min: 0, max: 10000000 }),
    notes: body.notes !== undefined ? text(body.notes) : existing?.notes || '',
  };
}

function validateSetForTracking(trackingType, payload) {
  if (trackingType === 'duration') return payload.duration_seconds !== null;
  if (trackingType === 'distance') return payload.distance_m !== null;
  if (trackingType === 'distance_duration') {
    return payload.distance_m !== null || payload.duration_seconds !== null;
  }
  return payload.reps !== null;
}

export function registerWorkoutRoutes(app, db) {
  const handle = (fn) => (req, res) => {
    try {
      return fn(req, res);
    } catch (error) {
      console.error('Workout route error:', error);
      return res.status(500).json({ error: 'Não foi possível concluir a ação de treino.' });
    }
  };

  app.get('/api/workouts/summary', handle((req, res) => {
    const program = getActiveProgram(db);
    const activeSession = db.prepare(`
      SELECT * FROM workout_sessions
      WHERE status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `).get();
    const totalCompleted = db.prepare(`
      SELECT COUNT(*) AS count FROM workout_sessions WHERE status = 'completed'
    `).get()?.count || 0;
    const currentDay = currentDayForProgram(program);

    res.json({
      active_program: program,
      current_day: currentDay,
      active_session: activeSession ? getSessionSummary(db, activeSession.id) : null,
      total_completed: Number(totalCompleted),
    });
  }));

  app.get('/api/workouts/programs', handle((req, res) => {
    const programs = db.prepare(`
      SELECT
        p.*,
        (SELECT COUNT(*) FROM workout_days d WHERE d.program_id = p.id) AS day_count,
        (SELECT COUNT(*) FROM workout_sessions s WHERE s.workout_program_id = p.id AND s.status = 'completed') AS completed_sessions
      FROM workout_programs p
      ORDER BY p.is_active DESC, p.updated_at DESC, p.created_at DESC
    `).all();
    res.json(programs);
  }));

  app.post('/api/workouts/programs', handle((req, res) => {
    const name = text(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Dê um nome ao programa.' });
    const id = randomUUID();
    const hasPrograms = db.prepare('SELECT COUNT(*) AS count FROM workout_programs').get()?.count > 0;
    const isActive = boolInt(req.body?.is_active, hasPrograms ? 0 : 1);

    const tx = db.transaction(() => {
      if (isActive) db.prepare('UPDATE workout_programs SET is_active = 0').run();
      db.prepare(`
        INSERT INTO workout_programs (id, name, description, is_active)
        VALUES (?, ?, ?, ?)
      `).run(id, name, text(req.body?.description), isActive);
    });
    tx();
    res.status(201).json(getProgram(db, id));
  }));

  app.get('/api/workouts/programs/:id', handle((req, res) => {
    const program = getProgram(db, req.params.id);
    if (!program) return res.status(404).json({ error: 'Programa não encontrado.' });
    res.json(program);
  }));

  app.patch('/api/workouts/programs/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Programa não encontrado.' });

    const name = req.body?.name !== undefined ? text(req.body.name) : existing.name;
    if (!name) return res.status(400).json({ error: 'Dê um nome ao programa.' });

    if (req.body?.current_day_id !== undefined && req.body.current_day_id !== null) {
      const validDay = db.prepare(`
        SELECT id FROM workout_days WHERE id = ? AND program_id = ?
      `).get(req.body.current_day_id, existing.id);
      if (!validDay) return res.status(400).json({ error: 'Esse dia não pertence ao programa.' });
    }

    db.prepare(`
      UPDATE workout_programs
      SET name = ?, description = ?, current_day_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name,
      req.body?.description !== undefined ? text(req.body.description) : existing.description,
      req.body?.current_day_id !== undefined ? req.body.current_day_id : existing.current_day_id,
      existing.id,
    );

    if (req.body?.is_active === true || req.body?.is_active === 1) {
      setActiveProgram(db, existing.id);
    }
    res.json(getProgram(db, existing.id));
  }));

  app.post('/api/workouts/programs/:id/activate', handle((req, res) => {
    const program = setActiveProgram(db, req.params.id);
    if (!program) return res.status(404).json({ error: 'Programa não encontrado.' });
    res.json(program);
  }));

  app.post('/api/workouts/programs/:id/advance', handle((req, res) => {
    const program = advanceProgram(db, req.params.id, req.body?.current_day_id || null);
    if (!program) return res.status(404).json({ error: 'Programa não encontrado.' });
    res.json(program);
  }));

  app.delete('/api/workouts/programs/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Programa não encontrado.' });

    const tx = db.transaction(() => {
      const dayIds = db.prepare('SELECT id FROM workout_days WHERE program_id = ?').all(existing.id).map((r) => r.id);
      for (const dayId of dayIds) {
        const dayExerciseIds = db.prepare('SELECT id FROM workout_day_exercises WHERE workout_day_id = ?').all(dayId).map((r) => r.id);
        for (const dayExerciseId of dayExerciseIds) {
          db.prepare('UPDATE workout_session_exercises SET workout_day_exercise_id = NULL WHERE workout_day_exercise_id = ?').run(dayExerciseId);
        }
        db.prepare('DELETE FROM workout_day_exercises WHERE workout_day_id = ?').run(dayId);
        db.prepare('UPDATE workout_sessions SET workout_day_id = NULL WHERE workout_day_id = ?').run(dayId);
      }
      db.prepare('UPDATE workout_sessions SET workout_program_id = NULL WHERE workout_program_id = ?').run(existing.id);
      db.prepare('DELETE FROM workout_days WHERE program_id = ?').run(existing.id);
      db.prepare('DELETE FROM workout_programs WHERE id = ?').run(existing.id);
    });
    tx();

    if (existing.is_active) {
      const fallback = db.prepare('SELECT id FROM workout_programs ORDER BY created_at ASC LIMIT 1').get();
      if (fallback) setActiveProgram(db, fallback.id);
    }
    res.json({ success: true });
  }));

  app.post('/api/workouts/programs/:id/days', handle((req, res) => {
    const program = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(req.params.id);
    if (!program) return res.status(404).json({ error: 'Programa não encontrado.' });
    const name = text(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Dê um nome ao dia.' });
    const dayType = WORKOUT_DAY_TYPES.includes(req.body?.day_type) ? req.body.day_type : 'training';
    const id = randomUUID();
    const position = nextPosition(db, 'workout_days', 'program_id', program.id);
    const duration = intOrNull(req.body?.estimated_duration_minutes, { min: 1, max: 1440 });

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO workout_days (
          id, program_id, name, day_type, position, estimated_duration_minutes, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, program.id, name, dayType, position, duration, text(req.body?.notes));
      if (!program.current_day_id) {
        db.prepare(`
          UPDATE workout_programs
          SET current_day_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(id, program.id);
      }
    });
    tx();
    res.status(201).json(getProgram(db, program.id));
  }));

  app.patch('/api/workouts/days/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_days WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Dia não encontrado.' });
    const name = req.body?.name !== undefined ? text(req.body.name) : existing.name;
    if (!name) return res.status(400).json({ error: 'Dê um nome ao dia.' });
    const dayType = WORKOUT_DAY_TYPES.includes(req.body?.day_type) ? req.body.day_type : existing.day_type;
    const duration = req.body?.estimated_duration_minutes === undefined
      ? existing.estimated_duration_minutes
      : intOrNull(req.body.estimated_duration_minutes, { min: 1, max: 1440 });

    db.prepare(`
      UPDATE workout_days
      SET name = ?, day_type = ?, estimated_duration_minutes = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name,
      dayType,
      duration,
      req.body?.notes !== undefined ? text(req.body.notes) : existing.notes,
      existing.id,
    );
    res.json(getProgram(db, existing.program_id));
  }));

  app.delete('/api/workouts/days/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_days WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Dia não encontrado.' });

    const tx = db.transaction(() => {
      const dayExerciseIds = db.prepare('SELECT id FROM workout_day_exercises WHERE workout_day_id = ?').all(existing.id).map((r) => r.id);
      for (const dayExerciseId of dayExerciseIds) {
        db.prepare('UPDATE workout_session_exercises SET workout_day_exercise_id = NULL WHERE workout_day_exercise_id = ?').run(dayExerciseId);
      }
      db.prepare('DELETE FROM workout_day_exercises WHERE workout_day_id = ?').run(existing.id);
      db.prepare('UPDATE workout_sessions SET workout_day_id = NULL WHERE workout_day_id = ?').run(existing.id);
      db.prepare('DELETE FROM workout_days WHERE id = ?').run(existing.id);

      const program = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(existing.program_id);
      if (program?.current_day_id === existing.id) {
        const first = db.prepare(`
          SELECT id FROM workout_days WHERE program_id = ? ORDER BY position ASC LIMIT 1
        `).get(existing.program_id);
        db.prepare(`
          UPDATE workout_programs
          SET current_day_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(first?.id || null, existing.program_id);
      }
    });
    tx();
    res.json(getProgram(db, existing.program_id));
  }));

  app.patch('/api/workouts/programs/:id/days/reorder', handle((req, res) => {
    const ids = Array.isArray(req.body?.ordered_ids) ? req.body.ordered_ids.map(String) : [];
    const actual = db.prepare('SELECT id FROM workout_days WHERE program_id = ?').all(req.params.id).map((r) => r.id);
    if (ids.length !== actual.length || actual.some((id) => !ids.includes(id))) {
      return res.status(400).json({ error: 'A ordem enviada não corresponde aos dias do programa.' });
    }
    const update = db.prepare('UPDATE workout_days SET position = ?, updated_at = datetime(\'now\') WHERE id = ?');
    const tx = db.transaction(() => ids.forEach((id, index) => update.run(index, id)));
    tx();
    res.json(getProgram(db, req.params.id));
  }));

  app.get('/api/workouts/exercises', handle((req, res) => {
    const q = text(req.query?.q);
    const limit = safeLimit(req.query?.limit, 50, 200);
    let sql = `
      SELECT e.*,
        (SELECT COUNT(*) FROM workout_day_exercises wde WHERE wde.exercise_id = e.id) AS usage_count
      FROM workout_exercises e
      WHERE e.status = 'active'
    `;
    const params = [];
    if (q) {
      sql += ' AND (LOWER(e.name) LIKE LOWER(?) OR LOWER(e.muscle_group) LIKE LOWER(?) OR LOWER(e.equipment) LIKE LOWER(?))';
      const needle = `%${q}%`;
      params.push(needle, needle, needle);
    }
    sql += ' ORDER BY usage_count DESC, e.updated_at DESC, e.name ASC LIMIT ?';
    params.push(limit);
    res.json(db.prepare(sql).all(...params));
  }));

  app.post('/api/workouts/exercises', handle((req, res) => {
    const payload = normalizeExerciseBody(req.body);
    if (!payload.name) return res.status(400).json({ error: 'Dê um nome ao exercício.' });
    const duplicate = db.prepare(`
      SELECT * FROM workout_exercises WHERE LOWER(name) = LOWER(?) AND status = 'active' LIMIT 1
    `).get(payload.name);
    if (duplicate) return res.status(409).json({ error: 'Esse exercício já existe.', exercise: duplicate });
    const id = randomUUID();
    db.prepare(`
      INSERT INTO workout_exercises (
        id, name, category, muscle_group, equipment, tracking_type, instructions, is_custom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      payload.name,
      payload.category,
      payload.muscle_group,
      payload.equipment,
      payload.tracking_type,
      payload.instructions,
    );
    res.status(201).json(db.prepare('SELECT * FROM workout_exercises WHERE id = ?').get(id));
  }));

  app.patch('/api/workouts/exercises/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_exercises WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Exercício não encontrado.' });
    const payload = normalizeExerciseBody(req.body, existing);
    if (!payload.name) return res.status(400).json({ error: 'Dê um nome ao exercício.' });
    db.prepare(`
      UPDATE workout_exercises
      SET name = ?, category = ?, muscle_group = ?, equipment = ?, tracking_type = ?, instructions = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      payload.name,
      payload.category,
      payload.muscle_group,
      payload.equipment,
      payload.tracking_type,
      payload.instructions,
      existing.id,
    );
    res.json(db.prepare('SELECT * FROM workout_exercises WHERE id = ?').get(existing.id));
  }));

  app.delete('/api/workouts/exercises/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_exercises WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Exercício não encontrado.' });
    db.prepare(`
      UPDATE workout_exercises SET status = 'archived', updated_at = datetime('now') WHERE id = ?
    `).run(existing.id);
    res.json({ success: true });
  }));

  app.post('/api/workouts/days/:id/exercises', handle((req, res) => {
    const day = db.prepare('SELECT * FROM workout_days WHERE id = ?').get(req.params.id);
    if (!day) return res.status(404).json({ error: 'Dia não encontrado.' });
    if (day.day_type === 'rest') return res.status(400).json({ error: 'Dia de descanso não recebe exercícios.' });
    const exercise = db.prepare('SELECT * FROM workout_exercises WHERE id = ? AND status = \'active\'').get(req.body?.exercise_id);
    if (!exercise) return res.status(404).json({ error: 'Exercício não encontrado.' });
    const id = randomUUID();
    const position = nextPosition(db, 'workout_day_exercises', 'workout_day_id', day.id);
    const config = normalizeDayExerciseBody(req.body);
    db.prepare(`
      INSERT INTO workout_day_exercises (
        id, workout_day_id, exercise_id, position, target_sets, rep_min, rep_max,
        target_duration_seconds, rest_seconds, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      day.id,
      exercise.id,
      position,
      config.target_sets,
      config.rep_min,
      config.rep_max,
      config.target_duration_seconds,
      config.rest_seconds,
      config.notes,
    );
    res.status(201).json(getProgram(db, day.program_id));
  }));

  app.patch('/api/workouts/day-exercises/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_day_exercises WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Exercício do treino não encontrado.' });
    const config = normalizeDayExerciseBody(req.body, existing);
    db.prepare(`
      UPDATE workout_day_exercises
      SET target_sets = ?, rep_min = ?, rep_max = ?, target_duration_seconds = ?, rest_seconds = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      config.target_sets,
      config.rep_min,
      config.rep_max,
      config.target_duration_seconds,
      config.rest_seconds,
      config.notes,
      existing.id,
    );
    const day = db.prepare('SELECT * FROM workout_days WHERE id = ?').get(existing.workout_day_id);
    res.json(getProgram(db, day.program_id));
  }));

  app.delete('/api/workouts/day-exercises/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_day_exercises WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Exercício do treino não encontrado.' });
    const day = db.prepare('SELECT * FROM workout_days WHERE id = ?').get(existing.workout_day_id);
    db.prepare('UPDATE workout_session_exercises SET workout_day_exercise_id = NULL WHERE workout_day_exercise_id = ?').run(existing.id);
    db.prepare('DELETE FROM workout_day_exercises WHERE id = ?').run(existing.id);
    res.json(getProgram(db, day.program_id));
  }));

  app.patch('/api/workouts/days/:id/exercises/reorder', handle((req, res) => {
    const day = db.prepare('SELECT * FROM workout_days WHERE id = ?').get(req.params.id);
    if (!day) return res.status(404).json({ error: 'Dia não encontrado.' });
    const ids = Array.isArray(req.body?.ordered_ids) ? req.body.ordered_ids.map(String) : [];
    const actual = db.prepare('SELECT id FROM workout_day_exercises WHERE workout_day_id = ?').all(day.id).map((r) => r.id);
    if (ids.length !== actual.length || actual.some((id) => !ids.includes(id))) {
      return res.status(400).json({ error: 'A ordem enviada não corresponde aos exercícios do treino.' });
    }
    const update = db.prepare('UPDATE workout_day_exercises SET position = ?, updated_at = datetime(\'now\') WHERE id = ?');
    const tx = db.transaction(() => ids.forEach((id, index) => update.run(index, id)));
    tx();
    res.json(getProgram(db, day.program_id));
  }));

  app.get('/api/workouts/sessions', handle((req, res) => {
    const limit = safeLimit(req.query?.limit, 30, 200);
    const status = WORKOUT_SESSION_STATUSES.includes(req.query?.status) ? req.query.status : 'completed';
    const rows = db.prepare(`
      SELECT
        s.*,
        (SELECT COUNT(*) FROM workout_session_exercises se WHERE se.session_id = s.id) AS exercise_count,
        (SELECT COUNT(*) FROM workout_session_sets ss WHERE ss.session_id = s.id) AS completed_sets
      FROM workout_sessions s
      WHERE s.status = ?
      ORDER BY s.started_at DESC
      LIMIT ?
    `).all(status, limit);
    res.json(rows);
  }));

  app.get('/api/workouts/sessions/active', handle((req, res) => {
    const active = db.prepare(`
      SELECT id FROM workout_sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1
    `).get();
    res.json(active ? getSessionDetail(db, active.id) : null);
  }));

  app.post('/api/workouts/sessions', handle((req, res) => {
    const day = db.prepare(`
      SELECT d.*, p.name AS program_name
      FROM workout_days d
      JOIN workout_programs p ON p.id = d.program_id
      WHERE d.id = ?
    `).get(req.body?.workout_day_id);
    if (!day) return res.status(404).json({ error: 'Treino não encontrado.' });
    if (day.day_type === 'rest') return res.status(400).json({ error: 'Esse é um dia de descanso.' });

    const existingActive = db.prepare(`
      SELECT id FROM workout_sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1
    `).get();
    if (existingActive) {
      return res.status(409).json({ error: 'Já existe um treino em andamento.', session: getSessionDetail(db, existingActive.id) });
    }

    const dayExercises = exerciseRowsForDay(db, day.id);
    if (!dayExercises.length) return res.status(400).json({ error: 'Adicione pelo menos um exercício antes de começar.' });

    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const insertSessionExercise = db.prepare(`
      INSERT INTO workout_session_exercises (
        id, session_id, workout_day_exercise_id, exercise_id, exercise_name_snapshot,
        tracking_type, position, target_sets, rep_min, rep_max, target_duration_seconds,
        rest_seconds, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO workout_sessions (
          id, workout_program_id, workout_day_id, program_name_snapshot,
          workout_day_name_snapshot, status, started_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?)
      `).run(sessionId, day.program_id, day.id, day.program_name, day.name, startedAt);

      for (const item of dayExercises) {
        insertSessionExercise.run(
          randomUUID(),
          sessionId,
          item.id,
          item.exercise_id,
          item.exercise_name,
          item.tracking_type,
          item.position,
          item.target_sets,
          item.rep_min,
          item.rep_max,
          item.target_duration_seconds,
          item.rest_seconds,
          item.notes,
        );
      }
    });
    tx();
    res.status(201).json(getSessionDetail(db, sessionId));
  }));

  app.get('/api/workouts/sessions/:id', handle((req, res) => {
    const session = getSessionDetail(db, req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    res.json(session);
  }));

  app.post('/api/workouts/sessions/:id/sets', handle((req, res) => {
    const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (session.status !== 'active') return res.status(400).json({ error: 'Essa sessão já foi encerrada.' });

    const sessionExercise = db.prepare(`
      SELECT * FROM workout_session_exercises WHERE id = ? AND session_id = ?
    `).get(req.body?.session_exercise_id, session.id);
    if (!sessionExercise) return res.status(404).json({ error: 'Exercício não pertence à sessão.' });

    const payload = sessionSetPayload(req.body);
    if (!validateSetForTracking(sessionExercise.tracking_type, payload)) {
      return res.status(400).json({ error: 'Preencha o resultado principal desta série.' });
    }
    const nextSet = db.prepare(`
      SELECT COALESCE(MAX(set_number), 0) + 1 AS next_number
      FROM workout_session_sets WHERE session_exercise_id = ?
    `).get(sessionExercise.id)?.next_number || 1;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO workout_session_sets (
        id, session_id, session_exercise_id, set_number, weight_kg, reps,
        duration_seconds, distance_m, notes, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      session.id,
      sessionExercise.id,
      nextSet,
      payload.weight_kg,
      payload.reps,
      payload.duration_seconds,
      payload.distance_m,
      payload.notes,
      new Date().toISOString(),
    );
    res.status(201).json(getSessionDetail(db, session.id));
  }));

  app.patch('/api/workouts/sets/:id', handle((req, res) => {
    const existing = db.prepare(`
      SELECT ss.*, se.tracking_type
      FROM workout_session_sets ss
      JOIN workout_session_exercises se ON se.id = ss.session_exercise_id
      WHERE ss.id = ?
    `).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Série não encontrada.' });
    const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(existing.session_id);
    if (session?.status !== 'active') return res.status(400).json({ error: 'Essa sessão já foi encerrada.' });
    const payload = sessionSetPayload(req.body, existing);
    if (!validateSetForTracking(existing.tracking_type, payload)) {
      return res.status(400).json({ error: 'Preencha o resultado principal desta série.' });
    }
    db.prepare(`
      UPDATE workout_session_sets
      SET weight_kg = ?, reps = ?, duration_seconds = ?, distance_m = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      payload.weight_kg,
      payload.reps,
      payload.duration_seconds,
      payload.distance_m,
      payload.notes,
      existing.id,
    );
    res.json(getSessionDetail(db, existing.session_id));
  }));

  app.delete('/api/workouts/sets/:id', handle((req, res) => {
    const existing = db.prepare('SELECT * FROM workout_session_sets WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Série não encontrada.' });
    const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(existing.session_id);
    if (session?.status !== 'active') return res.status(400).json({ error: 'Essa sessão já foi encerrada.' });
    db.prepare('DELETE FROM workout_session_sets WHERE id = ?').run(existing.id);
    res.json(getSessionDetail(db, existing.session_id));
  }));

  app.post('/api/workouts/sessions/:id/finish', handle((req, res) => {
    const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (session.status !== 'active') return res.status(400).json({ error: 'Essa sessão já foi encerrada.' });
    const setsCount = db.prepare('SELECT COUNT(*) AS count FROM workout_session_sets WHERE session_id = ?').get(session.id)?.count || 0;
    if (!setsCount) return res.status(400).json({ error: 'Registre pelo menos uma série antes de finalizar.' });

    const completedAt = new Date().toISOString();
    const startedMs = Date.parse(session.started_at);
    const durationSeconds = Number.isFinite(startedMs)
      ? Math.max(1, Math.round((Date.parse(completedAt) - startedMs) / 1000))
      : null;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE workout_sessions
        SET status = 'completed', completed_at = ?, duration_seconds = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(completedAt, durationSeconds, text(req.body?.notes, session.notes || ''), session.id);
      if (session.workout_program_id && session.workout_day_id) {
        const next = nextDayId(db, session.workout_program_id, session.workout_day_id);
        db.prepare(`
          UPDATE workout_programs
          SET current_day_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(next, session.workout_program_id);
      }
    });
    tx();
    res.json(getSessionDetail(db, session.id));
  }));

  app.post('/api/workouts/sessions/:id/abandon', handle((req, res) => {
    const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (session.status !== 'active') return res.status(400).json({ error: 'Essa sessão já foi encerrada.' });
    const completedAt = new Date().toISOString();
    const startedMs = Date.parse(session.started_at);
    const durationSeconds = Number.isFinite(startedMs)
      ? Math.max(0, Math.round((Date.parse(completedAt) - startedMs) / 1000))
      : null;
    db.prepare(`
      UPDATE workout_sessions
      SET status = 'abandoned', completed_at = ?, duration_seconds = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(completedAt, durationSeconds, session.id);
    res.json(getSessionDetail(db, session.id));
  }));
}
