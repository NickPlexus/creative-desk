// Creative Desk — core: state, API, router, shell, shared UI helpers
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => { try { const x = new URL(u, location.origin); return /^https?:$/.test(x.protocol) ? esc(x.href) : '#'; } catch { return '#'; } };

// ---------- dictionaries ----------
const STATUS = { new: 'Новые', in_progress: 'В работе', review: 'На проверке', revision: 'Правки', done: 'Готово' };
const PRIO = { urgent: 'Срочно', high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const TYPES = { video: 'Видео', static: 'Статика', banner: 'Баннер', gif: 'GIF', playable: 'Playable', ugc: 'UGC', other: 'Другое' };
const ROLES = { buyer: 'Медиабайер', creative: 'Креативщик', lead: 'Руководитель' };
const REASONS = { hook: 'Хук / первые секунды', text: 'Текст / CTA', localization: 'Локализация', visual: 'Визуал', platform: 'Требования площадки', tech: 'Технические', other: 'Другое' };
const LIB = { pending: 'Не запущен', testing: 'В тесте', winner: 'Победитель', average: 'Средний', burned: 'Выгорел' };
const LIB_ICON = { pending: '○', testing: '◔', winner: '🏆', average: '◑', burned: '✕' };
const ACTIONS = { created: 'создал(а) задачу', take: 'взял(а) в работу', assign: 'назначил(а) исполнителя', submit: 'сдал(а) версию', revise: 'отправил(а) на правки',
  accept: 'принял(а) работу', release: 'вернул(а) в очередь', reopen: 'переоткрыл(а) задачу', edited: 'изменил(а) ТЗ', ai_cost: 'добавил(а) AI-расход', result: 'отметил(а) результат запуска' };
const NOTIF = { created: 'новое ТЗ', take: 'взял(а) вашу задачу', assign: 'назначил(а) исполнителя', submit: 'сдал(а) работу на проверку', revise: 'вернул(а) на правки',
  accept: 'принял(а) работу', release: 'вернул(а) задачу в очередь', edited: 'изменил(а) ТЗ', comment: 'прокомментировал(а)', mention: 'упомянул(а) вас', result: 'отметил(а) результат', budget: 'Бюджет AI' };

const S = { me: null, users: [], offers: [], geos: [], services: [], templates: [], settings: {}, tasks: [], notif: { items: [], unread: 0 }, timer: null };
const Pages = {};

// ---------- formatting ----------
const fmtDate = (s) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDay = (s) => s ? new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';
function fmtDur(h) {
  if (h == null || isNaN(h)) return '—';
  if (Math.abs(h) < 1) return Math.max(1, Math.round(Math.abs(h) * 60)) + ' мин';
  const d = Math.floor(Math.abs(h) / 24), hh = Math.round(Math.abs(h) % 24);
  return (h < 0 ? '−' : '') + (d ? `${d} д ${hh} ч` : `${Math.round(Math.abs(h))} ч`);
}
const hrs = (a, b) => (a && b) ? (new Date(b) - new Date(a)) / 36e5 : null;
const usd = (v) => v == null || isNaN(v) ? '—' : '$' + (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('ru-RU') : (+v).toFixed(2));
const num = (v) => v == null ? '—' : Math.round(v).toLocaleString('ru-RU');
const pct = (v) => v == null ? '—' : v + '%';
function ago(s) {
  const m = (Date.now() - new Date(s)) / 6e4;
  if (m < 1) return 'только что'; if (m < 60) return Math.round(m) + ' мин назад';
  if (m < 1440) return Math.round(m / 60) + ' ч назад'; if (m < 2880) return 'вчера'; return fmtDay(s);
}
function clock(sec) { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }
const offerName = (id) => S.offers.find(o => o.id === id)?.name || '—';
const userName = (id) => S.users.find(u => u.id === id)?.name || '—';

// ---------- icons (inline SVG, no icon font = fast on old machines) ----------
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  logo: svg('<rect x="3" y="3" width="7" height="12" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><rect x="3" y="19" width="7" height="2" rx="1"/>'),
  home: svg('<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>'),
  board: svg('<rect x="3" y="3" width="7" height="18" rx="2"/><rect x="14" y="3" width="7" height="11" rx="2"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  cal: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  lib: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
  users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
  cog: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  spark: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'),
  doc: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  file: svg('<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  alert: svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  loop: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  play: svg('<path d="M6 4l14 8-14 8z"/>'), pause: svg('<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  msg: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  money: svg('<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  filter: svg('<path d="M3 4h18l-7 9v6l-4 2v-8z"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  menu: svg('<path d="M3 6h18M3 12h18M3 18h18"/>'),
};
const ico = (k, cls = '') => `<span class="ico ${cls}">${I[k]}</span>`;

// ---------- small components ----------
const COLORS = ['#6c4dff', '#0b84d8', '#16a374', '#d97706', '#e5484d', '#9b51e0', '#0891b2', '#c2410c'];
function avatar(name, id, size = '') {
  const ini = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<span class="avatar ${size}" style="--av:${COLORS[(id || 0) % COLORS.length]}" title="${esc(name)}">${esc(ini)}</span>`;
}
const stTag = (s) => `<span class="tag st st-${s}">${STATUS[s]}</span>`;
const prioTag = (p) => `<span class="tag p-${p}">${PRIO[p]}</span>`;
const libTag = (s) => `<span class="tag lib-${s}">${LIB_ICON[s]} ${LIB[s]}</span>`;
const riskTag = (t) => t.risk === 'late' ? '<span class="tag risk-late">Просрочено</span>'
  : t.risk === 'high' ? `<span class="tag risk-high" title="Обычно такая работа занимает ~${fmtDur(t.eta_h)}">Риск срыва</span>`
  : t.risk === 'medium' ? '<span class="tag risk-med" title="Запас времени меньше обычного">Впритык</span>' : '';
const fileUrl = (id, dl) => `/api/files/${id}${dl ? '?dl=1' : ''}`;
const cover = (id, cls = '') => id ? `<img class="${cls}" src="${fileUrl(id)}" alt="" loading="lazy" decoding="async">` : `<div class="${cls} nocover">${I.doc}</div>`;
const empty = (text, icon = 'spark') => `<div class="empty">${ico(icon)}<span>${text}</span></div>`;

// ---------- API ----------
async function api(method, url, body, form) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: form || !body ? {} : { 'Content-Type': 'application/json' },
    body: form ? body : body ? JSON.stringify(body) : undefined });
  const data = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (r.status === 401 && !url.endsWith('/login')) { S.me = null; renderLogin(); throw new Error('Сессия истекла — войдите снова'); }
  if (!r.ok) throw new Error(data.error || 'Ошибка ' + r.status);
  return data;
}
function toast(msg, kind) {
  const d = document.createElement('div'); d.className = 'toast ' + (kind || ''); d.textContent = msg;
  $('#toast').append(d); setTimeout(() => d.remove(), kind === 'err' ? 4500 : 2800);
}
const run = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, 'err'); } };

// ---------- performance / preferences ----------
// "lowfx": old PCs and reduced-motion users get no blur, no shadows animation — same layout, cheaper paint.
(function perf() {
  const weak = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const pref = localStorage.getItem('cd_fx');
  if (pref === 'low' || (pref !== 'high' && (weak || matchMedia('(prefers-reduced-motion: reduce)').matches))) document.documentElement.classList.add('lowfx');
})();
const ACCENTS = { violet: null, blue: ['#1d7af0', '#06b6d4'], emerald: ['#0e9f6e', '#22c55e'], rose: ['#e11d73', '#fb7185'], amber: ['#d97706', '#f59e0b'] };
function applyPrefs() {
  const p = S.me?.prefs || {}, root = document.documentElement;
  if (p.theme && p.theme !== 'system') root.dataset.theme = p.theme; else delete root.dataset.theme;
  const a = ACCENTS[p.accent || 'violet'];
  if (a) { root.style.setProperty('--accent', a[0]); root.style.setProperty('--accent-2', a[1]); } else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent-2'); }
  root.classList.toggle('compact', p.density === 'compact');
  try { localStorage.setItem('cd_theme', p.theme || 'system'); } catch {}
}
async function savePrefs(patch) { S.me.prefs = await api('PATCH', '/api/me/prefs', patch); applyPrefs(); }
try { const t = localStorage.getItem('cd_theme'); if (t && t !== 'system') document.documentElement.dataset.theme = t; } catch {}

// ---------- router ----------
function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/');
  return { page: parts[0] || 'home', id: parts[1], params: new URLSearchParams(qs || '') };
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
window.addEventListener('hashchange', () => render());

const NAV = [
  ['home', 'Мой день', 'home'], ['tasks', 'Задачи', 'board'], ['library', 'Библиотека', 'lib'],
  ['analytics', 'Аналитика', 'chart', ['lead']], ['team', 'Команда', 'users'], ['admin', 'Управление', 'shield', ['lead']], ['settings', 'Настройки', 'cog'],
];

async function boot() {
  try { await loadBootstrap(); } catch { S.me = null; }
  render();
}
async function loadBootstrap() {
  const b = await api('GET', '/api/bootstrap');
  Object.assign(S, { me: b.me, users: b.users, offers: b.offers, geos: b.geos, services: b.services, templates: b.templates, settings: b.settings });
  applyPrefs();
}

let currentPage = null;
async function render() {
  closeModal(true);
  if (!S.me) return renderLogin();
  const r = parseHash();
  if (r.page === 'task' && r.id) { location.replace('#/tasks'); setTimeout(() => openTask(+r.id), 50); return; }
  const item = NAV.find(n => n[0] === r.page);
  if (!item || (item[3] && !item[3].includes(S.me.role)) || !Pages[r.page]) return go('#/home');
  if (!$('.shell')) renderShell();
  $$('.nav a').forEach(a => { const on = a.dataset.page === r.page; a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $('#page-title').textContent = item[1];
  document.title = item[1] + ' · Creative Desk';
  currentPage = r.page;
  const view = $('#view');
  view.setAttribute('aria-busy', 'true');
  const fk = document.activeElement && view.contains(document.activeElement) ? (document.activeElement.id ? '#' + document.activeElement.id : document.activeElement.dataset.f ? `[data-f="${document.activeElement.dataset.f}"]` : null) : null;
  try { await Pages[r.page](view, r.params); if (fk) { const el = $(fk, view); if (el) { el.focus({ preventScroll: true }); if (el.setSelectionRange && el.type !== 'date') el.setSelectionRange(el.value.length, el.value.length); } } } catch (e) { view.innerHTML = empty('Не удалось загрузить: ' + esc(e.message), 'alert'); }
  view.removeAttribute('aria-busy');
  $('.sidebar')?.classList.remove('open');
}
// re-render the current page without losing scroll (after actions)
async function refresh() { if (!currentPage) return; const y = scrollY; const r = parseHash(); await Pages[r.page]?.($('#view'), r.params); scrollTo(0, y); loadNotifs(); loadTimer(); }

// ---------- shell ----------
function renderShell() {
  const ws = S.settings.workspace?.name || 'Креативный отдел';
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar" aria-label="Навигация">
      <div class="logo"><i>${I.logo}</i><div>Creative Desk<small>${esc(ws)}</small></div></div>
      ${S.me.role !== 'creative' ? `<button class="btn primary block" id="side-new">${I.plus} Новое ТЗ</button>` : ''}
      <nav class="nav">${NAV.filter(n => !n[3] || n[3].includes(S.me.role)).map(([p, l, i]) =>
        `<a href="#/${p}" data-page="${p}">${I[i]}<span>${l}</span><b class="badge" data-badge="${p}" hidden></b></a>`).join('')}</nav>
      <div class="side-foot">
        <div class="side-user">${avatar(S.me.name, S.me.id)}<div><b>${esc(S.me.name)}</b><small>${ROLES[S.me.role]}</small></div>
          <button class="btn ghost icon" id="logout" title="Выйти" aria-label="Выйти">${I.out}</button></div>
      </div>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <button class="btn ghost icon only-sm" id="menu" aria-label="Меню">${I.menu}</button>
        <h1 id="page-title"></h1>
        <button class="search-btn" id="pal-open" type="button">${I.search}<span>Поиск задач, креативов, людей…</span><kbd>Ctrl K</kbd></button>
        <div class="spacer"></div>
        <div id="timer-chip"></div>
        <button class="btn ghost icon" id="theme" title="Сменить тему" aria-label="Сменить тему">${I.moon}</button>
        <div class="bellwrap"><button class="btn ghost icon" id="bell" aria-label="Уведомления" aria-expanded="false">${I.bell}<i class="bdot" id="bdot" hidden></i></button>
          <div class="bellpanel" id="bellpanel" hidden></div></div>
      </header>
      <main id="view" tabindex="-1"></main>
    </div></div>`;
  $('#logout').onclick = run(async () => { await api('POST', '/api/logout'); S.me = null; location.hash = ''; renderLogin(); });
  $('#side-new') && ($('#side-new').onclick = () => taskForm());
  $('#pal-open').onclick = openPalette;
  $('#menu').onclick = () => $('.sidebar').classList.toggle('open');
  $('#theme').onclick = run(async () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    await savePrefs({ theme: dark ? 'light' : 'dark' });
  });
  $('#bell').onclick = (e) => { e.stopPropagation(); toggleBell(); };
  loadNotifs(); loadTimer(); loadBadges();
}
document.addEventListener('click', (e) => {
  const p = $('#bellpanel'); if (p && !p.hidden && !p.contains(e.target) && !e.target.closest('#bell')) closeBell();
  const sb = $('.sidebar.open'); if (sb && !sb.contains(e.target) && !e.target.closest('#menu')) sb.classList.remove('open');
});

// sidebar counters: what needs MY action
async function loadBadges() {
  try {
    const tasks = await api('GET', '/api/tasks');
    S.tasks = tasks;
    const me = S.me, n = {};
    if (me.role === 'creative') n.tasks = tasks.filter(t => t.creative_id === me.id && ['in_progress', 'revision'].includes(t.status)).length;
    else n.tasks = tasks.filter(t => t.status === 'review' && (me.role === 'lead' || t.buyer_id === me.id)).length;
    if (me.role !== 'creative') { const lib = await api('GET', '/api/library?status=needs_result' + (me.role === 'buyer' ? '&buyer_id=' + me.id : '')); n.library = lib.length; }
    for (const [k, v] of Object.entries(n)) { const b = $(`[data-badge="${k}"]`); if (b) { b.hidden = !v; b.textContent = v; } }
  } catch {}
}

// ---------- notifications ----------
async function loadNotifs() {
  try { S.notif = await api('GET', '/api/notifications'); } catch { return; }
  const d = $('#bdot'); if (d) { d.hidden = !S.notif.unread; d.textContent = S.notif.unread > 9 ? '9+' : S.notif.unread; }
}
setInterval(() => { if (S.me && !document.hidden) loadNotifs(); }, 60000);
function closeBell() { const p = $('#bellpanel'); if (p) p.hidden = true; $('#bell')?.setAttribute('aria-expanded', 'false'); }
function notifText(n) {
  if (n.type === 'budget') return `<b>⚠ ${esc(n.text)}</b>`;
  if (n.type === 'result') return `<b>${esc(n.actor_name || '')}</b> отметил(а) результат: ${LIB_ICON[n.text] || ''} <b>${LIB[n.text] || esc(n.text)}</b> — «${esc(n.title)}»`;
  return `<b>${esc(n.actor_name || 'Система')}</b> ${NOTIF[n.type] || esc(n.type)}${n.title ? ` — «${esc(n.title)}»` : ''}${n.text && ['comment', 'mention'].includes(n.type) ? `<small class="q">${esc(n.text)}</small>` : ''}`;
}
function toggleBell() {
  const p = $('#bellpanel'); if (!p.hidden) return closeBell();
  const items = S.notif.items;
  p.innerHTML = `<div class="bp-head"><b>Уведомления</b>${S.notif.unread ? `<button class="btn ghost sm" id="bp-read">Прочитать все</button>` : ''}</div>
    <div class="bp-list">${items.map(n => `<button class="bp-item ${n.read_at ? '' : 'new'}" data-id="${n.id}" data-task="${n.task_id || ''}">
      ${n.actor_id ? avatar(n.actor_name, n.actor_id, 'sm') : `<span class="avatar sm sys">${I.alert}</span>`}
      <span>${notifText(n)}<small>${ago(n.created_at)}</small></span></button>`).join('') || empty('Новых событий нет', 'bell')}</div>
    <a class="bp-foot" href="#/settings">Настроить, о чём уведомлять</a>`;
  p.hidden = false; $('#bell').setAttribute('aria-expanded', 'true');
  $$('.bp-item', p).forEach(b => b.onclick = run(async () => {
    closeBell(); await api('POST', '/api/notifications/read', { id: +b.dataset.id }); loadNotifs();
    if (b.dataset.task) openTask(+b.dataset.task); else if (S.me.role === 'lead') go('#/analytics?tab=money');
  }));
  $('#bp-read', p) && ($('#bp-read', p).onclick = run(async () => { await api('POST', '/api/notifications/read', {}); await loadNotifs(); closeBell(); }));
}

// ---------- running timer chip (creatives) ----------
let timerTick = null;
async function loadTimer() {
  if (S.me?.role !== 'creative') return;
  try { S.timer = await api('GET', '/api/timer'); } catch { return; }
  const el = $('#timer-chip'); if (!el) return;
  clearInterval(timerTick);
  if (!S.timer) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="timer-chip" id="tc-open" title="Открыть задачу"><i class="rec"></i><span id="tc-time"></span><small>#${S.timer.task_id}</small></button>
    <button class="btn ghost icon" id="tc-stop" title="Остановить таймер" aria-label="Остановить таймер">${I.pause}</button>`;
  const tick = () => { const t = $('#tc-time'); if (t) t.textContent = clock((Date.now() - new Date(S.timer.started_at)) / 1000); };
  tick(); timerTick = setInterval(tick, 1000);
  $('#tc-open').onclick = () => openTask(S.timer.task_id);
  $('#tc-stop').onclick = run(async () => {
    const id = S.timer.task_id;
    await api('POST', `/api/tasks/${id}/timer`, { action: 'stop' }); toast('Таймер остановлен'); await loadTimer();
    if ($('.drawer')?.dataset.task === String(id)) openTask(id, true);
  });
}

// ---------- modal / drawer ----------
let lastFocus = null;
function closeModal(silent) {
  const root = $('#modal-root'); if (!root.innerHTML) return;
  root.innerHTML = ''; document.body.classList.remove('modal-open');
  if (!silent && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); lastFocus = null;
  if (!silent && S.dirty) { S.dirty = false; refresh(); loadBadges(); } // something changed inside the drawer
}
function modal(html, cls = 'center') {
  if (!$('#modal-root').innerHTML) lastFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="overlay ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.classList.add('modal-open');
  const ov = $('.overlay');
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModal(); });
  const h = $('h2', ov); if (h) { h.id = 'dlg-title'; ov.setAttribute('aria-labelledby', 'dlg-title'); }
  setTimeout(() => (cls === 'side' ? $('[data-x]', ov) : ($('[autofocus]', ov) || $('input:not([type=hidden]):not([type=file]),textarea,select', ov) || $('button', ov)))?.focus({ preventScroll: true }), 30);
  ov.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = $$('a[href],button:not([disabled]),input,select,textarea,[tabindex="0"]', ov).filter(x => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  });
  $$('[data-x]', ov).forEach(b => b.onclick = () => closeModal());
  return ov;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('.overlay')) {
    const dirty = $$('.dialog input:not([type=checkbox]):not([type=radio]), .dialog textarea').some(x => x.value && x.value !== x.defaultValue);
    if (!dirty || confirm('Закрыть без сохранения?')) closeModal();
    return;
  }
  if (!S.me || $('.overlay')) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) { e.preventDefault(); openPalette(); }
  else if (e.key.toLowerCase() === 'n' && !typing && !e.ctrlKey && !e.metaKey && S.me.role !== 'creative') { e.preventDefault(); taskForm(); }
});
const confirmDialog = (title, text, okLabel = 'Подтвердить', danger) => new Promise((resolve) => {
  const ov = modal(`<div class="dialog sm"><h2>${esc(title)}</h2><p class="muted">${text}</p>
    <div class="actions"><button class="btn" data-no>Отмена</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div></div>`);
  $('[data-no]', ov).onclick = () => { closeModal(); resolve(false); };
  $('[data-yes]', ov).onclick = () => { closeModal(); resolve(true); };
});

// ---------- command palette ----------
function openPalette() {
  const pages = NAV.filter(n => !n[3] || n[3].includes(S.me.role)).map(([p, l, i]) => ({ t: l, s: 'Раздел', i, run: () => go('#/' + p) }));
  const actions = [
    ...(S.me.role !== 'creative' ? [{ t: 'Создать ТЗ', s: 'Действие · N', i: 'plus', run: () => taskForm() }] : []),
    { t: 'Просроченные задачи', s: 'Фильтр', i: 'alert', run: () => go('#/tasks?overdue=1') },
    { t: 'Задачи с риском срыва', s: 'Фильтр', i: 'clock', run: () => go('#/tasks?risk=1') },
    { t: 'Победители в библиотеке', s: 'Фильтр', i: 'trophy', run: () => go('#/library?status=winner') },
    { t: 'Календарь дедлайнов', s: 'Вид', i: 'cal', run: () => go('#/tasks?view=calendar') },
  ];
  let items = [], idx = 0, remote = { tasks: [], library: [], users: [] }, seq = 0;
  const ov = modal(`<div class="pal"><div class="pal-in">${I.search}<input id="pal-q" placeholder="Задача, оффер, GEO, креатив, человек или команда…" autocomplete="off" aria-label="Поиск"></div>
    <div class="pal-list" id="pal-list" role="listbox"></div><div class="pal-foot"><span><kbd>↑↓</kbd> выбор</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Esc</kbd> закрыть</span></div></div>`);
  const input = $('#pal-q', ov);
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const local = [...pages, ...actions].filter(x => !q || x.t.toLowerCase().includes(q));
    items = [...local,
      ...remote.tasks.map(t => ({ t: `#${t.id} ${t.title}`, s: `${STATUS[t.status]} · ${t.offer_name || ''} · ${t.geo}`, i: 'doc', run: () => openTask(t.id) })),
      ...remote.library.map(l => ({ t: l.title, s: `Библиотека · ${LIB[l.status]}`, i: 'lib', run: () => openTask(l.task_id) })),
      ...remote.users.map(u => ({ t: u.name, s: ROLES[u.role], i: 'user', run: () => go('#/team?user=' + u.id) }))];
    idx = Math.min(idx, Math.max(0, items.length - 1));
    $('#pal-list', ov).innerHTML = items.map((it, i) => `<button type="button" role="option" class="pal-item ${i === idx ? 'on' : ''}" data-i="${i}">${ico(it.i)}<span>${esc(it.t)}</span><small>${esc(it.s)}</small></button>`).join('')
      || '<div class="empty">Ничего не найдено</div>';
    $$('.pal-item', ov).forEach(b => b.onclick = () => { const it = items[+b.dataset.i]; closeModal(true); it.run(); });
    $('.pal-item.on', ov)?.scrollIntoView({ block: 'nearest' });
  };
  let timer;
  input.oninput = () => { idx = 0; draw(); clearTimeout(timer); const q = input.value.trim(), my = ++seq;
    timer = setTimeout(async () => { remote = q.length > 1 ? await api('GET', '/api/search?q=' + encodeURIComponent(q)).catch(() => remote) : { tasks: [], library: [], users: [] }; if (my === seq) draw(); }, 180); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[idx]; if (it) { closeModal(true); it.run(); } }
  };
  draw();
}

// ---------- login ----------
const DEMO = [['lead', 'Анна', 'Руководитель'], ['buyer1', 'Максим', 'Байер'], ['buyer2', 'Ольга', 'Байер'], ['buyer3', 'Денис', 'Байер'],
  ['creative1', 'Ира', 'Креативщик · моушн'], ['creative2', 'Тимур', 'Креативщик · видео'], ['creative3', 'Лена', 'Креативщик · статика'], ['creative4', 'Паша', 'Креативщик · AI-арт']];
function renderLogin() {
  closeModal(true);
  $('#app').innerHTML = `<div class="login-wrap">
    <section class="login-hero">
      <div class="logo"><i>${I.logo}</i><div>Creative Desk<small>креативный отдел медиабаинга</small></div></div>
      <div class="hero-copy">
        <h2>От ТЗ до победившего креатива — <em>в одном цикле</em></h2>
        <p>Байеры ставят задачи, креативщики сдают версии, руководитель видит загрузку, сроки и деньги. А результаты запуска возвращаются в работу: удачный креатив в один клик превращается в новое ТЗ.</p>
        <ul class="hero-points"><li>${I.check} Версии и правки по пунктам</li><li>${I.check} Библиотека креативов с результатами</li><li>${I.check} AI-бюджеты в деньгах</li><li>${I.check} Подсказки при постановке ТЗ</li></ul>
      </div>
    </section>
    <section class="login-side"><div class="login">
      <h1>Вход</h1><p class="muted">Используйте свой логин или демо-доступ ниже</p>
      <form id="lf">
        <label class="f"><span>Логин</span><input class="input" name="login" autocomplete="username" required></label>
        <label class="f"><span>Пароль</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary block">Войти</button>
      </form>
      <div class="demo"><h3>Демо-доступ · пароль <code>demo123</code></h3>
        <div class="demo-list">${DEMO.map(([l, n, r], i) => `<button data-l="${l}">${avatar(n, i + 1, 'sm')}<span><b>${n}</b><small>${r}</small></span></button>`).join('')}</div></div>
      <a class="concept-link" href="/concept">${I.doc} Концепция продукта</a>
    </div></section></div>`;
  const login = run(async (l, p) => {
    await api('POST', '/api/login', { login: l, password: p });
    await loadBootstrap();
    if (!location.hash || location.hash === '#/') location.hash = '#/home';
    $('#app').innerHTML = ''; render();
  });
  $('#lf').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); login(f.get('login'), f.get('password')); };
  $$('.demo-list button').forEach(b => b.onclick = () => login(b.dataset.l, 'demo123'));
}

document.addEventListener('DOMContentLoaded', boot);
