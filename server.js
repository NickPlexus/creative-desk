// Creative Desk — mini-service for buyer ↔ creative task management
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, hash, now } = require('./db');
if (process.env.SEED_DEMO !== '0') require('./seed').seedIfEmpty(); // demo accounts; disable with SEED_DEMO=0

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const UPLOAD_DIR = path.join(process.env.DATA_DIR || __dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED_EXT = /^\.(png|jpe?g|gif|webp|mp4|webm|mov|zip|pdf|psd|aep|txt)$/;
const upload = multer({
  fileFilter: (_, f, cb) => ALLOWED_EXT.test(path.extname(f.originalname).toLowerCase())
    ? cb(null, true) : cb(Object.assign(new Error('Недопустимый тип файла: ' + f.originalname), { status: 400 })),
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_, f, cb) => cb(null, crypto.randomUUID() + path.extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

const STATUSES = ['new', 'in_progress', 'review', 'revision', 'done'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const CREATIVE_TYPES = ['video', 'static', 'banner', 'gif', 'playable', 'ugc', 'other'];

// ---------- auth ----------
const SESSION_TTL = 30 * 864e5;
function auth(req, res, next) {
  const token = req.cookies.sid;
  const row = token && db.prepare(
    `SELECT u.id, u.login, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.created_at > ?`
  ).get(token, new Date(Date.now() - SESSION_TTL).toISOString());
  if (!row) return res.status(401).json({ error: 'Не авторизован' });
  req.user = row;
  next();
}
const role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Недостаточно прав' });

const attempts = new Map(); // ip -> [count, windowStart]
app.post('/api/login', (req, res) => {
  const ip = req.ip, a = attempts.get(ip) || [0, Date.now()];
  if (Date.now() - a[1] > 10 * 6e4) { a[0] = 0; a[1] = Date.now(); }
  if (++a[0] > 20) return res.status(429).json({ error: 'Слишком много попыток, подождите 10 минут' });
  attempts.set(ip, a);
  const { login, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE login = ?').get(String(login || '').trim().toLowerCase());
  const ok = u && crypto.timingSafeEqual(Buffer.from(u.password_hash, 'hex'), Buffer.from(hash(String(password || ''), u.salt), 'hex'));
  if (!ok)
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, u.id, now());
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5 });
  res.json({ id: u.id, login: u.login, name: u.name, role: u.role });
});
app.post('/api/logout', (req, res) => {
  if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies.sid);
  res.clearCookie('sid').json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json(req.user));
app.get('/api/users', auth, (req, res) =>
  res.json(db.prepare('SELECT id, name, role FROM users ORDER BY role, name').all()));

app.use('/uploads', auth, express.static(UPLOAD_DIR, {
  setHeaders: (r) => { r.setHeader('X-Content-Type-Options', 'nosniff'); r.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox"); },
}));

// ---------- helpers ----------
function log(taskId, userId, action, fromStatus = null, toStatus = null, comment = null) {
  db.prepare(`INSERT INTO history (task_id, user_id, action, from_status, to_status, comment, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(taskId, userId, action, fromStatus, toStatus, comment, now());
}
const TASK_SELECT = `
  SELECT t.*, b.name AS buyer_name, c.name AS creative_name,
    (SELECT COALESCE(SUM(credits),0) FROM ai_costs a WHERE a.task_id = t.id) AS ai_credits
  FROM tasks t JOIN users b ON b.id = t.buyer_id LEFT JOIN users c ON c.id = t.creative_id`;
const getTask = (id) => db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(id);
function canSee(user, t) {
  if (user.role === 'lead' || user.role === 'creative') return true;
  return t.buyer_id === user.id;
}
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- tasks ----------
app.get('/api/tasks', auth, (req, res) => {
  const where = [], args = [];
  if (req.user.role === 'buyer') { where.push('t.buyer_id = ?'); args.push(req.user.id); }
  if (req.query.mine === '1' && req.user.role === 'creative') { where.push('t.creative_id = ?'); args.push(req.user.id); }
  if (req.query.q) { where.push('(t.title LIKE ? OR t.offer LIKE ? OR t.geo LIKE ?)'); const q = `%${req.query.q}%`; args.push(q, q, q); }
  const sql = TASK_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ` ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.deadline`;
  res.json(db.prepare(sql).all(...args));
});

app.get('/api/tasks/:id', auth, (req, res) => {
  const t = getTask(+req.params.id);
  if (!t || !canSee(req.user, t)) return res.status(404).json({ error: 'Задача не найдена' });
  t.results = db.prepare(`SELECT r.*, u.name AS user_name FROM results r JOIN users u ON u.id = r.user_id
                          WHERE r.task_id = ? ORDER BY r.id`).all(t.id)
    .map(r => ({ ...r, files: JSON.parse(r.files || '[]') }));
  t.ai_costs = db.prepare(`SELECT a.*, u.name AS user_name FROM ai_costs a JOIN users u ON u.id = a.user_id
                           WHERE a.task_id = ? ORDER BY a.id`).all(t.id);
  t.history = db.prepare(`SELECT h.*, u.name AS user_name FROM history h JOIN users u ON u.id = h.user_id
                          WHERE h.task_id = ? ORDER BY h.id`).all(t.id);
  res.json(t);
});

const str = (v) => typeof v === 'string';
function validateTask(b) {
  const errs = [];
  for (const k of ['title', 'offer', 'geo', 'description', 'refs']) if (b[k] != null && !str(b[k])) errs.push(k);
  if (errs.length) return errs;
  if (!b.title?.trim() || b.title.length > 200) errs.push('Название');
  if (!b.offer?.trim()) errs.push('Оффер');
  if (!b.geo?.trim()) errs.push('GEO');
  if (!CREATIVE_TYPES.includes(b.creative_type)) errs.push('Тип креатива');
  if (!(Number.isInteger(+b.quantity) && +b.quantity >= 1 && +b.quantity <= 100)) errs.push('Количество (1–100)');
  if (!PRIORITIES.includes(b.priority)) errs.push('Приоритет');
  if (!b.deadline || isNaN(Date.parse(b.deadline))) errs.push('Дедлайн');
  return errs;
}

app.post('/api/tasks', auth, role('buyer', 'lead'), (req, res) => {
  const b = req.body || {};
  const errs = validateTask(b);
  if (errs.length) return res.status(400).json({ error: 'Проверьте поля: ' + errs.join(', ') });
  const id = tx(() => {
    const r = db.prepare(`INSERT INTO tasks (title, offer, geo, creative_type, quantity, description, refs, priority,
        deadline, status, buyer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`)
      .run(b.title.trim(), b.offer.trim(), b.geo.trim().toUpperCase(), b.creative_type, +b.quantity,
        b.description || '', b.refs || '', b.priority, new Date(b.deadline).toISOString(), req.user.id, now());
    log(r.lastInsertRowid, req.user.id, 'created', null, 'new');
    return r.lastInsertRowid;
  });
  res.status(201).json(getTask(id));
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  const t = getTask(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Задача не найдена' });
  if (!(req.user.role === 'lead' || t.buyer_id === req.user.id)) return res.status(403).json({ error: 'Редактировать может только автор ТЗ' });
  if (t.status === 'done' && req.user.role !== 'lead') return res.status(409).json({ error: 'Принятую задачу нельзя редактировать — переоткройте её' });
  const b = { ...t, ...req.body };
  const errs = validateTask(b);
  if (errs.length) return res.status(400).json({ error: 'Проверьте поля: ' + errs.join(', ') });
  const fields = ['title', 'offer', 'geo', 'creative_type', 'quantity', 'description', 'refs', 'priority', 'deadline'];
  const changed = fields.filter(f => String(b[f]) !== String(t[f]));
  if (!changed.length) return res.json(t);
  tx(() => {
    db.prepare(`UPDATE tasks SET title=?, offer=?, geo=?, creative_type=?, quantity=?, description=?, refs=?, priority=?, deadline=? WHERE id=?`)
      .run(b.title.trim(), b.offer.trim(), b.geo.trim().toUpperCase(), b.creative_type, +b.quantity, b.description || '',
        b.refs || '', b.priority, new Date(b.deadline).toISOString(), t.id);
    log(t.id, req.user.id, 'edited', null, null, 'Изменены поля: ' + changed.join(', '));
  });
  res.json(getTask(t.id));
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const t = getTask(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Задача не найдена' });
  if (!(req.user.role === 'lead' || (t.buyer_id === req.user.id && t.status === 'new')))
    return res.status(403).json({ error: 'Удалить можно только свою задачу в статусе «Новые»' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

// ---------- workflow ----------
// Allowed transitions: [from, to, who]
const FLOW = {
  take:    { from: ['new'], to: 'in_progress', roles: ['creative'] },
  submit:  { from: ['in_progress', 'revision'], to: 'review', roles: ['creative'] },
  revise:  { from: ['review'], to: 'revision', roles: ['buyer', 'lead'] },
  accept:  { from: ['review'], to: 'done', roles: ['buyer', 'lead'] },
  release: { from: ['in_progress', 'revision'], to: 'new', roles: ['creative', 'lead'] },
  reopen:  { from: ['done'], to: 'revision', roles: ['buyer', 'lead'] },
};

function transition(req, res, action, extra) {
  const t = getTask(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Задача не найдена' });
  const f = FLOW[action];
  if (!f.roles.includes(req.user.role)) return res.status(403).json({ error: 'Действие недоступно вашей роли' });
  if (!f.from.includes(t.status)) return res.status(409).json({ error: 'Недопустимый переход статуса' });
  if (req.user.role === 'creative' && action !== 'take' && t.creative_id !== req.user.id)
    return res.status(403).json({ error: 'Задача закреплена за другим исполнителем' });
  if (req.user.role === 'buyer' && t.buyer_id !== req.user.id)
    return res.status(403).json({ error: 'Это не ваша задача' });
  const ts = now();
  tx(() => {
    const set = { status: f.to };
    if (action === 'take') { set.creative_id = req.user.id; set.taken_at = ts; }
    if (action === 'release') { set.creative_id = null; set.taken_at = null; }
    if (action === 'submit') { set.submitted_at = ts; if (!t.first_submitted_at) set.first_submitted_at = ts; }
    if (action === 'revise' || action === 'reopen') { set.revisions = t.revisions + 1; set.completed_at = null; }
    if (action === 'accept') set.completed_at = ts;
    const keys = Object.keys(set);
    db.prepare(`UPDATE tasks SET ${keys.map(k => k + '=?').join(', ')} WHERE id = ?`).run(...keys.map(k => set[k]), t.id);
    extra?.(t, ts);
    log(t.id, req.user.id, action, t.status, f.to, req.body?.comment || null);
  });
  res.json(getTask(t.id));
}

app.post('/api/tasks/:id/take', auth, (req, res) => transition(req, res, 'take'));
app.post('/api/tasks/:id/release', auth, (req, res) => transition(req, res, 'release'));
app.post('/api/tasks/:id/accept', auth, (req, res) => transition(req, res, 'accept'));
app.post('/api/tasks/:id/reopen', auth, (req, res) => transition(req, res, 'reopen'));
app.post('/api/tasks/:id/revise', auth, (req, res) => {
  if (!str(req.body?.comment) || !req.body.comment.trim()) return res.status(400).json({ error: 'Опишите, что нужно поправить' });
  transition(req, res, 'revise');
});

// submit: multipart (files + links + comment + ai costs JSON)
function canSubmit(req, res, next) {
  const t = getTask(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Задача не найдена' });
  if (req.user.role !== 'creative' || t.creative_id !== req.user.id) return res.status(403).json({ error: 'Сдать результат может только исполнитель задачи' });
  if (!FLOW.submit.from.includes(t.status)) return res.status(409).json({ error: 'Недопустимый переход статуса' });
  next();
}
const cleanup = (req) => (req.files || []).forEach(f => fs.rm(f.path, { force: true }, () => {}));
app.post('/api/tasks/:id/submit', auth, canSubmit, upload.array('files'), (req, res) => {
  res.on('finish', () => { if (res.statusCode >= 400) cleanup(req); });
  const files = (req.files || []).map(f => ({ name: f.originalname, url: '/uploads/' + f.filename, size: f.size }));
  const links = String(req.body.links || '').split(/\s+/).filter(l => /^https?:\/\//i.test(l));
  let costs = [];
  try { costs = JSON.parse(req.body.ai_costs || '[]'); } catch { costs = null; }
  if (!Array.isArray(costs)) return res.status(400).json({ error: 'Некорректные AI-расходы' });
  costs = costs.filter(c => c && str(c.service) && c.service.trim() && Number.isFinite(+c.credits) && +c.credits > 0 && +c.credits <= 1e6);
  if (!files.length && !links.length) return res.status(400).json({ error: 'Прикрепите файл или ссылку на результат' });
  transition(req, res, 'submit', (t, ts) => {
    const round = t.revisions; // 0 = первая сдача, 1+ = правки
    db.prepare(`INSERT INTO results (task_id, user_id, round, files, links, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(t.id, req.user.id, round, JSON.stringify(files), links.join('\n'), req.body.comment || '', ts);
    const ins = db.prepare(`INSERT INTO ai_costs (task_id, user_id, service, credits, round, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    costs.forEach(c => ins.run(t.id, req.user.id, c.service.trim(), +c.credits, round, ts));
  });
});

// standalone AI cost entry (e.g. credits spent while still working)
app.post('/api/tasks/:id/ai-costs', auth, role('creative'), (req, res) => {
  const t = getTask(+req.params.id);
  if (!t || t.creative_id !== req.user.id) return res.status(403).json({ error: 'Это не ваша задача' });
  const { service, credits } = req.body || {};
  if (!str(service) || !service.trim() || !Number.isFinite(+credits) || !(+credits > 0) || +credits > 1e6) return res.status(400).json({ error: 'Укажите сервис и кредиты' });
  tx(() => {
    db.prepare(`INSERT INTO ai_costs (task_id, user_id, service, credits, round, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(t.id, req.user.id, service.trim(), +credits, t.revisions, now());
    log(t.id, req.user.id, 'ai_cost', null, null, `${service.trim()}: ${+credits} кр.`);
  });
  res.json({ ok: true });
});

// lead assigns a free task to a creative
app.post('/api/tasks/:id/assign', auth, role('lead'), (req, res) => {
  const t = getTask(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Задача не найдена' });
  if (t.status !== 'new') return res.status(409).json({ error: 'Назначить можно только задачу из «Новых»' });
  const u = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'creative'").get(+req.body?.creative_id);
  if (!u) return res.status(400).json({ error: 'Выберите креативщика' });
  const ts = now();
  tx(() => {
    db.prepare(`UPDATE tasks SET status='in_progress', creative_id=?, taken_at=? WHERE id=?`).run(u.id, ts, t.id);
    log(t.id, req.user.id, 'assign', 'new', 'in_progress', 'Исполнитель: ' + u.name);
  });
  res.json(getTask(t.id));
});

app.get('/api/notifications', auth, (req, res) => {
  const me = req.user;
  const f = me.role === 'lead' ? '1=1' : me.role === 'buyer' ? 't.buyer_id = ?' : "(t.creative_id = ? OR h.action = 'created')";
  const args = [me.id, ...(me.role === 'lead' ? [] : [me.id])];
  res.json(db.prepare(`SELECT h.id, h.task_id, h.action, h.comment, h.created_at, h.user_id, u.name AS user_name, t.title
    FROM history h JOIN users u ON u.id = h.user_id JOIN tasks t ON t.id = h.task_id
    WHERE h.user_id != ? AND ${f} ORDER BY h.created_at DESC LIMIT 25`).all(...args));
});

app.post('/api/tasks/:id/comment', auth, (req, res) => {
  const t = getTask(+req.params.id);
  if (!t || !canSee(req.user, t)) return res.status(404).json({ error: 'Задача не найдена' });
  if (!str(req.body?.comment) || !req.body.comment.trim()) return res.status(400).json({ error: 'Пустой комментарий' });
  log(t.id, req.user.id, 'comment', null, null, req.body.comment.trim());
  res.json({ ok: true });
});

app.get('/api/ai-services', auth, (req, res) =>
  res.json(db.prepare('SELECT service, COUNT(*) n FROM ai_costs GROUP BY service ORDER BY n DESC').all().map(r => r.service)));

// ---------- analytics ----------
app.get('/api/analytics', auth, role('lead'), (req, res) => {
  const day = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(Date.parse(v)) ? Date.parse(v) : null;
  if ((req.query.from && day(req.query.from) == null) || (req.query.to && day(req.query.to) == null))
    return res.status(400).json({ error: 'Даты в формате YYYY-MM-DD' });
  const from = req.query.from ? new Date(day(req.query.from)).toISOString() : '1970-01-01';
  const to = req.query.to ? new Date(day(req.query.to) + 864e5).toISOString() : '9999-12-31';
  const ts = now();
  const P = [from, to];
  const inPeriod = 't.created_at >= ? AND t.created_at < ?';

  const byStatus = Object.fromEntries(STATUSES.map(s => [s, 0]));
  db.prepare(`SELECT status, COUNT(*) n FROM tasks t WHERE ${inPeriod} GROUP BY status`).all(...P)
    .forEach(r => byStatus[r.status] = r.n);

  const overdueExpr = `(CASE WHEN t.completed_at IS NOT NULL THEN t.completed_at > t.deadline ELSE '${ts}' > t.deadline END)`;
  const totals = db.prepare(`SELECT COUNT(*) total,
      SUM(${overdueExpr}) overdue,
      AVG(CASE WHEN completed_at IS NOT NULL THEN (julianday(completed_at) - julianday(created_at)) * 24 END) avg_lead_h,
      AVG(CASE WHEN completed_at IS NOT NULL THEN (julianday(completed_at) - julianday(taken_at)) * 24 END) avg_work_h,
      AVG(CASE WHEN taken_at IS NOT NULL THEN (julianday(taken_at) - julianday(created_at)) * 24 END) avg_wait_h,
      SUM(revisions) revisions
    FROM tasks t WHERE ${inPeriod}`).get(...P);
  totals.ai_credits = db.prepare(`SELECT COALESCE(SUM(a.credits),0) s FROM ai_costs a JOIN tasks t ON t.id=a.task_id WHERE ${inPeriod}`).get(...P).s;

  const creatives = db.prepare(`SELECT u.id, u.name,
      COALESCE(SUM(t.status IN ('in_progress','revision')),0) active,
      COALESCE(SUM(t.status = 'review'),0) on_review,
      COALESCE(SUM(t.status = 'done'),0) done,
      SUM(CASE WHEN t.id IS NOT NULL THEN ${overdueExpr} ELSE 0 END) overdue,
      SUM(COALESCE(t.revisions,0)) revisions,
      AVG(CASE WHEN t.completed_at IS NOT NULL THEN (julianday(t.completed_at) - julianday(t.taken_at)) * 24 END) avg_work_h,
      (SELECT COALESCE(SUM(a.credits),0) FROM ai_costs a JOIN tasks t2 ON t2.id=a.task_id
         WHERE a.user_id = u.id AND t2.created_at >= ? AND t2.created_at < ?) ai_credits
    FROM users u LEFT JOIN tasks t ON t.creative_id = u.id AND ${inPeriod}
    WHERE u.role = 'creative' GROUP BY u.id ORDER BY active DESC, u.name`).all(...P, ...P);

  const buyers = db.prepare(`SELECT u.id, u.name, COUNT(t.id) total, SUM(t.status='done') done,
      SUM(CASE WHEN t.id IS NOT NULL THEN ${overdueExpr} ELSE 0 END) overdue
    FROM users u LEFT JOIN tasks t ON t.buyer_id = u.id AND ${inPeriod}
    WHERE u.role = 'buyer' GROUP BY u.id ORDER BY total DESC`).all(...P);

  const aiByService = db.prepare(`SELECT a.service, SUM(a.credits) credits, COUNT(DISTINCT a.task_id) tasks,
      SUM(CASE WHEN a.round > 0 THEN a.credits ELSE 0 END) revision_credits
    FROM ai_costs a JOIN tasks t ON t.id = a.task_id WHERE ${inPeriod} GROUP BY a.service ORDER BY credits DESC`).all(...P);

  const aiMatrix = db.prepare(`SELECT u.name, a.service, SUM(a.credits) credits FROM ai_costs a
      JOIN users u ON u.id = a.user_id JOIN tasks t ON t.id = a.task_id WHERE ${inPeriod}
      GROUP BY u.id, a.service`).all(...P);

  const byType = db.prepare(`SELECT creative_type, COUNT(*) n,
      AVG(CASE WHEN completed_at IS NOT NULL THEN (julianday(completed_at) - julianday(created_at)) * 24 END) avg_lead_h
    FROM tasks t WHERE ${inPeriod} GROUP BY creative_type ORDER BY n DESC`).all(...P);

  const overdueList = db.prepare(TASK_SELECT + ` WHERE ${inPeriod} AND ${overdueExpr} ORDER BY t.deadline`).all(...P);

  const daily = {
    created: db.prepare(`SELECT substr(t.created_at,1,10) d, COUNT(*) n FROM tasks t WHERE ${inPeriod} GROUP BY d`).all(...P),
    done: db.prepare(`SELECT substr(t.completed_at,1,10) d, COUNT(*) n FROM tasks t WHERE t.completed_at IS NOT NULL AND ${inPeriod} GROUP BY d`).all(...P),
  };
  res.json({ byStatus, totals, creatives, buyers, aiByService, aiMatrix, byType, overdueList, daily });
});

app.get('/api/activity', auth, role('lead'), (req, res) =>
  res.json(db.prepare(`SELECT h.*, u.name AS user_name, t.title FROM history h JOIN users u ON u.id = h.user_id
    JOIN tasks t ON t.id = h.task_id ORDER BY h.id DESC LIMIT 50`).all()));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') err.status = 400;
  if (err.code === 'LIMIT_FILE_SIZE') err.status = 413;
  if (err.code?.startsWith?.('LIMIT_')) err.status ||= 400;
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Ошибка сервера' });
});
app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Creative Desk → http://localhost:${PORT}`));
