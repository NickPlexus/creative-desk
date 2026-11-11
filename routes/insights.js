// "My day", smart brief insights, assignee recommendations, analytics, team, notifications, search
module.exports = (app, { db, C, h, fail, str, auth, role, TASK_SELECT, typeStats, withRisk }) => {
  const H = (a, b) => `EXTRACT(EPOCH FROM (${a} - ${b})) / 3600`;
  const winRate = (w, a, b) => (w + a + b) ? Math.round(w / (w + a + b) * 100) : null;

  // ---------- assignee scoring (used by recommendations and the brief helper) ----------
  async function scoreCreatives(type, offerId) {
    const rows = await db.q(`SELECT u.id, u.name, u.specialization,
        (SELECT count(*) FROM tasks t WHERE t.creative_id = u.id AND t.status IN ('in_progress','revision','review'))::int AS load,
        (SELECT count(*) FROM tasks t WHERE t.creative_id = u.id AND t.status = 'done' AND t.creative_type = $1)::int AS done_type,
        (SELECT count(*) FROM tasks t JOIN library l ON l.task_id = t.id WHERE t.creative_id = u.id AND l.status = 'winner' AND t.creative_type = $1)::int AS wins_type,
        (SELECT count(*) FROM tasks t JOIN library l ON l.task_id = t.id WHERE t.creative_id = u.id AND l.status = 'winner' AND t.offer_id = $2)::int AS wins_offer,
        (SELECT avg(${H('t.completed_at', 't.taken_at')}) FROM tasks t WHERE t.creative_id = u.id AND t.creative_type = $1 AND t.completed_at IS NOT NULL)::float8 AS avg_h
      FROM users u WHERE u.role = 'creative' AND u.active`, [type, offerId || 0]);
    return rows.map(r => {
      const spec = r.specialization.split(',').map(s => s.trim()).includes(type);
      const score = (spec ? 3 : 0) + r.wins_offer * 2 + r.wins_type + r.done_type * 0.3 - r.load * 1.5;
      const why = [];
      if (spec) why.push('профильная специализация');
      if (r.wins_offer) why.push(`${r.wins_offer} победит. по этому офферу`);
      else if (r.wins_type) why.push(`${r.wins_type} победит. в этом типе`);
      why.push(r.load ? `в работе ${r.load}` : 'свободен(на)');
      return { ...r, spec, score: Math.round(score * 10) / 10, why };
    }).sort((a, b) => b.score - a.score);
  }
  app.get('/api/recommend', auth, h(async (req, res) => {
    if (!C.TYPES.includes(req.query.type)) throw fail(400, 'Не указан тип креатива');
    res.json(await scoreCreatives(req.query.type, +req.query.offer_id));
  }));

  // ---------- brief helper: what already worked for this offer / type ----------
  app.get('/api/insights', auth, h(async (req, res) => {
    const type = C.TYPES.includes(req.query.type) ? req.query.type : 'video', offer = +req.query.offer_id || 0;
    const [winners, stats, reasons, queue, sla, creatives] = await Promise.all([
      db.q(`SELECT l.id, t.title, t.geo, t.creative_type, c.name AS creative_name, l.roi::float8 AS roi, l.ctr::float8 AS ctr, t.offer_id,
          (SELECT f.id FROM files f WHERE f.version_id = l.version_id AND f.mime LIKE 'image/%' ORDER BY f.id LIMIT 1) AS cover_id
        FROM library l JOIN tasks t ON t.id = l.task_id LEFT JOIN users c ON c.id = t.creative_id
        WHERE l.status = 'winner' AND (t.offer_id = $1 OR t.creative_type = $2)
        ORDER BY (t.offer_id = $1) DESC, (t.creative_type = $2) DESC, l.roi DESC NULLS LAST LIMIT 4`, [offer, type]),
      db.one(`SELECT count(*)::int AS n,
          avg(CASE WHEN completed_at IS NOT NULL THEN ${H('completed_at', 'created_at')} END)::float8 AS cycle_h,
          avg(CASE WHEN taken_at IS NOT NULL THEN ${H('taken_at', 'created_at')} END)::float8 AS wait_h,
          avg(CASE WHEN completed_at IS NOT NULL THEN ${H('completed_at', 'taken_at')} END)::float8 AS work_h,
          (count(*) FILTER (WHERE status = 'done' AND revisions = 0))::int AS first_pass, (count(*) FILTER (WHERE status = 'done'))::int AS done
        FROM tasks WHERE creative_type = $1`, [type]),
      db.q(`SELECT i.reason, count(*)::int AS n FROM revision_items i JOIN tasks t ON t.id = i.task_id
        WHERE t.creative_type = $1 GROUP BY i.reason ORDER BY n DESC`, [type]),
      db.one(`SELECT count(*)::int AS n FROM tasks WHERE status = 'new'`),
      db.one(`SELECT value FROM settings WHERE key = 'sla'`),
      scoreCreatives(type, offer),
    ]);
    const total = reasons.reduce((s, r) => s + r.n, 0);
    const free = creatives.filter(c => c.load < 3).length;
    // realistic lead time: wait (scaled by queue vs free people) + typical work
    const eta = (stats.wait_h || 4) * Math.max(1, queue.n / Math.max(1, free)) + (stats.work_h || 24);
    res.json({ type, winners, stats: { ...stats, first_pass_rate: stats.done ? Math.round(stats.first_pass / stats.done * 100) : null },
      reasons: reasons.slice(0, 3).map(r => ({ ...r, pct: Math.round(r.n / total * 100) })), queue: queue.n, eta_h: Math.round(eta),
      sla: sla?.value || {}, best: creatives.slice(0, 3) });
  }));

  // ---------- "My day" ----------
  app.get('/api/home', auth, h(async (req, res) => {
    const u = req.user, now = Date.now();
    const scope = u.role === 'buyer' ? ' WHERE t.buyer_id = $1' : '';
    const tasks = withRisk(await db.q(TASK_SELECT + scope + ' ORDER BY t.deadline', u.role === 'buyer' ? [u.id] : []), await typeStats());
    const soon = (t) => t.status !== 'done' && new Date(t.deadline) - now < 24 * 36e5;
    const out = { role: u.role };
    if (u.role === 'creative') {
      const mine = tasks.filter(t => t.creative_id === u.id);
      const lib = await db.q(`SELECT l.id, l.status, l.roi::float8 AS roi, l.status_at, t.title, t.id AS task_id,
          (SELECT f.id FROM files f WHERE f.version_id = l.version_id AND f.mime LIKE 'image/%' ORDER BY f.id LIMIT 1) AS cover_id
        FROM library l JOIN tasks t ON t.id = l.task_id WHERE t.creative_id = $1 ORDER BY l.status_at DESC NULLS LAST`, [u.id]);
      const c = (s) => lib.filter(l => l.status === s).length;
      const spec = u.specialization.split(',').map(s => s.trim()).filter(Boolean);
      const [week] = await db.q(`SELECT COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))), 0)::float8 / 3600 AS hours
        FROM time_entries WHERE user_id = $1 AND started_at > now() - interval '7 days'`, [u.id]);
      Object.assign(out, {
        queue: mine.filter(t => ['in_progress', 'revision'].includes(t.status)),
        review: mine.filter(t => t.status === 'review'),
        free: tasks.filter(t => t.status === 'new').sort((a, b) => spec.includes(b.creative_type) - spec.includes(a.creative_type)).slice(0, 6),
        results: lib.filter(l => l.status_at && now - new Date(l.status_at) < 21 * 864e5).slice(0, 6),
        stats: { done_week: mine.filter(t => t.completed_at && now - new Date(t.completed_at) < 7 * 864e5).length, wins: c('winner'),
          win_rate: winRate(c('winner'), c('average'), c('burned')), hours_week: week.hours, due_today: mine.filter(soon).length },
      });
    } else {
      const lib = await db.q(`SELECT l.id, l.status, l.created_at, t.title, t.id AS task_id, t.buyer_id, c.name AS creative_name,
          (SELECT f.id FROM files f WHERE f.version_id = l.version_id AND f.mime LIKE 'image/%' ORDER BY f.id LIMIT 1) AS cover_id
        FROM library l JOIN tasks t ON t.id = l.task_id LEFT JOIN users c ON c.id = t.creative_id ORDER BY l.created_at DESC`);
      const needs = lib.filter(l => ['pending', 'testing'].includes(l.status) && now - new Date(l.created_at) > 2 * 864e5 && (u.role === 'lead' || l.buyer_id === u.id));
      Object.assign(out, {
        review: tasks.filter(t => t.status === 'review'),
        at_risk: tasks.filter(t => t.risk).slice(0, 8),
        needs_result: needs.slice(0, 8), needs_result_count: needs.length,
        winners: lib.filter(l => l.status === 'winner').slice(0, 4),
        counts: Object.fromEntries(C.STATUSES.map(s => [s, tasks.filter(t => t.status === s).length])),
      });
      if (u.role === 'lead') {
        const team = await db.q(`SELECT u.id, u.name,
            (SELECT count(*) FROM tasks t WHERE t.creative_id = u.id AND t.status IN ('in_progress','revision'))::int AS active,
            (SELECT count(*) FROM tasks t WHERE t.creative_id = u.id AND t.status = 'review')::int AS review
          FROM users u WHERE u.role = 'creative' AND u.active ORDER BY u.name`);
        const budgets = await budgetRows();
        const alerts = [];
        const overdue = tasks.filter(t => t.risk === 'late').length;
        if (overdue) alerts.push({ level: 'danger', text: `Просрочено задач: ${overdue}`, link: '#/tasks?overdue=1' });
        const high = tasks.filter(t => t.risk === 'high').length;
        if (high) alerts.push({ level: 'warn', text: `Высокий риск срыва срока: ${high}`, link: '#/tasks?risk=1' });
        team.filter(m => m.active >= 4).forEach(m => alerts.push({ level: 'warn', text: `${m.name}: перегруз — ${m.active} задач в работе`, link: `#/tasks?creative_id=${m.id}` }));
        const stale = tasks.filter(t => t.status === 'new' && now - new Date(t.created_at) > 4 * 36e5).length;
        if (stale) alerts.push({ level: 'warn', text: `Ждут исполнителя дольше 4 часов: ${stale}`, link: '#/tasks?status=new' });
        budgets.filter(b => b.budget && b.forecast >= b.budget * 0.9).forEach(b => alerts.push({ level: b.used >= b.budget ? 'danger' : 'warn',
          text: `${b.name}: прогноз ${Math.round(b.forecast)} из ${Math.round(b.budget)} кр. к концу месяца`, link: '#/analytics?tab=money' }));
        if (needs.length) alerts.push({ level: 'info', text: `Креативов без отметки результата: ${needs.length}`, link: '#/library?status=needs_result' });
        Object.assign(out, { team, budgets, alerts });
      }
    }
    res.json(out);
  }));

  // monthly AI budget usage with linear month-end forecast
  async function budgetRows() {
    const rows = await db.q(`SELECT s.id, s.name, s.credit_usd::float8 AS credit_usd, s.monthly_budget::float8 AS budget,
        COALESCE((SELECT sum(credits) FROM ai_costs a WHERE a.service_id = s.id AND a.created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')), 0)::float8 AS used
      FROM ai_services s WHERE s.active ORDER BY s.name`);
    const d = new Date(), day = Math.max(0.5, d.getUTCDate() - 1 + d.getUTCHours() / 24), days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return rows.map(r => ({ ...r, forecast: r.used / Math.max(day, 1) * days, usd: r.used * r.credit_usd }));
  }

  // ---------- analytics ----------
  app.get('/api/analytics', auth, role('lead'), h(async (req, res) => {
    const day = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && v >= '2000' && v < '2100' && !isNaN(Date.parse(v)) ? Date.parse(v) : null;
    if ((req.query.from && day(req.query.from) == null) || (req.query.to && day(req.query.to) == null)) throw fail(400, 'Даты в формате YYYY-MM-DD');
    const from = req.query.from ? new Date(day(req.query.from)) : new Date(0);
    const to = req.query.to ? new Date(day(req.query.to) + 864e5) : new Date(Date.UTC(9999, 0));
    const P = [from, to], IN = 't.created_at >= $1 AND t.created_at < $2';
    const LATE = `(COALESCE(t.completed_at, now()) > t.deadline)`;
    const COST = `(SELECT COALESCE(sum(a.credits * s.credit_usd), 0) FROM ai_costs a JOIN ai_services s ON s.id = a.service_id WHERE a.task_id = t.id)`;
    const WORK = `(SELECT COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at))), 0) / 3600 FROM time_entries e WHERE e.task_id = t.id)`;
    // labor is priced with the rate of whoever logged the time
    const LABOR = `(SELECT COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at)) / 3600 * u.hourly_rate), 0) FROM time_entries e JOIN users u ON u.id = e.user_id WHERE e.task_id = t.id)`;

    const [totals, byStatus, creatives, buyers, services, matrix, byType, byOffer, reasons, created, done, overdue, lineage] = await Promise.all([
      db.one(`SELECT count(*)::int AS total, (count(*) FILTER (WHERE ${LATE}))::int AS overdue,
          avg(CASE WHEN t.completed_at IS NOT NULL THEN ${H('t.completed_at', 't.created_at')} END)::float8 AS avg_lead_h,
          avg(CASE WHEN t.completed_at IS NOT NULL THEN ${H('t.completed_at', 't.taken_at')} END)::float8 AS avg_work_h,
          avg(CASE WHEN t.taken_at IS NOT NULL THEN ${H('t.taken_at', 't.created_at')} END)::float8 AS avg_wait_h,
          COALESCE(sum(t.revisions), 0)::int AS revisions, (count(*) FILTER (WHERE t.status = 'done'))::int AS done,
          (count(*) FILTER (WHERE t.status = 'done' AND t.revisions = 0))::int AS first_pass,
          COALESCE(sum(${COST}), 0)::float8 AS ai_usd, COALESCE(sum(${WORK}), 0)::float8 AS hours,
          COALESCE(sum(${LABOR}), 0)::float8 AS labor_usd,
          COALESCE(sum(${COST} + ${LABOR}) FILTER (WHERE t.status = 'done'), 0)::float8 AS done_cost,
          (SELECT COALESCE(sum(a.credits), 0) FROM ai_costs a JOIN tasks t ON t.id = a.task_id WHERE ${IN})::float8 AS ai_credits
        FROM tasks t LEFT JOIN users c ON c.id = t.creative_id WHERE ${IN}`, P),
      db.q(`SELECT status, count(*)::int AS n FROM tasks t WHERE ${IN} GROUP BY status`, P),
      db.q(`SELECT u.id, u.name, u.hourly_rate::float8 AS rate,
          (count(t.id) FILTER (WHERE t.status IN ('in_progress','revision')))::int AS active,
          (count(t.id) FILTER (WHERE t.status = 'review'))::int AS on_review, (count(t.id) FILTER (WHERE t.status = 'done'))::int AS done,
          (count(t.id) FILTER (WHERE t.id IS NOT NULL AND ${LATE}))::int AS overdue, COALESCE(sum(t.revisions), 0)::int AS revisions,
          (count(t.id) FILTER (WHERE t.status = 'done' AND t.revisions = 0))::int AS first_pass,
          avg(CASE WHEN t.completed_at IS NOT NULL THEN ${H('t.completed_at', 't.taken_at')} END)::float8 AS avg_work_h,
          COALESCE(sum(${COST}), 0)::float8 AS ai_usd, COALESCE(sum(${WORK}), 0)::float8 AS hours,
          (count(l.id) FILTER (WHERE l.status = 'winner'))::int AS wins, (count(l.id) FILTER (WHERE l.status = 'average'))::int AS avg_n,
          (count(l.id) FILTER (WHERE l.status = 'burned'))::int AS burned,
          (SELECT COALESCE(sum(a.credits), 0) FROM ai_costs a JOIN tasks x ON x.id = a.task_id WHERE a.user_id = u.id AND x.created_at >= $1 AND x.created_at < $2)::float8 AS ai_credits
        FROM users u LEFT JOIN tasks t ON t.creative_id = u.id AND ${IN} LEFT JOIN library l ON l.task_id = t.id
        WHERE u.role = 'creative' GROUP BY u.id ORDER BY active DESC, u.name`, P),
      db.q(`SELECT u.id, u.name, count(t.id)::int AS total, (count(t.id) FILTER (WHERE t.status = 'done'))::int AS done,
          (count(t.id) FILTER (WHERE t.id IS NOT NULL AND ${LATE}))::int AS overdue,
          (count(l.id) FILTER (WHERE l.status IN ('pending','testing')))::int AS no_result
        FROM users u LEFT JOIN tasks t ON t.buyer_id = u.id AND ${IN} LEFT JOIN library l ON l.task_id = t.id
        WHERE u.role = 'buyer' GROUP BY u.id ORDER BY total DESC`, P),
      db.q(`SELECT s.id, s.name, COALESCE(sum(a.credits), 0)::float8 AS credits, COALESCE(sum(a.credits * s.credit_usd), 0)::float8 AS usd,
          COALESCE(sum(a.credits) FILTER (WHERE a.round > 0), 0)::float8 AS revision_credits, count(DISTINCT a.task_id)::int AS tasks
        FROM ai_services s JOIN ai_costs a ON a.service_id = s.id JOIN tasks t ON t.id = a.task_id WHERE ${IN}
        GROUP BY s.id ORDER BY credits DESC`, P),
      db.q(`SELECT u.name, s.name AS service, sum(a.credits)::float8 AS credits FROM ai_costs a JOIN users u ON u.id = a.user_id
        JOIN ai_services s ON s.id = a.service_id JOIN tasks t ON t.id = a.task_id WHERE ${IN} GROUP BY u.name, s.name`, P),
      db.q(`SELECT t.creative_type, count(*)::int AS n,
          avg(CASE WHEN t.completed_at IS NOT NULL THEN ${H('t.completed_at', 't.created_at')} END)::float8 AS avg_lead_h,
          (count(l.id) FILTER (WHERE l.status = 'winner'))::int AS wins, (count(l.id) FILTER (WHERE l.status IN ('average','burned')))::int AS losses
        FROM tasks t LEFT JOIN library l ON l.task_id = t.id WHERE ${IN} GROUP BY t.creative_type ORDER BY n DESC`, P),
      db.q(`SELECT o.id, o.name, count(*)::int AS n, (count(l.id) FILTER (WHERE l.status = 'winner'))::int AS wins,
          (count(l.id) FILTER (WHERE l.status IN ('average','burned')))::int AS losses, avg(l.roi)::float8 AS roi, COALESCE(sum(l.spend), 0)::float8 AS spend
        FROM tasks t JOIN offers o ON o.id = t.offer_id LEFT JOIN library l ON l.task_id = t.id WHERE ${IN} GROUP BY o.id ORDER BY n DESC`, P),
      db.q(`SELECT i.reason, count(*)::int AS n FROM revision_items i JOIN tasks t ON t.id = i.task_id WHERE ${IN} GROUP BY i.reason ORDER BY n DESC`, P),
      db.q(`SELECT to_char(t.created_at, 'YYYY-MM-DD') AS d, count(*)::int AS n FROM tasks t WHERE ${IN} GROUP BY d`, P),
      db.q(`SELECT to_char(t.completed_at, 'YYYY-MM-DD') AS d, count(*)::int AS n FROM tasks t WHERE t.completed_at IS NOT NULL AND ${IN} GROUP BY d`, P),
      db.q(TASK_SELECT + ` WHERE ${IN} AND ${LATE} ORDER BY t.deadline LIMIT 40`, P),
      db.one(`SELECT (count(*) FILTER (WHERE t.parent_library_id IS NOT NULL AND l.status = 'winner'))::int AS var_wins,
          (count(*) FILTER (WHERE t.parent_library_id IS NOT NULL AND l.status IN ('winner','average','burned')))::int AS var_rated,
          (count(*) FILTER (WHERE t.parent_library_id IS NULL AND l.status = 'winner'))::int AS new_wins,
          (count(*) FILTER (WHERE t.parent_library_id IS NULL AND l.status IN ('winner','average','burned')))::int AS new_rated
        FROM tasks t JOIN library l ON l.task_id = t.id WHERE ${IN}`, P),
    ]);
    const wins = creatives.reduce((s, c) => s + c.wins, 0);
    totals.wins = wins;
    totals.first_pass_rate = totals.done ? Math.round(totals.first_pass / totals.done * 100) : null;
    totals.cost_per_task = totals.done ? totals.done_cost / totals.done : null;      // accepted work only
    totals.cost_per_winner = wins ? totals.done_cost / wins : null;                  // all accepted work needed to find the winners
    creatives.forEach(c => { c.win_rate = winRate(c.wins, c.avg_n, c.burned); c.labor_usd = c.hours * c.rate; c.first_pass_rate = c.done ? Math.round(c.first_pass / c.done * 100) : null; });
    byType.forEach(r => r.win_rate = winRate(r.wins, r.losses, 0));
    byOffer.forEach(r => r.win_rate = winRate(r.wins, r.losses, 0));
    res.json({ totals, byStatus: Object.fromEntries(C.STATUSES.map(s => [s, byStatus.find(x => x.status === s)?.n || 0])),
      creatives, buyers, services, matrix, byType, byOffer, reasons, daily: { created, done }, overdue: withRisk(overdue, {}),
      lineage: { variation: winRate(lineage.var_wins, lineage.var_rated - lineage.var_wins, 0), fresh: winRate(lineage.new_wins, lineage.new_rated - lineage.new_wins, 0), ...lineage },
      budgets: await budgetRows() });
  }));

  // ---------- team ----------
  app.get('/api/team', auth, h(async (req, res) => {
    const users = await db.q(`SELECT u.id, u.login, u.name, u.role, u.specialization, u.active,
        (SELECT count(*) FROM tasks t WHERE (t.creative_id = u.id OR t.buyer_id = u.id) AND t.status IN ('in_progress','revision','review'))::int AS active_n,
        (SELECT count(*) FROM tasks t WHERE (t.creative_id = u.id OR t.buyer_id = u.id) AND t.status = 'done')::int AS done_n,
        (SELECT count(*) FROM tasks t WHERE (t.creative_id = u.id OR t.buyer_id = u.id) AND t.status <> 'done' AND t.deadline < now())::int AS late_n,
        (SELECT count(*) FROM tasks t JOIN library l ON l.task_id = t.id WHERE (t.creative_id = u.id OR t.buyer_id = u.id) AND l.status = 'winner')::int AS wins,
        (SELECT count(*) FROM tasks t JOIN library l ON l.task_id = t.id WHERE (t.creative_id = u.id OR t.buyer_id = u.id) AND l.status IN ('average','burned'))::int AS losses,
        (SELECT COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at))), 0) / 3600 FROM time_entries e WHERE e.user_id = u.id AND e.started_at > now() - interval '7 days')::float8 AS hours_week,
        (SELECT max(h.created_at) FROM history h WHERE h.user_id = u.id) AS last_active
      FROM users u WHERE u.active ORDER BY u.role, u.name`);
    // deadline load for the next 14 days (creatives)
    const load = await db.q(`SELECT creative_id AS id, to_char(deadline, 'YYYY-MM-DD') AS d, count(*)::int AS n FROM tasks
      WHERE creative_id IS NOT NULL AND status <> 'done' AND deadline < now() + interval '14 days' GROUP BY creative_id, d`);
    users.forEach(u => u.win_rate = winRate(u.wins, u.losses, 0));
    res.json({ users, load });
  }));

  app.get('/api/activity', auth, role('lead'), h(async (req, res) => {
    res.json(await db.q(`SELECT h.id, h.task_id, h.user_id, u.name AS user_name, h.action, h.from_status, h.to_status, h.comment, h.created_at, t.title
      FROM history h JOIN users u ON u.id = h.user_id JOIN tasks t ON t.id = h.task_id ORDER BY h.created_at DESC, h.id DESC LIMIT 60`));
  }));

  // ---------- notifications ----------
  app.get('/api/notifications', auth, h(async (req, res) => {
    const items = await db.q(`SELECT n.id, n.type, n.text, n.task_id, n.created_at, n.read_at, n.actor_id, a.name AS actor_name, t.title
      FROM notifications n LEFT JOIN users a ON a.id = n.actor_id LEFT JOIN tasks t ON t.id = n.task_id
      WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 40`, [req.user.id]);
    const { n } = await db.one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    res.json({ items, unread: n });
  }));
  app.post('/api/notifications/read', auth, h(async (req, res) => {
    const id = +req.body?.id;
    if (id) await db.q('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [id, req.user.id]);
    else await db.q('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    res.json({ ok: true });
  }));

  // ---------- global search (Ctrl K) ----------
  app.get('/api/search', auth, h(async (req, res) => {
    const raw = str(req.query.q) ? req.query.q.trim().slice(0, 60) : '';
    if (!raw) return res.json({ tasks: [], library: [], users: [] });
    const q = '%' + raw.toLowerCase() + '%', u = req.user;
    const own = u.role === 'buyer' ? 'AND t.buyer_id = $3' : '';
    const [tasks, library, users] = await Promise.all([
      db.q(`SELECT t.id, t.title, t.status, t.geo, o.name AS offer_name FROM tasks t LEFT JOIN offers o ON o.id = t.offer_id
        WHERE (lower(t.title) LIKE $1 OR lower(o.name) LIKE $1 OR lower(t.geo) LIKE $1 OR ('#' || t.id) = $2) ${own} ORDER BY t.created_at DESC LIMIT 8`,
        u.role === 'buyer' ? [q, raw, u.id] : [q, raw]),
      db.q(`SELECT l.id, l.status, t.title, t.id AS task_id, o.name AS offer_name FROM library l JOIN tasks t ON t.id = l.task_id LEFT JOIN offers o ON o.id = t.offer_id
        WHERE lower(t.title) LIKE $1 OR lower(o.name) LIKE $1 OR lower(l.tags) LIKE $1 ORDER BY l.created_at DESC LIMIT 5`, [q]),
      db.q(`SELECT id, name, role FROM users WHERE active AND (lower(name) LIKE $1 OR lower(login) LIKE $1) LIMIT 5`, [q]),
    ]);
    res.json({ tasks, library, users });
  }));
};
