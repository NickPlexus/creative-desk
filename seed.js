// Demo data: dictionaries + ~48 tasks simulated through the real lifecycle over the last 30 days.
// Every version gets generated SVG creative previews, so the library and task cards show real images.
const crypto = require('crypto');
const db = require('./db');

const PASSWORD = 'demo123';
const USERS = [
  ['lead', 'Анна Соколова', 'lead', '', 0],
  ['buyer1', 'Максим Орлов', 'buyer', '', 0], ['buyer2', 'Ольга Ким', 'buyer', '', 0], ['buyer3', 'Денис Волков', 'buyer', '', 0],
  ['creative1', 'Ира Белова', 'creative', 'video,gif,banner', 10], ['creative2', 'Тимур Алиев', 'creative', 'video,ugc', 9],
  ['creative3', 'Лена Смирнова', 'creative', 'static,banner', 8], ['creative4', 'Паша Нуриев', 'creative', 'static,video,playable', 12],
];
const OFFERS = [['Keto Slim', 'Nutra'], ['Joint Flex', 'Nutra'], ['Vavada Casino', 'Gambling'], ['LoveMatch', 'Dating'],
  ['BitProfit', 'Crypto'], ['QuickLoan', 'Finance'], ['SmartWatch X', 'E-com'], ['iPhone 17 Sweeps', 'Sweepstakes']];
const GEOS = [['RU', 'Россия'], ['KZ', 'Казахстан'], ['DE', 'Германия'], ['PL', 'Польша'], ['BR', 'Бразилия'], ['MX', 'Мексика'], ['IN', 'Индия'],
  ['TR', 'Турция'], ['US', 'США'], ['ES', 'Испания'], ['IT', 'Италия'], ['FR', 'Франция'], ['UZ', 'Узбекистан'], ['ID', 'Индонезия'], ['PH', 'Филиппины']];
const SERVICES = [['Midjourney', 0.04], ['Runway', 0.012], ['Kling', 0.015], ['ElevenLabs', 0.006], ['ChatGPT', 0.002], ['Leonardo', 0.008], ['HeyGen', 0.05], ['Suno', 0.01]];
const TEMPLATES = [
  ['Вертикальное видео 15–30 с', 'video', 'Формат 9:16, 15–30 секунд.\nХук в первые 2 секунды: \nОсновной посыл: \nТекст на экране (язык GEO): \nCTA: \nМузыка/озвучка: ', ['Хук в первые 2 секунды', 'Субтитры на языке GEO', 'CTA в конце', 'Безопасная зона под интерфейс площадки'], 3, 'high'],
  ['Пачка статики под FB/IG', 'static', 'Форматы 1:1 и 4:5.\nОффер и выгода: \nЗаголовок: \nВизуал/подход: \nОграничения площадки: ', ['Текста на изображении не больше 20%', 'Логотип/бренд не используется', 'Варианты 1:1 и 4:5'], 5, 'medium'],
  ['Баннеры для пушей и натива', 'banner', 'Размеры: 192×192, 492×328, 300×250.\nЗаголовок до 30 символов: \nОписание до 60 символов: ', ['Все размеры из ТЗ', 'Читается на маленьком экране', 'Вес до 150 КБ'], 6, 'medium'],
  ['UGC-ролик «отзыв покупателя»', 'ugc', 'Сценарий от первого лица, 20–40 секунд.\nПерсонаж: \nПроблема → решение: \nКлючевые фразы: ', ['Естественная съёмка, без «рекламности»', 'Демонстрация продукта', 'Озвучка на языке GEO'], 2, 'high'],
  ['Playable-демо', 'playable', 'Механика: \nДлительность до 30 с.\nФинальный экран с CTA: ', ['Работает на Android и iOS', 'Вес до 5 МБ', 'Финальный экран со ссылкой'], 1, 'medium'],
];
const SLA = { urgent: 24, high: 48, medium: 72, low: 120 };

const HEAD = {
  Nutra: [['−12 кг за месяц', 'Lose 12 kg in a month'], ['Суставы как в 20', 'Joints like at 20']],
  Gambling: [['Бонус 500% на старте', '500% welcome bonus'], ['x100 на первом спине', 'x100 on the first spin']],
  Dating: [['Знакомства рядом с тобой', 'Singles near you'], ['3 новых мэтча сегодня', '3 new matches today']],
  Crypto: [['+38% за неделю', '+38% in a week'], ['Автотрейдинг 24/7', 'Auto-trading 24/7']],
  Finance: [['Займ за 5 минут', 'Loan in 5 minutes'], ['0% на первый займ', '0% on your first loan']],
  'E-com': [['Скидка 70% сегодня', '70% off today'], ['Часы за 1 990 ₽', 'Smartwatch for $29']],
  Sweepstakes: [['Выиграй iPhone 17', 'Win an iPhone 17'], ['Последние 3 приза', 'Last 3 prizes left']],
};
const CTA = [['Забрать бонус', 'Claim bonus'], ['Узнать больше', 'Learn more'], ['Попробовать', 'Try now'], ['Получить', 'Get it']];
const PALETTES = [['#6d28d9', '#06b6d4'], ['#be123c', '#f97316'], ['#047857', '#84cc16'], ['#1d4ed8', '#22d3ee'], ['#a21caf', '#f472b6'], ['#b45309', '#facc15'], ['#0f766e', '#2dd4bf'], ['#4338ca', '#a78bfa']];
const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function creativeSvg({ type, vertical, offer, geo, variant, seed }) {
  const ru = /RU|KZ|UZ/.test(geo), L = ru ? 0 : 1;
  const [c1, c2] = PALETTES[(seed + variant) % PALETTES.length];
  const head = HEAD[vertical][(seed + variant) % 2][L], cta = CTA[(seed + variant) % CTA.length][L];
  const [w, hgt] = type === 'banner' ? [1200, 628] : type === 'static' ? [1080, 1080] : [1080, 1350];
  const play = ['video', 'ugc', 'gif', 'playable'].includes(type)
    ? `<circle cx="${w - 150}" cy="150" r="70" fill="rgba(255,255,255,.18)"/><path d="M${w - 172} 115 L${w - 115} 150 L${w - 172} 185 Z" fill="#fff"/>` : '';
  const shape = variant % 3 === 0 ? `<circle cx="${w * 0.78}" cy="${hgt * 0.62}" r="${hgt * 0.28}" fill="rgba(255,255,255,.12)"/>`
    : variant % 3 === 1 ? `<rect x="${w * 0.55}" y="${hgt * 0.35}" width="${w * 0.38}" height="${w * 0.38}" rx="40" fill="rgba(255,255,255,.12)" transform="rotate(12 ${w * 0.74} ${hgt * 0.55})"/>`
    : `<path d="M0 ${hgt * 0.75} Q ${w / 2} ${hgt * 0.55} ${w} ${hgt * 0.8} V ${hgt} H 0 Z" fill="rgba(255,255,255,.12)"/>`;
  const fs = Math.round(Math.min(type === 'banner' ? 64 : 88, (w - 150) / (head.length * 0.56)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="${w}" height="${hgt}" fill="url(#g)"/>${shape}${play}
<text x="70" y="110" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="rgba(255,255,255,.85)" letter-spacing="4">${esc(offer.toUpperCase())} · ${esc(geo)}</text>
<text x="70" y="${hgt * 0.5}" font-family="Arial, sans-serif" font-size="${fs}" font-weight="800" fill="#fff">${esc(head)}</text>
<rect x="70" y="${hgt - 190}" width="${cta.length * 24 + 90}" height="100" rx="50" fill="#fff"/>
<text x="115" y="${hgt - 125}" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="${c1}">${esc(cta)}</text>
<text x="${w - 70}" y="${hgt - 40}" text-anchor="end" font-family="Arial, sans-serif" font-size="26" fill="rgba(255,255,255,.7)">v${variant + 1}</text>
</svg>`;
}

let s = 20261111;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const wpick = (pairs) => { let r = rnd() * pairs.reduce((x, p) => x + p[1], 0); for (const [v, w] of pairs) if ((r -= w) <= 0) return v; return pairs[0][0]; };
const H = 36e5;

const REASONS = {
  video: [['hook', 5], ['text', 2], ['localization', 2], ['visual', 1], ['tech', 1]], ugc: [['hook', 3], ['text', 2], ['localization', 3], ['visual', 1]],
  static: [['text', 3], ['visual', 3], ['platform', 2], ['localization', 1]], banner: [['platform', 3], ['tech', 3], ['text', 2]],
  gif: [['visual', 2], ['tech', 2], ['hook', 1]], playable: [['tech', 4], ['visual', 2], ['hook', 1]],
};
const NOTES = {
  hook: ['Первые 2 секунды не цепляют — нужен более резкий хук', 'Начать сразу с результата, без подводки'],
  text: ['Заменить CTA на «Забрать бонус»', 'Заголовок слишком длинный, сократить до 5 слов'],
  localization: ['Текст на экране должен быть на языке GEO', 'Валюта и цены — в местном формате'],
  visual: ['Цвета не совпадают со стилем лендинга', 'Продукт плохо виден, сделать крупнее'],
  platform: ['Слишком много текста на изображении для FB', 'Убрать до/после — не пропустит модерация'],
  tech: ['Вес файла больше лимита площадки', 'Не хватает размера 300×250'],
  other: ['Добавить ещё один вариант'],
};
const TITLES = {
  video: ['Вертикальное видео 15 с с хуком', 'Видео с AI-аватаром', 'Ролик «до/после» 20 с'], ugc: ['UGC-отзыв покупателя', 'Сторис-реакция на продукт'],
  static: ['Статика под FB 1:1', 'Пачка статики с выгодой', 'Карусель из 4 слайдов'], banner: ['Баннеры под пуши', 'Набор нативных тизеров'],
  gif: ['GIF-анимация выигрыша'], playable: ['Playable «колесо фортуны»', 'Мини-игра «найди пару»'],
};

async function seedIfEmpty() {
  const { n } = await db.one('SELECT count(*)::int AS n FROM users');
  if (n) return;
  console.log('Seeding demo data…');
  await db.tx(async (q) => {
    const uid = {};
    for (const [login, name, role, spec, rate] of USERS) {
      const salt = crypto.randomBytes(8).toString('hex');
      uid[login] = (await q('INSERT INTO users (login, name, role, specialization, hourly_rate, password_hash, salt) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [login, name, role, spec, rate, db.hash(PASSWORD, salt), salt]))[0].id;
    }
    const offers = [];
    for (const [name, vertical] of OFFERS) offers.push({ id: (await q('INSERT INTO offers (name, vertical) VALUES ($1,$2) RETURNING id', [name, vertical]))[0].id, name, vertical });
    for (const [code, name] of GEOS) await q('INSERT INTO geos (code, name) VALUES ($1,$2)', [code, name]);
    const services = [];
    for (const [name, price] of SERVICES) services.push({ id: (await q('INSERT INTO ai_services (name, credit_usd) VALUES ($1,$2) RETURNING id', [name, price]))[0].id, name });
    const tpl = {};
    for (const [name, type, desc, checklist, qty, prio] of TEMPLATES)
      tpl[type] = (await q('INSERT INTO templates (name, creative_type, description, checklist, quantity, priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [name, type, desc, JSON.stringify(checklist), qty, prio]))[0].id;
    await q(`INSERT INTO settings (key, value) VALUES ('sla', $1), ('workspace', $2)`, [JSON.stringify(SLA), JSON.stringify({ name: 'Креативный отдел' })]);

    const buyers = ['buyer1', 'buyer2', 'buyer3'].map(l => uid[l]);
    const creatives = ['creative1', 'creative2', 'creative3', 'creative4'].map(l => uid[l]);
    const spec = Object.fromEntries(USERS.filter(u => u[2] === 'creative').map(u => [uid[u[0]], u[3].split(',')]));
    const skill = { [uid.creative1]: 0.42, [uid.creative2]: 0.3, [uid.creative3]: 0.36, [uid.creative4]: 0.55 }; // base win probability
    const speed = { [uid.creative1]: 1, [uid.creative2]: 1.4, [uid.creative3]: 0.8, [uid.creative4]: 0.65 };
    const NOW = Date.now(), N = 48, winners = [], notifs = [];
    const ev = (user, actor, task, type, at, text = '') => { if (NOW - at < 3 * 864e5) notifs.push([user, actor, task, type, text, new Date(at), NOW - at > 20 * H ? new Date(at + H) : null]); };
    const log = (task, user, action, from, to, comment, at) => q('INSERT INTO history (task_id, user_id, action, from_status, to_status, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [task, user, action, from, to, comment, new Date(at)]);

    for (let i = 0; i < N; i++) {
      const created = NOW - (30 * Math.pow(1 - i / N, 1.9) * 24 + 1.5 + rnd() * 3) * H;
      let parent = null;
      if (winners.length && rnd() < 0.28) parent = pick(winners.filter(w => w.at < created) .concat([])) || null;
      const type = parent ? parent.type : pick(['video', 'video', 'static', 'static', 'banner', 'ugc', 'gif', 'playable']);
      const offer = parent ? parent.offer : pick(offers);
      const geo = parent && rnd() < 0.5 ? parent.geo : pick(GEOS)[0] + (rnd() < 0.2 ? ', ' + pick(GEOS)[0] : '');
      const geoClean = [...new Set(geo.split(', '))].join(', ');
      const prio = pick(['low', 'medium', 'medium', 'high', 'high', 'urgent']);
      const buyer = parent ? parent.buyer : pick(buyers);
      const deadline = created + SLA[prio] * H;
      const title = parent ? `Вариации: ${parent.title}` : pick(TITLES[type]);
      const tplRow = TEMPLATES.find(t => t[1] === type);
      const desc = `Оффер ${offer.name} (${offer.vertical}), GEO: ${geoClean}. Аудитория 25–45, мобильный трафик.\n` +
        (parent ? 'Сделать 3 вариации победившего креатива: сменить хук и визуал, сохранить посыл.' : 'Акцент на главной выгоде, текст на языке GEO, без запрещённых площадкой обещаний.');
      const [task] = await q(`INSERT INTO tasks (title, offer_id, geo, creative_type, quantity, description, refs, checklist, priority, deadline, buyer_id, template_id, parent_library_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [title, offer.id, geoClean, type, parent ? 3 : 1 + Math.floor(rnd() * 5), desc,
          'https://www.facebook.com/ads/library/\nhttps://ads.tiktok.com/business/creativecenter/', JSON.stringify(tplRow ? tplRow[3] : []),
          prio, new Date(deadline), buyer, tpl[type] || null, parent ? parent.lib : null, new Date(created)]);
      const id = task.id;
      await log(id, buyer, 'created', null, 'new', parent ? 'Вариация креатива из библиотеки' : null, created);

      const age = (NOW - created) / H;
      const target = age > 110 ? 'done' : age > 45 ? wpick([['done', 5], ['review', 1], ['revision', 1], ['in_progress', 1]])
        : age > 10 ? wpick([['in_progress', 3], ['review', 2], ['new', 1], ['revision', 1]]) : wpick([['new', 3], ['in_progress', 1]]);
      let t = created, status = 'new', creative = null, taken = null, first = null, sub = null, done = null, revs = 0;
      const step = (hours) => (t = Math.min(t + hours * H, NOW - 0.3 * H));
      if (target !== 'new') {
        const fit = creatives.filter(c => spec[c].includes(type));
        creative = rnd() < 0.8 && fit.length ? pick(fit) : pick(creatives);
        taken = step(0.5 + rnd() * 6); status = 'in_progress';
        if (rnd() < 0.25) { await log(id, uid.lead, 'assign', 'new', 'in_progress', 'Исполнитель назначен руководителем', taken); ev(creative, uid.lead, id, 'assign', taken); }
        else { await log(id, creative, 'take', 'new', 'in_progress', null, taken); ev(buyer, creative, id, 'take', taken); }
        const rounds = target === 'in_progress' ? -1 : target === 'revision' ? 1 + Math.floor(rnd() * 2) : wpick([[0, 4], [1, 3], [2, 1]]);
        let prevVersion = null;
        for (let r = 0; r <= rounds; r++) {
          const workH = (r === 0 ? 6 + rnd() * 26 : 2 + rnd() * 10) * speed[creative];
          const start = t;
          const subAt = step(workH);
          // time entries: 1–3 sessions covering ~55% of the elapsed span
          const sessions = 1 + Math.floor(rnd() * 3), span = subAt - start;
          for (let k = 0; k < sessions; k++) {
            const sAt = start + span * (k / sessions) + span * 0.05, len = span * 0.55 / sessions;
            await q('INSERT INTO time_entries (task_id, user_id, started_at, ended_at) VALUES ($1,$2,$3,$4)', [id, creative, new Date(sAt), new Date(Math.min(sAt + len, NOW - 60000))]);
          }
          const [v] = await q('INSERT INTO versions (task_id, n, user_id, comment, links, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [id, r + 1, creative, r ? 'Исправил по пунктам правок' : pick(['Готово, 3 варианта на выбор', 'Сделал два подхода — посмотрите оба', 'Готово']), '', 'review', new Date(subAt)]);
          const nFiles = type === 'banner' ? 2 : 1 + Math.floor(rnd() * 3);
          for (let k = 0; k < nFiles; k++) {
            const svg = creativeSvg({ type, vertical: offer.vertical, offer: offer.name, geo: geoClean.split(', ')[0], variant: r * 3 + k, seed: id });
            await q('INSERT INTO files (task_id, version_id, kind, name, mime, size, data, user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
              [id, v.id, 'result', `${type}_${id}_v${r + 1}_${k + 1}.svg`, 'image/svg+xml', Buffer.byteLength(svg), Buffer.from(svg), creative, new Date(subAt)]);
          }
          const used = new Set([pick(services), ...(rnd() < 0.6 ? [pick(services)] : [])]);
          for (const sv of used) await q('INSERT INTO ai_costs (task_id, user_id, service_id, credits, round, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
            [id, creative, sv.id, Math.round((r ? 30 : 80) + rnd() * (r ? 120 : 380)), r, new Date(subAt)]);
          if (prevVersion) await q('UPDATE revision_items SET done = true, done_at = $1 WHERE task_id = $2 AND version_id = $3', [new Date(subAt), id, prevVersion]);
          sub = subAt; first ??= subAt; status = 'review';
          await log(id, creative, 'submit', r ? 'revision' : 'in_progress', 'review', `Версия v${r + 1}`, subAt);
          ev(buyer, creative, id, 'submit', subAt);
          if (rnd() < 0.35) {
            const mention = rnd() < 0.5;
            const body = mention ? `@creative${creatives.indexOf(creative) + 1} глянь, пожалуйста, как смотрится на тёмной теме FB` : pick(['Отличный вариант, жду финал', 'Можно ещё один вариант с другим цветом?', 'Проверю после обеда']);
            const cAt = step(0.3 + rnd());
            await q('INSERT INTO comments (task_id, user_id, body, created_at) VALUES ($1,$2,$3,$4)', [id, buyer, body, new Date(cAt)]);
            ev(creative, buyer, id, mention ? 'mention' : 'comment', cAt, body.slice(0, 120));
          }
          if (r === rounds && target === 'review') break;
          const decideAt = step(0.5 + rnd() * 7);
          if (r < rounds || target === 'revision') {
            revs++; status = 'revision';
            await q(`UPDATE versions SET status = 'revision' WHERE id = $1`, [v.id]);
            const nItems = 1 + Math.floor(rnd() * 3), lines = [];
            for (let k = 0; k < nItems; k++) {
              let reason = wpick(REASONS[type] || REASONS.static);
              if (!/RU|KZ/.test(geoClean) && rnd() < 0.25) reason = 'localization';
              const text = pick(NOTES[reason]); lines.push('• ' + text);
              await q('INSERT INTO revision_items (task_id, version_id, text, reason, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [id, v.id, text, reason, buyer, new Date(decideAt)]);
            }
            await log(id, buyer, 'revise', 'review', 'revision', lines.join('\n'), decideAt);
            ev(creative, buyer, id, 'revise', decideAt, `${nItems} п.`);
            prevVersion = v.id;
            if (r === rounds) break;
          } else {
            done = decideAt; status = 'done';
            await q(`UPDATE versions SET status = 'accepted' WHERE id = $1`, [v.id]);
            await log(id, buyer, 'accept', 'review', 'done', rnd() < 0.4 ? 'Отлично, запускаем' : null, decideAt);
            ev(creative, buyer, id, 'accept', decideAt);
            // launch result: older work is rated; variations of winners win more often
            const daysLive = (NOW - decideAt) / 864e5;
            let libStatus = 'pending', m = {};
            if (daysLive > 2.5) {
              const p = Math.min(0.85, skill[creative] + (parent ? 0.35 : 0) - revs * 0.05);
              libStatus = rnd() < 0.12 ? 'testing' : rnd() < p ? 'winner' : rnd() < 0.6 ? 'average' : 'burned';
              if (libStatus !== 'testing') {
                const roi = libStatus === 'winner' ? 40 + rnd() * 160 : libStatus === 'average' ? -10 + rnd() * 35 : -60 + rnd() * 40;
                m = { spend: Math.round(200 + rnd() * 3800), ctr: +(0.6 + rnd() * (libStatus === 'winner' ? 3.5 : 1.5)).toFixed(2), cr: +(1 + rnd() * 6).toFixed(2), roi: Math.round(roi) };
              }
            } else if (daysLive > 1) libStatus = 'testing';
            const tags = [pick(['хук-результат', 'до/после', 'отзыв', 'ai-аватар', 'скидка', 'ugc', 'юмор', 'срочность'])].join(', ');
            const [lib] = await q(`INSERT INTO library (task_id, version_id, status, tags, spend, ctr, cr, roi, status_by, status_at, created_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
              [id, v.id, libStatus, tags, m.spend ?? null, m.ctr ?? null, m.cr ?? null, m.roi ?? null, libStatus === 'pending' ? null : buyer,
                libStatus === 'pending' ? null : new Date(decideAt + (1 + rnd() * 2) * 864e5 > NOW ? NOW - H : decideAt + (1 + rnd() * 2) * 864e5), new Date(decideAt)]);
            if (libStatus === 'winner') winners.push({ lib: lib.id, type, offer, geo: geoClean, buyer, title: title.replace(/^Вариации: /, ''), at: decideAt });
            if (['winner', 'burned'].includes(libStatus)) ev(creative, buyer, id, 'result', Math.min(decideAt + 2 * 864e5, NOW - H), libStatus);
          }
        }
      }
      await q(`UPDATE tasks SET status=$1, creative_id=$2, taken_at=$3, first_submitted_at=$4, submitted_at=$5, completed_at=$6, revisions=$7 WHERE id=$8`,
        [status, creative, taken && new Date(taken), first && new Date(first), sub && new Date(sub), done && new Date(done), revs, id]);
      if (status === 'in_progress' && rnd() < 0.5) await q('INSERT INTO time_entries (task_id, user_id, started_at) VALUES ($1,$2,$3)', [id, creative, new Date(NOW - (0.3 + rnd()) * H)]).then(() =>
        q('UPDATE time_entries SET ended_at = now() WHERE user_id = $1 AND ended_at IS NULL AND task_id <> $2', [creative, id]));
      if (status === 'new') for (const c of creatives.filter(c => spec[c].includes(type))) ev(c, buyer, id, 'created', created);
    }

    // monthly budgets: calibrated so one service is on track to overspend (shows the alert) and the rest are healthy
    const day = new Date().getUTCDate() + 0.5, days = 30;
    const usage = await q(`SELECT service_id, sum(credits)::float8 AS used FROM ai_costs WHERE created_at >= date_trunc('month', now()) GROUP BY service_id`);
    for (const sv of services) {
      const used = usage.find(u => u.service_id === sv.id)?.used || 50;
      const factor = sv.name === 'Kling' ? 0.85 : sv.name === 'Midjourney' ? 1.05 : 1.5;
      await q('UPDATE ai_services SET monthly_budget = $1 WHERE id = $2', [Math.ceil(used / day * days * factor / 100) * 100, sv.id]);
    }
    const kling = services.find(x => x.name === 'Kling');
    notifs.push([uid.lead, null, null, 'budget', `Kling: 80% месячного бюджета — прогноз превышения`, new Date(NOW - 5 * H), null]);
    for (const n of notifs) await q('INSERT INTO notifications (user_id, actor_id, task_id, type, text, created_at, read_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', n);
  });
  console.log('Demo data seeded');
}

module.exports = { seedIfEmpty, PASSWORD };
