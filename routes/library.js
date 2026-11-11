// Creative library: accepted work + launch results (feedback loop to the creative team)
module.exports = (app, { db, C, h, fail, str, idp, auth, notify }) => {
  const LIB_SELECT = `
SELECT l.id, l.status, l.tags, l.spend::float8 AS spend, l.ctr::float8 AS ctr, l.cr::float8 AS cr, l.roi::float8 AS roi,
  l.status_at, l.created_at, l.version_id, t.id AS task_id, t.title, t.offer_id, o.name AS offer_name, t.geo, t.creative_type, t.quantity,
  t.creative_id, c.name AS creative_name, t.buyer_id, b.name AS buyer_name, t.parent_library_id, t.completed_at, t.revisions,
  (SELECT f.id FROM files f WHERE f.version_id = l.version_id AND f.mime LIKE 'image/%' ORDER BY f.id LIMIT 1) AS cover_id,
  (SELECT count(*) FROM files f WHERE f.version_id = l.version_id)::int AS files_count,
  (SELECT count(*) FROM tasks x WHERE x.parent_library_id = l.id)::int AS variations,
  (SELECT count(*) FROM tasks x JOIN library y ON y.task_id = x.id WHERE x.parent_library_id = l.id AND y.status = 'winner')::int AS variation_wins
FROM library l JOIN tasks t ON t.id = l.task_id LEFT JOIN offers o ON o.id = t.offer_id
LEFT JOIN users c ON c.id = t.creative_id JOIN users b ON b.id = t.buyer_id`;

  app.get('/api/library', auth, h(async (req, res) => {
    const w = [], a = [], p = (v) => { a.push(v); return '$' + a.length; }, f = req.query;
    if (C.LIB.includes(f.status)) w.push(`l.status = ${p(f.status)}`);
    if (f.status === 'needs_result') w.push(`l.status IN ('pending','testing') AND l.created_at < now() - interval '2 days'`);
    if (C.TYPES.includes(f.type)) w.push(`t.creative_type = ${p(f.type)}`);
    if (+f.offer_id) w.push(`t.offer_id = ${p(+f.offer_id)}`);
    if (+f.creative_id) w.push(`t.creative_id = ${p(+f.creative_id)}`);
    if (+f.buyer_id) w.push(`t.buyer_id = ${p(+f.buyer_id)}`);
    if (f.geo && /^[A-Z]{2}$/.test(f.geo)) w.push(`(',' || replace(t.geo, ' ', '') || ',') LIKE ${p('%,' + f.geo + ',%')}`);
    if (str(f.q) && f.q.trim()) { const q = '%' + f.q.trim().toLowerCase() + '%'; w.push(`(lower(t.title) LIKE ${p(q)} OR lower(o.name) LIKE ${p(q)} OR lower(l.tags) LIKE ${p(q)})`); }
    const order = f.sort === 'roi' ? 'l.roi DESC NULLS LAST' : `CASE l.status WHEN 'winner' THEN 0 WHEN 'testing' THEN 1 WHEN 'pending' THEN 2 WHEN 'average' THEN 3 ELSE 4 END, t.completed_at DESC`;
    res.json(await db.q(LIB_SELECT + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY ' + order + ' LIMIT 300', a));
  }));

  const num = (v, min, max) => v === '' || v == null ? null : (Number.isFinite(+v) && +v >= min && +v <= max ? +v : NaN);
  app.patch('/api/library/:id', auth, h(async (req, res) => {
    const it = await db.one(LIB_SELECT + ' WHERE l.id = $1', [idp(req.params.id)]);
    if (!it) throw fail(404, 'Креатив не найден');
    if (!(req.user.role === 'lead' || it.buyer_id === req.user.id)) throw fail(403, 'Результат отмечает байер, который запускал креатив');
    const b = req.body || {};
    const status = b.status === undefined ? it.status : b.status;
    if (!C.LIB.includes(status)) throw fail(400, 'Неизвестный статус');
    const m = { spend: num(b.spend ?? it.spend, 0, 1e9), ctr: num(b.ctr ?? it.ctr, 0, 100), cr: num(b.cr ?? it.cr, 0, 100), roi: num(b.roi ?? it.roi, -100, 10000) };
    if (Object.values(m).some(Number.isNaN)) throw fail(400, 'Метрики: spend ≥ 0, CTR/CR 0–100%, ROI от −100%');
    const tags = str(b.tags) ? b.tags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 10).join(', ').slice(0, 200) : it.tags;
    await db.q(`UPDATE library SET status=$1, spend=$2, ctr=$3, cr=$4, roi=$5, tags=$6,
      status_by = CASE WHEN status <> $1 THEN $7 ELSE status_by END, status_at = CASE WHEN status <> $1 THEN now() ELSE status_at END WHERE id=$8`,
      [status, m.spend, m.ctr, m.cr, m.roi, tags, req.user.id, it.id]);
    if (status !== it.status) {
      await db.q('INSERT INTO history (task_id, user_id, action, comment) VALUES ($1,$2,$3,$4)', [it.task_id, req.user.id, 'result', status]);
      if (['winner', 'average', 'burned', 'testing'].includes(status))
        await notify([it.creative_id], { actor: req.user.id, task: it.task_id, type: 'result', text: status });
    }
    res.json(await db.one(LIB_SELECT + ' WHERE l.id = $1', [it.id]));
  }));
};
