/**
 * server.js — бэкенд ЦЦР (DDC NBK).
 *
 * Заявки с сайта:
 *   POST   /api/leads            — приём заявки с публичной формы (без авторизации)
 *
 * Новости (публичное чтение):
 *   GET    /api/news             — список опубликованных новостей
 *   GET    /api/news/:id         — одна опубликованная новость
 *
 * Авторизация админа:
 *   POST   /api/login            — вход (admin/admin по умолчанию) → JWT в httpOnly cookie
 *   POST   /api/logout           — выход
 *   GET    /api/me               — проверка сессии
 *
 * Админ — заявки:
 *   GET    /api/leads            — список клиентов
 *   GET    /api/stats            — счётчики по статусам
 *   PATCH  /api/leads/:id        — смена статуса / комментария / оценки
 *
 * Админ — новости:
 *   GET    /api/admin/news       — все новости, включая черновики
 *   POST   /api/admin/news       — создать новость
 *   PUT    /api/admin/news/:id   — обновить новость
 *   DELETE /api/admin/news/:id   — удалить новость
 *
 * Креды БД и админа — в .env.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

// JWT_SECRET обязателен в проде — иначе сессии можно подделать. Падаем на старте, а не молча используем дефолт.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  if (PROD) {
    console.error('FATAL: JWT_SECRET не задан или слишком короткий. Установите длинную случайную строку в переменных окружения.');
    process.exit(1);
  } else {
    console.warn('⚠ JWT_SECRET не задан — использую небезопасный dev-секрет. НЕ ДЛЯ ПРОДА.');
  }
}
const SECRET = JWT_SECRET || 'dev-secret-change-me-not-for-prod';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
if (PROD && ADMIN_PASSWORD === 'admin') {
  console.warn('⚠ ADMIN_PASSWORD = "admin" в проде — смените на стойкий пароль через переменные окружения.');
}

const ALLOWED_STATUSES = ['new', 'in_progress', 'on_hold', 'served', 'rejected'];

// Опции cookie сессии. Same-origin (фронт и API на одном домене) → strict.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: PROD,
  path: '/',
};

// Папка с собранным React-приложением (vite build → ../public)
const STATIC_DIR = path.join(__dirname, 'public');

// За reverse-proxy (DigitalOcean App Platform) — доверяем заголовкам X-Forwarded-*,
// иначе rate-limit видит один IP на всех и secure-cookie не выставляется.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ── Middleware ────────────────────────────────────────────────────────────────
// Security-заголовки. CSP настроен под наш фронт: инлайновые стили (Vite), шрифты Google,
// канвас/воркеры three.js, обращения к Gemini-прокси (через наш же бэкенд).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // three.js/textures из data:/blob: иначе блокируются
  hsts: PROD ? { maxAge: 15552000, includeSubDomains: true } : false,
}));
app.use(compression());

const origins = (process.env.CORS_ORIGIN || '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: origins.length ? origins : true,   // в dev можно true; на проде укажи домены
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));   // 8mb был избыточен и расширял поверхность DoS
app.use(cookieParser());

// Раздаём собранный фронт как статику (с кешем для иммутабельных ассетов)
app.use(express.static(STATIC_DIR, {
  maxAge: PROD ? '1y' : 0,
  setHeaders: (res, filePath) => {
    if (/\.(html)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Ограничение частоты на чувствительные маршруты
const limiterOpts = { standardHeaders: true, legacyHeaders: false };
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, ...limiterOpts });
const formLimiter  = rateLimit({ windowMs: 60 * 1000, max: 10, ...limiterOpts });

// ── Авторизация ───────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.cookies && req.cookies.ddc_token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    req.admin = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Сессия истекла' });
  }
}

// Доступ только для указанных ролей
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

// Запись в историю изменений (кто, что, когда)
async function logAudit(req, entity, entityId, action, summary) {
  try {
    const actor = (req && req.admin && req.admin.u) || 'system';
    const role = (req && req.admin && req.admin.role) || '';
    await db.query(
      `INSERT INTO audit_log (actor, actor_role, entity, entity_id, action, summary) VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor, role, entity, entityId == null ? null : Number(entityId), action, (summary || '').slice(0, 500)]
    );
  } catch (e) { console.error('audit:', e.message); }
}

app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const issue = (u, role) => {
    const token = jwt.sign({ u, role }, SECRET, { expiresIn: '8h' });
    res.cookie('ddc_token', token, { ...COOKIE_OPTS, maxAge: 8 * 60 * 60 * 1000 });
    return res.json({ ok: true, username: u, role });
  };

  // 1) Суперадмин из .env
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return issue(username, 'admin');
  }
  // 2) Пользователь из таблицы users (bcrypt)
  try {
    const { rows } = await db.query(
      `SELECT username, password_hash, role FROM users WHERE username = $1`,
      [String(username || '').trim()]
    );
    if (rows.length) {
      const ok = await bcrypt.compare(String(password || ''), rows[0].password_hash);
      if (ok) return issue(rows[0].username, rows[0].role);
    }
  } catch (e) {
    console.error('POST /api/login:', e.message);
  }
  return res.status(401).json({ error: 'Неверный логин или пароль' });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('ddc_token', COOKIE_OPTS);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ username: req.admin.u, role: req.admin.role });
});

// ── Публичный приём заявки с формы сайта ──────────────────────────────────────
app.post('/api/leads', formLimiter, async (req, res) => {
  const { full_name, email, phone, subject, message } = req.body || {};
  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'Укажите ФИО' });
  }
  const mail = (email || '').trim();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO leads (full_name, email, phone, subject, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [
        String(full_name).trim().slice(0, 300),
        (email || '').trim().slice(0, 200),
        (phone || '').trim().slice(0, 60),
        (subject || '').trim().slice(0, 300),
        (message || '').trim().slice(0, 4000),
      ]
    );
    res.status(201).json({ ok: true, id: rows[0].id, created_at: rows[0].created_at });
  } catch (e) {
    console.error('POST /api/leads:', e.message);
    res.status(500).json({ error: 'Не удалось сохранить заявку' });
  }
});

// ── Публичные новости (только опубликованные) ─────────────────────────────────
const NEWS_COLS = `id, title_ru, title_kk, title_en, excerpt_ru, excerpt_kk, excerpt_en,
                   body_ru, body_kk, body_en, color, image, news_date, published,
                   created_at, updated_at`;

app.get('/api/news', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${NEWS_COLS} FROM news
       WHERE published = TRUE
       ORDER BY news_date DESC, id DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/news:', e.message);
    res.status(500).json({ error: 'Не удалось загрузить новости' });
  }
});

app.get('/api/news/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    const { rows } = await db.query(
      `SELECT ${NEWS_COLS} FROM news WHERE id = $1 AND published = TRUE`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Новость не найдена' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/news/:id:', e.message);
    res.status(500).json({ error: 'Ошибка чтения' });
  }
});

// ── Админ: список клиентов ────────────────────────────────────────────────────
app.get('/api/leads', auth, async (req, res) => {
  const { status, q } = req.query;
  const where = [];
  const params = [];
  if (status && ALLOWED_STATUSES.includes(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    const i = params.length;
    where.push(`(LOWER(full_name) LIKE $${i} OR LOWER(email) LIKE $${i} OR LOWER(phone) LIKE $${i})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, email, phone, subject, message, status,
              admin_comment, rating, created_at, updated_at
       FROM leads ${clause}
       ORDER BY created_at DESC
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
app.get('/api/stats', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS count FROM leads GROUP BY status`
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
app.patch('/api/leads/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });

  const sets = [];
  const params = [];
  const { status, admin_comment, rating } = req.body || {};

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
      `UPDATE leads SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, full_name, email, phone, subject, message, status,
                 admin_comment, rating, created_at, updated_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Клиент не найден' });
    const ch = [];
    if (status !== undefined) ch.push(`статус → ${status}`);
    if (rating !== undefined) ch.push(`оценка → ${rating}`);
    if (admin_comment !== undefined) ch.push('комментарий изменён');
    logAudit(req, 'lead', id, status !== undefined ? 'status' : 'update', `Заявка #${id}: ${ch.join(', ')}`);
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /api/leads:', e.message);
    res.status(500).json({ error: 'Не удалось обновить' });
  }
});

// ── Админ: удаление заявки ────────────────────────────────────────────────────
app.delete('/api/leads/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
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

// ── Админ: новости (CRUD) ─────────────────────────────────────────────────────
// Нормализация тела запроса новости → безопасные значения с обрезкой длины.
function normalizeNews(body = {}) {
  const s = (v, n) => String(v ?? '').slice(0, n);
  let color = s(body.color, 9).trim() || '#1a4aaa';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#1a4aaa';
  let date = s(body.news_date, 10).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = new Date().toISOString().slice(0, 10);
  // image: data-URL (base64) или http(s)-ссылка, иначе пусто
  let image = String(body.image ?? '').slice(0, 4_000_000);
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(image) && !/^https?:\/\//i.test(image)) image = '';
  return {
    title_ru: s(body.title_ru, 300), title_kk: s(body.title_kk, 300), title_en: s(body.title_en, 300),
    excerpt_ru: s(body.excerpt_ru, 600), excerpt_kk: s(body.excerpt_kk, 600), excerpt_en: s(body.excerpt_en, 600),
    body_ru: s(body.body_ru, 8000), body_kk: s(body.body_kk, 8000), body_en: s(body.body_en, 8000),
    color, image, news_date: date,
    published: body.published === undefined ? true : !!body.published,
  };
}

app.get('/api/admin/news', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${NEWS_COLS} FROM news ORDER BY news_date DESC, id DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/admin/news:', e.message);
    res.status(500).json({ error: 'Ошибка чтения новостей' });
  }
});

app.post('/api/admin/news', auth, requireRole('admin', 'editor'), async (req, res) => {
  const n = normalizeNews(req.body);
  if (!n.title_ru.trim() && !n.title_en.trim() && !n.title_kk.trim()) {
    return res.status(400).json({ error: 'Укажите заголовок хотя бы на одном языке' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO news
        (title_ru,title_kk,title_en,excerpt_ru,excerpt_kk,excerpt_en,
         body_ru,body_kk,body_en,color,image,news_date,published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING ${NEWS_COLS}`,
      [n.title_ru,n.title_kk,n.title_en,n.excerpt_ru,n.excerpt_kk,n.excerpt_en,
       n.body_ru,n.body_kk,n.body_en,n.color,n.image,n.news_date,n.published]
    );
    logAudit(req, 'news', rows[0].id, 'create', `Создана новость: ${rows[0].title_ru || rows[0].title_en || rows[0].title_kk || ('#'+rows[0].id)}`);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/admin/news:', e.message);
    res.status(500).json({ error: 'Не удалось создать новость' });
  }
});

app.put('/api/admin/news/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  const n = normalizeNews(req.body);
  try {
    const { rows } = await db.query(
      `UPDATE news SET
        title_ru=$1,title_kk=$2,title_en=$3,
        excerpt_ru=$4,excerpt_kk=$5,excerpt_en=$6,
        body_ru=$7,body_kk=$8,body_en=$9,
        color=$10,image=$11,news_date=$12,published=$13
       WHERE id=$14
       RETURNING ${NEWS_COLS}`,
      [n.title_ru,n.title_kk,n.title_en,n.excerpt_ru,n.excerpt_kk,n.excerpt_en,
       n.body_ru,n.body_kk,n.body_en,n.color,n.image,n.news_date,n.published, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Новость не найдена' });
    logAudit(req, 'news', id, 'update', `Изменена новость: ${rows[0].title_ru || rows[0].title_en || rows[0].title_kk || ('#'+id)}`);
    res.json(rows[0]);
  } catch (e) {
    console.error('PUT /api/admin/news:', e.message);
    res.status(500).json({ error: 'Не удалось обновить новость' });
  }
});

app.delete('/api/admin/news/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    const pre = await db.query(`SELECT title_ru, title_en, title_kk FROM news WHERE id = $1`, [id]);
    const { rowCount } = await db.query(`DELETE FROM news WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Новость не найдена' });
    const tt = pre.rows[0] ? (pre.rows[0].title_ru || pre.rows[0].title_en || pre.rows[0].title_kk) : ('#'+id);
    logAudit(req, 'news', id, 'delete', `Удалена новость: ${tt}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/news:', e.message);
    res.status(500).json({ error: 'Не удалось удалить' });
  }
});

// ── Админ: пользователи (только роль admin) ───────────────────────────────────
const ALLOWED_ROLES = ['admin', 'editor', 'viewer'];

app.get('/api/admin/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, role, created_at FROM users ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/admin/users:', e.message);
    res.status(500).json({ error: 'Ошибка чтения пользователей' });
  }
});

app.post('/api/admin/users', auth, requireRole('admin'), async (req, res) => {
  const username = String(req.body?.username || '').trim().slice(0, 60);
  const password = String(req.body?.password || '');
  const role = ALLOWED_ROLES.includes(req.body?.role) ? req.body.role : 'editor';
  if (!username || password.length < 4) {
    return res.status(400).json({ error: 'Логин и пароль (от 4 символов) обязательны' });
  }
  if (username === ADMIN_USERNAME) {
    return res.status(400).json({ error: 'Это имя занято суперадмином' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)
       RETURNING id, username, role, created_at`,
      [username, hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Такой логин уже есть' });
    console.error('POST /api/admin/users:', e.message);
    res.status(500).json({ error: 'Не удалось создать пользователя' });
  }
});

app.delete('/api/admin/users/:id', auth, requireRole('admin'), async (req, res) => {
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

// ── ИИ-аналитика клиентов (Gemini) с кэшированием ────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function callGemini(prompt, maxTokens = 2048) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY не задан в .env');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 }, // без «размышлений» — иначе бюджет уходит и ответ пустой
      },
    }),
  });
  if (!r.ok) { const tx = await r.text(); throw new Error(`Gemini ${r.status}: ${tx.slice(0, 300)}`); }
  const j = await r.json();
  const cand = j?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('пустой ответ ИИ (' + (cand?.finishReason || 'нет кандидатов') + ')');
  return text;
}

function parseJsonLoose(text) {
  let t = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

function leadsSignature(rows) {
  const crypto = require('crypto');
  const parts = rows.map((r) => `${r.id}:${r.status}:${r.rating}:${new Date(r.updated_at).getTime()}`);
  return crypto.createHash('sha1').update(rows.length + '|' + parts.join(',')).digest('hex');
}

// Текущий (последний) кэшированный анализ
app.get('/api/admin/ai/analysis', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT content, leads_sig, created_at FROM ai_analysis ORDER BY id DESC LIMIT 1`);
    if (!rows.length) return res.json({ analysis: null });
    res.json({ analysis: rows[0].content, cached_at: rows[0].created_at, sig: rows[0].leads_sig });
  } catch (e) {
    console.error('GET /api/admin/ai/analysis:', e.message);
    res.status(500).json({ error: 'Ошибка чтения анализа' });
  }
});

// Запуск анализа. Если заявки не менялись (та же подпись) — отдаём кэш без вызова ИИ.
app.post('/api/admin/ai/analyze', auth, requireRole('admin', 'editor'), async (req, res) => {
  const force = !!(req.body && req.body.force);
  try {
    const { rows: leads } = await db.query(
      `SELECT id, full_name, email, phone, subject, message, status, admin_comment, rating, created_at, updated_at
       FROM leads ORDER BY created_at DESC LIMIT 200`
    );
    const sig = leadsSignature(leads);

    if (!force) {
      const { rows: cached } = await db.query(
        `SELECT content, created_at FROM ai_analysis WHERE leads_sig = $1 ORDER BY id DESC LIMIT 1`, [sig]
      );
      if (cached.length) return res.json({ analysis: cached[0].content, cached_at: cached[0].created_at, fromCache: true });
    }

    if (!leads.length) {
      const empty = { summary: 'Заявок пока нет — анализировать нечего.', important_clients: [], main_problems: [], recommendations: [] };
      await db.query(`INSERT INTO ai_analysis (leads_sig, content) VALUES ($1, $2)`, [sig, JSON.stringify(empty)]);
      return res.json({ analysis: empty, fromCache: false });
    }

    const compact = leads.slice(0, 80).map((l) => ({
      id: l.id, name: l.full_name,
      subject: l.subject, message: (l.message || '').slice(0, 160),
      status: l.status, rating: l.rating, note: (l.admin_comment || '').slice(0, 120),
    }));
    const prompt =
`Ты аналитик по работе с клиентами IT-компании DDC. rating (0-5) — оценка клиента сотрудником (важность/качество клиента), не отзыв клиента.
Проанализируй заявки и верни ТОЛЬКО JSON такого вида:
{"summary":"2-3 предложения: состояние клиентской базы","important_clients":[{"id":число,"name":"имя","priority":"high|medium|low","reason":"почему важен","action":"что конкретно сделать с этим клиентом"}],"main_problems":[{"problem":"кратко","action":"что предпринять, чтобы решить"}],"recommendations":["конкретный следующий шаг для команды"]}
До 6 важных клиентов. В action и recommendations — конкретные действия (а не общие слова). Кратко, по-русски. Заявки: ${JSON.stringify(compact)}`;

    let analysis = null, lastErr = null;
    for (let attempt = 0; attempt < 3 && !analysis; attempt++) {
      try {
        const text = await callGemini(prompt);
        analysis = parseJsonLoose(text);
        if (!analysis) lastErr = new Error('не удалось разобрать ответ ИИ');
      } catch (e) { lastErr = e; }
      if (!analysis && attempt < 2) await new Promise((r) => setTimeout(r, 700));
    }
    if (!analysis) {
      return res.status(502).json({ error: 'ИИ-анализ недоступен: ' + (lastErr ? lastErr.message : 'неизвестная ошибка') });
    }
    await db.query(`INSERT INTO ai_analysis (leads_sig, content) VALUES ($1, $2)`, [sig, JSON.stringify(analysis)]);
    res.json({ analysis, fromCache: false });
  } catch (e) {
    console.error('POST /api/admin/ai/analyze:', e.message);
    res.status(502).json({ error: 'ИИ-анализ недоступен: ' + e.message });
  }
});

// ── AI-агрегатор новостей: цифровая жизнь и технологии Казахстана ─────────────
const FEED_SOURCES = [
  { name: 'Profit.kz', url: 'https://profit.kz/rss/' },
  { name: 'Digital Business', url: 'https://digitalbusiness.kz/feed/' },
];
const FEED_TTL_MS = 24 * 60 * 60 * 1000;
let buildInFlight = null;
function runBuild() {
  if (!buildInFlight) {
    buildInFlight = buildFeed().catch((e) => { console.error('buildFeed:', e.message); return null; }).finally(() => { buildInFlight = null; });
  }
  return buildInFlight; // конкурентные вызовы ждут один и тот же сбор
}

function stripTags(s) {
  return String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function parseRss(xml, source) {
  const items = [];
  const blocks = String(xml).split(/<item[\s>]/i).slice(1);
  for (const b of blocks.slice(0, 12)) {
    const get = (tag) => { const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? stripTags(m[1]) : ''; };
    const title = get('title');
    let link = get('link');
    if (!link) { const m = b.match(/<link[^>]*>([\s\S]*?)<\/link>/i); link = m ? m[1].trim() : ''; }
    const date = get('pubDate');
    const desc = get('description').slice(0, 240);
    if (title) items.push({ title, url: link, date, desc, source });
  }
  return items;
}
async function fetchRss(src) {
  try {
    const r = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0 DDC-NewsBot' } });
    if (!r.ok) return [];
    return parseRss(await r.text(), src.name);
  } catch (e) { console.error('RSS', src.name, e.message); return []; }
}
async function buildFeed() {
  const all = (await Promise.all(FEED_SOURCES.map(fetchRss))).flat();
  if (!all.length) return null;
  let result = null;
  try {
    // экономия токенов: меньше элементов на входе, короткие описания
    const input = all.slice(0, 16).map((x) => ({ title: x.title, source: x.source, url: x.url, date: x.date, desc: (x.desc || '').slice(0, 140) }));
    const prompt =
`Ты — редактор новостей о цифровом Казахстане. Из списка ниже отбери до 6 самых релевантных новостей про цифровую жизнь Казахстана, новые технологии, ИТ, финтех и цифровизацию госуслуг.
Сделай так, чтобы их можно было прочитать прямо у нас на сайте, не переходя на источник.
Верни ТОЛЬКО JSON-объект вида:
{"digest":"2-3 предложения — общий обзор главного за день по-русски","items":[{"title":"заголовок на русском","summary":"краткий пересказ новости в 2-3 предложениях по-русски, своими словами","url":"ссылка из данных","source":"источник из данных","date":"дата как есть"}]}
Не копируй текст дословно — пиши пересказ своими словами. Новости: ${JSON.stringify(input)}`;
    const parsed = parseJsonLoose(await callGemini(prompt, 1600));
    if (parsed && Array.isArray(parsed.items)) result = { digest: String(parsed.digest || ''), items: parsed.items };
    else if (Array.isArray(parsed)) result = { digest: '', items: parsed };
  } catch (e) { console.error('feed Gemini:', e.message); }
  if (!result) {
    result = { digest: '', items: all.slice(0, 6).map((x) => ({ title: x.title, summary: x.desc || '', url: x.url, source: x.source, date: x.date })) };
  }
  await db.query(`INSERT INTO feed_cache (content) VALUES ($1)`, [JSON.stringify(result)]);
  return result;
}
async function refreshFeedIfStale(force) {
  try {
    const { rows } = await db.query(`SELECT fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`);
    const fresh = rows.length && (Date.now() - new Date(rows[0].fetched_at).getTime() < FEED_TTL_MS);
    if (fresh && !force) return;
    await runBuild();
  } catch (e) { console.error('refreshFeed:', e.message); }
}
// Публичная лента (отдаём кэш мгновенно; обновление — не чаще раза в сутки, в фоне)
app.get('/api/news/aggregated', async (req, res) => {
  try {
    let { rows } = await db.query(`SELECT content, fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`);
    if (!rows.length) {
      await refreshFeedIfStale(true);
      ({ rows } = await db.query(`SELECT content, fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`));
    } else {
      refreshFeedIfStale(false); // фоном, не блокируя ответ
    }
    if (!rows.length) return res.json({ items: [], digest: '', updated_at: null });
    const c = rows[0].content;
    const items = Array.isArray(c) ? c : (c && Array.isArray(c.items) ? c.items : []);
    const digest = (c && !Array.isArray(c) && c.digest) ? c.digest : '';
    res.json({ items, digest, updated_at: rows[0].fetched_at });
  } catch (e) { console.error('GET /api/news/aggregated:', e.message); res.json({ items: [], digest: '', updated_at: null }); }
});

// Принудительное обновление ленты из админки (вне 24-часового лимита)
app.post('/api/admin/news/aggregate/refresh', auth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const result = await runBuild();
    const cnt = result && Array.isArray(result.items) ? result.items.length : (Array.isArray(result) ? result.length : 0);
    logAudit(req, 'feed', null, 'update', `AI-лента обновлена вручную (${cnt})`);
    const { rows } = await db.query(`SELECT fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`);
    res.json({ ok: true, count: cnt, updated_at: rows[0] ? rows[0].fetched_at : null });
  } catch (e) {
    console.error('POST /api/admin/news/aggregate/refresh:', e.message);
    res.status(500).json({ error: 'Не удалось обновить ленту: ' + e.message });
  }
});

// ── Админ: дашборд (сводка) ───────────────────────────────────────────────────
app.get('/api/admin/dashboard', auth, async (req, res) => {
  try {
    const [lt, ln, lw, nt, np, fc, au] = await Promise.all([
      db.query(`SELECT count(*)::int c FROM leads`),
      db.query(`SELECT count(*)::int c FROM leads WHERE status='new'`),
      db.query(`SELECT count(*)::int c FROM leads WHERE status='in_progress'`),
      db.query(`SELECT count(*)::int c FROM news`),
      db.query(`SELECT count(*)::int c FROM news WHERE published=true`),
      db.query(`SELECT content, fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`),
      db.query(`SELECT actor, actor_role, entity, entity_id, action, summary, created_at FROM audit_log ORDER BY id DESC LIMIT 8`),
    ]);

    // Доп-агрегации для графиков — не должны ронять весь дашборд при ошибке
    let by_status = [];
    let by_day = [];
    try {
      const bs = await db.query(`SELECT status, count(*)::int AS c FROM leads GROUP BY status`);
      by_status = bs.rows;
    } catch (e) { console.error('dashboard by_status:', e.message); }
    try {
      const bd = await db.query(`
        SELECT to_char(gs.d, 'YYYY-MM-DD') AS day,
               count(l.id)::int AS leads
        FROM generate_series(
               (current_date - 13)::timestamp,
               current_date::timestamp,
               interval '1 day'
             ) AS gs(d)
        LEFT JOIN leads l
          ON l.created_at >= gs.d
         AND l.created_at <  gs.d + interval '1 day'
        GROUP BY gs.d
        ORDER BY gs.d
      `);
      by_day = bd.rows;
    } catch (e) { console.error('dashboard by_day:', e.message); }

    const feedContent = fc.rows[0] ? fc.rows[0].content : null;
    const feedItems = Array.isArray(feedContent) ? feedContent : (feedContent && Array.isArray(feedContent.items) ? feedContent.items : []);
    res.json({
      leads_total: lt.rows[0].c, leads_new: ln.rows[0].c, leads_progress: lw.rows[0].c,
      news_total: nt.rows[0].c, news_published: np.rows[0].c,
      feed_count: feedItems.length, feed_updated: fc.rows[0] ? fc.rows[0].fetched_at : null,
      recent: au.rows,
      by_status,
      by_day,
    });
  } catch (e) { console.error('GET /api/admin/dashboard:', e.message); res.status(500).json({ error: 'Не удалось загрузить дашборд' }); }
});

// ── Админ: история изменений ──────────────────────────────────────────────────
app.get('/api/admin/audit', auth, async (req, res) => {
  try {
    const params = []; let where = '';
    if (req.query.entity && ['lead', 'news', 'feed'].includes(req.query.entity)) { params.push(req.query.entity); where = `WHERE entity = $1`; }
    const { rows } = await db.query(
      `SELECT actor, actor_role, entity, entity_id, action, summary, created_at FROM audit_log ${where} ORDER BY id DESC LIMIT 200`, params);
    res.json(rows);
  } catch (e) { console.error('GET /api/admin/audit:', e.message); res.status(500).json({ error: 'Не удалось загрузить историю' }); }
});

// Health-check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Неизвестные API-маршруты — честный 404 JSON (а не SPA-страница)
app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));

// ── SPA-fallback: любой не-API маршрут отдаёт index.html (React-роутинг) ──────
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'), (err) => {
    if (err) res.status(404).send('Фронт ещё не собран. Выполните: npm run build');
  });
});

// Глобальный обработчик ошибок — не отдаём стек наружу в проде
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('Необработанная ошибка:', err.stack || err.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: PROD ? 'Внутренняя ошибка сервера' : String(err.message || err) });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`ЦЦР backend слушает на :${PORT} (${PROD ? 'production' : 'development'})`);
  // Прогрев AI-ленты новостей (не чаще раза в сутки)
  setTimeout(() => refreshFeedIfStale(false).catch(() => {}), 3000);
});

// Не валим процесс молча — логируем и корректно завершаем
process.on('unhandledRejection', (reason) => console.error('unhandledRejection:', reason));
process.on('uncaughtException', (err) => { console.error('uncaughtException:', err); });

// Грейсфул-шатдаун: даём активным запросам и пулу БД закрыться (важно для zero-downtime деплоя)
function shutdown(signal) {
  console.log(`${signal} — завершаю работу…`);
  server.close(() => {
    if (db.pool && db.pool.end) db.pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => shutdown(s)));
