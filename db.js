process.removeAllListeners('warning'); // silence node:sqlite ExperimentalWarning
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'data.db'));
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer','creative','lead')),
  password_hash TEXT NOT NULL, salt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL, offer TEXT NOT NULL, geo TEXT NOT NULL,
  creative_type TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
  description TEXT DEFAULT '', refs TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium', deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  creative_id INTEGER REFERENCES users(id),
  revisions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, taken_at TEXT, first_submitted_at TEXT, submitted_at TEXT, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), round INTEGER NOT NULL DEFAULT 0,
  files TEXT DEFAULT '[]', links TEXT DEFAULT '', comment TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_costs (
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), service TEXT NOT NULL,
  credits REAL NOT NULL, round INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL,
  from_status TEXT, to_status TEXT, comment TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_history_task ON history(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_task ON ai_costs(task_id);
`);

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const now = () => new Date().toISOString();

module.exports = { db, hash, now };
