// lib/rag.js — ИИ-поиск и RAG «Спроси у ДиДи»: семантический индекс по всему порталу.
// Эмбеддинги (OpenAI text-embedding-3-small) → косинусное сходство в JS. Индекс строится из
// документов/новостей/заявок/задач/событий/людей/услуг с кэшем по хэшу (переэмбеддим только
// изменённое). Работает и БЕЗ ключа: тогда индекс хранит текст, а поиск — по ключевым словам.
const crypto = require('crypto');
const db = require('../db');
const { OPENAI_KEY, embed } = require('./ai');

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

// Сбор всего индексируемого контента портала. tab = раздел портала для перехода по клику.
async function collectCorpus() {
  const items = [];
  const add = (kind, id, title, body, tab) => items.push({ kind, ref_id: Number(id), title: String(title || '').slice(0, 300), body: String(body || '').slice(0, 4000), tab });
  const safe = async (fn) => { try { await fn(); } catch { /* таблицы может не быть */ } };
  await safe(async () => (await db.query(`SELECT id,title,body,category,doc_type FROM documents ORDER BY id`)).rows.forEach((r) => add('document', r.id, r.title, `${r.category || ''} ${r.doc_type || ''}\n${r.body}`, 'docs')));
  await safe(async () => (await db.query(`SELECT id,title,body,category,tags FROM wiki ORDER BY id`)).rows.forEach((r) => add('wiki', r.id, r.title, `${r.category || ''} ${r.tags || ''}\n${r.body}`, null)));
  await safe(async () => (await db.query(`SELECT id,title,body,category FROM portal_news ORDER BY id`)).rows.forEach((r) => add('news', r.id, r.title, `${r.category || ''}\n${r.body}`, 'news')));
  await safe(async () => (await db.query(`SELECT id,title,body,kind,status FROM requests ORDER BY id`)).rows.forEach((r) => add('request', r.id, r.title, `${r.kind || ''} ${r.status || ''}\n${r.body}`, 'requests')));
  await safe(async () => (await db.query(`SELECT id,title,body,priority,status FROM tasks ORDER BY id`)).rows.forEach((r) => add('task', r.id, r.title, `${r.priority || ''} ${r.status || ''}\n${r.body || ''}`, 'tasks')));
  await safe(async () => (await db.query(`SELECT id,title,descr,kind FROM events ORDER BY id`)).rows.forEach((r) => add('event', r.id, r.title, `${r.kind || ''}\n${r.descr || ''}`, 'calendar')));
  await safe(async () => (await db.query(`SELECT id, COALESCE(NULLIF(full_name,''), username) AS name, department, role FROM users WHERE active IS NOT FALSE ORDER BY id`)).rows.forEach((r) => add('person', r.id, r.name, `${r.role || ''} ${r.department || ''}`, 'people')));
  await safe(async () => (await db.query(`SELECT id,name_ru,desc_ru FROM services ORDER BY id`)).rows.forEach((r) => add('service', r.id, r.name_ru, r.desc_ru, null)));
  return items;
}

let aiIndexReady = false, aiIndexAt = 0, aiIndexing = false;
async function reindexAll(force = false) {
  if (aiIndexing) return; aiIndexing = true;
  try {
    const corpus = await collectCorpus();
    const existing = new Map();
    (await db.query(`SELECT kind, ref_id, hash, embedding IS NOT NULL AS has_vec FROM search_index`)).rows
      .forEach((r) => existing.set(`${r.kind}:${r.ref_id}`, { hash: r.hash, hasVec: r.has_vec }));
    const seen = new Set();
    const toEmbed = [];
    for (const it of corpus) {
      const key = `${it.kind}:${it.ref_id}`; seen.add(key);
      const text = `${it.title}\n${it.body}`.trim();
      const h = sha1(text);
      const ex = existing.get(key);
      const changed = force || !ex || ex.hash !== h;
      const needVec = OPENAI_KEY && (changed || !ex.hasVec);
      if (changed) {   // обновляем текстовые поля (для keyword-поиска — всегда)
        await db.query(
          `INSERT INTO search_index (kind, ref_id, title, body, tab, hash, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6, now())
           ON CONFLICT (kind, ref_id) DO UPDATE SET title=$3, body=$4, tab=$5, hash=$6, updated_at=now()`,
          [it.kind, it.ref_id, it.title, it.body, it.tab, h]);
      }
      if (needVec) toEmbed.push({ ...it, text });
    }
    for (let i = 0; i < toEmbed.length; i += 64) {   // эмбеддинги пачками
      const batch = toEmbed.slice(i, i + 64);
      const vecs = await embed(batch.map((b) => b.text));
      for (let j = 0; j < batch.length; j++) {
        await db.query(`UPDATE search_index SET embedding=$3 WHERE kind=$1 AND ref_id=$2`, [batch[j].kind, batch[j].ref_id, JSON.stringify(vecs[j])]);
      }
    }
    for (const key of existing.keys()) if (!seen.has(key)) { const [kind, ref] = key.split(':'); await db.query(`DELETE FROM search_index WHERE kind=$1 AND ref_id=$2`, [kind, Number(ref)]); }
    aiIndexReady = OPENAI_KEY ? toEmbed.length >= 0 : false; aiIndexAt = Date.now();
  } catch (e) { console.error('reindexAll:', e.message); }
  finally { aiIndexing = false; }
}

async function keywordSearch(q, limit) {
  try {
    const { rows } = await db.query(
      `SELECT kind, ref_id, title, body, tab FROM search_index WHERE title ILIKE $1 OR body ILIKE $1 ORDER BY updated_at DESC LIMIT $2`,
      [`%${q}%`, limit]);
    return rows.map((r) => ({ kind: r.kind, ref_id: r.ref_id, title: r.title, snippet: r.body.slice(0, 200), tab: r.tab }));
  } catch { return []; }
}

// Немедленно убрать запись из индекса (при удалении сущности) — чтобы удалённое НЕ всплывало
// в глобальном поиске до следующей полной переиндексации (раз в 5 минут).
async function removeFromIndex(kind, ref_id) {
  try { await db.query(`DELETE FROM search_index WHERE kind = $1 AND ref_id = $2`, [kind, Number(ref_id)]); }
  catch (e) { console.error('removeFromIndex:', e.message); }
}

// Пословный ПРЕФИКСНЫЙ поиск: запрос делим на слова, каждое слово должно найтись как
// начало слова в тексте (title/body). Так «ayat» матчит только «ayat…», а НЕ «a»/«ay»/«aya».
// Ранжируем: совпадение в заголовке и точная граница слова — выше. Диакритику/регистр игнорируем.
function escLike(s) { return String(s).replace(/([%_\\])/g, '\\$1'); }
async function prefixSearch(q, limit) {
  const words = String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  try {
    const { rows } = await db.query(`SELECT kind, ref_id, title, body, tab FROM search_index`);
    const scored = [];
    for (const r of rows) {
      const title = String(r.title || '').toLowerCase();
      const body = String(r.body || '').toLowerCase();
      // Каждое слово запроса обязано быть началом какого-то слова в title или body.
      const allMatch = words.every((w) => {
        const re = new RegExp('(^|[^\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u');
        return re.test(title) || re.test(body);
      });
      if (!allMatch) continue;
      // Скоринг: слово в начале заголовка / в заголовке — приоритетнее, чем в теле.
      let score = 0;
      for (const w of words) {
        if (title.startsWith(w)) score += 5;
        else if (new RegExp('(^|[^\\p{L}\\p{N}])' + w, 'u').test(title)) score += 3;
        else score += 1;
      }
      scored.push({ r, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ r }) => ({ kind: r.kind, ref_id: r.ref_id, title: r.title, snippet: r.body.slice(0, 200), tab: r.tab }));
  } catch (e) { console.error('prefixSearch:', e.message); return []; }
}
async function semanticSearch(q, limit = 8) {
  const ql = String(q || '').trim(); if (!ql) return [];
  if (!OPENAI_KEY) return keywordSearch(ql, limit);
  try {
    const [qv] = await embed([ql]);
    const { rows } = await db.query(`SELECT kind, ref_id, title, body, tab, embedding FROM search_index WHERE embedding IS NOT NULL`);
    if (!rows.length) return keywordSearch(ql, limit);
    const scored = rows.map((r) => ({ r, score: cosine(qv, r.embedding) })).sort((a, b) => b.score - a.score).slice(0, limit);
    return scored.map(({ r, score }) => ({ kind: r.kind, ref_id: r.ref_id, title: r.title, snippet: r.body.slice(0, 200), body: r.body, tab: r.tab, score: Math.round(score * 100) / 100 }));
  } catch (e) { console.error('semanticSearch:', e.message); return keywordSearch(ql, limit); }
}

const KIND_LABEL = { document: 'Документ', news: 'Новость', request: 'Заявка', task: 'Задача', event: 'Событие', person: 'Сотрудник', service: 'Услуга', wiki: 'База знаний' };

module.exports = { cosine, reindexAll, semanticSearch, prefixSearch, removeFromIndex, KIND_LABEL, indexReady: () => aiIndexReady };
