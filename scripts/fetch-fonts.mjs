/* Скачивает шрифты Google Fonts локально (self-host): убирает рендер-блокирующий внешний
   запрос, ускоряет FCP/LCP, работает офлайн (PWA). Кладёт woff2 в client/public/fonts/ и
   генерит client/public/fonts.css с локальными @font-face (display: swap).
   Запуск: node scripts/fetch-fonts.mjs  */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'client', 'public', 'fonts');
const CSS_OUT = join(__dirname, '..', 'client', 'public', 'fonts.css');

// Семейства и веса (обрезаны до используемых — меньше файлов).
const FAMILIES = [
  'Space+Grotesk:wght@500;600;700',
  'Inter:wght@400;600;700',
  'JetBrains+Mono:wght@400',
];
// Оставляем только эти подмножества (латиница + кириллица + расширенная кириллица для казахского).
const KEEP = new Set(['latin', 'cyrillic', 'cyrillic-ext']);
// UA современного Chrome — чтобы Google отдал woff2 (а не ttf).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const url = `https://fonts.googleapis.com/css2?family=${FAMILIES.join('&family=')}&display=swap`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();

  // Каждый @font-face предваряется комментарием с именем подмножества: /* cyrillic */
  const parts = css.split(/\/\*\s*([a-z-]+)\s*\*\//i);
  let out = '/* Локальные шрифты (self-host). Сгенерировано scripts/fetch-fonts.mjs */\n';
  let kept = 0, skipped = 0;
  for (let i = 1; i < parts.length; i += 2) {
    const subset = parts[i].trim();
    const block = parts[i + 1] || '';
    const face = block.match(/@font-face\s*{[^}]*}/i);
    if (!face) continue;
    if (!KEEP.has(subset)) { skipped++; continue; }
    let ff = face[0];
    const family = (ff.match(/font-family:\s*'([^']+)'/) || [])[1] || 'font';
    const weight = (ff.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
    const src = (ff.match(/src:\s*url\(([^)]+)\)/) || [])[1];
    if (!src) continue;
    const fname = `${slug(family)}-${weight}-${subset}.woff2`;
    const buf = Buffer.from(await (await fetch(src, { headers: { 'User-Agent': UA } })).arrayBuffer());
    await writeFile(join(OUT_DIR, fname), buf);
    ff = ff.replace(/src:\s*url\([^)]+\)/, `src: url(/fonts/${fname})`);
    out += ff + '\n';
    kept++;
    process.stdout.write(`+ ${fname} (${(buf.length / 1024).toFixed(1)}kb)\n`);
  }
  await writeFile(CSS_OUT, out);
  console.log(`\n✓ Скачано ${kept} файлов, пропущено ${skipped} подмножеств. CSS: client/public/fonts.css`);
}
run().catch((e) => { console.error('Ошибка:', e); process.exit(1); });
