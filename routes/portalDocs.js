// routes/portalDocs.js — документы портала: ИИ-генерация официальных документов,
// CRUD, ИИ-сводка/перевод и PDF-экспорт.
const express = require('express');
const db = require('../db');
const { buildDocPDF } = require('../docPdf');
const { buildDocDOCX, docxAvailable } = require('../docDocx');
const { fontsAvailable } = require('../pdfReport');
const { auth } = require('../lib/auth');
const { clip, parseJsonLoose, cleanAnswer } = require('../lib/util');
const { aiText } = require('../lib/ai');
const { removeFromIndex } = require('../lib/rag');

const router = express.Router();

const DOC_TYPES = {
  memo: 'служебная записка', statement: 'заявление', order: 'приказ',
  letter: 'официальное деловое письмо', explanatory: 'объяснительная записка', request: 'служебный запрос',
};

router.post('/api/portal/docs/generate', auth, async (req, res) => {
  const type = DOC_TYPES[req.body?.type] ? req.body.type : 'memo';
  const to = clip(req.body?.to, 200), subject = clip(req.body?.subject, 300), details = clip(req.body?.details, 3000);
  if (!subject && !details) return res.status(400).json({ error: 'Укажите тему или суть документа' });
  try {
    const prompt = `Ты — помощник делопроизводителя ЦЦР (Центр цифрового развития Нацбанка Казахстана).
Составь официальный документ на русском языке в деловом стиле, как настоящий документ организации. Тип: ${DOC_TYPES[type]}.
Требования к тексту: обращение к адресату (если уместно); основной текст; если содержание позволяет — нумерованные пункты вида «1. …», «1.1. …» (заголовки разделов с новой строки); без строк даты и подписи в конце — их добавляет фирменный бланк автоматически. Не выдумывай номера приказов и фамилии, которых нет в данных.
Верни СТРОГО валидный JSON без пояснений:
{"title": "<краткий заголовок документа>", "body": "<готовый текст документа>"}
Данные:
- От кого: ${req.admin.u}
- Кому (адресат): ${to || '—'}
- Тема: ${subject || '—'}
- Суть / что изложить: ${details || subject}`;
    const text = await aiText(prompt, { json: true });   // OpenAI-приоритетно
    const j = parseJsonLoose(text) || {};
    const cap = DOC_TYPES[type].charAt(0).toUpperCase() + DOC_TYPES[type].slice(1);
    res.json({ title: clip(j.title, 200) || cap, body: String(j.body || '').slice(0, 12000) });
  } catch (e) { console.error('POST /api/portal/docs/generate:', e.message); res.status(500).json({ error: 'ИИ недоступен: ' + (e.message || 'ошибка') }); }
});

router.get('/api/portal/docs', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id, title, doc_type, category, author_id, author_name, created_at, updated_at FROM documents ORDER BY id DESC LIMIT 300`);
    res.json(rows);
  } catch (e) { console.error('GET /api/portal/docs:', e.message); res.status(500).json({ error: 'Ошибка чтения документов' }); }
});
// Один документ с текстом (для предпросмотра без тяжёлого PDF-iframe)
router.get('/api/portal/docs/:id(\\d+)', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id, title, doc_type, category, body, author_name, created_at FROM documents WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
    res.json(rows[0]);
  } catch (e) { console.error('GET /api/portal/docs/:id:', e.message); res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/api/portal/docs', auth, async (req, res) => {
  const title = clip(req.body?.title, 200) || 'Документ';
  const body = String(req.body?.body || '').slice(0, 20000);
  const doc_type = clip(req.body?.doc_type, 40);
  const category = clip(req.body?.category, 40);
  if (!body.trim()) return res.status(400).json({ error: 'Пустой документ' });
  try {
    const { rows } = await db.query(
      `INSERT INTO documents (title, doc_type, category, body, author_id, author_name) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, title, doc_type, category, author_id, author_name, created_at, updated_at`,
      [title, doc_type, category, body, req.admin.id, req.admin.u]);
    res.status(201).json(rows[0]);
  } catch (e) { console.error('POST /api/portal/docs:', e.message); res.status(500).json({ error: 'Не удалось сохранить' }); }
});

// ИИ-краткое содержание документа (по id — сервер берёт текст из БД).
router.post('/api/portal/docs/:id(\\d+)/summary', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT title, body FROM documents WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
    const prompt = `Кратко изложи суть документа ниже на русском языке — 3–5 пунктов маркированным списком, по делу, без воды. Документ «${rows[0].title}»:\n"""\n${(rows[0].body || '').slice(0, 6000)}\n"""`;
    const summary = cleanAnswer(await aiText(prompt));
    res.json({ summary });
  } catch (e) { console.error('POST /api/portal/docs/summary:', e.message); res.status(502).json({ error: 'ИИ недоступен' }); }
});
// ИИ-перевод документа на казахский/английский.
const DOC_TR_LANG = { kk: 'казахский', en: 'английский' };
router.post('/api/portal/docs/:id(\\d+)/translate', auth, async (req, res) => {
  const to = DOC_TR_LANG[req.body?.to] ? req.body.to : 'kk';
  try {
    const { rows } = await db.query(`SELECT title, body FROM documents WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
    const prompt = `Переведи текст делового документа на ${DOC_TR_LANG[to]} язык. Сохрани деловой стиль и структуру. Верни ТОЛЬКО перевод, без пояснений.\n\n${(rows[0].body || '').slice(0, 6000)}`;
    const text = cleanAnswer(await aiText(prompt));
    res.json({ text, to });
  } catch (e) { console.error('POST /api/portal/docs/translate:', e.message); res.status(502).json({ error: 'ИИ недоступен' }); }
});

// PDF документа: inline для превью в iframe, ?download=1 — на скачивание
router.get('/api/portal/docs/:id(\\d+)/pdf', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM documents WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Документ не найден' });
    if (!fontsAvailable()) return res.status(500).json({ error: 'Шрифты для PDF не найдены (assets/fonts)' });
    const d = rows[0];
    const pdf = await buildDocPDF({ id: d.id, title: d.title, body: d.body, author: d.author_name, createdAt: d.created_at, docType: d.doc_type });
    const dl = req.query.download === '1';
    const safe = String(d.title || 'Документ').replace(/[\r\n"]+/g, '_').slice(0, 80);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${dl ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(safe)}.pdf`);
    res.send(pdf);
  } catch (e) { console.error('GET /api/portal/docs/pdf:', e.message); res.status(500).json({ error: 'Не удалось сформировать PDF' }); }
});

// DOCX документа: редактируемая версия того же бланка — открывается в Word (всегда на скачивание).
router.get('/api/portal/docs/:id(\\d+)/docx', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM documents WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Документ не найден' });
    if (!docxAvailable()) return res.status(500).json({ error: 'Генерация DOCX недоступна' });
    const d = rows[0];
    const docx = await buildDocDOCX({ id: d.id, title: d.title, body: d.body, author: d.author_name, createdAt: d.created_at, docType: d.doc_type });
    const safe = String(d.title || 'Документ').replace(/[\r\n"]+/g, '_').slice(0, 80);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.docx`);
    res.send(docx);
  } catch (e) { console.error('GET /api/portal/docs/docx:', e.message); res.status(500).json({ error: 'Не удалось сформировать DOCX' }); }
});

router.delete('/api/portal/docs/:id(\\d+)', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT author_id FROM documents WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
    const canDel = rows[0].author_id === req.admin.id || ['admin', 'manager'].includes(req.admin.role);
    if (!canDel) return res.status(403).json({ error: 'Удалять можно только свои документы' });
    await db.query(`DELETE FROM documents WHERE id = $1`, [Number(req.params.id)]);
    await removeFromIndex('document', Number(req.params.id));   // сразу убрать из глобального поиска
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/portal/docs:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

module.exports = router;
