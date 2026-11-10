// Demo data: users + ~36 tasks simulated through the real workflow over the last 30 days.
const crypto = require('crypto');
const { db, hash } = require('./db');

const USERS = [
  ['lead', 'Анна Руководитель', 'lead'],
  ['buyer1', 'Максим (байер)', 'buyer'],
  ['buyer2', 'Ольга (байер)', 'buyer'],
  ['buyer3', 'Денис (байер)', 'buyer'],
  ['creative1', 'Ира (моушн)', 'creative'],
  ['creative2', 'Тимур (видео)', 'creative'],
  ['creative3', 'Лена (статика)', 'creative'],
  ['creative4', 'Паша (AI-арт)', 'creative'],
];
const PASSWORD = 'demo123';

const OFFERS = ['Gambling — Vavada', 'Nutra — Keto Slim', 'Dating — LoveMatch', 'Crypto — BitProfit', 'E-com — SmartWatch X', 'Finance — QuickLoan', 'Nutra — Joint Flex', 'Sweepstakes — iPhone 17'];
const GEOS = ['RU', 'KZ', 'DE', 'BR', 'IN', 'PL', 'TR', 'US', 'MX', 'ES'];
const TYPES = ['video', 'static', 'banner', 'gif', 'playable', 'ugc'];
const PRIOS = ['low', 'medium', 'medium', 'high', 'high', 'urgent'];
const AI = ['Midjourney', 'Runway', 'Kling', 'ElevenLabs', 'ChatGPT', 'Leonardo', 'HeyGen', 'Suno'];
const TITLES = {
  video: ['Вертикальное видео 15с с хуком', 'UGC-нарезка с отзывом', 'Видео с AI-аватаром'],
  static: ['Статика под Facebook 1:1', 'Пачка статики с офферами', 'Before/after статика'],
  banner: ['Баннеры под пуши', 'Набор баннеров 300×250 / 728×90', 'Нативные тизеры'],
  gif: ['GIF-анимация выигрыша', 'Анимированный тизер'],
  playable: ['Playable-демо слота', 'Мини-игра «колесо фортуны»'],
  ugc: ['UGC-видео от лица покупателя', 'Сторис-формат с реакцией'],
};
const REVISION_NOTES = ['Хук слабый, сделайте первые 2 секунды динамичнее', 'Поменять CTA на «Забрать бонус»', 'Шрифт плохо читается на мобилке', 'Нужна локализация текста под GEO', 'Цвета не в стиле лендинга'];

let seed = 42;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const H = 36e5;

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n) return;
  db.exec('BEGIN');
  const ids = {};
  for (const [login, name, role] of USERS) {
    const salt = crypto.randomBytes(8).toString('hex');
    ids[login] = db.prepare('INSERT INTO users (login, name, role, password_hash, salt) VALUES (?, ?, ?, ?, ?)')
      .run(login, name, role, hash(PASSWORD, salt), salt).lastInsertRowid;
  }
  const buyers = ['buyer1', 'buyer2', 'buyer3'].map(l => ids[l]);
  const creatives = ['creative1', 'creative2', 'creative3', 'creative4'].map(l => ids[l]);

  const insTask = db.prepare(`INSERT INTO tasks (title, offer, geo, creative_type, quantity, description, refs, priority, deadline, status, buyer_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`);
  const insHist = db.prepare(`INSERT INTO history (task_id, user_id, action, from_status, to_status, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insRes = db.prepare(`INSERT INTO results (task_id, user_id, round, files, links, comment, created_at) VALUES (?, ?, ?, '[]', ?, ?, ?)`);
  const insAi = db.prepare(`INSERT INTO ai_costs (task_id, user_id, service, credits, round, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  const upd = db.prepare(`UPDATE tasks SET status=?, creative_id=?, taken_at=?, first_submitted_at=?, submitted_at=?, completed_at=?, revisions=? WHERE id=?`);

  const NOW = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const N = 42;
  for (let i = 0; i < N; i++) {
    const type = pick(TYPES), offer = pick(OFFERS), geo = pick(GEOS), prio = pick(PRIOS);
    const buyer = pick(buyers);
    // older tasks are more likely to be finished
    const created = NOW - (30 * Math.pow(1 - i / N, 2.2) * 24 + 2 + rnd() * 4) * H;
    const slaH = { urgent: 24, high: 48, medium: 72, low: 120 }[prio];
    const deadline = created + slaH * H;
    const id = insTask.run(pick(TITLES[type]), offer, geo, type, 1 + Math.floor(rnd() * 5),
      `Нужны креативы под ${offer} на ${geo}. Аудитория 25–45, мобильный трафик. Тексты на языке GEO, акцент на выгоде.`,
      'https://www.facebook.com/ads/library/\nhttps://www.tiktok.com/business/creativecenter',
      prio, iso(deadline), buyer, iso(created)).lastInsertRowid;
    insHist.run(id, buyer, 'created', null, 'new', null, iso(created));

    const age = (NOW - created) / H;
    const st = { status: 'new', creative: null, taken: null, first: null, sub: null, done: null, rev: 0 };
    // how far along the pipeline this task gets
    const target = age > 120 ? 'done' : age > 48 ? pick(['done', 'done', 'review', 'revision', 'in_progress']) :
      age > 12 ? pick(['in_progress', 'review', 'new', 'revision']) : pick(['new', 'new', 'in_progress']);
    let t = created;
    const step = (h) => Math.min((t += h * H), NOW - 0.2 * H);
    if (target !== 'new') {
      const c = pick(creatives);
      st.creative = c; st.taken = step(1 + rnd() * 10); st.status = 'in_progress';
      insHist.run(id, c, 'take', 'new', 'in_progress', null, iso(st.taken));
      const speed = c === creatives[3] ? 0.6 : c === creatives[1] ? 1.5 : 1; // AI-artist is fastest, video slowest
      const rounds = target === 'in_progress' ? -1 : target === 'revision' ? 1 + Math.floor(rnd() * 2) : Math.floor(rnd() * 2.6);
      for (let r = 0; r <= rounds; r++) {
        const subAt = step((r === 0 ? 8 + rnd() * 30 : 3 + rnd() * 12) * speed);
        st.sub = subAt; st.first ??= subAt;
        insHist.run(id, c, 'submit', r === 0 ? 'in_progress' : 'revision', 'review', null, iso(subAt));
        insRes.run(id, c, r, `https://drive.google.com/drive/folders/demo-${id}-${r}`, r ? 'Исправил по комментариям' : 'Готово, 3 варианта', iso(subAt));
        const services = [pick(AI), ...(rnd() > 0.5 ? [pick(AI)] : [])];
        new Set(services).forEach(s => insAi.run(id, c, s, Math.round((r ? 20 : 50) + rnd() * (r ? 60 : 250)), r, iso(subAt)));
        st.status = 'review';
        const isLast = r === rounds;
        if (isLast && target === 'review') break;
        const decideAt = step(1 + rnd() * 8);
        if (!isLast || target === 'revision') {
          st.rev++; st.status = 'revision';
          insHist.run(id, buyer, 'revise', 'review', 'revision', pick(REVISION_NOTES), iso(decideAt));
          if (isLast) break;
        } else {
          st.done = decideAt; st.status = 'done';
          insHist.run(id, buyer, 'accept', 'review', 'done', rnd() > 0.6 ? 'Отлично, запускаем' : null, iso(decideAt));
        }
      }
    }
    upd.run(st.status, st.creative, st.taken && iso(st.taken), st.first && iso(st.first), st.sub && iso(st.sub),
      st.done && iso(st.done), st.rev, id);
  }
  db.exec('COMMIT');
  console.log('Demo data seeded');
}

module.exports = { seedIfEmpty, PASSWORD };
if (require.main === module) seedIfEmpty();
