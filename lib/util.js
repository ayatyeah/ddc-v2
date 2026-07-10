// lib/util.js — маленькие общие помощники, без внешних зависимостей.

// Обрезка строкового поля до максимума (защита от переполнения колонок).
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// Ошибка с HTTP-статусом (для throw внутри хелперов → аккуратный ответ в catch).
function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }

// ИИ иногда оборачивает JSON в markdown-код — достаём объект «как получится».
function parseJsonLoose(text) {
  let t = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch { /* пробуем вырезать объект */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* не JSON */ } }
  return null;
}

// Gemini иногда оборачивает ответ в JSON ({"answer":"…"}) или markdown-код — достаём чистый текст.
function cleanAnswer(s) {
  let t = String(s || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (t.startsWith('{') && /"answer"/.test(t)) { try { const o = JSON.parse(t); if (o && typeof o.answer === 'string') return o.answer.trim(); } catch { /* оставим как есть */ } }
  return t;
}

// Парольная политика для СОЗДАВАЕМЫХ учёток (суперадмин из .env — сознательное исключение).
// Требуем длину ≥10 и минимум 3 из 4 классов символов, отсекаем очевидно слабые и совпадение
// с логином. Возвращаем { ok, error } — текст ошибки сразу пригоден для ответа клиенту.
const WEAK_PASSWORDS = new Set([
  'password', 'пароль', '123456', '1234567890', 'qwerty', 'qwerty123', 'admin', 'admin123',
  'администратор', 'welcome', 'iloveyou', 'ddc', '12345678', '11111111', '00000000', 'passw0rd',
]);
function validatePassword(password, username) {
  const p = String(password || '');
  if (p.length < 10) return { ok: false, error: 'Пароль должен быть не короче 10 символов' };
  if (p.length > 128) return { ok: false, error: 'Пароль слишком длинный (максимум 128 символов)' };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(p)).length;
  if (classes < 3) return { ok: false, error: 'Пароль должен содержать минимум 3 из: строчные, ПРОПИСНЫЕ, цифры, спецсимволы' };
  if (WEAK_PASSWORDS.has(p.toLowerCase())) return { ok: false, error: 'Слишком простой пароль — выберите другой' };
  if (username && p.toLowerCase().includes(String(username).toLowerCase()) && username.length >= 3) {
    return { ok: false, error: 'Пароль не должен содержать логин' };
  }
  return { ok: true };
}

module.exports = { clip, httpErr, parseJsonLoose, cleanAnswer, validatePassword };
