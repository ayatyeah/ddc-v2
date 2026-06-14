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
├── server.js           бэкенд: заявки, авторизация, статистика, НОВОСТИ (CRUD)
├── db.js               пул pg (SSL для DigitalOcean)
├── init-db.js          применение schema.sql
├── schema.sql          таблицы leads + news (+ сиды новостей)
├── .env                тестовые креды БД и админа
├── public/             собранный фронт (генерируется из client/)
└── client/             исходники React-приложения (Vite)
    └── src/
        ├── site/       лендинг (Nav, Hero, Services, Showcase 3D, Stats, About, News, Contact, Footer, Assistant)
        └── admin/      админка (вход, вкладки «Заявки» и «Новости»)
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
  таблицу `news` (таблица `leads` уже существует — `init-db` идемпотентен).
- Переменные окружения берутся из `.env`. Для прода смените `ADMIN_PASSWORD`
  и `JWT_SECRET`, укажите боевой `CORS_ORIGIN`.

## Новости

Таблица `news` хранит поля на трёх языках (`title_*`, `excerpt_*`, `body_*`),
цвет карточки, дату и флаг публикации. На сайте показываются только
опубликованные; язык карточки выбирается по текущему языку интерфейса (откат
на русский). В админке (вкладка «Новости») их можно создавать, редактировать,
скрывать (черновик) и удалять.

## API

Публичные: `POST /api/leads`, `GET /api/news`, `GET /api/news/:id`.
Под авторизацией: `GET /api/leads`, `PATCH /api/leads/:id`, `GET /api/stats`,
`GET|POST /api/admin/news`, `PUT|DELETE /api/admin/news/:id`,
`POST /api/login`, `POST /api/logout`, `GET /api/me`.
