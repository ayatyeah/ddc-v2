// routes/adminUsers.js — управление пользователями и отделами (только роль admin;
// список исполнителей /api/admin/staff — также для manager).
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ADMIN_USERNAME } = require('../lib/config');
const { auth, requireRole, logAudit } = require('../lib/auth');
const { clip } = require('../lib/util');

const router = express.Router();
const ALLOWED_ROLES = ['admin', 'manager', 'staff', 'editor', 'viewer'];

router.get('/api/admin/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, full_name, department, role, active, created_at FROM users ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/admin/users:', e.message);
    res.status(500).json({ error: 'Ошибка чтения пользователей' });
  }
});

// Список сотрудников/начальников для дропдауна назначения (admin и manager).
router.get('/api/admin/staff', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, full_name, department, role FROM users
       WHERE role IN ('manager','staff') AND active = TRUE
       ORDER BY full_name NULLS LAST, username`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/admin/staff:', e.message);
    res.status(500).json({ error: 'Ошибка чтения сотрудников' });
  }
});

router.post('/api/admin/users', auth, requireRole('admin'), async (req, res) => {
  const username = String(req.body?.username || '').trim().slice(0, 60);
  const password = String(req.body?.password || '');
  const full_name = String(req.body?.full_name || '').trim().slice(0, 120);
  const phone = String(req.body?.phone || '').trim().slice(0, 40);
  const department = String(req.body?.department || '').trim().slice(0, 120);
  const role = ALLOWED_ROLES.includes(req.body?.role) ? req.body.role : 'staff';
  const birth_date = req.body?.birth_date ? String(req.body.birth_date).slice(0, 10) : '';
  if (!username || password.length < 4) {
    return res.status(400).json({ error: 'Логин и пароль (от 4 символов) обязательны' });
  }
  // ФИО, телефон и дата рождения обязательны при регистрации сотрудника.
  if (full_name.split(/\s+/).filter(Boolean).length < 2) {
    return res.status(400).json({ error: 'Укажите ФИО полностью (фамилия и имя)' });
  }
  if (phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Укажите корректный номер телефона' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
    return res.status(400).json({ error: 'Укажите дату рождения сотрудника' });
  }
  if (username === ADMIN_USERNAME) {
    return res.status(400).json({ error: 'Это имя занято суперадмином' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, full_name, phone, department, role, birth_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, username, full_name, department, role, active, birth_date, created_at`,
      [username, hash, full_name, phone, department, role, birth_date]
    );
    logAudit(req, 'user', rows[0].id, 'create', `Создан пользователь ${username} (${role})`);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Такой логин уже есть' });
    console.error('POST /api/admin/users:', e.message);
    res.status(500).json({ error: 'Не удалось создать пользователя' });
  }
});

router.delete('/api/admin/users/:id', auth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    // нельзя удалить самого себя
    const { rows } = await db.query(`SELECT username FROM users WHERE id = $1`, [id]);
    if (rows.length && rows[0].username === req.admin.u) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    const { rowCount } = await db.query(`DELETE FROM users WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/users:', e.message);
    res.status(500).json({ error: 'Не удалось удалить' });
  }
});

// Обновление пользователя: отдел / роль / ФИО (для «раскидать по отделам»)
router.patch('/api/admin/users/:id(\\d+)', auth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const set = [], vals = [];
  if ('department' in (req.body || {})) { set.push(`department = $${set.length + 1}`); vals.push(clip(req.body.department, 120)); }
  if ('full_name' in (req.body || {})) { set.push(`full_name = $${set.length + 1}`); vals.push(clip(req.body.full_name, 120)); }
  if ('role' in (req.body || {})) {
    const role = ALLOWED_ROLES.includes(req.body.role) ? req.body.role : null;
    if (!role) return res.status(400).json({ error: 'Недопустимая роль' });
    set.push(`role = $${set.length + 1}`); vals.push(role);
  }
  if ('birth_date' in (req.body || {})) { set.push(`birth_date = $${set.length + 1}`); vals.push(req.body.birth_date ? String(req.body.birth_date).slice(0, 10) : null); }
  if ('can_write_news' in (req.body || {})) { set.push(`can_write_news = $${set.length + 1}`); vals.push(!!req.body.can_write_news); }
  if (!set.length) return res.status(400).json({ error: 'Нечего обновлять' });
  vals.push(id);
  try {
    const { rows } = await db.query(
      `UPDATE users SET ${set.join(', ')} WHERE id = $${vals.length}
       RETURNING id, username, full_name, department, role, active, birth_date, can_write_news, created_at`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    logAudit(req, 'user', id, 'update', `Обновлён пользователь ${rows[0].username}`);
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /api/admin/users:', e.message);
    res.status(500).json({ error: 'Не удалось обновить' });
  }
});

// Смена пароля пользователя администратором
router.post('/api/admin/users/:id(\\d+)/password', auth, requireRole('admin'), async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 4) return res.status(400).json({ error: 'Пароль должен быть не короче 4 символов' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING username`, [hash, Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    logAudit(req, 'user', Number(req.params.id), 'password', `Сменён пароль пользователя ${rows[0].username}`);
    res.json({ ok: true });
  } catch (e) { console.error('POST /api/admin/users/password:', e.message); res.status(500).json({ error: 'Не удалось сменить пароль' }); }
});

// ── Админ: отделы (создание/список/удаление) ──────────────────────────────────
router.get('/api/admin/departments', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.name, d.descr, d.sort_order,
              (SELECT count(*)::int FROM users u WHERE u.department = d.name AND u.active = TRUE) AS members
         FROM departments d ORDER BY d.sort_order, d.id`);
    res.json(rows);
  } catch (e) { console.error('GET /api/admin/departments:', e.message); res.status(500).json({ error: 'Ошибка чтения отделов' }); }
});

router.post('/api/admin/departments', auth, requireRole('admin'), async (req, res) => {
  const name = clip(req.body?.name, 120);
  const descr = clip(req.body?.descr, 400);
  if (!name) return res.status(400).json({ error: 'Укажите название отдела' });
  try {
    const { rows: mx } = await db.query(`SELECT COALESCE(max(sort_order), -1) + 1 AS n FROM departments`);
    const { rows } = await db.query(
      `INSERT INTO departments (name, descr, sort_order) VALUES ($1,$2,$3) RETURNING id, name, descr, sort_order`,
      [name, descr, mx[0].n]);
    logAudit(req, 'department', rows[0].id, 'create', `Создан отдел «${name}»`);
    res.status(201).json({ ...rows[0], members: 0 });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Такой отдел уже есть' });
    console.error('POST /api/admin/departments:', e.message);
    res.status(500).json({ error: 'Не удалось создать отдел' });
  }
});

router.patch('/api/admin/departments/:id(\\d+)', auth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const name = clip(req.body?.name, 120);
  const descr = clip(req.body?.descr, 400);
  if (!name) return res.status(400).json({ error: 'Укажите название отдела' });
  try {
    const cur = await db.query(`SELECT name FROM departments WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Отдел не найден' });
    const oldName = cur.rows[0].name;
    const { rows } = await db.query(
      `UPDATE departments SET name = $1, descr = $2 WHERE id = $3 RETURNING id, name, descr, sort_order`,
      [name, descr, id]);
    // При переименовании синхронизируем строку отдела у сотрудников (связь по имени).
    if (oldName !== name) await db.query(`UPDATE users SET department = $1 WHERE department = $2`, [name, oldName]);
    logAudit(req, 'department', id, 'update', `Отдел «${oldName}» → «${name}»`);
    const cnt = await db.query(`SELECT count(*)::int AS n FROM users WHERE department = $1 AND active = TRUE`, [name]);
    res.json({ ...rows[0], members: cnt.rows[0].n });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Такой отдел уже есть' });
    console.error('PATCH /api/admin/departments:', e.message);
    res.status(500).json({ error: 'Не удалось изменить отдел' });
  }
});

router.delete('/api/admin/departments/:id(\\d+)', auth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await db.query(`SELECT name FROM departments WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Отдел не найден' });
    // Открепляем сотрудников от удаляемого отдела, чтобы не оставалось «висячих» имён.
    await db.query(`UPDATE users SET department = '' WHERE department = $1`, [rows[0].name]);
    await db.query(`DELETE FROM departments WHERE id = $1`, [id]);
    logAudit(req, 'department', id, 'delete', `Удалён отдел «${rows[0].name}»`);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/departments:', e.message);
    res.status(500).json({ error: 'Не удалось удалить отдел' });
  }
});

module.exports = router;
