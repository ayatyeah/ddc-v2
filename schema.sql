-- schema.sql — таблица заявок/клиентов с сайта ЦЦР
-- Применяется автоматически через `npm run init-db`, либо вручную.

CREATE TABLE IF NOT EXISTS leads (
  id            SERIAL PRIMARY KEY,
  full_name     TEXT        NOT NULL,
  email         TEXT,
  phone         TEXT,
  subject       TEXT,
  message       TEXT,
  -- статус обслуживания клиента (меняется админом из выпадающего списка)
  status        TEXT        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','in_progress','on_hold','served','rejected')),
  -- комментарий админа по клиенту
  admin_comment TEXT        DEFAULT '',
  -- оценка клиента 0..5 (0 = не оценён)
  rating        SMALLINT    NOT NULL DEFAULT 0
                CHECK (rating BETWEEN 0 AND 5),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);

-- Автообновление updated_at при изменении строки
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- news — новости сайта (создаются/редактируются из админ-панели)
-- Поля title/excerpt/body имеют варианты на 3 языках (ru / kk / en).
-- published=false → черновик (на сайте не виден).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news (
  id           SERIAL PRIMARY KEY,
  title_ru     TEXT        NOT NULL DEFAULT '',
  title_kk     TEXT        NOT NULL DEFAULT '',
  title_en     TEXT        NOT NULL DEFAULT '',
  excerpt_ru   TEXT        NOT NULL DEFAULT '',
  excerpt_kk   TEXT        NOT NULL DEFAULT '',
  excerpt_en   TEXT        NOT NULL DEFAULT '',
  body_ru      TEXT        NOT NULL DEFAULT '',
  body_kk      TEXT        NOT NULL DEFAULT '',
  body_en      TEXT        NOT NULL DEFAULT '',
  -- акцентный цвет карточки (hex), напр. #1a4aaa
  color        TEXT        NOT NULL DEFAULT '#1a4aaa',
  -- изображение новости: data-URL (base64) или http(s)-ссылка; пусто → цветная заглушка
  image        TEXT        NOT NULL DEFAULT '',
  -- дата публикации, которую показываем на карточке
  news_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  published    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_date      ON news (news_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_published ON news (published);

-- Для уже существующих БД: добавить колонку image, если её ещё нет
ALTER TABLE news ADD COLUMN IF NOT EXISTS image TEXT NOT NULL DEFAULT '';

DROP TRIGGER IF EXISTS trg_news_updated_at ON news;
CREATE TRIGGER trg_news_updated_at
  BEFORE UPDATE ON news
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Стартовые новости-примеры (вставляются один раз, если таблица пуста)
INSERT INTO news (title_ru, title_kk, title_en, excerpt_ru, excerpt_kk, excerpt_en, body_ru, color, news_date)
SELECT
  'Бинур Жаленов назначен заместителем Председателя НБ РК',
  'Бинұр Жаленов ҚР ҰБ Төрағасының орынбасары болып тағайындалды',
  'Binur Zhalenov appointed Deputy Chairman of the NBK',
  'ЦЦР поздравляет Бинура Муратовича с назначением и желает успехов в развитии финтех-экосистемы страны.',
  'ЦДО Бинұр Мұратұлын тағайындалуымен құттықтайды.',
  'The DDC congratulates Binur Muratovich on his appointment.',
  'Центр цифрового развития поздравляет Бинура Муратовича Жаленова с назначением на должность заместителя Председателя Национального Банка Республики Казахстан и желает успехов в развитии финансово-технологической экосистемы страны.',
  '#1a4aaa', '2026-06-12'
WHERE NOT EXISTS (SELECT 1 FROM news);

INSERT INTO news (title_ru, title_kk, title_en, excerpt_ru, excerpt_kk, excerpt_en, color, news_date)
SELECT
  'Портал закупок НБРК: итоги первого полугодия',
  'ҰБ сатып алу порталы: бірінші жартыжылдық қорытындысы',
  'NBK Procurement Portal: H1 results',
  'Через площадку zakup.nationalbank.kz прошло рекордное число процедур.',
  'zakup.nationalbank.kz алаңы арқылы рекордтық рәсімдер өтті.',
  'A record number of procedures went through zakup.nationalbank.kz.',
  '#0a6a4a', '2026-06-05'
WHERE (SELECT COUNT(*) FROM news) < 2;

INSERT INTO news (title_ru, title_kk, title_en, excerpt_ru, excerpt_kk, excerpt_en, color, news_date)
SELECT
  'Запуск обновлённой аналитической панели NBK Analytics',
  'Жаңартылған NBK Analytics панелі іске қосылды',
  'Updated NBK Analytics dashboard launched',
  'Новая версия дашборда ускоряет подготовку регуляторной отчётности.',
  'Дашбордтың жаңа нұсқасы есептілікті жеделдетеді.',
  'The new dashboard speeds up regulatory reporting.',
  '#8a5a0a', '2026-05-28'
WHERE (SELECT COUNT(*) FROM news) < 3;

-- ─────────────────────────────────────────────────────────────────────────────
-- users — учётные записи админ-панели с ролями.
--   admin  — полный доступ + управление пользователями
--   editor — заявки и новости (без управления пользователями)
--   viewer — только просмотр
-- Логин/пароль из .env (ADMIN_USERNAME/ADMIN_PASSWORD) — это «суперадмин»,
-- он работает всегда и в этой таблице не хранится.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'editor'
                CHECK (role IN ('admin','editor','viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
