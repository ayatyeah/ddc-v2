// lib/migrate.js — лёгкая идемпотентная авто-миграция схемы БД (выполняется на старте,
// чтобы деплой не требовал ручного `npm run init-db`). Все выражения безопасны для
// повторного запуска: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
const db = require('../db');

function migrate() {
  return db.query(
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
     ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;  -- ревокация сессий: инкремент инвалидирует все выданные токены
     ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_id INTEGER;    -- вложение сообщения
     ALTER TABLE leads ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT '';        -- 'career' = отклик на вакансию
     ALTER TABLE leads ADD COLUMN IF NOT EXISTS cv_file_id INTEGER;    -- прикреплённое CV
     ALTER TABLE leads ADD COLUMN IF NOT EXISTS reject_reason TEXT NOT NULL DEFAULT '';  -- причина отказа (для статуса rejected)
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
     );
     -- Профиль сотрудника: дата рождения (для дней рождения в календаре) + право писать новости
     ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
     ALTER TABLE users ADD COLUMN IF NOT EXISTS can_write_news BOOLEAN NOT NULL DEFAULT FALSE;
     -- Усиление задач: срок, приоритет, описание уже есть (body)
     ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
     ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';  -- low|normal|high|urgent
     -- Усиление документов: категория + дата обновления
     ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
     ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
     -- Календарь портала: встречи, презентации, праздники и т.п. (дни рождения и дедлайны задач
     -- вычисляются на лету из users.birth_date и tasks.due_date, в этой таблице не хранятся)
     CREATE TABLE IF NOT EXISTS events (
       id            SERIAL PRIMARY KEY,
       kind          TEXT NOT NULL DEFAULT 'meeting',   -- holiday|meeting|presentation|other
       title         TEXT NOT NULL DEFAULT '',
       descr         TEXT NOT NULL DEFAULT '',
       starts_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
       ends_at       TIMESTAMPTZ,
       all_day       BOOLEAN NOT NULL DEFAULT FALSE,
       department    TEXT NOT NULL DEFAULT '',           -- '' = для всех
       created_by    INTEGER,
       created_by_name TEXT NOT NULL DEFAULT '',
       created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS idx_events_starts ON events (starts_at);
     -- Внутренние новости портала (пишут админ / начальники отделов / кому выдано право)
     CREATE TABLE IF NOT EXISTS portal_news (
       id          SERIAL PRIMARY KEY,
       title       TEXT NOT NULL DEFAULT '',
       body        TEXT NOT NULL DEFAULT '',
       category    TEXT NOT NULL DEFAULT 'company',      -- company|hr|it|finance|event
       pinned      BOOLEAN NOT NULL DEFAULT FALSE,
       author_id   INTEGER,
       author_name TEXT NOT NULL DEFAULT '',
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS idx_portal_news_created ON portal_news (pinned DESC, created_at DESC);
     ALTER TABLE portal_news ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;   -- проставляется при правке новости
     ALTER TABLE requests ADD COLUMN IF NOT EXISTS ai JSONB;   -- ИИ-анализ заявки для согласующего
     -- Семантический индекс портала для ИИ-поиска и RAG «Спроси у ДиДи»
     CREATE TABLE IF NOT EXISTS search_index (
       id         SERIAL PRIMARY KEY,
       kind       TEXT NOT NULL,
       ref_id     INTEGER NOT NULL,
       title      TEXT NOT NULL DEFAULT '',
       body       TEXT NOT NULL DEFAULT '',
       tab        TEXT,
       hash       TEXT NOT NULL DEFAULT '',
       embedding  JSONB,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       UNIQUE (kind, ref_id)
     );
     -- Опросы сотрудников с живыми результатами
     CREATE TABLE IF NOT EXISTS polls (
       id          SERIAL PRIMARY KEY,
       question    TEXT NOT NULL DEFAULT '',
       options     JSONB NOT NULL DEFAULT '[]'::jsonb,
       author_id   INTEGER,
       author_name TEXT NOT NULL DEFAULT '',
       closes_at   TIMESTAMPTZ,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE TABLE IF NOT EXISTS poll_votes (
       poll_id    INTEGER NOT NULL,
       user_id    INTEGER NOT NULL,
       option_idx INTEGER NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (poll_id, user_id)
     );
     ALTER TABLE polls ADD COLUMN IF NOT EXISTS multi BOOLEAN NOT NULL DEFAULT FALSE;   -- множественный выбор
     DO $$ BEGIN
       ALTER TABLE poll_votes DROP CONSTRAINT IF EXISTS poll_votes_pkey;
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poll_votes_uniq') THEN
         ALTER TABLE poll_votes ADD CONSTRAINT poll_votes_uniq UNIQUE (poll_id, user_id, option_idx);
       END IF;
     END $$;
     -- Профиль сотрудника: контакты/навыки/должность/дата приёма
     ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
     ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT NOT NULL DEFAULT '';
     ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT '';
     ALTER TABLE users ADD COLUMN IF NOT EXISTS hired_at DATE;
     ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT NOT NULL DEFAULT '';   -- секрет 2FA (base32)
     ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
     -- Мониторинг: параметры реальной авто-проверки доступности систем
     ALTER TABLE systems ADD COLUMN IF NOT EXISTS check_kind TEXT NOT NULL DEFAULT 'none';   -- none|self|db|http|tcp
     ALTER TABLE systems ADD COLUMN IF NOT EXISTS check_target TEXT NOT NULL DEFAULT '';       -- URL (http) или host:port (tcp)
     ALTER TABLE systems ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
     ALTER TABLE systems ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ;
     ALTER TABLE systems ADD COLUMN IF NOT EXISTS checks_ok BIGINT NOT NULL DEFAULT 0;
     ALTER TABLE systems ADD COLUMN IF NOT EXISTS checks_total BIGINT NOT NULL DEFAULT 0;
     -- Массовые рассылки сотрудникам (внутренние уведомления + опционально новость)
     CREATE TABLE IF NOT EXISTS broadcasts (
       id SERIAL PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
       channel TEXT NOT NULL DEFAULT 'portal',   -- portal|news
       audience TEXT NOT NULL DEFAULT 'all',      -- all | role:<role> | dept:<name>
       author TEXT NOT NULL DEFAULT '', recipients INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     -- Онбординг: прогресс чек-листа нового сотрудника
     CREATE TABLE IF NOT EXISTS onboarding (
       user_id INTEGER NOT NULL,
       step    TEXT NOT NULL,
       done    BOOLEAN NOT NULL DEFAULT FALSE,
       done_at TIMESTAMPTZ,
       PRIMARY KEY (user_id, step)
     );
     -- Бронирование переговорных
     CREATE TABLE IF NOT EXISTS rooms (
       id SERIAL PRIMARY KEY, name TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
     );
     CREATE TABLE IF NOT EXISTS bookings (
       id SERIAL PRIMARY KEY, room_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '',
       day DATE NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
       user_id INTEGER, user_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS idx_bookings_day ON bookings (room_id, day);
     -- Реестр ИТ-систем + инциденты (статус-борд «бесперебойность инфраструктуры»)
     CREATE TABLE IF NOT EXISTS systems (
       id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'operational',   -- operational|degraded|down|maintenance
       uptime NUMERIC NOT NULL DEFAULT 99.9, owner TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
       sort_order INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE TABLE IF NOT EXISTS incidents (
       id SERIAL PRIMARY KEY, system_id INTEGER, title TEXT NOT NULL DEFAULT '',
       severity TEXT NOT NULL DEFAULT 'minor',       -- minor|major|critical
       status TEXT NOT NULL DEFAULT 'open',           -- open|monitoring|resolved
       note TEXT NOT NULL DEFAULT '', started_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
     );
     -- База знаний (Wiki): статьи с категориями (индексируются в семантический поиск)
     CREATE TABLE IF NOT EXISTS wiki (
       id SERIAL PRIMARY KEY, title TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Общее',
       body TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     -- Журнал входов (аудит безопасности)
     CREATE TABLE IF NOT EXISTS login_events (
       id SERIAL PRIMARY KEY, user_id INTEGER, username TEXT NOT NULL DEFAULT '',
       event TEXT NOT NULL DEFAULT 'success',   -- success|fail|2fa_success|2fa_fail
       ip TEXT NOT NULL DEFAULT '', ua TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events (created_at DESC);`
  );
}

module.exports = { migrate };
