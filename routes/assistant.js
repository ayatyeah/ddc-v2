// routes/assistant.js — ИИ-ассистент: семантический поиск по порталу, RAG «Спроси у ДиДи»,
// генерация контента, TTS, голосовые/текстовые команды и публичный чат-бот сайта.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { auth } = require('../lib/auth');
const { clip, parseJsonLoose, cleanAnswer } = require('../lib/util');
const { OPENAI_KEY, GEMINI_KEYS, callGemini, callOpenAI, aiText, embed, transcribeAudio } = require('../lib/ai');
const { cosine, semanticSearch, prefixSearch, KIND_LABEL, indexReady } = require('../lib/rag');

const router = express.Router();

// ── Глобальный поиск по порталу (Ctrl+K): ТОЧНЫЙ пословный префиксный поиск ────
// Литеральный, а не семантический: «ayat» находит только «ayat…», не «a»/«ay»/«aya».
// Работает по search_index (удалённые сущности убираются из индекса сразу при удалении).
router.post('/api/portal/search', auth, async (req, res) => {
  const q = clip(req.body?.q, 200);
  if (!q) return res.json({ results: [], semantic: false });
  try {
    const hits = await prefixSearch(q, 10);
    res.json({
      results: hits.map((r) => ({ kind: r.kind, ref_id: r.ref_id, title: r.title, snippet: r.snippet, tab: r.tab, kindLabel: KIND_LABEL[r.kind] || r.kind })),
      semantic: false,
    });
  } catch (e) { console.error('POST /api/portal/search:', e.message); res.status(502).json({ error: 'Поиск недоступен' }); }
});

// ── RAG «Спроси у ДиДи»: вопрос → релевантные фрагменты → ответ ИИ с источниками ──
router.post('/api/assistant/ask', auth, async (req, res) => {
  const q = clip(req.body?.question || req.body?.q, 500);
  if (!q) return res.status(400).json({ error: 'Пустой вопрос' });
  try {
    const hits = await semanticSearch(q, 6);
    const sources = hits.map((h) => ({ kind: h.kind, kindLabel: KIND_LABEL[h.kind] || h.kind, ref_id: h.ref_id, title: h.title, tab: h.tab }));
    const NOINFO = 'Честно — по этому вопросу я ничего не нашёл в базе портала, так что придумывать не буду 🙂 Лучше уточнить у HR или в разделе «Контакты». Могу ещё поискать, если переформулируете.';
    // Порог релевантности: не отвечаем «из головы», если ничего похожего не нашли.
    const top = hits[0]?.score;
    const weak = OPENAI_KEY ? (top == null || top < 0.2) : hits.length === 0;   // редирект только при явной нерелевантности; остальное отсекает промпт
    if (weak) return res.json({ answer: NOINFO, sources: [] });
    if (!GEMINI_KEYS.length && !OPENAI_KEY) return res.json({ answer: 'Вот что нашлось по вашему запросу:', sources });
    const context = hits.map((h, i) => `[${i + 1}] (${KIND_LABEL[h.kind] || h.kind}) ${h.title}\n${(h.body || h.snippet || '').slice(0, 900)}`).join('\n\n');
    const prompt = `Ты — ДиДи, тёплый и дружелюбный внутренний ИИ-помощник сотрудников ЦЦР (Центр цифрового развития). Общайся по-русски живо, по-человечески, дружелюбно (можно на «ты», можно лёгкий эмодзи), как отзывчивый коллега — но по делу и кратко. Отвечай ТОЛЬКО на основе фрагментов базы портала ниже. ЖЁСТКОЕ ПРАВИЛО: если ответа в данных нет — не выдумывай, а ответь ровно так: "${NOINFO}".\n\nФрагменты базы портала:\n${context}\n\nВопрос коллеги: ${q}\n\nОтвет ДиДи:`;
    let answer = '';
    try { answer = cleanAnswer(await aiText(prompt)); } catch { /* фолбэк ниже */ }
    if (!answer) answer = NOINFO;
    res.json({ answer, sources });
  } catch (e) { console.error('POST /api/assistant/ask:', e.message); res.status(502).json({ error: 'ИИ недоступен: ' + (e.message || 'ошибка') }); }
});

// ── ИИ-генератор контента: из темы/тезисов → готовый текст, на нужном языке ──
const GEN_KINDS = { news: 'корпоративную новость для внутреннего портала компании', announcement: 'короткое объявление для сотрудников', service: 'описание ИТ-услуги компании для сайта' };
const GEN_LANG = { ru: 'русском', kk: 'казахском', en: 'английском' };
router.post('/api/assistant/generate', auth, async (req, res) => {
  const topic = clip(req.body?.topic, 600);
  const kind = GEN_KINDS[req.body?.kind] ? req.body.kind : 'news';
  const lang = GEN_LANG[req.body?.lang] ? req.body.lang : 'ru';
  if (!topic) return res.status(400).json({ error: 'Укажите тему или тезисы' });
  const prompt = `Напиши ${GEN_KINDS[kind]} на ${GEN_LANG[lang]} языке по теме/тезисам ниже. 2–4 абзаца, деловой, но живой тон. НЕ выдумывай конкретные даты, суммы и цифры, которых нет в теме. Верни ТОЛЬКО готовый текст, без заголовка и без markdown.\n\nТема/тезисы: ${topic}`;
  try { const text = cleanAnswer(await aiText(prompt)); if (!text) throw new Error('пусто'); res.json({ text }); }
  catch (e) { console.error('POST /api/assistant/generate:', e.message); res.status(502).json({ error: 'ИИ недоступен' }); }
});

// ── Публичный ИИ-чатбот сайта: отвечает посетителям об услугах ЦЦР ────────────
// (ТОЛЬКО публичный контент — услуги; внутренние данные портала не доступны).
const publicAskLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
router.post('/api/public/ask', publicAskLimiter, async (req, res) => {
  const q = clip(req.body?.q || req.body?.question, 400);
  if (!q) return res.status(400).json({ error: 'Пустой вопрос' });
  try {
    let hits = [];
    if (OPENAI_KEY) {
      const [qv] = await embed([q]);
      const { rows } = await db.query(`SELECT title, body, embedding FROM search_index WHERE kind = 'service' AND embedding IS NOT NULL`);
      hits = rows.map((r) => ({ title: r.title, body: r.body, score: cosine(qv, r.embedding) })).sort((a, b) => b.score - a.score).slice(0, 5);
    } else {
      const { rows } = await db.query(`SELECT title, body FROM search_index WHERE kind = 'service' AND (title ILIKE $1 OR body ILIKE $1) LIMIT 5`, [`%${q}%`]);
      hits = rows;
    }
    // Порог релевантности: если ничего похожего не нашли — НЕ галлюцинируем, а перенаправляем в «Контакты».
    const REDIRECT = 'Я отвечаю только по услугам и работе Центра цифрового развития и пока не нашёл точного ответа на ваш вопрос. Лучше уточнить у нас напрямую: оставьте заявку в разделе «Контакты» на сайте или позвоните в контакт-центр 1477.';
    const top = hits[0]?.score;
    const weak = OPENAI_KEY ? (top == null || top < 0.2) : hits.length === 0;   // явно нерелевантно → сразу редирект; пограничное отсекает промпт
    if (weak) return res.json({ answer: REDIRECT });
    const ctx = hits.map((h, i) => `[${i + 1}] ${h.title}\n${(h.body || '').slice(0, 600)}`).join('\n\n');
    const prompt = `Ты — виртуальный консультант официального сайта Центра цифрового развития (ЦЦР), дочерней организации Национального Банка Казахстана. Твоя аудитория — клиенты и партнёры. Отвечай ПО-РУССКИ в сдержанном официально-деловом тоне, на «вы», кратко (2–4 предложения), без панибратства и эмодзи. Отвечай СТРОГО по списку услуг ниже. ЖЁСТКОЕ ПРАВИЛО: если в данных нет ответа — НЕ придумывай факты, цены, сроки и названия, а ответь ровно так: "${REDIRECT}". По вопросам заказа услуг и сотрудничества направляй в раздел «Контакты» или к контакт-центру 1477.\n\nУслуги ЦЦР:\n${ctx}\n\nВопрос клиента: ${q}\n\nОтвет консультанта:`;
    let answer = '';
    try { answer = cleanAnswer(await aiText(prompt)); } catch { /* фолбэк ниже */ }
    if (!answer) answer = REDIRECT;
    res.json({ answer });
  } catch (e) { console.error('POST /api/public/ask:', e.message); res.status(502).json({ error: 'Ассистент недоступен' }); }
});

// ── Синтез приятного голоса (текст → mp3) через gpt-4o-mini-tts — «голос ДиДи» ──
// Тёплый естественный женский голос вместо роботизированного системного. Фолбэк на стороне
// клиента (браузерный SpeechSynthesis), если ключа/сети нет.
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'shimmer';   // мягкий женский; можно nova/coral/sage
router.post('/api/assistant/tts', auth, async (req, res) => {
  const text = clip(req.body?.text, 500);
  if (!text) return res.status(400).json({ error: 'Пустой текст' });
  if (!OPENAI_KEY) return res.status(503).json({ error: 'Нет OPENAI_API_KEY' });
  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL, voice: OPENAI_TTS_VOICE, input: text, response_format: 'mp3',
        instructions: 'Говори по-русски тёплым, спокойным и дружелюбным женским голосом. Естественная живая интонация, доброжелательно, без спешки и без роботизированности. Тебя зовут ДиДи — ассистент корпоративного портала.',
      }),
    });
    if (!r.ok) { const tx = await r.text(); throw new Error(`TTS ${r.status}: ${tx.slice(0, 200)}`); }
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg'); res.set('Cache-Control', 'no-store'); res.send(buf);
  } catch (e) { console.error('POST /api/assistant/tts:', e.message); res.status(502).json({ error: e.message || 'ошибка' }); }
});

// ── Голосовой ассистент: превращает фразу в список действий ──────────────────
// Исполняет их фронт через уже существующие эндпоинты (там же соблюдаются права роли).
const ASSIST_SYSTEM = `Ты — голосовой ассистент корпоративного портала DDC. Пользователь диктует команду на русском (может с распознанными ошибками — пойми смысл). Верни СТРОГО JSON: {"say":"короткое дружелюбное подтверждение на русском","actions":[...]}.
Доступные действия (поле type):
- {"type":"navigate","tab":"home|calendar|booking|news|polls|docs|requests|tasks|people|depts|dm|chat|profile|mission"} — открыть раздел портала.
- {"type":"create_event","title":"...","date":"YYYY-MM-DD","time":"HH:MM или null","kind":"meeting|presentation|other"} — событие в календарь.
- {"type":"create_task","title":"...","priority":"low|normal|high|urgent","due_date":"YYYY-MM-DD или null"} — задача.
- {"type":"create_news","title":"...","body":"...","category":"company|hr|it|finance|event"} — внутренняя новость.
- {"type":"create_request","kind":"vacation|sick|trip|certificate|access|equipment|pass|other","title":"...","body":"..."} — заявка (отпуск/справка/командировка/доступ и т.п.).
- {"type":"move_event","query":"1–3 слова из названия события или null","date":"YYYY-MM-DD или null — день, на котором событие стоит СЕЙЧАС","time":"HH:MM или null — его ТЕКУЩЕЕ время","new_date":"YYYY-MM-DD или null","new_time":"HH:MM или null"} — ПЕРЕНЕСТИ существующую встречу/событие. Слова «перенеси/переназначь/сдвинь/передвинь/перепланируй» — это ВСЕГДА move_event, а не create_event. Пример: «встречу переназначь с 10 на 12 8 июля» → {"type":"move_event","query":null,"date":"<8 июля>","time":"10:00","new_date":null,"new_time":"12:00"} («с 10 на 12» здесь — время, а не числа месяца, потому что день назван отдельно).
- {"type":"none"} — если команда непонятна (в say вежливо уточни).
Разделы (синонимы): «календарь/встречи»→calendar, «переговорные/бронь/комнаты»→booking, «задачи/дела»→tasks, «новости/объявления»→news, «опросы/голосования»→polls, «документы»→docs, «заявки»→requests, «сотрудники/люди/коллеги»→people, «отделы»→depts, «сообщения/личка»→dm, «чаты»→chat, «профиль»→profile, «дашборд/mission»→mission.
Сегодня {DATE} ({WEEKDAY}), год {YEAR}. Относительные даты считай от сегодня: «сегодня»,«завтра»,«послезавтра»,«в понедельник/вторник…»(ближайший будущий),«через неделю». Время: «в 3 часа дня»→15:00, «в 9 утра»→09:00, «в полдень»→12:00. Дату без года — ближайшую будущую.
В одной фразе может быть НЕСКОЛЬКО действий («открой календарь и впиши встречу на завтра в 10» = navigate+create_event). Приоритет по словам «срочно/важно»→urgent/high.
ДЕЙСТВУЙ по имеющимся данным, не переспрашивай по мелочам — недостающее подставь разумно (напр. заголовок из сути, отсутствующее время = весь день). Возвращай action, а не вопрос. {"type":"none"} только если совсем непонятно, ЧТО сделать. Отвечай ТОЛЬКО JSON, без markdown и пояснений.`;

// Разбор текста команды в действия (OpenAI — «мозг», Gemini — фолбэк без ключа OpenAI).
const WEEKDAYS_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
async function parseCommand(text) {
  // Сотрудники — в Казахстане: «сегодня/завтра» считаем по Астане (UTC+5), а не по UTC сервера,
  // иначе вечерние команды создают события на вчера. Сдвигаем эпоху и читаем UTC-поля.
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const sys = ASSIST_SYSTEM
    .replace('{DATE}', now.toISOString().slice(0, 10))
    .replace('{WEEKDAY}', WEEKDAYS_RU[now.getUTCDay()])
    .replace('{YEAR}', String(now.getUTCFullYear()));
  let raw = '';
  if (OPENAI_KEY) { try { raw = await callOpenAI(sys, text); } catch (e) { console.error('parseCommand(openai):', e.message); } }
  if (!raw) raw = await callGemini(`${sys}\n\nФраза пользователя: ${text}`, 1024);   // фолбэк: JSON-режим у Gemini уже включён
  const parsed = parseJsonLoose(raw) || {};
  return { say: String(parsed.say || '').slice(0, 300), actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 6) : [], text };
}

// Команда текстом (фолбэк / ручной ввод).
router.post('/api/assistant/command', auth, async (req, res) => {
  const text = clip(req.body?.text, 500);
  if (!text) return res.status(400).json({ error: 'Пустая команда' });
  try { res.json(await parseCommand(text)); }
  catch (e) { console.error('POST /api/assistant/command:', e.message); res.status(502).json({ error: 'Ассистент недоступен: ' + (e.message || 'ошибка') }); }
});

// Голосовая команда: аудио (base64 data-URL) → транскрипция → разбор в действия.
router.post('/api/assistant/voice', auth, async (req, res) => {
  const dataUrl = String(req.body?.audio || '');
  // Data-URL может содержать параметры (напр. data:audio/webm;codecs=opus;base64,…) — парсим строкой.
  const idx = dataUrl.indexOf(';base64,');
  if (!dataUrl.startsWith('data:') || idx < 0) return res.status(400).json({ error: 'Нет аудио' });
  const mime = dataUrl.slice(5, idx).split(';')[0] || 'audio/webm';
  const buf = Buffer.from(dataUrl.slice(idx + 8), 'base64');
  if (!buf.length || buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Некорректное аудио' });
  try {
    const text = await transcribeAudio(buf, mime);
    console.log('[voice] bytes=%d mime=%s text=%j', buf.length, mime, text);
    if (!text) return res.json({ text: '', say: 'Не расслышал. Повторите, пожалуйста.', actions: [] });
    // Режим «Спросить»: клиенту нужна только транскрипция (вопрос дальше уходит в RAG) —
    // не тратим ИИ-вызов на разбор команды.
    if (req.body?.mode === 'ask') return res.json({ text });
    res.json(await parseCommand(text));
  } catch (e) { console.error('POST /api/assistant/voice:', e.message); res.status(502).json({ error: 'Ассистент недоступен: ' + (e.message || 'ошибка') }); }
});

module.exports = router;
