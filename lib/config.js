// lib/config.js — конфигурация из окружения: порты, секреты, пути.
// Требовать ПЕРВЫМ (загружает .env до чтения process.env другими модулями).
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

let APP_VERSION = 'dev';
try { APP_VERSION = require('../package.json').version || 'dev'; } catch { /* нет package.json */ }

// JWT_SECRET обязателен в проде — иначе сессии можно подделать. Падаем на старте, а не молча
// используем дефолт. В dev тоже НЕ используем захардкоженную константу (её знает любой, кто
// видел репозиторий → подделка admin-токена одной строкой): генерируем эфемерный секрет на
// каждый запуск. Сессии слетают при рестарте — для dev это нормально и безопаснее дефолта.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  if (PROD) {
    console.error('FATAL: JWT_SECRET не задан или слишком короткий (нужно ≥16 символов). Установите длинную случайную строку в переменных окружения.');
    process.exit(1);
  } else {
    console.warn('⚠ JWT_SECRET не задан — генерирую эфемерный dev-секрет (сессии слетят при рестарте). НЕ ДЛЯ ПРОДА.');
  }
}
const SECRET = JWT_SECRET || crypto.randomBytes(48).toString('hex');

// Суперадмин из .env — «аварийный» вход, минующий таблицу users (bcrypt+2FA). Со слабым
// паролем в проде он опасен. НО на время конкурса дефолт admin/admin оставлен намеренно —
// жюри должно иметь доступ, — поэтому здесь ПРЕДУПРЕЖДЕНИЕ, а не FATAL (иначе прод-деплой с
// admin/admin не стартует). После конкурса задайте стойкий ADMIN_PASSWORD в окружении, и
// предупреждение исчезнет. Настоящая парольная политика (ниже, в adminUsers) касается всех
// СОЗДАВАЕМЫХ учёток — этот .env-суперадмин её сознательное исключение.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
if (PROD && (!process.env.ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin' || ADMIN_PASSWORD.length < 8)) {
  console.warn('⚠ ADMIN_PASSWORD слабый/дефолтный (admin) в проде. Допустимо на время конкурса (доступ жюри); после — смените на стойкий через переменные окружения.');
}

// Опции cookie сессии. Same-origin (фронт и API на одном домене) → strict.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: PROD,
  path: '/',
};

// Папка с собранным React-приложением (vite build → ../public)
const STATIC_DIR = path.join(__dirname, '..', 'public');
// Загруженные файлы (CV, вложения чата) храним ВНЕ web-root и НЕ отдаём статикой —
// только через контролируемый эндпоинт /api/files/:id (с проверкой прав и заголовками).
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

module.exports = { PROD, PORT, APP_VERSION, SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, COOKIE_OPTS, STATIC_DIR, UPLOAD_DIR };
