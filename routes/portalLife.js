// routes/portalLife.js — жизнь портала: опросы, бронирование переговорных,
// календарь событий и внутренние новости.
const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../lib/auth');
const { clip } = require('../lib/util');
const { broadcastAll, notify } = require('../lib/sse');
const { removeFromIndex } = require('../lib/rag');

const router = express.Router();

// ── Опросы сотрудников (живые результаты по SSE) ──
router.get('/api/portal/polls', auth, async (req, res) => {
  try {
    const me = req.admin.id;
    const { rows } = await db.query(`SELECT id, question, options, multi, author_id, author_name, created_at FROM polls ORDER BY id DESC LIMIT 100`);
    const out = [];
    for (const p of rows) {
      const v = await db.query(`SELECT option_idx, count(*)::int c FROM poll_votes WHERE poll_id = $1 GROUP BY option_idx`, [p.id]);
      const counts = (p.options || []).map((_, i) => v.rows.find((x) => x.option_idx === i)?.c || 0);
      const voters = (await db.query(`SELECT count(DISTINCT user_id)::int c FROM poll_votes WHERE poll_id = $1`, [p.id])).rows[0].c;
      let mine = [];
      if (me != null) mine = (await db.query(`SELECT option_idx FROM poll_votes WHERE poll_id = $1 AND user_id = $2`, [p.id, me])).rows.map((r) => r.option_idx);
      out.push({ id: p.id, question: p.question, options: p.options, multi: p.multi, author_id: p.author_id, author_name: p.author_name, created_at: p.created_at, counts, total: voters, my_votes: mine });
    }
    res.json(out);
  } catch (e) { console.error('GET /api/portal/polls:', e.message); res.status(500).json({ error: 'Ошибка чтения опросов' }); }
});
router.post('/api/portal/polls', auth, requireRole('admin', 'manager'), async (req, res) => {
  const question = clip(req.body?.question, 300);
  const options = Array.isArray(req.body?.options) ? req.body.options.map((o) => clip(o, 120)).filter(Boolean).slice(0, 8) : [];
  const multi = !!req.body?.multi;
  if (!question || options.length < 2) return res.status(400).json({ error: 'Нужен вопрос и минимум 2 варианта' });
  try {
    const { rows } = await db.query(`INSERT INTO polls (question, options, multi, author_id, author_name) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [question, JSON.stringify(options), multi, req.admin.id, req.admin.u]);
    broadcastAll('poll', { id: rows[0].id });
    res.status(201).json({ id: rows[0].id });
  } catch (e) { console.error('POST /api/portal/polls:', e.message); res.status(500).json({ error: 'Не удалось создать' }); }
});
router.post('/api/portal/polls/:id(\\d+)/vote', auth, async (req, res) => {
  const me = req.admin.id;
  if (me == null) return res.status(403).json({ error: 'Голосование доступно сотрудникам с учётной записью' });
  const id = Number(req.params.id), opt = Number(req.body?.option);
  try {
    const p = await db.query(`SELECT options, multi FROM polls WHERE id = $1`, [id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Опрос не найден' });
    if (!Number.isInteger(opt) || opt < 0 || opt >= (p.rows[0].options || []).length) return res.status(400).json({ error: 'Некорректный вариант' });
    if (p.rows[0].multi) {
      // множественный выбор: переключаем вариант (второй клик — снять голос)
      const has = (await db.query(`SELECT 1 FROM poll_votes WHERE poll_id=$1 AND user_id=$2 AND option_idx=$3`, [id, me, opt])).rows.length;
      if (has) await db.query(`DELETE FROM poll_votes WHERE poll_id=$1 AND user_id=$2 AND option_idx=$3`, [id, me, opt]);
      else await db.query(`INSERT INTO poll_votes (poll_id, user_id, option_idx) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [id, me, opt]);
    } else {
      // одиночный выбор: заменяем прежний голос
      await db.query(`DELETE FROM poll_votes WHERE poll_id=$1 AND user_id=$2`, [id, me]);
      await db.query(`INSERT INTO poll_votes (poll_id, user_id, option_idx) VALUES ($1,$2,$3)`, [id, me, opt]);
    }
    broadcastAll('poll', { id });
    res.json({ ok: true });
  } catch (e) { console.error('POST /api/portal/polls/vote:', e.message); res.status(500).json({ error: 'Не удалось проголосовать' }); }
});
router.delete('/api/portal/polls/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const p = await db.query(`SELECT author_id FROM polls WHERE id = $1`, [id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Не найдено' });
    if (p.rows[0].author_id !== req.admin.id && req.admin.role !== 'admin') return res.status(403).json({ error: 'Нет прав' });
    await db.query(`DELETE FROM poll_votes WHERE poll_id = $1`, [id]);
    await db.query(`DELETE FROM polls WHERE id = $1`, [id]);
    broadcastAll('poll', { id, deleted: true });
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/portal/polls:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

// ── Бронирование переговорных ──
router.get('/api/portal/rooms', auth, async (req, res) => {
  try { res.json((await db.query(`SELECT id, name, capacity FROM rooms ORDER BY sort_order, id`)).rows); }
  catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});
router.get('/api/portal/bookings', auth, async (req, res) => {
  const day = String(req.query.day || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  try {
    const rows = (await db.query(`SELECT id, room_id, title, day, start_min, end_min, user_id, user_name FROM bookings WHERE day=$1 ORDER BY start_min`, [day])).rows;
    res.json({ day, bookings: rows });
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});
router.post('/api/portal/bookings', auth, async (req, res) => {
  const me = req.admin.id;
  const room_id = Number(req.body?.room_id), day = String(req.body?.day || '').slice(0, 10);
  const start_min = Number(req.body?.start_min), end_min = Number(req.body?.end_min);
  const title = clip(req.body?.title, 200) || 'Встреча';
  if (!room_id || !day || !(end_min > start_min)) return res.status(400).json({ error: 'Некорректные данные' });
  try {
    const conflict = (await db.query(`SELECT 1 FROM bookings WHERE room_id=$1 AND day=$2 AND start_min < $4 AND end_min > $3 LIMIT 1`, [room_id, day, start_min, end_min])).rows.length;
    if (conflict) return res.status(409).json({ error: 'Это время в переговорной уже занято' });
    const { rows } = await db.query(`INSERT INTO bookings (room_id,title,day,start_min,end_min,user_id,user_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [room_id, title, day, start_min, end_min, me, req.admin.u]);
    broadcastAll('booking', { day });
    res.status(201).json({ id: rows[0].id });
  } catch (e) { console.error('POST bookings:', e.message); res.status(500).json({ error: 'Не удалось забронировать' }); }
});
router.delete('/api/portal/bookings/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const b = (await db.query(`SELECT user_id FROM bookings WHERE id=$1`, [id])).rows[0];
    if (!b) return res.status(404).json({ error: 'Не найдено' });
    if (b.user_id !== req.admin.id && !['admin', 'manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Нет прав' });
    await db.query(`DELETE FROM bookings WHERE id=$1`, [id]);
    broadcastAll('booking', {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Не удалось' }); }
});

// ── Портал: КАЛЕНДАРЬ ─────────────────────────────────────────────────────────
// События = хранимые (встречи/презентации/праздники из таблицы events) + вычисляемые
// на лету дни рождения (users.birth_date) + дедлайны задач (tasks.due_date) + гос.праздники РК.
const EVENT_KINDS = ['holiday', 'meeting', 'presentation', 'other'];
// Гос. праздники Казахстана (фиксированные даты ММ-ДД) — генерируются на любой год.
const KZ_HOLIDAYS = [
  ['01-01', 'Новый год'], ['01-02', 'Новый год'], ['01-07', 'Православное Рождество'],
  ['03-08', 'Международный женский день'], ['03-21', 'Наурыз мейрамы'], ['03-22', 'Наурыз мейрамы'],
  ['03-23', 'Наурыз мейрамы'], ['05-01', 'Праздник единства народа Казахстана'],
  ['05-07', 'День защитника Отечества'], ['05-09', 'День Победы'], ['07-06', 'День столицы'],
  ['08-30', 'День Конституции'], ['10-25', 'День Республики'], ['12-16', 'День Независимости'],
];
router.get('/api/portal/events', auth, async (req, res) => {
  // Диапазон запрашиваемого месяца (ISO-даты from/to); по умолчанию текущий месяц ±.
  const from = (req.query.from && String(req.query.from).slice(0, 10)) || null;
  const to = (req.query.to && String(req.query.to).slice(0, 10)) || null;
  try {
    const out = [];
    // 1) Хранимые события (встречи/презентации/праздники/другое), видимые всем или своему отделу.
    const ev = await db.query(
      `SELECT e.id, e.kind, e.title, e.descr, e.starts_at, e.ends_at, e.all_day, e.department, e.created_by, e.created_by_name
         FROM events e
        WHERE ($1::date IS NULL OR e.starts_at >= $1::date)
          AND ($2::date IS NULL OR e.starts_at < ($2::date + INTERVAL '1 day'))
        ORDER BY e.starts_at`, [from, to]);
    for (const e of ev.rows) { const canManage = e.created_by === req.admin.id || ['admin', 'manager'].includes(req.admin.role); out.push({ ...e, source: 'event', can_delete: canManage, can_edit: canManage }); }
    // 2) Дни рождения — из дат рождения сотрудников, спроецированные на годы диапазона.
    const bd = await db.query(`SELECT id, COALESCE(NULLIF(full_name,''), username) AS name, birth_date FROM users WHERE active = TRUE AND birth_date IS NOT NULL`);
    const years = [];
    { const y0 = from ? +from.slice(0, 4) : new Date().getFullYear(); const y1 = to ? +to.slice(0, 4) : y0; for (let y = y0; y <= y1; y++) years.push(y); if (!years.length) years.push(new Date().getFullYear()); }
    for (const u of bd.rows) {
      const md = String(u.birth_date).slice(5, 10);
      for (const y of years) {
        const d = `${y}-${md}`;
        if ((!from || d >= from) && (!to || d <= to)) out.push({ id: `bd-${u.id}-${y}`, kind: 'birthday', title: `День рождения — ${u.name}`, starts_at: d + 'T00:00:00', all_day: true, source: 'birthday', can_delete: false });
      }
    }
    // 3) Дедлайны задач текущего пользователя.
    const tk = await db.query(
      `SELECT id, title, due_date, status FROM tasks
        WHERE (assignee_id = $1 OR created_by = $2) AND due_date IS NOT NULL
          AND ($3::date IS NULL OR due_date >= $3::date) AND ($4::date IS NULL OR due_date <= $4::date)`,
      [req.admin.id, req.admin.u, from, to]);
    for (const t of tk.rows) out.push({ id: `task-${t.id}`, kind: 'task', title: `Задача: ${t.title}`, starts_at: String(t.due_date).slice(0, 10) + 'T00:00:00', all_day: true, source: 'task', done: t.status === 'done', can_delete: false });
    // 4) Гос. праздники РК (фиксированные даты) на годы диапазона.
    for (const y of years) for (const [md, name] of KZ_HOLIDAYS) {
      const d = `${y}-${md}`;
      if ((!from || d >= from) && (!to || d <= to)) out.push({ id: `hol-${d}`, kind: 'holiday', title: name, starts_at: d + 'T00:00:00', all_day: true, source: 'holiday', can_delete: false });
    }
    res.json(out);
  } catch (e) { console.error('GET /api/portal/events:', e.message); res.status(500).json({ error: 'Ошибка чтения календаря' }); }
});
router.post('/api/portal/events', auth, async (req, res) => {
  const kind = EVENT_KINDS.includes(req.body?.kind) ? req.body.kind : 'meeting';
  const title = clip(req.body?.title, 200);
  const descr = clip(req.body?.descr, 1000);
  const starts_at = req.body?.starts_at ? new Date(req.body.starts_at) : null;
  if (!title || !starts_at || isNaN(+starts_at)) return res.status(400).json({ error: 'Укажите название и дату события' });
  // Праздники в календарь может добавлять только админ; встречи/презентации — любой сотрудник.
  if (kind === 'holiday' && req.admin.role !== 'admin') return res.status(403).json({ error: 'Праздники добавляет администратор' });
  const ends_at = req.body?.ends_at ? new Date(req.body.ends_at) : null;
  const all_day = !!req.body?.all_day;
  const department = clip(req.body?.department, 120);
  const name = clip(req.body?.author_name, 120) || req.admin.u;
  try {
    const { rows } = await db.query(
      `INSERT INTO events (kind, title, descr, starts_at, ends_at, all_day, department, created_by, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, kind, title, descr, starts_at, ends_at, all_day, department, created_by, created_by_name`,
      [kind, title, descr, starts_at, ends_at && !isNaN(+ends_at) ? ends_at : null, all_day, department, req.admin.id, name]);
    broadcastAll('event', { id: rows[0].id });   // календарь у всех обновится мгновенно (в т.ч. после ДиДи)
    res.status(201).json({ ...rows[0], source: 'event', can_delete: true, can_edit: true });
  } catch (e) { console.error('POST /api/portal/events:', e.message); res.status(500).json({ error: 'Не удалось создать событие' }); }
});
// Перенос/правка события: ассистент («перенеси встречу с 10 на 12») и календарь.
// Права как у удаления: автор события либо admin/manager.
router.patch('/api/portal/events/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const ev = await db.query(`SELECT created_by FROM events WHERE id = $1`, [id]);
    if (!ev.rows.length) return res.status(404).json({ error: 'Не найдено' });
    if (ev.rows[0].created_by !== req.admin.id && !['admin', 'manager'].includes(req.admin.role))
      return res.status(403).json({ error: 'Нет прав' });
    const sets = [], vals = [];
    if (req.body?.starts_at !== undefined) {
      const d = new Date(req.body.starts_at);
      if (isNaN(+d)) return res.status(400).json({ error: 'Некорректная дата' });
      vals.push(d); sets.push(`starts_at = $${vals.length}`);
    }
    if (req.body?.title !== undefined) {
      const t = clip(req.body.title, 200);
      if (!t) return res.status(400).json({ error: 'Пустое название' });
      vals.push(t); sets.push(`title = $${vals.length}`);
    }
    if (req.body?.all_day !== undefined) { vals.push(!!req.body.all_day); sets.push(`all_day = $${vals.length}`); }
    if (req.body?.descr !== undefined) { vals.push(clip(req.body.descr, 1000)); sets.push(`descr = $${vals.length}`); }
    if (req.body?.kind !== undefined && EVENT_KINDS.includes(req.body.kind)) {
      // Праздник может ставить только админ (как и при создании).
      if (req.body.kind === 'holiday' && req.admin.role !== 'admin') return res.status(403).json({ error: 'Праздники — только администратор' });
      vals.push(req.body.kind); sets.push(`kind = $${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Нечего обновлять' });
    vals.push(id);
    const { rows } = await db.query(
      `UPDATE events SET ${sets.join(', ')} WHERE id = $${vals.length}
       RETURNING id, kind, title, descr, starts_at, ends_at, all_day, department, created_by, created_by_name`, vals);
    broadcastAll('event', { id });   // перенос встречи виден всем сразу
    res.json({ ...rows[0], source: 'event', can_delete: true, can_edit: true });
  } catch (e) { console.error('PATCH /api/portal/events:', e.message); res.status(500).json({ error: 'Не удалось обновить' }); }
});
router.delete('/api/portal/events/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const ev = await db.query(`SELECT created_by FROM events WHERE id = $1`, [id]);
    if (!ev.rows.length) return res.status(404).json({ error: 'Не найдено' });
    if (ev.rows[0].created_by !== req.admin.id && !['admin', 'manager'].includes(req.admin.role))
      return res.status(403).json({ error: 'Нет прав' });
    await db.query(`DELETE FROM events WHERE id = $1`, [id]);
    await removeFromIndex('event', id);   // сразу убрать из глобального поиска
    broadcastAll('event', { id, deleted: true });
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/portal/events:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

// ── Портал: ВНУТРЕННИЕ НОВОСТИ ────────────────────────────────────────────────
const PNEWS_CATS = ['company', 'hr', 'it', 'finance', 'event'];
// Право писать новости: админ, начальник отдела (manager) или сотрудник с флагом can_write_news.
async function canWriteNews(admin) {
  if (['admin', 'manager'].includes(admin.role)) return true;
  if (!admin.id) return false;
  try { const { rows } = await db.query(`SELECT can_write_news FROM users WHERE id = $1`, [admin.id]); return !!(rows[0] && rows[0].can_write_news); }
  catch { return false; }
}
router.get('/api/portal/news', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, body, category, pinned, author_id, author_name, created_at
         FROM portal_news ORDER BY pinned DESC, created_at DESC LIMIT 100`);
    res.json({ items: rows, canWrite: await canWriteNews(req.admin) });
  } catch (e) { console.error('GET /api/portal/news:', e.message); res.status(500).json({ error: 'Ошибка чтения новостей' }); }
});
router.post('/api/portal/news', auth, async (req, res) => {
  if (!(await canWriteNews(req.admin))) return res.status(403).json({ error: 'Публиковать новости могут админ, начальники отделов и сотрудники с правом' });
  const title = clip(req.body?.title, 200);
  const body = clip(req.body?.body, 6000);
  if (!title || !body) return res.status(400).json({ error: 'Укажите заголовок и текст' });
  const category = PNEWS_CATS.includes(req.body?.category) ? req.body.category : 'company';
  const pinned = !!req.body?.pinned;
  const author_name = clip(req.body?.author_name, 120) || req.admin.u;
  try {
    const { rows } = await db.query(
      `INSERT INTO portal_news (title, body, category, pinned, author_id, author_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title, body, category, pinned, author_id, author_name, created_at`,
      [title, body, category, pinned, req.admin.id, author_name]);
    // Уведомляем всех активных сотрудников о новой новости.
    try {
      const us = await db.query(`SELECT id FROM users WHERE active = TRUE AND id <> $1`, [req.admin.id || 0]);
      for (const u of us.rows) await notify(u.id, 'news', null, 'Новая новость', title);
    } catch { /* уведомления не критичны */ }
    res.status(201).json(rows[0]);
  } catch (e) { console.error('POST /api/portal/news:', e.message); res.status(500).json({ error: 'Не удалось опубликовать' }); }
});
router.delete('/api/portal/news/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const n = await db.query(`SELECT author_id FROM portal_news WHERE id = $1`, [id]);
    if (!n.rows.length) return res.status(404).json({ error: 'Не найдено' });
    if (n.rows[0].author_id !== req.admin.id && req.admin.role !== 'admin')
      return res.status(403).json({ error: 'Нет прав' });
    await db.query(`DELETE FROM portal_news WHERE id = $1`, [id]);
    await removeFromIndex('news', id);   // сразу убрать из глобального поиска
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/portal/news:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

module.exports = router;
