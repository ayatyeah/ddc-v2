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

module.exports = { clip, httpErr, parseJsonLoose, cleanAnswer };
