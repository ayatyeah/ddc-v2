// routes/vacancies.js — карьера: публичные вакансии, админ-CRUD вакансий,
// отклики кандидатов и их ИИ-оценка (скоринг резюме).
const express = require('express');
const db = require('../db');
const { auth, requireRole, logAudit } = require('../lib/auth');
const { extractCvFileText } = require('../lib/uploads');
const { aiText } = require('../lib/ai');
const { clip, parseJsonLoose } = require('../lib/util');

const router = express.Router();

// ── Публичные вакансии (для страницы «Карьера») ───────────────────────────────
router.get('/api/vacancies', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, department, location, employment, description, created_at
         FROM vacancies WHERE published = TRUE ORDER BY sort_order, id DESC LIMIT 100`);
    res.json(rows);
  } catch (e) { console.error('GET /api/vacancies:', e.message); res.status(500).json({ error: 'Ошибка чтения вакансий' }); }
});

// ── Отклики на вакансии (карьера): список + ИИ-анализ кандидатов ──────────────
router.get('/api/admin/careers', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT l.id, l.full_name, l.email, l.phone, l.subject, l.message, l.created_at,
              l.cv_file_id, f.orig AS cv_name,
              a.fit_score, a.verdict, a.created_at AS analyzed_at
         FROM leads l
         LEFT JOIN files f ON f.id = l.cv_file_id
         LEFT JOIN career_ai a ON a.lead_id = l.id
        WHERE l.kind = 'career' ORDER BY l.created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { console.error('GET /api/admin/careers:', e.message); res.status(500).json({ error: 'Ошибка чтения откликов' }); }
});

// ИИ-анализ конкретного кандидата: скор пригодности + сильные/слабые стороны + рекомендация
router.post('/api/admin/careers/:id(\\d+)/analyze', auth, requireRole('admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await db.query(`SELECT * FROM leads WHERE id = $1 AND kind = 'career'`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Отклик не найден' });
    const l = rows[0];
    // Достаём текст из приложенного резюме (PDF/DOCX), чтобы ИИ анализировал само CV.
    let cvText = '';
    if (l.cv_file_id) {
      const fr = await db.query(`SELECT stored, orig FROM files WHERE id = $1`, [l.cv_file_id]);
      cvText = await extractCvFileText(fr.rows[0]);
    }
    const cvBlock = cvText
      ? `текст резюме ниже:\n"""\n${cvText}\n"""`
      : (l.cv_file_id ? 'приложено файлом (текст не удалось распознать — формат .doc или скан)' : 'не приложено');
    const prompt = `Ты — опытный IT-рекрутер Центра цифрового развития (ЦЦР) Нацбанка Казахстана.
Проанализируй отклик на вакансию и верни СТРОГО валидный JSON без пояснений в формате:
{"fit_score": <целое 0-100>, "summary": "<2-3 предложения по сути кандидата>",
 "strengths": ["<сильная сторона>", ...], "risks": ["<риск/пробел>", ...],
 "recommendation": "invite|maybe|reject", "reason": "<короткое обоснование рекомендации>"}
Оценивай по релевантности вакансии, опыту/навыкам из резюме, мотивации и полноте отклика. Данные кандидата:
- Имя: ${l.full_name}
- Тема/вакансия: ${l.subject || '—'}
- Контакты: ${l.email || '—'} ${l.phone || ''}
- Сопроводительное письмо: ${(l.message || '').slice(0, 2000) || '(не заполнено)'}
- Резюме (CV): ${cvBlock}`;
    const text = await aiText(prompt, { json: true });   // OpenAI-приоритетно
    const j = parseJsonLoose(text) || {};
    const fit = Math.max(0, Math.min(100, Math.round(Number(j.fit_score) || 0)));
    await db.query(
      `INSERT INTO career_ai (lead_id, fit_score, verdict) VALUES ($1, $2, $3)
       ON CONFLICT (lead_id) DO UPDATE SET fit_score = EXCLUDED.fit_score, verdict = EXCLUDED.verdict, created_at = now()`,
      [id, fit, JSON.stringify(j)]);
    logAudit(req, 'career', id, 'ai', `ИИ-анализ отклика #${id} (скор ${fit})`);
    res.json({ lead_id: id, fit_score: fit, verdict: j, analyzed_at: new Date().toISOString() });
  } catch (e) {
    console.error('POST /api/admin/careers/analyze:', e.message);
    res.status(500).json({ error: 'ИИ недоступен: ' + (e.message || 'ошибка') });
  }
});

// ── Админ: управление вакансиями ──────────────────────────────────────────────
router.get('/api/admin/vacancies', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, department, location, employment, description, published, sort_order, created_at
         FROM vacancies ORDER BY sort_order, id DESC`);
    res.json(rows);
  } catch (e) { console.error('GET /api/admin/vacancies:', e.message); res.status(500).json({ error: 'Ошибка чтения' }); }
});
router.post('/api/admin/vacancies', auth, requireRole('admin', 'manager'), async (req, res) => {
  const b = req.body || {};
  const title = clip(b.title, 200);
  if (!title) return res.status(400).json({ error: 'Укажите название вакансии' });
  try {
    const { rows: mx } = await db.query(`SELECT COALESCE(max(sort_order), -1) + 1 AS n FROM vacancies`);
    const { rows } = await db.query(
      `INSERT INTO vacancies (title, department, location, employment, description, published, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, clip(b.department, 120), clip(b.location, 120) || 'Астана', clip(b.employment, 120) || 'Полная занятость',
       clip(b.description, 4000), b.published !== false, mx[0].n]);
    logAudit(req, 'vacancy', rows[0].id, 'create', `Создана вакансия «${title}»`);
    res.status(201).json(rows[0]);
  } catch (e) { console.error('POST /api/admin/vacancies:', e.message); res.status(500).json({ error: 'Не удалось создать' }); }
});
router.patch('/api/admin/vacancies/:id(\\d+)', auth, requireRole('admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id), b = req.body || {};
  const set = [], vals = [];
  for (const [k, max] of [['title', 200], ['department', 120], ['location', 120], ['employment', 120], ['description', 4000]]) {
    if (k in b) { set.push(`${k} = $${set.length + 1}`); vals.push(clip(b[k], max)); }
  }
  if ('published' in b) { set.push(`published = $${set.length + 1}`); vals.push(!!b.published); }
  if ('sort_order' in b) { set.push(`sort_order = $${set.length + 1}`); vals.push(Number(b.sort_order) || 0); }
  if (!set.length) return res.status(400).json({ error: 'Нечего обновлять' });
  vals.push(id);
  try {
    const { rows } = await db.query(`UPDATE vacancies SET ${set.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Вакансия не найдена' });
    res.json(rows[0]);
  } catch (e) { console.error('PATCH /api/admin/vacancies:', e.message); res.status(500).json({ error: 'Не удалось обновить' }); }
});
router.delete('/api/admin/vacancies/:id(\\d+)', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { rowCount } = await db.query(`DELETE FROM vacancies WHERE id = $1`, [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: 'Вакансия не найдена' });
    logAudit(req, 'vacancy', Number(req.params.id), 'delete', 'Удалена вакансия');
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/admin/vacancies:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

module.exports = router;
