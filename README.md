# ЦЦР — сайт (React) + бэкенд + админ-панель

АО «Центр цифрового развития Национального Банка Казахстана».

Лендинг переписан на **React (Vite)** в стиле apple.com: спокойная светлая
эстетика, крупная типографика, мягкие фоны, меняющиеся при прокрутке, 2D-элементы
и **3D-витрина** (стеклянная башня) — больше не заглавный фон, а отдельная секция.
Бэкенд (Express + PostgreSQL на DigitalOcean) сохранён, добавлено управление
новостями в админ-панели.

## Структура

```
.
├── server.js           точка входа: middleware, статика, монтирование роутеров, запуск
├── lib/                инфраструктура бэкенда
│   ├── config.js       env/секреты/пути          ├── ai.js      OpenAI + Gemini (пул ключей)
│   ├── auth.js         JWT, роли, TOTP, аудит    ├── rag.js     ИИ-поиск / RAG-индекс
│   ├── sse.js          realtime (SSE, notify)    ├── feed.js    AI-лента новостей (RSS)
│   ├── uploads.js      безопасные загрузки       ├── health.js  пинги ИТ-систем
│   ├── migrate.js      авто-миграция схемы       └── seeds.js   стартовые/демо-данные
├── routes/             эндпоинты по доменам: auth, leads (CRM), news, services,
│                       vacancies, notifications, analytics, monitoring, adminUsers,
│                       adminOps, assistant (ИИ), portalPeople, portalChats,
│                       portalDocs, portalWork, portalLife
├── db.js               пул pg (SSL для DigitalOcean)
├── init-db.js          применение schema.sql (устаревшее ядро; актуальная схема — lib/migrate.js)
├── .env                тестовые креды БД и админа
├── public/             собранный фронт (генерируется из client/)
└── client/             исходники React-приложения (Vite)
    └── src/
        ├── site/       публичный сайт (лендинг, 3D-фон, ассистент)
        ├── admin/      админ-панель (CRM, CMS, мониторинг, безопасность)
        └── portal/     портал сотрудников (чаты, задачи, календарь, ДиДи)
```

Сайт и админка — одно SPA. `/admin` открывает панель, остальные пути — лендинг.
Сервер отдаёт `public/index.html` на любой не-API маршрут (SPA-fallback).

## Локальная разработка

```bash
npm install                # ставит и серверные, и клиентские зависимости
npm run init-db            # один раз: создаёт таблицы leads и news
npm run dev:server         # бэкенд на :3000
npm run dev:client         # фронт на :5173 (проксирует /api на :3000)
```

Сайт: http://localhost:5173 — Админка: http://localhost:5173/admin
(логин/пароль из `.env`, по умолчанию admin / admin).

## Продакшен (DigitalOcean App Platform)

- **Build command:** `npm install && npm run build`
  (`build` ставит зависимости клиента и собирает Vite в `public/`)
- **Run command:** `npm start`
- **Перед первым запуском** один раз выполните `npm run init-db`, чтобы создать
  таблицы (идемпотентно — существующие не трогает).
- Переменные окружения задаются в панели App Platform (НЕ в `.env`, который не
  коммитится). Обязательно установите `NODE_ENV=production`.

### Обязательные переменные окружения на проде

| Переменная | Назначение |
|---|---|
| `NODE_ENV` | `production` — включает HSTS, secure-cookie, скрытие стектрейсов |
| `JWT_SECRET` | Длинная случайная строка (32+ симв.). Без неё сервер не стартует в проде |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Учётка суперадмина. Смените дефолтный `admin` |
| `CORS_ORIGIN` | Боевой домен фронта (через запятую, если их несколько) |
| `PG*` | Доступ к PostgreSQL (см. `.env.example`) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | ИИ-аналитика заявок |

Сгенерировать секрет:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Перед публикацией обязательно замените плейсхолдер `https://ddc-v2-56jns.ondigitalocean.app`
на реальный домен в файлах: `client/index.html` (canonical, og:url, JSON-LD),
`client/public/robots.txt`, `client/public/sitemap.xml`.

## Безопасность

- **Helmet** — заголовки CSP, HSTS, X-Frame-Options, X-Content-Type-Options; `x-powered-by` скрыт.
- **JWT в httpOnly + secure + sameSite=strict cookie**, срок жизни 8 ч.
- **bcrypt** для паролей пользователей из таблицы `users`.
- **Rate-limit**: вход — 20 запросов / 15 мин, форма заявки — 10 / мин.
- **trust proxy** — корректная работа за reverse-proxy DigitalOcean.
- Параметризованные SQL-запросы (защита от инъекций), серверная валидация и
  обрезка длины всех входных полей; лимит тела запроса 1 МБ.
- Глобальный error-handler не отдаёт стектрейс наружу в проде; graceful shutdown
  по SIGTERM/SIGINT (корректно для zero-downtime деплоя).

## Доступность и SEO

- Skip-link, `aria-current`/`aria-expanded`, видимый фокус, `aria-hidden` на
  декоративных слоях, поддержка `prefers-reduced-motion`.
- favicon, web manifest, robots.txt, sitemap.xml, Open Graph / Twitter / JSON-LD,
  динамические `title`/`description` на каждый раздел.
- ErrorBoundary: сбой UI (в т.ч. падение WebGL-сцены) не роняет сайт в белый экран.

## Production-чеклист

- [ ] `NODE_ENV=production` и стойкий `JWT_SECRET` заданы в окружении
- [ ] `ADMIN_PASSWORD` изменён с дефолтного
- [ ] `CORS_ORIGIN` указывает на боевой домен
- [ ] Плейсхолдер `ddc-v2-56jns.ondigitalocean.app` заменён на реальный домен (3 файла выше)
- [ ] `npm run init-db` выполнен на боевой БД
- [ ] HTTPS включён на уровне App Platform (для secure-cookie и HSTS)

## Новости

Таблица `news` хранит поля на трёх языках (`title_*`, `excerpt_*`, `body_*`),
цвет карточки, дату и флаг публикации. На сайте показываются только
опубликованные; язык карточки выбирается по текущему языку интерфейса (откат
на русский). В админке (вкладка «Новости») их можно создавать, редактировать,
скрывать (черновик) и удалять.

## AI-лента новостей

Агрегатор собирает новости из трёх источников (Profit.kz, Digital Business,
Bluescreen.kz) по RSS/Atom, отсеивает дубли, и Gemini отбирает до 6 самых
релевантных про цифровой Казахстан, финтех и госуслуги — с пересказом своими
словами, чтобы читать прямо на сайте. Кеш обновляется раз в сутки (или вручную
из админки). Источники задаются массивом `FEED_SOURCES` в `server.js`.

## API

Публичные: `POST /api/leads`, `GET /api/news`, `GET /api/news/:id`.
Под авторизацией: `GET /api/leads`, `PATCH /api/leads/:id`, `GET /api/stats`,
`GET|POST /api/admin/news`, `PUT|DELETE /api/admin/news/:id`,
`POST /api/login`, `POST /api/logout`, `GET /api/me`.
