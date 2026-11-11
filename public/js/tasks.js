// Tasks: board / list / calendar, filters in URL, drag-and-drop, dialogs (brief, assign, revise, submit)
'use strict';

// ---------- permissions mirror (server is the source of truth) ----------
function allowedMoves(t) {
  const r = S.me.role, mine = t.creative_id === S.me.id, owner = t.buyer_id === S.me.id || r === 'lead', m = {};
  if (r === 'lead' && t.status === 'new') m.in_progress = 'assign';
  if (r === 'creative') {
    if (t.status === 'new') m.in_progress = 'take';
    if (mine && ['in_progress', 'revision'].includes(t.status)) { m.review = 'submit'; m.new = 'release'; }
  }
  if (r === 'lead' && ['in_progress', 'revision'].includes(t.status)) m.new = 'release';
  if ((r === 'buyer' || r === 'lead') && owner) {
    if (t.status === 'review') { m.done = 'accept'; m.revision = 'revise'; }
    if (t.status === 'done') m.revision = 'reopen';
  }
  return m;
}
function whyNot(t, to) {
  const r = S.me.role, mine = t.creative_id === S.me.id;
  if (r === 'creative' && t.status === 'review') return 'Работу на проверке принимает байер';
  if (r === 'creative' && t.status === 'done') return 'Принятую задачу переоткрывает байер';
  if (r === 'creative' && !mine && t.status !== 'new') return 'Задача закреплена за другим исполнителем';
  if (r === 'creative' && to === 'done') return 'Завершает задачу байер после проверки';
  if (r === 'buyer' && t.status === 'new') return 'Задачу берёт в работу креативщик';
  if (r === 'buyer' && ['in_progress', 'revision'].includes(t.status)) return 'Задача у исполнителя — дождитесь сдачи версии';
  if (t.status === 'review' && to === 'in_progress') return 'Из проверки задача уходит в «Правки» или «Готово»';
  return 'Такой переход недоступен для вашей роли';
}
async function doAction(t, action) {
  const reopenDrawer = !!$('.drawer');
  const after = async (msg) => { toast(msg); closeModal(true); await refresh(); loadBadges(); if (reopenDrawer) openTask(t.id); };
  if (action === 'assign') return assignDialog(t, after);
  if (action === 'submit') return submitDialog(t, after);
  if (action === 'revise' || action === 'reopen') return reviseDialog(t, action, after);
  if (action === 'release' && !(await confirmDialog('Вернуть задачу в очередь?', 'Исполнитель будет снят, таймер остановлен.', 'Вернуть'))) return;
  await api('POST', `/api/tasks/${t.id}/${action}`, {});
  await after({ take: 'Задача взята в работу', accept: 'Работа принята — креатив добавлен в библиотеку', release: 'Задача возвращена в очередь' }[action]);
}

// ---------- page ----------
const FILTER_KEYS = ['q', 'offer_id', 'type', 'priority', 'creative_id', 'buyer_id', 'geo', 'overdue', 'risk', 'mine', 'status', 'from', 'to'];
const FILTER_LABEL = { overdue: () => 'Просроченные', risk: () => 'С риском срыва', mine: () => 'Только мои', creative_id: (v) => 'Исполнитель: ' + userName(+v),
  buyer_id: (v) => 'Байер: ' + userName(+v), offer_id: (v) => 'Оффер: ' + offerName(+v), geo: (v) => 'GEO: ' + v, status: (v) => 'Статус: ' + STATUS[v],
  type: (v) => 'Тип: ' + TYPES[v], from: (v) => 'С ' + v, to: (v) => 'по ' + v, priority: (v) => 'Приоритет: ' + PRIO[v], q: (v) => '«' + v + '»' };
let calMonth = null, listSort = { k: 'deadline', d: 1 };

Pages.tasks = async (view, params) => {
  const vmode = params.get('view') || S.me.prefs?.boardView || 'board';
  const qs = new URLSearchParams(); FILTER_KEYS.forEach(k => params.get(k) && qs.set(k, params.get(k)));
  const tasks = await api('GET', '/api/tasks?' + qs);
  S.tasks = tasks;
  const setParam = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); go('#/tasks' + (p.toString() ? '?' + p : '')); };
  const chips = FILTER_KEYS.filter(k => params.get(k) && !['q'].includes(k) && FILTER_LABEL[k]);
  const sel = (k, label, opts) => `<select class="input" data-f="${k}" aria-label="${label}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${v}" ${String(params.get(k)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  view.innerHTML = `
    <div class="toolbar">
      <div class="seg" role="tablist">${[['board', 'Доска', 'board'], ['list', 'Список', 'list'], ['calendar', 'Календарь', 'cal']].map(([k, l, i]) =>
        `<button data-v="${k}" class="${vmode === k ? 'on' : ''}" role="tab" aria-selected="${vmode === k}">${I[i]}<span>${l}</span></button>`).join('')}</div>
      <label class="search">${I.search}<input class="input" id="tq" placeholder="Название, оффер, GEO, #id" value="${esc(params.get('q') || '')}" aria-label="Поиск задач"></label>
      ${sel('offer_id', 'Все офферы', S.offers.map(o => [o.id, o.name]))}
      ${sel('type', 'Все типы', Object.entries(TYPES))}
      ${sel('priority', 'Любой приоритет', Object.entries(PRIO))}
      ${S.me.role !== 'creative' ? sel('creative_id', 'Все исполнители', S.users.filter(u => u.role === 'creative').map(u => [u.id, u.name])) : ''}
      <label class="check"><input type="checkbox" id="tmine" ${params.get('mine') ? 'checked' : ''}> Мои</label>
      <div class="spacer"></div>
      <a class="btn ghost sm" href="/api/tasks/export.csv?${qs}" download title="Экспорт текущей выборки в Excel/CSV">${I.download} CSV</a>
      ${S.me.role !== 'creative' ? `<button class="btn primary" id="tnew">${I.plus} Новое ТЗ</button>` : ''}
    </div>
    ${chips.length ? `<div class="chips">${chips.map(k => `<button class="chip" data-clear="${k}">${esc(FILTER_LABEL[k](params.get(k)))} ${I.x}</button>`).join('')}
      <button class="chip ghost" data-clear="all">Сбросить всё</button></div>` : ''}
    <div id="tview"></div>`;
  $$('.seg button', view).forEach(b => b.onclick = () => { savePrefs({ boardView: b.dataset.v }).catch(() => {}); setParam('view', b.dataset.v); });
  let tq; $('#tq').oninput = (e) => { clearTimeout(tq); tq = setTimeout(() => setParam('q', e.target.value.trim()), 350); };
  $$('[data-f]', view).forEach(s => s.onchange = () => setParam(s.dataset.f, s.value));
  $('#tmine').onchange = (e) => setParam('mine', e.target.checked ? '1' : '');
  $('#tnew') && ($('#tnew').onclick = () => taskForm());
  $$('[data-clear]', view).forEach(b => b.onclick = () => b.dataset.clear === 'all' ? go('#/tasks' + (params.get('view') ? '?view=' + params.get('view') : '')) : setParam(b.dataset.clear, ''));
  const box = $('#tview');
  if (vmode === 'list') renderList(box, tasks); else if (vmode === 'calendar') renderCalendar(box, tasks); else renderBoard(box, tasks);
};

// ---------- board ----------
function deadlineText(t) {
  if (t.status === 'done') return `<span class="dl">${I.check} ${fmtDay(t.completed_at)}</span>`;
  const h = (new Date(t.deadline) - Date.now()) / 36e5;
  const cls = h < 0 ? 'late' : h < 12 ? 'soon' : '';
  return `<span class="dl ${cls}" title="Дедлайн ${fmtDate(t.deadline)}">${I.clock} ${h < 0 ? 'просрочено на ' + fmtDur(-h) : h < 48 ? 'через ' + fmtDur(h) : fmtDay(t.deadline)}</span>`;
}
function card(t) {
  const moves = allowedMoves(t);
  return `<article class="card p-${t.priority}" data-id="${t.id}" draggable="true" tabindex="0" aria-label="Задача #${t.id}: ${esc(t.title)}">
    ${t.cover_id && ['review', 'done'].includes(t.status) ? `<div class="card-cover">${cover(t.cover_id)}${t.library_status && t.library_status !== 'pending' ? libTag(t.library_status) : ''}</div>` : ''}
    <div class="card-top">${prioTag(t.priority)}<span class="tag">${TYPES[t.creative_type]} ×${t.quantity}</span><span class="tag">${esc(t.geo)}</span>${riskTag(t)}</div>
    <h4>${t.parent_library_id ? `<span class="var" title="Вариация креатива из библиотеки">${I.loop}</span>` : ''}${esc(t.title)}</h4>
    <div class="meta"><span class="id">#${t.id}</span><span>${esc(t.offer_name || '—')}</span></div>
    ${t.open_items && t.status !== 'done' ? `<div class="items-hint">${I.alert} ${t.open_items} ${t.open_items === 1 ? 'пункт' : 'пункта'} правок</div>` : ''}
    <div class="foot">${deadlineText(t)}
      <span class="right">${t.timer_user ? '<i class="rec" title="Идёт работа (таймер)"></i>' : ''}${t.ai_usd ? `<span class="ai" title="AI-расходы">${usd(t.ai_usd)}</span>` : ''}
      ${t.creative_name ? avatar(t.creative_name, t.creative_id, 'sm') : moves.in_progress ? `<span class="pickme">${S.me.role === 'lead' ? 'назначить' : 'взять'}</span>` : ''}</span></div>
  </article>`;
}
function renderBoard(box, tasks) {
  const showAllDone = box.dataset.alldone === '1';
  box.innerHTML = `<div class="board">${Object.keys(STATUS).map(s => {
    let items = tasks.filter(t => t.status === s);
    const total = items.length;
    if (s === 'done') { items = items.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)); if (!showAllDone) items = items.slice(0, 12); }
    return `<section class="col" data-status="${s}"><header class="col-head"><span class="dot st-${s}"></span>${STATUS[s]}<span class="cnt">${total}</span></header>
      <div class="col-body">${items.map(card).join('') || `<div class="empty-col">${s === 'new' && S.me.role === 'creative' ? 'Свободных задач нет' : 'Пусто'}</div>`}
      ${s === 'done' && total > items.length ? `<button class="btn ghost sm block" id="more-done">Показать все (${total})</button>` : ''}</div></section>`;
  }).join('')}</div>`;
  $('#more-done') && ($('#more-done').onclick = () => { box.dataset.alldone = '1'; renderBoard(box, tasks); });
  let dragged = null;
  $$('.card', box).forEach(c => {
    const t = tasks.find(x => x.id === +c.dataset.id);
    c.onclick = () => openTask(t.id);
    c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t.id); } };
    c.ondragstart = (e) => {
      dragged = t; e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move';
      const moves = allowedMoves(t);
      requestAnimationFrame(() => { c.classList.add('dragging'); $$('.col', box).forEach(col => col.classList.add(moves[col.dataset.status] ? 'drop-ok' : col.dataset.status === t.status ? 'self' : 'drop-no')); });
    };
    c.ondragend = () => { c.classList.remove('dragging'); $$('.col', box).forEach(col => col.classList.remove('drop-ok', 'drop-no', 'self', 'over')); };
  });
  $$('.col', box).forEach(col => {
    col.ondragover = (e) => { e.preventDefault(); if (col.classList.contains('drop-ok')) col.classList.add('over'); };
    col.ondragleave = (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); };
    col.ondrop = run(async (e) => {
      e.preventDefault(); col.classList.remove('over');
      const t = dragged || tasks.find(x => x.id === +e.dataTransfer.getData('text/plain')); dragged = null;
      if (!t || col.dataset.status === t.status) return;
      const action = allowedMoves(t)[col.dataset.status];
      if (action) await doAction(t, action); else toast(whyNot(t, col.dataset.status), 'err');
    });
  });
}

// ---------- list ----------
function renderList(box, tasks) {
  const cols = [['id', '#'], ['title', 'Задача'], ['status', 'Статус'], ['priority', 'Приоритет'], ['geo', 'GEO'], ['buyer_name', 'Байер'], ['creative_name', 'Исполнитель'],
    ['deadline', 'Дедлайн'], ['work_sec', 'Работа'], ['ai_usd', 'AI $'], ['library_status', 'Результат']];
  const pr = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...tasks].sort((a, b) => {
    let x = a[listSort.k], y = b[listSort.k];
    if (listSort.k === 'priority') { x = pr[x]; y = pr[y]; }
    if (listSort.k === 'deadline') { x = Date.parse(x); y = Date.parse(y); }
    return (x > y ? 1 : x < y ? -1 : 0) * listSort.d;
  });
  box.innerHTML = `<div class="panel table-wrap"><table class="t"><thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="sortable ${['work_sec', 'ai_usd'].includes(k) ? 'num' : ''}" aria-sort="${listSort.k === k ? (listSort.d > 0 ? 'ascending' : 'descending') : 'none'}">${l}${listSort.k === k ? (listSort.d > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
    <tbody>${sorted.map(t => `<tr class="click" data-id="${t.id}" tabindex="0"><td class="muted">${t.id}</td>
      <td><b>${esc(t.title)}</b><br><small class="muted">${esc(t.offer_name || '')} · ${TYPES[t.creative_type]} ×${t.quantity}</small></td>
      <td>${stTag(t.status)} ${riskTag(t)}</td><td>${prioTag(t.priority)}</td><td>${esc(t.geo)}</td><td>${esc(t.buyer_name)}</td><td>${esc(t.creative_name || '—')}</td>
      <td class="nowrap">${deadlineText(t)}</td><td class="num">${t.work_sec ? fmtDur(t.work_sec / 3600) : '—'}</td><td class="num">${t.ai_usd ? usd(t.ai_usd) : '—'}</td>
      <td>${t.library_status ? libTag(t.library_status) : '—'}</td></tr>`).join('') || `<tr><td colspan="11">${empty('Под фильтр ничего не попало', 'filter')}</td></tr>`}</tbody></table></div>`;
  $$('th.sortable', box).forEach(th => th.onclick = () => { listSort = { k: th.dataset.k, d: listSort.k === th.dataset.k ? -listSort.d : 1 }; renderList(box, tasks); });
  $$('tr.click', box).forEach(r => { r.onclick = () => openTask(+r.dataset.id); r.onkeydown = (e) => { if (e.key === 'Enter') openTask(+r.dataset.id); }; });
}

// ---------- calendar ----------
function renderCalendar(box, tasks) {
  const now = new Date(); calMonth ||= new Date(now.getFullYear(), now.getMonth(), 1);
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const by = {}; tasks.forEach(t => { const d = new Date(t.status === 'done' ? t.completed_at : t.deadline); (by[key(d)] ||= []).push(t); });
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<div class="cal-cell off"></div>');
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m, d), list = by[key(date)] || [], today = key(date) === key(now);
    cells.push(`<div class="cal-cell ${today ? 'today' : ''}"><span class="cal-d">${d}</span>${list.slice(0, 4).map(t =>
      `<button class="cal-t st-bg-${t.status} ${t.risk === 'late' ? 'late' : ''}" data-id="${t.id}" title="${esc(t.title)}">${t.status === 'done' ? '✓ ' : ''}${esc(t.title)}</button>`).join('')}
      ${list.length > 4 ? `<span class="muted cal-more">+${list.length - 4}</span>` : ''}</div>`);
  }
  box.innerHTML = `<div class="panel"><div class="cal-head"><button class="btn ghost icon" id="cprev" aria-label="Предыдущий месяц">‹</button>
    <b>${calMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</b><button class="btn ghost icon" id="cnext" aria-label="Следующий месяц">›</button>
    <button class="btn ghost sm" id="ctoday">Сегодня</button><span class="muted small">Активные — по дедлайну, готовые — по дате приёмки</span></div>
    <div class="cal">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="cal-dow">${d}</div>`).join('')}${cells.join('')}</div></div>`;
  $('#cprev').onclick = () => { calMonth = new Date(y, m - 1, 1); renderCalendar(box, tasks); };
  $('#cnext').onclick = () => { calMonth = new Date(y, m + 1, 1); renderCalendar(box, tasks); };
  $('#ctoday').onclick = () => { calMonth = null; renderCalendar(box, tasks); };
  $$('.cal-t', box).forEach(b => b.onclick = () => openTask(+b.dataset.id));
}

// ---------- brief form (create / edit / variation) with live insights ----------
const REASON_TIP = { hook: 'Опишите хук первых 2 секунд', text: 'Укажите точный текст CTA и заголовка', localization: 'Укажите язык текста и формат валюты',
  visual: 'Приложите референс стиля лендинга', platform: 'Перечислите ограничения площадки', tech: 'Укажите размеры и лимит веса файла', other: 'Уточните ожидаемый результат' };
function localInput(d) { const x = new Date(d); return new Date(x - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }

async function taskForm(t, preset = {}) {
  if (S.me.role === 'creative') return;
  const isEdit = !!t;
  const d = t ? { ...t } : { priority: 'medium', creative_type: 'video', quantity: 3, geo: '', checklist: [], ...preset };
  const sla = S.settings.sla || { urgent: 24, high: 48, medium: 72, low: 120 };
  let deadlineTouched = isEdit;
  const tpls = S.templates.filter(x => x.active);
  const ov = modal(`<form class="dialog xl" id="tf" novalidate>
    <h2>${isEdit ? 'Редактировать ТЗ #' + t.id : preset.parent_library_id ? 'Вариации креатива' : 'Новое техническое задание'}</h2>
    <div class="tf-grid"><div class="tf-main">
      ${!isEdit ? `<label class="f"><span>Шаблон</span><select class="input" name="template_id"><option value="">Без шаблона</option>${tpls.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      ${preset.parent_library_id ? `<div class="note ok">${I.loop} Вариация креатива из библиотеки — связь сохранится, а аналитика покажет, работают ли вариации лучше новых идей.</div>` : ''}
      <label class="f"><span>Название *</span><input class="input" name="title" required maxlength="140" value="${esc(d.title)}" placeholder="Напр.: Вертикальные видео с хуком 15 с"></label>
      <div class="grid3">
        <label class="f"><span>Оффер *</span><select class="input" name="offer_id" required><option value="">Выберите…</option>${S.offers.filter(o => o.active || o.id === d.offer_id).map(o => `<option value="${o.id}" ${o.id === +d.offer_id ? 'selected' : ''}>${esc(o.name)} · ${esc(o.vertical)}</option>`).join('')}</select></label>
        <label class="f"><span>Тип креатива *</span><select class="input" name="creative_type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${d.creative_type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f"><span>Количество *</span><input class="input" type="number" min="1" max="100" name="quantity" value="${d.quantity}"></label>
      </div>
      <div class="f"><span>GEO * <small class="muted">— несколько через Enter</small></span>
        <div class="geo-input" id="geo-box"><input list="geo-list" id="geo-in" placeholder="DE, PL…" aria-label="Добавить GEO"></div>
        <datalist id="geo-list">${S.geos.map(g => `<option value="${esc(g.code)}">${esc(g.name)}</option>`).join('')}</datalist></div>
      <div class="grid2">
        <label class="f"><span>Приоритет *</span><select class="input" name="priority">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${d.priority === k ? 'selected' : ''}>${v} · SLA ${sla[k]} ч</option>`).join('')}</select></label>
        <label class="f"><span>Дедлайн *</span><input class="input" type="datetime-local" name="deadline" required value="${localInput(d.deadline || Date.now() + sla[d.priority] * 36e5)}"></label>
      </div>
      <div id="dl-warn"></div>
      <label class="f"><span>Описание</span><textarea class="input" name="description" rows="5" placeholder="Аудитория, посыл, хук, тексты, ограничения…">${esc(d.description)}</textarea></label>
      <label class="f"><span>Референсы — ссылки, по одной в строке</span><textarea class="input" name="refs" rows="2" placeholder="https://…">${esc(d.refs)}</textarea></label>
      ${!isEdit ? `<label class="f"><span>Файлы-референсы</span><input class="input" type="file" name="reffiles" multiple accept="image/*,video/*,.pdf,.zip"></label>` : ''}
      <div class="f"><span>Чек-лист требований <small class="muted">— креативщик видит его в карточке</small></span><div id="cl-box" class="cl-edit"></div>
        <button type="button" class="btn ghost sm" id="cl-add">${I.plus} Пункт</button></div>
    </div>
    <aside class="tf-side" id="insights" aria-live="polite"><div class="muted small">Выберите оффер и тип — здесь появятся подсказки на основе истории отдела.</div></aside></div>
    <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">${isEdit ? 'Сохранить' : 'Создать задачу'}</button></div></form>`);
  const f = $('#tf', ov);
  // GEO chips
  let geos = String(d.geo || '').split(/[\s,]+/).filter(Boolean);
  const drawGeo = () => { $$('.geo-chip', f).forEach(x => x.remove()); geos.forEach(g => $('#geo-in', f).insertAdjacentHTML('beforebegin', `<button type="button" class="geo-chip" data-g="${esc(g)}" aria-label="Убрать ${esc(g)}">${esc(g)} ${I.x}</button>`)); $$('.geo-chip', f).forEach(b => b.onclick = () => { geos = geos.filter(x => x !== b.dataset.g); drawGeo(); }); };
  const addGeo = (v) => { const c = v.trim().toUpperCase(); if (!c) return; if (!S.geos.some(g => g.code === c)) return toast(`GEO «${c}» нет в справочнике`, 'err'); if (!geos.includes(c)) geos.push(c); $('#geo-in', f).value = ''; drawGeo(); };
  $('#geo-in', f).onkeydown = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addGeo(e.target.value); } else if (e.key === 'Backspace' && !e.target.value) { geos.pop(); drawGeo(); } };
  $('#geo-in', f).onchange = (e) => addGeo(e.target.value);
  drawGeo();
  // checklist editor
  let checklist = [...(d.checklist || [])];
  const drawCl = () => { $('#cl-box', f).innerHTML = checklist.map((c, i) => `<div class="cl-row"><input class="input" value="${esc(c)}" data-i="${i}" aria-label="Пункт чек-листа"><button type="button" class="btn ghost icon" data-del="${i}" aria-label="Удалить">${I.x}</button></div>`).join('');
    $$('[data-i]', f).forEach(x => x.oninput = () => checklist[+x.dataset.i] = x.value); $$('[data-del]', f).forEach(b => b.onclick = () => { checklist.splice(+b.dataset.del, 1); drawCl(); }); };
  $('#cl-add', f).onclick = () => { checklist.push(''); drawCl(); $$('[data-i]', f).at(-1).focus(); };
  drawCl();
  // template fills brief
  f.template_id && (f.template_id.onchange = () => {
    const tp = S.templates.find(x => x.id === +f.template_id.value); if (!tp) return;
    f.creative_type.value = tp.creative_type; f.quantity.value = tp.quantity; f.priority.value = tp.priority;
    if (!f.description.value.trim()) f.description.value = tp.description;
    if (!f.title.value.trim()) f.title.value = tp.name;
    checklist = [...new Set([...checklist.filter(Boolean), ...tp.checklist])]; drawCl();
    if (!deadlineTouched) f.deadline.value = localInput(Date.now() + sla[tp.priority] * 36e5);
    loadInsights();
  });
  f.priority.onchange = () => { if (!deadlineTouched) f.deadline.value = localInput(Date.now() + sla[f.priority.value] * 36e5); checkDeadline(); };
  f.deadline.oninput = () => { deadlineTouched = true; checkDeadline(); };
  // live insights
  let ins = null;
  function checkDeadline() {
    const box = $('#dl-warn', f); if (!ins) return (box.innerHTML = '');
    const left = (new Date(f.deadline.value) - Date.now()) / 36e5;
    box.innerHTML = left < ins.eta_h ? `<div class="note warn">${I.alert} Обычно такая задача проходит путь от ТЗ до сдачи за ~${fmtDur(ins.eta_h)} (с учётом очереди: ${ins.queue}). С этим дедлайном она сразу попадёт в зону риска.</div>` : '';
  }
  async function loadInsights() {
    const type = f.creative_type.value, offer = f.offer_id.value;
    ins = await api('GET', `/api/insights?type=${type}&offer_id=${offer || 0}`).catch(() => null);
    const side = $('#insights', f); if (!ins || !side) return;
    const st = ins.stats;
    side.innerHTML = `<h3>${I.spark} Подсказки отдела</h3>
      <div class="ins-block"><b>Реалистичный срок</b><p>~${fmtDur(ins.eta_h)} от ТЗ до первой версии. В очереди ${ins.queue} ${ins.queue === 1 ? 'задача' : 'задач'}. ${st.first_pass_rate != null ? `С первого раза принимают ${st.first_pass_rate}% задач типа «${TYPES[type]}».` : ''}</p></div>
      ${ins.reasons.length ? `<div class="ins-block"><b>Частые причины правок — ${TYPES[type]}</b>${ins.reasons.map(r => `<div class="ins-reason"><span>${REASONS[r.reason]}</span><i style="--w:${r.pct}%"></i><small>${r.pct}%</small>
        <button type="button" class="btn ghost sm" data-tip="${r.reason}" title="Добавить пункт в чек-лист ТЗ">${I.plus}</button></div>`).join('')}<p class="muted small">Закройте эти вопросы в ТЗ заранее — правок станет меньше.</p></div>` : ''}
      ${ins.winners.length ? `<div class="ins-block"><b>${I.trophy} Что уже сработало</b><div class="ins-wins">${ins.winners.map(w => `<button type="button" class="ins-win" data-lib="${w.id}" data-title="${esc(w.title)}" title="Сделать ТЗ вариацией этого креатива">${cover(w.cover_id)}<span>${esc(w.title)}</span><small>${w.roi != null ? 'ROI ' + w.roi + '%' : ''}</small></button>`).join('')}</div>
        <p class="muted small">Нажмите на креатив — ТЗ станет его вариацией, ссылка добавится в референсы.</p></div>` : ''}
      ${ins.best.length ? `<div class="ins-block"><b>Кто лучше справится</b>${ins.best.map(c => `<div class="ins-who">${avatar(c.name, c.id, 'sm')}<span><b>${esc(c.name)}</b><small>${esc(c.why.join(' · '))}</small></span></div>`).join('')}</div>` : ''}`;
    $$('[data-tip]', side).forEach(b => b.onclick = () => { checklist.push(REASON_TIP[b.dataset.tip]); drawCl(); toast('Пункт добавлен в чек-лист'); });
    $$('[data-lib]', side).forEach(b => b.onclick = () => {
      preset.parent_library_id = +b.dataset.lib;
      f.refs.value = (f.refs.value ? f.refs.value + '\n' : '') + `${location.origin}/#/library?item=${b.dataset.lib} — ${b.dataset.title}`;
      $$('.ins-win', side).forEach(x => x.classList.toggle('on', x === b)); toast('ТЗ отмечено как вариация выбранного креатива');
    });
    checkDeadline();
  }
  f.creative_type.onchange = loadInsights; f.offer_id.onchange = loadInsights;
  loadInsights();
  f.onsubmit = run(async (e) => {
    e.preventDefault();
    const pending = $('#geo-in', f).value.trim(); if (pending) addGeo(pending);
    const body = { title: f.title.value, offer_id: +f.offer_id.value, creative_type: f.creative_type.value, quantity: +f.quantity.value, geo: geos.join(','),
      priority: f.priority.value, deadline: new Date(f.deadline.value).toISOString(), description: f.description.value, refs: f.refs.value,
      checklist: checklist.filter(c => c.trim()), template_id: f.template_id ? +f.template_id.value || null : undefined, parent_library_id: preset.parent_library_id || undefined };
    if (!body.offer_id) return toast('Выберите оффер', 'err');
    if (!geos.length) return toast('Добавьте хотя бы одно GEO', 'err');
    const btn = $('button.primary', f); btn.disabled = true;
    try {
      const saved = isEdit ? await api('PATCH', `/api/tasks/${t.id}`, body) : await api('POST', '/api/tasks', body);
      if (!isEdit && f.reffiles?.files.length) { const fd = new FormData(); [...f.reffiles.files].forEach(x => fd.append('files', x)); await api('POST', `/api/tasks/${saved.id}/files`, fd, true); }
      toast(isEdit ? 'ТЗ обновлено' : 'Задача создана — креативщики получили уведомление');
      closeModal(true); await refresh(); loadBadges(); openTask(saved.id);
    } finally { btn.disabled = false; }
  });
}

// ---------- assign (lead) with explained recommendation ----------
async function assignDialog(t, after) {
  const rec = await api('GET', `/api/recommend?type=${t.creative_type}&offer_id=${t.offer_id || 0}`);
  const ov = modal(`<form class="dialog"><h2>Назначить исполнителя · #${t.id}</h2>
    <p class="muted small">Порядок — по рекомендации: специализация, победы по офферу и типу, текущая загрузка.</p>
    <div class="pick">${rec.map((u, i) => `<label class="pickrow"><input type="radio" name="u" value="${u.id}" ${i === 0 ? 'checked' : ''}>${avatar(u.name, u.id)}
      <span><b>${esc(u.name)}</b><small>${esc(u.why.join(' · '))}</small></span>${i === 0 ? '<em class="rec-badge">рекомендуем</em>' : ''}</label>`).join('')}</div>
    <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">Назначить</button></div></form>`);
  $('form', ov).onsubmit = run(async (e) => { e.preventDefault(); await api('POST', `/api/tasks/${t.id}/assign`, { creative_id: +e.target.u.value }); await after('Исполнитель назначен и получил уведомление'); });
}

// ---------- revise: itemised revision list with reasons ----------
async function reviseDialog(t, action, after) {
  const full = await api('GET', `/api/tasks/${t.id}`);
  const last = full.versions.at(-1);
  const ov = modal(`<form class="dialog lg"><h2>${action === 'reopen' ? 'Переоткрыть задачу' : 'Отправить на правки'} · ${last ? 'v' + last.n : ''}</h2>
    ${last?.files.length ? `<div class="thumbs">${last.files.filter(x => x.mime.startsWith('image/')).slice(0, 4).map(x => `<img src="${fileUrl(x.id)}" alt="">`).join('')}</div>` : ''}
    <p class="muted small">Каждый пункт — отдельная задача для креативщика. Причина нужна для аналитики: руководитель увидит, каких деталей чаще не хватает в ТЗ.</p>
    <div id="rv-rows" class="rv-rows"></div><button type="button" class="btn ghost sm" id="rv-add">${I.plus} Ещё пункт</button>
    <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn warn">Отправить на правки</button></div></form>`);
  const rows = $('#rv-rows', ov);
  const add = (text = '', reason = 'other') => { rows.insertAdjacentHTML('beforeend', `<div class="rv-row"><input class="input" placeholder="Что поправить" value="${esc(text)}" aria-label="Пункт правок">
    <select class="input" aria-label="Причина">${Object.entries(REASONS).map(([k, v]) => `<option value="${k}" ${k === reason ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button type="button" class="btn ghost icon" aria-label="Удалить пункт">${I.x}</button></div>`); const r = rows.lastElementChild; $('button', r).onclick = () => r.remove(); $('input', r).focus(); };
  add(); $('#rv-add', ov).onclick = () => add();
  $('form', ov).onsubmit = run(async (e) => {
    e.preventDefault();
    const items = $$('.rv-row', rows).map(r => ({ text: $('input', r).value.trim(), reason: $('select', r).value })).filter(i => i.text);
    if (!items.length) return toast('Опишите хотя бы один пункт', 'err');
    await api('POST', `/api/tasks/${t.id}/${action}`, { items });
    await after('Правки отправлены исполнителю');
  });
}

// ---------- submit a version ----------
async function submitDialog(t, after) {
  const full = await api('GET', `/api/tasks/${t.id}`);
  const open = full.items.filter(i => !i.done), n = full.versions.length + 1;
  const services = S.services.filter(s => s.active);
  const ov = modal(`<form class="dialog lg" id="sf"><h2>Сдать версию v${n} · #${t.id}</h2>
    <label class="drop" id="drop" tabindex="0" role="button" aria-label="Выбрать файлы"><input type="file" name="files" multiple accept="image/*,video/*,.pdf,.zip" hidden>${I.download}<span><b>Перетащите файлы</b> или нажмите, чтобы выбрать<br><small class="muted">PNG, JPG, GIF, WEBP, MP4, WEBM, MOV, PDF, ZIP · до 15 МБ · до 8 файлов</small></span></label>
    <div id="flist" class="flist"></div>
    <label class="f"><span>Ссылки на результат (если файлы большие)</span><textarea class="input" name="links" rows="2" placeholder="https://drive.google.com/…"></textarea></label>
    <label class="f"><span>Комментарий для байера</span><textarea class="input" name="comment" rows="2"></textarea></label>
    ${open.length ? `<div class="f"><span>Что исправлено из правок</span>${open.map(i => `<label class="check"><input type="checkbox" value="${i.id}" checked data-item> ${esc(i.text)} <small class="muted">· ${REASONS[i.reason]}</small></label>`).join('')}</div>` : ''}
    ${full.checklist?.length ? `<div class="f"><span>Чек-лист ТЗ — проверьте перед сдачей</span>${full.checklist.map(c => `<label class="check"><input type="checkbox"> ${esc(c)}</label>`).join('')}</div>` : ''}
    <div class="f"><span>AI-сервисы, потраченные кредиты ${n > 1 ? '(учтутся как расходы на правки)' : ''}</span><div id="ai-rows" class="ai-rows"></div>
      <div class="row-between"><button type="button" class="btn ghost sm" id="ai-add">${I.plus} Сервис</button><b id="ai-sum" class="muted"></b></div></div>
    <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">Отправить на проверку</button></div></form>`);
  const f = $('#sf', ov), input = f.files;
  let files = [];
  const drawFiles = () => { $('#flist', f).innerHTML = files.map((x, i) => `<span class="fchip">${esc(x.name)} <small>${(x.size / 1048576).toFixed(1)} МБ</small><button type="button" data-rm="${i}" aria-label="Убрать">${I.x}</button></span>`).join('');
    $$('[data-rm]', f).forEach(b => b.onclick = () => { files.splice(+b.dataset.rm, 1); drawFiles(); }); };
  const addFiles = (list) => { for (const x of list) { if (x.size > 15 * 1048576) { toast(`${x.name}: больше 15 МБ`, 'err'); continue; } if (files.length < 8) files.push(x); } drawFiles(); };
  input.onchange = () => { addFiles(input.files); input.value = ''; };
  const drop = $('#drop', f);
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); };
  const sum = () => { const s = $$('.ai-row', f).reduce((a, r) => a + (+$('input', r).value || 0) * (services.find(x => x.id === +$('select', r).value)?.credit_usd || 0), 0); $('#ai-sum', f).textContent = s ? '≈ ' + usd(s) : ''; };
  const addAi = () => { $('#ai-rows', f).insertAdjacentHTML('beforeend', `<div class="ai-row"><select class="input" aria-label="Сервис">${services.map(s => `<option value="${s.id}">${esc(s.name)} · $${s.credit_usd}/кр.</option>`).join('')}</select>
    <input class="input" type="number" min="0" step="1" placeholder="Кредиты" aria-label="Кредиты"><button type="button" class="btn ghost icon" aria-label="Удалить">${I.x}</button></div>`);
    const r = $('#ai-rows', f).lastElementChild; $('button', r).onclick = () => { r.remove(); sum(); }; $('input', r).oninput = sum; $('select', r).onchange = sum; };
  addAi(); $('#ai-add', f).onclick = addAi;
  f.onsubmit = run(async (e) => {
    e.preventDefault();
    if (!files.length && !f.links.value.trim()) return toast('Прикрепите файл или ссылку', 'err');
    const fd = new FormData();
    files.forEach(x => fd.append('files', x));
    fd.append('links', f.links.value); fd.append('comment', f.comment.value);
    fd.append('ai_costs', JSON.stringify($$('.ai-row', f).map(r => ({ service_id: +$('select', r).value, credits: +$('input', r).value })).filter(c => c.credits > 0)));
    fd.append('done_items', JSON.stringify($$('[data-item]:checked', f).map(x => +x.value)));
    const btn = $('button.primary', f); btn.disabled = true; btn.textContent = 'Загрузка…';
    try { await api('POST', `/api/tasks/${t.id}/submit`, fd, true); } finally { btn.disabled = false; btn.textContent = 'Отправить на проверку'; }
    await after(`Версия v${n} отправлена на проверку`);
  });
}
