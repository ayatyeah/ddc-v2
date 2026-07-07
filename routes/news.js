// routes/news.js — новости сайта: публичное чтение, админ-CRUD и AI-лента (агрегатор).
const express = require('express');
const db = require('../db');
const { auth, requireRole, logAudit } = require('../lib/auth');
const { runBuild, refreshFeedIfStale } = require('../lib/feed');

const router = express.Router();

const NEWS_COLS = `id, title_ru, title_kk, title_en, excerpt_ru, excerpt_kk, excerpt_en,
                   body_ru, body_kk, body_en, color, image, image_fit, image_pos, news_date, published,
                   created_at, updated_at`;

// ── Публичные новости (только опубликованные) ─────────────────────────────────
router.get('/api/news', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${NEWS_COLS} FROM news
       WHERE published = TRUE
       ORDER BY news_date DESC, id DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/news:', e.message);
    res.status(500).json({ error: 'Не удалось загрузить новости' });
  }
});

// Публичная AI-лента (отдаём кэш мгновенно; обновление — не чаще раза в сутки, в фоне)
router.get('/api/news/aggregated', async (req, res) => {
  try {
    let { rows } = await db.query(`SELECT content, fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`);
    if (!rows.length) {
      await refreshFeedIfStale(true);
      ({ rows } = await db.query(`SELECT content, fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`));
    } else {
      refreshFeedIfStale(false); // фоном, не блокируя ответ
    }
    if (!rows.length) return res.json({ items: [], digest: '', updated_at: null });
    const c = rows[0].content;
    const items = Array.isArray(c) ? c : (c && Array.isArray(c.items) ? c.items : []);
    const digest = (c && !Array.isArray(c) && c.digest) ? c.digest : '';
    res.json({ items, digest, updated_at: rows[0].fetched_at });
  } catch (e) { console.error('GET /api/news/aggregated:', e.message); res.json({ items: [], digest: '', updated_at: null }); }
});

router.get('/api/news/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    const { rows } = await db.query(
      `SELECT ${NEWS_COLS} FROM news WHERE id = $1 AND published = TRUE`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Новость не найдена' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/news/:id:', e.message);
    res.status(500).json({ error: 'Ошибка чтения' });
  }
});

// ── Админ: новости (CRUD) ─────────────────────────────────────────────────────
// Нормализация тела запроса новости → безопасные значения с обрезкой длины.
function normalizeNews(body = {}) {
  const s = (v, n) => String(v ?? '').slice(0, n);
  let color = s(body.color, 9).trim() || '#1a4aaa';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#1a4aaa';
  let date = s(body.news_date, 10).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = new Date().toISOString().slice(0, 10);
  // image: data-URL (base64) или http(s)-ссылка, иначе пусто
  let image = String(body.image ?? '').slice(0, 4_000_000);
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(image) && !/^https?:\/\//i.test(image)) image = '';
  // подгонка фото под карточку: fit (cover|contain) + фокус кадрирования (object-position)
  let image_fit = s(body.image_fit, 10).trim().toLowerCase();
  if (image_fit !== 'contain') image_fit = 'cover';
  let image_pos = s(body.image_pos, 24).trim();
  if (!/^\d{1,3}% \d{1,3}%$/.test(image_pos)) image_pos = '50% 50%';
  return {
    title_ru: s(body.title_ru, 300), title_kk: s(body.title_kk, 300), title_en: s(body.title_en, 300),
    excerpt_ru: s(body.excerpt_ru, 600), excerpt_kk: s(body.excerpt_kk, 600), excerpt_en: s(body.excerpt_en, 600),
    body_ru: s(body.body_ru, 8000), body_kk: s(body.body_kk, 8000), body_en: s(body.body_en, 8000),
    color, image, image_fit, image_pos, news_date: date,
    published: body.published === undefined ? true : !!body.published,
  };
}

router.get('/api/admin/news', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${NEWS_COLS} FROM news ORDER BY news_date DESC, id DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/admin/news:', e.message);
    res.status(500).json({ error: 'Ошибка чтения новостей' });
  }
});

router.post('/api/admin/news', auth, requireRole('admin', 'editor'), async (req, res) => {
  const n = normalizeNews(req.body);
  if (!n.title_ru.trim() && !n.title_en.trim() && !n.title_kk.trim()) {
    return res.status(400).json({ error: 'Укажите заголовок хотя бы на одном языке' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO news
        (title_ru,title_kk,title_en,excerpt_ru,excerpt_kk,excerpt_en,
         body_ru,body_kk,body_en,color,image,image_fit,image_pos,news_date,published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING ${NEWS_COLS}`,
      [n.title_ru,n.title_kk,n.title_en,n.excerpt_ru,n.excerpt_kk,n.excerpt_en,
       n.body_ru,n.body_kk,n.body_en,n.color,n.image,n.image_fit,n.image_pos,n.news_date,n.published]
    );
    logAudit(req, 'news', rows[0].id, 'create', `Создана новость: ${rows[0].title_ru || rows[0].title_en || rows[0].title_kk || ('#'+rows[0].id)}`);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/admin/news:', e.message);
    res.status(500).json({ error: 'Не удалось создать новость' });
  }
});

router.put('/api/admin/news/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  const n = normalizeNews(req.body);
  try {
    const { rows } = await db.query(
      `UPDATE news SET
        title_ru=$1,title_kk=$2,title_en=$3,
        excerpt_ru=$4,excerpt_kk=$5,excerpt_en=$6,
        body_ru=$7,body_kk=$8,body_en=$9,
        color=$10,image=$11,image_fit=$12,image_pos=$13,news_date=$14,published=$15
       WHERE id=$16
       RETURNING ${NEWS_COLS}`,
      [n.title_ru,n.title_kk,n.title_en,n.excerpt_ru,n.excerpt_kk,n.excerpt_en,
       n.body_ru,n.body_kk,n.body_en,n.color,n.image,n.image_fit,n.image_pos,n.news_date,n.published, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Новость не найдена' });
    logAudit(req, 'news', id, 'update', `Изменена новость: ${rows[0].title_ru || rows[0].title_en || rows[0].title_kk || ('#'+id)}`);
    res.json(rows[0]);
  } catch (e) {
    console.error('PUT /api/admin/news:', e.message);
    res.status(500).json({ error: 'Не удалось обновить новость' });
  }
});

router.delete('/api/admin/news/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    const pre = await db.query(`SELECT title_ru, title_en, title_kk FROM news WHERE id = $1`, [id]);
    const { rowCount } = await db.query(`DELETE FROM news WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Новость не найдена' });
    const tt = pre.rows[0] ? (pre.rows[0].title_ru || pre.rows[0].title_en || pre.rows[0].title_kk) : ('#'+id);
    logAudit(req, 'news', id, 'delete', `Удалена новость: ${tt}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/news:', e.message);
    res.status(500).json({ error: 'Не удалось удалить' });
  }
});

// Принудительное обновление AI-ленты из админки (вне 24-часового лимита)
router.post('/api/admin/news/aggregate/refresh', auth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const result = await runBuild();
    const cnt = result && Array.isArray(result.items) ? result.items.length : (Array.isArray(result) ? result.length : 0);
    logAudit(req, 'feed', null, 'update', `AI-лента обновлена вручную (${cnt})`);
    const { rows } = await db.query(`SELECT fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`);
    res.json({ ok: true, count: cnt, updated_at: rows[0] ? rows[0].fetched_at : null });
  } catch (e) {
    console.error('POST /api/admin/news/aggregate/refresh:', e.message);
    res.status(500).json({ error: 'Не удалось обновить ленту: ' + e.message });
  }
});

module.exports = router;
