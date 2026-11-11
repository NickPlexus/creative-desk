// Administration (lead): users, dictionaries, AI services, templates, SLA
const crypto = require('crypto');

module.exports = (app, { db, C, h, fail, str, idp, auth, role }) => {
  const rate = (v) => { const n = +v; if (!Number.isFinite(n) || n < 0 || n > 1000) throw fail(400, 'Ставка: от 0 до 1000 $/ч'); return n; };
  const admin = [auth, role('lead')];
  const text = (v, min, max, label) => { if (!str(v) || v.trim().length < min || v.length > max) throw fail(400, `${label}: от ${min} до ${max} символов`); return v.trim(); };
  const tempPassword = () => crypto.randomBytes(5).toString('base64url');
  const specList = (v) => (str(v) ? v : '').split(',').map(s => s.trim()).filter(s => C.TYPES.includes(s)).join(',');

  // ---------- users ----------
  app.get('/api/admin/users', ...admin, h(async (req, res) => {
    res.json(await db.q(`SELECT id, login, name, role, specialization, hourly_rate::float8 AS hourly_rate, active, created_at FROM users ORDER BY active DESC, role, name`));
  }));
  app.post('/api/admin/users', ...admin, h(async (req, res) => {
    const b = req.body || {};
    const login = text(b.login, 3, 32, 'Логин').toLowerCase();
    if (!/^[a-z0-9_.-]+$/.test(login)) throw fail(400, 'Логин: латиница, цифры, «_», «.», «-»');
    if (!['buyer', 'creative', 'lead'].includes(b.role)) throw fail(400, 'Роль');
    if (await db.one('SELECT 1 FROM users WHERE login = $1', [login])) throw fail(409, 'Такой логин уже есть');
    const password = tempPassword(), salt = crypto.randomBytes(8).toString('hex');
    const u = await db.one(`INSERT INTO users (login, name, role, specialization, hourly_rate, password_hash, salt) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [login, text(b.name, 2, 60, 'Имя'), b.role, specList(b.specialization), rate(b.hourly_rate || 0), db.hash(password, salt), salt]);
    res.status(201).json({ id: u.id, password });
  }));
  app.patch('/api/admin/users/:id', ...admin, h(async (req, res) => {
    const u = await db.one('SELECT * FROM users WHERE id = $1', [idp(req.params.id)]);
    if (!u) throw fail(404, 'Пользователь не найден');
    const b = req.body || {};
    const deactivate = b.active != null && !b.active;
    if (u.id === req.user.id && (deactivate || (b.role && b.role !== 'lead'))) throw fail(400, 'Нельзя отключить себя или снять с себя роль руководителя');
    const roleV = b.role ?? u.role;
    if (!['buyer', 'creative', 'lead'].includes(roleV)) throw fail(400, 'Роль');
    await db.q(`UPDATE users SET name=$1, role=$2, specialization=$3, hourly_rate=$4, active=$5 WHERE id=$6`,
      [b.name != null ? text(b.name, 2, 60, 'Имя') : u.name, roleV, b.specialization != null ? specList(b.specialization) : u.specialization,
        b.hourly_rate != null ? rate(b.hourly_rate) : u.hourly_rate, b.active != null ? !!b.active : u.active, u.id]);
    if (deactivate) { // log out, stop timers, return unfinished work to the queue
      await db.q('DELETE FROM sessions WHERE user_id = $1', [u.id]);
      await db.q('UPDATE time_entries SET ended_at = now() WHERE user_id = $1 AND ended_at IS NULL', [u.id]);
      const back = await db.q(`UPDATE tasks SET status = 'new', creative_id = NULL, taken_at = NULL WHERE creative_id = $1 AND status IN ('in_progress','revision') RETURNING id`, [u.id]);
      for (const t of back) await db.q('INSERT INTO history (task_id, user_id, action, from_status, to_status, comment) VALUES ($1,$2,$3,$4,$5,$6)', [t.id, req.user.id, 'release', 'in_progress', 'new', 'Сотрудник отключён']);
    }
    res.json({ ok: true });
  }));
  app.post('/api/admin/users/:id/reset-password', ...admin, h(async (req, res) => {
    const u = await db.one('SELECT id FROM users WHERE id = $1', [idp(req.params.id)]);
    if (!u) throw fail(404, 'Пользователь не найден');
    const password = tempPassword(), salt = crypto.randomBytes(8).toString('hex');
    await db.q('UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3', [db.hash(password, salt), salt, u.id]);
    await db.q('DELETE FROM sessions WHERE user_id = $1', [u.id]);
    res.json({ password });
  }));

  // ---------- offers / geos ----------
  app.post('/api/admin/offers', ...admin, h(async (req, res) => {
    const name = text(req.body?.name, 2, 80, 'Название оффера');
    if (await db.one('SELECT 1 FROM offers WHERE lower(name) = lower($1)', [name])) throw fail(409, 'Такой оффер уже есть');
    res.status(201).json(await db.one('INSERT INTO offers (name, vertical) VALUES ($1, $2) RETURNING *', [name, str(req.body?.vertical) ? req.body.vertical.trim().slice(0, 40) : '']));
  }));
  app.patch('/api/admin/offers/:id', ...admin, h(async (req, res) => {
    const o = await db.one('SELECT * FROM offers WHERE id = $1', [idp(req.params.id)]);
    if (!o) throw fail(404, 'Оффер не найден');
    const b = req.body || {};
    await db.q('UPDATE offers SET name=$1, vertical=$2, active=$3 WHERE id=$4',
      [b.name != null ? text(b.name, 2, 80, 'Название') : o.name, str(b.vertical) ? b.vertical.trim().slice(0, 40) : o.vertical, b.active != null ? !!b.active : o.active, o.id]);
    res.json({ ok: true });
  }));
  app.post('/api/admin/geos', ...admin, h(async (req, res) => {
    const code = str(req.body?.code) ? req.body.code.trim().toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(code)) throw fail(400, 'Код страны — 2 латинские буквы (ISO)');
    await db.q('INSERT INTO geos (code, name) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name', [code, text(req.body?.name, 2, 40, 'Название страны')]);
    res.status(201).json({ ok: true });
  }));
  app.delete('/api/admin/geos/:code', ...admin, h(async (req, res) => {
    const used = await db.one(`SELECT 1 FROM tasks WHERE (',' || replace(geo, ' ', '') || ',') LIKE $1 LIMIT 1`, ['%,' + req.params.code + ',%']);
    if (used) throw fail(409, 'GEO используется в задачах — удалить нельзя');
    await db.q('DELETE FROM geos WHERE code = $1', [req.params.code]);
    res.json({ ok: true });
  }));

  // ---------- AI services ----------
  const money = (v, label) => { if (!Number.isFinite(+v) || +v < 0 || +v > 1e7) throw fail(400, label); return +v; };
  app.post('/api/admin/services', ...admin, h(async (req, res) => {
    const b = req.body || {};
    const name = text(b.name, 2, 40, 'Название сервиса');
    if (await db.one('SELECT 1 FROM ai_services WHERE lower(name) = lower($1)', [name])) throw fail(409, 'Такой сервис уже есть');
    res.status(201).json(await db.one('INSERT INTO ai_services (name, credit_usd, monthly_budget) VALUES ($1,$2,$3) RETURNING id',
      [name, money(b.credit_usd ?? 0, 'Цена кредита'), money(b.monthly_budget ?? 0, 'Бюджет')]));
  }));
  app.patch('/api/admin/services/:id', ...admin, h(async (req, res) => {
    const s = await db.one('SELECT * FROM ai_services WHERE id = $1', [idp(req.params.id)]);
    if (!s) throw fail(404, 'Сервис не найден');
    const b = req.body || {};
    await db.q('UPDATE ai_services SET name=$1, credit_usd=$2, monthly_budget=$3, active=$4 WHERE id=$5',
      [b.name != null ? text(b.name, 2, 40, 'Название') : s.name, b.credit_usd != null ? money(b.credit_usd, 'Цена кредита') : s.credit_usd,
        b.monthly_budget != null ? money(b.monthly_budget, 'Бюджет') : s.monthly_budget, b.active != null ? !!b.active : s.active, s.id]);
    res.json({ ok: true });
  }));

  // ---------- templates ----------
  function tplBody(b) {
    if (!C.TYPES.includes(b.creative_type)) throw fail(400, 'Тип креатива');
    if (!C.PRIORITIES.includes(b.priority || 'medium')) throw fail(400, 'Приоритет');
    const checklist = Array.isArray(b.checklist) ? b.checklist.filter(x => str(x) && x.trim()).map(x => x.trim().slice(0, 200)).slice(0, 20) : [];
    return [text(b.name, 2, 80, 'Название шаблона'), b.creative_type, str(b.description) ? b.description.slice(0, 5000) : '',
      JSON.stringify(checklist), Math.min(100, Math.max(1, +b.quantity || 1)), b.priority || 'medium'];
  }
  app.post('/api/admin/templates', ...admin, h(async (req, res) => {
    res.status(201).json(await db.one(`INSERT INTO templates (name, creative_type, description, checklist, quantity, priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, tplBody(req.body || {})));
  }));
  app.patch('/api/admin/templates/:id', ...admin, h(async (req, res) => {
    const t = await db.one('SELECT * FROM templates WHERE id = $1', [idp(req.params.id)]);
    if (!t) throw fail(404, 'Шаблон не найден');
    const b = { ...t, ...req.body };
    await db.q(`UPDATE templates SET name=$1, creative_type=$2, description=$3, checklist=$4, quantity=$5, priority=$6, active=$7 WHERE id=$8`,
      [...tplBody(b), b.active != null ? !!b.active : t.active, t.id]);
    res.json({ ok: true });
  }));

  // ---------- workspace settings (SLA) ----------
  app.patch('/api/admin/settings', ...admin, h(async (req, res) => {
    const b = req.body || {};
    if (b.sla) {
      const sla = {};
      for (const p of C.PRIORITIES) { const v = +b.sla[p]; if (!Number.isFinite(v) || v < 1 || v > 720) throw fail(400, 'SLA: от 1 до 720 часов'); sla[p] = v; }
      await db.q(`INSERT INTO settings (key, value) VALUES ('sla', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(sla)]);
    }
    if (b.workspace != null) {
      await db.q(`INSERT INTO settings (key, value) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ name: text(b.workspace, 2, 60, 'Название отдела') })]);
    }
    res.json({ ok: true });
  }));
};
