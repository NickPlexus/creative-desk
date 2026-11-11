// Pages: My day, Library, Team, Settings
'use strict';
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; };
const firstName = (n) => String(n).split(' ')[0];
const kpi = (label, value, sub, icon, color, link) => `<${link ? `a href="${link}"` : 'div'} class="kpi" style="--kc:${color}"><span class="ki">${I[icon]}</span><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</${link ? 'a' : 'div'}>`;
function miniTask(t, extra = '') {
  return `<div class="mini" role="button" tabindex="0" data-open="${t.id}">${t.cover_id ? cover(t.cover_id, 'mini-cover') : `<span class="mini-dot st-${t.status}"></span>`}
    <span class="mini-body"><b>${esc(t.title)}</b><small>#${t.id} · ${esc(t.offer_name || '')} · ${esc(t.geo)} ${t.open_items ? `· <span class="warn-t">${t.open_items} п. правок</span>` : ''}</small></span>
    <span class="mini-side">${riskTag(t)}${deadlineText(t)}${extra}</span></div>`;
}
function bindOpen(root) {
  $$('[data-open]', root).forEach(b => {
    b.onclick = (e) => { if (e.target.closest('[data-stop]')) return; openTask(+b.dataset.open); };
    if (b.tagName !== 'BUTTON') b.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); openTask(+b.dataset.open); } };
  });
}

// ---------- My day ----------
Pages.home = async (view) => {
  const d = await api('GET', '/api/home'), me = S.me;
  const head = (sub) => `<div class="hello"><div><h2>${greet()}, ${esc(firstName(me.name))}</h2><p class="muted">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })} · ${sub}</p></div>
    ${me.role !== 'creative' ? `<button class="btn primary" id="h-new">${I.plus} Новое ТЗ <kbd>N</kbd></button>` : ''}</div>`;
  if (me.role === 'creative') {
    const st = d.stats;
    view.innerHTML = head(d.queue.length ? `в работе ${d.queue.length}, на проверке ${d.review.length}` : 'свободных рук — самое время взять задачу') + `
      <div class="kpis k4">${kpi('В работе', d.queue.length, d.queue.filter(t => t.status === 'revision').length ? `из них правки: ${d.queue.filter(t => t.status === 'revision').length}` : 'включая правки', 'board', '#1d7af0', '#/tasks?mine=1')}
        ${kpi('Дедлайн в ближайшие 24 ч', st.due_today, st.due_today ? 'не забудьте про сроки' : 'всё под контролем', 'clock', st.due_today ? '#e5484d' : '#16a374')}
        ${kpi('Победителей', st.wins, st.win_rate != null ? `win rate ${st.win_rate}%` : 'ещё нет оценённых', 'trophy', '#d97706', `#/library?creative_id=${me.id}&status=winner`)}
        ${kpi('Часов за неделю', fmtDur(st.hours_week), `сдано за 7 дней: ${st.done_week}`, 'clock', '#9b51e0')}</div>
      <div class="home-grid">
        <section class="panel"><h3>${ico('board')}Моя очередь <span class="extra">по дедлайну</span></h3>
          <div class="mini-list">${d.queue.map(t => miniTask(t, S.timer?.task_id === t.id ? '<i class="rec" title="Таймер идёт"></i>' : '')).join('') || empty('Нет задач в работе — возьмите свободную справа')}</div>
          ${d.review.length ? `<h4 class="sub-h">Ждут проверки байера</h4><div class="mini-list">${d.review.map(t => miniTask(t)).join('')}</div>` : ''}</section>
        <section class="panel"><h3>${ico('plus')}Свободные задачи <span class="extra">профильные — сверху</span></h3>
          <div class="mini-list">${d.free.map(t => miniTask(t, `<button class="btn sm primary" data-stop data-take="${t.id}">Взять</button>`)).join('') || empty('Очередь пуста')}</div></section>
        <section class="panel wide"><h3>${ico('trophy')}Как сработали ваши креативы <span class="extra">байеры отмечают результат после запуска</span></h3>
          <div class="lib-row">${d.results.map(l => `<button class="lib-mini" data-open="${l.task_id}">${cover(l.cover_id)}${libTag(l.status)}<span>${esc(l.title)}</span>${l.roi != null ? `<small>ROI ${l.roi}%</small>` : ''}</button>`).join('') || empty('Результатов пока нет — они появятся после запуска ваших креативов', 'target')}</div></section>
      </div>`;
    $$('[data-take]', view).forEach(b => b.onclick = run(async () => { await api('POST', `/api/tasks/${b.dataset.take}/take`); toast('Задача взята в работу'); await refresh(); loadBadges(); openTask(+b.dataset.take); }));
  } else {
    const lead = me.role === 'lead';
    view.innerHTML = head(d.review.length ? `${d.review.length} ${d.review.length === 1 ? 'работа ждёт' : 'работ ждут'} вашей проверки` : 'проверок в очереди нет') + `
      ${lead && d.alerts.length ? `<section class="alerts">${d.alerts.map(a => `<a class="alert ${esc(a.level)}" href="${esc(a.link)}">${I[a.level === 'info' ? 'target' : 'alert']}<span>${esc(a.text)}</span>${I.arrow}</a>`).join('')}</section>` : ''}
      <div class="kpis k4">${kpi('Ждут проверки', d.review.length, 'примите или верните на правки', 'check', '#9b51e0', '#/tasks?status=review')}
        ${kpi('В работе', d.counts.in_progress + d.counts.revision, `новых в очереди: ${d.counts.new}`, 'board', '#1d7af0', '#/tasks')}
        ${kpi('Без результата запуска', d.needs_result_count, 'отметьте, как сработали', 'target', d.needs_result_count ? '#d97706' : '#16a374', '#/library?status=needs_result')}
        ${kpi('Риск срыва сроков', d.at_risk.length, d.at_risk.length ? 'проверьте загрузку' : 'всё идёт по плану', 'alert', d.at_risk.length ? '#e5484d' : '#16a374', '#/tasks?risk=1')}</div>
      <div class="home-grid">
        <section class="panel"><h3>${ico('check')}Ждут вашей проверки</h3><div class="mini-list">${d.review.map(t => miniTask(t, `<span class="muted small">${esc(t.creative_name || '')}</span>`)).join('') || empty('Всё проверено 👌', 'check')}</div></section>
        <section class="panel"><h3>${ico('target')}Как сработали креативы? <span class="extra">запущены больше 2 дней назад</span></h3>
          <div class="mini-list">${d.needs_result.map(l => `<div class="mini res-quick" role="button" tabindex="0" data-open="${l.task_id}">${cover(l.cover_id, 'mini-cover')}<span class="mini-body"><b>${esc(l.title)}</b><small>${esc(l.creative_name || '')} · ${LIB[l.status]}</small></span>
            <span class="mini-side quick" data-stop>${['winner', 'average', 'burned'].map(s => `<button class="res-btn sm lib-${s}" data-lib="${l.id}" data-st="${s}" title="${LIB[s]}">${LIB_ICON[s]}</button>`).join('')}</span></div>`).join('') || empty('Все результаты отмечены', 'target')}</div>
          <p class="muted small">Ваша отметка сразу попадает креативщику и в аналитику win rate — так отдел понимает, какие подходы работают.</p></section>
        ${lead ? `<section class="panel"><h3>${ico('users')}Загрузка команды</h3><div class="bars">${d.team.map(m => `<a class="bar" href="#/tasks?creative_id=${m.id}"><span>${esc(m.name)}</span>
            <div class="track"><i style="width:${Math.min(100, (m.active + m.review) * 20)}%;${m.active >= 4 ? 'background:var(--danger)' : ''}"></i></div><span class="v">${m.active} + ${m.review}</span></a>`).join('')}</div>
            <p class="muted small">В работе + на проверке. Нажмите на человека, чтобы открыть его задачи.</p></section>
          <section class="panel"><h3>${ico('spark')}AI-бюджеты месяца</h3><div class="bars">${d.budgets.filter(b => b.budget).map(b => budgetBar(b)).join('')}</div>
            <a class="more-link" href="#/analytics?tab=money">Подробнее о расходах ${I.arrow}</a></section>` : ''}
        ${d.at_risk.length ? `<section class="panel ${lead ? 'wide' : ''}"><h3>${ico('alert')}Риск срыва сроков</h3><div class="mini-list">${d.at_risk.map(t => miniTask(t, `<span class="muted small">${esc(t.creative_name || 'не назначен')}</span>`)).join('')}</div></section>` : ''}
        <section class="panel wide"><h3>${ico('trophy')}Свежие победители <span class="extra">идеи для новых ТЗ</span></h3>
          <div class="lib-row">${d.winners.map(l => `<div class="lib-mini">${cover(l.cover_id)}${libTag('winner')}<span>${esc(l.title)}</span><small>${esc(l.creative_name || '')}</small>
            <div class="lib-mini-act"><button class="btn sm" data-open="${l.task_id}">Открыть</button><button class="btn sm primary" data-var="${l.task_id}">${I.loop} Вариации</button></div></div>`).join('') || empty('Победителей пока нет', 'trophy')}</div></section>
      </div>`;
    $$('[data-lib]', view).forEach(b => b.onclick = run(async (e) => { e.stopPropagation(); await api('PATCH', `/api/library/${b.dataset.lib}`, { status: b.dataset.st }); toast(`Отмечено: ${LIB[b.dataset.st]}`); await refresh(); loadBadges(); }));
    $$('[data-var]', view).forEach(b => b.onclick = run(async (e) => { e.stopPropagation(); await openTask(+b.dataset.var); $('#variation')?.click(); }));
  }
  $('#h-new') && ($('#h-new').onclick = () => taskForm());
  bindOpen(view);
};
function budgetBar(b) {
  const p = Math.min(100, b.used / b.budget * 100), f = Math.min(130, b.forecast / b.budget * 100), over = b.forecast > b.budget;
  return `<div class="bar budget" title="Потрачено ${num(b.used)} из ${num(b.budget)} кр. Прогноз к концу месяца: ${num(b.forecast)}"><span>${esc(b.name)}</span>
    <div class="track"><i style="width:${p}%;${over ? 'background:var(--warn)' : ''}"></i><em class="fc" style="left:${Math.min(f, 100)}%"></em></div>
    <span class="v ${over ? 'warn-t' : ''}">${Math.round(p)}%</span></div>`;
}

// ---------- Library ----------
Pages.library = async (view, params) => {
  if (params.get('item')) { const all = await api('GET', '/api/library'); const it = all.find(x => x.id === +params.get('item')); if (it) setTimeout(() => openTask(it.task_id), 30); }
  const qs = new URLSearchParams(); ['status', 'offer_id', 'type', 'creative_id', 'buyer_id', 'q', 'sort', 'geo'].forEach(k => params.get(k) && qs.set(k, params.get(k)));
  const [items, all] = await Promise.all([api('GET', '/api/library?' + qs), api('GET', '/api/library')]);
  const set = (k, v) => { const p = new URLSearchParams(params); p.delete('item'); v ? p.set(k, v) : p.delete(k); go('#/library' + (p.toString() ? '?' + p : '')); };
  const cnt = (s) => all.filter(x => x.status === s).length, rated = cnt('winner') + cnt('average') + cnt('burned');
  const cur = params.get('status') || '';
  const tabs = [['', 'Все', all.length], ['winner', '🏆 Победители', cnt('winner')], ['testing', 'В тесте', cnt('testing')], ['pending', 'Не запущены', cnt('pending')],
    ['average', 'Средние', cnt('average')], ['burned', 'Выгорели', cnt('burned')], ...(S.me.role !== 'creative' ? [['needs_result', 'Нужна отметка', null]] : [])];
  view.innerHTML = `
    <div class="lib-summary"><div><b>${rated ? Math.round(cnt('winner') / rated * 100) : 0}%</b><small>win rate отдела</small></div>
      <div><b>${all.length}</b><small>креативов в библиотеке</small></div><div><b>${all.reduce((s, x) => s + x.variations, 0)}</b><small>вариаций по победителям</small></div>
      <p class="muted small">Сюда автоматически попадает каждая принятая работа. Байер отмечает результат запуска, и удачный креатив можно в один клик превратить в новое ТЗ на вариации.</p></div>
    <div class="toolbar"><div class="seg scroll">${tabs.map(([k, l, n]) => `<button data-st="${k}" class="${cur === k ? 'on' : ''}">${l}${n != null ? ` <small>${n}</small>` : ''}</button>`).join('')}</div>
      <label class="search">${I.search}<input class="input" id="lq" placeholder="Название, оффер, тег" value="${esc(params.get('q') || '')}" aria-label="Поиск"></label>
      <select class="input" data-f="offer_id" aria-label="Оффер"><option value="">Все офферы</option>${S.offers.map(o => `<option value="${o.id}" ${+params.get('offer_id') === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
      <select class="input" data-f="type" aria-label="Тип"><option value="">Все типы</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${params.get('type') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="input" data-f="creative_id" aria-label="Автор"><option value="">Все авторы</option>${S.users.filter(u => u.role === 'creative').map(u => `<option value="${u.id}" ${+params.get('creative_id') === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <select class="input" data-f="sort" aria-label="Сортировка"><option value="">Сначала победители</option><option value="roi" ${params.get('sort') === 'roi' ? 'selected' : ''}>По ROI</option></select></div>
    <div class="lib-grid">${items.map(l => `<article class="lib-card" data-open="${l.task_id}" tabindex="0">
        <div class="lib-img">${cover(l.cover_id)}${libTag(l.status)}${l.files_count > 1 ? `<span class="lib-count">${l.files_count} файла</span>` : ''}</div>
        <div class="lib-body"><b>${esc(l.title)}</b><small>${esc(l.offer_name || '')} · ${esc(l.geo)} · ${TYPES[l.creative_type]}</small>
          <div class="lib-meta">${avatar(l.creative_name, l.creative_id, 'sm')}<span>${esc(l.creative_name || '')}</span>
            ${l.roi != null ? `<b class="${l.roi >= 0 ? 'ok-t' : 'danger-t'}">ROI ${l.roi > 0 ? '+' : ''}${l.roi}%</b>` : ''}</div>
          ${l.ctr != null ? `<div class="lib-metrics"><span>CTR ${l.ctr}%</span><span>CR ${l.cr ?? '—'}%</span><span>${usd(l.spend)}</span></div>` : ''}
          ${l.variations ? `<div class="lib-var">${I.loop} вариаций: ${l.variations}${l.variation_wins ? `, побед: ${l.variation_wins} 🏆` : ''}</div>` : ''}
          ${l.parent_library_id ? `<div class="lib-var muted">↳ вариация другого креатива</div>` : ''}
          ${l.tags ? `<div class="lib-tags">${l.tags.split(',').map(x => `<span class="tag">#${esc(x.trim())}</span>`).join('')}</div>` : ''}
        </div>
        ${S.me.role !== 'creative' ? `<button class="btn sm lib-act" data-var="${l.task_id}" data-stop title="Создать ТЗ на вариации">${I.loop} Вариации</button>` : ''}
      </article>`).join('') || empty('Под фильтр ничего не попало', 'lib')}</div>`;
  $$('.seg button', view).forEach(b => b.onclick = () => set('status', b.dataset.st));
  $$('[data-f]', view).forEach(s => s.onchange = () => set(s.dataset.f, s.value));
  let lq; $('#lq').oninput = (e) => { clearTimeout(lq); lq = setTimeout(() => set('q', e.target.value.trim()), 350); };
  $$('[data-var]', view).forEach(b => b.onclick = run(async (e) => { e.stopPropagation(); await openTask(+b.dataset.var); $('#variation')?.click(); }));
  $$('.lib-card', view).forEach(c => c.onkeydown = (e) => { if (e.key === 'Enter') openTask(+c.dataset.open); });
  bindOpen(view);
};

// ---------- Team ----------
Pages.team = async (view, params) => {
  const { users, load } = await api('GET', '/api/team');
  const focus = +params.get('user');
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
  const key = (d) => d.toISOString().slice(0, 10);
  const creatives = users.filter(u => u.role === 'creative');
  const cell = (uid, d) => load.filter(x => x.id === uid && x.d === key(d)).reduce((s, x) => s + x.n, 0);
  const member = (u) => {
    const link = u.role === 'creative' ? `#/tasks?creative_id=${u.id}` : u.role === 'buyer' ? `#/tasks?buyer_id=${u.id}` : '#/analytics';
    return `<a class="member ${focus === u.id ? 'focus' : ''}" href="${link}" id="m-${u.id}">
      <div class="m-top">${avatar(u.name, u.id, 'lg')}<div><b>${esc(u.name)}</b><small>${ROLES[u.role]} · ${u.last_active ? 'активность ' + ago(u.last_active) : 'нет активности'}</small></div></div>
      ${u.specialization ? `<div class="m-spec">${u.specialization.split(',').map(s => `<span class="tag">${TYPES[s] || esc(s)}</span>`).join('')}</div>` : ''}
      <div class="m-stats"><div><b>${u.active_n}</b><small>в работе</small></div><div><b>${u.done_n}</b><small>готово</small></div>
        <div><b class="${u.late_n ? 'danger-t' : ''}">${u.late_n}</b><small>просрочено</small></div><div><b>${u.win_rate != null ? u.win_rate + '%' : '—'}</b><small>win rate</small></div></div>
      ${u.role === 'creative' ? `<small class="muted">Часов за неделю: ${fmtDur(u.hours_week)}</small>` : ''}</a>`;
  };
  const group = (role, title) => { const list = users.filter(u => u.role === role); return list.length ? `<h3 class="grp">${title}<span>${list.length}</span></h3><div class="team-grid">${list.map(member).join('')}</div>` : ''; };
  view.innerHTML = `<section class="panel"><h3>${ico('cal')}Дедлайны креативщиков на 2 недели <span class="extra">чем темнее — тем плотнее</span></h3>
      <div class="table-wrap"><table class="heat-tbl"><thead><tr><th></th>${days.map(d => `<th class="${[0, 6].includes(d.getDay()) ? 'we' : ''}">${d.getDate()}<small>${d.toLocaleDateString('ru-RU', { weekday: 'short' })}</small></th>`).join('')}</tr></thead>
      <tbody>${creatives.map(u => `<tr><th>${esc(u.name)}</th>${days.map(d => { const n = cell(u.id, d); return `<td><a href="#/tasks?view=calendar&creative_id=${u.id}" class="hc h${Math.min(n, 4)}" title="${n} дедлайн(ов)">${n || ''}</a></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">Помогает назначать задачи без перегруза: свободные дни видны сразу.</p></section>
    ${group('lead', 'Руководство')}${group('creative', 'Креативщики')}${group('buyer', 'Медиабайеры')}`;
  if (focus) $('#m-' + focus)?.scrollIntoView({ block: 'center' });
};

// ---------- Personal settings ----------
Pages.settings = async (view) => {
  const p = S.me.prefs || {}, n = { created: true, take: true, assign: true, submit: true, revise: true, accept: true, comment: true, mention: true, result: true, budget: true, edited: true, release: true, ...(p.notify || {}) };
  const fx = (() => { try { return localStorage.getItem('cd_fx') || 'auto'; } catch { return 'auto'; } })();
  const NT = [['created', 'Новые ТЗ по моей специализации', ['creative']], ['assign', 'Меня назначили исполнителем', ['creative']], ['revise', 'Работу вернули на правки', ['creative']],
    ['accept', 'Работу приняли', ['creative']], ['result', 'Байер отметил результат моего креатива', ['creative']], ['take', 'Креативщик взял мою задачу', ['buyer', 'lead']],
    ['submit', 'Сдана версия на проверку', ['buyer', 'lead']], ['comment', 'Комментарии в моих задачах', null], ['mention', 'Меня упомянули через @', null],
    ['edited', 'Изменилось ТЗ моей задачи', ['creative']], ['budget', 'AI-бюджет подходит к лимиту', ['lead']]].filter(x => !x[2] || x[2].includes(S.me.role));
  const seg = (name, cur, opts) => `<div class="seg" data-pref="${name}">${opts.map(([k, l]) => `<button type="button" data-v="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  view.innerHTML = `<div class="set-grid">
    <section class="panel"><h3>${ico('user')}Профиль</h3>
      <div class="prof">${avatar(S.me.name, S.me.id, 'lg')}<div><b>${esc(S.me.name)}</b><small>${ROLES[S.me.role]} · логин ${esc(S.me.login)}</small></div></div>
      <form id="pf" class="stack"><label class="f"><span>Имя и фамилия</span><input class="input" name="name" value="${esc(S.me.name)}" required minlength="2" maxlength="60"></label>
        <button class="btn sm">Сохранить имя</button></form></section>
    <section class="panel"><h3>${ico('shield')}Пароль</h3>
      <form id="pw" class="stack"><label class="f"><span>Текущий пароль</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
        <label class="f"><span>Новый пароль (от 6 символов)</span><input class="input" type="password" name="next" autocomplete="new-password" required minlength="6"></label>
        <button class="btn sm">Сменить пароль</button><small class="muted">После смены вы останетесь в системе, остальные сессии будут завершены.</small></form></section>
    <section class="panel"><h3>${ico('moon')}Внешний вид</h3>
      <div class="setrow"><div><b>Тема</b><small>Системная — как в настройках устройства</small></div>${seg('theme', p.theme || 'system', [['system', 'Системная'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div>
      <div class="setrow"><div><b>Плотность</b><small>Компактная вмещает больше карточек на экран</small></div>${seg('density', p.density || 'normal', [['normal', 'Обычная'], ['compact', 'Компактная']])}</div>
      <div class="setrow"><div><b>Акцентный цвет</b></div><div class="swatches">${Object.entries(ACCENTS).map(([k, c]) => `<button type="button" class="sw ${(p.accent || 'violet') === k ? 'on' : ''}" data-acc="${k}" aria-label="${k}" style="background:linear-gradient(135deg,${c ? c[0] : '#7b5cff'},${c ? c[1] : '#22b8f0'})"></button>`).join('')}</div></div>
      <div class="setrow"><div><b>Эффекты</b><small>Облегчённый режим отключает размытие и анимации — для слабых компьютеров</small></div>
        <div class="seg" id="fx">${[['auto', 'Авто'], ['high', 'Полные'], ['low', 'Облегчённые']].map(([k, l]) => `<button type="button" data-v="${k}" class="${fx === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></section>
    <section class="panel"><h3>${ico('bell')}Уведомления <span class="extra">сохраняются в профиле</span></h3>
      ${NT.map(([k, l]) => `<div class="setrow"><div><b>${l}</b></div><label class="switch"><input type="checkbox" data-n="${k}" ${n[k] ? 'checked' : ''}><i></i></label></div>`).join('')}</section>
    <section class="panel wide"><h3>${ico('spark')}Горячие клавиши</h3><div class="keys">
      <div><kbd>Ctrl</kbd>+<kbd>K</kbd> или <kbd>/</kbd><span>Поиск и команды</span></div>${S.me.role !== 'creative' ? '<div><kbd>N</kbd><span>Новое ТЗ</span></div>' : ''}
      <div><kbd>Esc</kbd><span>Закрыть окно</span></div><div><kbd>Ctrl</kbd>+<kbd>Enter</kbd><span>Отправить комментарий</span></div><div><kbd>@</kbd><span>Упомянуть коллегу</span></div></div></section>
  </div>`;
  $$('[data-pref]', view).forEach(g => $$('button', g).forEach(b => b.onclick = run(async () => { await savePrefs({ [g.dataset.pref]: b.dataset.v }); Pages.settings(view); })));
  $$('[data-acc]', view).forEach(b => b.onclick = run(async () => { await savePrefs({ accent: b.dataset.acc }); Pages.settings(view); }));
  $$('#fx button', view).forEach(b => b.onclick = () => { try { localStorage.setItem('cd_fx', b.dataset.v); } catch {} location.reload(); });
  $$('[data-n]', view).forEach(c => c.onchange = run(async () => { await savePrefs({ notify: { ...(S.me.prefs.notify || {}), [c.dataset.n]: c.checked } }); toast('Сохранено'); }));
  $('#pf').onsubmit = run(async (e) => { e.preventDefault(); await api('PATCH', '/api/me', { name: e.target.name.value }); await loadBootstrap(); $('#app').innerHTML = ''; render(); toast('Имя обновлено'); });
  $('#pw').onsubmit = run(async (e) => { e.preventDefault(); await api('POST', '/api/me/password', { current: e.target.current.value, next: e.target.next.value }); e.target.reset(); toast('Пароль изменён'); });
};
