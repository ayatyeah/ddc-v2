// Локальный разбор голосовых команд БЕЗ ИИ: детерминированные правила + русские даты/время.
// Понимает навигацию по всем разделам, создание событий/задач/новостей/заявок.
// Возвращает массив действий; пустой массив = «не понял» → вызывающий код падает на ИИ-фолбэк.
// ВАЖНО: в JS \b и \w не работают с кириллицей — поэтому нигде их не используем, только явные
// корни слов и разбор по токенам.

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const MONTHS = [[/январ/, 0], [/феврал/, 1], [/март/, 2], [/апрел/, 3], [/ма[йя]/, 4], [/июн/, 5], [/июл/, 6], [/август/, 7], [/сентябр/, 8], [/октябр/, 9], [/ноябр/, 10], [/декабр/, 11]];
const monthIndex = (w) => { for (const [re, i] of MONTHS) if (re.test(w)) return i; return -1; };
const MONTH_RE = 'январ[а-я]*|феврал[а-я]*|март[а-я]*|апрел[а-я]*|ма[йя]|июн[а-я]*|июл[а-я]*|август[а-я]*|сентябр[а-я]*|октябр[а-я]*|ноябр[а-я]*|декабр[а-я]*';

// Порядковое числительное дня («третье», «двадцать пятое», «тридцать первое»).
function ordinalDay(s) {
  const tens = /двадцат/.test(s) ? 20 : /тридцат/.test(s) ? 30 : 0;
  const teens = { одиннадцат: 11, двенадцат: 12, тринадцат: 13, четырнадцат: 14, пятнадцат: 15, шестнадцат: 16, семнадцат: 17, восемнадцат: 18, девятнадцат: 19, десят: 10 };
  if (!tens) for (const k in teens) if (new RegExp(k).test(s)) return teens[k];
  const units = { перв: 1, втор: 2, трет: 3, четверт: 4, четвёрт: 4, пят: 5, шест: 6, седьм: 7, восьм: 8, девят: 9 };
  let unit = 0;
  for (const k in units) if (new RegExp(k).test(s)) { unit = units[k]; break; }
  const d = tens + unit;
  return d >= 1 && d <= 31 ? d : 0;
}

// Дата в формате YYYY-MM-DD или null.
function parseDate(text, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/послезавтра/.test(text)) return fmt(addDays(today, 2));
  if (/завтра/.test(text)) return fmt(addDays(today, 1));
  if (/сегодня|прямо сейчас/.test(text)) return fmt(today);
  let m = text.match(/через\s+(\d+)\s*(дн|недел)/);
  if (m) return fmt(addDays(today, +m[1] * (m[2] === 'недел' ? 7 : 1)));
  const WD = { воскресень: 0, понедельник: 1, вторник: 2, сред: 3, четверг: 4, пятниц: 5, суббот: 6 };
  for (const k in WD) if (new RegExp(k).test(text)) { let d = addDays(today, 1); for (let i = 0; i < 7; i++) { if (d.getDay() === WD[k]) return fmt(d); d = addDays(d, 1); } }
  // Явную дату без года трактуем как ближайшую будущую: «3 июля», сказанное 7 июля, — это следующий год.
  const nextOccurrence = (mon, day) => { let d = new Date(now.getFullYear(), mon, day); if (d < today) d = new Date(now.getFullYear() + 1, mon, day); return fmt(d); };
  m = text.match(new RegExp('(\\d{1,2})\\s*(?:-?(?:го|е|ое|ье|ого))?\\s*(' + MONTH_RE + ')'));   // «3 июля», «15-го июля»
  if (m) { const day = +m[1], mon = monthIndex(m[2]); if (mon >= 0 && day >= 1 && day <= 31) return nextOccurrence(mon, day); }
  m = text.match(new RegExp('([а-я]+(?:\\s+[а-я]+)?)\\s+(' + MONTH_RE + ')'));   // «третье июля», «двадцать пятое августа»
  if (m) { const day = ordinalDay(m[1]), mon = monthIndex(m[2]); if (mon >= 0 && day >= 1) return nextOccurrence(mon, day); }
  return null;
}

// Время HH:MM или null. Требует явного признака времени (двоеточие / «утра/дня/вечера/ночи/часов»
// / предлог «в» перед числом), чтобы не спутать «3 июля» с «в 3 часа».
function parseTime(text) {
  let m = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (m) { const h = +m[1], mi = +m[2]; if (h < 24 && mi < 60) return pad(h) + ':' + pad(mi); }
  m = text.match(/(\d{1,2})\s*(час[а-я]*|утра|дня|вечера|ночи)/);
  if (m) { let h = +m[1]; const p = m[2]; if (/вечера|дня/.test(p) && h < 12) h += 12; if (/ночи/.test(p) && h === 12) h = 0; if (h >= 0 && h <= 23) return pad(h) + ':00'; }
  if (/полдень/.test(text)) return '12:00';
  if (/полночь/.test(text)) return '00:00';
  m = text.match(new RegExp('(?:^|\\s)в\\s+(\\d{1,2})(?=\\s|$)(?!\\s*(?:' + MONTH_RE + '))'));
  if (m) { const h = +m[1]; if (h >= 0 && h <= 23) return pad(h) + ':00'; }
  return null;
}

const TABS = [
  ['booking', /переговорк|переговорн|бронир|брон[ья]/], ['polls', /опрос|голосован/],
  ['calendar', /календар|расписани|событи/], ['news', /новост/], ['docs', /документ|файл/],
  ['requests', /заявк|обращени/], ['tasks', /задач|задани|таск/], ['people', /сотрудник|персонал|коллег|люди/],
  ['depts', /отдел|департамент|подразделени/], ['dm', /личн[а-я]*\s*сообщени|личк/], ['chat', /чат/],
  ['profile', /профил|настройк/], ['mission', /mission|контрол|мониторинг|дашборд/], ['home', /главн|домой|начал/],
];
const matchTab = (text) => { for (const [tab, re] of TABS) if (re.test(text)) return tab; return null; };

// Приоритет задачи: сервер принимает low|normal|high|urgent — «срочно/горит» это urgent, «важно» — high.
const priorityOf = (t) => /не\s*срочн|не\s*важн|низк[а-я]*\s*приоритет|низк[а-я]*\s*важн|потом|когда-нибудь/.test(t) ? 'low'
  : /срочн|критичн|немедлен|асап|горит|как можно скор/.test(t) ? 'urgent'
  : /важн|высок[а-я]*\s*приоритет/.test(t) ? 'high' : 'normal';
const reqKind = (t) => /отпуск|отгул/.test(t) ? 'vacation' : /больничн|болею|заболел/.test(t) ? 'sick' : /командировк/.test(t) ? 'trip' : /справк/.test(t) ? 'certificate' : /доступ/.test(t) ? 'access' : /оборудован|технику|ноутбук|компьютер|монитор/.test(t) ? 'equipment' : /пропуск/.test(t) ? 'pass' : 'other';
// Осмысленный заголовок заявки по её типу — когда из фразы не извлеклось ничего конкретного.
const REQ_TITLE = { vacation: 'Отпуск', sick: 'Больничный', trip: 'Командировка', certificate: 'Справка', access: 'Запрос доступа', equipment: 'Запрос оборудования', pass: 'Пропуск', other: 'Заявка' };

// Служебные слова, которые вычищаем из заголовка (кириллица-безопасно, по токенам).
const DROP_ROOT = /^(открой|откры|зайд|перейд|покажи|показат|войд|включ|переключ|вернис|впиш|запиш|запис|занес|созда|добав|назнач|постав|запланир|сдела|оформ|завед|напомн|опубликуй|объяв|анонс|напиш|нужн|надо|хоч|встреч|созвон|совещан|событ|презентац|задач|задан|таск|новост|заявк|отпуск|больничн|командировк|справк|пропуск|отгул|календар|расписан|документ|файл|сотрудник|персонал|коллег|отдел|департамент|подразделен|профил|настройк|мониторинг|дашборд|главн|переговорк|переговорн|бронир|опрос|голосован|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|понедельник|вторник|сред|четверг|пятниц|суббот|воскресень|срочн|важн|критичн|обычн|низк|высок|приоритет|немедлен|утр|вечер|ночи|полдень|полночь)/;
const DROP_EXACT = /^(на|в|во|к|с|со|до|и|а|но|по|о|об|про|у|из|для|это|мне|нам|там|же|бы|ли|не|дня|днем|час|часа|часов|чат|личк|сегодня|завтра|послезавтра|сейчас|mission|control)$/;
// Числительные-порядковые дня (чтобы «пятнадцатое» не попадало в заголовок — дату мы уже извлекли).
const DROP_ORD = /^(перв|втор|трет|четверт|четвёрт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат|тринадцат|четырнадцат|пятнадцат|шестнадцат|семнадцат|восемнадцат|девятнадцат|двадцат|тридцат)/;

function extractTitle(raw, type) {
  const def = type === 'create_task' ? 'Новая задача' : type === 'create_news' ? 'Новость' : type === 'create_request' ? 'Заявка' : 'Встреча';
  const cap = (s) => (s && s.length >= 2 ? s[0].toUpperCase() + s.slice(1) : '');
  // Явный разделитель заголовка. Двоеточие берём ТОЛЬКО когда перед ним буква (иначе поймали бы
  // время «15:30» → «30»).
  const sep = raw.match(/(?:—|–|под названием|называется|на тему|[а-яё]\s*:)\s*(.+)$/i);
  if (sep) return cap(sep[1].trim().replace(/[«»"]/g, '')) || def;
  const tokens = raw.toLowerCase().replace(/ё/g, 'е').split(/[\s,]+/)
    .map((w) => w.replace(/[«».!?:;()"—–]/g, '')).filter(Boolean)
    .filter((w) => /[а-я]/.test(w) && !DROP_ROOT.test(w) && !DROP_EXACT.test(w) && !DROP_ORD.test(w));
  return cap(tokens.join(' ').trim()) || def;
}

// Главный разбор. Возвращает массив действий (может быть несколько: navigate + create_event).
export function parseVoice(raw, now = new Date()) {
  const text = ' ' + String(raw || '').toLowerCase().replace(/ё/g, 'е') + ' ';
  const actions = [];
  // Перенос/изменение существующего («перенеси встречу с 10 на 12») локальные правила не
  // умеют — раньше такая фраза ошибочно СОЗДАВАЛА мусорное событие. Честно пасуем: основной
  // путь — ИИ (move_event); сюда попадаем только когда ИИ недоступен — лучше подсказка, чем мусор.
  if (/перенес|переназнач|передвин|сдвин|перепланир|отмен|удали/.test(text)) return [];
  const navVerb = /открой|откры|зайд|зайти|перейд|покажи|войд|включ|переключ|вернис|назад/.test(text);
  const createVerb = /созда|добав|впиш|запиш|занес|назнач|постав|запланир|оформ|завед|напомн|опубликуй|объяв|анонс|напиш|сдела/.test(text);
  const doCreate = createVerb || !navVerb;   // без глагола навигации «встреча завтра» тоже = создать

  const evStrong = /встреч|созвон|совещан|запланир|назнач|напомн|день рожд/.test(text);
  const taskStrong = /задач|задан|таск/.test(text);
  const wantEvent = doCreate && (evStrong || (/презентац|событ/.test(text) && !taskStrong));
  const wantTask = doCreate && taskStrong && !evStrong;
  const wantNews = doCreate && !wantEvent && !wantTask && /новост|анонс/.test(text);
  const wantReq = doCreate && !wantEvent && !wantTask && !wantNews && /заявк|отпуск|больничн|командировк|справк|пропуск|отгул/.test(text);
  const creating = wantEvent || wantTask || wantNews || wantReq;

  const tab = matchTab(text);
  if (tab && (navVerb || !creating)) actions.push({ type: 'navigate', tab });

  if (wantEvent) {
    // «день рождения» → 'other': сервер принимает только holiday|meeting|presentation|other
    // (настоящие дни рождения календарь берёт из профилей сотрудников).
    const kind = /презентац/.test(text) ? 'presentation' : /день рожд/.test(text) ? 'other' : 'meeting';
    actions.push({ type: 'create_event', title: extractTitle(raw, 'create_event'), date: parseDate(text, now) || fmt(now), time: parseTime(text) || undefined, kind });
  } else if (wantTask) {
    actions.push({ type: 'create_task', title: extractTitle(raw, 'create_task'), priority: priorityOf(text), due_date: parseDate(text, now) || undefined });
  } else if (wantNews) {
    actions.push({ type: 'create_news', title: extractTitle(raw, 'create_news') });
  } else if (wantReq) {
    const kind = reqKind(text);
    const title = extractTitle(raw, 'create_request');
    // Исходную фразу сохраняем в body: детали («с 15 июля на две недели») вычищаются из
    // заголовка, но согласующему они нужны.
    actions.push({ type: 'create_request', title: title !== 'Заявка' ? title : (REQ_TITLE[kind] || 'Заявка'), kind, body: String(raw).trim() });
  }
  return actions;
}
