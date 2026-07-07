// routes/monitoring.js — статус-борд ИТ-систем и инциденты (мониторинг инфраструктуры)
// + публичные /api/status и /api/health. Сами health-check-проверки — в lib/health.
const express = require('express');
const db = require('../db');
const { APP_VERSION } = require('../lib/config');
const { auth, requireRole, logAudit } = require('../lib/auth');
const { clip } = require('../lib/util');
const { CHECK_KINDS, runHealthChecks } = require('../lib/health');
const { onlineCount } = require('../lib/sse');
const { OPENAI_KEY, GEMINI_KEYS } = require('../lib/ai');
const { indexReady } = require('../lib/rag');

const router = express.Router();

const SYS_STATUS = ['operational', 'degraded', 'down', 'maintenance'];
const INC_SEV = ['minor', 'major', 'critical'];
const INC_STATUS = ['open', 'monitoring', 'resolved'];

router.get('/api/admin/systems', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const systems = (await db.query(`SELECT id,name,category,status,uptime,owner,note,check_kind,check_target,latency_ms,last_checked,updated_at FROM systems ORDER BY sort_order, id`)).rows;
    const incidents = (await db.query(`SELECT i.id,i.system_id,s.name AS system_name,i.title,i.severity,i.status,i.note,i.started_at,i.resolved_at
      FROM incidents i LEFT JOIN systems s ON s.id=i.system_id ORDER BY (i.status='resolved'), i.id DESC LIMIT 60`)).rows;
    const byStatus = { operational: 0, degraded: 0, down: 0, maintenance: 0 };
    systems.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
    const avgUptime = systems.length ? systems.reduce((a, s) => a + Number(s.uptime), 0) / systems.length : 100;
    const openInc = incidents.filter((i) => i.status !== 'resolved').length;
    res.json({ systems, incidents, sla: { total: systems.length, byStatus, avgUptime: Math.round(avgUptime * 100) / 100, openInc } });
  } catch (e) { console.error('GET /api/admin/systems:', e.message); res.status(500).json({ error: 'Ошибка' }); }
});
router.post('/api/admin/systems', auth, requireRole('admin', 'manager'), async (req, res) => {
  const name = clip(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: 'Укажите название системы' });
  try {
    const { rows } = await db.query(`INSERT INTO systems (name,category,status,uptime,owner,note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, clip(req.body?.category, 60), SYS_STATUS.includes(req.body?.status) ? req.body.status : 'operational', Math.max(0, Math.min(100, Number(req.body?.uptime) || 99.9)), clip(req.body?.owner, 120), clip(req.body?.note, 500)]);
    logAudit(req, 'system', rows[0].id, 'create', `Добавлена система «${name}»`);
    res.status(201).json({ id: rows[0].id });
  } catch (e) { console.error('POST /api/admin/systems:', e.message); res.status(500).json({ error: 'Не удалось' }); }
});
router.patch('/api/admin/systems/:id(\\d+)', auth, requireRole('admin', 'manager'), async (req, res) => {
  const sets = [], vals = []; const push = (c, v) => { sets.push(`${c}=$${sets.length + 1}`); vals.push(v); };
  if (req.body?.status !== undefined) push('status', SYS_STATUS.includes(req.body.status) ? req.body.status : 'operational');
  if (req.body?.uptime !== undefined) push('uptime', Math.max(0, Math.min(100, Number(req.body.uptime) || 0)));
  if (req.body?.name !== undefined) push('name', clip(req.body.name, 120));
  if (req.body?.category !== undefined) push('category', clip(req.body.category, 60));
  if (req.body?.owner !== undefined) push('owner', clip(req.body.owner, 120));
  if (req.body?.note !== undefined) push('note', clip(req.body.note, 500));
  if (req.body?.check_kind !== undefined) push('check_kind', CHECK_KINDS.includes(req.body.check_kind) ? req.body.check_kind : 'none');
  if (req.body?.check_target !== undefined) push('check_target', clip(req.body.check_target, 300));
  // при (пере)подключении авто-проверки обнуляем статистику, чтобы аптайм считался заново по факту
  if (req.body?.check_kind !== undefined || req.body?.check_target !== undefined) { push('checks_ok', 0); push('checks_total', 0); push('latency_ms', null); }
  if (!sets.length) return res.status(400).json({ error: 'Нет изменений' });
  vals.push(Number(req.params.id));
  try {
    await db.query(`UPDATE systems SET ${sets.join(', ')}, updated_at=now() WHERE id=$${vals.length}`, vals);
    if (req.body?.check_kind !== undefined || req.body?.check_target !== undefined) runHealthChecks().catch(() => {});  // сразу перепроверить
    res.json({ ok: true });
  } catch (e) { console.error('PATCH /api/admin/systems:', e.message); res.status(500).json({ error: 'Не удалось' }); }
});
// Запустить проверку доступности прямо сейчас (кнопка «Проверить сейчас»)
router.post('/api/admin/systems/check', auth, requireRole('admin', 'manager'), async (req, res) => {
  try { await runHealthChecks(); res.json({ ok: true }); }
  catch (e) { console.error('POST /api/admin/systems/check:', e.message); res.status(500).json({ error: 'Не удалось' }); }
});
router.delete('/api/admin/systems/:id(\\d+)', auth, requireRole('admin'), async (req, res) => {
  try { const id = Number(req.params.id); await db.query(`DELETE FROM incidents WHERE system_id=$1`, [id]); await db.query(`DELETE FROM systems WHERE id=$1`, [id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Не удалось' }); }
});
router.post('/api/admin/incidents', auth, requireRole('admin', 'manager'), async (req, res) => {
  const title = clip(req.body?.title, 200);
  if (!title) return res.status(400).json({ error: 'Укажите заголовок инцидента' });
  const system_id = req.body?.system_id ? Number(req.body.system_id) : null;
  const severity = INC_SEV.includes(req.body?.severity) ? req.body.severity : 'minor';
  try {
    const { rows } = await db.query(`INSERT INTO incidents (system_id,title,severity,note) VALUES ($1,$2,$3,$4) RETURNING id`, [system_id, title, severity, clip(req.body?.note, 1000)]);
    if (system_id) await db.query(`UPDATE systems SET status=$1, updated_at=now() WHERE id=$2`, [severity === 'critical' ? 'down' : 'degraded', system_id]);
    logAudit(req, 'incident', rows[0].id, 'create', `Инцидент: ${title}`);
    res.status(201).json({ id: rows[0].id });
  } catch (e) { console.error('POST /api/admin/incidents:', e.message); res.status(500).json({ error: 'Не удалось' }); }
});
router.patch('/api/admin/incidents/:id(\\d+)', auth, requireRole('admin', 'manager'), async (req, res) => {
  const status = INC_STATUS.includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'Некорректный статус' });
  try {
    const { rows } = await db.query(`UPDATE incidents SET status=$1, resolved_at=CASE WHEN $1='resolved' THEN now() ELSE NULL END WHERE id=$2 RETURNING system_id`, [status, Number(req.params.id)]);
    if (status === 'resolved' && rows[0]?.system_id) await db.query(`UPDATE systems SET status='operational', updated_at=now() WHERE id=$1`, [rows[0].system_id]);
    res.json({ ok: true });
  } catch (e) { console.error('PATCH /api/admin/incidents:', e.message); res.status(500).json({ error: 'Не удалось' }); }
});

// Публичный статус (для будущей публичной статус-страницы) — только сводка, без внутренних деталей.
router.get('/api/status', async (req, res) => {
  try {
    const systems = (await db.query(`SELECT name, category, status, uptime FROM systems ORDER BY sort_order, id`)).rows;
    const open = (await db.query(`SELECT count(*)::int c FROM incidents WHERE status<>'resolved'`)).rows[0].c;
    res.json({ overall: systems.every((s) => s.status === 'operational') ? 'operational' : 'degraded', systems, open_incidents: open, time: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: 'Недоступно' }); }
});

// Health-check / статус-страница (публично): состояние БД, ИИ, аптайм, версия.
router.get('/api/health', async (req, res) => {
  let db_ok = false;
  try { await db.query('SELECT 1'); db_ok = true; } catch { /* БД недоступна */ }
  res.json({
    ok: db_ok,
    status: db_ok ? 'operational' : 'degraded',
    db: db_ok,
    ai: { openai: !!OPENAI_KEY, gemini: GEMINI_KEYS.length > 0, search_index: indexReady() },
    realtime: { online: onlineCount() },
    uptime_sec: Math.round(process.uptime()),
    version: APP_VERSION,
    time: new Date().toISOString(),
  });
});

module.exports = router;
