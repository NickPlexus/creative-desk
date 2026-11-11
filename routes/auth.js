// Auth, profile, preferences and dictionaries bootstrap
const crypto = require('crypto');

module.exports = (app, { db, h, fail, str, auth }) => {
  const attempts = new Map();
  const PREF_KEYS = ['theme', 'accent', 'density', 'notify', 'boardView', 'savedFilters'];

  const DUMMY_SALT = crypto.randomBytes(8).toString('hex');
  setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (now - v.t > 10 * 6e4) attempts.delete(k); }, 6e4).unref();
  app.post('/api/login', h(async (req, res) => {
    const { login, password } = req.body || {};
    if (!str(login) || !str(password) || login.length > 64 || password.length > 200) throw fail(400, 'Введите логин и пароль');
    const key = req.ip + '|' + login.trim().toLowerCase(), a = attempts.get(key) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 10 * 6e4) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 10) throw fail(429, 'Слишком много неудачных попыток, подождите 10 минут');
    const u = await db.one('SELECT * FROM users WHERE login = $1', [login.trim().toLowerCase()]);
    const hashed = await db.hashAsync(password, u ? u.salt : DUMMY_SALT); // always hash: no user enumeration by timing
    const ok = u && crypto.timingSafeEqual(Buffer.from(u.password_hash, 'hex'), Buffer.from(hashed, 'hex'));
    if (!ok) { a.n++; attempts.set(key, a); throw fail(401, 'Неверный логин или пароль'); }
    attempts.delete(key);
    if (!u.active) throw fail(403, 'Учётная запись отключена');
    const token = crypto.randomBytes(24).toString('hex');
    await db.q('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, u.id]);
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: req.secure || req.headers['x-forwarded-proto'] === 'https', maxAge: 30 * 864e5 });
    res.json({ ok: true });
  }));

  app.post('/api/logout', h(async (req, res) => {
    if (req.cookies.sid) await db.q('DELETE FROM sessions WHERE token = $1', [req.cookies.sid]);
    res.clearCookie('sid').json({ ok: true });
  }));

  // Everything the client needs once after login: profile + dictionaries
  app.get('/api/bootstrap', auth, h(async (req, res) => {
    const [users, offers, geos, services, templates, settings] = await Promise.all([
      db.q(`SELECT id, login, name, role, specialization, active FROM users ORDER BY role, name`),
      db.q('SELECT id, name, vertical, active FROM offers ORDER BY name'),
      db.q('SELECT code, name FROM geos ORDER BY code'),
      db.q('SELECT id, name, credit_usd::float8 AS credit_usd, monthly_budget::float8 AS monthly_budget, active FROM ai_services ORDER BY name'),
      db.q('SELECT id, name, creative_type, description, checklist, quantity, priority, active FROM templates ORDER BY name'),
      db.q('SELECT key, value FROM settings'),
    ]);
    res.json({ me: req.user, users, offers, geos, services, templates, settings: Object.fromEntries(settings.map(s => [s.key, s.value])) });
  }));

  app.patch('/api/me/prefs', auth, h(async (req, res) => {
    const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => PREF_KEYS.includes(k)));
    if (JSON.stringify(patch).length > 8000) throw fail(400, 'Слишком большие настройки');
    const r = await db.one(`UPDATE users SET prefs = prefs || $1::jsonb WHERE id = $2 RETURNING prefs`, [JSON.stringify(patch), req.user.id]);
    res.json(r.prefs);
  }));

  app.patch('/api/me', auth, h(async (req, res) => {
    const { name } = req.body || {};
    if (!str(name) || name.trim().length < 2 || name.length > 60) throw fail(400, 'Имя: от 2 до 60 символов');
    await db.q('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), req.user.id]);
    res.json({ ok: true });
  }));

  app.post('/api/me/password', auth, h(async (req, res) => {
    const { current, next } = req.body || {};
    if (!str(current) || !str(next) || next.length < 6) throw fail(400, 'Новый пароль — минимум 6 символов');
    const u = await db.one('SELECT password_hash, salt FROM users WHERE id = $1', [req.user.id]);
    if (next.length > 200) throw fail(400, 'Слишком длинный пароль');
    if (await db.hashAsync(current, u.salt) !== u.password_hash) throw fail(400, 'Текущий пароль указан неверно');
    const salt = crypto.randomBytes(8).toString('hex');
    await db.q('UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3', [db.hash(next, salt), salt, req.user.id]);
    await db.q('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [req.user.id, req.cookies.sid]);
    res.json({ ok: true });
  }));
};
