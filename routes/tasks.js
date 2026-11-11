// Tasks: CRUD, workflow (state machine), versions, revision items, comments, AI costs, timer, files, export
module.exports = (app, ctx) => {
  const { db, C, h, fail, str, idp, isOwnerView, auth, role, log, notify, TASK_SELECT, typeStats, withRisk, getTask, canSee, upload, mimeOf } = ctx;
  const ids = (n, start = 1) => Array.from({ length: n }, (_, i) => '$' + (i + start)).join(',');

  // ---------- list ----------
  function listFilter(req) {
    const w = [], a = [], p = (v) => { a.push(v); return '$' + a.length; }, f = req.query;
    if (req.user.role === 'buyer') w.push(`t.buyer_id = ${p(req.user.id)}`);
    if (f.mine === '1') w.push(req.user.role === 'creative' ? `t.creative_id = ${p(req.user.id)}` : `t.buyer_id = ${p(req.user.id)}`);
    if (f.status && C.STATUSES.includes(f.status)) w.push(`t.status = ${p(f.status)}`);
    if (f.type && C.TYPES.includes(f.type)) w.push(`t.creative_type = ${p(f.type)}`);
    if (f.priority && C.PRIORITIES.includes(f.priority)) w.push(`t.priority = ${p(f.priority)}`);
    if (idp(f.creative_id)) w.push(`t.creative_id = ${p(idp(f.creative_id))}`);
    if (idp(f.buyer_id)) w.push(`t.buyer_id = ${p(idp(f.buyer_id))}`);
    if (idp(f.offer_id)) w.push(`t.offer_id = ${p(idp(f.offer_id))}`);
    if (f.geo && /^[A-Z]{2}$/.test(f.geo)) w.push(`(',' || replace(t.geo, ' ', '') || ',') LIKE ${p('%,' + f.geo + ',%')}`);
    if (f.overdue === '1') w.push(`(COALESCE(t.completed_at, now()) > t.deadline)`);
    if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) w.push(`t.created_at >= ${p(new Date(f.from).toISOString())}`);
    if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) && f.to < '2100') w.push(`t.created_at < ${p(new Date(Date.parse(f.to) + 864e5).toISOString())}`);
    if (str(f.q) && f.q.trim()) {
      const q = '%' + f.q.trim().toLowerCase() + '%';
      w.push(`(lower(t.title) LIKE ${p(q)} OR lower(o.name) LIKE ${p(q)} OR lower(t.geo) LIKE ${p(q)} OR ('#' || t.id) = ${p(f.q.trim())})`);
    }
    return { where: w.length ? ' WHERE ' + w.join(' AND ') : '', args: a };
  }
  const ORDER = ` ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.deadline`;

  app.get('/api/tasks', auth, h(async (req, res) => {
    const { where, args } = listFilter(req);
    let rows = withRisk(await db.q(TASK_SELECT + where + ORDER, args), await typeStats());
    if (req.query.risk === '1') rows = rows.filter(t => t.risk);
    res.json(rows);
  }));

  app.get('/api/tasks/export.csv', auth, h(async (req, res) => {
    const { where, args } = listFilter(req);
    const rows = withRisk(await db.q(TASK_SELECT + where + ORDER, args), await typeStats());
    const cols = [['id', 'ID'], ['title', 'Задача'], ['offer_name', 'Оффер'], ['geo', 'GEO'], ['creative_type', 'Тип'], ['quantity', 'Кол-во'],
      ['priority', 'Приоритет'], ['status', 'Статус'], ['buyer_name', 'Байер'], ['creative_name', 'Исполнитель'], ['created_at', 'Создана'],
      ['taken_at', 'Взята'], ['completed_at', 'Завершена'], ['deadline', 'Дедлайн'], ['revisions', 'Правок'], ['ai_credits', 'AI-кредиты'],
      ['ai_usd', 'AI $'], ['work_sec', 'Работа, ч'], ['library_status', 'Результат']];
    const cell = (v, k) => {
      if (v == null) return '';
      if (v instanceof Date) v = v.toISOString().replace('T', ' ').slice(0, 16);
      if (k === 'work_sec') v = (v / 3600).toFixed(1);
      if (k === 'ai_usd') v = (+v).toFixed(2);
      v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; // CSV injection guard
      return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const csv = '﻿' + [cols.map(c => c[1]).join(';'), ...rows.map(r => cols.map(([k]) => cell(r[k], k)).join(';'))].join('\r\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="tasks.csv"' }).send(csv);
  }));

  // ---------- detail ----------
  app.get('/api/tasks/:id', auth, h(async (req, res) => {
    const t = await getTask(idp(req.params.id));
    if (!t || !canSee(req.user, t)) throw fail(404, 'Задача не найдена');
    const id = t.id;
    const [full, versions, files, items, comments, costs, history, time, kids] = await Promise.all([
      db.one('SELECT description, refs, checklist FROM tasks WHERE id = $1', [id]),
      db.q(`SELECT v.id, v.n, v.user_id, u.name AS user_name, v.comment, v.links, v.status, v.created_at FROM versions v JOIN users u ON u.id = v.user_id WHERE v.task_id = $1 ORDER BY v.n`, [id]),
      db.q('SELECT id, version_id, kind, name, mime, size FROM files WHERE task_id = $1 ORDER BY id', [id]),
      db.q(`SELECT i.id, i.version_id, i.text, i.reason, i.done, i.done_at, i.created_at, u.name AS author FROM revision_items i LEFT JOIN users u ON u.id = i.created_by WHERE i.task_id = $1 ORDER BY i.id`, [id]),
      db.q(`SELECT c.id, c.user_id, u.name AS user_name, c.body, c.created_at FROM comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = $1 ORDER BY c.id`, [id]),
      db.q(`SELECT a.id, a.round, a.credits::float8 AS credits, (a.credits * s.credit_usd)::float8 AS usd, s.name AS service, u.name AS user_name, a.created_at
            FROM ai_costs a JOIN ai_services s ON s.id = a.service_id JOIN users u ON u.id = a.user_id WHERE a.task_id = $1 ORDER BY a.id`, [id]),
      db.q(`SELECT h.id, h.user_id, u.name AS user_name, h.action, h.from_status, h.to_status, h.comment, h.created_at FROM history h JOIN users u ON u.id = h.user_id WHERE h.task_id = $1 ORDER BY h.id`, [id]),
      db.q(`SELECT e.user_id, u.name AS user_name, sum(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at)))::float8 AS sec,
              bool_or(e.ended_at IS NULL) AS running, max(CASE WHEN e.ended_at IS NULL THEN e.started_at END) AS running_since
            FROM time_entries e JOIN users u ON u.id = e.user_id WHERE e.task_id = $1 GROUP BY e.user_id, u.name`, [id]),
      db.q(`SELECT t.id, t.title, t.status, l.status AS library_status FROM tasks t LEFT JOIN library l ON l.task_id = t.id
            WHERE t.parent_library_id = (SELECT id FROM library WHERE task_id = $1) ORDER BY t.id`, [id]),
    ]);
    Object.assign(t, full);
    t.versions = versions.map(v => ({ ...v, files: files.filter(f => f.version_id === v.id) }));
    t.ref_files = files.filter(f => f.kind === 'ref');
    Object.assign(t, { items, comments, ai_costs: costs, history, time, variations: kids });
    t.parent = t.parent_library_id ? await db.one(`SELECT l.id, l.status, t.id AS task_id, t.title,
        (SELECT f.id FROM files f WHERE f.version_id = l.version_id AND f.mime LIKE 'image/%' ORDER BY f.id LIMIT 1) AS cover_id
      FROM library l JOIN tasks t ON t.id = l.task_id WHERE l.id = $1`, [t.parent_library_id]) : null;
    t.library = await db.one('SELECT id, status, tags, spend::float8 AS spend, ctr::float8 AS ctr, cr::float8 AS cr, roi::float8 AS roi FROM library WHERE task_id = $1', [id]) || null;
    t.labor_usd = (await db.one(`SELECT COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at)) / 3600 * u.hourly_rate), 0)::float8 AS v
      FROM time_entries e JOIN users u ON u.id = e.user_id WHERE e.task_id = $1`, [id])).v;
    if (!isOwnerView(req.user, t)) { // another buyer browsing the library: final work only
      const acc = t.library?.id ? (await db.one('SELECT version_id FROM library WHERE id = $1', [t.library.id]))?.version_id : null;
      t.versions = t.versions.filter(v => v.id === acc);
      Object.assign(t, { refs: '', ref_files: [], items: [], comments: [], ai_costs: [], history: [], time: [], labor_usd: null, ai_usd: null, work_sec: 0, readonly: true });
    }
    res.json(t);
  }));

  // ---------- create / edit ----------
  async function validate(b, isNew) {
    const e = [];
    if (!str(b.title) || b.title.trim().length < 2 || b.title.length > 140) e.push('название (2–140 символов)');
    const offer = +b.offer_id && await db.one('SELECT id FROM offers WHERE id = $1 AND active', [+b.offer_id]);
    if (!offer) e.push('оффер из справочника');
    const geos = str(b.geo) ? [...new Set(b.geo.toUpperCase().split(/[\s,]+/).filter(Boolean))] : [];
    if (!geos.length || geos.length > 10) e.push('GEO');
    else {
      const known = await db.q(`SELECT code FROM geos WHERE code IN (${ids(geos.length)})`, geos);
      if (known.length !== geos.length) e.push('GEO из справочника');
    }
    if (!C.TYPES.includes(b.creative_type)) e.push('тип креатива');
    if (!(Number.isInteger(+b.quantity) && +b.quantity >= 1 && +b.quantity <= 100)) e.push('количество 1–100');
    if (!C.PRIORITIES.includes(b.priority)) e.push('приоритет');
    if (!str(b.deadline) || isNaN(Date.parse(b.deadline))) e.push('дедлайн');
    else if (isNew && Date.parse(b.deadline) < Date.now() - 36e5) e.push('дедлайн в будущем');
    for (const [k, max] of [['description', 5000], ['refs', 3000]]) if (b[k] != null && (!str(b[k]) || b[k].length > max)) e.push(k);
    const checklist = Array.isArray(b.checklist) ? b.checklist.filter(x => str(x) && x.trim()).map(x => x.trim().slice(0, 200)).slice(0, 20) : [];
    if (e.length) throw fail(400, 'Проверьте поля: ' + e.join(', '));
    return { geo: geos.join(', '), checklist };
  }

  app.post('/api/tasks', auth, role('buyer', 'lead'), h(async (req, res) => {
    const b = req.body || {};
    const { geo, checklist } = await validate(b, true);
    const tpl = +b.template_id ? (await db.one('SELECT id FROM templates WHERE id = $1', [+b.template_id]))?.id : null;
    const parent = +b.parent_library_id ? (await db.one('SELECT id FROM library WHERE id = $1', [+b.parent_library_id]))?.id : null;
    const id = await db.tx(async (q) => {
      const [t] = await q(`INSERT INTO tasks (title, offer_id, geo, creative_type, quantity, description, refs, checklist, priority, deadline, buyer_id, template_id, parent_library_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [b.title.trim(), +b.offer_id, geo, b.creative_type, +b.quantity, b.description || '', b.refs || '', JSON.stringify(checklist), b.priority, new Date(b.deadline), req.user.id, tpl, parent]);
      await log(q, t.id, req.user.id, 'created', null, 'new', parent ? 'Вариация креатива из библиотеки' : null);
      return t.id;
    });
    // Notify creatives whose specialization matches; everyone if nobody matches
    const all = await db.q(`SELECT id, specialization FROM users WHERE role = 'creative' AND active`);
    const match = all.filter(u => u.specialization.split(',').map(s => s.trim()).includes(b.creative_type));
    await notify((match.length ? match : all).map(u => u.id), { actor: req.user.id, task: id, type: 'created' });
    res.status(201).json(await getTask(id));
  }));

  app.patch('/api/tasks/:id', auth, h(async (req, res) => {
    const t = await getTask(idp(req.params.id));
    if (!t) throw fail(404, 'Задача не найдена');
    if (!(req.user.role === 'lead' || t.buyer_id === req.user.id)) throw fail(403, 'Редактировать может только автор ТЗ');
    if (t.status === 'done' && req.user.role !== 'lead') throw fail(409, 'Принятую задачу нельзя редактировать — переоткройте её');
    const cur = await db.one('SELECT description, refs, checklist FROM tasks WHERE id = $1', [t.id]);
    const b = { ...t, ...cur, deadline: new Date(t.deadline).toISOString(), ...req.body };
    const { geo, checklist } = await validate(b, false);
    const fields = { title: b.title.trim(), offer_id: +b.offer_id, geo, creative_type: b.creative_type, quantity: +b.quantity, description: b.description || '',
      refs: b.refs || '', priority: b.priority, deadline: new Date(b.deadline).toISOString() };
    const changed = Object.keys(fields).filter(k => String(fields[k]) !== String(k === 'deadline' ? new Date(t.deadline).toISOString() : (t[k] ?? cur[k])));
    if (JSON.stringify(checklist) !== JSON.stringify(cur.checklist)) changed.push('checklist');
    if (!changed.length) return res.json(t);
    await db.tx(async (q) => {
      await q(`UPDATE tasks SET title=$1, offer_id=$2, geo=$3, creative_type=$4, quantity=$5, description=$6, refs=$7, priority=$8, deadline=$9, checklist=$10 WHERE id=$11`,
        [...Object.values(fields), JSON.stringify(checklist), t.id]);
      await log(q, t.id, req.user.id, 'edited', null, null, 'Изменено: ' + changed.join(', '));
    });
    if (t.creative_id) await notify([t.creative_id], { actor: req.user.id, task: t.id, type: 'edited', text: changed.join(', ') });
    res.json(await getTask(t.id));
  }));

  app.delete('/api/tasks/:id', auth, h(async (req, res) => {
    const t = await getTask(idp(req.params.id));
    if (!t) throw fail(404, 'Задача не найдена');
    if (!(req.user.role === 'lead' || (t.buyer_id === req.user.id && t.status === 'new'))) throw fail(403, 'Удалить можно только свою задачу в «Новых»');
    if (t.library_id) throw fail(409, 'Креатив уже в библиотеке с результатами — удалить задачу нельзя');
    const r = await db.q(`DELETE FROM tasks WHERE id = $1 AND ($2 OR status = 'new') RETURNING id`, [t.id, req.user.role === 'lead']);
    if (!r.length) throw fail(409, 'Задачу уже взяли в работу');
    res.json({ ok: true });
  }));

  // ---------- workflow ----------
  const FLOW = {
    take:    { from: ['new'], to: 'in_progress', roles: ['creative'] },
    assign:  { from: ['new'], to: 'in_progress', roles: ['lead'] },
    release: { from: ['in_progress', 'revision'], to: 'new', roles: ['creative', 'lead'] },
    submit:  { from: ['in_progress', 'revision'], to: 'review', roles: ['creative'] },
    revise:  { from: ['review'], to: 'revision', roles: ['buyer', 'lead'] },
    accept:  { from: ['review'], to: 'done', roles: ['buyer', 'lead'] },
    reopen:  { from: ['done'], to: 'revision', roles: ['buyer', 'lead'] },
  };
  async function guard(req, action) {
    const t = await getTask(idp(req.params.id));
    if (!t) throw fail(404, 'Задача не найдена');
    const f = FLOW[action], u = req.user;
    if (!f.roles.includes(u.role)) throw fail(403, 'Действие недоступно вашей роли');
    if (!f.from.includes(t.status)) throw fail(409, 'Недопустимый переход статуса');
    if (u.role === 'creative' && action !== 'take' && t.creative_id !== u.id) throw fail(403, 'Задача закреплена за другим исполнителем');
    if (u.role === 'buyer' && t.buyer_id !== u.id) throw fail(403, 'Это не ваша задача');
    return t;
  }
  async function lock(q, t, action) {
    const [row] = await q('SELECT status, creative_id FROM tasks WHERE id = $1 FOR UPDATE', [t.id]);
    if (!row || !FLOW[action].from.includes(row.status) || (row.creative_id || null) !== (t.creative_id || null)) throw fail(409, 'Задача только что изменилась — обновите страницу');
  }
  const stopTimers = (q, taskId) => q('UPDATE time_entries SET ended_at = now() WHERE task_id = $1 AND ended_at IS NULL', [taskId]);

  app.post('/api/tasks/:id/take', auth, h(async (req, res) => {
    const t = await guard(req, 'take');
    await db.tx(async (q) => {
      const r = await q(`UPDATE tasks SET status='in_progress', creative_id=$1, taken_at=now() WHERE id=$2 AND status='new' RETURNING id`, [req.user.id, t.id]);
      if (!r.length) throw fail(409, 'Задачу уже взял другой исполнитель');
      await log(q, t.id, req.user.id, 'take', 'new', 'in_progress');
    });
    await notify([t.buyer_id], { actor: req.user.id, task: t.id, type: 'take' });
    res.json(await getTask(t.id));
  }));

  app.post('/api/tasks/:id/assign', auth, h(async (req, res) => {
    const t = await guard(req, 'assign');
    const u = await db.one(`SELECT id, name FROM users WHERE id = $1 AND role = 'creative' AND active`, [+req.body?.creative_id]);
    if (!u) throw fail(400, 'Выберите креативщика');
    await db.tx(async (q) => {
      await lock(q, t, 'assign');
      await q(`UPDATE tasks SET status='in_progress', creative_id=$1, taken_at=now() WHERE id=$2`, [u.id, t.id]);
      await log(q, t.id, req.user.id, 'assign', 'new', 'in_progress', 'Исполнитель: ' + u.name);
    });
    await notify([u.id, t.buyer_id], { actor: req.user.id, task: t.id, type: 'assign', text: u.name });
    res.json(await getTask(t.id));
  }));

  app.post('/api/tasks/:id/release', auth, h(async (req, res) => {
    const t = await guard(req, 'release');
    await db.tx(async (q) => {
      await lock(q, t, 'release');
      await stopTimers(q, t.id);
      await q(`UPDATE tasks SET status='new', creative_id=NULL, taken_at=NULL WHERE id=$1`, [t.id]);
      await log(q, t.id, req.user.id, 'release', t.status, 'new', str(req.body?.comment) ? req.body.comment.slice(0, 500) : null);
    });
    await notify([t.buyer_id, t.creative_id], { actor: req.user.id, task: t.id, type: 'release' });
    res.json(await getTask(t.id));
  }));

  // Submit a new version: files + links + AI costs + which revision items were addressed
  const parseJSON = (s, d) => { try { return JSON.parse(s || ''); } catch { return d; } };
  app.post('/api/tasks/:id/submit', auth, h(async (req, res, next) => { await guard(req, 'submit'); next(); }), upload.array('files'), h(async (req, res) => {
    const t = await guard(req, 'submit');
    const links = String(req.body.links || '').split(/\s+/).filter(l => /^https?:\/\/\S+$/i.test(l)).slice(0, 10);
    const files = req.files || [];
    if (!files.length && !links.length) throw fail(400, 'Прикрепите файл или ссылку на результат');
    const opt = (v) => v == null || v === '' ? [] : parseJSON(v, null); // absent = none, malformed = 400
    const costs = opt(req.body.ai_costs), done = opt(req.body.done_items);
    if (!Array.isArray(costs) || !Array.isArray(done)) throw fail(400, 'Некорректные данные формы');
    const services = await db.q('SELECT id FROM ai_services WHERE active');
    const valid = costs.filter(c => c && services.some(s => s.id === +c.service_id) && Number.isFinite(+c.credits) && +c.credits > 0 && +c.credits <= 1e6);
    const comment = str(req.body.comment) ? req.body.comment.slice(0, 2000) : '';
    await db.tx(async (q) => {
      await lock(q, t, 'submit');
      const [{ n }] = await q('SELECT COALESCE(max(n), 0)::int + 1 AS n FROM versions WHERE task_id = $1', [t.id]);
      const [v] = await q('INSERT INTO versions (task_id, n, user_id, comment, links) VALUES ($1,$2,$3,$4,$5) RETURNING id', [t.id, n, req.user.id, comment, links.join('\n')]);
      for (const f of files) {
        await q('INSERT INTO files (task_id, version_id, kind, name, mime, size, data, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [t.id, v.id, 'result', f.originalname.slice(0, 160), mimeOf(f.originalname), f.size, f.buffer, req.user.id]);
      }
      for (const c of valid) await q('INSERT INTO ai_costs (task_id, user_id, service_id, credits, round) VALUES ($1,$2,$3,$4,$5)', [t.id, req.user.id, +c.service_id, +c.credits, t.revisions]);
      const doneIds = [...new Set(done.map(idp).filter(Boolean))].slice(0, 100);
      if (doneIds.length) await q(`UPDATE revision_items SET done = true, done_at = now() WHERE task_id = $1 AND NOT done AND id IN (${ids(doneIds.length, 2)})`, [t.id, ...doneIds]);
      await stopTimers(q, t.id);
      await q(`UPDATE tasks SET status='review', submitted_at=now(), first_submitted_at=COALESCE(first_submitted_at, now()) WHERE id=$1`, [t.id]);
      await log(q, t.id, req.user.id, 'submit', t.status, 'review', `Версия v${n}` + (comment ? ': ' + comment.slice(0, 200) : ''));
    });
    await notify([t.buyer_id], { actor: req.user.id, task: t.id, type: 'submit' });
    if (valid.length) await budgetCheck(valid.map(c => +c.service_id), req.user.id);
    res.json(await getTask(t.id));
  }));

  function parseItems(body) {
    const items = Array.isArray(body?.items) ? body.items.filter(i => i && str(i.text) && i.text.trim()).slice(0, 30)
      .map(i => ({ text: i.text.trim().slice(0, 500), reason: C.REASONS.includes(i.reason) ? i.reason : 'other' })) : [];
    if (!items.length) throw fail(400, 'Добавьте хотя бы один пункт правок');
    return items;
  }
  async function sendBack(req, res, action) {
    const t = await guard(req, action);
    const items = parseItems(req.body);
    await db.tx(async (q) => {
      await lock(q, t, action);
      const [v] = await q('SELECT id, n FROM versions WHERE task_id = $1 ORDER BY n DESC LIMIT 1', [t.id]);
      if (v) await q(`UPDATE versions SET status = 'revision' WHERE id = $1`, [v.id]);
      for (const i of items) await q('INSERT INTO revision_items (task_id, version_id, text, reason, created_by) VALUES ($1,$2,$3,$4,$5)', [t.id, v?.id || null, i.text, i.reason, req.user.id]);
      await q(`UPDATE tasks SET status='revision', revisions=revisions+1, completed_at=NULL WHERE id=$1`, [t.id]);
      await log(q, t.id, req.user.id, action, t.status, 'revision', items.map(i => '• ' + i.text).join('\n'));
    });
    await notify([t.creative_id], { actor: req.user.id, task: t.id, type: 'revise', text: `${items.length} п.` });
    res.json(await getTask(t.id));
  }
  app.post('/api/tasks/:id/revise', auth, h((req, res) => sendBack(req, res, 'revise')));
  app.post('/api/tasks/:id/reopen', auth, h((req, res) => sendBack(req, res, 'reopen')));

  app.post('/api/tasks/:id/accept', auth, h(async (req, res) => {
    const t = await guard(req, 'accept');
    await db.tx(async (q) => {
      await lock(q, t, 'accept');
      const [v] = await q('SELECT id FROM versions WHERE task_id = $1 ORDER BY n DESC LIMIT 1', [t.id]);
      if (v) await q(`UPDATE versions SET status = 'accepted' WHERE id = $1`, [v.id]);
      await q(`UPDATE tasks SET status='done', completed_at=now() WHERE id=$1`, [t.id]);
      // accepted work goes to the creative library automatically
      await q(`INSERT INTO library (task_id, version_id) VALUES ($1, $2) ON CONFLICT (task_id) DO UPDATE SET version_id = EXCLUDED.version_id`, [t.id, v?.id || null]);
      await log(q, t.id, req.user.id, 'accept', 'review', 'done', str(req.body?.comment) ? req.body.comment.slice(0, 500) : null);
    });
    await notify([t.creative_id], { actor: req.user.id, task: t.id, type: 'accept' });
    res.json(await getTask(t.id));
  }));

  // ---------- revision items ----------
  app.post('/api/items/:id/toggle', auth, h(async (req, res) => {
    const it = await db.one('SELECT i.id, i.done, t.id AS task_id, t.creative_id, t.buyer_id FROM revision_items i JOIN tasks t ON t.id = i.task_id WHERE i.id = $1', [idp(req.params.id)]);
    if (!it) throw fail(404, 'Пункт не найден');
    const u = req.user;
    if (!(u.role === 'lead' || it.creative_id === u.id || it.buyer_id === u.id)) throw fail(403, 'Нет доступа');
    await db.q('UPDATE revision_items SET done = NOT done, done_at = CASE WHEN done THEN NULL ELSE now() END WHERE id = $1', [it.id]);
    res.json({ ok: true, done: !it.done });
  }));

  // ---------- comments with @mentions ----------
  app.post('/api/tasks/:id/comments', auth, h(async (req, res) => {
    const t = await getTask(idp(req.params.id));
    if (!t || !canSee(req.user, t)) throw fail(404, 'Задача не найдена');
    const body = str(req.body?.body) ? req.body.body.trim().slice(0, 2000) : '';
    if (!body) throw fail(400, 'Пустой комментарий');
    await db.q('INSERT INTO comments (task_id, user_id, body) VALUES ($1,$2,$3)', [t.id, req.user.id, body]);
    const logins = [...new Set([...body.matchAll(/@([a-z0-9_.-]{2,32})/gi)].map(m => m[1].toLowerCase()))];
    const mentioned = logins.length ? await db.q(`SELECT id FROM users WHERE login IN (${ids(logins.length)})`, logins) : [];
    await notify(mentioned.map(m => m.id), { actor: req.user.id, task: t.id, type: 'mention', text: body.slice(0, 140) });
    await notify([t.buyer_id, t.creative_id].filter(id => !mentioned.some(m => m.id === id)), { actor: req.user.id, task: t.id, type: 'comment', text: body.slice(0, 140) });
    res.json({ ok: true });
  }));

  // ---------- AI costs + monthly budget alerts ----------
  async function budgetCheck(serviceIds, actor) {
    for (const sid of [...new Set(serviceIds)]) {
      const s = await db.one(`SELECT s.name, s.monthly_budget::float8 AS budget,
          COALESCE((SELECT sum(credits) FROM ai_costs WHERE service_id = s.id AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')), 0)::float8 AS used
        FROM ai_services s WHERE s.id = $1`, [sid]);
      if (!s || !s.budget) continue;
      const pct = s.used / s.budget * 100, level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
      if (!level) continue;
      const already = await db.one(`SELECT 1 FROM notifications WHERE type = 'budget' AND starts_with(text, $1) AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') LIMIT 1`, [`${s.name}: ${level}%`]);
      if (already) continue;
      const leads = await db.q(`SELECT id FROM users WHERE role = 'lead' AND active`);
      await notify(leads.map(l => l.id), { actor, type: 'budget', text: `${s.name}: ${level}% месячного бюджета (${Math.round(s.used)} из ${Math.round(s.budget)} кр.)` });
    }
  }
  app.post('/api/tasks/:id/ai-costs', auth, role('creative'), h(async (req, res) => {
    const t = await getTask(idp(req.params.id));
    if (!t || t.creative_id !== req.user.id) throw fail(403, 'Это не ваша задача');
    if (!['in_progress', 'revision'].includes(t.status)) throw fail(409, 'Расходы добавляются, пока задача в работе или на правках');
    const sid = +req.body?.service_id, credits = +req.body?.credits;
    const s = await db.one('SELECT id, name FROM ai_services WHERE id = $1 AND active', [sid]);
    if (!s || !Number.isFinite(credits) || credits <= 0 || credits > 1e6) throw fail(400, 'Укажите сервис и количество кредитов');
    await db.tx(async (q) => {
      await q('INSERT INTO ai_costs (task_id, user_id, service_id, credits, round) VALUES ($1,$2,$3,$4,$5)', [t.id, req.user.id, sid, credits, t.revisions]);
      await log(q, t.id, req.user.id, 'ai_cost', null, null, `${s.name}: ${credits} кр.`);
    });
    await budgetCheck([sid], req.user.id);
    res.json({ ok: true });
  }));

  // ---------- work timer ----------
  app.post('/api/tasks/:id/timer', auth, role('creative'), h(async (req, res) => {
    const t = await getTask(idp(req.params.id));
    if (!t || t.creative_id !== req.user.id) throw fail(403, 'Это не ваша задача');
    if (req.body?.action === 'start') {
      if (!['in_progress', 'revision'].includes(t.status)) throw fail(409, 'Таймер доступен для задач в работе и на правках');
      await db.tx(async (q) => {
        await q('UPDATE time_entries SET ended_at = now() WHERE user_id = $1 AND ended_at IS NULL', [req.user.id]); // one timer at a time
        await q('INSERT INTO time_entries (task_id, user_id, started_at) VALUES ($1, $2, now())', [t.id, req.user.id]);
      });
    } else {
      await db.q('UPDATE time_entries SET ended_at = now() WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL', [t.id, req.user.id]);
    }
    res.json({ ok: true });
  }));
  app.get('/api/timer', auth, h(async (req, res) => {
    res.json(await db.one(`SELECT e.task_id, e.started_at, t.title FROM time_entries e JOIN tasks t ON t.id = e.task_id
      WHERE e.user_id = $1 AND e.ended_at IS NULL LIMIT 1`, [req.user.id]) || null);
  }));

  // ---------- reference files + file serving ----------
  app.post('/api/tasks/:id/files', auth, h(async (req, res, next) => {
    const t = await getTask(idp(req.params.id));
    if (!t) throw fail(404, 'Задача не найдена');
    if (!(req.user.role === 'lead' || t.buyer_id === req.user.id)) throw fail(403, 'Добавлять референсы может автор ТЗ');
    req.task = t; next();
  }), upload.array('files'), h(async (req, res) => {
    for (const f of req.files || []) {
      await db.q('INSERT INTO files (task_id, kind, name, mime, size, data, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.task.id, 'ref', f.originalname.slice(0, 160), mimeOf(f.originalname), f.size, f.buffer, req.user.id]);
    }
    res.json({ ok: true, count: (req.files || []).length });
  }));

  app.get('/api/files/:id', auth, h(async (req, res) => {
    const f = await db.one('SELECT f.*, t.buyer_id, (SELECT id FROM library WHERE task_id = t.id) AS library_id FROM files f JOIN tasks t ON t.id = f.task_id WHERE f.id = $1', [idp(req.params.id)]);
    if (!f || !canSee(req.user, f)) throw fail(404, 'Файл не найден');
    if (!isOwnerView(req.user, f)) {
      const lib = await db.one('SELECT version_id FROM library WHERE task_id = $1', [f.task_id]);
      if (!lib || f.version_id !== lib.version_id) throw fail(404, 'Файл не найден');
    }
    const media = /^(image|video)\//.test(f.mime) && req.query.dl !== '1';
    res.set({
      'Content-Type': f.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Content-Disposition': `${media ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    });
    res.send(f.data);
  }));
};
