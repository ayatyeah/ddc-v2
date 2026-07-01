/* siteMap.js — единый конфиг новой архитектуры сайта (9 разделов).
   Кормит и мега-меню (Nav), и типовые лендинги (SectionLanding). Всё трилингвал:
   каждое текстовое поле — { ru, kk, en }. icon — ключ из NAV_ICONS (icons.jsx).
   wow: true — подпункт-фича (метка [WOW]). landing: false — у раздела своя страница
   (Главная/Услуги/Контакты) — генеративный лендинг не рисуем, только пункт в меню. */

const L = (ru, kk, en) => ({ ru, kk, en });

export const SECTIONS = [
  {
    key: 'home', route: '/', icon: 'home', landing: false,
    title: L('Главная', 'Басты бет', 'Home'),
    intro: L('Кто мы, наш масштаб, новости и проекты.', 'Біз кімбіз, ауқымымыз, жаңалықтар.', 'Who we are, our scale and news.'),
    items: [
      { icon: 'users', title: L('Кто мы', 'Біз кімбіз', 'Who we are'), desc: L('Миссия цифровизации Нацбанка простыми словами.', 'Ұлттық Банк цифрлануы туралы қарапайым тілмен.', 'The National Bank digitalization mission, in plain words.') },
      { icon: 'chart', title: L('Наш масштаб', 'Ауқымымыз', 'Our scale'), desc: L('Сколько лет на рынке и сколько систем защищаем.', 'Нарықтағы жылдар және қорғайтын жүйелер саны.', 'Years on the market and systems we protect.') },
      { icon: 'doc', title: L('Новости и проекты', 'Жаңалықтар мен жобалар', 'News & projects'), desc: L('Релизы, запуск ИИ-сервисов, финтех-события.', 'Релиздер, ЖИ-сервистер, финтех-оқиғалар.', 'Releases, AI launches, fintech events.') },
      { icon: 'cart', title: L('Закупки и тендеры', 'Сатып алу мен тендерлер', 'Procurement & tenders'), desc: L('Быстрый переход для бизнеса.', 'Бизнеске жылдам өту.', 'Quick access for business.') },
      { icon: 'search', wow: true, title: L('Умный поиск', 'Ақылды іздеу', 'Smart search'), desc: L('ИИ-строка: отвечает на вопросы вместо пользователя.', 'ЖИ-жол: сұрақтарға жауап береді.', 'AI search that answers your questions.') },
    ],
  },
  {
    key: 'services', route: '/uslugi', icon: 'cpu', landing: false,
    title: L('Услуги и сервисы', 'Қызметтер', 'Services'),
    intro: L('Что мы делаем для государства и бизнеса.', 'Мемлекет пен бизнес үшін не істейміз.', 'What we do for the state and business.'),
    items: [
      { icon: 'cpu', title: L('Разработка ИИ', 'ЖИ әзірлеу', 'AI development'), desc: L('Умные роботы и аналитика больших данных.', 'Ақылды боттар және үлкен деректер аналитикасы.', 'Smart agents and big-data analytics.') },
      { icon: 'shield', title: L('Кибербезопасность', 'Киберқауіпсіздік', 'Cybersecurity'), desc: L('Защита государственных ИТ-систем и серверов.', 'Мемлекеттік IT-жүйелерді қорғау.', 'Protecting government IT systems and servers.') },
      { icon: 'cloud', title: L('ИТ-инфраструктура', 'IT-инфрақұрылым', 'IT infrastructure'), desc: L('Хранение данных и облачные решения для финтеха.', 'Деректерді сақтау және бұлтты шешімдер.', 'Data storage and cloud for fintech.') },
      { icon: 'support', title: L('Поддержка 1477', '1477 қолдау', '1477 Support'), desc: L('Единый контакт-центр для граждан и бизнеса.', 'Азаматтар мен бизнеске бірыңғай орталық.', 'A single contact center for citizens and business.') },
    ],
  },
  {
    key: 'careers', route: '/karera', icon: 'briefcase', landing: true,
    title: L('Работа у нас', 'Бізде жұмыс', 'Careers'),
    intro: L('Разрабатывай ИТ-решения национального масштаба.', 'Ұлттық ауқымдағы IT-шешімдерді әзірле.', 'Build IT solutions at a national scale.'),
    items: [
      { icon: 'briefcase', title: L('Свежие вакансии', 'Жаңа вакансиялар', 'Open roles'), desc: L('От стажёров до архитекторов систем.', 'Тәжірибешіден жүйе сәулетшісіне дейін.', 'From interns to system architects.') },
      { icon: 'code', title: L('Наш стек', 'Біздің стек', 'Our stack'), desc: L('На чём пишем код и какие навыки ценим.', 'Немен код жазамыз және қандай дағдыларды бағалаймыз.', 'What we code with and skills we value.') },
      { icon: 'flask', title: L('Стажировки', 'Тәжірибелер', 'Internships'), desc: L('Программы для студентов и выпускников.', 'Студенттер мен түлектерге бағдарламалар.', 'Programs for students and graduates.') },
      { icon: 'users', title: L('Наша команда', 'Біздің команда', 'Our team'), desc: L('Реальные истории сотрудников.', 'Қызметкерлердің нақты тарихы.', 'Real employee stories.') },
    ],
  },
  {
    key: 'partners', route: '/partners', icon: 'check', landing: true,
    title: L('Партнёрам', 'Серіктестерге', 'For partners'),
    intro: L('Поставщикам и подрядчикам: комплаенс и подача документов.', 'Жеткізушілер мен мердігерлерге: комплаенс және құжаттар.', 'For suppliers and contractors: compliance and submissions.'),
    items: [
      { icon: 'check', title: L('Быстрый комплаенс', 'Жылдам комплаенс', 'Quick compliance'), desc: L('Тест за 5 минут: подходите ли для работы с НБК.', '5 минуттық тест: ҰБ-мен жұмысқа жарайсыз ба.', 'A 5-minute test: are you a fit to work with NBK.') },
      { icon: 'doc', title: L('Подача документов', 'Құжаттарды тапсыру', 'Submit documents'), desc: L('Онлайн-окно для потенциальных ИТ-подрядчиков.', 'Әлеуетті IT-мердігерлерге онлайн-терезе.', 'An online window for prospective IT contractors.') },
    ],
  },
  {
    key: 'contacts', route: '/kontakty', icon: 'map', landing: false,
    title: L('Контакты и связь', 'Байланыс', 'Contacts'),
    intro: L('Адрес, обратная связь и прямые контакты.', 'Мекенжай, кері байланыс және тікелей байланыс.', 'Address, feedback and direct contacts.'),
    items: [
      { icon: 'map', title: L('Наш адрес', 'Мекенжайымыз', 'Our address'), desc: L('Интерактивная карта офиса в Астане.', 'Астанадағы кеңсенің интерактивті картасы.', 'An interactive map of our Astana office.') },
      { icon: 'chat', title: L('Обратная связь', 'Кері байланыс', 'Feedback'), desc: L('Форма быстрой отправки писем и запросов.', 'Хат пен сұраныстарды жіберу формасы.', 'A quick form to send letters and requests.') },
      { icon: 'support', title: L('Телефоны и соцсети', 'Телефондар мен әлеумет', 'Phones & social'), desc: L('Приёмная, HR-отдел и пресс-служба.', 'Қабылдау, HR және баспасөз қызметі.', 'Reception, HR and press office.') },
    ],
  },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));
export const tx = (field, lang) => (field && (field[lang] || field.ru)) || '';
