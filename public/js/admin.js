// Administration (lead): users, offers, GEO, AI services, brief templates, SLA
'use strict';
const afterAdmin = async (msg) => { await loadBootstrap(); toast(msg); render(); };

Pages.admin = async (view, params) => {
  const tab = params.get('tab') || 'users';
  const tabs = [['users', 'Пользователи'], ['offers', 'Офферы'], ['geos', 'GEO'], ['services', 'AI-сервисы'], ['templates', 'Шаблоны ТЗ'], ['sla', 'Сроки и отдел']];
  view.innerHTML = `<div class="toolbar"><div class="seg scroll" role="tablist">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}">${l}</button>`).join('')}</div></div><div id="adm"></div>`;
  $$('[data-tab]', view).forEach(b => b.onclick = () => go('#/admin?tab=' + b.dataset.tab));
  await ({ users: admUsers, offers: admOffers, geos: admGeos, services: admServices, templates: admTemplates, sla: admSla }[tab] || admUsers)($('#adm'));
};

// ---------- users ----------
async function admUsers(box) {
  const users = await api('GET', '/api/admin/users');
  box.innerHTML = `<section class="panel table-wrap"><div class="row-between"><h3>${ico('users')}Пользователи <span class="extra">${users.filter(u => u.active).length} активных</span></h3>
      <button class="btn primary sm" id="u-add">${I.plus} Добавить</button></div>
    <table class="t"><thead><tr><th>Сотрудник</th><th>Логин</th><th>Роль</th><th>Специализация</th><th class="num">Ставка, $/ч</th><th>Статус</th><th></th></tr></thead>
    <tbody>${users.map(u => `<tr class="${u.active ? '' : 'off'}"><td><span class="who">${avatar(u.name, u.id, 'sm')}${esc(u.name)}</span></td><td class="muted">${esc(u.login)}</td><td>${ROLES[u.role]}</td>
      <td>${u.specialization ? u.specialization.split(',').map(s => `<span class="tag">${TYPES[s]}</span>`).join(' ') : '—'}</td><td class="num">${u.role === 'creative' ? u.hourly_rate : '—'}</td>
      <td>${u.active ? '<span class="tag ok">активен</span>' : '<span class="tag">отключён</span>'}</td>
      <td class="nowrap"><button class="btn ghost sm" data-edit="${u.id}">Изменить</button><button class="btn ghost sm" data-reset="${u.id}">Сбросить пароль</button></td></tr>`).join('')}</tbody></table>
    <p class="muted small">Ставка креативщика используется для расчёта себестоимости креатива (часы по таймеру × ставка). Отключённый сотрудник не может войти, история его работы сохраняется.</p></section>`;
  const form = (u = { role: 'creative', specialization: '', hourly_rate: 0, active: true }) => {
    const ov = modal(`<form class="dialog"><h2>${u.id ? 'Сотрудник: ' + esc(u.name) : 'Новый сотрудник'}</h2><div class="stack">
      <div class="grid2"><label class="f"><span>Имя и фамилия</span><input class="input" name="name" value="${esc(u.name || '')}" required></label>
        <label class="f"><span>Логин</span><input class="input" name="login" value="${esc(u.login || '')}" ${u.id ? 'disabled' : 'required'} pattern="[a-z0-9_.\\-]{3,32}" title="латиница, цифры, _ . -"></label></div>
      <div class="grid2"><label class="f"><span>Роль</span><select class="input" name="role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f"><span>Ставка, $/час</span><input class="input" type="number" min="0" step="0.5" name="rate" value="${u.hourly_rate || 0}"></label></div>
      <div class="f"><span>Специализация (для креативщиков: уведомления о новых ТЗ и рекомендации)</span><div class="checks">${Object.entries(TYPES).map(([k, v]) => `<label class="check"><input type="checkbox" name="spec" value="${k}" ${(u.specialization || '').split(',').includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div></div>
      ${u.id ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Учётная запись активна</label>` : ''}</div>
      <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">${u.id ? 'Сохранить' : 'Создать'}</button></div></form>`);
    $('form', ov).onsubmit = run(async (e) => {
      e.preventDefault(); const f = e.target;
      const body = { name: f.name.value, role: f.role.value, hourly_rate: +f.rate.value, specialization: $$('[name=spec]:checked', f).map(x => x.value).join(',') };
      if (u.id) { await api('PATCH', `/api/admin/users/${u.id}`, { ...body, active: f.active.checked }); closeModal(true); await afterAdmin('Сохранено'); }
      else { const r = await api('POST', '/api/admin/users', { ...body, login: f.login.value }); closeModal(true); await loadBootstrap(); render(); showPassword(f.login.value, r.password); }
    });
  };
  $('#u-add').onclick = () => form();
  $$('[data-edit]', box).forEach(b => b.onclick = () => form(users.find(u => u.id === +b.dataset.edit)));
  $$('[data-reset]', box).forEach(b => b.onclick = run(async () => {
    const u = users.find(x => x.id === +b.dataset.reset);
    if (!(await confirmDialog('Сбросить пароль?', `${esc(u.name)} получит новый временный пароль, текущие сессии будут завершены.`, 'Сбросить'))) return;
    const r = await api('POST', `/api/admin/users/${u.id}/reset-password`); showPassword(u.login, r.password);
  }));
}
function showPassword(login, password) {
  const ov = modal(`<div class="dialog sm"><h2>Данные для входа</h2><p class="muted">Передайте сотруднику. Пароль показывается один раз — после входа его можно сменить в настройках.</p>
    <div class="cred"><div><small>Логин</small><b>${esc(login)}</b></div><div><small>Пароль</small><b>${esc(password)}</b></div></div>
    <div class="actions"><button class="btn" id="cp">${I.copy} Скопировать</button><button class="btn primary" data-x>Готово</button></div></div>`);
  $('#cp', ov).onclick = () => navigator.clipboard?.writeText(`${location.origin}\nЛогин: ${login}\nПароль: ${password}`).then(() => toast('Скопировано'));
}

// ---------- offers ----------
async function admOffers(box) {
  box.innerHTML = `<section class="panel"><h3>${ico('target')}Офферы <span class="extra">единый справочник — аналитика по офферам не разваливается из-за опечаток</span></h3>
    <form class="inline-form" id="of"><input class="input" name="name" placeholder="Название оффера" required><input class="input" name="vertical" placeholder="Вертикаль (Nutra, Gambling…)"><button class="btn primary sm">${I.plus} Добавить</button></form>
    <table class="t"><thead><tr><th>Оффер</th><th>Вертикаль</th><th>Статус</th><th></th></tr></thead><tbody>${S.offers.map(o => `<tr class="${o.active ? '' : 'off'}">
      <td><input class="input inline" data-o="${o.id}" data-k="name" value="${esc(o.name)}" aria-label="Название"></td><td><input class="input inline" data-o="${o.id}" data-k="vertical" value="${esc(o.vertical)}" aria-label="Вертикаль"></td>
      <td>${o.active ? '<span class="tag ok">в работе</span>' : '<span class="tag">в архиве</span>'}</td>
      <td><button class="btn ghost sm" data-toggle="${o.id}">${o.active ? 'В архив' : 'Вернуть'}</button></td></tr>`).join('')}</tbody></table>
    <p class="muted small">Архивный оффер нельзя выбрать в новом ТЗ, но история и аналитика по нему сохраняются.</p></section>`;
  $('#of').onsubmit = run(async (e) => { e.preventDefault(); await api('POST', '/api/admin/offers', { name: e.target.name.value, vertical: e.target.vertical.value }); await afterAdmin('Оффер добавлен'); });
  $$('[data-o]', box).forEach(i => i.onchange = run(async () => { await api('PATCH', `/api/admin/offers/${i.dataset.o}`, { [i.dataset.k]: i.value }); await loadBootstrap(); toast('Сохранено'); }));
  $$('[data-toggle]', box).forEach(b => b.onclick = run(async () => { const o = S.offers.find(x => x.id === +b.dataset.toggle); await api('PATCH', `/api/admin/offers/${o.id}`, { active: !o.active }); await afterAdmin('Готово'); }));
}

// ---------- GEO ----------
async function admGeos(box) {
  box.innerHTML = `<section class="panel"><h3>${ico('target')}GEO <span class="extra">${S.geos.length} стран</span></h3>
    <form class="inline-form" id="gf"><input class="input" name="code" placeholder="Код ISO (DE)" maxlength="2" required style="max-width:120px"><input class="input" name="name" placeholder="Название страны" required><button class="btn primary sm">${I.plus} Добавить</button></form>
    <div class="geo-list">${S.geos.map(g => `<span class="geo-chip big"><b>${esc(g.code)}</b> ${esc(g.name)}<button data-del="${esc(g.code)}" aria-label="Удалить ${esc(g.code)}">${I.x}</button></span>`).join('')}</div>
    <p class="muted small">GEO, которые уже используются в задачах, удалить нельзя.</p></section>`;
  $('#gf').onsubmit = run(async (e) => { e.preventDefault(); await api('POST', '/api/admin/geos', { code: e.target.code.value, name: e.target.name.value }); await afterAdmin('GEO добавлено'); });
  $$('[data-del]', box).forEach(b => b.onclick = run(async () => { await api('DELETE', `/api/admin/geos/${b.dataset.del}`); await afterAdmin('GEO удалено'); }));
}

// ---------- AI services ----------
async function admServices(box) {
  const home = await api('GET', '/api/home').catch(() => ({ budgets: [] }));
  box.innerHTML = `<section class="panel table-wrap"><h3>${ico('spark')}AI-сервисы и бюджеты</h3>
    <form class="inline-form" id="sf"><input class="input" name="name" placeholder="Название сервиса" required><input class="input" name="price" type="number" step="0.0001" min="0" placeholder="$ за кредит" required><input class="input" name="budget" type="number" min="0" placeholder="Лимит, кр./мес"><button class="btn primary sm">${I.plus} Добавить</button></form>
    <table class="t"><thead><tr><th>Сервис</th><th>Цена кредита, $</th><th>Лимит, кредитов в месяц</th><th>Использовано в этом месяце</th><th></th></tr></thead>
    <tbody>${S.services.map(s => { const b = home.budgets?.find(x => x.id === s.id); return `<tr class="${s.active ? '' : 'off'}"><td><b>${esc(s.name)}</b></td>
      <td><input class="input inline" type="number" step="0.0001" min="0" data-s="${s.id}" data-k="credit_usd" value="${s.credit_usd}" aria-label="Цена кредита"></td>
      <td><input class="input inline" type="number" min="0" step="100" data-s="${s.id}" data-k="monthly_budget" value="${s.monthly_budget}" aria-label="Лимит"></td>
      <td>${b && s.monthly_budget ? budgetBar({ ...b, budget: s.monthly_budget }) : b ? num(b.used) + ' кр.' : '—'}</td>
      <td><button class="btn ghost sm" data-toggle="${s.id}">${s.active ? 'Отключить' : 'Включить'}</button></td></tr>`; }).join('')}</tbody></table>
    <p class="muted small">Цена кредита переводит расходы в деньги во всех отчётах. При достижении 80% и 100% лимита руководитель получает уведомление; прогноз считается по темпу расхода с начала месяца.</p></section>`;
  $('#sf').onsubmit = run(async (e) => { e.preventDefault(); await api('POST', '/api/admin/services', { name: e.target.name.value, credit_usd: +e.target.price.value, monthly_budget: +e.target.budget.value || 0 }); await afterAdmin('Сервис добавлен'); });
  $$('[data-s]', box).forEach(i => i.onchange = run(async () => { await api('PATCH', `/api/admin/services/${i.dataset.s}`, { [i.dataset.k]: +i.value }); await loadBootstrap(); toast('Сохранено'); }));
  $$('[data-toggle]', box).forEach(b => b.onclick = run(async () => { const s = S.services.find(x => x.id === +b.dataset.toggle); await api('PATCH', `/api/admin/services/${s.id}`, { active: !s.active }); await afterAdmin('Готово'); }));
}

// ---------- templates ----------
async function admTemplates(box) {
  const reasons = (await api('GET', '/api/analytics').catch(() => ({ reasons: [] }))).reasons.slice(0, 3);
  box.innerHTML = `${reasons.length ? `<div class="note">${I.spark} Самые частые причины правок: ${reasons.map(r => `<b>${REASONS[r.reason]}</b>`).join(', ')}. Добавьте соответствующие пункты в чек-листы шаблонов — байеры будут закрывать эти вопросы ещё в ТЗ.</div>` : ''}
    <div class="row-between"><h3 class="grp">Шаблоны ТЗ<span>${S.templates.length}</span></h3><button class="btn primary sm" id="t-add">${I.plus} Новый шаблон</button></div>
    <div class="tpl-grid">${S.templates.map(t => `<article class="panel tpl ${t.active ? '' : 'off'}"><div class="row-between"><b>${esc(t.name)}</b>${t.active ? '' : '<span class="tag">отключён</span>'}</div>
      <small class="muted">${TYPES[t.creative_type]} · ${PRIO[t.priority]} · ${t.quantity} шт.</small>
      <ul class="cl">${t.checklist.map(c => `<li>${I.check}${esc(c)}</li>`).join('')}</ul><button class="btn ghost sm" data-edit="${t.id}">Изменить</button></article>`).join('')}</div>`;
  const form = (t = { creative_type: 'video', priority: 'medium', quantity: 1, checklist: [], description: '', active: true }) => {
    const ov = modal(`<form class="dialog lg"><h2>${t.id ? 'Шаблон: ' + esc(t.name) : 'Новый шаблон ТЗ'}</h2><div class="stack">
      <label class="f"><span>Название</span><input class="input" name="name" value="${esc(t.name || '')}" required></label>
      <div class="grid3"><label class="f"><span>Тип</span><select class="input" name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${t.creative_type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f"><span>Приоритет</span><select class="input" name="prio">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f"><span>Количество</span><input class="input" type="number" min="1" max="100" name="qty" value="${t.quantity}"></label></div>
      <label class="f"><span>Структура описания</span><textarea class="input" name="desc" rows="6">${esc(t.description)}</textarea></label>
      <label class="f"><span>Чек-лист требований — по пункту в строке</span><textarea class="input" name="cl" rows="4">${esc(t.checklist.join('\n'))}</textarea></label>
      ${t.id ? `<label class="check"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> Шаблон доступен байерам</label>` : ''}</div>
      <div class="actions"><button type="button" class="btn" data-x>Отмена</button><button class="btn primary">Сохранить</button></div></form>`);
    $('form', ov).onsubmit = run(async (e) => {
      e.preventDefault(); const f = e.target;
      const body = { name: f.name.value, creative_type: f.type.value, priority: f.prio.value, quantity: +f.qty.value, description: f.desc.value, checklist: f.cl.value.split('\n') };
      if (t.id) await api('PATCH', `/api/admin/templates/${t.id}`, { ...body, active: f.active.checked }); else await api('POST', '/api/admin/templates', body);
      closeModal(true); await afterAdmin('Шаблон сохранён');
    });
  };
  $('#t-add').onclick = () => form();
  $$('[data-edit]', box).forEach(b => b.onclick = () => form(S.templates.find(t => t.id === +b.dataset.edit)));
}

// ---------- SLA & workspace ----------
async function admSla(box) {
  const sla = S.settings.sla || {}, ws = S.settings.workspace?.name || '';
  box.innerHTML = `<div class="set-grid"><section class="panel"><h3>${ico('clock')}SLA по приоритетам</h3>
      <form id="slaf" class="stack"><div class="grid2">${Object.entries(PRIO).map(([k, v]) => `<label class="f"><span>${v}, часов</span><input class="input" type="number" min="1" max="720" name="${k}" value="${sla[k] || ''}" required></label>`).join('')}</div>
      <button class="btn primary sm">Сохранить</button></form>
      <p class="muted small">SLA подставляет дедлайн при создании ТЗ. Риск срыва считается по фактической скорости отдела: если до дедлайна меньше времени, чем обычно занимает такая работа, карточка получает метку «Риск срыва».</p></section>
    <section class="panel"><h3>${ico('home')}Отдел</h3><form id="wsf" class="stack"><label class="f"><span>Название (видно в меню)</span><input class="input" name="ws" value="${esc(ws)}" required></label>
      <button class="btn primary sm">Сохранить</button></form></section></div>`;
  $('#slaf').onsubmit = run(async (e) => { e.preventDefault(); await api('PATCH', '/api/admin/settings', { sla: Object.fromEntries(Object.keys(PRIO).map(k => [k, +e.target[k].value])) }); await afterAdmin('SLA обновлены'); });
  $('#wsf').onsubmit = run(async (e) => { e.preventDefault(); await api('PATCH', '/api/admin/settings', { workspace: e.target.ws.value }); await loadBootstrap(); $('#app').innerHTML = ''; render(); toast('Сохранено'); });
}
