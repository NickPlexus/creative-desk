// Creative Desk — extras: settings, team, notifications, command palette, charts.
// Loaded after app.js; reuses its globals (S, api, I, modal, toast ...).
// NOTE: integrations / workspace / SLA settings are a demo layer (stored in the browser only).
const store = {
  get(k, d) { try { const v = localStorage.getItem('cd_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cd_' + k, JSON.stringify(v)); } catch {} },
  clearAll() { try { Object.keys(localStorage).filter(k => k.startsWith('cd_') || k === 'theme').forEach(k => localStorage.removeItem(k)); } catch {} },
};
Object.assign(I, {
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'),
  cog: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  plug: svg('<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  brush: svg('<path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/><path d="M7 16c-2 0-3 1.5-3 3a3 3 0 0 1-2 2c4 1 8 0 8-4"/>'),
});
window.price = () => +store.get('price', 0.012);

// ---------- preferences ----------
const ACCENTS = { violet: null, blue: ['#1d8cf0', '#00c2ff'], emerald: ['#0e9f6e', '#34d399'], rose: ['#e11d73', '#ff7a59'], amber: ['#d97706', '#fbbf24'] };
function applyPrefs() {
  const a = ACCENTS[store.get('accent', 'violet')], st = document.documentElement.style;
  if (a) { st.setProperty('--accent', a[0]); st.setProperty('--accent-soft', a[0] + '24'); st.setProperty('--grad', `linear-gradient(135deg, ${a[0]}, ${a[1]})`); }
  else ['--accent', '--accent-soft', '--grad'].forEach(k => st.removeProperty(k));
  document.body.classList.toggle('compact', store.get('density', 'normal') === 'compact');
}
applyPrefs();

// ---------- explain why a drop is not possible ----------
window.whyNot = (t, to) => {
  const r = S.me.role, mine = t.creative_id === S.me.id;
  if (r === 'creative' && t.status === 'review') return 'Работу на проверке принимает байер';
  if (r === 'creative' && t.status === 'done') return 'Принятую задачу может переоткрыть только байер';
  if (r === 'creative' && !mine && t.status !== 'new') return 'Эта задача закреплена за другим исполнителем';
  if (r === 'creative' && to === 'done') return 'Завершить задачу может только байер после проверки';
  if (r === 'buyer' && t.status === 'new') return 'Задачу берёт в работу креативщик';
  if (r === 'buyer' && ['in_progress', 'revision'].includes(t.status)) return 'Задача у исполнителя — дождитесь сдачи';
  if (t.status === 'review' && !(t.buyer_id === S.me.id || r === 'lead')) return 'Принять или вернуть может только автор ТЗ';
  return 'Такой переход недоступен для вашей роли';
};

// ---------- assign dialog (lead) ----------
window.assignDialog = (t) => {
  const people = S.users.filter(u => u.role === 'creative');
  const load = (id) => S.tasks.filter(x => x.creative_id === id && ['in_progress', 'revision'].includes(x.status)).length;
  const best = people.slice().sort((a, b) => load(a.id) - load(b.id))[0];
  const ov = modal(`<form class="dialog"><h2>Назначить исполнителя · #${t.id}</h2>
    <div class="pick">${people.map(u => `<label class="pickrow"><input type="radio" name="u" value="${u.id}" ${u.id === best.id ? 'checked' : ''}>${avatar(u.name, u.id)}
      <span><b>${esc(u.name)}</b><small>в работе: ${load(u.id)}</small></span>${u.id === best.id ? '<em class="rec">меньше всех загружен</em>' : ''}</label>`).join('')}</div>
    <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">Назначить</button></div></form>`);
  $('[data-x]', ov).onclick = closeModal;
  $('form', ov).onsubmit = run(async (e) => {
    e.preventDefault();
    await api('POST', `/api/tasks/${t.id}/assign`, { creative_id: +e.target.u.value });
    toast('Исполнитель назначен'); closeModal(); await refresh(t.id);
  });
};

// ---------- shell decoration: nav links, top line, bell ----------
const _render = render;
render = function () { _render.apply(this, arguments); if (S.me) decorate(); };

function decorate() {
  const route = location.hash.replace('#/', '') || 'board';
  const link = (r, label, icon) => `<a href="#/${r}" aria-label="${label}" ${route === r ? 'aria-current="page"' : ''} class="${route === r ? 'active' : ''}">${icon}<span>${label}</span></a>`;
  $$('.nav').forEach(n => n.insertAdjacentHTML('beforeend', link('team', 'Команда', I.users) + link('settings', 'Настройки', I.cog)));
  $('#view').insertAdjacentHTML('beforebegin', `<div class="topline">
    <button class="palette-btn" id="pal-open" type="button">${I.search}<span>Поиск и команды</span><kbd>Ctrl K</kbd></button><div class="spacer"></div>
    <div class="bellwrap"><button class="btn ghost icon" id="bell" aria-label="Уведомления" aria-expanded="false">${I.bell}<i class="bdot" id="bdot" hidden></i></button>
      <div class="bellpanel" id="bellpanel" hidden></div></div></div>`);
  $('#pal-open').onclick = openPalette;
  $('#bell').onclick = (e) => { e.stopPropagation(); toggleBell(); };
  loadNotifs();
  if (!S.tasks.length) loadTasks().catch(() => {});
}
document.addEventListener('click', (e) => { const p = $('#bellpanel'); if (p && !p.hidden && !p.contains(e.target)) closeBell(); });

const NKEY = { created: 'n_new', revise: 'n_rev', reopen: 'n_rev', accept: 'n_acc', submit: 'n_sub', comment: 'n_com' };
const nPrefs = () => ({ n_new: true, n_rev: true, n_acc: true, n_sub: true, n_com: true, ...store.get('notif', {}) });
const seenAt = () => store.get('seen_' + S.me.id, new Date(Date.now() - 864e5).toISOString());
function visibleNotifs() { const p = nPrefs(); return (S.notifs || []).filter(n => !NKEY[n.action] || p[NKEY[n.action]]); }
async function loadNotifs() {
  try { S.notifs = await api('GET', '/api/notifications'); } catch { S.notifs = []; }
  const unread = visibleNotifs().filter(n => n.created_at > seenAt()).length, d = $('#bdot');
  if (d) { d.hidden = !unread; d.textContent = unread > 9 ? '9+' : unread; }
}
function closeBell() { const p = $('#bellpanel'); if (p) p.hidden = true; $('#bell')?.setAttribute('aria-expanded', 'false'); }
function toggleBell() {
  const p = $('#bellpanel'); if (!p.hidden) return closeBell();
  const list = visibleNotifs().slice(0, 12), seen = seenAt();
  p.innerHTML = `<div class="bp-head"><b>Уведомления</b><button class="btn ghost sm" id="bp-read">Прочитано</button></div>
    <div class="bp-list">${list.map(n => `<button class="bp-item ${n.created_at > seen ? 'new' : ''}" data-id="${n.task_id}">${avatar(n.user_name, n.user_id)}
      <span><b>${esc(n.user_name)}</b> ${ACTIONS[n.action] || esc(n.action)} <em>«${esc(n.title)}»</em>${n.comment ? `<small>${esc(n.comment)}</small>` : ''}<small>${fmtDate(n.created_at)}</small></span></button>`).join('')
      || '<div class="empty-col">Пока тихо</div>'}</div>
    <a class="bp-foot" href="#/settings">Настроить уведомления</a>`;
  p.hidden = false; $('#bell').setAttribute('aria-expanded', 'true');
  $$('.bp-item', p).forEach(b => b.onclick = () => { closeBell(); openTask(+b.dataset.id); });
  $('#bp-read', p).onclick = () => { store.set('seen_' + S.me.id, new Date().toISOString()); loadNotifs(); closeBell(); };
}

// ---------- command palette ----------
function openPalette() {
  const run_ = (fn) => () => { closeModal(); fn(); };
  const cmds = [
    { t: 'Доска задач', s: 'Страница', i: 'board', run: run_(() => location.hash = '#/board') },
    { t: 'Список задач', s: 'Страница', i: 'list', run: run_(() => location.hash = '#/list') },
    ...(S.me.role === 'lead' ? [{ t: 'Аналитика', s: 'Страница', i: 'chart', run: run_(() => location.hash = '#/analytics') }] : []),
    { t: 'Команда', s: 'Страница', i: 'users', run: run_(() => location.hash = '#/team') },
    { t: 'Настройки', s: 'Страница', i: 'cog', run: run_(() => location.hash = '#/settings') },
    ...(S.me.role !== 'creative' ? [{ t: 'Создать новое ТЗ', s: 'Действие', i: 'plus', run: run_(() => taskForm()) }] : []),
    { t: 'Сменить тему', s: 'Действие', i: 'moon', run: run_(() => $('.theme-btn')?.click()) },
  ];
  let items = [], idx = 0;
  const ov = modal(`<div class="pal"><div class="pal-in">${I.search}<input id="pal-q" placeholder="Задача, оффер, GEO или команда…" autocomplete="off" aria-label="Поиск"></div>
    <div class="pal-list" id="pal-list"></div><div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбор</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Esc</kbd> закрыть</span></div></div>`);
  const draw = () => {
    const q = $('#pal-q', ov).value.trim().toLowerCase();
    const c = cmds.filter(x => !q || x.t.toLowerCase().includes(q));
    const ts = (q ? S.tasks.filter(t => [t.title, t.offer, t.geo, '#' + t.id].some(v => String(v).toLowerCase().includes(q))) : S.tasks.filter(t => t.status !== 'done')).slice(0, q ? 8 : 4);
    items = [...c, ...ts.map(t => ({ t: `#${t.id} ${t.title}`, s: `${STATUS[t.status]} · ${t.offer} · ${t.geo}`, i: 'doc', run: run_(() => openTask(t.id)) }))];
    idx = Math.min(idx, Math.max(items.length - 1, 0));
    $('#pal-list', ov).innerHTML = items.map((it, i) => `<button type="button" class="pal-item ${i === idx ? 'on' : ''}" data-i="${i}">${ico(it.i)}<span>${esc(it.t)}</span><small>${esc(it.s)}</small></button>`).join('') || '<div class="empty-col" style="border:0">Ничего не найдено</div>';
    $$('.pal-item', ov).forEach(b => b.onclick = () => items[+b.dataset.i].run());
    $('.pal-item.on', ov)?.scrollIntoView({ block: 'nearest' });
  };
  $('#pal-q', ov).oninput = () => { idx = 0; draw(); };
  $('#pal-q', ov).onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); items[idx]?.run(); }
  };
  (S.tasks.length ? Promise.resolve() : loadTasks()).then(draw);
  draw();
}
document.addEventListener('keydown', (e) => {
  if (!S.me || $('.overlay')) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) { e.preventDefault(); openPalette(); }
});

// ---------- daily chart (analytics) ----------
window.dailyChart = (daily) => {
  if (!daily) return '';
  const end = AN.to ? Date.parse(AN.to) : Date.UTC(...(d => [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()])(new Date()));
  let start = AN.from ? Date.parse(AN.from) : end - 29 * 864e5;
  if (end - start > 59 * 864e5) start = end - 59 * 864e5;
  const days = []; for (let t = start; t <= end; t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
  const map = (arr) => Object.fromEntries(arr.map(r => [r.d, r.n]));
  const c = map(daily.created), d = map(daily.done), max = Math.max(1, ...days.map(x => Math.max(c[x] || 0, d[x] || 0)));
  const W = 900, H = 170, base = H - 22, step = W / days.length, bw = Math.max(2, Math.min(14, step / 2 - 1.5));
  const bars = days.map((x, i) => {
    const cx = i * step + step / 2, h1 = (c[x] || 0) / max * (base - 14), h2 = (d[x] || 0) / max * (base - 14);
    return `<rect x="${cx - bw - 0.5}" y="${base - h1}" width="${bw}" height="${h1}" rx="2" fill="var(--accent)"><title>${x}: создано ${c[x] || 0}</title></rect>
      <rect x="${cx + 0.5}" y="${base - h2}" width="${bw}" height="${h2}" rx="2" fill="var(--ok)"><title>${x}: готово ${d[x] || 0}</title></rect>`
      + (i % Math.ceil(days.length / 8) === 0 ? `<text x="${cx}" y="${H - 5}" text-anchor="middle" font-size="11" fill="var(--faint)">${x.slice(8)}.${x.slice(5, 7)}</text>` : '');
  }).join('');
  const grid = [0, .5, 1].map(f => `<line x1="0" x2="${W}" y1="${base - f * (base - 14)}" y2="${base - f * (base - 14)}" stroke="var(--border-strong)" stroke-dasharray="3 5"/><text x="0" y="${base - f * (base - 14) - 3}" font-size="10" fill="var(--faint)">${Math.round(max * f)}</text>`).join('');
  return `<section class="panel wide"><h3>${ico('chart')}Динамика по дням <span class="extra">создано и завершено</span></h3>
    <svg class="daily" viewBox="0 0 ${W} ${H}" role="img" aria-label="Диаграмма: задачи по дням">${grid}${bars}</svg>
    <div class="legend"><span><i style="background:var(--accent)"></i>Создано</span><span><i style="background:var(--ok)"></i>Завершено</span></div></section>`;
};

// ---------- team page ----------
const SPEC = { creative1: ['Моушн', 'Баннеры'], creative2: ['Видео', 'UGC'], creative3: ['Статика', 'GIF'], creative4: ['AI-арт', 'Playable'] };
window.renderTeam = async function (load) {
  if (load) await loadTasks();
  const v = $('#view'), T = S.tasks;
  const card = (u) => {
    const mine = T.filter(t => (u.role === 'creative' ? t.creative_id : t.buyer_id) === u.id);
    const active = mine.filter(t => t.status !== 'done').length, done = mine.filter(t => t.status === 'done').length;
    const late = mine.filter(t => t.status !== 'done' && isLate(t)).length, online = (u.id * 7) % 3 !== 0;
    const login = (DEMO.find(d => d[1] === u.name.split(' ')[0]) || [])[0];
    const pct = Math.min(100, active * 22);
    return `<div class="member">
      <div class="m-top"><span class="av-wrap">${avatar(u.name, u.id)}<i class="pres ${online ? 'on' : ''}" title="${online ? 'В сети' : 'Не в сети'}"></i></span>
        <div><b>${esc(u.name)}</b><small>${ROLES[u.role]}</small></div><span class="tag ${online ? '' : 'p-low'}" style="margin-left:auto">${online ? 'в сети' : 'не в сети'}</span></div>
      ${(SPEC[login] || []).length ? `<div class="m-spec">${SPEC[login].map(s => `<span class="tag">${s}</span>`).join('')}</div>` : ''}
      <div class="m-load"><div class="track"><div class="fill" style="width:${pct}%;${pct >= 88 ? 'background:var(--danger)' : ''}"></div></div><small>${u.role === 'creative' ? 'Загрузка' : 'Активные ТЗ'}: ${active}</small></div>
      <div class="m-stats"><div><b>${done}</b><small>завершено</small></div><div><b>${active}</b><small>в процессе</small></div><div><b style="${late ? 'color:var(--danger)' : ''}">${late}</b><small>просрочено</small></div></div>
    </div>`;
  };
  const group = (role, title) => `<h3 class="grp">${title}<span>${S.users.filter(u => u.role === role).length}</span></h3><div class="team-grid">${S.users.filter(u => u.role === role).map(card).join('')}</div>`;
  v.innerHTML = `<div class="page-head"><div class="titles"><h1>Команда</h1><div class="sub">Состав отдела, специализации и текущая загрузка</div></div>
    <button class="btn" id="invite">${I.plus} Пригласить</button></div>
    ${group('lead', 'Руководство')}${group('creative', 'Креативщики')}${group('buyer', 'Медиабайеры')}`;
  $('#invite').onclick = () => toast('Демо-режим: приглашения отключены');
};

// ---------- settings page ----------
window.renderSettings = function () {
  const v = $('#view'), me = S.me, n = { digest: false, deadline: true, ...nPrefs() };
  let theme = 'system'; try { theme = localStorage.theme || 'system'; } catch {}
  const acc = store.get('accent', 'violet'), dens = store.get('density', 'normal'), integ = store.get('integ', { telegram: true });
  const sla = { urgent: 24, high: 48, medium: 72, low: 120, ...store.get('sla', {}) };
  const ws = { name: 'Creative Desk Team', tz: 'Europe/Moscow', hours: '10:00–19:00', auto: false, ...store.get('ws', {}) };
  const row = (title, hint, key) => `<div class="setrow"><div><b>${title}</b><small>${hint}</small></div><label class="switch"><input type="checkbox" data-n="${key}" ${n[key] ? 'checked' : ''}><i></i></label></div>`;
  const INTEG = [['telegram', 'Telegram', 'Уведомления о задачах в чат отдела', '#229ED9'], ['slack', 'Slack', 'Дайджест и дедлайны в канал', '#9b51e0'],
    ['drive', 'Google Drive', 'Автосоздание папок под задачи', '#16b47e'], ['notion', 'Notion', 'Синхронизация ТЗ с базой знаний', '#f08c1c']];
  v.innerHTML = `<div class="page-head"><div class="titles"><h1>Настройки</h1><div class="sub">Профиль, внешний вид, уведомления и интеграции</div></div>
    <button class="btn primary" id="save-all">Сохранить</button></div>
  <div class="set-grid">
    <section class="panel"><h3>${ico('user')}Профиль</h3>
      <div class="prof">${avatar(me.name, me.id)}<div><b>${esc(me.name)}</b><small>${ROLES[me.role]} · ${esc(me.login)}</small></div></div>
      <div class="grid2" style="margin-top:14px"><label class="f"><span>Рабочая почта</span><input class="input" data-s="email" value="${esc(store.get('email', me.login + '@creative-desk.demo'))}"></label>
        <label class="f"><span>Telegram</span><input class="input" data-s="tg" placeholder="@username" value="${esc(store.get('tg', ''))}"></label></div></section>
    <section class="panel"><h3>${ico('brush')}Внешний вид</h3>
      <div class="setrow"><div><b>Тема</b><small>Системная подстраивается под устройство</small></div>
        <div class="seg" id="seg-theme">${[['system', 'Системная'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, l]) => `<button data-v="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="setrow"><div><b>Плотность карточек</b><small>Компактный режим вмещает больше задач на экран</small></div>
        <div class="seg" id="seg-dens">${[['normal', 'Обычная'], ['compact', 'Компактная']].map(([k, l]) => `<button data-v="${k}" class="${dens === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="setrow"><div><b>Акцентный цвет</b><small>Кнопки, подсветка, диаграммы</small></div>
        <div class="swatches" id="swatches">${Object.entries(ACCENTS).map(([k, c]) => `<button class="sw ${acc === k ? 'on' : ''}" data-v="${k}" aria-label="${k}" style="background:${c ? `linear-gradient(135deg,${c[0]},${c[1]})` : 'linear-gradient(135deg,#7b5cff,#00c2ff)'}"></button>`).join('')}</div></div></section>
    <section class="panel"><h3>${ico('alert')}Уведомления</h3>
      ${row('Новые задачи', 'Когда байер создаёт ТЗ', 'n_new')}${row('Правки', 'Когда работа возвращается на доработку', 'n_rev')}
      ${row('Принятые работы', 'Когда результат принят', 'n_acc')}${row('Сдачи на проверку', 'Когда креативщик сдал результат', 'n_sub')}
      ${row('Комментарии', 'Новые комментарии к задачам', 'n_com')}${row('Дедлайны', 'Напоминание за 12 часов', 'deadline')}${row('Email-дайджест', 'Сводка за день на почту (демо)', 'digest')}</section>
    <section class="panel"><h3>${ico('spark')}AI-расходы</h3>
      <div class="setrow"><div><b>Стоимость 1 кредита</b><small>Используется для оценки бюджета в аналитике</small></div>
        <div class="money"><span>$</span><input class="input" type="number" min="0" step="0.001" id="price" value="${window.price()}"></div></div>
      <small class="muted" id="price-hint">≈ $${(window.price() * 1000).toFixed(2)} за 1000 кредитов</small></section>
    <section class="panel wide"><h3>${ico('plug')}Интеграции <span class="extra">демо-режим</span></h3>
      <div class="integs">${INTEG.map(([k, name, desc, col]) => `<div class="integ"><span class="ilogo" style="background:${col}">${name[0]}</span><div><b>${name}</b><small>${desc}</small></div>
        <button class="btn sm ${integ[k] ? '' : 'primary'}" data-i="${k}">${integ[k] ? 'Подключено ✓' : 'Подключить'}</button></div>`).join('')}</div></section>
    ${me.role === 'lead' ? `<section class="panel wide"><h3>${ico('tasks')}Рабочее пространство <span class="extra">только руководитель</span></h3>
      <div class="grid3"><label class="f"><span>Название отдела</span><input class="input" data-w="name" value="${esc(ws.name)}"></label>
        <label class="f"><span>Часовой пояс</span><select class="input" data-w="tz">${['Europe/Moscow', 'Europe/Kyiv', 'Asia/Almaty', 'Europe/Berlin', 'UTC'].map(z => `<option ${ws.tz === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
        <label class="f"><span>Рабочие часы</span><input class="input" data-w="hours" value="${esc(ws.hours)}"></label></div>
      <h4 class="sub-h">SLA по приоритету, часов</h4>
      <div class="grid3" style="grid-template-columns:repeat(4,1fr)">${Object.entries(PRIO).map(([k, l]) => `<label class="f"><span>${l}</span><input class="input" type="number" min="1" data-sla="${k}" value="${sla[k]}"></label>`).join('')}</div>
      <div class="setrow" style="margin-top:8px"><div><b>Автоназначение</b><small>Новые задачи получает наименее загруженный креативщик (демо)</small></div>
        <label class="switch"><input type="checkbox" data-wa ${ws.auto ? 'checked' : ''}><i></i></label></div></section>` : ''}
    <section class="panel wide"><h3>${ico('history')}Данные</h3><div class="setrow"><div><b>Сбросить настройки интерфейса</b><small>Тема, акцент, плотность, уведомления и демо-параметры вернутся к значениям по умолчанию</small></div>
      <button class="btn sm" id="reset-ui" style="color:var(--danger)">Сбросить</button></div></section>
  </div>`;
  const seg = (id, key, after) => $$(`#${id} button`, v).forEach(b => b.onclick = () => { store.set(key, b.dataset.v); applyPrefs(); after?.(b.dataset.v); renderSettings(); });
  seg('seg-dens', 'density'); seg('swatches', 'accent');
  $$('#seg-theme button', v).forEach(b => b.onclick = () => {
    const t = b.dataset.v;
    try { t === 'system' ? localStorage.removeItem('theme') : localStorage.theme = t; } catch {}
    t === 'system' ? delete document.documentElement.dataset.theme : document.documentElement.dataset.theme = t; renderSettings();
  });
  $$('[data-n]', v).forEach(c => c.onchange = () => { store.set('notif', { ...store.get('notif', {}), [c.dataset.n]: c.checked }); loadNotifs(); });
  $$('[data-s]', v).forEach(i => i.onchange = () => store.set(i.dataset.s, i.value));
  $$('[data-w]', v).forEach(i => i.onchange = () => store.set('ws', { ...store.get('ws', {}), [i.dataset.w]: i.value }));
  $$('[data-sla]', v).forEach(i => i.onchange = () => store.set('sla', { ...store.get('sla', {}), [i.dataset.sla]: +i.value }));
  $('[data-wa]', v)?.addEventListener('change', (e) => store.set('ws', { ...store.get('ws', {}), auto: e.target.checked }));
  $('#price').oninput = (e) => { const p = Math.max(0, +e.target.value || 0); store.set('price', p); $('#price-hint').textContent = `≈ $${(p * 1000).toFixed(2)} за 1000 кредитов`; };
  $$('[data-i]', v).forEach(b => b.onclick = () => { const s = store.get('integ', { telegram: true }); s[b.dataset.i] = !s[b.dataset.i]; store.set('integ', s);
    toast(s[b.dataset.i] ? 'Демо: интеграция подключена' : 'Интеграция отключена'); renderSettings(); });
  $('#save-all').onclick = () => toast('Настройки сохранены');
  $('#reset-ui').onclick = () => { if (!confirm('Сбросить настройки интерфейса?')) return; store.clearAll(); delete document.documentElement.dataset.theme; applyPrefs(); toast('Настройки сброшены'); renderSettings(); loadNotifs(); };
};
