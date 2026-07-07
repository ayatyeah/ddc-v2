// lib/ai.js — клиенты ИИ-провайдеров: Gemini (пул ключей с ротацией) и OpenAI
// (текст, эмбеддинги, распознавание речи). Единая обёртка aiText: приоритет — OpenAI
// (нет лимита запросов, дёшево по токенам); Gemini — бесплатный фолбэк.

// ── Gemini: пул ключей ────────────────────────────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Пул ключей: список через GEMINI_API_KEYS (запятая) + отдельные GEMINI_API_KEY/_2/_3.
// Дубли убираем. Несколько ключей дают ротацию и фейловер при достижении лимита.
const GEMINI_KEYS = [
  ...String(process.env.GEMINI_API_KEYS || '').split(','),
  process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3,
].map((s) => (s || '').trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
console.log(`Gemini: ключей в пуле — ${GEMINI_KEYS.length} (ротация/фейловер при лимитах)`);

let geminiKeyIdx = 0;                       // round-robin указатель (липкий на успешном ключе)
const geminiCooldown = {};                  // idx -> до какого времени ключ пропускаем (после лимита)
const KEY_COOLDOWN_MS = 5 * 60 * 1000;      // после 429/403 ключ отдыхает 5 минут
const geminiInflight = new Map();           // дедуп: одинаковый промпт не уходит в ИИ дважды параллельно

function geminiUrl(key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
}
async function geminiFetch(key, prompt, maxTokens) {
  return fetch(geminiUrl(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 }, // без «размышлений» — экономит токены и не пустеет ответ
      },
    }),
  });
}

async function callGeminiInner(prompt, maxTokens) {
  if (!GEMINI_KEYS.length) throw new Error('Не задан ни один GEMINI_API_KEY в .env');
  // Порядок обхода: с текущего указателя по кругу; ключи на кулдауне пропускаем.
  const order = GEMINI_KEYS.map((_, i) => (geminiKeyIdx + i) % GEMINI_KEYS.length);
  let avail = order.filter((i) => !(geminiCooldown[i] && geminiCooldown[i] > Date.now()));
  if (!avail.length) avail = order;          // все «отдыхают» — всё равно пробуем по кругу
  let lastErr = null;
  for (const idx of avail) {
    try {
      const r = await geminiFetch(GEMINI_KEYS[idx], prompt, maxTokens);
      if (r.status === 429 || r.status === 403) {     // лимит/квота → кулдаун и следующий ключ
        geminiCooldown[idx] = Date.now() + KEY_COOLDOWN_MS;
        lastErr = new Error(`Gemini ${r.status} на ключе #${idx + 1} (лимит) — переключаюсь`);
        console.warn(lastErr.message);
        continue;
      }
      if (!r.ok) { const tx = await r.text(); lastErr = new Error(`Gemini ${r.status}: ${tx.slice(0, 200)}`); continue; }
      const j = await r.json();
      const cand = j?.candidates?.[0];
      const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (!text) { lastErr = new Error('пустой ответ ИИ (' + (cand?.finishReason || 'нет кандидатов') + ')'); continue; }
      geminiKeyIdx = idx;                     // успешный ключ делаем текущим (липкость → меньше переключений)
      return text;
    } catch (e) { lastErr = e; }
  }
  geminiKeyIdx = (geminiKeyIdx + 1) % GEMINI_KEYS.length; // сдвигаем старт на след. раз
  throw lastErr || new Error('Все ключи Gemini недоступны (лимиты/ошибки)');
}

// Обёртка с in-flight дедупом: параллельные одинаковые запросы делят один вызов к ИИ.
function callGemini(prompt, maxTokens = 2048) {
  const key = maxTokens + ' ' + prompt;
  const cached = geminiInflight.get(key);
  if (cached) return cached;
  const p = callGeminiInner(prompt, maxTokens).finally(() => geminiInflight.delete(key));
  geminiInflight.set(key, p);
  return p;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.5-mini';
async function callOpenAI(system, user) {
  if (!OPENAI_KEY) throw new Error('Не задан OPENAI_API_KEY в .env');
  // Тело минимальное (без temperature/max_tokens) — совместимо с разными версиями моделей.
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    signal: AbortSignal.timeout(20000),   // не даём зависнуть запросу
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) { const tx = await r.text(); throw new Error(`OpenAI ${r.status}: ${tx.slice(0, 300)}`); }
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || '';
}

// Единый текст-LLM для интерактивных ИИ-функций (ответы/анализ/генерация).
async function callOpenAIText(prompt, { json = false } = {}) {
  if (!OPENAI_KEY) throw new Error('Не задан OPENAI_API_KEY');
  const body = { model: OPENAI_MODEL, messages: [{ role: 'user', content: prompt }] };
  if (json) body.response_format = { type: 'json_object' };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    signal: AbortSignal.timeout(25000), body: JSON.stringify(body),
  });
  if (!r.ok) { const tx = await r.text(); throw new Error(`OpenAI ${r.status}: ${tx.slice(0, 200)}`); }
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || '';
}
async function aiText(prompt, opts = {}) {
  if (OPENAI_KEY) { try { return await callOpenAIText(prompt, opts); } catch (e) { console.error('aiText(openai):', e.message); } }
  return await callGemini(prompt, opts.maxTokens || 800);   // фолбэк на Gemini
}

// ── Эмбеддинги (для семантического поиска/RAG) ───────────────────────────────
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
async function embed(input) {
  if (!OPENAI_KEY) throw new Error('Не задан OPENAI_API_KEY');
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input }),
  });
  if (!r.ok) { const tx = await r.text(); throw new Error(`Embed ${r.status}: ${tx.slice(0, 200)}`); }
  const j = await r.json();
  return (j.data || []).map((d) => d.embedding);
}

// ── Распознавание речи (аудио → текст) через gpt-4o-mini-transcribe — «уши». ──
// Фолбэк — мультимодальный Gemini (принимает аудио inline): выручает без ключа OpenAI и при его сбоях.
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
async function openaiTranscribe(buf, mime) {
  const base = String(mime || '').split(';')[0].trim();   // отбрасываем ;codecs=… (OpenAI строг к типу)
  const ext = /wav/.test(base) ? 'wav' : /mp4|m4a|mpeg|mpga/.test(base) ? 'mp4' : /ogg/.test(base) ? 'ogg' : /webm/.test(base) ? 'webm' : 'wav';
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: base || 'audio/wav' }), `audio.${ext}`);
  fd.append('model', OPENAI_TRANSCRIBE_MODEL);
  fd.append('language', 'ru');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: fd,
    signal: AbortSignal.timeout(20000),   // не даём зависнуть распознаванию
  });
  if (!r.ok) { const tx = await r.text(); throw new Error(`Transcribe ${r.status}: ${tx.slice(0, 300)}`); }
  const j = await r.json();
  return String(j.text || '').trim();
}
async function geminiTranscribe(buf, mime) {
  if (!GEMINI_KEYS.length) throw new Error('Распознавание речи недоступно: нет ни OPENAI_API_KEY, ни GEMINI_API_KEY');
  const base = String(mime || 'audio/wav').split(';')[0].trim();
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [
      { text: 'Транскрибируй это аудио (русская речь, возможны казахские слова). Верни ТОЛЬКО текст сказанного, без кавычек и пояснений. Если речи нет — верни пустую строку.' },
      { inline_data: { mime_type: base, data: buf.toString('base64') } },
    ] }],
    generationConfig: { temperature: 0 },   // без responseMimeType: нужен обычный текст, не JSON
  });
  let lastErr = null;
  for (const key of GEMINI_KEYS) {
    try {
      const r = await fetch(geminiUrl(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { lastErr = new Error(`Gemini STT ${r.status}`); continue; }
      const j = await r.json();
      const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
      return text.replace(/^["«]+|["»]+$/g, '').trim();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Gemini STT недоступен');
}
async function transcribeAudio(buf, mime) {
  if (!OPENAI_KEY) return geminiTranscribe(buf, mime);
  try { return await openaiTranscribe(buf, mime); }
  catch (e) {
    if (!GEMINI_KEYS.length) throw e;
    console.error('transcribe(openai):', e.message, '— пробую Gemini');
    return geminiTranscribe(buf, mime);
  }
}

module.exports = { GEMINI_KEYS, GEMINI_MODEL, callGemini, OPENAI_KEY, OPENAI_MODEL, callOpenAI, aiText, embed, transcribeAudio };
