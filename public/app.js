// Creative Desk — vanilla JS SPA (no build step)
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const safeUrl = (u) => { try { const x = new URL(u, location.origin); return /^https?:$/.test(x.protocol) ? esc(x.href) : '#'; } catch { return '#'; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS = { new: 'Новые', in_progress: 'В работе', review: 'На проверке', revision: 'Правки', done: 'Готово' };
const PRIO = { urgent: 'Срочно', high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const TYPES = { video: 'Видео', static: 'Статика', banner: 'Баннер', gif: 'GIF', playable: 'Playable', ugc: 'UGC', other: 'Другое' };
const ROLES = { buyer: 'Медиабайер', creative: 'Креативщик', lead: 'Руководитель' };
const ACTIONS = {
  created: 'создал(а) задачу', take: 'взял(а) в работу', submit: 'сдал(а) на проверку', revise: 'отправил(а) на правки',
  accept: 'принял(а) работу', release: 'вернул(а) в «Новые»', reopen: 'переоткрыл(а) задачу', edited: 'изменил(а) ТЗ',
  comment: 'оставил(а) комментарий', assign: 'назначил(а) исполнителя', ai_cost: 'добавил(а) AI-расход',
};
const DEFAULT_AI = ['Midjourney', 'Runway', 'Kling', 'ElevenLabs', 'ChatGPT', 'Leonardo', 'HeyGen', 'Suno', 'Sora', 'Stable Diffusion'];

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  logo: svg('<rect x="3" y="3" width="7" height="12" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><rect x="3" y="19" width="7" height="2" rx="1"/>'),
  board: svg('<rect x="3" y="3" width="7" height="18" rx="2"/><rect x="14" y="3" width="7" height="11" rx="2"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  doc: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  file: svg('<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>'),
  tasks: svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  alert: svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  loop: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  bolt: svg('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
  users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
};
const ico = (k) => `<span class="ico">${I[k]}</span>`;

const S = { me: null, users: [], tasks: [], filters: { q: '', prio: '', type: '', mine: false }, aiServices: [] };

// ---------- utils ----------
async function api(method, url, body, form) {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: form || !body ? {} : { 'Content-Type': 'application/json' },
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { S.me = null; render(); }
  if (!r.ok) throw new Error(data.error || 'Ошибка ' + r.status);
  return data;
}
function toast(msg, err) {
  const d = document.createElement('div'); d.textContent = msg; if (err) d.className = 'err';
  $('#toast').append(d); setTimeout(() => d.remove(), 3200);
}
const run = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
const fmtDate = (s) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
function fmtDur(h) {
  if (h == null || isNaN(h)) return '—';
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' мин';
  const d = Math.floor(h / 24), hh = Math.round(h % 24);
  return d ? `${d} д ${hh} ч` : `${Math.round(h)} ч`;
}
const hrs = (a, b) => (a && b) ? (new Date(b) - new Date(a)) / 36e5 : null;
const COLORS = ['#6d5efc', '#0b84d8', '#22a06b', '#d97a06', '#e5484d', '#9b51e0', '#00a3a3', '#c2410c'];
function avatar(name, id) {
  const ini = String(name || '?').split(/[\s(]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<span class="avatar" style="background:${COLORS[(id || 0) % COLORS.length]}">${esc(ini)}</span>`;
}
function isLate(t) { return (t.completed_at ? Date.parse(t.completed_at) : Date.now()) > Date.parse(t.deadline); }
function deadlineCls(t) {
  if (isLate(t)) return 'late';
  if (!t.completed_at && Date.parse(t.deadline) - Date.now() < 12 * 36e5) return 'soon';
  return '';
}
const stTag = (s) => `<span class="tag st" style="background:var(--c-${s})">${STATUS[s]}</span>`;

// ---------- permissions (mirror of server FLOW) ----------
function allowedMoves(t) {
  const r = S.me.role, mine = t.creative_id === S.me.id, owner = t.buyer_id === S.me.id || r === 'lead';
  const m = {};
  if (r === 'lead' && t.status === 'new') m.in_progress = 'assign';
  if (r === 'creative') {
    if (t.status === 'new') m.in_progress = 'take';
    if (mine && t.status === 'in_progress') { m.review = 'submit'; m.new = 'release'; }
    if (mine && t.status === 'revision') m.review = 'submit';
  }
  if ((r === 'buyer' || r === 'lead') && owner) {
    if (t.status === 'review') { m.done = 'accept'; m.revision = 'revise'; }
    if (t.status === 'done') m.revision = 'reopen';
  }
  if (r === 'lead' && t.status === 'in_progress') m.new = 'release';
  return m;
}
async function doAction(t, action) {
  S.reopen = !!$('.drawer');
  S.reopen = !!$('.drawer');
  if (action === 'assign') return assignDialog(t);
  if (action === 'submit') return submitDialog(t);
  if (action === 'revise' || action === 'reopen')
    return promptDialog(action === 'revise' ? 'Отправить на правки' : 'Переоткрыть задачу', 'Что нужно поправить?', async (comment) => {
      await api('POST', `/api/tasks/${t.id}/${action}`, { comment }); toast(action === 'revise' ? 'Отправлено на правки' : 'Задача переоткрыта'); closeModal(); await refresh(t.id);
    }, true);
  if (action === 'release' && !confirm('Вернуть задачу в «Новые»? Исполнитель будет снят.')) return;
  await api('POST', `/api/tasks/${t.id}/${action}`, {});
  toast({ take: 'Задача взята в работу', accept: 'Работа принята ✓', release: 'Задача возвращена' }[action]);
  await refresh(t.id);
}
async function refresh(openId) {
  const route = location.hash.replace('#/', '') || 'board';
  await loadTasks();
  if (route === 'list') renderList(); else if (route === 'analytics') renderAnalytics(); else renderBoard();
  if (openId && S.reopen) openTask(openId);
}

// ---------- app shell ----------
async function boot() {
  try { S.me = await api('GET', '/api/me'); } catch { S.me = null; }
  if (S.me) { S.users = await api('GET', '/api/users'); }
  render();
}
window.addEventListener('hashchange', () => render());

function render() {
  closeModal();
  if (!S.me) return renderLogin();
  const route = location.hash.replace('#/', '') || 'board';
  if (route === 'analytics' && S.me.role !== 'lead') { location.hash = '#/board'; return; }
  const nav = `<nav class="nav" aria-label="Разделы">
        <a href="#/board" aria-label="Доска" ${route === 'board' ? 'aria-current="page"' : ''} class="${route === 'board' ? 'active' : ''}">${I.board}<span>Доска</span></a>
        <a href="#/list" aria-label="Список задач" ${route === 'list' ? 'aria-current="page"' : ''} class="${route === 'list' ? 'active' : ''}">${I.list}<span>Список задач</span></a>
        ${S.me.role === 'lead' ? `<a href="#/analytics" aria-label="Аналитика" ${route === 'analytics' ? 'aria-current="page"' : ''} class="${route === 'analytics' ? 'active' : ''}">${I.chart}<span>Аналитика</span></a>` : ''}
      </nav>`;
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="logo"><i>${I.logo}</i><div>Creative Desk<small>креативный отдел</small></div></div>
      <div class="side-label">Рабочее пространство</div>
      ${nav}
      <div class="side-label">Сводка</div>
      <div class="side-stats" id="side-stats"></div>
      <div class="side-foot">
        <button class="btn ghost sm theme-btn" style="justify-content:flex-start">${I.moon} Сменить тему</button>
        <div class="side-user">${avatar(S.me.name, S.me.id)}<div><b>${esc(S.me.name)}</b><small>${ROLES[S.me.role]}</small></div>
          <button class="btn ghost icon logout-btn" title="Выйти" aria-label="Выйти">${I.out}</button></div>
      </div>
    </aside>
    <div style="min-width:0">
      <header class="mobilebar"><div class="logo"><i>${I.logo}</i>Creative Desk</div>${nav}
        <button class="btn ghost icon theme-btn" aria-label="Тема">${I.moon}</button><button class="btn ghost icon logout-btn" aria-label="Выйти">${I.out}</button></header>
      <main id="view"></main>
    </div></div>`;
  $$('.logout-btn').forEach(b => b.onclick = run(async () => { await api('POST', '/api/logout'); S.me = null; render(); }));
  $$('.theme-btn').forEach(b => b.onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
    try { localStorage.theme = document.documentElement.dataset.theme; } catch {}
  });
  ({ board: renderBoard, list: renderList, analytics: renderAnalytics, team: renderTeam, settings: renderSettings }[route] || renderBoard)(true);
}
try { if (localStorage.theme) document.documentElement.dataset.theme = localStorage.theme; } catch {}

// ---------- login ----------
const DEMO = [
  ['lead', 'Анна', 'Руководитель'], ['buyer1', 'Максим', 'Байер'], ['buyer2', 'Ольга', 'Байер'], ['buyer3', 'Денис', 'Байер'],
  ['creative1', 'Ира', 'Креативщик'], ['creative2', 'Тимур', 'Креативщик'], ['creative3', 'Лена', 'Креативщик'], ['creative4', 'Паша', 'Креативщик'],
];
function renderLogin() {
  $('#app').innerHTML = `
  <div class="login-wrap">
    <section class="login-hero">
      <div class="logo"><i>${I.logo}</i><div>Creative Desk<small>креативный отдел</small></div></div>
      <div class="hero-float" aria-hidden="true">
        <div class="fc"><span class="pill">На проверке</span><b>Вертикальное видео 15с · DE</b>Nutra — Keto Slim<span class="bar"><i style="width:72%"></i></span></div>
        <div class="fc"><span class="pill">✦ 340 кредитов</span><b>Runway · Kling · ElevenLabs</b>AI-расходы по задаче</div>
        <div class="fc"><span class="pill">Готово за 1 д 6 ч</span><b>Баннеры 300×250 · BR</b>принято без правок</div>
      </div>
      <div class="hero-copy">
        <h2>Креативы под контролем —<br><em>от ТЗ до запуска</em></h2>
        <p>Единое пространство для медиабайеров, креативщиков и руководителя: Kanban, учёт времени и AI-расходов, аналитика отдела в реальном времени.</p>
        <div class="hero-feats"><span>Kanban + drag&drop</span><span>Тайм-трекинг этапов</span><span>AI-кредиты по сервисам</span><span>Аналитика и просрочки</span><span>История действий</span></div>
      </div>
    </section>
    <section class="login-side"><div class="login">
      <h1>С возвращением 👋</h1>
      <p>Войдите, чтобы продолжить работу</p>
      <form id="lf">
        <label class="f"><span>Логин</span><input class="input" name="login" autocomplete="username" required placeholder="buyer1"></label>
        <label class="f"><span>Пароль</span><input class="input" type="password" name="password" autocomplete="current-password" required placeholder="••••••••"></label>
        <button class="btn primary">Войти</button>
      </form>
      <div class="demo-users"><h3>Быстрый вход · пароль demo123</h3>
        <div class="demo-list">${DEMO.map(([l, n, r], i) => `<button data-l="${l}">${avatar(n, i + 1)}<span><b>${n}</b><small>${r} · ${l}</small></span></button>`).join('')}</div>
      </div>
    </div></section>
  </div>`;
  const login = run(async (l, p) => {
    S.me = await api('POST', '/api/login', { login: l, password: p });
    S.users = await api('GET', '/api/users');
    location.hash = S.me.role === 'lead' ? '#/analytics' : '#/board'; render();
  });
  $('#lf').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); login(f.get('login'), f.get('password')); };
  $$('.demo-list button').forEach(b => b.onclick = () => login(b.dataset.l, 'demo123'));
}

// ---------- board ----------
async function loadTasks() { S.tasks = await api('GET', '/api/tasks'); sideStats(); }
function sideStats() {
  const el = $('#side-stats'); if (!el) return;
  const T = S.tasks, me = S.me;
  const rows = me.role === 'creative'
    ? [['Свободных задач', T.filter(t => t.status === 'new').length], ['Мои в работе', T.filter(t => t.creative_id === me.id && ['in_progress', 'revision'].includes(t.status)).length],
       ['Мои на проверке', T.filter(t => t.creative_id === me.id && t.status === 'review').length]]
    : [['Активных', T.filter(t => t.status !== 'done').length], ['Ждут проверки', T.filter(t => t.status === 'review').length],
       ['Просрочено', T.filter(t => t.status !== 'done' && isLate(t)).length]];
  el.innerHTML = rows.map(([l, v]) => `<div>${l}<b>${v}</b></div>`).join('');
}
function filtered() {
  const f = S.filters, q = f.q.toLowerCase();
  return S.tasks.filter(t =>
    (!q || [t.title, t.offer, t.geo, '#' + t.id].some(v => v.toLowerCase().includes(q))) &&
    (!f.prio || t.priority === f.prio) && (!f.type || t.creative_type === f.type) &&
    (!f.mine || t.creative_id === S.me.id || t.buyer_id === S.me.id));
}
function filtersBar() {
  const f = S.filters;
  return `<div class="toolbar">
    <label class="search"><span class="sr-only">Поиск</span>${I.search}<input class="input" id="q" placeholder="Поиск: название, оффер, GEO, #id" value="${esc(f.q)}"></label>
    <select class="input" id="fp" style="width:auto" aria-label="Приоритет"><option value="">Любой приоритет</option>${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${f.prio === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select class="input" id="ft" style="width:auto" aria-label="Тип креатива"><option value="">Любой тип</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${S.me.role !== 'lead' ? `<label class="check"><input type="checkbox" id="fm" ${f.mine ? 'checked' : ''}> Только мои</label>` : ''}</div>`;
}
const newBtn = () => S.me.role !== 'creative' ? `<button class="btn primary" id="new">${I.plus} Новое ТЗ</button>` : '';
function pageHead(title, sub) {
  return `<div class="page-head"><div class="titles"><h1>${title}</h1><div class="sub">${sub}</div></div>${newBtn()}</div>`;
}
const ROLE_SUB = { creative: 'Берите свободные задачи и сдавайте результат — перетаскивайте карточки между колонками',
  buyer: 'Ставьте ТЗ, принимайте работу или отправляйте на правки', lead: 'Все задачи отдела в одном месте' };
function bindFilters(rerender) {
  $('#q').oninput = (e) => { S.filters.q = e.target.value; rerender(false); };
  $('#fp').onchange = (e) => { S.filters.prio = e.target.value; rerender(false); };
  $('#ft').onchange = (e) => { S.filters.type = e.target.value; rerender(false); };
  if ($('#fm')) $('#fm').onchange = (e) => { S.filters.mine = e.target.checked; rerender(false); };
  if ($('#new')) $('#new').onclick = () => taskForm();
}
function card(t) {
  const draggable = true;
  return `<div class="card p-${t.priority}" data-id="${t.id}" draggable="${draggable}" tabindex="0" role="button" aria-label="Задача #${t.id}: ${esc(t.title)}">
    <div class="card-top"><span class="tag p-${t.priority}">${PRIO[t.priority]}</span><span class="tag">${TYPES[t.creative_type]} × ${t.quantity}</span>
      <span class="tag">${esc(t.geo)}</span>${t.revisions ? `<span class="tag" title="Кругов правок">↻ ${t.revisions}</span>` : ''}
      ${isLate(t) ? '<span class="tag late">Просрочено</span>' : ''}</div>
    <h4>${esc(t.title)}</h4>
    <div class="meta"><span class="id">#${t.id}</span><span>${esc(t.offer)}</span></div>
    <div class="foot">
      <span class="meta"><span class="deadline ${deadlineCls(t)}">${I.clock} ${fmtDate(t.deadline)}</span>${t.ai_credits ? `<span class="ai" title="AI-кредиты">✦ ${Math.round(t.ai_credits)}</span>` : ''}</span>
      <span class="who">${t.creative_name ? avatar(t.creative_name, t.creative_id) : '<span class="muted">не назначен</span>'}</span>
    </div></div>`;
}
async function renderBoard(load) {
  if (load) await loadTasks();
  const view = $('#view'); if (!view) return;
  if (!$('.board', view)) {
    view.innerHTML = pageHead(S.me.role === 'creative' ? 'Задачи отдела' : S.me.role === 'buyer' ? 'Мои ТЗ' : 'Доска задач', ROLE_SUB[S.me.role]) + filtersBar() + `<div class="board"></div>`;
    bindFilters(renderBoard);
  }
  const list = filtered();
  $('.board').innerHTML = Object.keys(STATUS).map(s => {
    const items = list.filter(t => t.status === s);
    return `<section class="col" data-status="${s}"><div class="col-head"><span class="dot" style="background:var(--c-${s});color:var(--c-${s})"></span>${STATUS[s]}<span class="cnt">${items.length}</span></div>
      <div class="col-line" style="background:var(--c-${s})"></div>
      <div class="col-body">${items.map(card).join('') || `<div class="empty-col">${s === 'new' && S.me.role === 'creative' ? 'Нет свободных задач' : 'Пусто'}</div>`}</div></section>`;
  }).join('');
  $$('.card').forEach(c => {
    c.onclick = () => openTask(+c.dataset.id);
    c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(+c.dataset.id); } };
    c.ondragstart = (e) => {
      const t = S.tasks.find(x => x.id === +c.dataset.id), moves = allowedMoves(t);
      e.dataTransfer.setData('text/plain', t.id); c.classList.add('dragging');
      $$('.col').forEach(col => col.classList.add(moves[col.dataset.status] ? 'drop-ok' : col.dataset.status === t.status ? 'x' : 'drop-no'));
    };
    c.ondragend = () => { c.classList.remove('dragging'); $$('.col').forEach(col => col.classList.remove('drop-ok', 'drop-no', 'x', 'over')); };
  });
  $$('.col').forEach(col => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.toggle('over', col.classList.contains('drop-ok')); };
    col.ondragleave = (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); };
    col.ondrop = run(async (e) => {
      e.preventDefault();
      const t = S.tasks.find(x => x.id === +e.dataTransfer.getData('text/plain'));
      const action = t && allowedMoves(t)[col.dataset.status];
      col.classList.remove('over');
      if (action) await doAction(t, action);
      else if (t && col.dataset.status !== t.status) toast(whyNot(t, col.dataset.status), true);
    });
  });
}

// ---------- list view ----------
async function renderList(load) {
  if (load) await loadTasks();
  const view = $('#view');
  if (!$('.table-wrap', view)) {
    view.innerHTML = pageHead('Список задач', 'Табличный вид со сроками, исполнителями и AI-расходами') + filtersBar() + `<div class="panel table-wrap"></div>`;
    bindFilters(renderList);
  }
  const list = filtered();
  $('.table-wrap').innerHTML = `<table class="t"><thead><tr><th>#</th><th>Задача</th><th>Статус</th><th>Приоритет</th><th>GEO</th><th>Байер</th><th>Исполнитель</th>
    <th>Дедлайн</th><th class="num">В работе</th><th class="num">AI кр.</th></tr></thead><tbody>
    ${list.map(t => `<tr class="click" data-id="${t.id}"><td class="muted">${t.id}</td><td><b>${esc(t.title)}</b><br><small class="muted">${esc(t.offer)} · ${TYPES[t.creative_type]} × ${t.quantity}</small></td>
      <td>${stTag(t.status)}</td><td><span class="tag p-${t.priority}">${PRIO[t.priority]}</span></td><td>${esc(t.geo)}</td><td>${esc(t.buyer_name)}</td><td>${esc(t.creative_name || '—')}</td>
      <td class="deadline ${deadlineCls(t)}">${fmtDate(t.deadline)}</td><td class="num">${fmtDur(hrs(t.taken_at, t.completed_at || (t.taken_at && new Date().toISOString())))}</td>
      <td class="num">${Math.round(t.ai_credits) || '—'}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">Ничего не найдено</td></tr>'}
    </tbody></table>`;
  clickable($('tr.click'));
}

function clickable(els) {
  els.forEach(r => {
    r.tabIndex = 0; r.setAttribute('role', 'button');
    r.onclick = () => openTask(+r.dataset.id);
    r.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(+r.dataset.id); } };
  });
}
// ---------- modal helpers ----------
let lastFocus = null;
function closeModal() {
  if (!$('#modal-root').innerHTML) return;
  $('#modal-root').innerHTML = ''; document.body.style.overflow = '';
  if (lastFocus?.isConnected) lastFocus.focus(); lastFocus = null;
}
function modal(html, cls = 'center') {
  if (!$('#modal-root').innerHTML) lastFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="overlay ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.style.overflow = 'hidden';
  const ov = $('.overlay'); ov.onmousedown = (e) => { if (e.target === ov) closeModal(); };
  const h = $('h2', ov); if (h) { h.id = 'dlg-title'; ov.setAttribute('aria-labelledby', 'dlg-title'); }
  setTimeout(() => ($('input:not([type=hidden]),textarea,select', ov) || $('button', ov))?.focus(), 30);
  ov.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = $('a[href],button:not([disabled]),input,select,textarea,[tabindex="0"]', ov).filter(x => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  });
  return ov;
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !$('.overlay')) return;
  const dirty = $('.dialog input:not([type=checkbox]), .dialog textarea').some(x => x.value && x.value !== x.defaultValue);
  if (!dirty || confirm('Закрыть без сохранения?')) closeModal();
});
function promptDialog(title, label, onOk, required) {
  const ov = modal(`<form class="dialog"><h2>${esc(title)}</h2><label class="f"><span>${esc(label)}</span><textarea class="input" name="c" ${required ? 'required' : ''} autofocus></textarea></label>
    <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">Отправить</button></div></form>`);
  $('[data-x]', ov).onclick = closeModal;
  $('form', ov).onsubmit = run(async (e) => { e.preventDefault(); await onOk(e.target.c.value.trim()); });
}

// ---------- task form ----------
function taskForm(t) {
  const d = t || { priority: 'medium', creative_type: 'video', quantity: 3 };
  const dl = t ? new Date(t.deadline) : new Date(Date.now() + 48 * 36e5);
  const local = new Date(dl - dl.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  const ov = modal(`<form class="dialog" id="tf"><h2>${t ? 'Редактировать ТЗ #' + t.id : 'Новое техническое задание'}</h2>
    <div style="display:grid;gap:14px">
      <label class="f"><span>Название *</span><input class="input" name="title" required maxlength="120" value="${esc(d.title)}" placeholder="Напр.: Вертикальные видео с хуком 15с"></label>
      <div class="grid3">
        <label class="f"><span>Оффер *</span><input class="input" name="offer" required value="${esc(d.offer)}" placeholder="Nutra — Keto Slim"></label>
        <label class="f"><span>GEO *</span><input class="input" name="geo" required value="${esc(d.geo)}" placeholder="DE, AT" maxlength="40"></label>
        <label class="f"><span>Тип креатива *</span><select class="input" name="creative_type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${d.creative_type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="grid3">
        <label class="f"><span>Количество *</span><input class="input" type="number" min="1" max="100" name="quantity" required value="${d.quantity}"></label>
        <label class="f"><span>Приоритет *</span><select class="input" name="priority">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${d.priority === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f"><span>Дедлайн *</span><input class="input" type="datetime-local" name="deadline" required value="${local}"></label>
      </div>
      <label class="f"><span>Описание</span><textarea class="input" name="description" rows="4" placeholder="Аудитория, посыл, тексты, форматы, ограничения…">${esc(d.description)}</textarea></label>
      <label class="f"><span>Референсы (ссылки, по одной в строке)</span><textarea class="input" name="refs" rows="3" placeholder="https://…">${esc(d.refs)}</textarea></label>
    </div>
    <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">${t ? 'Сохранить' : 'Создать задачу'}</button></div></form>`);
  $('[data-x]', ov).onclick = closeModal;
  $('#tf').onsubmit = run(async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    body.deadline = new Date(body.deadline).toISOString();
    const saved = t ? await api('PATCH', `/api/tasks/${t.id}`, body) : await api('POST', '/api/tasks', body);
    toast(t ? 'ТЗ обновлено' : 'Задача создана'); closeModal(); await refresh(); if (t) openTask(saved.id);
  });
}

// ---------- submit result ----------
async function submitDialog(t) {
  if (!S.aiServices.length) S.aiServices = await api('GET', '/api/ai-services').catch(() => []);
  const services = [...new Set([...S.aiServices, ...DEFAULT_AI])];
  const ov = modal(`<form class="dialog" id="sf"><h2>${t.revisions ? `Сдать правки (круг ${t.revisions})` : 'Сдать результат'} — #${t.id}</h2>
    <div style="display:grid;gap:14px">
      <label class="f"><span>Файлы (до 10 шт., 25 МБ каждый)</span><input class="input" type="file" name="files" multiple></label>
      <label class="f"><span>Ссылки на результат (Google Drive, Figma…)</span><textarea class="input" name="links" rows="2" placeholder="https://drive.google.com/…"></textarea></label>
      <label class="f"><span>Комментарий</span><textarea class="input" name="comment" rows="2"></textarea></label>
      <div><div style="display:flex;align-items:center;margin-bottom:8px"><b style="font-size:13px">AI-сервисы и потраченные кредиты</b>
        <button type="button" class="btn sm" id="add-ai" style="margin-left:auto">＋ Сервис</button></div>
        <datalist id="ai-list">${services.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        <div class="ai-rows" id="ai-rows"></div>
        <small class="muted">Учитываются в аналитике ${t.revisions ? 'как расходы на правки' : 'по задаче и исполнителю'}.</small></div>
    </div>
    <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">Отправить на проверку</button></div></form>`);
  const addRow = () => {
    const row = document.createElement('div'); row.className = 'ai-row';
    row.innerHTML = `<input class="input" list="ai-list" placeholder="Сервис (Midjourney…)" data-s><input class="input" type="number" min="0" step="0.1" placeholder="Кредиты" data-c><button type="button" class="btn ghost" aria-label="Удалить строку">✕</button>`;
    $('button', row).onclick = () => row.remove(); $('#ai-rows').append(row);
  };
  addRow(); $('#add-ai').onclick = addRow;
  $('[data-x]', ov).onclick = closeModal;
  $('#sf').onsubmit = run(async (e) => {
    e.preventDefault();
    const fd = new FormData();
    [...e.target.files.files].forEach(f => fd.append('files', f));
    fd.append('links', e.target.links.value); fd.append('comment', e.target.comment.value);
    const costs = $$('.ai-row').map(r => ({ service: $('[data-s]', r).value, credits: +$('[data-c]', r).value })).filter(c => c.service && c.credits > 0);
    fd.append('ai_costs', JSON.stringify(costs));
    const btn = $('button.primary', ov); btn.disabled = true; btn.textContent = 'Загрузка…';
    try { await api('POST', `/api/tasks/${t.id}/submit`, fd, true); } finally { btn.disabled = false; btn.textContent = 'Отправить на проверку'; }
    S.aiServices = []; toast('Отправлено на проверку'); await refresh(t.id);
  });
}

// ---------- task drawer ----------
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
async function openTask(id) {
  const t = await api('GET', `/api/tasks/${id}`).catch(e => toast(e.message, true));
  if (!t) return;
  const moves = allowedMoves(t);
  const btns = [];
  const A = { assign: ['primary', 'Назначить'], take: ['primary', 'Взять в работу'], submit: ['primary', t.revisions ? 'Сдать правки' : 'Сдать результат'], accept: ['ok', 'Принять работу'],
    revise: ['warn', 'На правки'], reopen: ['', 'Переоткрыть'], release: ['ghost', 'Вернуть в «Новые»'] };
  Object.values(moves).forEach(a => btns.push(`<button class="btn ${A[a][0]}" data-act="${a}">${A[a][1]}</button>`));
  if (t.creative_id === S.me.id && ['in_progress', 'revision'].includes(t.status)) btns.push(`<button class="btn" id="add-cost">✦ AI-расход</button>`);
  if (S.me.role === 'lead' || (t.buyer_id === S.me.id && t.status !== 'done')) btns.push(`<button class="btn ghost" id="edit">Редактировать</button>`);
  if (S.me.role === 'lead' || (t.buyer_id === S.me.id && t.status === 'new')) btns.push(`<button class="btn ghost" id="del" style="color:var(--danger)">Удалить</button>`);

  const nowIso = new Date().toISOString();
  const steps = [['Создана', t.created_at], ['Взята', t.taken_at], ['Сдана', t.submitted_at], ['Завершена', t.completed_at]];
  const aiTotal = t.ai_costs.reduce((s, c) => s + c.credits, 0);
  const aiRev = t.ai_costs.filter(c => c.round > 0).reduce((s, c) => s + c.credits, 0);
  const byService = Object.entries(t.ai_costs.reduce((m, c) => (m[c.service] = (m[c.service] || 0) + c.credits, m), {}));

  modal(`<div class="drawer">
    <div class="drawer-head">
      <div class="row1">#${t.id} · ${stTag(t.status)} <span class="tag p-${t.priority}">${PRIO[t.priority]}</span>${isLate(t) ? '<span class="tag late">Просрочено</span>' : ''}
        <button class="btn ghost icon" data-x style="margin-left:auto" aria-label="Закрыть">${I.x}</button></div>
      <h2>${esc(t.title)}</h2>
      ${btns.length ? `<div class="drawer-actions">${btns.join('')}</div>` : ''}
    </div>
    <div class="drawer-body">
      <section class="panel"><h3>${ico("doc")}Техническое задание</h3>
        <div class="kv">
          <div><small>Оффер</small><b>${esc(t.offer)}</b></div><div><small>GEO</small><b>${esc(t.geo)}</b></div>
          <div><small>Тип / кол-во</small><b>${TYPES[t.creative_type]} × ${t.quantity}</b></div>
          <div><small>Байер</small><b>${esc(t.buyer_name)}</b></div><div><small>Исполнитель</small><b>${esc(t.creative_name || '—')}</b></div>
          <div><small>Дедлайн</small><b class="deadline ${deadlineCls(t)}">${fmtDate(t.deadline)}</b></div>
        </div>
        ${t.description ? `<p class="desc" style="margin-top:14px">${linkify(t.description)}</p>` : ''}
        ${t.refs ? `<div style="margin-top:12px"><small class="muted">Референсы</small><div class="desc">${linkify(t.refs)}</div></div>` : ''}
      </section>
      <section class="panel"><h3>${ico("clock")}Учёт времени</h3>
        <div class="timeline">${steps.map(([l, v]) => `<div class="step ${v ? 'on' : ''}"><i></i><b>${l}</b><span>${fmtDate(v)}</span></div>`).join('')}</div>
        <div class="durations">
          <div><small>Ожидание исполнителя</small><b>${fmtDur(hrs(t.created_at, t.taken_at || (t.status === 'new' ? nowIso : null)))}</b></div>
          <div><small>До первой сдачи</small><b>${fmtDur(hrs(t.taken_at, t.first_submitted_at))}</b></div>
          <div><small>В работе</small><b>${fmtDur(hrs(t.taken_at, t.completed_at || (t.taken_at && nowIso)))}</b></div>
          <div><small>Полный цикл${t.completed_at ? '' : ' · идёт'}</small><b>${fmtDur(hrs(t.created_at, t.completed_at || nowIso))}</b></div>
          <div><small>Кругов правок</small><b>${t.revisions}</b></div>
        </div>
      </section>
      <section class="panel"><h3>${ico("file")}Результаты <span class="extra">${t.results.length || ''}</span></h3>
        ${t.results.slice().reverse().map(r => `<div class="result"><div class="result-head"><span><b style="color:var(--text)">${r.round ? 'Правки, круг ' + r.round : 'Первая сдача'}</b> · ${esc(r.user_name)}</span><span>${fmtDate(r.created_at)}</span></div>
          ${r.comment ? `<div>${esc(r.comment)}</div>` : ''}
          <div class="files">${r.files.map(f => /\.(png|jpe?g|gif|webp)$/i.test(f.url) ? `<a href="${safeUrl(f.url)}" target="_blank" title="${esc(f.name)}" style="padding:0;border:0"><img src="${safeUrl(f.url)}" alt="${esc(f.name)}"></a>` : `<a href="${safeUrl(f.url)}" target="_blank">📎 ${esc(f.name)}</a>`).join('')}
          ${(r.links || '').split('\n').filter(Boolean).map(l => `<a href="${safeUrl(l)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(l.replace(/^https?:\/\//, '').slice(0, 48))}</a>`).join('')}</div></div>`).join('') || '<span class="muted">Пока ничего не сдано</span>'}
      </section>
      <section class="panel"><h3>${ico("spark")}AI-расходы <span class="extra">${aiTotal ? `всего ${Math.round(aiTotal)} кр.${aiRev ? `, из них на правки ${Math.round(aiRev)}` : ''}` : ''}</span></h3>
        ${t.ai_costs.length ? `<div class="bars" style="margin-bottom:14px">${byService.sort((a, b) => b[1] - a[1]).map(([s, v]) => `<div class="bar"><span>${esc(s)}</span><div class="track"><div class="fill" style="width:${v / aiTotal * 100}%"></div></div><span class="v">${Math.round(v)}</span></div>`).join('')}</div>
        <table class="t"><thead><tr><th>Сервис</th><th>Этап</th><th>Кто</th><th>Когда</th><th class="num">Кредиты</th></tr></thead><tbody>
        ${t.ai_costs.map(c => `<tr><td>${esc(c.service)}</td><td>${c.round ? 'Правки ' + c.round : 'Основная'}</td><td>${esc(c.user_name)}</td><td>${fmtDate(c.created_at)}</td><td class="num">${c.credits}</td></tr>`).join('')}</tbody></table>`
        : '<span class="muted">Расходов не указано</span>'}
      </section>
      <section class="panel"><h3>${ico("history")}История действий</h3>
        <ul class="history">${t.history.slice().reverse().map(h => `<li>${avatar(h.user_name, h.user_id)}<div><b>${esc(h.user_name)}</b> ${ACTIONS[h.action] || esc(h.action)}
          ${h.to_status && h.from_status ? ` <span class="muted">${STATUS[h.from_status]} → ${STATUS[h.to_status]}</span>` : ''}
          ${h.comment ? `<span class="c">${esc(h.comment)}</span>` : ''}</div><time>${fmtDate(h.created_at)}</time></li>`).join('')}</ul>
        <form id="cf" style="display:flex;gap:8px;margin-top:12px"><input class="input" name="c" placeholder="Комментарий к задаче…" required><button class="btn">Отправить</button></form>
      </section>
    </div></div>`, '');
  $('[data-x]').onclick = closeModal;
  $$('[data-act]').forEach(b => b.onclick = run(() => doAction(t, b.dataset.act)));
  if ($('#edit')) $('#edit').onclick = () => taskForm(t);
  if ($('#del')) $('#del').onclick = run(async () => {
    if (!confirm('Удалить задачу безвозвратно?')) return;
    await api('DELETE', `/api/tasks/${t.id}`); toast('Задача удалена'); closeModal(); await refresh();
  });
  if ($('#add-cost')) $('#add-cost').onclick = () => {
    const svc = prompt('AI-сервис (напр. Midjourney):'); if (!svc) return;
    const cr = prompt('Сколько кредитов потрачено?'); if (!cr) return;
    run(async () => { await api('POST', `/api/tasks/${t.id}/ai-costs`, { service: svc, credits: +cr }); toast('Расход добавлен'); await refresh(t.id); })();
  };
  $('#cf').onsubmit = run(async (e) => { e.preventDefault(); await api('POST', `/api/tasks/${t.id}/comment`, { comment: e.target.c.value }); openTask(t.id); });
}

// ---------- analytics ----------
const AN = { from: '', to: '', preset: '30' };
function presetRange(p) {
  if (p === 'all') return ['', ''];
  const to = new Date(), from = new Date(Date.now() - (+p - 1) * 864e5);
  const f = (d) => d.toISOString().slice(0, 10);
  return [f(from), f(to)];
}
async function renderAnalytics() {
  const view = $('#view');
  if (!S.tasks.length) loadTasks().catch(() => {}); else sideStats();
  if (AN.preset !== 'custom') [AN.from, AN.to] = presetRange(AN.preset);
  const [a, act] = await Promise.all([api('GET', `/api/analytics?from=${AN.from}&to=${AN.to}`), api('GET', '/api/activity')]);
  const T = a.totals, total = T.total || 0;
  const maxCred = Math.max(1, ...a.aiByService.map(s => s.credits));
  const maxLoad = Math.max(4, ...a.creatives.map(c => c.active + c.on_review));
  const services = [...new Set(a.aiMatrix.map(m => m.service))];
  const people = [...new Set(a.aiMatrix.map(m => m.name))];
  const cell = (n, s) => a.aiMatrix.find(m => m.name === n && m.service === s)?.credits || 0;
  const maxCell = Math.max(1, ...a.aiMatrix.map(m => m.credits));

  view.innerHTML = `
    <div class="page-head"><div class="titles"><h1>Аналитика отдела</h1><div class="sub">Загрузка, сроки и AI-расходы креативной команды</div></div>
      <div class="seg" id="presets">${[['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней'], ['all', 'Всё время']].map(([k, l]) => `<button data-p="${k}" class="${AN.preset === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input type="date" class="input" id="from" value="${AN.from}" style="width:auto"> — <input type="date" class="input" id="to" value="${AN.to}" style="width:auto">
    </div>
    <div class="kpis">
      <div class="kpi" style="--kc:#6c4dff"><div class="ki">${I.tasks}</div><small>Задач за период</small><b>${total}</b><span>${a.byStatus.done} готово · ${total - a.byStatus.done} в процессе</span></div>
      <div class="kpi" style="--kc:#1d8cf0"><div class="ki">${I.loop}</div><small>Среднее время цикла</small><b>${fmtDur(T.avg_lead_h)}</b><span>от создания до приёмки</span></div>
      <div class="kpi" style="--kc:#00b3c7"><div class="ki">${I.clock}</div><small>Среднее время в работе</small><b>${fmtDur(T.avg_work_h)}</b><span>ожидание исполнителя ${fmtDur(T.avg_wait_h)}</span></div>
      <div class="kpi ${T.overdue ? 'bad' : ''}" style="--kc:#ef4459"><div class="ki">${I.alert}</div><small>Просрочки</small><b>${T.overdue || 0}</b><span>${total ? Math.round((T.overdue || 0) / total * 100) : 0}% задач</span></div>
      <div class="kpi" style="--kc:#f08c1c"><div class="ki">${I.loop}</div><small>Кругов правок</small><b>${T.revisions || 0}</b><span>${total ? ((T.revisions || 0) / total).toFixed(2) : 0} на задачу</span></div>
      <div class="kpi" style="--kc:#c04dff"><div class="ki">${I.spark}</div><small>AI-кредиты</small><b>${Math.round(T.ai_credits).toLocaleString('ru-RU')}</b><span>${a.byStatus.done ? Math.round(T.ai_credits / a.byStatus.done) : 0} на готовую задачу · ≈ ${Math.round(T.ai_credits * price()).toLocaleString('ru-RU')}</span></div>
    </div>
    <div class="an-grid">
      <section class="panel wide"><h3>${ico("tasks")}Задачи по статусам</h3>
        <div class="stack">${Object.entries(a.byStatus).map(([s, n]) => n ? `<div style="flex:${n};background:var(--c-${s})" title="${STATUS[s]}: ${n}"></div>` : '').join('')}</div>
        <div class="legend">${Object.entries(a.byStatus).map(([s, n]) => `<span><i style="background:var(--c-${s})"></i>${STATUS[s]}: <b style="color:var(--text)">${n}</b></span>`).join('')}</div>
      </section>
      ${dailyChart(a.daily)}
      <section class="panel wide table-wrap"><h3>${ico("users")}Загрузка креативщиков</h3>
        <table class="t"><thead><tr><th>Исполнитель</th><th>Текущая загрузка</th><th class="num">В работе</th><th class="num">На проверке</th><th class="num">Готово</th>
          <th class="num">Ср. время в работе</th><th class="num">Правок</th><th class="num">Просрочек</th><th class="num">AI-кредиты</th></tr></thead><tbody>
        ${a.creatives.map(c => { const l = c.active + c.on_review; return `<tr><td><span class="who-cell">${avatar(c.name, c.id)}${esc(c.name)}</span></td>
          <td><span class="load">${Array.from({ length: maxLoad }, (_, i) => `<i class="${i < l ? (l >= 4 ? 'hot' : 'on') : ''}"></i>`).join('')}</span></td>
          <td class="num">${c.active || 0}</td><td class="num">${c.on_review || 0}</td><td class="num">${c.done || 0}</td><td class="num">${fmtDur(c.avg_work_h)}</td>
          <td class="num">${c.revisions || 0}</td><td class="num" style="${c.overdue ? 'color:var(--danger);font-weight:600' : ''}">${c.overdue || 0}</td><td class="num">${Math.round(c.ai_credits)}</td></tr>`; }).join('')}
        </tbody></table></section>
      <section class="panel"><h3>${ico("spark")}AI-кредиты по сервисам</h3>
        <div class="bars">${a.aiByService.map(s => `<div class="bar"><span>${esc(s.service)}</span><div class="track"><div class="fill" style="width:${(s.credits - s.revision_credits) / maxCred * 100}%"></div><div class="fill" style="width:${s.revision_credits / maxCred * 100}%;background:var(--warn)"></div></div><span class="v">${Math.round(s.credits)}</span></div>`).join('') || '<span class="muted">Нет данных</span>'}</div>
        <div class="legend" style="margin-top:12px"><span><i style="background:var(--accent)"></i>Основная работа</span><span><i style="background:var(--warn)"></i>Правки</span></div>
      </section>
      <section class="panel"><h3>${ico("board")}Типы креативов</h3>
        <table class="t"><thead><tr><th>Тип</th><th class="num">Задач</th><th class="num">Ср. цикл</th></tr></thead><tbody>
        ${a.byType.map(r => `<tr><td>${TYPES[r.creative_type] || r.creative_type}</td><td class="num">${r.n}</td><td class="num">${fmtDur(r.avg_lead_h)}</td></tr>`).join('')}</tbody></table>
      </section>
      <section class="panel wide table-wrap"><h3>${ico("bolt")}AI-кредиты: исполнитель × сервис</h3>
        ${people.length ? `<table class="t heat"><thead><tr><th>Исполнитель</th>${services.map(s => `<th class="num">${esc(s)}</th>`).join('')}<th class="num">Итого</th></tr></thead><tbody>
        ${people.map(p => `<tr><td>${esc(p)}</td>${services.map(s => { const v = cell(p, s); return `<td class="num" style="background:color-mix(in srgb, var(--accent) ${Math.round(v / maxCell * 45)}%, transparent)">${v ? Math.round(v) : '·'}</td>`; }).join('')}
          <td class="num"><b>${Math.round(services.reduce((x, s) => x + cell(p, s), 0))}</b></td></tr>`).join('')}</tbody></table>` : '<span class="muted">Нет данных</span>'}
      </section>
      <section class="panel"><h3>${ico("users")}Байеры</h3>
        <table class="t"><thead><tr><th>Байер</th><th class="num">ТЗ</th><th class="num">Готово</th><th class="num">Просрочено</th></tr></thead><tbody>
        ${a.buyers.map(b => `<tr><td>${esc(b.name)}</td><td class="num">${b.total}</td><td class="num">${b.done || 0}</td><td class="num">${b.overdue || 0}</td></tr>`).join('')}</tbody></table>
      </section>
      <section class="panel"><h3>${ico("alert")}Просроченные задачи <span class="extra">${a.overdueList.length}</span></h3>
        <div style="max-height:320px;overflow:auto"><table class="t"><tbody>
        ${a.overdueList.map(t => { const late = hrs(t.deadline, t.completed_at || new Date().toISOString()); return `<tr class="click" data-id="${t.id}"><td><b>#${t.id}</b> ${esc(t.title)}<br><small class="muted">${esc(t.creative_name || 'не назначен')} · ${STATUS[t.status]}</small></td>
          <td class="num" style="color:var(--danger);white-space:nowrap">+${fmtDur(late)}</td></tr>`; }).join('') || '<tr><td class="muted">Просрочек нет 🎉</td></tr>'}</tbody></table></div>
      </section>
      <section class="panel wide"><h3>${ico("history")}Лента действий</h3>
        <ul class="history" style="max-height:360px;overflow:auto">${act.map(h => `<li class="click" data-id="${h.task_id}" style="cursor:pointer">${avatar(h.user_name, h.user_id)}<div><b>${esc(h.user_name)}</b> ${ACTIONS[h.action] || h.action} <span class="muted">«${esc(h.title)}» #${h.task_id}</span>
          ${h.comment ? `<span class="c">${esc(h.comment)}</span>` : ''}</div><time>${fmtDate(h.created_at)}</time></li>`).join('')}</ul>
      </section>
    </div>`;
  $$('#presets button').forEach(b => b.onclick = () => { AN.preset = b.dataset.p; renderAnalytics(); });
  $('#from').onchange = $('#to').onchange = () => { AN.preset = 'custom'; AN.from = $('#from').value; AN.to = $('#to').value; renderAnalytics(); };
  clickable($('[data-id]', view));
}

document.addEventListener('DOMContentLoaded', boot);
