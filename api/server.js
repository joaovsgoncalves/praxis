import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 18556;

// Middleware
app.use(cors());
app.use(express.json());

// File upload
const upload = multer({ 
  dest: '/tmp/forja-uploads/',
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// Database
const db = new Database(path.join(__dirname, 'forja.db'));
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    date TEXT,
    time TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    category TEXT DEFAULT 'personal',
    created_date TEXT DEFAULT (datetime('now')),
    updated_date TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    frequency TEXT DEFAULT 'daily',
    status TEXT DEFAULT 'active',
    created_date TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL,
    date TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_date TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (habit_id) REFERENCES habits(id)
  );

  CREATE TABLE IF NOT EXISTS wellness_checks (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    sleep_hours REAL DEFAULT 7,
    sleep_quality INTEGER DEFAULT 3,
    mood INTEGER DEFAULT 3,
    productivity INTEGER DEFAULT 3,
    note TEXT DEFAULT '',
    created_date TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS focus_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    task_title TEXT,
    date TEXT,
    duration_seconds INTEGER,
    created_date TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transcriptions (
    id TEXT PRIMARY KEY,
    audio_path TEXT,
    text TEXT,
    language TEXT DEFAULT 'pt',
    duration_ms INTEGER,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// ==================== HEALTH ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== TRANSCRIPTION ====================
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioPath = req.file.path;
    const outputPath = audioPath + '.txt';
    
    // Use whisper.cpp or edge-tts for transcription
    // Try whisper first, fall back to edge-tts
    let text = '';
    let language = 'pt';
    
    try {
      // Try whisper.cpp if available
      execSync(
        `whisper-cli --model /root/.hermes/models/whisper/ggml-base.bin --language pt --output-format txt --output-dir /tmp/forja-uploads "${audioPath}" 2>/dev/null`,
        { timeout: 30000 }
      );
      text = fs.readFileSync(outputPath, 'utf-8').trim();
    } catch (whisperErr) {
      // Fall back to Python whisper
      try {
        const pyResult = execSync(
          `python3 -c "
import whisper
model = whisper.load_model('base')
result = model.transcribe('${audioPath}', language='pt')
print(result['text'])
" 2>/dev/null`,
          { timeout: 60000, encoding: 'utf-8' }
        );
        text = pyResult.trim();
      } catch (pyErr) {
        // Final fallback: use the audio file info
        text = `[Áudio recebido: ${req.file.originalname} - ${Math.round(req.file.size / 1024)}KB]`;
      }
    }

    // Save transcription
    const id = uuidv4();
    db.prepare(`
      INSERT INTO transcriptions (id, audio_path, text, language, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `.run(id, audioPath, text, language, 0));

    res.json({ 
      id,
      text,
      language,
      success: true 
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== TASKS ====================
app.get('/api/tasks', (req, res) => {
  const { date, status, category, limit = 100 } = req.query;
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (date) { query += ' AND date = ?'; params.push(date); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  
  query += ' ORDER BY created_date DESC LIMIT ?';
  params.push(Number(limit));

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

app.get('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.post('/api/tasks', (req, res) => {
  const id = uuidv4();
  const { title, description = '', date, time, status = 'pending', priority = 'medium', category = 'personal' } = req.body;
  
  if (!title) return res.status(400).json({ error: 'Title is required' });

  db.prepare(`
    INSERT INTO tasks (id, title, description, date, time, status, priority, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description, date || null, time || null, status, priority, category);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const { title, description, date, time, status, priority, category } = req.body;

  db.prepare(`
    UPDATE tasks SET 
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      date = COALESCE(?, date),
      time = COALESCE(?, time),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      category = COALESCE(?, category),
      updated_date = datetime('now')
    WHERE id = ?
  `).run(title, description, date, time, status, priority, category, req.params.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== HABITS ====================
app.get('/api/habits', (req, res) => {
  const { status = 'active' } = req.query;
  const habits = db.prepare('SELECT * FROM habits WHERE status = ? ORDER BY created_date DESC').all(status);
  res.json(habits);
});

app.post('/api/habits', (req, res) => {
  const id = uuidv4();
  const { title, description = '', frequency = 'daily' } = req.body;
  
  if (!title) return res.status(400).json({ error: 'Title is required' });

  db.prepare(`
    INSERT INTO habits (id, title, description, frequency)
    VALUES (?, ?, ?, ?)
  `).run(id, title, description, frequency);

  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  res.status(201).json(habit);
});

app.put('/api/habits/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Habit not found' });

  const { title, description, frequency, status } = req.body;

  db.prepare(`
    UPDATE habits SET 
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      frequency = COALESCE(?, frequency),
      status = COALESCE(?, status)
    WHERE id = ?
  `).run(title, description, frequency, status, req.params.id);

  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
  res.json(habit);
});

app.delete('/api/habits/:id', (req, res) => {
  db.prepare('DELETE FROM habits WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM habit_logs WHERE habit_id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== HABIT LOGS ====================
app.get('/api/habit-logs', (req, res) => {
  const { date, habit_id } = req.query;
  let query = 'SELECT * FROM habit_logs WHERE 1=1';
  const params = [];

  if (date) { query += ' AND date = ?'; params.push(date); }
  if (habit_id) { query += ' AND habit_id = ?'; params.push(habit_id); }

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

app.post('/api/habit-logs', (req, res) => {
  const id = uuidv4();
  const { habit_id, date, completed = true } = req.body;
  
  if (!habit_id || !date) return res.status(400).json({ error: 'habit_id and date required' });

  db.prepare(`
    INSERT INTO habit_logs (id, habit_id, date, completed)
    VALUES (?, ?, ?, ?)
  `).run(id, habit_id, date, completed ? 1 : 0);

  res.status(201).json({ id, habit_id, date, completed });
});

app.delete('/api/habit-logs/:id', (req, res) => {
  db.prepare('DELETE FROM habit_logs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== WELLNESS ====================
app.get('/api/wellness', (req, res) => {
  const { date } = req.query;
  let query = 'SELECT * FROM wellness_checks';
  const params = [];

  if (date) { query += ' WHERE date = ?'; params.push(date); }
  query += ' ORDER BY date DESC LIMIT 30';

  const checks = db.prepare(query).all(...params);
  res.json(checks);
});

app.post('/api/wellness', (req, res) => {
  const id = uuidv4();
  const { date, sleep_hours = 7, sleep_quality = 3, mood = 3, productivity = 3, note = '' } = req.body;
  
  if (!date) return res.status(400).json({ error: 'date required' });

  // Upsert: update if exists for this date
  const existing = db.prepare('SELECT id FROM wellness_checks WHERE date = ?').get(date);
  if (existing) {
    db.prepare(`
      UPDATE wellness_checks SET 
        sleep_hours = ?, sleep_quality = ?, mood = ?, productivity = ?, note = ?
      WHERE id = ?
    `).run(sleep_hours, sleep_quality, mood, productivity, note, existing.id);
    const updated = db.prepare('SELECT * FROM wellness_checks WHERE id = ?').get(existing.id);
    return res.json(updated);
  }

  db.prepare(`
    INSERT INTO wellness_checks (id, date, sleep_hours, sleep_quality, mood, productivity, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, sleep_hours, sleep_quality, mood, productivity, note);

  const check = db.prepare('SELECT * FROM wellness_checks WHERE id = ?').get(id);
  res.status(201).json(check);
});

// ==================== FOCUS SESSIONS ====================
app.get('/api/focus', (req, res) => {
  const { date } = req.query;
  let query = 'SELECT * FROM focus_sessions';
  const params = [];

  if (date) { query += ' WHERE date = ?'; params.push(date); }
  query += ' ORDER BY created_date DESC LIMIT 50';

  const sessions = db.prepare(query).all(...params);
  res.json(sessions);
});

app.post('/api/focus', (req, res) => {
  const id = uuidv4();
  const { task_id, task_title, date, duration_seconds } = req.body;

  db.prepare(`
    INSERT INTO focus_sessions (id, task_id, task_title, date, duration_seconds)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, task_id || null, task_title || null, date || new Date().toISOString().split('T')[0], duration_seconds || 0);

  const session = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
  res.status(201).json(session);
});

// ==================== START ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 Forja do Jota API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
