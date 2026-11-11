// Creative Desk v2 — server bootstrap and shared helpers
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const db = require('./db');

const C = {
  STATUSES: ['new', 'in_progress', 'review', 'revision', 'done'],
  PRIORITIES: ['low', 'medium', 'high', 'urgent'],
  TYPES: ['video', 'static', 'banner', 'gif', 'playable', 'ugc', 'other'],
  REASONS: ['hook', 'text', 'localization', 'visual', 'platform', 'tech', 'other'],
  LIB: ['pending', 'testing', 'winner', 'average', 'burned'],
  SESSION_TTL_DAYS: 30,
};
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf', zip: 'application/zip' };

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render / reverse proxy: real client IP for rate limiting
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true })); // revalidate: fresh code right after deploy

// ---------- helpers ----------
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });
const str = (v) => typeof v === 'string';
const idp = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : 0; };

const auth = h(async (req, res, next) => {
  const token = req.cookies.sid;
  const u = token && await db.one(`SELECT u.id, u.login, u.name, u.role, u.specialization, u.hourly_rate::float8 AS hourly_rate, u.prefs
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = $1 AND u.active AND s.created_at > now() - interval '${C.SESSION_TTL_DAYS} days'`, [token]);
  if (!u) throw fail(401, 'Не авторизован');
  req.user = u; next();
});
const role = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : next(fail(403, 'Недостаточно прав'));

async function log(q, taskId, userId, action, from = null, to = null, comment = null) {
  await q('INSERT INTO history (task_id, user_id, action, from_status, to_status, comment) VALUES ($1,$2,$3,$4,$5,$6)',
    [taskId, userId, action, from, to, comment]);
}

// Creates in-app notifications, honouring each user's notification preferences
async function notify(userIds, { actor, task, type, text = '' }) {
  const ids = [...new Set(userIds.filter(id => id && id !== actor))];
  if (!ids.length) return;
  const users = await db.q(`SELECT id, prefs FROM users WHERE active AND id IN (${ids.map((_, i) => '$' + (i + 1)).join(',')})`, ids);
  for (const u of users) {
    if (u.prefs?.notify?.[type] === false) continue;
    await db.q('INSERT INTO notifications (user_id, actor_id, task_id, type, text) VALUES ($1,$2,$3,$4,$5)', [u.id, actor || null, task || null, type, text]);
  }
}

const TASK_SELECT = `
SELECT t.id, t.title, t.offer_id, o.name AS offer_name, t.geo, t.creative_type, t.quantity, t.priority, t.deadline, t.status,
  t.buyer_id, b.name AS buyer_name, t.creative_id, c.name AS creative_name, t.revisions, t.template_id, t.parent_library_id,
  t.created_at, t.taken_at, t.first_submitted_at, t.submitted_at, t.completed_at,
  COALESCE((SELECT sum(a.credits) FROM ai_costs a WHERE a.task_id = t.id), 0)::float8 AS ai_credits,
  COALESCE((SELECT sum(a.credits * s.credit_usd) FROM ai_costs a JOIN ai_services s ON s.id = a.service_id WHERE a.task_id = t.id), 0)::float8 AS ai_usd,
  (SELECT count(*) FROM versions v WHERE v.task_id = t.id)::int AS versions_count,
  (SELECT count(*) FROM revision_items i WHERE i.task_id = t.id AND NOT i.done)::int AS open_items,
  (SELECT f.id FROM files f JOIN versions v ON v.id = f.version_id WHERE v.task_id = t.id AND f.mime LIKE 'image/%' ORDER BY v.n DESC, f.id LIMIT 1) AS cover_id,
  COALESCE((SELECT sum(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at))) FROM time_entries e WHERE e.task_id = t.id), 0)::float8 AS work_sec,
  (SELECT e.user_id FROM time_entries e WHERE e.task_id = t.id AND e.ended_at IS NULL LIMIT 1) AS timer_user,
  l.id AS library_id, l.status AS library_status
FROM tasks t
LEFT JOIN offers o ON o.id = t.offer_id
JOIN users b ON b.id = t.buyer_id
LEFT JOIN users c ON c.id = t.creative_id
LEFT JOIN library l ON l.task_id = t.id`;

// Expected durations per creative type, used to flag deadline risk
async function typeStats() {
  const rows = await db.q(`SELECT creative_type,
      avg(EXTRACT(EPOCH FROM (completed_at - taken_at)) / 3600)::float8 AS work_h,
      avg(EXTRACT(EPOCH FROM (taken_at - created_at)) / 3600)::float8 AS wait_h
    FROM tasks WHERE completed_at IS NOT NULL AND taken_at IS NOT NULL GROUP BY creative_type`);
  return Object.fromEntries(rows.map(r => [r.creative_type, r]));
}
function withRisk(tasks, stats) {
  const now = Date.now();
  for (const t of tasks) {
    t.risk = null; t.eta_h = null;
    if (!['new', 'in_progress', 'revision'].includes(t.status)) continue;
    const s = stats[t.creative_type] || { work_h: 30, wait_h: 4 };
    const left = (new Date(t.deadline) - now) / 36e5;
    let expected;
    if (t.status === 'new') expected = (s.wait_h || 4) + (s.work_h || 30);
    else if (t.status === 'revision') expected = (s.work_h || 30) * 0.35;
    else expected = Math.max((s.work_h || 30) * 0.2, (s.work_h || 30) - (now - new Date(t.taken_at)) / 36e5);
    t.eta_h = Math.round(expected * 10) / 10;
    t.risk = left < 0 ? 'late' : left < expected * 0.6 ? 'high' : left < expected ? 'medium' : null;
  }
  return tasks;
}

async function getTask(id) {
  const t = await db.one(TASK_SELECT + ' WHERE t.id = $1', [id]);
  if (t) withRisk([t], await typeStats());
  return t;
}
// buyers see their own tasks; other buyers' work only once it is in the library (reduced view)
function canSee(user, t) {
  return user.role !== 'buyer' || t.buyer_id === user.id || !!t.library_id;
}
const isOwnerView = (user, t) => user.role !== 'buyer' || t.buyer_id === user.id;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 8 },
  fileFilter: (_, f, cb) => {
    const ext = path.extname(f.originalname).slice(1).toLowerCase();
    MIME[ext] ? cb(null, true) : cb(fail(400, 'Недопустимый тип файла: ' + f.originalname));
  },
});
const mimeOf = (name) => MIME[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream';

const ctx = { db, C, h, fail, str, idp, isOwnerView, auth, role, log, notify, TASK_SELECT, typeStats, withRisk, getTask, canSee, upload, mimeOf };
require('./routes/auth')(app, ctx);
require('./routes/tasks')(app, ctx);
require('./routes/library')(app, ctx);
require('./routes/insights')(app, ctx);
require('./routes/admin')(app, ctx);

app.get('/healthz', (req, res) => res.json({ ok: true, db: db.driver() }));
app.get('/concept', (req, res) => res.sendFile(path.join(__dirname, 'public', 'concept.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') err.status = 400;
  if (err.code === 'LIMIT_FILE_SIZE') { err.status = 413; err.message = 'Файл больше 15 МБ'; }
  if (err.code?.startsWith?.('LIMIT_')) err.status ||= 400;
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Ошибка сервера' });
});

(async () => {
  await db.init();
  if (process.env.SEED_DEMO !== '0') await require('./seed').seedIfEmpty();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Creative Desk → http://localhost:${PORT} (db: ${db.driver()})`));
})().catch((e) => { console.error(e); process.exit(1); });
