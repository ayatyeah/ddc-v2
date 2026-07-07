// lib/seeds.js — стартовые и демо-данные (идемпотентно: сеются один раз, если таблицы пусты).
const bcrypt = require('bcryptjs');
const db = require('../db');
const { wireSystemChecks } = require('./health');

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
const DEPARTMENTS = [
  { name: 'Разработка ИС', desc: 'Проектирование и сопровождение информационных систем.' },
  { name: 'Информационная безопасность', desc: 'Защита данных и ИТ-систем, соответствие требованиям регулятора.' },
  { name: 'ИТ-инфраструктура', desc: 'Серверы, облака, хранение данных, сети.' },
  { name: 'Аналитика и данные', desc: 'Дашборды, регуляторная отчётность, большие данные.' },
  { name: 'Поддержка 1477', desc: 'Единый контакт-центр для граждан и бизнеса.' },
  { name: 'Проектный офис', desc: 'Управление проектами и координация команд.' },
];
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

// База знаний: несколько реальных регламентов (один раз, если документов ещё нет).
// Нужна, чтобы ИИ-поиск и «Спроси у ДиДи» отвечали содержательно на типовые вопросы.
const KNOWLEDGE = [
  { title: 'Регламент ежегодного оплачиваемого отпуска', category: 'HR', doc_type: 'Регламент',
    body: 'Каждому сотруднику ЦЦР предоставляется ежегодный оплачиваемый отпуск 24 календарных дня. Заявление на отпуск подаётся через портал (раздел «Заявки» → тип «Отпуск») не менее чем за 14 календарных дней до предполагаемой даты начала. Заявку согласует руководитель отдела, затем HR. Отпуск можно делить на части, при этом одна из частей должна быть не менее 14 дней. Неиспользованные дни переносятся на следующий год. При увольнении неиспользованные дни компенсируются.' },
  { title: 'Как получить справку с места работы', category: 'HR', doc_type: 'Инструкция',
    body: 'Справка с места работы (о доходах, для визы, в банк) оформляется через портал: раздел «Заявки» → тип «Справка». Укажите назначение справки и язык (русский/казахский). Срок изготовления — до 3 рабочих дней. Готовую справку можно забрать в отделе кадров или получить в электронном виде с ЭЦП. Для срочных случаев отметьте приоритет «Срочно».' },
  { title: 'Политика удалённой и гибридной работы', category: 'HR', doc_type: 'Политика',
    body: 'Сотрудникам доступен гибридный формат: до 2 дней удалённой работы в неделю по согласованию с руководителем. Удалённый доступ к рабочим системам предоставляется только через корпоративный VPN с обязательной двухфакторной аутентификацией (2FA). В дни удалённой работы сотрудник должен быть на связи в рабочее время (09:00–18:00) и отмечать присутствие в портале.' },
  { title: 'Регламент информационной безопасности', category: 'IT', doc_type: 'Регламент',
    body: 'Пароль должен содержать не менее 12 символов, включать буквы разного регистра, цифры и спецсимволы, меняться каждые 90 дней. Обязательна двухфакторная аутентификация (2FA) при входе в портал и корпоративные системы. Запрещено передавать пароли третьим лицам и сохранять их в открытом виде. При получении подозрительного письма (фишинг) не переходите по ссылкам и сообщите в службу ИБ через раздел «Заявки» → «Доступ/ИБ». Рабочие данные нельзя выгружать на личные устройства и в публичные облака.' },
  { title: 'Порядок оформления командировки', category: 'HR', doc_type: 'Инструкция',
    body: 'Командировка оформляется через портал: «Заявки» → «Командировка». Укажите город, даты, цель поездки и смету расходов. Заявку согласует руководитель и финансовый отдел. Суточные и проживание компенсируются по нормам компании. Авансовый отчёт с документами предоставляется в течение 5 рабочих дней после возвращения.' },
  { title: 'Онбординг: первый день нового сотрудника', category: 'HR', doc_type: 'Чек-лист',
    body: 'В первый день: получить пропуск и рабочее место, активировать учётную запись портала, настроить 2FA, ознакомиться с регламентом ИБ, добавиться в общий чат команды, познакомиться с руководителем и наставником. В первую неделю: пройти вводный инструктаж, заполнить профиль в портале (навыки, контакты), изучить регламенты отдела. Наставник назначается автоматически.' },
  { title: 'Как пользоваться порталом и подавать заявки', category: 'IT', doc_type: 'Инструкция',
    body: 'Портал сотрудника — единое рабочее пространство ЦЦР: новости, документы, задачи, календарь, заявки, чаты и голосовой ассистент ДиДи. Чтобы подать заявку (отпуск, справка, командировка, доступ, оборудование), откройте раздел «Заявки», выберите тип и заполните форму. Статус заявки отслеживается там же. Голосовой ассистент ДиДи выполняет команды голосом и текстом: «открой календарь», «создай задачу», «оформи заявку на отпуск».' },
];
async function seedKnowledge() {
  try {
    let added = 0;
    for (const d of KNOWLEDGE) {
      const { rows } = await db.query(`SELECT 1 FROM documents WHERE title=$1 LIMIT 1`, [d.title]);
      if (rows.length) continue;
      await db.query(
        `INSERT INTO documents (title, doc_type, body, category, author_name) VALUES ($1,$2,$3,$4,$5)`,
        [d.title, d.doc_type, d.body, d.category, 'HR / ИТ ЦЦР']);
      added++;
    }
    if (added) console.log(`✓ База знаний: добавлено ${added} регламентов`);
  } catch (e) { console.error('seedKnowledge:', e.message); }
}

async function seedRooms() {
  try {
    const { rows } = await db.query(`SELECT count(*)::int c FROM rooms`);
    if (rows[0].c > 0) return;
    const rooms = [['Большая переговорная', 12], ['Малая переговорная', 6], ['Переговорная «Астана»', 8], ['Комната для звонков', 2]];
    let i = 0;
    for (const [name, cap] of rooms) await db.query(`INSERT INTO rooms (name, capacity, sort_order) VALUES ($1,$2,$3)`, [name, cap, i++]);
    console.log(`✓ Переговорные: засеяно ${rooms.length}`);
  } catch (e) { console.error('seedRooms:', e.message); }
}

async function seedSystems() {
  try {
    if ((await db.query(`SELECT count(*)::int c FROM systems`)).rows[0].c) return;
    const list = [
      // name, category, status, uptime, owner, check_kind, check_target
      ['Портал сотрудников ЦЦР', 'Приложения', 'operational', 99.98, 'Отдел разработки', 'self', ''],
      ['База данных (PostgreSQL)', 'Инфраструктура', 'operational', 99.99, 'ИТ-инфраструктура', 'db', ''],
      ['Система мониторинга', 'Наблюдаемость', 'operational', 99.90, 'ИТ-инфраструктура', 'self', ''],
      ['Публичный сайт (bsbnb.kz)', 'Веб', 'operational', 99.90, 'Отдел разработки', 'http', 'https://bsbnb.kz'],
      ['Корпоративная почта', 'Инфраструктура', 'operational', 99.95, 'ИТ-инфраструктура', 'none', ''],
      ['VPN / удалённый доступ', 'Безопасность', 'operational', 99.90, 'Отдел ИБ', 'none', ''],
      ['Файловое хранилище', 'Инфраструктура', 'degraded', 99.40, 'ИТ-инфраструктура', 'none', ''],
      ['Служба каталога (LDAP)', 'Инфраструктура', 'operational', 99.97, 'ИТ-инфраструктура', 'none', ''],
      ['CI/CD пайплайн', 'Разработка', 'operational', 99.80, 'Отдел разработки', 'none', ''],
      ['Резервное копирование', 'Инфраструктура', 'maintenance', 99.60, 'ИТ-инфраструктура', 'none', ''],
    ];
    let i = 0; const ids = {};
    for (const [name, cat, st, up, owner, kind, target] of list) {
      // для авто-систем засеиваем «априор» из целевого аптайма, чтобы % был реалистичным, а не 100 с первой проверки
      const total = kind !== 'none' ? 500 : 0;
      const okc = kind !== 'none' ? Math.round((up / 100) * total) : 0;
      const r = await db.query(`INSERT INTO systems (name,category,status,uptime,owner,sort_order,check_kind,check_target,checks_ok,checks_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [name, cat, st, up, owner, i++, kind, target, okc, total]); ids[name] = r.rows[0].id; }
    await db.query(`INSERT INTO incidents (system_id,title,severity,status,note,started_at) VALUES ($1,'Повышенная задержка файлового хранилища','major','monitoring','Идёт диагностика дисковой подсистемы, часть операций медленнее обычного.', now() - interval '40 minutes')`, [ids['Файловое хранилище']]);
    await db.query(`INSERT INTO incidents (system_id,title,severity,status,note,started_at,resolved_at) VALUES ($1,'Плановое обслуживание резервного копирования','minor','resolved','Обновление агента бэкапа завершено.', now() - interval '3 hours', now() - interval '2 hours')`, [ids['Резервное копирование']]);
    console.log('✓ Реестр ИТ-систем засеян (10 систем, авто-пинг: портал/БД/мониторинг/сайт)');
  } catch (e) { console.error('seedSystems:', e.message); }
}

async function seedWiki() {
  try {
    if ((await db.query(`SELECT count(*)::int c FROM wiki`)).rows[0].c) return;
    const arts = [
      ['Git-флоу и код-ревью', 'Разработка', 'git, review, ci', 'Работаем по trunk-based с короткоживущими ветками. Ветка от main: feature/<задача>. Перед PR — прогнать линтер и тесты. PR требует минимум одного апрува код-ревью. Мёрж только после зелёного CI. Коммиты — по смыслу, сообщение по-русски.'],
      ['Стандарты кода', 'Разработка', 'code style, lint', 'Единый стиль на проект (ESLint/Prettier для JS, соответствующие линтеры для других языков). Именование — осмысленное, без сокращений. Комментарии — там, где логика неочевидна. Секреты — только в переменных окружения, никогда в репозитории.'],
      ['Регламент релизов', 'Разработка', 'release, deploy', 'Релизы — по расписанию, с чек-листом: тесты пройдены, миграции обратимы, есть план отката. Деплой в нерабочее время для критичных систем. После релиза — мониторинг метрик 30 минут.'],
      ['Настройка окружения разработчика', 'Онбординг', 'setup, dev', 'Установите Node.js LTS, доступ к репозиторию и корпоративному VPN, настройте 2FA. Скопируйте .env.example → .env и запросите значения у тимлида. Запуск: npm install && npm run dev.'],
      ['Политика паролей и 2FA', 'Безопасность', 'password, 2fa, security', 'Пароль — не менее 12 символов, разный регистр, цифры, спецсимволы; смена каждые 90 дней. Двухфакторная аутентификация обязательна для портала и корпоративных систем. Пароли не передавать и не хранить в открытом виде.'],
      ['Как сообщить об инциденте', 'Эксплуатация', 'incident, sre', 'Инцидент — любое отклонение в работе систем. Зарегистрируйте его в разделе «Мониторинг» админки с указанием системы и серьёзности. Критичные инциденты — сразу дежурному инженеру. После устранения — короткий разбор причин.'],
    ];
    for (const [title, cat, tags, body] of arts) await db.query(`INSERT INTO wiki (title, category, tags, body, author) VALUES ($1,$2,$3,$4,'ЦЦР')`, [title, cat, tags, body]);
    console.log(`✓ База знаний: засеяно ${arts.length} статей`);
  } catch (e) { console.error('seedWiki:', e.message); }
}

// Демо-данные: казахстанские сотрудники, начальники, задачи, новости, заявки, опрос, события —
// чтобы портал «ожил» на защите. Идемпотентно: если демо-сотрудники уже есть, ничего не делаем.
const DEMO_STAFF = [
  { username: 'n.sagatov', full_name: 'Нурлан Сағатов', phone: '+7 701 111 22 33', birth: '1985-04-12', dept: 'Разработка ИС', position: 'Начальник отдела разработки', role: 'manager' },
  { username: 'a.kasymova', full_name: 'Айгерім Қасымова', phone: '+7 701 222 33 44', birth: '1988-09-03', dept: 'Информационная безопасность', position: 'Начальник отдела ИБ', role: 'manager' },
  { username: 'd.akhmetov', full_name: 'Данияр Ахметов', phone: '+7 705 333 44 55', birth: '1994-01-20', dept: 'Разработка ИС', position: 'Ведущий разработчик', role: 'staff' },
  { username: 'a.zhumabekova', full_name: 'Әсел Жұмабекова', phone: '+7 705 444 55 66', birth: '1996-07-15', dept: 'Аналитика и данные', position: 'Дата-аналитик', role: 'staff' },
  { username: 't.ospanov', full_name: 'Тимур Оспанов', phone: '+7 707 555 66 77', birth: '1991-11-28', dept: 'ИТ-инфраструктура', position: 'DevOps-инженер', role: 'staff' },
  { username: 'm.serikkyzy', full_name: 'Мадина Серікқызы', phone: '+7 707 666 77 88', birth: '1998-03-08', dept: 'Поддержка 1477', position: 'Специалист поддержки', role: 'staff' },
  { username: 'e.tursynov', full_name: 'Ерлан Тұрсынов', phone: '+7 708 777 88 99', birth: '1990-06-30', dept: 'Информационная безопасность', position: 'Инженер по ИБ', role: 'staff' },
];
async function seedDemo() {
  try {
    if ((await db.query(`SELECT 1 FROM users WHERE username='n.sagatov' LIMIT 1`)).rows.length) return;
    const hash = await bcrypt.hash('demo1234', 10);
    const ids = {}; const nameOf = (u) => DEMO_STAFF.find((s) => s.username === u)?.full_name || '';
    for (const s of DEMO_STAFF) {
      const r = await db.query(
        `INSERT INTO users (username, password_hash, full_name, phone, department, position, role, birth_date, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT (username) DO NOTHING RETURNING id`,
        [s.username, hash, s.full_name, s.phone, s.dept, s.position, s.role, s.birth]);
      if (r.rows[0]) ids[s.username] = r.rows[0].id;
    }
    const day = (off) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
    const tasks = [
      ['Обновить модуль расчётов', 'Рефакторинг ядра расчётов, покрыть тестами.', 'd.akhmetov', 'high', 7, 'open'],
      ['Отчёт по инцидентам ИБ за месяц', 'Собрать сводку и метрики.', 'e.tursynov', 'normal', 3, 'in_progress'],
      ['Дашборд объёма транзакций по регионам', 'Витрина + визуализация.', 'a.zhumabekova', 'high', 10, 'open'],
      ['Настроить CI/CD для нового сервиса', 'Пайплайн сборки и деплоя.', 't.ospanov', 'urgent', 2, 'in_progress'],
      ['Разобрать очередь обращений 1477', 'Обработать обращения за неделю.', 'm.serikkyzy', 'normal', 1, 'in_progress'],
      ['Код-ревью PR по авторизации', 'Проверить и смёржить.', 'd.akhmetov', 'normal', 4, 'open'],
    ];
    for (const [title, body, u, prio, off, st] of tasks) {
      if (!ids[u]) continue;
      await db.query(`INSERT INTO tasks (title, body, assignee_id, assignee_name, created_by, priority, due_date, status) VALUES ($1,$2,$3,$4,'Нурлан Сағатов',$5,$6,$7)`,
        [title, body, ids[u], nameOf(u), prio, day(off), st]);
    }
    for (const [title, body, cat] of [
      ['Запуск обновлённого портала сотрудников', 'Коллеги! Запущен новый портал: задачи, заявки, чаты, календарь, документы и голосовой ассистент ДиДи. Делитесь обратной связью.', 'company'],
      ['Итоги квартала: рекордный оборот', 'Инфраструктура ЦЦР обрабатывает свыше 350 тысяч транзакций в день на сумму 5,9 трлн ₸. Спасибо каждому за вклад!', 'company'],
      ['Обновление регламента информационной безопасности', 'С понедельника действует обновлённый регламент ИБ. Обязательна двухфакторная аутентификация. Подробнее — в разделе «Документы».', 'it'],
    ]) await db.query(`INSERT INTO portal_news (title, body, category, author_name) VALUES ($1,$2,$3,'HR ЦЦР')`, [title, body, cat]);
    if (ids['d.akhmetov']) await db.query(`INSERT INTO requests (kind,title,body,status,author_id,author_name) VALUES ('vacation','Отпуск с 20 по 31 июля','Прошу ежегодный отпуск, задачи передам коллеге.','review',$1,'Данияр Ахметов')`, [ids['d.akhmetov']]);
    if (ids['m.serikkyzy']) await db.query(`INSERT INTO requests (kind,title,body,status,author_id,author_name) VALUES ('certificate','Справка с места работы','Для банка, на русском языке.','review',$1,'Мадина Серікқызы')`, [ids['m.serikkyzy']]);
    if (ids['t.ospanov']) await db.query(`INSERT INTO requests (kind,title,body,status,author_id,author_name,decided_by,decided_at) VALUES ('equipment','Замена ноутбука','Текущий не тянет сборки.','approved',$1,'Тимур Оспанов','Айгерім Қасымова',now())`, [ids['t.ospanov']]);
    const poll = await db.query(`INSERT INTO polls (question, options, multi, author_name) VALUES ($1,$2,false,'HR ЦЦР') RETURNING id`,
      ['Какой формат корпоратива предпочитаете?', JSON.stringify(['Выезд на природу', 'Ресторан в городе', 'Тимбилдинг-квест', 'Онлайн-формат'])]);
    const poll2 = await db.query(`INSERT INTO polls (question, options, multi, author_name) VALUES ($1,$2,true,'HR ЦЦР') RETURNING id`,
      ['Какие темы обучения вам интересны? (можно несколько)', JSON.stringify(['Kubernetes и DevOps', 'ИИ и машинное обучение', 'Информационная безопасность', 'Управление проектами', 'Аналитика данных'])]);
    const voters = Object.values(ids);
    for (let i = 0; i < voters.length; i++) {
      await db.query(`INSERT INTO poll_votes (poll_id,user_id,option_idx) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [poll.rows[0].id, voters[i], i % 4]);
      await db.query(`INSERT INTO poll_votes (poll_id,user_id,option_idx) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [poll2.rows[0].id, voters[i], i % 5]);
      if (i % 2 === 0) await db.query(`INSERT INTO poll_votes (poll_id,user_id,option_idx) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [poll2.rows[0].id, voters[i], (i + 1) % 5]);
    }
    await db.query(`INSERT INTO events (kind,title,descr,starts_at,all_day,created_by_name) VALUES ('meeting','Планёрка отдела разработки','Еженедельная синхронизация команды',$1,false,'Нурлан Сағатов')`, [new Date(Date.now() + 2 * 86400000).toISOString()]);
    await db.query(`INSERT INTO events (kind,title,descr,starts_at,all_day,created_by_name) VALUES ('presentation','Демо нового дашборда','Показ аналитики транзакций',$1,false,'Әсел Жұмабекова')`, [new Date(Date.now() + 4 * 86400000).toISOString()]);
    const room = (await db.query(`SELECT id FROM rooms ORDER BY id LIMIT 1`)).rows[0];
    if (room && ids['n.sagatov']) await db.query(`INSERT INTO bookings (room_id,title,day,start_min,end_min,user_id,user_name) VALUES ($1,'Планёрка отдела',$2,600,660,$3,'Нурлан Сағатов')`, [room.id, day(0), ids['n.sagatov']]);
    if (room && ids['a.zhumabekova']) await db.query(`INSERT INTO bookings (room_id,title,day,start_min,end_min,user_id,user_name) VALUES ($1,'Демо дашборда',$2,840,900,$3,'Әсел Жұмабекова')`, [room.id, day(0), ids['a.zhumabekova']]);
    for (const [u, msg] of [['n.sagatov', 'Всем привет! Рад видеть команду в новом портале 👋'], ['a.zhumabekova', 'Привет! Дашборд по транзакциям почти готов, скоро покажу.'], ['t.ospanov', 'Коллеги, деплой нового сервиса завтра в 14:00.']])
      if (ids[u]) await db.query(`INSERT INTO messages (author_id, author_name, recipient_id, body) VALUES ($1,$2,NULL,$3)`, [ids[u], nameOf(u), msg]);
    console.log('✓ Демо-данные: 7 сотрудников (2 начальника), задачи, новости, заявки, 2 опроса, события, брони, чат');
  } catch (e) { console.error('seedDemo:', e.message); }
}

// Полная цепочка сева (порядок важен: системы → wireSystemChecks; комнаты → демо-брони).
async function seedAll() {
  await seedServices();
  await seedDepartments();
  await seedKnowledge();
  await seedRooms();
  await seedSystems();
  await wireSystemChecks();
  await seedWiki();
  await seedDemo();
}

module.exports = { seedAll };
