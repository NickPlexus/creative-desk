// Database layer: PostgreSQL in production (DATABASE_URL), embedded PGlite (same SQL dialect) locally.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY, login text UNIQUE NOT NULL, name text NOT NULL,
  role text NOT NULL CHECK (role IN ('buyer','creative','lead')),
  password_hash text NOT NULL, salt text NOT NULL,
  specialization text NOT NULL DEFAULT '', hourly_rate numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true, prefs jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY, user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS offers (id serial PRIMARY KEY, name text UNIQUE NOT NULL, vertical text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS geos (code text PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS ai_services (
  id serial PRIMARY KEY, name text UNIQUE NOT NULL, credit_usd numeric NOT NULL DEFAULT 0,
  monthly_budget numeric NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS templates (
  id serial PRIMARY KEY, name text NOT NULL, creative_type text NOT NULL, description text NOT NULL DEFAULT '',
  checklist jsonb NOT NULL DEFAULT '[]', quantity int NOT NULL DEFAULT 1, priority text NOT NULL DEFAULT 'medium', active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id serial PRIMARY KEY, title text NOT NULL, offer_id int REFERENCES offers(id), geo text NOT NULL,
  creative_type text NOT NULL, quantity int NOT NULL DEFAULT 1, description text NOT NULL DEFAULT '', refs text NOT NULL DEFAULT '',
  checklist jsonb NOT NULL DEFAULT '[]', priority text NOT NULL DEFAULT 'medium', deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'new', buyer_id int NOT NULL REFERENCES users(id), creative_id int REFERENCES users(id),
  template_id int REFERENCES templates(id) ON DELETE SET NULL, parent_library_id int,
  revisions int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  taken_at timestamptz, first_submitted_at timestamptz, submitted_at timestamptz, completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS versions (
  id serial PRIMARY KEY, task_id int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, n int NOT NULL,
  user_id int NOT NULL REFERENCES users(id), comment text NOT NULL DEFAULT '', links text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'review', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS files (
  id serial PRIMARY KEY, task_id int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version_id int REFERENCES versions(id) ON DELETE CASCADE, kind text NOT NULL DEFAULT 'result',
  name text NOT NULL, mime text NOT NULL, size int NOT NULL, data bytea NOT NULL,
  user_id int REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS revision_items (
  id serial PRIMARY KEY, task_id int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version_id int REFERENCES versions(id) ON DELETE CASCADE, text text NOT NULL, reason text NOT NULL DEFAULT 'other',
  done boolean NOT NULL DEFAULT false, done_at timestamptz, created_by int REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comments (
  id serial PRIMARY KEY, task_id int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_costs (
  id serial PRIMARY KEY, task_id int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id int NOT NULL REFERENCES users(id),
  service_id int NOT NULL REFERENCES ai_services(id), credits numeric NOT NULL, round int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS time_entries (
  id serial PRIMARY KEY, task_id int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id int NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL, ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS library (
  id serial PRIMARY KEY, task_id int UNIQUE NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version_id int REFERENCES versions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', tags text NOT NULL DEFAULT '',
  spend numeric, ctr numeric, cr numeric, roi numeric,
  status_by int REFERENCES users(id), status_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY, user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_id int REFERENCES users(id),
  task_id int REFERENCES tasks(id) ON DELETE CASCADE, type text NOT NULL, text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE TABLE IF NOT EXISTS history (
  id serial PRIMARY KEY, task_id int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id int NOT NULL REFERENCES users(id),
  action text NOT NULL, from_status text, to_status text, comment text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_creative ON tasks(creative_id);
CREATE INDEX IF NOT EXISTS idx_tasks_buyer ON tasks(buyer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_versions ON versions(task_id, n);
CREATE INDEX IF NOT EXISTS idx_files_version ON files(version_id);
CREATE INDEX IF NOT EXISTS idx_items_task ON revision_items(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_task ON ai_costs(task_id);
CREATE INDEX IF NOT EXISTS idx_history_task ON history(task_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_time_task ON time_entries(task_id);
`;

let pool = null, lite = null;
const driver = () => (pool ? 'postgres' : 'pglite');

async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5,
      ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined });
    await pool.query(SCHEMA);
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const dir = path.join(process.env.DATA_DIR || __dirname, 'pgdata');
    fs.mkdirSync(dir, { recursive: true });
    lite = new PGlite(dir);
    await lite.waitReady;
    await lite.exec(SCHEMA);
  }
}

const norm = (rows) => rows.map(r => { for (const k in r) if (r[k] instanceof Uint8Array && !Buffer.isBuffer(r[k])) r[k] = Buffer.from(r[k]); return r; });
async function q(sql, params = []) { const r = pool ? await pool.query(sql, params) : await lite.query(sql, params); return norm(r.rows); }
async function one(sql, params) { return (await q(sql, params))[0]; }
async function tx(fn) {
  if (pool) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const r = await fn((s, p = []) => c.query(s, p).then(x => norm(x.rows))); await c.query('COMMIT'); return r; }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  return lite.transaction(async (t) => fn((s, p = []) => t.query(s, p).then(x => norm(x.rows))));
}

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const hashAsync = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 32, (e, k) => e ? no(e) : ok(k.toString('hex'))));
module.exports = { init, q, one, tx, hash, hashAsync, driver };
