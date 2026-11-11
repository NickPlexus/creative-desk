// Task card (drawer): brief, lineage, launch result, versions + revision items, time, money, discussion, history
'use strict';
const mentionText = (p) => esc(p).replace(/@([a-z0-9_.-]{2,32})/gi, (m, l) => { const u = S.users.find(x => x.login === l.toLowerCase()); return u ? `<span class="mention">@${esc(u.name)}</span>` : m; });
const linkify = (s, mentions) => String(s ?? '').split(/(https?:\/\/[^\s<>"']+)/g).map((p, i) => i % 2
  ? `<a href="${esc(p)}" target="_blank" rel="noopener noreferrer">${esc(p.length > 70 ? p.slice(0, 68) + '…' : p)}</a>` : mentions ? mentionText(p) : esc(p)).join('');
const mentionify = (s) => linkify(s, true);

function media(f, big) {
  if (f.mime.startsWith('image/')) return `<a class="media" href="${fileUrl(f.id)}" target="_blank" rel="noopener" title="${esc(f.name)}"><img src="${fileUrl(f.id)}" alt="${esc(f.name)}" loading="lazy" decoding="async"></a>`;
  if (f.mime.startsWith('video/')) return `<div class="media"><video src="${fileUrl(f.id)}" controls preload="metadata" ${big ? '' : 'muted'}></video></div>`;
  return `<a class="fchip" href="${fileUrl(f.id, 1)}">${I.file} ${esc(f.name)} <small>${(f.size / 1048576).toFixed(1)} МБ</small></a>`;
}

let drawerVersion = null, compare = false;
async function openTask(id, keepVersion) {
  if (!id) return;
  let t; try { t = await api('GET', `/api/tasks/${id}`); } catch (e) { return toast(e.message, 'err'); }
  if (!keepVersion) { drawerVersion = t.versions.at(-1)?.n || null; compare = false; }
  const prevScroll = keepVersion ? ($('.drawer')?.scrollTop || 0) : 0;
  const ro = !!t.readonly;
  const me = S.me, moves = allowedMoves(t), owner = me.role === 'lead' || t.buyer_id === me.id, mine = t.creative_id === me.id;
  const A = { assign: ['primary', 'Назначить исполнителя'], take: ['primary', 'Взять в работу'], submit: ['primary', t.versions.length ? `Сдать v${t.versions.length + 1}` : 'Сдать результат'],
    accept: ['ok', 'Принять работу'], revise: ['warn', 'На правки'], reopen: ['', 'Переоткрыть'], release: ['ghost', 'Вернуть в очередь'] };
  const myTimer = t.time.find(x => x.user_id === me.id && x.running);
  const btns = Object.values(moves).sort((a, b) => (a === 'release') - (b === 'release')).map(a => `<button class="btn ${A[a][0]}" data-act="${a}">${A[a][1]}</button>`);
  if (mine && ['in_progress', 'revision'].includes(t.status)) btns.splice(1, 0, `<button class="btn ${myTimer ? 'rec-on' : ''}" id="timer">${myTimer ? I.pause + ' Пауза' : I.play + ' Начать работу'}</button>`);
  if (t.library_id && me.role !== 'creative') btns.push(`<button class="btn" id="variation">${I.loop} Сделать вариации</button>`);
  const more = [];
  if (owner && (t.status !== 'done' || me.role === 'lead')) more.push(`<button class="btn ghost sm" id="edit">Редактировать</button>`);
  if (me.role === 'lead' || (t.buyer_id === me.id && t.status === 'new')) more.push(`<button class="btn ghost sm danger-t" id="del">Удалить</button>`);
  more.push(`<button class="btn ghost sm" id="copy">${I.link} Ссылка</button>`);

  // money & time
  const aiUsd = t.ai_costs.reduce((s, c) => s + c.usd, 0), aiRev = t.ai_costs.filter(c => c.round > 0).reduce((s, c) => s + c.usd, 0);
  const workH = t.work_sec / 3600, labor = t.labor_usd || 0;
  const byService = Object.entries(t.ai_costs.reduce((m, c) => (m[c.service] = (m[c.service] || 0) + c.usd, m), {})).sort((a, b) => b[1] - a[1]);
  const nowIso = new Date().toISOString();
  const steps = [['Создана', t.created_at], ['Взята', t.taken_at], ['Первая версия', t.first_submitted_at], ['Принята', t.completed_at]];
  const v = t.versions.find(x => x.n === drawerVersion) || t.versions.at(-1);
  const prev = v && t.versions.find(x => x.n === v.n - 1);
  const itemsFor = (vid) => t.items.filter(i => i.version_id === vid);
  const canToggle = me.role === 'lead' || mine || t.buyer_id === me.id;
  const imgs = (ver) => ver ? ver.files.filter(f => f.mime.startsWith('image/')) : [];

  modal(`<div class="drawer" role="document" data-task="${t.id}">
    <header class="drawer-head">
      <div class="row1">#${t.id} ${stTag(t.status)} ${prioTag(t.priority)} ${riskTag(t)} ${t.library_status ? libTag(t.library_status) : ''}
        <span class="spacer"></span>${more.join('')}<button class="btn ghost icon" data-x aria-label="Закрыть">${I.x}</button></div>
      <h2>${esc(t.title)}</h2>
      ${btns.length ? `<div class="drawer-actions">${btns.join('')}</div>` : ''}
    </header>
    <div class="drawer-body">
      ${t.parent || t.variations.length ? `<section class="lineage">
        ${t.parent ? `<button class="lin-parent" data-open="${t.parent.task_id}">${cover(t.parent.cover_id, 'lin-cover')}<span><small>Вариация креатива</small><b>${esc(t.parent.title)}</b>${libTag(t.parent.status)}</span>${I.arrow}</button>` : ''}
        ${t.variations.length ? `<div class="lin-kids"><small>${I.loop} По этому креативу сделано вариаций: ${t.variations.length}, победителей: ${t.variations.filter(x => x.library_status === 'winner').length}</small>
          ${t.variations.map(x => `<button class="chip" data-open="${x.id}">#${x.id} ${esc(x.title.replace(/^Вариации: /, ''))} ${x.library_status ? LIB_ICON[x.library_status] : '· ' + STATUS[x.status]}</button>`).join('')}</div>` : ''}
      </section>` : ''}

      ${ro ? `<div class="note">${I.lib} Креатив другого байера из библиотеки — показана принятая версия и результат запуска. Детали работы видны автору ТЗ и руководителю.</div>` : ''}
      ${t.library_id ? resultPanel(t, owner) : ''}

      <section class="panel"><h3>${ico('doc')}Техническое задание</h3>
        <div class="kv">
          <div><small>Оффер</small><b>${esc(t.offer_name || '—')}</b></div><div><small>GEO</small><b>${esc(t.geo)}</b></div>
          <div><small>Тип · количество</small><b>${TYPES[t.creative_type]} × ${t.quantity}</b></div>
          <div><small>Байер</small><b>${esc(t.buyer_name)}</b></div><div><small>Исполнитель</small><b>${esc(t.creative_name || '—')}</b></div>
          <div><small>Дедлайн</small><b>${deadlineText(t)}</b></div>
        </div>
        ${t.description ? `<div class="desc">${linkify(t.description)}</div>` : ''}
        ${t.checklist?.length ? `<div class="sub"><small>Чек-лист требований</small><ul class="cl">${t.checklist.map(c => `<li>${I.check}${esc(c)}</li>`).join('')}</ul></div>` : ''}
        ${t.refs ? `<div class="sub"><small>Референсы</small><div class="desc">${linkify(t.refs)}</div></div>` : ''}
        ${t.ref_files.length ? `<div class="files">${t.ref_files.map(f => media(f)).join('')}</div>` : ''}
      </section>

      <section class="panel"><h3>${ico('file')}Версии <span class="extra">${t.versions.length ? t.versions.length + ' шт.' : ''}</span></h3>
        ${t.versions.length ? `<div class="vtabs">${t.versions.map(x => `<button class="vtab ${x.n === v.n ? 'on' : ''} vs-${x.status}" data-v="${x.n}">v${x.n}<small>${x.status === 'accepted' ? '✓ принята' : x.status === 'revision' ? 'правки' : 'на проверке'}</small></button>`).join('')}
          ${prev && imgs(v).length && imgs(prev).length ? `<button class="btn ghost sm" id="cmp">${compare ? 'Обычный вид' : 'Сравнить с v' + prev.n}</button>` : ''}</div>
          ${compare && prev ? `<div class="compare"><div><small>v${prev.n}</small>${imgs(prev).slice(0, 2).map(f => media(f)).join('')}</div><div><small>v${v.n}</small>${imgs(v).slice(0, 2).map(f => media(f)).join('')}</div></div>`
            : `<div class="gallery">${v.files.map(f => media(f, true)).join('') || '<span class="muted">Файлов нет — только ссылки</span>'}</div>`}
          <div class="vmeta">${avatar(v.user_name, v.user_id, 'sm')} <b>${esc(v.user_name)}</b> <span class="muted">${fmtDate(v.created_at)}</span>${v.comment ? `<p>${esc(v.comment)}</p>` : ''}
            ${v.links ? `<div class="files">${v.links.split('\n').filter(Boolean).map(l => `<a class="fchip" href="${safeUrl(l)}" target="_blank" rel="noopener noreferrer">${I.link} ${esc(l.replace(/^https?:\/\//, '').slice(0, 40))}</a>`).join('')}</div>` : ''}</div>
          ${itemsFor(v.id).length ? `<div class="items"><small>Правки к v${v.n}</small>${itemsFor(v.id).map(i => `<label class="item ${i.done ? 'done' : ''}"><input type="checkbox" data-item="${i.id}" ${i.done ? 'checked' : ''} ${canToggle ? '' : 'disabled'}>
            <span>${esc(i.text)}<small>${REASONS[i.reason]}${i.done_at ? ' · исправлено ' + fmtDate(i.done_at) : ''}</small></span></label>`).join('')}</div>` : ''}`
          : empty(t.status === 'new' ? 'Задача ждёт исполнителя' : 'Исполнитель ещё не сдал первую версию', 'file')}
      </section>

      ${ro ? '' : `<section class="panel"><h3>${ico('clock')}Время</h3>
        <div class="timeline">${steps.map(([l, d]) => `<div class="step ${d ? 'on' : ''}"><i></i><b>${l}</b><span>${fmtDate(d)}</span></div>`).join('')}</div>
        <div class="durations">
          <div><small>Ожидание исполнителя</small><b>${fmtDur(hrs(t.created_at, t.taken_at || (t.status === 'new' ? nowIso : null)))}</b></div>
          <div><small>До первой версии</small><b>${fmtDur(hrs(t.taken_at, t.first_submitted_at))}</b></div>
          <div><small>Чистое время работы</small><b>${workH ? fmtDur(workH) : '—'}</b></div>
          <div><small>Цикл${t.completed_at ? '' : ' (идёт)'}</small><b>${fmtDur(hrs(t.created_at, t.completed_at || nowIso))}</b></div>
          <div><small>Кругов правок</small><b>${t.revisions}</b></div>
        </div>
        ${t.time.length ? `<p class="muted small">${t.time.map(x => `${esc(x.user_name)}: ${fmtDur(x.sec / 3600)}${x.running ? ' · <span class="rec-inline">идёт сейчас</span>' : ''}`).join(' · ')}</p>` : ''}
      </section>

      <section class="panel"><h3>${ico('money')}Стоимость креатива <span class="extra">${usd(aiUsd + labor)}</span></h3>
        <div class="money-grid"><div><small>AI-сервисы</small><b>${usd(aiUsd)}</b>${aiRev ? `<span class="muted small">из них на правки ${usd(aiRev)}</span>` : ''}</div>
          <div><small>Работа по таймеру (${workH ? fmtDur(workH) : '0 ч'})</small><b>${usd(labor)}</b></div>
          <div><small>Итого</small><b class="accent">${usd(aiUsd + labor)}</b>${t.quantity > 1 ? `<span class="muted small">${usd((aiUsd + labor) / t.quantity)} за единицу</span>` : ''}</div></div>
        ${byService.length ? `<div class="bars">${byService.map(([s, x]) => `<div class="bar"><span>${esc(s)}</span><div class="track"><i style="width:${x / aiUsd * 100}%"></i></div><span class="v">${usd(x)}</span></div>`).join('')}</div>` : ''}
        ${mine && ['in_progress', 'revision'].includes(t.status) ? `<form class="inline-form" id="aif"><select class="input" name="s" aria-label="Сервис">${S.services.filter(s => s.active).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
          <input class="input" name="c" type="number" min="1" placeholder="Кредиты" aria-label="Кредиты" required><button class="btn sm">${I.plus} Расход</button></form>` : ''}
      </section>

      <section class="panel"><h3>${ico('msg')}Обсуждение <span class="extra">${t.comments.length || ''}</span></h3>
        <div class="comments">${t.comments.map(c => `<div class="comment">${avatar(c.user_name, c.user_id, 'sm')}<div><b>${esc(c.user_name)}</b> <small class="muted">${ago(c.created_at)}</small><p>${mentionify(c.body)}</p></div></div>`).join('') || '<p class="muted small">Вопросы по задаче — здесь, а не в мессенджере. Упомяните коллегу через @, и он получит уведомление.</p>'}</div>
        <form id="cf" class="comment-form"><div class="mention-wrap"><textarea class="input" name="c" rows="2" placeholder="Комментарий… @ — упомянуть" required aria-label="Комментарий"></textarea><div class="mention-pop" hidden></div></div>
          <button class="btn primary sm">Отправить</button></form>
      </section>

      <section class="panel"><h3>${ico('history')}История</h3>
        <ul class="history">${t.history.slice().reverse().map(h => `<li>${avatar(h.user_name, h.user_id, 'sm')}<div><b>${esc(h.user_name)}</b> ${ACTIONS[h.action] || esc(h.action)}
          ${h.from_status && h.to_status ? `<span class="muted">${STATUS[h.from_status]} → ${STATUS[h.to_status]}</span>` : ''}
          ${h.action === 'result' ? (LIB[h.comment] ? libTag(h.comment) : '') : h.comment ? `<span class="c">${esc(h.comment)}</span>` : ''}</div><time>${fmtDate(h.created_at)}</time></li>`).join('')}</ul>
      </section>`}
    </div></div>`, 'side');

  const ov = $('.overlay');
  if (prevScroll) $('.drawer', ov).scrollTop = prevScroll;
  $$('[data-act]', ov).forEach(b => b.onclick = run(() => doAction(t, b.dataset.act)));
  $$('[data-open]', ov).forEach(b => b.onclick = () => openTask(+b.dataset.open));
  $$('.vtab', ov).forEach(b => b.onclick = () => { drawerVersion = +b.dataset.v; compare = false; openTask(t.id, true); });
  $('#cmp', ov) && ($('#cmp', ov).onclick = () => { compare = !compare; openTask(t.id, true); });
  $$('[data-item]', ov).forEach(c => c.onchange = run(async () => { S.dirty = true; await api('POST', `/api/items/${c.dataset.item}/toggle`); c.closest('.item').classList.toggle('done', c.checked); }));
  $('#timer', ov) && ($('#timer', ov).onclick = run(async () => {
    await api('POST', `/api/tasks/${t.id}/timer`, { action: myTimer ? 'stop' : 'start' });
    toast(myTimer ? 'Таймер на паузе' : 'Таймер запущен — время работы считается автоматически'); await loadTimer(); openTask(t.id, true);
  }));
  $('#variation', ov) && ($('#variation', ov).onclick = () => taskForm(null, { parent_library_id: t.library_id, offer_id: t.offer_id, creative_type: t.creative_type, geo: t.geo,
    title: 'Вариации: ' + t.title.replace(/^Вариации: /, ''), priority: 'high', quantity: 3,
    description: `Сделать вариации креатива «${t.title}» (#${t.id}).\nСохранить посыл и структуру, сменить хук и визуал.`, refs: `${location.origin}/#/task/${t.id}` }));
  $('#edit', ov) && ($('#edit', ov).onclick = () => taskForm(t));
  $('#del', ov) && ($('#del', ov).onclick = run(async () => {
    if (!(await confirmDialog('Удалить задачу?', 'Задача, версии и файлы будут удалены без возможности восстановления.', 'Удалить', true))) return;
    await api('DELETE', `/api/tasks/${t.id}`); toast('Задача удалена'); await refresh(); loadBadges();
  }));
  $('#copy', ov).onclick = () => { navigator.clipboard?.writeText(`${location.origin}/#/task/${t.id}`).then(() => toast('Ссылка скопирована'), () => toast('Не удалось скопировать', 'err')); };
  $('#aif', ov) && ($('#aif', ov).onsubmit = run(async (e) => { e.preventDefault(); await api('POST', `/api/tasks/${t.id}/ai-costs`, { service_id: +e.target.s.value, credits: +e.target.c.value }); toast('Расход добавлен'); S.dirty = true; openTask(t.id, true); }));
  bindResult(ov, t);
  $('#cf', ov) && bindMentions($('#cf', ov));
  $('#cf', ov) && ($('#cf', ov).onsubmit = run(async (e) => { e.preventDefault(); await api('POST', `/api/tasks/${t.id}/comments`, { body: e.target.c.value }); S.dirty = true; openTask(t.id, true); }));
}

// launch result: status + metrics, editable by the buyer who launched it
function resultPanel(t, owner) {
  return `<section class="panel result-panel lib-b-${t.library_status}"><h3>${ico('target')}Результат запуска
      <span class="extra">${owner ? 'отметьте после теста — это увидят креативщик и аналитика' : 'отмечает байер'}</span></h3>
    <div class="res-status" role="radiogroup">${Object.keys(LIB).map(s => `<button class="res-btn lib-${s} ${t.library_status === s ? 'on' : ''}" data-st="${s}" ${owner ? '' : 'disabled'} role="radio" aria-checked="${t.library_status === s}">${LIB_ICON[s]} ${LIB[s]}</button>`).join('')}</div>
    <form class="metrics" id="mf"><label class="f"><span>Spend, $</span><input class="input" name="spend" type="number" step="1" min="0" ${owner ? '' : 'disabled'}></label>
      <label class="f"><span>CTR, %</span><input class="input" name="ctr" type="number" step="0.01" min="0" max="100" ${owner ? '' : 'disabled'}></label>
      <label class="f"><span>CR, %</span><input class="input" name="cr" type="number" step="0.01" min="0" max="100" ${owner ? '' : 'disabled'}></label>
      <label class="f"><span>ROI, %</span><input class="input" name="roi" type="number" step="1" min="-100" ${owner ? '' : 'disabled'}></label>
      ${owner ? '<button class="btn sm">Сохранить метрики</button>' : ''}</form></section>`;
}
function bindResult(ov, t) {
  const f = $('#mf', ov); if (!f) return;
  const lib = t.library;
  if (lib) ['spend', 'ctr', 'cr', 'roi'].forEach(k => { if (lib[k] != null) f[k].value = lib[k]; });
  $$('.res-btn', ov).forEach(b => b.onclick = run(async () => {
    await api('PATCH', `/api/library/${t.library_id}`, { status: b.dataset.st }); S.dirty = true;
    toast(b.dataset.st === 'winner' ? '🏆 Отмечено как победитель — креативщик получил уведомление' : 'Результат сохранён'); openTask(t.id, true); loadBadges();
  }));
  f.onsubmit = run(async (e) => { e.preventDefault(); await api('PATCH', `/api/library/${t.library_id}`, { spend: f.spend.value, ctr: f.ctr.value, cr: f.cr.value, roi: f.roi.value }); toast('Метрики сохранены'); S.dirty = true; });
}

// @mention autocomplete
function bindMentions(form) {
  const ta = $('textarea', form), pop = $('.mention-pop', form);
  let matches = [], idx = 0;
  const close = () => { pop.hidden = true; matches = []; };
  ta.addEventListener('input', () => {
    const m = ta.value.slice(0, ta.selectionStart).match(/@([a-zа-яё0-9_.-]*)$/i);
    if (!m) return close();
    const q = m[1].toLowerCase();
    matches = S.users.filter(u => u.active && u.id !== S.me.id && (u.login.includes(q) || u.name.toLowerCase().includes(q))).slice(0, 6);
    idx = 0;
    if (!matches.length) return close();
    pop.innerHTML = matches.map((u, i) => `<button type="button" class="${i === idx ? 'on' : ''}" data-l="${esc(u.login)}">${avatar(u.name, u.id, 'sm')}${esc(u.name)}<small>${ROLES[u.role]}</small></button>`).join('');
    pop.hidden = false;
    $$('button', pop).forEach(b => b.onmousedown = (e) => { e.preventDefault(); pick(b.dataset.l); });
  });
  const pick = (login) => { const pos = ta.selectionStart, before = ta.value.slice(0, pos).replace(/@[^\s@]*$/, '@' + login + ' '); ta.value = before + ta.value.slice(pos); ta.selectionStart = ta.selectionEnd = before.length; close(); ta.focus(); };
  ta.addEventListener('keydown', (e) => {
    if (pop.hidden) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; $$('button', pop).forEach((b, i) => b.classList.toggle('on', i === idx)); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[idx].login); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  ta.addEventListener('blur', () => setTimeout(close, 150));
}
