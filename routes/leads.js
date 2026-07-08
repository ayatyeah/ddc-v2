// routes/leads.js — заявки (CRM): публичный приём с формы сайта + админ-обработка
// (список, счётчики, статусы, назначение, оценочные листы, PDF-отчёт).
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { buildReportPDF, fontsAvailable } = require('../pdfReport');
const { auth, requireRole, logAudit } = require('../lib/auth');
const { notify } = require('../lib/sse');
const { saveUpload } = require('../lib/uploads');

const router = express.Router();
const formLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

const ALLOWED_STATUSES = ['new', 'in_progress', 'on_hold', 'served', 'rejected'];

// Полная строка лида (с исполнителем, скором и флагом оценочного листа) — чтобы
// после PATCH/назначения фронт получал тот же набор полей, что и в списке.
async function fetchLeadRow(id) {
  const { rows } = await db.query(
    `SELECT l.id, l.full_name, l.email, l.phone, l.subject, l.message, l.status,
            l.admin_comment, l.rating, l.reject_reason, l.assignee_id, l.assigned_by, l.assigned_at,
            u.username AS assignee_username, u.full_name AS assignee_name,
            (e.lead_id IS NOT NULL) AS has_evaluation,
            l.created_at, l.updated_at
     FROM leads l
     LEFT JOIN users u ON u.id = l.assignee_id
     LEFT JOIN evaluations e ON e.lead_id = l.id
     WHERE l.id = $1`, [id]);
  return rows[0] || null;
}

// ── Публичный приём заявки с формы сайта ──────────────────────────────────────
router.post('/api/leads', formLimiter, async (req, res) => {
  const { full_name, email, phone, subject, message } = req.body || {};
  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'Укажите ФИО' });
  }
  const mail = (email || '').trim();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }
  const kind = req.body?.kind === 'career' ? 'career' : '';   // отклик на вакансию помечаем отдельно
  try {
    // CV принимаем только для откликов на вакансию; валидация+сохранение внутри saveUpload.
    let cv = null;
    if (kind === 'career' && req.body?.cv) cv = await saveUpload(req.body.cv, 'cv', null);
    const { rows } = await db.query(
      `INSERT INTO leads (full_name, email, phone, subject, message, kind, cv_file_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        String(full_name).trim().slice(0, 300),
        (email || '').trim().slice(0, 200),
        (phone || '').trim().slice(0, 60),
        (subject || '').trim().slice(0, 300),
        (message || '').trim().slice(0, 4000),
        kind,
        cv?.id || null,
      ]
    );
    res.status(201).json({ ok: true, id: rows[0].id, created_at: rows[0].created_at });
  } catch (e) {
    console.error('POST /api/leads:', e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось сохранить заявку' });
  }
});

// ── Админ: список клиентов ────────────────────────────────────────────────────
router.get('/api/leads', auth, async (req, res) => {
  const { status, q } = req.query;
  // Отклики на вакансии (kind='career') сюда НЕ попадают — они в разделе «Отклики».
  const where = [`COALESCE(l.kind, '') <> 'career'`];
  const params = [];
  // Изоляция сотрудника: staff видит ТОЛЬКО назначенные ему лиды (проверка на бэкенде,
  // а не только скрытием в UI). Остальные роли видят всё.
  if (req.admin.role === 'staff') {
    params.push(req.admin.id || 0);
    where.push(`l.assignee_id = $${params.length}`);
  }
  if (status && ALLOWED_STATUSES.includes(status)) {
    params.push(status);
    where.push(`l.status = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    const i = params.length;
    where.push(`(LOWER(l.full_name) LIKE $${i} OR LOWER(l.email) LIKE $${i} OR LOWER(l.phone) LIKE $${i})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const { rows } = await db.query(
      `SELECT l.id, l.full_name, l.email, l.phone, l.subject, l.message, l.status,
              l.admin_comment, l.rating, l.reject_reason, l.assignee_id, l.assigned_by, l.assigned_at,
              u.username AS assignee_username, u.full_name AS assignee_name,
              (e.lead_id IS NOT NULL) AS has_evaluation,
              l.created_at, l.updated_at
       FROM leads l
       LEFT JOIN users u ON u.id = l.assignee_id
       LEFT JOIN evaluations e ON e.lead_id = l.id
       ${clause}
       ORDER BY l.created_at DESC
       LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/leads:', e.message);
    res.status(500).json({ error: 'Ошибка чтения из базы' });
  }
});

// ── Админ: счётчики ───────────────────────────────────────────────────────────
router.get('/api/stats', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS count FROM leads WHERE COALESCE(kind,'') <> 'career' GROUP BY status`
    );
    const byStatus = Object.fromEntries(ALLOWED_STATUSES.map(s => [s, 0]));
    let total = 0;
    rows.forEach(r => { byStatus[r.status] = r.count; total += r.count; });
    res.json({
      total,
      new: byStatus.new,
      in_progress: byStatus.in_progress,
      on_hold: byStatus.on_hold,
      served: byStatus.served,
      rejected: byStatus.rejected,
    });
  } catch (e) {
    console.error('GET /api/stats:', e.message);
    res.status(500).json({ error: 'Ошибка чтения статистики' });
  }
});

// ── Админ: обновление клиента (статус / комментарий / оценка) ─────────────────
router.patch('/api/leads/:id', auth, requireRole('admin', 'editor', 'manager', 'staff'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });

  // staff может менять только назначенные ему лиды
  if (req.admin.role === 'staff') {
    const own = await db.query(`SELECT assignee_id FROM leads WHERE id = $1`, [id]);
    if (!own.rows.length) return res.status(404).json({ error: 'Клиент не найден' });
    if (own.rows[0].assignee_id !== req.admin.id) {
      return res.status(403).json({ error: 'Это не ваш лид' });
    }
  }

  const sets = [];
  const params = [];
  const { status, admin_comment, rating, reject_reason } = req.body || {};

  if (status !== undefined) {
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }
    params.push(status); sets.push(`status = $${params.length}`);
  }
  if (admin_comment !== undefined) {
    params.push(String(admin_comment).slice(0, 4000));
    sets.push(`admin_comment = $${params.length}`);
  }
  if (reject_reason !== undefined) {
    params.push(String(reject_reason).slice(0, 2000));
    sets.push(`reject_reason = $${params.length}`);
  }
  if (rating !== undefined) {
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 0 || r > 5) {
      return res.status(400).json({ error: 'Оценка должна быть 0..5' });
    }
    params.push(r); sets.push(`rating = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Нет полей для обновления' });

  params.push(id);
  try {
    const { rows } = await db.query(
      `UPDATE leads SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Клиент не найден' });
    const ch = [];
    if (status !== undefined) ch.push(`статус → ${status}`);
    if (rating !== undefined) ch.push(`оценка → ${rating}`);
    if (admin_comment !== undefined) ch.push('комментарий изменён');
    if (reject_reason !== undefined) ch.push('указана причина отказа');
    logAudit(req, 'lead', id, status !== undefined ? 'status' : 'update', `Заявка #${id}: ${ch.join(', ')}`);
    res.json(await fetchLeadRow(id));
  } catch (e) {
    console.error('PATCH /api/leads:', e.message);
    res.status(500).json({ error: 'Не удалось обновить' });
  }
});

// ── Начальник/админ: назначить исполнителя на лид (один исполнитель) ──────────
router.patch('/api/leads/:id/assign', auth, requireRole('admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  const raw = req.body ? req.body.assignee_id : undefined;
  try {
    let assignee = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      const aid = Number(raw);
      if (!Number.isInteger(aid)) return res.status(400).json({ error: 'Некорректный сотрудник' });
      const u = await db.query(`SELECT id, username, full_name, active FROM users WHERE id = $1`, [aid]);
      if (!u.rows.length) return res.status(400).json({ error: 'Сотрудник не найден' });
      if (!u.rows[0].active) return res.status(400).json({ error: 'Сотрудник отключён' });
      assignee = u.rows[0];
    }
    const upd = await db.query(
      `UPDATE leads SET assignee_id = $1, assigned_by = $2,
              assigned_at = CASE WHEN $1::int IS NULL THEN NULL ELSE now() END
       WHERE id = $3 RETURNING id`,
      [assignee ? assignee.id : null, assignee ? req.admin.u : '', id]
    );
    if (!upd.rows.length) return res.status(404).json({ error: 'Лид не найден' });
    const who = assignee ? (assignee.full_name || assignee.username) : '—';
    logAudit(req, 'lead', id, 'assign', assignee ? `Лид #${id} назначен: ${who}` : `Снято назначение с лида #${id}`);
    // Уведомление сотруднику о новой задаче (не уведомляем сам себя).
    if (assignee && assignee.id !== req.admin.id) {
      const out0 = await db.query(`SELECT full_name, subject FROM leads WHERE id = $1`, [id]);
      const lead0 = out0.rows[0] || {};
      await notify(assignee.id, 'assignment', id, 'Новая задача',
        `Вам назначен лид: ${lead0.full_name || ('#' + id)}${lead0.subject ? ' — ' + lead0.subject : ''}`);
    }
    res.json(await fetchLeadRow(id));
  } catch (e) {
    console.error('PATCH /api/leads/:id/assign:', e.message);
    res.status(500).json({ error: 'Не удалось назначить' });
  }
});

// ── Админ: удаление заявки ────────────────────────────────────────────────────
router.delete('/api/leads/:id', auth, requireRole('admin', 'editor', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    const { rowCount } = await db.query(`DELETE FROM leads WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Заявка не найдена' });
    logAudit(req, 'lead', id, 'delete', `Удалена заявка #${id}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/leads:', e.message);
    res.status(500).json({ error: 'Не удалось удалить заявку' });
  }
});

// ── Оценочный лист по лиду (заполняет сотрудник после обслуживания) ───────────
// staff — только по своим лидам; admin/manager — по любым.
async function leadOwnedOrManager(req, id) {
  if (req.admin.role !== 'staff') return true;
  const r = await db.query(`SELECT assignee_id FROM leads WHERE id = $1`, [id]);
  return r.rows.length > 0 && r.rows[0].assignee_id === req.admin.id;
}

// Сколько раз этот клиент уже обращался (по email/телефону), не считая текущую заявку.
async function priorOrdersCount(id) {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n
         FROM leads l2 JOIN leads l1 ON l1.id = $1
        WHERE l2.id <> l1.id
          AND ( (btrim(coalesce(l1.email,'')) <> '' AND l2.email = l1.email)
             OR (btrim(coalesce(l1.phone,'')) <> '' AND l2.phone = l1.phone) )`, [id]);
    return rows[0]?.n || 0;
  } catch { return 0; }
}

// Факты по сделке: нормализуем входной объект к безопасному виду.
function sanitizeFacts(f = {}) {
  const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const oneOf = (v, arr) => (arr.includes(v) ? v : '');
  return {
    response_speed: oneOf(f.response_speed, ['fast', 'medium', 'slow']),
    revisions: num(f.revisions, 999),
    paid_on_time: oneOf(f.paid_on_time, ['yes', 'partial', 'no']),
    conflict: !!f.conflict,
    ts_clarity: oneOf(f.ts_clarity, ['low', 'medium', 'high']),
    repeat_prob: num(f.repeat_prob, 10),
    comment: String(f.comment ?? '').slice(0, 2000),
    cost: num(f.cost, 1e12),
    duration_days: num(f.duration_days, 100000),
    messages: num(f.messages, 1e6),
    calls: num(f.calls, 1e6),
    avg_response: String(f.avg_response ?? '').slice(0, 60),
  };
}

router.get('/api/leads/:id/evaluation', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    if (!(await leadOwnedOrManager(req, id))) return res.status(403).json({ error: 'Это не ваш лид' });
    const { rows } = await db.query(`SELECT * FROM evaluations WHERE lead_id = $1`, [id]);
    const prior_orders = await priorOrdersCount(id);
    res.json({ ...(rows[0] || {}), prior_orders });   // всегда отдаём prior_orders (даже без листа)
  } catch (e) { console.error('GET evaluation:', e.message); res.status(500).json({ error: 'Ошибка чтения' }); }
});

router.post('/api/leads/:id/evaluation', auth, requireRole('admin', 'manager', 'staff'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    if (!(await leadOwnedOrManager(req, id))) return res.status(403).json({ error: 'Это не ваш лид' });
    const b = req.body || {};
    const facts = sanitizeFacts(b.facts || b);
    // revisions_count/had_conflict/notes дублируем в отдельные колонки (для совместимости и скоринга),
    // полный набор фактов — в facts (JSONB).
    const { rows } = await db.query(
      `INSERT INTO evaluations
         (lead_id, revisions_count, had_conflict, notes, facts, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (lead_id) DO UPDATE SET
         revisions_count=EXCLUDED.revisions_count, had_conflict=EXCLUDED.had_conflict,
         notes=EXCLUDED.notes, facts=EXCLUDED.facts
       RETURNING *`,
      [id, facts.revisions, facts.conflict, facts.comment, JSON.stringify(facts), req.admin.u]
    );
    logAudit(req, 'lead', id, 'evaluation', `Оценочный лист по лиду #${id} сохранён`);
    res.json(rows[0]);
  } catch (e) { console.error('POST evaluation:', e.message); res.status(500).json({ error: 'Не удалось сохранить лист' }); }
});

// ── PDF-отчёт по клиенту (серверная генерация) ───────────────────────────────
// Доступен только для обслуженных клиентов с заполненным оценочным листом.
// staff — только по своим лидам; admin/manager/editor — по любым.
function reportFileName(name) {
  const safe = String(name || '').trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|.]+/g, '').slice(0, 80);
  return `${safe || 'Клиент'}_Отчёт.pdf`;
}

router.get('/api/leads/:id/report.pdf', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    if (!(await leadOwnedOrManager(req, id))) return res.status(403).json({ error: 'Это не ваш лид' });
    const lead = await fetchLeadRow(id);
    if (!lead) return res.status(404).json({ error: 'Клиент не найден' });
    if (lead.status !== 'served' || !lead.has_evaluation) {
      return res.status(400).json({ error: 'Отчёт доступен только для обслуженных клиентов с заполненным оценочным листом' });
    }
    if (!fontsAvailable()) return res.status(500).json({ error: 'Шрифты для PDF не найдены на сервере (assets/fonts)' });

    const evq = await db.query(`SELECT * FROM evaluations WHERE lead_id = $1`, [id]);
    const ev = { ...(evq.rows[0] || {}), prior_orders: await priorOrdersCount(id) };
    const pdf = await buildReportPDF(lead, ev);

    const fname = reportFileName(lead.full_name);
    res.setHeader('Content-Type', 'application/pdf');
    // ASCII-fallback + RFC 5987 (UTF-8) — корректное кириллическое имя файла в браузере.
    res.setHeader('Content-Disposition', `attachment; filename="report_${id}.pdf"; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.setHeader('Content-Length', pdf.length);
    logAudit(req, 'lead', id, 'report', `Сформирован PDF-отчёт по лиду #${id}`);
    res.send(pdf);
  } catch (e) {
    console.error('GET /api/leads/:id/report.pdf:', e.message);
    res.status(500).json({ error: 'Не удалось сформировать отчёт' });
  }
});

module.exports = router;
