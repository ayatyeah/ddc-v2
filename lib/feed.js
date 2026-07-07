// lib/feed.js — AI-агрегатор новостей: цифровая жизнь и технологии Казахстана.
// Несколько источников грузятся параллельно; дубли по URL/заголовку отсеиваются,
// затем Gemini отбирает самое релевантное. Поддерживаются RSS (<item>) и Atom (<entry>).
// kzOnly — глобальные источники (TechCrunch/The Verge): берём только материалы про Казахстан.
const db = require('../db');
const { callGemini } = require('./ai');
const { parseJsonLoose } = require('./util');

const KZ_RE = /kazakh|казах|astana|астан|almaty|алмат|nur-?sultan|нур-?султан|kaspi|halyk|kazakhstan/i;
const FEED_SOURCES = [
  { name: 'Profit.kz', url: 'https://profit.kz/rss/' },
  { name: 'Digital Business', url: 'https://digitalbusiness.kz/feed/' },
  { name: 'Bluescreen.kz', url: 'https://bluescreen.kz/feed/' },
  { name: 'Forbes.kz', url: 'https://forbes.kz/rss/' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', kzOnly: true },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', kzOnly: true },
];
const FEED_TTL_MS = 24 * 60 * 60 * 1000;
const FEED_TIMEOUT_MS = 8000;            // не ждём зависший источник дольше 8 с
let buildInFlight = null;
function runBuild() {
  if (!buildInFlight) {
    buildInFlight = buildFeed().catch((e) => { console.error('buildFeed:', e.message); return null; }).finally(() => { buildInFlight = null; });
  }
  return buildInFlight; // конкурентные вызовы ждут один и тот же сбор
}

function stripTags(s) {
  return String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function parseRss(xml, source) {
  const items = [];
  const str = String(xml);
  // RSS: <item>…</item>; Atom: <entry>…</entry>
  const isAtom = /<entry[\s>]/i.test(str) && !/<item[\s>]/i.test(str);
  const blocks = str.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  for (const b of blocks.slice(0, 12)) {
    const get = (tag) => { const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? stripTags(m[1]) : ''; };
    const title = get('title');
    let link = get('link');
    if (!link) {
      // Atom: <link href="…"/>; RSS без CDATA: <link>…</link>
      const mh = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (mh) link = mh[1].trim();
      else { const m = b.match(/<link[^>]*>([\s\S]*?)<\/link>/i); link = m ? m[1].trim() : ''; }
    }
    const date = get('pubDate') || get('published') || get('updated');
    const desc = (get('description') || get('summary') || get('content')).slice(0, 240);
    // обложка из RSS: enclosure / media:content / media:thumbnail / первый <img> в описании
    let image = '';
    const mMedia = b.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i)
      || b.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i);
    if (mMedia) image = mMedia[1];
    if (!image) { const mImg = b.match(/<img[^>]+src=["']([^"']+)["']/i); if (mImg) image = mImg[1]; }
    if (title) items.push({ title, url: link, date, desc, source, image });
  }
  return items;
}
// Достаём og:image со страницы статьи (запасной вариант, если в RSS обложки нет)
async function fetchOgImage(url) {
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 DDC-NewsBot' }, signal: ctrl.signal });
    clearTimeout(tm);
    if (!r.ok) return '';
    const html = (await r.text()).slice(0, 200000);
    const m = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i)
      || html.match(/<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    return m ? m[1] : '';
  } catch { return ''; }
}
async function fetchRss(src) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
    const r = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0 DDC-NewsBot' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { console.error('RSS', src.name, 'HTTP', r.status, src.url); return []; }
    let items = parseRss(await r.text(), src.name);
    // Глобальные источники — только материалы про Казахстан
    if (src.kzOnly) items = items.filter((it) => KZ_RE.test(`${it.title} ${it.desc || ''}`));
    if (!items.length && !src.kzOnly) console.warn('RSS', src.name, '— 0 новостей (проверьте формат/URL):', src.url);
    return items;
  } catch (e) { console.error('RSS', src.name, e.message, src.url); return []; }
}
async function buildFeed() {
  const perSource = await Promise.all(FEED_SOURCES.map(fetchRss));
  // сводка по источникам — видно в логах, какой фид сколько дал
  console.log('Лента новостей: ' + FEED_SOURCES.map((s, i) => `${s.name}=${perSource[i].length}`).join(', '));
  const raw = perSource.flat();
  // дедупликация по URL и нормализованному заголовку (один сюжет в разных СМИ)
  const seen = new Set();
  const all = [];
  for (const x of raw) {
    const key = (x.url || '').split('?')[0].toLowerCase() || x.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(x);
  }
  if (!all.length) return null;
  let result = null;
  try {
    // экономия токенов: меньше элементов на входе, короткие описания
    const input = all.slice(0, 24).map((x) => ({ title: x.title, source: x.source, url: x.url, date: x.date, desc: (x.desc || '').slice(0, 140) }));
    const prompt =
`Ты — редактор новостей о цифровом Казахстане. Из списка ниже (новости с нескольких источников) отбери до 6 самых релевантных новостей про цифровую жизнь Казахстана, новые технологии, ИТ, финтех и цифровизацию госуслуг. По возможности бери новости из разных источников для разнообразия.
Для КАЖДОЙ новости дай заголовок и краткий пересказ (2-3 предложения, своими словами, не копируя дословно) на ТРЁХ языках: русском (ru), казахском (kk), английском (en). Также дай общий дайджест дня (2-3 предложения) на трёх языках.
Верни ТОЛЬКО JSON-объект вида:
{"digest":{"ru":"…","kk":"…","en":"…"},"items":[{"title":{"ru":"…","kk":"…","en":"…"},"summary":{"ru":"…","kk":"…","en":"…"},"url":"ссылка из данных","source":"источник из данных","date":"дата как есть"}]}
Новости: ${JSON.stringify(input)}`;
    const parsed = parseJsonLoose(await callGemini(prompt, 3500));
    // digest от ИИ — мультиязычный объект {ru,kk,en}; НЕ приводим к строке (иначе "[object Object]").
    if (parsed && Array.isArray(parsed.items)) result = { digest: parsed.digest || '', items: parsed.items };
    else if (Array.isArray(parsed)) result = { digest: '', items: parsed };
  } catch (e) { console.error('feed Gemini:', e.message); }
  if (!result) {
    result = { digest: '', items: all.slice(0, 6).map((x) => ({ title: x.title, summary: x.desc || '', url: x.url, source: x.source, date: x.date, image: x.image || '' })) };
  }
  // Обложки новостей: сначала из RSS (по URL), затем og:image со страницы для оставшихся.
  const imgByUrl = new Map();
  for (const x of all) { const k = (x.url || '').split('?')[0]; if (k && x.image) imgByUrl.set(k, x.image); }
  for (const it of (result.items || [])) {
    if (!it.image) it.image = imgByUrl.get((it.url || '').split('?')[0]) || '';
  }
  const need = (result.items || []).filter((it) => !it.image && it.url).slice(0, 6);
  await Promise.all(need.map(async (it) => { it.image = await fetchOgImage(it.url); }));
  await db.query(`INSERT INTO feed_cache (content) VALUES ($1)`, [JSON.stringify(result)]);
  return result;
}
async function refreshFeedIfStale(force) {
  try {
    const { rows } = await db.query(`SELECT fetched_at FROM feed_cache ORDER BY id DESC LIMIT 1`);
    const fresh = rows.length && (Date.now() - new Date(rows[0].fetched_at).getTime() < FEED_TTL_MS);
    if (fresh && !force) return;
    await runBuild();
  } catch (e) { console.error('refreshFeed:', e.message); }
}

module.exports = { runBuild, refreshFeedIfStale };
