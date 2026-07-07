// routes/portalPeople.js — портал: люди и личное — справочник сотрудников, отделы,
// профиль, 2FA (TOTP) и Mission Control (телеметрия для руководителей).
const express = require('express');
const os = require('os');
const db = require('../db');
const { auth, requireRole, totpVerify, totpNewSecret } = require('../lib/auth');
const { clip } = require('../lib/util');

const router = express.Router();

// Список сотрудников портала (для выбора адресата ЛС и назначения задач)
router.get('/api/portal/users', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, full_name, department, role, position, phone, skills, hired_at FROM users WHERE active = TRUE ORDER BY full_name NULLS LAST, username`);
    res.json(rows.map((u) => ({ id: u.id, name: u.full_name || u.username, department: u.department || '', role: u.role, position: u.position || '', phone: u.phone || '', skills: u.skills || '', hired_at: u.hired_at })));
  } catch (e) { console.error('GET /api/portal/users:', e.message); res.status(500).json({ error: 'Ошибка чтения сотрудников' }); }
});

// Отделы DDC + их участники (список отделов — из таблицы departments)
router.get('/api/portal/departments', auth, async (req, res) => {
  try {
    const { rows: depts } = await db.query(`SELECT id, name, descr FROM departments ORDER BY sort_order, id`);
    const { rows: users } = await db.query(`SELECT full_name, username, department, role FROM users WHERE active = TRUE`);
    const departments = depts.map((d) => ({
      id: d.id, name: d.name, desc: d.descr,
      members: users.filter((u) => (u.department || '') === d.name).map((u) => ({ name: u.full_name || u.username, role: u.role })),
    }));
    res.json({ departments, total: users.length });
  } catch (e) { console.error('GET /api/portal/departments:', e.message); res.status(500).json({ error: 'Ошибка чтения отделов' }); }
});

// Обновление собственного профиля (контакты, навыки, должность)
router.patch('/api/portal/profile', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Профиль доступен сотрудникам с учётной записью' });
  try {
    await db.query(`UPDATE users SET phone=$1, skills=$2, position=$3 WHERE id=$4`,
      [clip(req.body?.phone, 40), clip(req.body?.skills, 500), clip(req.body?.position, 120), me]);
    res.json({ ok: true });
  } catch (e) { console.error('PATCH /api/portal/profile:', e.message); res.status(500).json({ error: 'Не удалось сохранить' }); }
});

// ── Двухфакторная аутентификация (TOTP) ──
router.get('/api/portal/2fa', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.json({ enabled: false, available: false });
  try { const { rows } = await db.query(`SELECT totp_enabled FROM users WHERE id=$1`, [me]); res.json({ enabled: !!rows[0]?.totp_enabled, available: true }); }
  catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});
router.post('/api/portal/2fa/setup', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Доступно сотрудникам с учётной записью' });
  try {
    const { rows } = await db.query(`SELECT username, totp_enabled FROM users WHERE id=$1`, [me]);
    if (rows[0]?.totp_enabled) return res.status(400).json({ error: '2FA уже включена' });
    const secret = totpNewSecret();
    await db.query(`UPDATE users SET totp_secret=$1 WHERE id=$2`, [secret, me]);   // сохраняем как «ожидающий», enabled=false
    const otpauth = `otpauth://totp/${encodeURIComponent('DDC:' + rows[0].username)}?secret=${secret}&issuer=DDC%20Portal&period=30&digits=6`;
    res.json({ secret, otpauth });
  } catch (e) { console.error('2fa setup:', e.message); res.status(500).json({ error: 'Ошибка' }); }
});
router.post('/api/portal/2fa/enable', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Доступно сотрудникам' });
  try {
    const { rows } = await db.query(`SELECT totp_secret FROM users WHERE id=$1`, [me]);
    if (!rows[0]?.totp_secret) return res.status(400).json({ error: 'Сначала запустите настройку' });
    if (!totpVerify(rows[0].totp_secret, req.body?.code)) return res.status(400).json({ error: 'Неверный код из приложения' });
    await db.query(`UPDATE users SET totp_enabled=TRUE WHERE id=$1`, [me]);
    res.json({ ok: true });
  } catch (e) { console.error('2fa enable:', e.message); res.status(500).json({ error: 'Ошибка' }); }
});
router.post('/api/portal/2fa/disable', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Доступно сотрудникам' });
  try {
    const { rows } = await db.query(`SELECT totp_secret, totp_enabled FROM users WHERE id=$1`, [me]);
    if (!rows[0]?.totp_enabled) return res.json({ ok: true });
    if (!totpVerify(rows[0].totp_secret, req.body?.code)) return res.status(400).json({ error: 'Неверный код' });
    await db.query(`UPDATE users SET totp_enabled=FALSE, totp_secret='' WHERE id=$1`, [me]);
    res.json({ ok: true });
  } catch (e) { console.error('2fa disable:', e.message); res.status(500).json({ error: 'Ошибка' }); }
});

// ── Mission Control: сводная телеметрия портала ───────────────────────────────
// Доступен не всем — только админу и начальникам отделов (manager).
router.get('/api/portal/mission', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [online, users, msgs, tasks, chats, files, actMsg, actTask, actFile, actAudit] = await Promise.all([
      db.query(`SELECT id, full_name, username, department, last_seen FROM users
                 WHERE active = TRUE AND last_seen > now() - interval '3 minutes' ORDER BY last_seen DESC LIMIT 60`),
      db.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE active)::int AS active FROM users`),
      db.query(`SELECT count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS today,
                       count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour,
                       count(*)::int AS total FROM messages WHERE deleted = FALSE`),
      db.query(`SELECT count(*) FILTER (WHERE status='open')::int AS open,
                       count(*) FILTER (WHERE status='done')::int AS done, count(*)::int AS total FROM tasks`),
      db.query(`SELECT count(*)::int AS total FROM chats`),
      db.query(`SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS today FROM files`),
      db.query(`SELECT author_name, created_at FROM messages WHERE deleted = FALSE ORDER BY id DESC LIMIT 8`),
      db.query(`SELECT title, created_by, created_at FROM tasks ORDER BY id DESC LIMIT 6`),
      db.query(`SELECT orig, kind, created_at FROM files ORDER BY id DESC LIMIT 6`),
      db.query(`SELECT actor, action, summary, created_at FROM audit_log ORDER BY id DESC LIMIT 8`).catch(() => ({ rows: [] })),
    ]);
    const activity = [
      ...actMsg.rows.map((r) => ({ type: 'msg', text: `${r.author_name || 'Сотрудник'}: новое сообщение`, at: r.created_at })),
      ...actTask.rows.map((r) => ({ type: 'task', text: `${r.created_by || 'Сотрудник'} создал задачу «${r.title}»`, at: r.created_at })),
      ...actFile.rows.map((r) => ({ type: 'file', text: `Загружен файл: ${r.orig}`, at: r.created_at })),
      ...actAudit.rows.map((r) => ({ type: 'audit', text: `${r.actor}: ${r.summary || r.action}`, at: r.created_at })),
    ].filter((a) => a.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 16);

    const cores = (os.cpus() || []).length || 1;
    const la = (os.loadavg && os.loadavg()[0]) || 0;
    const load = Math.max(0, Math.min(100, Math.round((la / cores) * 100)));
    res.json({
      online: online.rows.map((u) => ({ id: u.id, name: u.full_name || u.username, department: u.department || '' })),
      onlineCount: online.rows.length,
      users: users.rows[0],
      messages: msgs.rows[0],
      tasks: tasks.rows[0],
      chats: chats.rows[0].total,
      files: files.rows[0],
      server: { uptimeSec: Math.round(process.uptime()), memMB: Math.round(process.memoryUsage().rss / 1048576), load, cores, loadavg: +la.toFixed(2) },
      activity,
      now: new Date().toISOString(),
    });
  } catch (e) { console.error('GET /api/portal/mission:', e.message); res.status(500).json({ error: 'Ошибка телеметрии' }); }
});

module.exports = router;
