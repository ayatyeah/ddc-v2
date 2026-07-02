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
const expressStaticGzip = require('express-static-gzip');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { buildReportPDF, fontsAvailable } = require('./pdfReport');
const { buildDocPDF } = require('./docPdf');

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
// Загруженные файлы (CV, вложения чата) храним ВНЕ web-root и НЕ отдаём статикой —
// только через контролируемый эндпоинт /api/files/:id (с проверкой прав и заголовками).
const UPLOAD_DIR = path.join(__dirname, 'uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { console.error('mkdir uploads:', e.message); }

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
      frameSrc: ["'self'", 'https://yandex.ru', 'https://yandex.kz'],
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
app.use(express.json({ limit: '10mb' }));  // под base64 фото новостей и вложения (файл ≤6 МБ → ~8 МБ base64 + запас)
app.use(cookieParser());

// ── Безопасная загрузка файлов (base64 в JSON, без сторонних зависимостей) ──────
// Защита: белый список расширений по типу, лимит размера, проверка СИГНАТУРЫ (magic bytes),
// случайное имя, хранение вне web-root, отдача только через /api/files с nosniff.
const FILE_RULES = {
  cv:   { exts: ['pdf', 'doc', 'docx'], max: 5 * 1024 * 1024 },
  chat: { exts: ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt'], max: 6 * 1024 * 1024 },
};
const MIME = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain',
};
// Сигнатура файла должна соответствовать расширению (иначе .exe под видом .pdf и т.п.)
function signatureOk(ext, b) {
  switch (ext) {
    case 'pdf': return b.slice(0, 5).toString('latin1') === '%PDF-';
    case 'png': return b.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
    case 'jpg': case 'jpeg': return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
    case 'gif': return b.slice(0, 4).toString('latin1') === 'GIF8';
    case 'webp': return b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP';
    case 'docx': return b[0] === 0x50 && b[1] === 0x4B && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07); // zip (OOXML)
    case 'doc': return b.slice(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';                                // OLE2
    case 'txt': return !b.slice(0, 8192).includes(0);                                                        // без нулевых байт
    default: return false;
  }
}
function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }

// Принимает { name, data(base64|dataURL) }, валидирует, сохраняет, пишет строку в files.
async function saveUpload(file, kind, uploaderId) {
  const rule = FILE_RULES[kind];
  if (!rule) throw httpErr(400, 'Неизвестный тип загрузки');
  if (!file || typeof file.data !== 'string' || !file.name) throw httpErr(400, 'Файл не передан');
  const orig = String(file.name).slice(0, 200);
  const ext = (orig.split('.').pop() || '').toLowerCase();
  if (!rule.exts.includes(ext)) throw httpErr(400, `Недопустимый тип файла (.${ext}). Разрешено: ${rule.exts.join(', ')}`);
  const b64 = file.data.includes(',') ? file.data.slice(file.data.indexOf(',') + 1) : file.data;
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch { throw httpErr(400, 'Повреждённые данные файла'); }
  if (!buf.length) throw httpErr(400, 'Пустой файл');
  if (buf.length > rule.max) throw httpErr(400, `Файл больше ${Math.round(rule.max / 1024 / 1024)} МБ`);
  if (!signatureOk(ext, buf)) throw httpErr(400, 'Содержимое файла не соответствует расширению (возможно, файл повреждён или подменён)');
  const stored = crypto.randomBytes(16).toString('hex') + '.' + ext + '.bin';   // .bin — не исполняется/не отдаётся статикой
  await fs.promises.writeFile(path.join(UPLOAD_DIR, stored), buf, { mode: 0o600 });
  const { rows } = await db.query(
    `INSERT INTO files (stored, orig, mime, size, kind, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, orig, mime, size`,
    [stored, orig, MIME[ext] || 'application/octet-stream', buf.length, kind, uploaderId || null]);
  return rows[0];
}

// Извлечение текста из CV (PDF/DOCX) — чтобы ИИ анализировал само резюме, а не только письмо.
// Библиотеки грузим лениво (только при анализе). Возвращаем обрезанный текст или '' при ошибке.
async function extractCvFileText(fileRow) {
  if (!fileRow) return '';
  const ext = (String(fileRow.orig || '').split('.').pop() || '').toLowerCase();
  const p = path.join(UPLOAD_DIR, fileRow.stored);
  try {
    if (!fs.existsSync(p)) return '';
    if (ext === 'pdf') {
      const pdf = require('pdf-parse');
      const data = await pdf(await fs.promises.readFile(p));
      return (data.text || '').replace(/\s+\n/g, '\n').trim().slice(0, 7000);
    }
    if (ext === 'docx') {
      const mammoth = require('mammoth');
      const r = await mammoth.extractRawText({ path: p });
      return (r.value || '').trim().slice(0, 7000);
    }
  } catch (e) { console.error('extractCvFileText:', e.message); }
  return '';   // .doc и прочее — не распознаём
}

// Раздаём собранный фронт как статику. express-static-gzip отдаёт предсжатые .br/.gz
// (их генерит vite-plugin-compression при сборке), если клиент их поддерживает —
// меньше трафик. Падение на обычный файл, если предсжатого нет.
app.use(expressStaticGzip(STATIC_DIR, {
  enableBrotli: true,
  orderPreference: ['br', 'gz'],
  serveStatic: {
    maxAge: PROD ? '1y' : 0,
    setHeaders: (res, filePath) => {
      // HTML и сервис-воркер (sw.js/registerSW.js) НЕ кешируем надолго — иначе PWA
      // не получит обновление после деплоя. Остальные ассеты хешированы → можно 1 год.
      if (/\.html$/.test(filePath) || /[\\/](sw|registerSW)\.js$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  },
}));

// Динамические данные не должны кешироваться ни браузером, ни CDN/прокси
// (иначе на сайте показывается устаревшая лента/новости, хотя сервер отдаёт свежие).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store'); // для CDN App Platform
  next();
});

// Ограничение частоты на чувствительные маршруты
const limiterOpts = { standardHeaders: true, legacyHeaders: false };
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, ...limiterOpts });
const formLimiter  = rateLimit({ windowMs: 60 * 1000, max: 10, ...limiterOpts });
const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, ...limiterOpts });   // веб-аналитика: часто, но с потолком

// ── Авторизация ───────────────────────────────────────────────────────────────
// Присутствие «онлайн»: обновляем users.last_seen не чаще раза в 45с на пользователя
// (лёгкий апдейт), чтобы Mission Control видел, кто сейчас в системе.
const _presence = new Map();
function touchPresence(id) {
  if (!id) return;
  const now = Date.now();
  if (now - (_presence.get(id) || 0) < 45000) return;
  _presence.set(id, now);
  db.query(`UPDATE users SET last_seen = now() WHERE id = $1`, [id]).catch(() => {});
}

function auth(req, res, next) {
  const token = req.cookies && req.cookies.ddc_token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    req.admin = jwt.verify(token, SECRET);
    touchPresence(req.admin.id);
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

// Создать in-app уведомление пользователю (доставляется поллингом с фронта).
// userId может быть null (напр. суперадмин без записи в users) — тогда тихо пропускаем.
async function notify(userId, type, leadId, title, body) {
  if (!userId) return;
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, lead_id, title, body) VALUES ($1,$2,$3,$4,$5)`,
      [userId, type, leadId == null ? null : Number(leadId), (title || '').slice(0, 200), (body || '').slice(0, 500)]
    );
  } catch (e) { console.error('notify:', e.message); }
}

// Полная строка лида (с исполнителем, скором и флагом оценочного листа) — чтобы
// после PATCH/назначения фронт получал тот же набор полей, что и в списке.
async function fetchLeadRow(id) {
  const { rows } = await db.query(
    `SELECT l.id, l.full_name, l.email, l.phone, l.subject, l.message, l.status,
            l.admin_comment, l.rating, l.assignee_id, l.assigned_by, l.assigned_at,
            u.username AS assignee_username, u.full_name AS assignee_name,
            (e.lead_id IS NOT NULL) AS has_evaluation,
            l.created_at, l.updated_at
     FROM leads l
     LEFT JOIN users u ON u.id = l.assignee_id
     LEFT JOIN evaluations e ON e.lead_id = l.id
     WHERE l.id = $1`, [id]);
  return rows[0] || null;
}

app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  // id — идентификатор записи в users (нужен для привязки лидов к сотруднику).
  // У суперадмина из .env записи в users нет → id = null.
  const issue = (u, role, id = null) => {
    const token = jwt.sign({ u, role, id }, SECRET, { expiresIn: '8h' });
    res.cookie('ddc_token', token, { ...COOKIE_OPTS, maxAge: 8 * 60 * 60 * 1000 });
    return res.json({ ok: true, username: u, role, id });
  };

  // 1) Суперадмин из .env
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return issue(username, 'admin');
  }
  // 2) Пользователь из таблицы users (bcrypt)
  try {
    const { rows } = await db.query(
      `SELECT id, username, password_hash, role, active FROM users WHERE username = $1`,
      [String(username || '').trim()]
    );
    if (rows.length) {
      if (!rows[0].active) return res.status(403).json({ error: 'Учётная запись отключена' });
      const ok = await bcrypt.compare(String(password || ''), rows[0].password_hash);
      if (ok) return issue(rows[0].username, rows[0].role, rows[0].id);
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
  res.json({ username: req.admin.u, role: req.admin.role, id: req.admin.id ?? null });
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

// ── Публичные вакансии (для страницы «Карьера») ───────────────────────────────
app.get('/api/vacancies', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, department, location, employment, description, created_at
         FROM vacancies WHERE published = TRUE ORDER BY sort_order, id DESC LIMIT 100`);
    res.json(rows);
  } catch (e) { console.error('GET /api/vacancies:', e.message); res.status(500).json({ error: 'Ошибка чтения вакансий' }); }
});

// ── Веб-аналитика: приём просмотра страницы (устройство — по User-Agent) ───────
function deviceFromUA(ua) {
  ua = ua || '';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}
app.post('/api/track', trackLimiter, async (req, res) => {
  try {
    const p = clip(req.body?.path, 300) || '/';
    if (p.startsWith('/admin') || p.startsWith('/portal')) return res.status(204).end();   // считаем только публичный сайт
    await db.query(
      `INSERT INTO pageviews (path, ref, device, lang) VALUES ($1,$2,$3,$4)`,
      [p, clip(req.body?.ref, 300), deviceFromUA(req.get('user-agent')), clip(req.body?.lang, 8)]);
    res.status(204).end();
  } catch { res.status(204).end(); }   // аналитика никогда не должна ломать UX
});

// ── Публичные новости (только опубликованные) ─────────────────────────────────
const NEWS_COLS = `id, title_ru, title_kk, title_en, excerpt_ru, excerpt_kk, excerpt_en,
                   body_ru, body_kk, body_en, color, image, image_fit, image_pos, news_date, published,
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
              l.admin_comment, l.rating, l.assignee_id, l.assigned_by, l.assigned_at,
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
app.get('/api/stats', auth, async (req, res) => {
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
app.patch('/api/leads/:id', auth, requireRole('admin', 'editor', 'manager', 'staff'), async (req, res) => {
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
      `UPDATE leads SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Клиент не найден' });
    const ch = [];
    if (status !== undefined) ch.push(`статус → ${status}`);
    if (rating !== undefined) ch.push(`оценка → ${rating}`);
    if (admin_comment !== undefined) ch.push('комментарий изменён');
    logAudit(req, 'lead', id, status !== undefined ? 'status' : 'update', `Заявка #${id}: ${ch.join(', ')}`);
    res.json(await fetchLeadRow(id));
  } catch (e) {
    console.error('PATCH /api/leads:', e.message);
    res.status(500).json({ error: 'Не удалось обновить' });
  }
});

// ── Начальник/админ: назначить исполнителя на лид (один исполнитель) ──────────
app.patch('/api/leads/:id/assign', auth, requireRole('admin', 'manager'), async (req, res) => {
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
app.delete('/api/leads/:id', auth, requireRole('admin', 'editor', 'manager'), async (req, res) => {
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

// ── Уведомления (in-app, доставка поллингом с фронта) ─────────────────────────
app.get('/api/notifications', auth, async (req, res) => {
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

app.post('/api/notifications/read', auth, async (req, res) => {
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

app.get('/api/leads/:id/evaluation', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    if (!(await leadOwnedOrManager(req, id))) return res.status(403).json({ error: 'Это не ваш лид' });
    const { rows } = await db.query(`SELECT * FROM evaluations WHERE lead_id = $1`, [id]);
    const prior_orders = await priorOrdersCount(id);
    res.json({ ...(rows[0] || {}), prior_orders });   // всегда отдаём prior_orders (даже без листа)
  } catch (e) { console.error('GET evaluation:', e.message); res.status(500).json({ error: 'Ошибка чтения' }); }
});

app.post('/api/leads/:id/evaluation', auth, requireRole('admin', 'manager', 'staff'), async (req, res) => {
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

app.get('/api/leads/:id/report.pdf', auth, async (req, res) => {
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
  // подгонка фото под карточку: fit (cover|contain) + фокус кадрирования (object-position)
  let image_fit = s(body.image_fit, 10).trim().toLowerCase();
  if (image_fit !== 'contain') image_fit = 'cover';
  let image_pos = s(body.image_pos, 24).trim();
  if (!/^\d{1,3}% \d{1,3}%$/.test(image_pos)) image_pos = '50% 50%';
  return {
    title_ru: s(body.title_ru, 300), title_kk: s(body.title_kk, 300), title_en: s(body.title_en, 300),
    excerpt_ru: s(body.excerpt_ru, 600), excerpt_kk: s(body.excerpt_kk, 600), excerpt_en: s(body.excerpt_en, 600),
    body_ru: s(body.body_ru, 8000), body_kk: s(body.body_kk, 8000), body_en: s(body.body_en, 8000),
    color, image, image_fit, image_pos, news_date: date,
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
         body_ru,body_kk,body_en,color,image,image_fit,image_pos,news_date,published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING ${NEWS_COLS}`,
      [n.title_ru,n.title_kk,n.title_en,n.excerpt_ru,n.excerpt_kk,n.excerpt_en,
       n.body_ru,n.body_kk,n.body_en,n.color,n.image,n.image_fit,n.image_pos,n.news_date,n.published]
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
        color=$10,image=$11,image_fit=$12,image_pos=$13,news_date=$14,published=$15
       WHERE id=$16
       RETURNING ${NEWS_COLS}`,
      [n.title_ru,n.title_kk,n.title_en,n.excerpt_ru,n.excerpt_kk,n.excerpt_en,
       n.body_ru,n.body_kk,n.body_en,n.color,n.image,n.image_fit,n.image_pos,n.news_date,n.published, id]
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

// ── Услуги (CRUD) — управляются из админки, показываются на сайте ──────────────
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
app.get('/api/services', async (req, res) => {
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

app.get('/api/admin/services', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT ${SERVICE_COLS} FROM services ORDER BY sort_order ASC, id ASC LIMIT 200`);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/admin/services:', e.message);
    res.status(500).json({ error: 'Ошибка чтения услуг' });
  }
});

app.post('/api/admin/services', auth, requireRole('admin', 'editor'), async (req, res) => {
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

app.put('/api/admin/services/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
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

app.delete('/api/admin/services/:id', auth, requireRole('admin', 'editor'), async (req, res) => {
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

// ══════════════════════════════════════════════════════════════════════════════
// Портал сотрудников: командный чат, личные сообщения, задачи, отделы.
// Доступ по общей авторизации (auth). Отдельно от админки — это рабочее
// пространство для сотрудников (соц-сеть-стиль).
// ══════════════════════════════════════════════════════════════════════════════
const DEPARTMENTS = [
  { name: 'Разработка ИС', desc: 'Проектирование и сопровождение информационных систем.' },
  { name: 'Информационная безопасность', desc: 'Защита данных и ИТ-систем, соответствие требованиям регулятора.' },
  { name: 'ИТ-инфраструктура', desc: 'Серверы, облака, хранение данных, сети.' },
  { name: 'Аналитика и данные', desc: 'Дашборды, регуляторная отчётность, большие данные.' },
  { name: 'Поддержка 1477', desc: 'Единый контакт-центр для граждан и бизнеса.' },
  { name: 'Проектный офис', desc: 'Управление проектами и координация команд.' },
];
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// Список сотрудников портала (для выбора адресата ЛС и назначения задач)
app.get('/api/portal/users', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, full_name, department, role FROM users WHERE active = TRUE ORDER BY full_name NULLS LAST, username`);
    res.json(rows.map((u) => ({ id: u.id, name: u.full_name || u.username, department: u.department || '', role: u.role })));
  } catch (e) { console.error('GET /api/portal/users:', e.message); res.status(500).json({ error: 'Ошибка чтения сотрудников' }); }
});

// Отделы DDC + их участники (список отделов — из таблицы departments)
app.get('/api/portal/departments', auth, async (req, res) => {
  try {
    const { rows: depts } = await db.query(`SELECT name, descr FROM departments ORDER BY sort_order, id`);
    const { rows: users } = await db.query(`SELECT full_name, username, department, role FROM users WHERE active = TRUE`);
    const departments = depts.map((d) => ({
      name: d.name, desc: d.descr,
      members: users.filter((u) => (u.department || '') === d.name).map((u) => ({ name: u.full_name || u.username, role: u.role })),
    }));
    res.json({ departments, total: users.length });
  } catch (e) { console.error('GET /api/portal/departments:', e.message); res.status(500).json({ error: 'Ошибка чтения отделов' }); }
});

// Поля сообщения, отдаваемые клиенту (тело удалённых — пустое)
const MSG_COLS = `id, author_id, author_name, recipient_id, chat_id,
  CASE WHEN deleted THEN '' ELSE body END AS body, created_at, edited_at, deleted, file_id`;
// Чтение сообщений с присоединённым вложением (имя/тип/размер файла)
const MSG_READ = `SELECT m.id, m.author_id, m.author_name, m.recipient_id, m.chat_id,
  CASE WHEN m.deleted THEN '' ELSE m.body END AS body, m.created_at, m.edited_at, m.deleted,
  m.file_id, f.orig AS file_name, f.mime AS file_mime, f.size AS file_size
  FROM messages m LEFT JOIN files f ON f.id = m.file_id`;

// ── Командный чат (общий канал: recipient_id IS NULL И chat_id IS NULL) ──
app.get('/api/portal/chat', auth, async (req, res) => {
  try {
    // Полное чтение последних сообщений (не инкремент) — чтобы правки/удаления доходили при поллинге.
    const { rows } = await db.query(
      `${MSG_READ} WHERE m.recipient_id IS NULL AND m.chat_id IS NULL ORDER BY m.id DESC LIMIT 80`);
    res.json(rows.reverse());
  } catch (e) { console.error('GET /api/portal/chat:', e.message); res.status(500).json({ error: 'Ошибка чтения чата' }); }
});
app.post('/api/portal/chat', auth, async (req, res) => {
  const body = clip(req.body?.body, 2000);
  if (!body && !req.body?.file) return res.status(400).json({ error: 'Пустое сообщение' });
  try {
    const saved = req.body?.file ? await saveUpload(req.body.file, 'chat', req.admin.id) : null;
    const { rows } = await db.query(
      `INSERT INTO messages (author_id, author_name, recipient_id, body, file_id) VALUES ($1, $2, NULL, $3, $4)
       RETURNING ${MSG_COLS}`,
      [req.admin.id, req.admin.u, body, saved?.id || null]);
    res.status(201).json({ ...rows[0], file_name: saved?.orig, file_mime: saved?.mime, file_size: saved?.size });
  } catch (e) { console.error('POST /api/portal/chat:', e.message); res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось отправить' }); }
});

// ── Личные сообщения (диалог с конкретным сотрудником) ──
app.get('/api/portal/dm/:userId(\\d+)', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Личные сообщения доступны сотрудникам с учётной записью' });
  const other = Number(req.params.userId);
  try {
    const { rows } = await db.query(
      `${MSG_READ}
        WHERE m.chat_id IS NULL AND ((m.author_id = $1 AND m.recipient_id = $2) OR (m.author_id = $2 AND m.recipient_id = $1))
        ORDER BY m.id ASC LIMIT 300`, [me, other]);
    res.json(rows);
  } catch (e) { console.error('GET /api/portal/dm:', e.message); res.status(500).json({ error: 'Ошибка чтения диалога' }); }
});
app.post('/api/portal/dm', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Личные сообщения доступны сотрудникам с учётной записью' });
  const to = Number(req.body?.to);
  const body = clip(req.body?.body, 2000);
  if (!Number.isInteger(to) || (!body && !req.body?.file)) return res.status(400).json({ error: 'Укажите адресата и текст' });
  try {
    const saved = req.body?.file ? await saveUpload(req.body.file, 'chat', me) : null;
    const { rows } = await db.query(
      `INSERT INTO messages (author_id, author_name, recipient_id, body, file_id) VALUES ($1, $2, $3, $4, $5)
       RETURNING ${MSG_COLS}`,
      [me, req.admin.u, to, body, saved?.id || null]);
    if (to !== me) await notify(to, 'dm', null, 'Личное сообщение', `${req.admin.u}: ${(body || 'файл').slice(0, 80)}`);
    res.status(201).json({ ...rows[0], file_name: saved?.orig, file_mime: saved?.mime, file_size: saved?.size });
  } catch (e) { console.error('POST /api/portal/dm:', e.message); res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось отправить' }); }
});

// ── Групповые чаты команд ──
async function isChatMember(chatId, userId) {
  if (!userId) return false;
  const { rows } = await db.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, userId]);
  return rows.length > 0;
}

// Список моих групповых чатов (где я состою)
app.get('/api/portal/chats', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.json([]);
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.created_by,
              (SELECT count(*)::int FROM chat_members m WHERE m.chat_id = c.id) AS members,
              (SELECT max(id) FROM messages msg WHERE msg.chat_id = c.id) AS last_msg_id
         FROM chats c JOIN chat_members cm ON cm.chat_id = c.id
        WHERE cm.user_id = $1 ORDER BY last_msg_id DESC NULLS LAST, c.id DESC`, [me]);
    res.json(rows);
  } catch (e) { console.error('GET /api/portal/chats:', e.message); res.status(500).json({ error: 'Ошибка чтения чатов' }); }
});

// Создать групповой чат: {name, member_ids:[]}
app.post('/api/portal/chats', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Создавать чаты могут сотрудники с учётной записью' });
  const name = clip(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: 'Укажите название чата' });
  const ids = Array.isArray(req.body?.member_ids) ? req.body.member_ids.map(Number).filter(Number.isInteger) : [];
  try {
    const { rows } = await db.query(`INSERT INTO chats (name, created_by) VALUES ($1, $2) RETURNING id, name, created_by`, [name, me]);
    const chatId = rows[0].id;
    const members = Array.from(new Set([me, ...ids]));                    // создатель всегда участник
    for (const uid of members) {
      await db.query(`INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [chatId, uid]);
      if (uid !== me) await notify(uid, 'chat', null, 'Новый чат', `${req.admin.u} добавил вас в «${name}»`);
    }
    res.status(201).json({ ...rows[0], members: members.length });
  } catch (e) { console.error('POST /api/portal/chats:', e.message); res.status(500).json({ error: 'Не удалось создать чат' }); }
});

// Сообщения группового чата (только участникам)
app.get('/api/portal/chats/:id(\\d+)/messages', auth, async (req, res) => {
  const me = req.admin.id, chatId = Number(req.params.id);
  if (!(await isChatMember(chatId, me))) return res.status(403).json({ error: 'Вы не участник этого чата' });
  try {
    const { rows } = await db.query(
      `${MSG_READ} WHERE m.chat_id = $1 ORDER BY m.id DESC LIMIT 100`, [chatId]);
    res.json(rows.reverse());
  } catch (e) { console.error('GET /api/portal/chats/messages:', e.message); res.status(500).json({ error: 'Ошибка чтения чата' }); }
});
app.post('/api/portal/chats/:id(\\d+)/messages', auth, async (req, res) => {
  const me = req.admin.id, chatId = Number(req.params.id);
  const body = clip(req.body?.body, 2000);
  if (!body && !req.body?.file) return res.status(400).json({ error: 'Пустое сообщение' });
  if (!(await isChatMember(chatId, me))) return res.status(403).json({ error: 'Вы не участник этого чата' });
  try {
    const saved = req.body?.file ? await saveUpload(req.body.file, 'chat', me) : null;
    const { rows } = await db.query(
      `INSERT INTO messages (author_id, author_name, chat_id, body, file_id) VALUES ($1, $2, $3, $4, $5) RETURNING ${MSG_COLS}`,
      [me, req.admin.u, chatId, body, saved?.id || null]);
    // уведомляем остальных участников
    const { rows: mem } = await db.query(`SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id <> $2`, [chatId, me]);
    const { rows: ch } = await db.query(`SELECT name FROM chats WHERE id = $1`, [chatId]);
    for (const m of mem) await notify(m.user_id, 'chat', null, ch[0]?.name || 'Чат', `${req.admin.u}: ${(body || 'файл').slice(0, 80)}`);
    res.status(201).json({ ...rows[0], file_name: saved?.orig, file_mime: saved?.mime, file_size: saved?.size });
  } catch (e) { console.error('POST /api/portal/chats/messages:', e.message); res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось отправить' }); }
});

// ── Скачивание/просмотр загруженного файла (контролируемая отдача) ──
app.get('/api/files/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await db.query(`SELECT * FROM files WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Файл не найден' });
    const f = rows[0];
    // CV откликов — только рекрутерам (admin/manager). Вложения чата — любому авторизованному.
    if (f.kind === 'cv' && !['admin', 'manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Доступ только для рекрутеров' });
    const p = path.join(UPLOAD_DIR, f.stored);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Файл отсутствует на диске' });
    const inline = /^image\//.test(f.mime);                       // картинки показываем, остальное — скачиваем
    const safe = String(f.orig || 'file').replace(/[\r\n"]+/g, '_');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');           // запрет MIME-sniffing
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(safe)}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(p).pipe(res);
  } catch (e) { console.error('GET /api/files:', e.message); res.status(500).json({ error: 'Ошибка чтения файла' }); }
});

// ── Отклики на вакансии (карьера): список + ИИ-анализ кандидатов ──────────────
app.get('/api/admin/careers', auth, requireRole('admin', 'manager'), async (req, res) => {
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

// ИИ-анализ конкретного кандидата (Gemini): скор пригодности + сильные/слабые стороны + рекомендация
app.post('/api/admin/careers/:id(\\d+)/analyze', auth, requireRole('admin', 'manager'), async (req, res) => {
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
    const text = await callGemini(prompt, 1024);
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
app.get('/api/admin/vacancies', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, department, location, employment, description, published, sort_order, created_at
         FROM vacancies ORDER BY sort_order, id DESC`);
    res.json(rows);
  } catch (e) { console.error('GET /api/admin/vacancies:', e.message); res.status(500).json({ error: 'Ошибка чтения' }); }
});
app.post('/api/admin/vacancies', auth, requireRole('admin', 'manager'), async (req, res) => {
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
app.patch('/api/admin/vacancies/:id(\\d+)', auth, requireRole('admin', 'manager'), async (req, res) => {
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
app.delete('/api/admin/vacancies/:id(\\d+)', auth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { rowCount } = await db.query(`DELETE FROM vacancies WHERE id = $1`, [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: 'Вакансия не найдена' });
    logAudit(req, 'vacancy', Number(req.params.id), 'delete', 'Удалена вакансия');
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/admin/vacancies:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

// ── Админ: сводка веб-аналитики сайта ─────────────────────────────────────────
app.get('/api/admin/analytics/site', auth, requireRole('admin', 'manager'), async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));
  try {
    const [total, byDay, topPages, byDevice, byLang] = await Promise.all([
      db.query(`SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS today,
                       count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week FROM pageviews`),
      db.query(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, count(*)::int AS c
                  FROM pageviews WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 1`, [days]),
      db.query(`SELECT path, count(*)::int AS c FROM pageviews GROUP BY path ORDER BY c DESC LIMIT 12`),
      db.query(`SELECT device, count(*)::int AS c FROM pageviews GROUP BY device ORDER BY c DESC`),
      db.query(`SELECT lang, count(*)::int AS c FROM pageviews WHERE lang <> '' GROUP BY lang ORDER BY c DESC LIMIT 6`),
    ]);
    res.json({ total: total.rows[0], byDay: byDay.rows, topPages: topPages.rows, byDevice: byDevice.rows, byLang: byLang.rows, days });
  } catch (e) { console.error('GET /api/admin/analytics/site:', e.message); res.status(500).json({ error: 'Ошибка аналитики' }); }
});

// ── Правка / удаление своего сообщения (мессенджер-фичи) ──
app.patch('/api/portal/messages/:id(\\d+)', auth, async (req, res) => {
  const me = req.admin.id, id = Number(req.params.id);
  const body = clip(req.body?.body, 2000);
  if (!body) return res.status(400).json({ error: 'Пустой текст' });
  try {
    const { rows } = await db.query(
      `UPDATE messages SET body = $1, edited_at = now() WHERE id = $2 AND author_id = $3 AND deleted = FALSE
       RETURNING ${MSG_COLS}`, [body, id, me]);
    if (!rows.length) return res.status(404).json({ error: 'Сообщение не найдено или нет прав' });
    res.json(rows[0]);
  } catch (e) { console.error('PATCH /api/portal/messages:', e.message); res.status(500).json({ error: 'Не удалось изменить' }); }
});
app.delete('/api/portal/messages/:id(\\d+)', auth, async (req, res) => {
  const me = req.admin.id, id = Number(req.params.id);
  try {
    const { rows } = await db.query(
      `UPDATE messages SET deleted = TRUE, body = '' WHERE id = $1 AND author_id = $2 RETURNING ${MSG_COLS}`, [id, me]);
    if (!rows.length) return res.status(404).json({ error: 'Сообщение не найдено или нет прав' });
    res.json(rows[0]);
  } catch (e) { console.error('DELETE /api/portal/messages:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

// ── Mission Control: сводная телеметрия портала ───────────────────────────────
app.get('/api/portal/mission', auth, async (req, res) => {
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

// ── Документы портала: ИИ-генерация + PDF-превью ──────────────────────────────
const DOC_TYPES = {
  memo: 'служебная записка', statement: 'заявление', order: 'приказ',
  letter: 'официальное деловое письмо', explanatory: 'объяснительная записка', request: 'служебный запрос',
};

app.post('/api/portal/docs/generate', auth, async (req, res) => {
  const type = DOC_TYPES[req.body?.type] ? req.body.type : 'memo';
  const to = clip(req.body?.to, 200), subject = clip(req.body?.subject, 300), details = clip(req.body?.details, 3000);
  if (!subject && !details) return res.status(400).json({ error: 'Укажите тему или суть документа' });
  try {
    const prompt = `Ты — помощник делопроизводителя ЦЦР (Центр цифрового развития Нацбанка Казахстана).
Составь официальный документ на русском языке в деловом стиле. Тип: ${DOC_TYPES[type]}.
Верни СТРОГО валидный JSON без пояснений:
{"title": "<краткий заголовок документа>", "body": "<готовый текст: обращение, основной текст, при необходимости пункты; в конце строки [дата] и [подпись]>"}
Данные:
- От кого: ${req.admin.u}
- Кому (адресат): ${to || '—'}
- Тема: ${subject || '—'}
- Суть / что изложить: ${details || subject}`;
    const text = await callGemini(prompt, 1500);
    const j = parseJsonLoose(text) || {};
    const cap = DOC_TYPES[type].charAt(0).toUpperCase() + DOC_TYPES[type].slice(1);
    res.json({ title: clip(j.title, 200) || cap, body: String(j.body || '').slice(0, 12000) });
  } catch (e) { console.error('POST /api/portal/docs/generate:', e.message); res.status(500).json({ error: 'ИИ недоступен: ' + (e.message || 'ошибка') }); }
});

app.get('/api/portal/docs', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id, title, doc_type, author_id, author_name, created_at FROM documents ORDER BY id DESC LIMIT 300`);
    res.json(rows);
  } catch (e) { console.error('GET /api/portal/docs:', e.message); res.status(500).json({ error: 'Ошибка чтения документов' }); }
});

app.post('/api/portal/docs', auth, async (req, res) => {
  const title = clip(req.body?.title, 200) || 'Документ';
  const body = String(req.body?.body || '').slice(0, 20000);
  const doc_type = clip(req.body?.doc_type, 40);
  if (!body.trim()) return res.status(400).json({ error: 'Пустой документ' });
  try {
    const { rows } = await db.query(
      `INSERT INTO documents (title, doc_type, body, author_id, author_name) VALUES ($1,$2,$3,$4,$5)
       RETURNING id, title, doc_type, author_id, author_name, created_at`,
      [title, doc_type, body, req.admin.id, req.admin.u]);
    res.status(201).json(rows[0]);
  } catch (e) { console.error('POST /api/portal/docs:', e.message); res.status(500).json({ error: 'Не удалось сохранить' }); }
});

// PDF документа: inline для превью в iframe, ?download=1 — на скачивание
app.get('/api/portal/docs/:id(\\d+)/pdf', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM documents WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Документ не найден' });
    if (!fontsAvailable()) return res.status(500).json({ error: 'Шрифты для PDF не найдены (assets/fonts)' });
    const d = rows[0];
    const pdf = await buildDocPDF({ title: d.title, body: d.body, author: d.author_name, date: new Date(d.created_at).toLocaleDateString('ru-RU') });
    const dl = req.query.download === '1';
    const safe = String(d.title || 'Документ').replace(/[\r\n"]+/g, '_').slice(0, 80);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${dl ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(safe)}.pdf`);
    res.send(pdf);
  } catch (e) { console.error('GET /api/portal/docs/pdf:', e.message); res.status(500).json({ error: 'Не удалось сформировать PDF' }); }
});

app.delete('/api/portal/docs/:id(\\d+)', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT author_id FROM documents WHERE id = $1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
    const canDel = rows[0].author_id === req.admin.id || ['admin', 'manager'].includes(req.admin.role);
    if (!canDel) return res.status(403).json({ error: 'Удалять можно только свои документы' });
    await db.query(`DELETE FROM documents WHERE id = $1`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /api/portal/docs:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

// ── Рабочие задачи ──
app.get('/api/portal/tasks', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, body, assignee_id, assignee_name, created_by, status, created_at
         FROM tasks WHERE assignee_id = $1 OR created_by = $2
        ORDER BY (status = 'done'), id DESC LIMIT 200`,
      [req.admin.id, req.admin.u]);
    res.json(rows);
  } catch (e) { console.error('GET /api/portal/tasks:', e.message); res.status(500).json({ error: 'Ошибка чтения задач' }); }
});
app.post('/api/portal/tasks', auth, async (req, res) => {
  const title = clip(req.body?.title, 200);
  const body = clip(req.body?.body, 2000);
  if (!title) return res.status(400).json({ error: 'Укажите название задачи' });
  const aid = Number(req.body?.assignee_id);
  try {
    let assignee_id = null, assignee_name = '';
    if (Number.isInteger(aid)) {
      const u = await db.query(`SELECT id, username, full_name FROM users WHERE id = $1 AND active = TRUE`, [aid]);
      if (u.rows.length) { assignee_id = u.rows[0].id; assignee_name = u.rows[0].full_name || u.rows[0].username; }
    }
    const { rows } = await db.query(
      `INSERT INTO tasks (title, body, assignee_id, assignee_name, created_by) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, body, assignee_id, assignee_name, created_by, status, created_at`,
      [title, body, assignee_id, assignee_name, req.admin.u]);
    if (assignee_id && assignee_id !== req.admin.id) await notify(assignee_id, 'task', null, 'Новая задача', title);
    res.status(201).json(rows[0]);
  } catch (e) { console.error('POST /api/portal/tasks:', e.message); res.status(500).json({ error: 'Не удалось создать задачу' }); }
});
app.patch('/api/portal/tasks/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status === 'done' ? 'done' : 'open';
  try {
    const { rows } = await db.query(
      `UPDATE tasks SET status = $1, updated_at = now()
        WHERE id = $2 AND (assignee_id = $3 OR created_by = $4)
       RETURNING id, title, body, assignee_id, assignee_name, created_by, status, created_at`,
      [status, id, req.admin.id, req.admin.u]);
    if (!rows.length) return res.status(404).json({ error: 'Задача не найдена или нет прав' });
    res.json(rows[0]);
  } catch (e) { console.error('PATCH /api/portal/tasks:', e.message); res.status(500).json({ error: 'Не удалось обновить' }); }
});

// ── Админ: пользователи (только роль admin) ───────────────────────────────────
const ALLOWED_ROLES = ['admin', 'manager', 'staff', 'editor', 'viewer'];

app.get('/api/admin/users', auth, requireRole('admin'), async (req, res) => {
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
app.get('/api/admin/staff', auth, requireRole('admin', 'manager'), async (req, res) => {
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

app.post('/api/admin/users', auth, requireRole('admin'), async (req, res) => {
  const username = String(req.body?.username || '').trim().slice(0, 60);
  const password = String(req.body?.password || '');
  const full_name = String(req.body?.full_name || '').trim().slice(0, 120);
  const department = String(req.body?.department || '').trim().slice(0, 120);
  const role = ALLOWED_ROLES.includes(req.body?.role) ? req.body.role : 'staff';
  if (!username || password.length < 4) {
    return res.status(400).json({ error: 'Логин и пароль (от 4 символов) обязательны' });
  }
  if (username === ADMIN_USERNAME) {
    return res.status(400).json({ error: 'Это имя занято суперадмином' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, full_name, department, role)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, username, full_name, department, role, active, created_at`,
      [username, hash, full_name, department, role]
    );
    logAudit(req, 'user', rows[0].id, 'create', `Создан пользователь ${username} (${role})`);
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

// Обновление пользователя: отдел / роль / ФИО (для «раскидать по отделам»)
app.patch('/api/admin/users/:id(\\d+)', auth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const set = [], vals = [];
  if ('department' in (req.body || {})) { set.push(`department = $${set.length + 1}`); vals.push(clip(req.body.department, 120)); }
  if ('full_name' in (req.body || {})) { set.push(`full_name = $${set.length + 1}`); vals.push(clip(req.body.full_name, 120)); }
  if ('role' in (req.body || {})) {
    const role = ALLOWED_ROLES.includes(req.body.role) ? req.body.role : null;
    if (!role) return res.status(400).json({ error: 'Недопустимая роль' });
    set.push(`role = $${set.length + 1}`); vals.push(role);
  }
  if (!set.length) return res.status(400).json({ error: 'Нечего обновлять' });
  vals.push(id);
  try {
    const { rows } = await db.query(
      `UPDATE users SET ${set.join(', ')} WHERE id = $${vals.length}
       RETURNING id, username, full_name, department, role, active, created_at`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    logAudit(req, 'user', id, 'update', `Обновлён пользователь ${rows[0].username}`);
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /api/admin/users:', e.message);
    res.status(500).json({ error: 'Не удалось обновить' });
  }
});

// ── Админ: отделы (создание/список/удаление) ──────────────────────────────────
app.get('/api/admin/departments', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.name, d.descr, d.sort_order,
              (SELECT count(*)::int FROM users u WHERE u.department = d.name AND u.active = TRUE) AS members
         FROM departments d ORDER BY d.sort_order, d.id`);
    res.json(rows);
  } catch (e) { console.error('GET /api/admin/departments:', e.message); res.status(500).json({ error: 'Ошибка чтения отделов' }); }
});

app.post('/api/admin/departments', auth, requireRole('admin'), async (req, res) => {
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

app.delete('/api/admin/departments/:id(\\d+)', auth, requireRole('admin'), async (req, res) => {
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

// ── ИИ-аналитика клиентов (Gemini) с кэшированием ────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Пул ключей: список через GEMINI_API_KEYS (запятая) + отдельные GEMINI_API_KEY/_2/_3.
// Дубли убираем. Несколько ключей дают ротацию и фейловер при достижении лимита.
const GEMINI_KEYS = [
  ...String(process.env.GEMINI_API_KEYS || '').split(','),
  process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3,
].map((s) => (s || '').trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
console.log(`Gemini: ключей в пуле — ${GEMINI_KEYS.length} (ротация/фейловер при лимитах)`);

let geminiKeyIdx = 0;                       // round-robin указатель (липкий на успешном ключе)
const geminiCooldown = {};                  // idx -> до какого времени ключ пропускаем (после лимита)
const KEY_COOLDOWN_MS = 5 * 60 * 1000;      // после 429/403 ключ отдыхает 5 минут
const geminiInflight = new Map();           // дедуп: одинаковый промпт не уходит в ИИ дважды параллельно

function geminiUrl(key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
}
async function geminiFetch(key, prompt, maxTokens) {
  return fetch(geminiUrl(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 }, // без «размышлений» — экономит токены и не пустеет ответ
      },
    }),
  });
}

async function callGeminiInner(prompt, maxTokens) {
  if (!GEMINI_KEYS.length) throw new Error('Не задан ни один GEMINI_API_KEY в .env');
  // Порядок обхода: с текущего указателя по кругу; ключи на кулдауне пропускаем.
  const order = GEMINI_KEYS.map((_, i) => (geminiKeyIdx + i) % GEMINI_KEYS.length);
  let avail = order.filter((i) => !(geminiCooldown[i] && geminiCooldown[i] > Date.now()));
  if (!avail.length) avail = order;          // все «отдыхают» — всё равно пробуем по кругу
  let lastErr = null;
  for (const idx of avail) {
    try {
      const r = await geminiFetch(GEMINI_KEYS[idx], prompt, maxTokens);
      if (r.status === 429 || r.status === 403) {     // лимит/квота → кулдаун и следующий ключ
        geminiCooldown[idx] = Date.now() + KEY_COOLDOWN_MS;
        lastErr = new Error(`Gemini ${r.status} на ключе #${idx + 1} (лимит) — переключаюсь`);
        console.warn(lastErr.message);
        continue;
      }
      if (!r.ok) { const tx = await r.text(); lastErr = new Error(`Gemini ${r.status}: ${tx.slice(0, 200)}`); continue; }
      const j = await r.json();
      const cand = j?.candidates?.[0];
      const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (!text) { lastErr = new Error('пустой ответ ИИ (' + (cand?.finishReason || 'нет кандидатов') + ')'); continue; }
      geminiKeyIdx = idx;                     // успешный ключ делаем текущим (липкость → меньше переключений)
      return text;
    } catch (e) { lastErr = e; }
  }
  geminiKeyIdx = (geminiKeyIdx + 1) % GEMINI_KEYS.length; // сдвигаем старт на след. раз
  throw lastErr || new Error('Все ключи Gemini недоступны (лимиты/ошибки)');
}

// Обёртка с in-flight дедупом: параллельные одинаковые запросы делят один вызов к ИИ.
function callGemini(prompt, maxTokens = 2048) {
  const key = maxTokens + ' ' + prompt;
  const cached = geminiInflight.get(key);
  if (cached) return cached;
  const p = callGeminiInner(prompt, maxTokens).finally(() => geminiInflight.delete(key));
  geminiInflight.set(key, p);
  return p;
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
app.post('/api/admin/ai/analyze', auth, requireRole('admin', 'editor', 'manager'), async (req, res) => {
  const force = !!(req.body && req.body.force);
  try {
    // ИИ-анализ людей, заполнивших форму: сегменты заявителей и частые темы запросов
    // по ВСЕМ заявкам. DDC ничего не продаёт — воронку/конверсию здесь не считаем.
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
      const empty = { summary: 'Заявок пока нет — анализировать нечего.', segments: [], topics: [], important_clients: [], recommendations: [] };
      await db.query(`INSERT INTO ai_analysis (leads_sig, content) VALUES ($1, $2)`, [sig, JSON.stringify(empty)]);
      return res.json({ analysis: empty, fromCache: false });
    }

    const compact = leads.slice(0, 60).map((l) => ({
      id: l.id, name: l.full_name,
      subject: l.subject, message: (l.message || '').slice(0, 140),
      status: l.status, rating: l.rating, note: (l.admin_comment || '').slice(0, 100),
    }));
    const prompt =
`Ты — аналитик обращений в Центр цифрового развития (ЦЦР/DDC). DDC ничего НЕ продаёт — это центр развития, поэтому НЕ оценивай воронку, конверсию или выручку. Твоя задача — понять ЛЮДЕЙ, которые заполнили форму на сайте: кто они, зачем обращаются и какие темы запросов преобладают.
Проанализируй заявки и верни ТОЛЬКО JSON такого вида:
{"summary":"2-3 предложения: кто обращается и с чем","segments":[{"name":"короткое название сегмента заявителей","count":число_заявок_в_сегменте,"description":"кто это и что им нужно","action":"как с ними работать"}],"topics":[{"topic":"тема/тип запроса","count":число}],"important_clients":[{"id":число,"name":"имя","priority":"high|medium|low","reason":"почему обращение важно или срочно","action":"что конкретно сделать"}],"recommendations":["конкретный следующий шаг для команды"]}
Сегментируй по сути запроса и типу заявителя (например: бизнес, госорганы, частные лица, студенты — по тому, что видно из заявок). До 6 сегментов, до 8 тем, до 6 важных обращений. В action и recommendations — конкретные действия (а не общие слова). Кратко, по-русски. Заявки: ${JSON.stringify(compact)}`;

    let analysis = null, lastErr = null;
    for (let attempt = 0; attempt < 2 && !analysis; attempt++) {
      try {
        const text = await callGemini(prompt);
        analysis = parseJsonLoose(text);
        if (!analysis) lastErr = new Error('не удалось разобрать ответ ИИ');
      } catch (e) { lastErr = e; }
      if (!analysis && attempt < 1) await new Promise((r) => setTimeout(r, 700));
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
// Несколько источников грузятся параллельно; дубли по URL/заголовку отсеиваются,
// затем Gemini отбирает самое релевантное. Поддерживаются RSS (<item>) и Atom (<entry>).
// kzOnly — глобальные источники (TechCrunch/The Verge): берём только материалы про Казахстан.
const KZ_RE = /kazakh|казах|astana|астан|almaty|алмат|nur-?sultan|нур-?султан|kaspi|halyk|kazakhstan/i;
const FEED_SOURCES = [
  { name: 'Profit.kz', url: 'https://profit.kz/rss/' },
  { name: 'Digital Business', url: 'https://digitalbusiness.kz/feed/' },
  { name: 'Bluescreen.kz', url: 'https://bluescreen.kz/feed/' },
  { name: 'Forbes.kz', url: 'https://forbes.kz/rss/' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', kzOnly: true },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', kzOnly: true },
];
const FEED_TTL_MS = 24 * 60 * 60 * 1000;
const FEED_TIMEOUT_MS = 8000;            // не ждём зависший источник дольше 8 с
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
  const str = String(xml);
  // RSS: <item>…</item>; Atom: <entry>…</entry>
  const isAtom = /<entry[\s>]/i.test(str) && !/<item[\s>]/i.test(str);
  const blocks = str.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  for (const b of blocks.slice(0, 12)) {
    const get = (tag) => { const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? stripTags(m[1]) : ''; };
    const title = get('title');
    let link = get('link');
    if (!link) {
      // Atom: <link href="…"/>; RSS без CDATA: <link>…</link>
      const mh = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (mh) link = mh[1].trim();
      else { const m = b.match(/<link[^>]*>([\s\S]*?)<\/link>/i); link = m ? m[1].trim() : ''; }
    }
    const date = get('pubDate') || get('published') || get('updated');
    const desc = (get('description') || get('summary') || get('content')).slice(0, 240);
    // обложка из RSS: enclosure / media:content / media:thumbnail / первый <img> в описании
    let image = '';
    const mMedia = b.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i)
      || b.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i);
    if (mMedia) image = mMedia[1];
    if (!image) { const mImg = b.match(/<img[^>]+src=["']([^"']+)["']/i); if (mImg) image = mImg[1]; }
    if (title) items.push({ title, url: link, date, desc, source, image });
  }
  return items;
}
// Достаём og:image со страницы статьи (запасной вариант, если в RSS обложки нет)
async function fetchOgImage(url) {
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 DDC-NewsBot' }, signal: ctrl.signal });
    clearTimeout(tm);
    if (!r.ok) return '';
    const html = (await r.text()).slice(0, 200000);
    const m = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i)
      || html.match(/<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    return m ? m[1] : '';
  } catch { return ''; }
}
async function fetchRss(src) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
    const r = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0 DDC-NewsBot' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { console.error('RSS', src.name, 'HTTP', r.status, src.url); return []; }
    let items = parseRss(await r.text(), src.name);
    // Глобальные источники — только материалы про Казахстан
    if (src.kzOnly) items = items.filter((it) => KZ_RE.test(`${it.title} ${it.desc || ''}`));
    if (!items.length && !src.kzOnly) console.warn('RSS', src.name, '— 0 новостей (проверьте формат/URL):', src.url);
    return items;
  } catch (e) { console.error('RSS', src.name, e.message, src.url); return []; }
}
async function buildFeed() {
  const perSource = await Promise.all(FEED_SOURCES.map(fetchRss));
  // сводка по источникам — видно в логах, какой фид сколько дал
  console.log('Лента новостей: ' + FEED_SOURCES.map((s, i) => `${s.name}=${perSource[i].length}`).join(', '));
  const raw = perSource.flat();
  // дедупликация по URL и нормализованному заголовку (один сюжет в разных СМИ)
  const seen = new Set();
  const all = [];
  for (const x of raw) {
    const key = (x.url || '').split('?')[0].toLowerCase() || x.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(x);
  }
  if (!all.length) return null;
  let result = null;
  try {
    // экономия токенов: меньше элементов на входе, короткие описания
    const input = all.slice(0, 24).map((x) => ({ title: x.title, source: x.source, url: x.url, date: x.date, desc: (x.desc || '').slice(0, 140) }));
    const prompt =
`Ты — редактор новостей о цифровом Казахстане. Из списка ниже (новости с нескольких источников) отбери до 6 самых релевантных новостей про цифровую жизнь Казахстана, новые технологии, ИТ, финтех и цифровизацию госуслуг. По возможности бери новости из разных источников для разнообразия.
Для КАЖДОЙ новости дай заголовок и краткий пересказ (2-3 предложения, своими словами, не копируя дословно) на ТРЁХ языках: русском (ru), казахском (kk), английском (en). Также дай общий дайджест дня (2-3 предложения) на трёх языках.
Верни ТОЛЬКО JSON-объект вида:
{"digest":{"ru":"…","kk":"…","en":"…"},"items":[{"title":{"ru":"…","kk":"…","en":"…"},"summary":{"ru":"…","kk":"…","en":"…"},"url":"ссылка из данных","source":"источник из данных","date":"дата как есть"}]}
Новости: ${JSON.stringify(input)}`;
    const parsed = parseJsonLoose(await callGemini(prompt, 3500));
    // digest от ИИ — мультиязычный объект {ru,kk,en}; НЕ приводим к строке (иначе "[object Object]").
    if (parsed && Array.isArray(parsed.items)) result = { digest: parsed.digest || '', items: parsed.items };
    else if (Array.isArray(parsed)) result = { digest: '', items: parsed };
  } catch (e) { console.error('feed Gemini:', e.message); }
  if (!result) {
    result = { digest: '', items: all.slice(0, 6).map((x) => ({ title: x.title, summary: x.desc || '', url: x.url, source: x.source, date: x.date, image: x.image || '' })) };
  }
  // Обложки новостей: сначала из RSS (по URL), затем og:image со страницы для оставшихся.
  const imgByUrl = new Map();
  for (const x of all) { const k = (x.url || '').split('?')[0]; if (k && x.image) imgByUrl.set(k, x.image); }
  for (const it of (result.items || [])) {
    if (!it.image) it.image = imgByUrl.get((it.url || '').split('?')[0]) || '';
  }
  const need = (result.items || []).filter((it) => !it.image && it.url).slice(0, 6);
  await Promise.all(need.map(async (it) => { it.image = await fetchOgImage(it.url); }));
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
    if (req.query.entity && ['lead', 'news', 'feed', 'service'].includes(req.query.entity)) { params.push(req.query.entity); where = `WHERE entity = $1`; }
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

// Стартовые услуги (вставляем один раз, если таблица пуста) — из прежнего статичного
// набора сайта, чтобы раздел «Услуги» не был пустым до первого добавления из админки.
async function seedServices() {
  try {
    const { rows } = await db.query(`SELECT count(*)::int AS c FROM services`);
    if (rows[0].c > 0) return;
    const defaults = [
      { icon: 'code', color: '#2f6fe0', name_ru: 'Разработка ИС', name_kk: 'АЖ әзірлеу', name_en: 'IS Development', desc_ru: 'Проектируем и сопровождаем информационные системы для финансовых организаций — от ядра расчётов до клиентских сервисов.', desc_kk: 'Қаржы ұйымдары үшін ақпараттық жүйелерді жобалаймыз және сүйемелдейміз — есеп айырысу ядросынан клиенттік сервистерге дейін.', desc_en: 'We design and maintain information systems for financial institutions — from the settlement core to customer-facing services.' },
      { icon: 'link', color: '#5a3fd6', name_ru: 'Системная интеграция', name_kk: 'Жүйелік интеграция', name_en: 'System Integration', desc_ru: 'Связываем внутренние и государственные системы в единый защищённый контур.', desc_kk: 'Ішкі және мемлекеттік жүйелерді бірыңғай қорғалған контурға біріктіреміз.', desc_en: 'We connect internal and state systems into a single secure perimeter.' },
      { icon: 'cart', color: '#0a8a5a', name_ru: 'Портал закупок', name_kk: 'Сатып алу порталы', name_en: 'Procurement Portal', desc_ru: 'Оператор площадки zakup.nationalbank.kz — прозрачные процедуры для заказчиков и поставщиков.', desc_kk: 'zakup.nationalbank.kz операторы — тапсырыс берушілер мен жеткізушілерге ашық рәсімдер.', desc_en: 'Operator of zakup.nationalbank.kz — transparent procedures for customers and suppliers.' },
      { icon: 'chart', color: '#b07d12', name_ru: 'Аналитика и отчётность', name_kk: 'Талдау және есептілік', name_en: 'Analytics & Reporting', desc_ru: 'Дашборды и регуляторная отчётность — данные превращаем в решения.', desc_kk: 'Дашбордтар мен реттеуші есептілік — деректерді шешімге айналдырамыз.', desc_en: 'Dashboards and regulatory reporting — turning data into decisions.' },
      { icon: 'support', color: '#0a7aa8', name_ru: 'Поддержка 1477', name_kk: '1477 қолдау', name_en: '1477 Support', desc_ru: 'Контакт-центр пользователей по всему Казахстану — бесплатно.', desc_kk: 'Қазақстан бойынша пайдаланушыларға тегін байланыс орталығы.', desc_en: 'A free user contact center across all of Kazakhstan.' },
      { icon: 'shield', color: '#c0455a', name_ru: 'Информационная безопасность', name_kk: 'Ақпараттық қауіпсіздік', name_en: 'Information Security', desc_ru: 'Защита данных и соответствие требованиям регулятора на каждом уровне.', desc_kk: 'Деректерді қорғау және реттеуші талаптарына сәйкестік әр деңгейде.', desc_en: 'Data protection and regulatory compliance at every layer.' },
    ];
    let i = 0;
    for (const d of defaults) {
      await db.query(
        `INSERT INTO services (name_ru,name_kk,name_en,desc_ru,desc_kk,desc_en,icon,color,sort_order,published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)`,
        [d.name_ru, d.name_kk, d.name_en, d.desc_ru, d.desc_kk, d.desc_en, d.icon, d.color, i++]
      );
    }
    console.log(`✓ Услуги: засеяно ${defaults.length} стартовых записей`);
  } catch (e) { console.error('seedServices:', e.message); }
}

// Стартовые отделы DDC (один раз, если таблица пуста) — из прежнего статичного набора.
async function seedDepartments() {
  try {
    const { rows } = await db.query(`SELECT count(*)::int AS c FROM departments`);
    if (rows[0].c > 0) return;
    let i = 0;
    for (const d of DEPARTMENTS) {
      await db.query(
        `INSERT INTO departments (name, descr, sort_order) VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`,
        [d.name, d.desc, i++]);
    }
    console.log(`✓ Отделы: засеяно ${DEPARTMENTS.length} стартовых записей`);
  } catch (e) { console.error('seedDepartments:', e.message); }
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`ЦЦР backend слушает на :${PORT} (${PROD ? 'production' : 'development'})`);
  // Лёгкая идемпотентная авто-миграция — чтобы деплой не требовал ручного `npm run init-db`.
  db.query(
    `ALTER TABLE news ADD COLUMN IF NOT EXISTS image_fit TEXT NOT NULL DEFAULT 'cover';
     ALTER TABLE news ADD COLUMN IF NOT EXISTS image_pos TEXT NOT NULL DEFAULT '50% 50%';
     ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS facts JSONB NOT NULL DEFAULT '{}'::jsonb;
     CREATE TABLE IF NOT EXISTS services (
       id         SERIAL PRIMARY KEY,
       name_ru    TEXT NOT NULL DEFAULT '', name_kk TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
       desc_ru    TEXT NOT NULL DEFAULT '', desc_kk TEXT NOT NULL DEFAULT '', desc_en TEXT NOT NULL DEFAULT '',
       icon       TEXT NOT NULL DEFAULT 'code',
       color      TEXT NOT NULL DEFAULT '#2f6fe0',
       sort_order INTEGER NOT NULL DEFAULT 0,
       published  BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE TABLE IF NOT EXISTS messages (
       id           SERIAL PRIMARY KEY,
       author_id    INTEGER,
       author_name  TEXT NOT NULL DEFAULT '',
       recipient_id INTEGER,                       -- NULL = командный чат, иначе личное сообщение
       body         TEXT NOT NULL,
       created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS idx_messages_recip ON messages (recipient_id, id);
     CREATE TABLE IF NOT EXISTS tasks (
       id            SERIAL PRIMARY KEY,
       title         TEXT NOT NULL,
       body          TEXT NOT NULL DEFAULT '',
       assignee_id   INTEGER,
       assignee_name TEXT NOT NULL DEFAULT '',
       created_by    TEXT NOT NULL DEFAULT '',
       status        TEXT NOT NULL DEFAULT 'open',
       created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE TABLE IF NOT EXISTS departments (
       id         SERIAL PRIMARY KEY,
       name       TEXT NOT NULL UNIQUE,
       descr      TEXT NOT NULL DEFAULT '',
       sort_order INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     -- Групповые чаты команд + мессенджер-фичи (правка/удаление сообщений)
     ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id INTEGER;      -- NULL = общий канал/ЛС, иначе групповой чат
     ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
     ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE;
     CREATE TABLE IF NOT EXISTS chats (
       id         SERIAL PRIMARY KEY,
       name       TEXT NOT NULL,
       created_by INTEGER,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE TABLE IF NOT EXISTS chat_members (
       chat_id INTEGER NOT NULL,
       user_id INTEGER NOT NULL,
       PRIMARY KEY (chat_id, user_id)
     );
     CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, id);
     -- Загруженные файлы (CV откликов, вложения чата)
     CREATE TABLE IF NOT EXISTS files (
       id          SERIAL PRIMARY KEY,
       stored      TEXT NOT NULL UNIQUE,
       orig        TEXT NOT NULL DEFAULT '',
       mime        TEXT NOT NULL DEFAULT 'application/octet-stream',
       size        INTEGER NOT NULL DEFAULT 0,
       kind        TEXT NOT NULL DEFAULT '',
       uploaded_by INTEGER,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;  -- присутствие для Mission Control
     ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_id INTEGER;    -- вложение сообщения
     ALTER TABLE leads ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT '';        -- 'career' = отклик на вакансию
     ALTER TABLE leads ADD COLUMN IF NOT EXISTS cv_file_id INTEGER;    -- прикреплённое CV
     CREATE TABLE IF NOT EXISTS career_ai (
       lead_id    INTEGER PRIMARY KEY,
       fit_score  INTEGER,
       verdict    JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     -- Вакансии для страницы «Карьера» (управляются из админки)
     CREATE TABLE IF NOT EXISTS vacancies (
       id          SERIAL PRIMARY KEY,
       title       TEXT NOT NULL,
       department  TEXT NOT NULL DEFAULT '',
       location    TEXT NOT NULL DEFAULT 'Астана',
       employment  TEXT NOT NULL DEFAULT 'Полная занятость',
       description TEXT NOT NULL DEFAULT '',
       published   BOOLEAN NOT NULL DEFAULT TRUE,
       sort_order  INTEGER NOT NULL DEFAULT 0,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     -- Простая веб-аналитика (просмотры страниц сайта + устройство)
     CREATE TABLE IF NOT EXISTS pageviews (
       id         SERIAL PRIMARY KEY,
       path       TEXT NOT NULL DEFAULT '',
       ref        TEXT NOT NULL DEFAULT '',
       device     TEXT NOT NULL DEFAULT 'desktop',
       lang       TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS idx_pageviews_created ON pageviews (created_at DESC);
     -- Документы портала (ИИ-генерация)
     CREATE TABLE IF NOT EXISTS documents (
       id          SERIAL PRIMARY KEY,
       title       TEXT NOT NULL DEFAULT 'Документ',
       doc_type    TEXT NOT NULL DEFAULT '',
       body        TEXT NOT NULL DEFAULT '',
       author_id   INTEGER,
       author_name TEXT NOT NULL DEFAULT '',
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     -- Заявки сотрудников (отпуск/справка/доступ и т.п.) со статусами согласования
     CREATE TABLE IF NOT EXISTS requests (
       id           SERIAL PRIMARY KEY,
       kind         TEXT NOT NULL DEFAULT '',
       title        TEXT NOT NULL DEFAULT '',
       body         TEXT NOT NULL DEFAULT '',
       status       TEXT NOT NULL DEFAULT 'created',
       author_id    INTEGER,
       author_name  TEXT NOT NULL DEFAULT '',
       reviewer_id  INTEGER,
       decided_by   TEXT NOT NULL DEFAULT '',
       decided_at   TIMESTAMPTZ,
       created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
     );`
  ).then(() => { console.log('✓ Миграции (services/messages/tasks/departments/chats/files) на месте'); return seedServices(); })
   .then(() => seedDepartments())
   .catch((e) => console.error('Авто-миграция:', e.message));
  // Прогрев AI-ленты новостей (не чаще раза в сутки)
  setTimeout(() => refreshFeedIfStale(false).catch(() => {}), 3000);
});

// Порт занят другим процессом → внятное сообщение и чистый выход (без «зависшего» процесса).
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n⛔ Порт ${PORT} уже занят другим процессом — бэкенд не может запуститься.`);
    console.error(`   Освободите порт (например, остановите тот процесс) или запустите на другом:`);
    console.error(`   PowerShell:  $env:PORT=3001; node server.js   → затем откройте http://localhost:3001\n`);
  } else {
    console.error('Ошибка HTTP-сервера:', e.message);
  }
  process.exit(1);
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
