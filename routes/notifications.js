// routes/notifications.js — in-app уведомления (колокольчик админки и портала).
// Мгновенная доставка — по SSE (lib/sse.notify); эти эндпоинты — чтение и отметка прочитанного.
const express = require('express');
const db = require('../db');
const { auth } = require('../lib/auth');

const router = express.Router();

router.get('/api/notifications', auth, async (req, res) => {
  if (!req.admin.id) return res.json({ items: [], unread: 0 }); // суперадмин без записи в users
  try {
    const unreadOnly = req.query.unread === '1';
    const { rows } = await db.query(
      `SELECT id, type, lead_id, title, body, read, created_at
       FROM notifications WHERE user_id = $1 ${unreadOnly ? 'AND read = FALSE' : ''}
       ORDER BY id DESC LIMIT 50`, [req.admin.id]);
    const u = await db.query(`SELECT count(*)::int c FROM notifications WHERE user_id = $1 AND read = FALSE`, [req.admin.id]);
    res.json({ items: rows, unread: u.rows[0].c });
  } catch (e) { console.error('GET /api/notifications:', e.message); res.status(500).json({ error: 'Ошибка чтения уведомлений' }); }
});

router.post('/api/notifications/read', auth, async (req, res) => {
  if (!req.admin.id) return res.json({ ok: true });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  try {
    if (ids && ids.length) {
      await db.query(`UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id = ANY($2::int[])`, [req.admin.id, ids]);
    } else {
      await db.query(`UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`, [req.admin.id]);
    }
    res.json({ ok: true });
  } catch (e) { console.error('POST /api/notifications/read:', e.message); res.status(500).json({ error: 'Не удалось обновить' }); }
});

module.exports = router;
