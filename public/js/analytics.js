// Analytics (lead): overview, people, money & AI, quality, results. Every number links to the tasks behind it.
'use strict';
const AN = { preset: '30', from: '', to: '' };
const day = (d) => d.toISOString().slice(0, 10);
function presetRange(p) { if (p === 'all') return ['', '']; const to = new Date(), from = new Date(Date.now() - (+p - 1) * 864e5); return [day(from), day(to)]; }

Pages.analytics = async (view, params) => {
  const tab = params.get('tab') || 'overview';
  if (AN.preset !== 'custom') [AN.from, AN.to] = presetRange(AN.preset);
  const a = await api('GET', `/api/analytics?from=${AN.from}&to=${AN.to}`);
  const T = a.totals, period = AN.from ? `&from=${AN.from}&to=${AN.to}` : '';
  const tabs = [['overview', 'Обзор'], ['people', 'Люди'], ['money', 'Деньги и AI'], ['quality', 'Качество'], ['results', 'Результативность']];
  view.innerHTML = `<div class="toolbar">
      <div class="seg scroll" role="tablist">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
      <div class="spacer"></div>
      <div class="seg" id="pp">${[['7', '7 дн'], ['30', '30 дн'], ['90', '90 дн'], ['all', 'Всё']].map(([k, l]) => `<button data-p="${k}" class="${AN.preset === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input type="date" class="input date" id="af" value="${AN.from}" aria-label="С"><input type="date" class="input date" id="at" value="${AN.to}" aria-label="По">
      <a class="btn ghost sm" href="/api/tasks/export.csv?${period.slice(1)}" download>${I.download} CSV</a></div>
    <div id="atab"></div>`;
  $$('[data-tab]', view).forEach(b => b.onclick = () => go('#/analytics?tab=' + b.dataset.tab));
  $$('#pp button', view).forEach(b => b.onclick = () => { AN.preset = b.dataset.p; Pages.analytics(view, params); });
  $('#af').onchange = $('#at').onchange = () => { AN.preset = 'custom'; AN.from = $('#af').value; AN.to = $('#at').value; Pages.analytics(view, params); };
  const box = $('#atab');
  ({ overview, people, money, quality, results }[tab] || overview)(box, a, T, period);
  $$('tr[data-href]', box).forEach(r => { r.tabIndex = 0; r.onclick = () => go(r.dataset.href); r.onkeydown = (e) => { if (e.key === 'Enter') go(r.dataset.href); }; });
  $$('[data-open]', box).forEach(b => b.onclick = () => openTask(+b.dataset.open));
};

function overview(box, a, T, period) {
  const total = T.total || 0;
  box.innerHTML = `<div class="kpis k6">
      ${kpi('Задач за период', total, `${a.byStatus.done} готово · ${total - a.byStatus.done} в процессе`, 'board', '#6c4dff', '#/tasks?view=list' + period)}
      ${kpi('Средний цикл', fmtDur(T.avg_lead_h), `ожидание исполнителя ${fmtDur(T.avg_wait_h)}`, 'loop', '#1d7af0')}
      ${kpi('Среднее время в работе', fmtDur(T.avg_work_h), `чистого времени: ${fmtDur(T.hours)}`, 'clock', '#0891b2')}
      ${kpi('Просрочено', T.overdue || 0, total ? Math.round(T.overdue / total * 100) + '% задач' : '', 'alert', T.overdue ? '#e5484d' : '#16a374', '#/tasks?overdue=1&view=list' + period)}
      ${kpi('Приняты с первого раза', pct(T.first_pass_rate), `кругов правок: ${T.revisions}`, 'check', '#16a374', '#/analytics?tab=quality')}
      ${kpi('Победителей', T.wins, T.cost_per_winner ? `≈ ${usd(T.cost_per_winner)} за победителя` : '', 'trophy', '#d97706', '#/library?status=winner')}</div>
    <div class="an-grid">
      <section class="panel wide"><h3>${ico('board')}Задачи по статусам <span class="extra">нажмите на сегмент</span></h3>
        <div class="sbar">${Object.entries(a.byStatus).map(([s, n]) => n ? `<a href="#/tasks?status=${s}&view=list${period}" class="st-bg-${s}" style="flex:${n}" title="${STATUS[s]}: ${n}"></a>` : '').join('')}</div>
        <div class="legend">${Object.entries(a.byStatus).map(([s, n]) => `<a href="#/tasks?status=${s}&view=list${period}"><i class="st-bg-${s}"></i>${STATUS[s]}: <b>${n}</b></a>`).join('')}</div></section>
      <section class="panel wide"><h3>${ico('chart')}Динамика по дням <span class="extra">создано / завершено</span></h3>${dailyChart(a.daily)}</section>
      <section class="panel wide"><h3>${ico('alert')}Просроченные задачи <span class="extra">${a.overdue.length}</span></h3>
        <div class="mini-list">${a.overdue.map(t => `<button class="mini" data-open="${t.id}"><span class="mini-dot st-${t.status}"></span><span class="mini-body"><b>#${t.id} ${esc(t.title)}</b>
          <small>${esc(t.creative_name || 'не назначен')} · ${STATUS[t.status]}</small></span><span class="mini-side danger-t">+${fmtDur(hrs(t.deadline, t.completed_at || new Date().toISOString()))}</span></button>`).join('') || empty('Просрочек нет', 'check')}</div></section>
    </div>`;
}

function people(box, a, T, period) {
  box.innerHTML = `<section class="panel table-wrap"><h3>${ico('users')}Креативщики <span class="extra">строка — список задач человека</span></h3>
    <table class="t"><thead><tr><th>Исполнитель</th><th>Загрузка</th><th class="num">Готово</th><th class="num">Ср. время</th><th class="num">С 1-го раза</th><th class="num">Правок</th>
      <th class="num">Просрочек</th><th class="num">Побед</th><th class="num">Win rate</th><th class="num">Часы</th><th class="num">AI $</th><th class="num">Труд $</th></tr></thead>
    <tbody>${a.creatives.map(c => `<tr class="click" data-href="#/tasks?creative_id=${c.id}&view=list${period}"><td><span class="who">${avatar(c.name, c.id, 'sm')}${esc(c.name)}</span></td>
      <td><span class="load">${Array.from({ length: 6 }, (_, i) => `<i class="${i < c.active + c.on_review ? (c.active >= 4 ? 'hot' : 'on') : ''}"></i>`).join('')}</span> <small class="muted">${c.active} + ${c.on_review}</small></td>
      <td class="num">${c.done}</td><td class="num">${fmtDur(c.avg_work_h)}</td><td class="num">${pct(c.first_pass_rate)}</td><td class="num">${c.revisions}</td>
      <td class="num ${c.overdue ? 'danger-t' : ''}">${c.overdue}</td><td class="num">${c.wins}</td><td class="num"><b>${pct(c.win_rate)}</b></td>
      <td class="num">${fmtDur(c.hours)}</td><td class="num">${usd(c.ai_usd)}</td><td class="num">${usd(c.labor_usd)}</td></tr>`).join('')}</tbody></table></section>
    <section class="panel table-wrap"><h3>${ico('target')}Медиабайеры</h3>
    <table class="t"><thead><tr><th>Байер</th><th class="num">ТЗ</th><th class="num">Готово</th><th class="num">Просрочено</th><th class="num">Без отметки результата</th></tr></thead>
    <tbody>${a.buyers.map(b => `<tr class="click" data-href="#/tasks?buyer_id=${b.id}&view=list${period}"><td><span class="who">${avatar(b.name, b.id, 'sm')}${esc(b.name)}</span></td><td class="num">${b.total}</td>
      <td class="num">${b.done}</td><td class="num">${b.overdue}</td><td class="num">${b.no_result ? `<a href="#/library?status=needs_result&buyer_id=${b.id}" class="warn-t">${b.no_result}</a>` : 0}</td></tr>`).join('')}</tbody></table></section>`;
  $$('td a', box).forEach(x => x.onclick = (e) => e.stopPropagation());
}

function money(box, a, T) {
  const maxU = Math.max(1, ...a.services.map(s => s.usd));
  const svcs = [...new Set(a.matrix.map(m => m.service))], ppl = [...new Set(a.matrix.map(m => m.name))];
  const cell = (p, s) => a.matrix.find(m => m.name === p && m.service === s)?.credits || 0, maxC = Math.max(1, ...a.matrix.map(m => m.credits));
  box.innerHTML = `<div class="kpis k4">${kpi('AI-расходы', usd(T.ai_usd), `${num(T.ai_credits)} кредитов`, 'spark', '#c04dff')}
      ${kpi('Труд креативщиков', usd(T.labor_usd), `${fmtDur(T.hours)} по таймеру × ставка`, 'clock', '#1d7af0')}
      ${kpi('Себестоимость задачи', usd(T.cost_per_task), 'AI + труд / принятые задачи', 'money', '#16a374')}
      ${kpi('Цена победителя', usd(T.cost_per_winner), 'все затраты / число победителей', 'trophy', '#d97706', '#/library?status=winner')}</div>
    <div class="an-grid">
      <section class="panel"><h3>${ico('spark')}Бюджеты AI на месяц <span class="extra">метка — прогноз к концу месяца</span></h3>
        <div class="bars">${a.budgets.filter(b => b.budget).map(budgetBar).join('')}</div>
        <p class="muted small">Лимиты и цена кредита настраиваются в разделе <a href="#/admin?tab=services">Управление → AI-сервисы</a>. При 80% и 100% руководитель получает уведомление.</p></section>
      <section class="panel"><h3>${ico('money')}Расходы по сервисам</h3>
        <div class="bars">${a.services.map(s => `<div class="bar"><span>${esc(s.name)}</span><div class="track"><i style="width:${(s.usd - s.revision_credits / Math.max(s.credits, 1) * s.usd) / maxU * 100}%"></i><i class="rev" style="width:${s.revision_credits / Math.max(s.credits, 1) * s.usd / maxU * 100}%"></i></div><span class="v">${usd(s.usd)}</span></div>`).join('') || empty('Нет данных')}</div>
        <div class="legend"><span><i style="background:var(--accent)"></i>Основная работа</span><span><i style="background:var(--warn)"></i>Правки</span></div></section>
      <section class="panel wide table-wrap"><h3>${ico('users')}Кредиты: исполнитель × сервис</h3>
        ${ppl.length ? `<table class="t heat"><thead><tr><th>Исполнитель</th>${svcs.map(s => `<th class="num">${esc(s)}</th>`).join('')}<th class="num">Итого</th></tr></thead>
        <tbody>${ppl.map(p => `<tr><td>${esc(p)}</td>${svcs.map(s => { const v = cell(p, s); return `<td class="num" style="--h:${Math.round(v / maxC * 100)}%">${v ? num(v) : '·'}</td>`; }).join('')}
          <td class="num"><b>${num(svcs.reduce((x, s) => x + cell(p, s), 0))}</b></td></tr>`).join('')}</tbody></table>` : empty('Нет данных')}</section>
    </div>`;
}

function quality(box, a, T, period) {
  const total = a.reasons.reduce((s, r) => s + r.n, 0), top = a.reasons[0];
  box.innerHTML = `<div class="an-grid">
    <section class="panel"><h3>${ico('alert')}Почему возвращают на правки</h3>
      <div class="bars">${a.reasons.map(r => `<div class="bar"><span>${REASONS[r.reason]}</span><div class="track"><i style="width:${r.n / total * 100}%"></i></div><span class="v">${Math.round(r.n / total * 100)}%</span></div>`).join('') || empty('Правок не было')}</div>
      ${top ? `<div class="note">${I.spark} Чаще всего правки из-за «${REASONS[top.reason]}». Добавьте пункт про это в <a href="#/admin?tab=templates">шаблоны ТЗ</a> — подсказка уже появляется у байеров при постановке задачи.</div>` : ''}</section>
    <section class="panel"><h3>${ico('check')}Принято с первого раза</h3>
      <div class="big-num">${pct(T.first_pass_rate)}<small>${T.first_pass} из ${T.done} задач без единой правки</small></div>
      <div class="bars">${a.creatives.filter(c => c.done).map(c => `<a class="bar" href="#/tasks?creative_id=${c.id}&view=list${period}"><span>${esc(c.name)}</span><div class="track"><i style="width:${c.first_pass_rate || 0}%"></i></div><span class="v">${pct(c.first_pass_rate)}</span></a>`).join('')}</div></section>
    <section class="panel wide table-wrap"><h3>${ico('board')}Типы креативов</h3>
      <table class="t"><thead><tr><th>Тип</th><th class="num">Задач</th><th class="num">Средний цикл</th><th class="num">Побед</th><th class="num">Win rate</th></tr></thead>
      <tbody>${a.byType.map(r => `<tr class="click" data-href="#/tasks?type=${r.creative_type}&view=list${period}"><td>${TYPES[r.creative_type]}</td><td class="num">${r.n}</td><td class="num">${fmtDur(r.avg_lead_h)}</td><td class="num">${r.wins}</td><td class="num"><b>${pct(r.win_rate)}</b></td></tr>`).join('')}</tbody></table></section>
  </div>`;
}

function results(box, a) {
  const L = a.lineage;
  box.innerHTML = `<div class="an-grid">
    <section class="panel wide insight"><h3>${ico('loop')}Вариации победителей против новых идей</h3>
      <div class="vs"><div><b>${pct(L.variation)}</b><small>win rate вариаций<br>(${L.var_wins} из ${L.var_rated})</small></div><span>vs</span>
        <div><b>${pct(L.fresh)}</b><small>win rate новых креативов<br>(${L.new_wins} из ${L.new_rated})</small></div></div>
      <p class="muted">${L.variation != null && L.fresh != null ? (L.variation > L.fresh ? `Вариации удачных креативов побеждают чаще — выгодно планировать часть ТЗ как вариации из <a href="#/library?status=winner">библиотеки победителей</a>.`
        : 'Пока новые идеи побеждают не реже вариаций — стоит продолжать тестировать новые подходы.') : 'Данных пока мало: отмечайте результаты запусков, чтобы сравнение стало точным.'}</p></section>
    <section class="panel wide table-wrap"><h3>${ico('target')}Офферы</h3>
      <table class="t"><thead><tr><th>Оффер</th><th class="num">Задач</th><th class="num">Побед</th><th class="num">Win rate</th><th class="num">Средний ROI</th><th class="num">Spend</th></tr></thead>
      <tbody>${a.byOffer.map(o => `<tr class="click" data-href="#/library?offer_id=${o.id}"><td>${esc(o.name)}</td><td class="num">${o.n}</td><td class="num">${o.wins}</td><td class="num"><b>${pct(o.win_rate)}</b></td>
        <td class="num ${o.roi >= 0 ? 'ok-t' : 'danger-t'}">${o.roi != null ? Math.round(o.roi) + '%' : '—'}</td><td class="num">${usd(o.spend)}</td></tr>`).join('')}</tbody></table></section>
    <section class="panel wide table-wrap"><h3>${ico('trophy')}Win rate по креативщикам</h3>
      <div class="bars">${a.creatives.map(c => `<a class="bar" href="#/library?creative_id=${c.id}"><span>${esc(c.name)}</span><div class="track"><i style="width:${c.win_rate || 0}%"></i></div><span class="v">${pct(c.win_rate)}</span></a>`).join('')}</div>
      <p class="muted small">Доля победителей среди креативов с отмеченным результатом. Нажмите — откроются работы автора в библиотеке.</p></section>
  </div>`;
}

// grouped daily bars, pure SVG (cheap to render)
function dailyChart(daily) {
  const end = AN.to ? Date.parse(AN.to) : Date.parse(day(new Date()));
  let start = AN.from ? Date.parse(AN.from) : end - 29 * 864e5; if (end - start > 59 * 864e5) start = end - 59 * 864e5;
  const days = []; for (let t = start; t <= end; t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
  const map = (arr) => Object.fromEntries(arr.map(r => [r.d, r.n]));
  const c = map(daily.created), d = map(daily.done), max = Math.max(1, ...days.map(x => Math.max(c[x] || 0, d[x] || 0)));
  const W = 900, Hh = 170, base = Hh - 22, step = W / days.length, bw = Math.max(2, Math.min(14, step / 2 - 1.5)), sc = (v) => v / max * (base - 14);
  const bars = days.map((x, i) => { const cx = i * step + step / 2;
    return `<rect x="${cx - bw - .5}" y="${base - sc(c[x] || 0)}" width="${bw}" height="${sc(c[x] || 0)}" rx="2" class="b1"><title>${x}: создано ${c[x] || 0}</title></rect>
      <rect x="${cx + .5}" y="${base - sc(d[x] || 0)}" width="${bw}" height="${sc(d[x] || 0)}" rx="2" class="b2"><title>${x}: завершено ${d[x] || 0}</title></rect>`
      + (i % Math.ceil(days.length / 8) === 0 ? `<text x="${cx}" y="${Hh - 5}" text-anchor="middle">${x.slice(8)}.${x.slice(5, 7)}</text>` : ''); }).join('');
  const grid = [0, .5, 1].map(f => `<line x1="0" x2="${W}" y1="${base - f * (base - 14)}" y2="${base - f * (base - 14)}"/><text x="2" y="${base - f * (base - 14) - 3}">${Math.round(max * f)}</text>`).join('');
  return `<svg class="daily" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Задачи по дням">${grid}${bars}</svg>
    <div class="legend"><span><i style="background:var(--accent)"></i>Создано</span><span><i style="background:var(--ok)"></i>Завершено</span></div>`;
}
