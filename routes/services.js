// routes/services.js — услуги ЦЦР: публичная витрина + админ-CRUD (3 языка, иконки, порядок).
const express = require('express');
const db = require('../db');
const { auth, requireRole, logAudit } = require('../lib/auth');

const router = express.Router();

// Названия/описания на 3 языках. Иконка — ключ из фиксированного набора (тот же,
// что и на сайте). При клике по услуге на сайте открывается форма заявки.
const SERVICE_ICONS = ['code', 'link', 'cart', 'chart', 'support', 'shield', 'cpu', 'coin'];
const SERVICE_COLS = `id, name_ru, name_kk, name_en, desc_ru, desc_kk, desc_en, icon, color, sort_order, published, created_at, updated_at`;

function normalizeService(body = {}) {
  const s = (v, n) => String(v ?? '').slice(0, n);
  let color = s(body.color, 9).trim() || '#2f6fe0';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#2f6fe0';
  const icon = SERVICE_ICONS.includes(body.icon) ? body.icon : 'code';
  let order = parseInt(body.sort_order, 10);
  if (!Number.isInteger(order) || order < 0) order = 0;
  if (order > 9999) order = 9999;
  return {
    name_ru: s(body.name_ru, 200), name_kk: s(body.name_kk, 200), name_en: s(body.name_en, 200),
    desc_ru: s(body.desc_ru, 800), desc_kk: s(body.desc_kk, 800), desc_en: s(body.desc_en, 800),
    icon, color, sort_order: order,
    published: body.published === undefined ? true : !!body.published,
  };
}

// Публично — только опубликованные, в порядке сортировки
router.get('/api/services', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${SERVICE_COLS} FROM services WHERE published = TRUE ORDER BY sort_order ASC, id ASC LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/services:', e.message);
    res.status(500).json({ error: 'Не удалось загрузить услуги' });
  }
});

router.get('/api/admin/services', auth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT ${SERVICE_COLS} FROM services ORDER BY sort_order ASC, id ASC LIMIT 200`);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/admin/services:', e.message);
    res.status(500).json({ error: 'Ошибка чтения услуг' });
  }
});

router.post('/api/admin/services', auth, requireRole('admin', 'editor'), async (req, res) => {
  const n = normalizeService(req.body);
  if (!n.name_ru.trim() && !n.name_en.trim() && !n.name_kk.trim()) {
    return res.status(400).json({ error: 'Укажите название хотя бы на одном языке' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO services (name_ru,name_kk,name_en,desc_ru,desc_kk,desc_en,icon,color,sort_order,published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING ${SERVICE_COLS}`,
      [n.name_ru,n.name_kk,n.name_en,n.desc_ru,n.desc_kk,n.desc_en,n.icon,n.color,n.sort_order,n.published]
    );
    logAudit(req, 'service', rows[0].id, 'create', `Создана услуга: ${rows[0].name_ru || rows[0].name_en || rows[0].name_kk || ('#'+rows[0].id)}`);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/admin/services:', e.message);
    res.status(500).json({ error: 'Не удалось создать услугу' });
  }
});

router.put('/api/admin/services/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  const n = normalizeService(req.body);
  try {
    const { rows } = await db.query(
      `UPDATE services SET
        name_ru=$1,name_kk=$2,name_en=$3,desc_ru=$4,desc_kk=$5,desc_en=$6,
        icon=$7,color=$8,sort_order=$9,published=$10,updated_at=now()
       WHERE id=$11
       RETURNING ${SERVICE_COLS}`,
      [n.name_ru,n.name_kk,n.name_en,n.desc_ru,n.desc_kk,n.desc_en,n.icon,n.color,n.sort_order,n.published, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Услуга не найдена' });
    logAudit(req, 'service', id, 'update', `Изменена услуга: ${rows[0].name_ru || rows[0].name_en || rows[0].name_kk || ('#'+id)}`);
    res.json(rows[0]);
  } catch (e) {
    console.error('PUT /api/admin/services:', e.message);
    res.status(500).json({ error: 'Не удалось обновить услугу' });
  }
});

router.delete('/api/admin/services/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    const pre = await db.query(`SELECT name_ru, name_en, name_kk FROM services WHERE id = $1`, [id]);
    const { rowCount } = await db.query(`DELETE FROM services WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Услуга не найдена' });
    const tt = pre.rows[0] ? (pre.rows[0].name_ru || pre.rows[0].name_en || pre.rows[0].name_kk) : ('#'+id);
    logAudit(req, 'service', id, 'delete', `Удалена услуга: ${tt}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/services:', e.message);
    res.status(500).json({ error: 'Не удалось удалить услугу' });
  }
});

module.exports = router;
