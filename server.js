/**
 * server.js — точка входа бэкенда ЦЦР (DDC NBK): Express + PostgreSQL.
 *
 * Здесь только сборка приложения: middleware безопасности, статика, подключение
 * доменных роутеров и запуск. Логика разложена по модулям:
 *
 *   lib/     — инфраструктура: config (env), util, auth (JWT/роли/TOTP/аудит),
 *              sse (realtime), uploads (файлы), ai (OpenAI+Gemini), rag (ИИ-поиск),
 *              feed (AI-лента новостей), health (пинги систем), migrate, seeds
 *   routes/  — эндпоинты по доменам: auth, leads (CRM), news, services, vacancies,
 *              notifications, analytics, monitoring, adminUsers, adminOps,
 *              assistant (ИИ), portalPeople, portalChats, portalDocs,
 *              portalWork, portalLife
 *
 * Каждый роутер объявляет полные пути (/api/…) — порядок монтирования не критичен,
 * кроме завершающих обработчиков (404 для /api, SPA-fallback, error handler).
 */
const { PROD, PORT, STATIC_DIR } = require('./lib/config');   // требовать первым: загружает .env
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const expressStaticGzip = require('express-static-gzip');
const path = require('path');
const db = require('./db');
const { auth } = require('./lib/auth');
const sse = require('./lib/sse');
const { migrate } = require('./lib/migrate');
const { seedAll } = require('./lib/seeds');
const { reindexAll } = require('./lib/rag');
const { refreshFeedIfStale } = require('./lib/feed');
const { runHealthChecks } = require('./lib/health');

const app = express();

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
// origin: true (reflect-any) + credentials: true — дыра: любой сторонний сайт делает
// credentialed-запросы от имени жертвы. В проде при пустом CORS_ORIGIN запрещаем кросс-оригин
// (origin: false). Same-origin деплой (фронт и API на одном домене) от этого не страдает —
// там CORS-заголовки не нужны вовсе. В dev оставляем permissive для удобства.
app.use(cors({
  origin: origins.length ? origins : (PROD ? false : true),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));  // под base64 фото новостей и вложения (файл ≤6 МБ → ~8 МБ base64 + запас)
app.use(cookieParser());

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
      } else if (/[\\/]assets[\\/]/.test(filePath)) {
        // Хешированные ассеты Vite (имя меняется при изменении) — вечный кеш без ревалидации.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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

// ── Realtime (SSE): живые уведомления/сообщения/присутствие без поллинга ──────
app.get('/api/portal/stream', auth, sse.streamHandler);

// ── Доменные роутеры (каждый объявляет полные пути /api/…) ────────────────────
app.use(require('./routes/auth'));           // вход/2FA/выход/сессия
app.use(require('./routes/leads'));          // заявки: публичный приём + CRM (статусы, оценки, PDF)
app.use(require('./routes/news'));           // новости сайта + AI-лента
app.use(require('./routes/services'));       // услуги: витрина + CMS
app.use(require('./routes/vacancies'));      // карьера: вакансии + отклики + ИИ-скоринг
app.use(require('./routes/notifications'));  // in-app уведомления
app.use(require('./routes/analytics'));      // веб-аналитика: /api/track + сводка
app.use(require('./routes/monitoring'));     // ИТ-системы/инциденты + /api/status + /api/health
app.use(require('./routes/adminUsers'));     // пользователи и отделы (админ)
app.use(require('./routes/adminOps'));       // дашборд, ИИ-аналитика, рассылки, экспорт, безопасность, wiki, аудит
app.use(require('./routes/assistant'));      // ИИ: поиск, RAG «ДиДи», генерация, TTS, голосовые команды
app.use(require('./routes/portalPeople'));   // портал: люди, отделы, профиль, 2FA, Mission Control
app.use(require('./routes/portalChats'));    // портал: чаты, ЛС, группы, файлы
app.use(require('./routes/portalDocs'));     // портал: документы (ИИ-генерация, перевод, PDF)
app.use(require('./routes/portalWork'));     // портал: заявки сотрудников + задачи
app.use(require('./routes/portalLife'));     // портал: опросы, переговорные, календарь, внутренние новости

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

// ── Запуск ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`ЦЦР backend слушает на :${PORT} (${PROD ? 'production' : 'development'})`);
  // Лёгкая идемпотентная авто-миграция + сев стартовых данных — деплой без ручного init-db.
  migrate()
    .then(() => { console.log('✓ Миграции (services/messages/tasks/departments/chats/files) на месте'); return seedAll(); })
    .catch((e) => console.error('Авто-миграция:', e.message));
  // Прогрев AI-ленты новостей (не чаще раза в сутки)
  setTimeout(() => refreshFeedIfStale(false).catch(() => {}), 3000);
  // Построение ИИ-индекса портала (поиск/RAG) + периодическое обновление
  setTimeout(() => reindexAll().then(() => console.log('✓ ИИ-индекс портала построен')).catch(() => {}), 5000);
  setInterval(() => reindexAll().catch(() => {}), 5 * 60 * 1000);
  // Реальный мониторинг доступности систем: первый прогон вскоре после старта, затем каждые 30 сек
  setTimeout(() => runHealthChecks().then(() => console.log('✓ Health-check систем выполнен')).catch(() => {}), 9000);
  setInterval(() => runHealthChecks().catch(() => {}), 30 * 1000);
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
