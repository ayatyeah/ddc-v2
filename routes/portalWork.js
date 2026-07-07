// routes/portalWork.js — рабочие процессы портала: заявки сотрудников (согласование)
// и задачи (канбан). Живые обновления — по SSE.
const express = require('express');
const db = require('../db');
const { auth } = require('../lib/auth');
const { clip, parseJsonLoose } = require('../lib/util');
const { broadcast, broadcastAll, notify } = require('../lib/sse');
const { aiText } = require('../lib/ai');

const router = express.Router();

// ── Заявки сотрудников (отпуск/справка/доступ…) со статусами согласования ──────
const REQUEST_KINDS = {
  vacation: 'Отпуск', sick: 'Больничный', trip: 'Командировка', certificate: 'Справка',
  access: 'Доступ к системе', equipment: 'Закупка оборудования', pass: 'Пропуск', other: 'Другое',
};
const REQ_STATUSES = ['review', 'approved', 'rejected', 'done'];
const REQ_STATUS_LABEL = { review: 'На согласовании', approved: 'Одобрено', rejected: 'Отклонено', done: 'Выполнено' };
const mapReq = (r) => ({ ...r, kind_label: REQUEST_KINDS[r.kind] || r.kind });

router.get('/api/portal/requests', auth, async (req, res) => {
  const isHead = ['admin', 'manager'].includes(req.admin.role);
  try {
    const { rows } = isHead
      ? await db.query(`SELECT * FROM requests ORDER BY (status = 'review') DESC, id DESC LIMIT 300`)
      : await db.query(`SELECT * FROM requests WHERE author_id = $1 ORDER BY id DESC LIMIT 200`, [req.admin.id]);
    res.json(rows.map(mapReq));
  } catch (e) { console.error('GET /api/portal/requests:', e.message); res.status(500).json({ error: 'Ошибка чтения заявок' }); }
});

router.post('/api/portal/requests', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Заявки доступны сотрудникам с учётной записью' });
  const kind = REQUEST_KINDS[req.body?.kind] ? req.body.kind : 'other';
  const title = clip(req.body?.title, 200) || REQUEST_KINDS[kind];
  const body = clip(req.body?.body, 3000);
  try {
    const { rows } = await db.query(
      `INSERT INTO requests (kind, title, body, status, author_id, author_name) VALUES ($1,$2,$3,'review',$4,$5) RETURNING *`,
      [kind, title, body, me, req.admin.u]);
    broadcastAll('request', { id: rows[0].id });   // списки согласующих обновятся мгновенно
    res.status(201).json(mapReq(rows[0]));
  } catch (e) { console.error('POST /api/portal/requests:', e.message); res.status(500).json({ error: 'Не удалось создать заявку' }); }
});

// ИИ-анализ заявки для согласующего: приоритет, суть, рекомендация (одобрить/отклонить/уточнить).
router.post('/api/portal/requests/:id(\\d+)/analyze', auth, async (req, res) => {
  if (!['admin', 'manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Только для согласующих' });
  try {
    const { rows } = await db.query(`SELECT * FROM requests WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    const r = rows[0];
    const prompt = `Ты — HR-ассистент корпоративного портала DDC. Проанализируй заявку сотрудника и верни СТРОГО JSON:
{"priority":"low|normal|high","summary":"1-2 предложения сути по-русски","recommendation":"approve|reject|clarify","reason":"почему такая рекомендация, 1 короткое предложение по-русски"}
Заявка:
Тип: ${REQUEST_KINDS[r.kind] || r.kind}
Заголовок: ${r.title}
Детали: ${r.body || '—'}
Автор: ${r.author_name}
Отвечай ТОЛЬКО JSON, без markdown.`;
    let ai = null;
    try { ai = parseJsonLoose(await aiText(prompt, { json: true })); } catch { /* фолбэк ниже */ }
    if (!ai) return res.status(502).json({ error: 'ИИ недоступен' });
    const clean = {
      priority: ['low', 'normal', 'high'].includes(ai.priority) ? ai.priority : 'normal',
      summary: String(ai.summary || '').slice(0, 400),
      recommendation: ['approve', 'reject', 'clarify'].includes(ai.recommendation) ? ai.recommendation : 'clarify',
      reason: String(ai.reason || '').slice(0, 300),
    };
    await db.query(`UPDATE requests SET ai = $1 WHERE id = $2`, [JSON.stringify(clean), r.id]);
    res.json({ ai: clean });
  } catch (e) { console.error('POST /api/portal/requests/analyze:', e.message); res.status(502).json({ error: 'Ошибка анализа' }); }
});

// Согласование: одобрить/отклонить/выполнено — только руководители/замы (admin/manager)
router.patch('/api/portal/requests/:id(\\d+)', auth, async (req, res) => {
  if (!['admin', 'manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Согласовывать заявки могут руководители отделов' });
  const status = REQ_STATUSES.includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'Некорректный статус' });
  try {
    const { rows } = await db.query(
      `UPDATE requests SET status = $1, decided_by = $2, reviewer_id = $3, decided_at = now() WHERE id = $4 RETURNING *`,
      [status, req.admin.u, req.admin.id, Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    if (rows[0].author_id && rows[0].author_id !== req.admin.id) {
      await notify(rows[0].author_id, 'request', null, `Заявка: ${REQ_STATUS_LABEL[status]}`, rows[0].title);
    }
    broadcastAll('request', { id: rows[0].id });
    res.json(mapReq(rows[0]));
  } catch (e) { console.error('PATCH /api/portal/requests:', e.message); res.status(500).json({ error: 'Не удалось обновить' }); }
});

router.delete('/api/portal/requests/:id(\\d+)', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT author_id FROM requests WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
    const canDel = rows[0].author_id === req.admin.id || ['admin', 'manager'].includes(req.admin.role);
    if (!canDel) return res.status(403).json({ error: 'Можно удалять только свои заявки' });
    await db.query(`DELETE FROM requests WHERE id = $1`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/portal/requests:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

// ── Рабочие задачи ──
const TASK_COLS = 'id, title, body, assignee_id, assignee_name, created_by, status, priority, due_date, created_at, updated_at';
const TASK_STATUSES = ['open', 'in_progress', 'done'];
const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
router.get('/api/portal/tasks', auth, async (req, res) => {
  try {
    // Приоритет для сортировки: urgent→high→normal→low; не выполненные выше выполненных.
    const { rows } = await db.query(
      `SELECT ${TASK_COLS} FROM tasks WHERE assignee_id = $1 OR created_by = $2
        ORDER BY (status = 'done'),
                 CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                 (due_date IS NULL), due_date, id DESC LIMIT 300`,
      [req.admin.id, req.admin.u]);
    res.json(rows);
  } catch (e) { console.error('GET /api/portal/tasks:', e.message); res.status(500).json({ error: 'Ошибка чтения задач' }); }
});
router.post('/api/portal/tasks', auth, async (req, res) => {
  const title = clip(req.body?.title, 200);
  const body = clip(req.body?.body, 2000);
  if (!title) return res.status(400).json({ error: 'Укажите название задачи' });
  const priority = TASK_PRIORITIES.includes(req.body?.priority) ? req.body.priority : 'normal';
  const due_date = req.body?.due_date ? String(req.body.due_date).slice(0, 10) : null;
  const aid = Number(req.body?.assignee_id);
  // Назначать задачи ДРУГИМ сотрудникам могут только руководители/замы (admin/manager).
  const assigningOther = Number.isInteger(aid) && aid !== req.admin.id;
  if (assigningOther && !['admin', 'manager'].includes(req.admin.role)) {
    return res.status(403).json({ error: 'Назначать задачи сотрудникам могут только руководители отделов и их заместители' });
  }
  try {
    let assignee_id = null, assignee_name = '';
    if (Number.isInteger(aid)) {
      const u = await db.query(`SELECT id, username, full_name FROM users WHERE id = $1 AND active = TRUE`, [aid]);
      if (u.rows.length) { assignee_id = u.rows[0].id; assignee_name = u.rows[0].full_name || u.rows[0].username; }
    }
    const { rows } = await db.query(
      `INSERT INTO tasks (title, body, assignee_id, assignee_name, created_by, priority, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${TASK_COLS}`,
      [title, body, assignee_id, assignee_name, req.admin.u, priority, due_date]);
    if (assignee_id && assignee_id !== req.admin.id) await notify(assignee_id, 'task', null, 'Новая задача', title);
    broadcast([req.admin.id, assignee_id].filter(Boolean), 'task', { id: rows[0].id });
    res.status(201).json(rows[0]);
  } catch (e) { console.error('POST /api/portal/tasks:', e.message); res.status(500).json({ error: 'Не удалось создать задачу' }); }
});
router.patch('/api/portal/tasks/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  // Редактируем только переданные поля (статус/приоритет/срок/описание/название).
  const sets = [], vals = [];
  const push = (col, v) => { sets.push(`${col} = $${sets.length + 1}`); vals.push(v); };
  if (req.body?.status !== undefined) push('status', TASK_STATUSES.includes(req.body.status) ? req.body.status : 'open');
  if (req.body?.priority !== undefined) push('priority', TASK_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'normal');
  if (req.body?.due_date !== undefined) push('due_date', req.body.due_date ? String(req.body.due_date).slice(0, 10) : null);
  if (req.body?.title !== undefined) push('title', clip(req.body.title, 200));
  if (req.body?.body !== undefined) push('body', clip(req.body.body, 2000));
  if (!sets.length) return res.status(400).json({ error: 'Нет изменений' });
  vals.push(id, req.admin.id, req.admin.u);
  try {
    const { rows } = await db.query(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${vals.length - 2} AND (assignee_id = $${vals.length - 1} OR created_by = $${vals.length})
       RETURNING ${TASK_COLS}`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Задача не найдена или нет прав' });
    broadcast([req.admin.id, rows[0].assignee_id].filter(Boolean), 'task', { id: rows[0].id });
    res.json(rows[0]);
  } catch (e) { console.error('PATCH /api/portal/tasks:', e.message); res.status(500).json({ error: 'Не удалось обновить' }); }
});
router.delete('/api/portal/tasks/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    // Удалять может создатель задачи или руководитель (admin/manager).
    const t = await db.query(`SELECT created_by FROM tasks WHERE id = $1`, [id]);
    if (!t.rows.length) return res.status(404).json({ error: 'Не найдено' });
    if (t.rows[0].created_by !== req.admin.u && !['admin', 'manager'].includes(req.admin.role))
      return res.status(403).json({ error: 'Нет прав на удаление' });
    await db.query(`DELETE FROM tasks WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/portal/tasks:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

module.exports = router;
