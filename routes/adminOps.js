// routes/adminOps.js — служебные разделы админки: дашборд + ИИ-инсайт, ИИ-аналитика
// заявителей, массовые рассылки, экспорт/бэкап, аудит безопасности, база знаний, история.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { APP_VERSION } = require('../lib/config');
const { auth, requireRole, logAudit } = require('../lib/auth');
const { clip, parseJsonLoose, cleanAnswer } = require('../lib/util');
const { notify, broadcastAll, onlineUserIds, onlineCount } = require('../lib/sse');
const { OPENAI_KEY, GEMINI_KEYS, aiText, aiBatch } = require('../lib/ai');

const router = express.Router();

// ── Админ: дашборд (сводка) ───────────────────────────────────────────────────
router.get('/api/admin/dashboard', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [lt, ln, lw, nt, np, fc, au] = await Promise.all([
      // Отклики на вакансии (kind='career') не считаем — они в разделе «Карьера»,
      // иначе цифры дашборда расходятся со списком CRM (/api/leads их тоже исключает).
      db.query(`SELECT count(*)::int c FROM leads WHERE COALESCE(kind,'') <> 'career'`),
      db.query(`SELECT count(*)::int c FROM leads WHERE status='new' AND COALESCE(kind,'') <> 'career'`),
      db.query(`SELECT count(*)::int c FROM leads WHERE status='in_progress' AND COALESCE(kind,'') <> 'career'`),
      db.query(`SELECT count(*)::int c FROM news`),
      db.query(`SELECT count(*)::int c FROM news WHERE published=true`),
      db.query(`SELECT content, fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`),
      db.query(`SELECT actor, actor_role, entity, entity_id, action, summary, created_at FROM audit_log ORDER BY id DESC LIMIT 8`),
    ]);

    // Доп-агрегации для графиков — не должны ронять весь дашборд при ошибке
    let by_status = [];
    let by_day = [];
    try {
      const bs = await db.query(`SELECT status, count(*)::int AS c FROM leads WHERE COALESCE(kind,'') <> 'career' GROUP BY status`);
      by_status = bs.rows;
    } catch (e) { console.error('dashboard by_status:', e.message); }
    try {
      const bd = await db.query(`
        SELECT to_char(gs.d, 'YYYY-MM-DD') AS day,
               count(l.id)::int AS leads
        FROM generate_series(
               (current_date - 13)::timestamp,
               current_date::timestamp,
               interval '1 day'
             ) AS gs(d)
        LEFT JOIN leads l
          ON l.created_at >= gs.d
         AND l.created_at <  gs.d + interval '1 day'
         AND COALESCE(l.kind,'') <> 'career'
        GROUP BY gs.d
        ORDER BY gs.d
      `);
      by_day = bd.rows;
    } catch (e) { console.error('dashboard by_day:', e.message); }

    const feedContent = fc.rows[0] ? fc.rows[0].content : null;
    const feedItems = Array.isArray(feedContent) ? feedContent : (feedContent && Array.isArray(feedContent.items) ? feedContent.items : []);
    res.json({
      leads_total: lt.rows[0].c, leads_new: ln.rows[0].c, leads_progress: lw.rows[0].c,
      news_total: nt.rows[0].c, news_published: np.rows[0].c,
      feed_count: feedItems.length, feed_updated: fc.rows[0] ? fc.rows[0].fetched_at : null,
      recent: au.rows,
      by_status,
      by_day,
      online: onlineCount(),   // сотрудников онлайн (живые SSE-соединения)
      health: { db: true, ai: !!OPENAI_KEY, gemini: GEMINI_KEYS.length > 0, uptime: Math.round(process.uptime()), version: APP_VERSION },
    });
  } catch (e) { console.error('GET /api/admin/dashboard:', e.message); res.status(500).json({ error: 'Не удалось загрузить дашборд' }); }
});

// ИИ-инсайт по дашборду: короткая сводка «что происходит» + рекомендация на естественном языке.
// Кэш на 15 минут по «медленным» цифрам (без online) — экономим токены при повторных нажатиях.
let insightCache = { sig: '', text: '', at: 0 };
router.post('/api/admin/insight', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const s = req.body?.stats || {};
    const sig = [s.leads_total, s.leads_new, s.leads_progress, s.last14, s.news_published].join('|');   // online исключён — меняется часто
    if (insightCache.sig === sig && Date.now() - insightCache.at < 15 * 60 * 1000) return res.json({ insight: insightCache.text, cached: true });
    const prompt = `Ты — аналитик Центра цифрового развития. По цифрам портала дай КОРОТКУЮ сводку (2–3 предложения) по-русски: что происходит с заявками и активностью, и одну практическую рекомендацию. Без воды и без markdown.\nЦифры: всего заявок ${s.leads_total || 0}, новых ${s.leads_new || 0}, в работе ${s.leads_progress || 0}, за 14 дней ${s.last14 || 0}, новостей опубликовано ${s.news_published || 0}, сотрудников онлайн ${s.online || 0}.`;
    const text = cleanAnswer(await aiText(prompt)) || 'Недостаточно данных для инсайта.';
    insightCache = { sig, text, at: Date.now() };
    res.json({ insight: text });
  } catch (e) { console.error('POST /api/admin/insight:', e.message); res.status(502).json({ error: 'ИИ недоступен' }); }
});

// ── ИИ-аналитика клиентов (Gemini) с кэшированием ────────────────────────────
function leadsSignature(rows) {
  const parts = rows.map((r) => `${r.id}:${r.status}:${r.rating}:${new Date(r.updated_at).getTime()}`);
  return crypto.createHash('sha1').update(rows.length + '|' + parts.join(',')).digest('hex');
}

// Текущий (последний) кэшированный анализ
router.get('/api/admin/ai/analysis', auth, requireRole('admin', 'editor', 'manager'), async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT content, leads_sig, created_at FROM ai_analysis ORDER BY id DESC LIMIT 1`);
    if (!rows.length) return res.json({ analysis: null });
    res.json({ analysis: rows[0].content, cached_at: rows[0].created_at, sig: rows[0].leads_sig });
  } catch (e) {
    console.error('GET /api/admin/ai/analysis:', e.message);
    res.status(500).json({ error: 'Ошибка чтения анализа' });
  }
});

// Запуск анализа. Если заявки не менялись (та же подпись) — отдаём кэш без вызова ИИ.
router.post('/api/admin/ai/analyze', auth, requireRole('admin', 'editor', 'manager'), async (req, res) => {
  const force = !!(req.body && req.body.force);
  try {
    // ИИ-анализ людей, заполнивших форму: сегменты заявителей и частые темы запросов
    // по ВСЕМ заявкам. DDC ничего не продаёт — воронку/конверсию здесь не считаем.
    const { rows: leads } = await db.query(
      `SELECT id, full_name, email, phone, subject, message, status, admin_comment, rating, created_at, updated_at
       FROM leads WHERE COALESCE(kind,'') <> 'career' ORDER BY created_at DESC LIMIT 200`
    );
    const sig = leadsSignature(leads);

    if (!force) {
      const { rows: cached } = await db.query(
        `SELECT content, created_at FROM ai_analysis WHERE leads_sig = $1 ORDER BY id DESC LIMIT 1`, [sig]
      );
      if (cached.length) return res.json({ analysis: cached[0].content, cached_at: cached[0].created_at, fromCache: true });
    }

    if (!leads.length) {
      const empty = { summary: 'Заявок пока нет — анализировать нечего.', segments: [], topics: [], important_clients: [], recommendations: [] };
      await db.query(`INSERT INTO ai_analysis (leads_sig, content) VALUES ($1, $2)`, [sig, JSON.stringify(empty)]);
      return res.json({ analysis: empty, fromCache: false });
    }

    const compact = leads.slice(0, 60).map((l) => ({
      id: l.id, name: l.full_name,
      subject: l.subject, message: (l.message || '').slice(0, 140),
      status: l.status, rating: l.rating, note: (l.admin_comment || '').slice(0, 100),
    }));
    const prompt =
`Ты — аналитик обращений в Центр цифрового развития (ЦЦР/DDC). DDC ничего НЕ продаёт — это центр развития, поэтому НЕ оценивай воронку, конверсию или выручку. Твоя задача — понять ЛЮДЕЙ, которые заполнили форму на сайте: кто они, зачем обращаются и какие темы запросов преобладают.
Проанализируй заявки и верни ТОЛЬКО JSON такого вида:
{"summary":"2-3 предложения: кто обращается и с чем","segments":[{"name":"короткое название сегмента заявителей","count":число_заявок_в_сегменте,"description":"кто это и что им нужно","action":"как с ними работать"}],"topics":[{"topic":"тема/тип запроса","count":число}],"important_clients":[{"id":число,"name":"имя","priority":"high|medium|low","reason":"почему обращение важно или срочно","action":"что конкретно сделать"}],"recommendations":["конкретный следующий шаг для команды"]}
Сегментируй по сути запроса и типу заявителя (например: бизнес, госорганы, частные лица, студенты — по тому, что видно из заявок). До 6 сегментов, до 8 тем, до 6 важных обращений. В action и recommendations — конкретные действия (а не общие слова). Кратко, по-русски. Заявки: ${JSON.stringify(compact)}`;

    let analysis = null, lastErr = null;
    for (let attempt = 0; attempt < 2 && !analysis; attempt++) {
      try {
        const text = await aiBatch(prompt);   // Gemini-первый (аналитика), OpenAI — фолбэк
        analysis = parseJsonLoose(text);
        if (!analysis) lastErr = new Error('не удалось разобрать ответ ИИ');
      } catch (e) { lastErr = e; }
      if (!analysis && attempt < 1) await new Promise((r) => setTimeout(r, 700));
    }
    if (!analysis) {
      return res.status(502).json({ error: 'ИИ-анализ недоступен: ' + (lastErr ? lastErr.message : 'неизвестная ошибка') });
    }
    await db.query(`INSERT INTO ai_analysis (leads_sig, content) VALUES ($1, $2)`, [sig, JSON.stringify(analysis)]);
    res.json({ analysis, fromCache: false });
  } catch (e) {
    console.error('POST /api/admin/ai/analyze:', e.message);
    res.status(502).json({ error: 'ИИ-анализ недоступен: ' + e.message });
  }
});

// ── Массовые рассылки сотрудникам ──────────────────────────────────────────
// Создаёт in-app уведомление каждому адресату (мгновенно по SSE) и, при channel='news',
// публикует новость на портале. Реальный SMTP не настроен — рассылка внутренняя.
router.get('/api/admin/broadcasts', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const rows = (await db.query(`SELECT id,title,body,channel,audience,author,recipients,created_at FROM broadcasts ORDER BY id DESC LIMIT 50`)).rows;
    // варианты аудиторий для формы
    const depts = (await db.query(`SELECT DISTINCT department FROM users WHERE department <> '' ORDER BY department`)).rows.map((r) => r.department);
    res.json({ broadcasts: rows, departments: depts });
  } catch (e) { console.error('GET /api/admin/broadcasts:', e.message); res.status(500).json({ error: 'Ошибка' }); }
});
router.post('/api/admin/broadcasts', auth, requireRole('admin', 'manager'), async (req, res) => {
  const title = clip(req.body?.title, 200);
  const body = clip(req.body?.body, 4000);
  const channel = req.body?.channel === 'news' ? 'news' : 'portal';
  const audience = clip(req.body?.audience, 80) || 'all';
  if (!title || !body) return res.status(400).json({ error: 'Укажите заголовок и текст рассылки' });
  try {
    // Резолвим адресатов по аудитории: all | role:<role> | dept:<название>
    let where = '', params = [];
    if (audience.startsWith('role:')) { where = 'WHERE role = $1'; params = [audience.slice(5)]; }
    else if (audience.startsWith('dept:')) { where = 'WHERE department = $1'; params = [audience.slice(5)]; }
    const targets = (await db.query(`SELECT id FROM users ${where}`, params)).rows;
    // Доставка уведомлений (не блокируем на ошибках отдельных адресатов)
    let delivered = 0;
    for (const u of targets) { await notify(u.id, 'broadcast', null, title, body); delivered++; }
    // Опционально — публикуем как новость портала
    if (channel === 'news') {
      await db.query(
        `INSERT INTO news (title_ru,excerpt_ru,body_ru,color,news_date,published) VALUES ($1,$2,$3,$4,CURRENT_DATE,TRUE)`,
        [title, body.slice(0, 200), body, '#2f6fe0']);
      broadcastAll('news', {});
    }
    const { rows } = await db.query(
      `INSERT INTO broadcasts (title,body,channel,audience,author,recipients) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,created_at`,
      [title, body, channel, audience, (req.admin?.u || 'admin'), delivered]);
    logAudit(req, 'broadcast', rows[0].id, 'create', `Рассылка «${title}» → ${delivered} чел. (${audience})`);
    res.status(201).json({ id: rows[0].id, recipients: delivered, created_at: rows[0].created_at });
  } catch (e) { console.error('POST /api/admin/broadcasts:', e.message); res.status(500).json({ error: 'Не удалось отправить рассылку' }); }
});

// ── Экспорт / резервная копия данных (CSV по таблице или полный JSON-бэкап) ──
const EXPORT_TABLES = {
  users: { cols: ['id', 'username', 'full_name', 'phone', 'department', 'position', 'role', 'birth_date', 'hired_at', 'created_at'], order: 'id' },
  leads: { cols: ['id', 'full_name', 'email', 'phone', 'subject', 'status', 'rating', 'kind', 'created_at'], order: 'id' },
  news: { cols: ['id', 'title_ru', 'news_date', 'published', 'created_at'], order: 'id' },
  services: { cols: ['id', 'name_ru', 'desc_ru', 'published', 'sort_order'], order: 'sort_order,id' },
  departments: { cols: ['id', 'name', 'descr', 'created_at'], order: 'id' },
  tasks: { cols: ['id', 'title', 'status', 'priority', 'assignee_id', 'due_date', 'created_at'], order: 'id' },
  systems: { cols: ['id', 'name', 'category', 'status', 'uptime', 'check_kind', 'latency_ms', 'last_checked'], order: 'sort_order,id' },
  incidents: { cols: ['id', 'system_id', 'title', 'severity', 'status', 'started_at', 'resolved_at'], order: 'id' },
  wiki: { cols: ['id', 'title', 'category', 'author', 'updated_at'], order: 'id' },
  audit_log: { cols: ['id', 'actor', 'actor_role', 'entity', 'action', 'summary', 'created_at'], order: 'id DESC' },
  broadcasts: { cols: ['id', 'title', 'channel', 'audience', 'author', 'recipients', 'created_at'], order: 'id DESC' },
};
const csvEscape = (v) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
router.get('/api/admin/export/:table.csv', auth, requireRole('admin'), async (req, res) => {
  const t = EXPORT_TABLES[req.params.table];
  if (!t) return res.status(404).json({ error: 'Неизвестная таблица' });
  try {
    const { rows } = await db.query(`SELECT ${t.cols.join(',')} FROM ${req.params.table} ORDER BY ${t.order}`);
    const head = t.cols.join(',');
    const lines = rows.map((r) => t.cols.map((c) => csvEscape(r[c])).join(','));
    const csv = '﻿' + [head, ...lines].join('\r\n');
    logAudit(req, 'system', null, 'export', `Экспорт CSV: ${req.params.table} (${rows.length} строк)`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ddc-${req.params.table}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { console.error('GET /api/admin/export csv:', e.message); res.status(500).json({ error: 'Не удалось выгрузить' }); }
});
router.get('/api/admin/backup.json', auth, requireRole('admin'), async (req, res) => {
  try {
    const dump = { meta: { app: 'DDC / ЦЦР', version: APP_VERSION, generated_at: new Date().toISOString(), by: req.admin?.u || 'admin' }, tables: {} };
    for (const [name, t] of Object.entries(EXPORT_TABLES)) {
      try { dump.tables[name] = (await db.query(`SELECT ${t.cols.join(',')} FROM ${name} ORDER BY ${t.order}`)).rows; }
      catch { dump.tables[name] = []; }
    }
    logAudit(req, 'system', null, 'backup', `Полный JSON-бэкап (${Object.keys(dump.tables).length} таблиц)`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ddc-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (e) { console.error('GET /api/admin/backup.json:', e.message); res.status(500).json({ error: 'Не удалось создать бэкап' }); }
});

// ── Аудит безопасности: журнал входов, охват 2FA, активные сессии ──
router.get('/api/admin/security', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const events = (await db.query(`SELECT username, event, ip, ua, created_at FROM login_events ORDER BY id DESC LIMIT 60`)).rows;
    const tw = (await db.query(`SELECT count(*)::int total, count(*) FILTER (WHERE totp_enabled)::int enabled FROM users WHERE active = TRUE`)).rows[0];
    const failed24 = (await db.query(`SELECT count(*)::int c FROM login_events WHERE event IN ('fail','2fa_fail') AND created_at > now() - interval '24 hours'`)).rows[0].c;
    // Активные сессии — онлайн-пользователи (живые SSE-соединения) с именами.
    const onlineIds = onlineUserIds().filter((id) => id > 0);
    let sessions = [];
    if (onlineIds.length) {
      const { rows } = await db.query(`SELECT id, COALESCE(NULLIF(full_name,''),username) AS name, role, last_seen FROM users WHERE id = ANY($1::int[])`, [onlineIds]);
      sessions = rows;
    }
    res.json({ events, twofa: { total: tw.total, enabled: tw.enabled }, failed24, sessions, onlineCount: onlineCount() });
  } catch (e) { console.error('GET /api/admin/security:', e.message); res.status(500).json({ error: 'Ошибка' }); }
});

// ── База знаний (Wiki) ──
router.get('/api/wiki', auth, async (req, res) => {
  const q = clip(req.query.q, 200), cat = clip(req.query.category, 60);
  try {
    const where = [], vals = [];
    if (cat) { vals.push(cat); where.push(`category = $${vals.length}`); }
    if (q) { vals.push(`%${q}%`); where.push(`(title ILIKE $${vals.length} OR body ILIKE $${vals.length} OR tags ILIKE $${vals.length})`); }
    const sql = `SELECT id, title, category, tags, author, updated_at FROM wiki ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC LIMIT 300`;
    const items = (await db.query(sql, vals)).rows;
    const cats = (await db.query(`SELECT category, count(*)::int c FROM wiki GROUP BY category ORDER BY category`)).rows;
    res.json({ items, categories: cats });
  } catch (e) { console.error('GET /api/wiki:', e.message); res.status(500).json({ error: 'Ошибка' }); }
});
router.get('/api/wiki/:id(\\d+)', auth, async (req, res) => {
  try { const { rows } = await db.query(`SELECT * FROM wiki WHERE id = $1`, [Number(req.params.id)]); if (!rows.length) return res.status(404).json({ error: 'Не найдено' }); res.json(rows[0]); }
  catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});
router.post('/api/admin/wiki', auth, requireRole('admin', 'manager', 'editor'), async (req, res) => {
  const title = clip(req.body?.title, 200);
  if (!title) return res.status(400).json({ error: 'Укажите заголовок' });
  try {
    const { rows } = await db.query(`INSERT INTO wiki (title, category, body, tags, author) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [title, clip(req.body?.category, 60) || 'Общее', String(req.body?.body || '').slice(0, 20000), clip(req.body?.tags, 200), req.admin.u]);
    logAudit(req, 'wiki', rows[0].id, 'create', `Статья базы знаний «${title}»`);
    res.status(201).json({ id: rows[0].id });
  } catch (e) { console.error('POST /api/admin/wiki:', e.message); res.status(500).json({ error: 'Не удалось' }); }
});
router.patch('/api/admin/wiki/:id(\\d+)', auth, requireRole('admin', 'manager', 'editor'), async (req, res) => {
  const sets = [], vals = []; const push = (c, v) => { sets.push(`${c}=$${sets.length + 1}`); vals.push(v); };
  if (req.body?.title !== undefined) push('title', clip(req.body.title, 200));
  if (req.body?.category !== undefined) push('category', clip(req.body.category, 60) || 'Общее');
  if (req.body?.body !== undefined) push('body', String(req.body.body || '').slice(0, 20000));
  if (req.body?.tags !== undefined) push('tags', clip(req.body.tags, 200));
  if (!sets.length) return res.status(400).json({ error: 'Нет изменений' });
  vals.push(Number(req.params.id));
  try { await db.query(`UPDATE wiki SET ${sets.join(', ')}, updated_at=now() WHERE id=$${vals.length}`, vals); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Не удалось' }); }
});
router.delete('/api/admin/wiki/:id(\\d+)', auth, requireRole('admin', 'manager', 'editor'), async (req, res) => {
  try { await db.query(`DELETE FROM wiki WHERE id=$1`, [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Не удалось' }); }
});

// ── Админ: история изменений ──────────────────────────────────────────────────
router.get('/api/admin/audit', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const params = []; let where = '';
    if (req.query.entity && ['lead', 'news', 'service', 'career', 'vacancy', 'user', 'department', 'feed', 'system', 'incident', 'wiki', 'broadcast'].includes(req.query.entity)) { params.push(req.query.entity); where = `WHERE entity = $1`; }
    const { rows } = await db.query(
      `SELECT actor, actor_role, entity, entity_id, action, summary, created_at FROM audit_log ${where} ORDER BY id DESC LIMIT 200`, params);
    res.json(rows);
  } catch (e) { console.error('GET /api/admin/audit:', e.message); res.status(500).json({ error: 'Не удалось загрузить историю' }); }
});

module.exports = router;
