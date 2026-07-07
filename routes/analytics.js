// routes/analytics.js — собственная веб-аналитика: приём просмотров страниц (публично)
// и сводка для админки. Без внешних сервисов.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { auth, requireRole } = require('../lib/auth');
const { clip } = require('../lib/util');

const router = express.Router();
const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });   // часто, но с потолком

// Устройство — по User-Agent.
function deviceFromUA(ua) {
  ua = ua || '';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}
router.post('/api/track', trackLimiter, async (req, res) => {
  try {
    const p = clip(req.body?.path, 300) || '/';
    if (p.startsWith('/admin') || p.startsWith('/portal')) return res.status(204).end();   // считаем только публичный сайт
    await db.query(
      `INSERT INTO pageviews (path, ref, device, lang) VALUES ($1,$2,$3,$4)`,
      [p, clip(req.body?.ref, 300), deviceFromUA(req.get('user-agent')), clip(req.body?.lang, 8)]);
    res.status(204).end();
  } catch { res.status(204).end(); }   // аналитика никогда не должна ломать UX
});

// ── Админ: сводка веб-аналитики сайта ─────────────────────────────────────────
router.get('/api/admin/analytics/site', auth, requireRole('admin', 'manager'), async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));
  try {
    const [total, byDay, topPages, byDevice, byLang] = await Promise.all([
      db.query(`SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS today,
                       count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week FROM pageviews`),
      db.query(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, count(*)::int AS c
                  FROM pageviews WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 1`, [days]),
      db.query(`SELECT path, count(*)::int AS c FROM pageviews GROUP BY path ORDER BY c DESC LIMIT 12`),
      db.query(`SELECT device, count(*)::int AS c FROM pageviews GROUP BY device ORDER BY c DESC`),
      db.query(`SELECT lang, count(*)::int AS c FROM pageviews WHERE lang <> '' GROUP BY lang ORDER BY c DESC LIMIT 6`),
    ]);
    res.json({ total: total.rows[0], byDay: byDay.rows, topPages: topPages.rows, byDevice: byDevice.rows, byLang: byLang.rows, days });
  } catch (e) { console.error('GET /api/admin/analytics/site:', e.message); res.status(500).json({ error: 'Ошибка аналитики' }); }
});

module.exports = router;
