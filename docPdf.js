/* docPdf.js — PDF документа портала на фирменном бланке ЦЦР (pdfkit).
   Выглядит как настоящий документ: логотип и двуязычная шапка организации,
   номер/дата/город, тип документа, заголовок, нумерованные разделы (жирные
   заголовки распознаются по «1. …»), блок «УТВЕРЖДЕНО» справа, подпись
   исполнителя и нумерация страниц. Кириллица: Roboto из assets/fonts. */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_R = path.join(__dirname, 'assets', 'fonts', 'Roboto-Regular.ttf');
const FONT_B = path.join(__dirname, 'assets', 'fonts', 'Roboto-Medium.ttf');

const BLUE = '#1d54d6', INK = '#12151c', SOFT = '#3c4350', MUTED = '#7a818c', LINE = '#c9d2de';
const L = 60, PAGE_W = 595.28, R = PAGE_W - 60, W = R - L;

function docFontsAvailable() {
  try { return fs.existsSync(FONT_R) && fs.existsSync(FONT_B); } catch { return false; }
}

// Векторный логотип DDC из svg (пути fill, viewBox 0 0 282 282)
let LOGO_PATHS = null;
function logoPaths() {
  if (LOGO_PATHS) return LOGO_PATHS;
  try {
    const svg = fs.readFileSync(path.join(__dirname, 'client', 'public', 'logo_ddc_for_pdf.svg'), 'utf8');
    LOGO_PATHS = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  } catch { LOGO_PATHS = []; }
  return LOGO_PATHS;
}
function drawLogo(doc, x, y, size, color) {
  const paths = logoPaths();
  if (!paths.length) return;
  const s = size / 282;
  doc.save().translate(x, y).scale(s).fillColor(color);
  for (const d of paths) doc.path(d).fill();
  doc.restore();
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function longDate(d) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  if (Number.isNaN(dt.getTime())) return String(d || '');
  return `«${String(dt.getDate()).padStart(2, '0')}» ${MONTHS[dt.getMonth()]} ${dt.getFullYear()} года`;
}

/* Возвращает Promise<Buffer>.
   Параметры: { id, title, body, author, createdAt, docType } (совместимо со старым { date }). */
function buildDocPDF({ id, title, body, author, date, createdAt, docType }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 52, bottom: 70, left: L, right: L }, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.registerFont('r', FONT_R);
      doc.registerFont('b', FONT_B);

      /* ── Шапка-бланк ─────────────────────────────────────────────── */
      drawLogo(doc, L, 46, 54, BLUE);
      const hx = L + 70;
      doc.font('b').fontSize(11.5).fillColor(BLUE)
        .text('«ЦИФРЛЫҚ ДАМУ ОРТАЛЫҒЫ» АҚ', hx, 50, { width: R - hx, characterSpacing: 0.4 });
      doc.font('b').fontSize(11.5).fillColor(INK)
        .text('АО «ЦЕНТР ЦИФРОВОГО РАЗВИТИЯ»', hx, doc.y + 2, { width: R - hx, characterSpacing: 0.4 });
      doc.font('r').fontSize(8.5).fillColor(MUTED)
        .text('Национальный Банк Республики Казахстан · г. Астана, пр. Мангилик Ел, 57А · тел. 1477 · info@bsbnb.kz', hx, doc.y + 4, { width: R - hx });
      // Двойная линия бланка: толстая + тонкая
      const lineY = Math.max(doc.y + 10, 112);
      doc.moveTo(L, lineY).lineTo(R, lineY).lineWidth(2).strokeColor(BLUE).stroke();
      doc.moveTo(L, lineY + 3).lineTo(R, lineY + 3).lineWidth(0.7).strokeColor(LINE).stroke();

      /* ── Реквизиты: номер, дата, город ───────────────────────────── */
      const when = createdAt || date || new Date();
      const year = (when instanceof Date ? when : new Date(when)).getFullYear() || new Date().getFullYear();
      doc.font('r').fontSize(9.5).fillColor(SOFT);
      doc.text(`№ ЦЦР-ДОК-${id || '__'}/${year} от ${longDate(when)}`, L, lineY + 14, { continued: false });
      doc.font('r').fontSize(9.5).fillColor(SOFT).text('г. Астана', L, lineY + 14, { width: W, align: 'right' });
      doc.y = lineY + 34;

      /* ── Блок «УТВЕРЖДЕНО …» (если тело начинается с него) — справа ── */
      // '→' нет в глифах Roboto (рендерится пустым квадратом) — заменяем на тире
      let rest = String(body || '').replace(/\s*→\s*/g, ' — ');
      if (/^\s*УТВЕРЖД/.test(rest)) {
        const parts = rest.split(/\n\s*\n/);
        const approve = parts.shift();
        rest = parts.join('\n\n');
        doc.font('r').fontSize(9.5).fillColor(SOFT)
          .text(approve.trim(), L + W * 0.45, doc.y, { width: W * 0.55, align: 'right', lineGap: 1.5 });
        doc.moveDown(1.2);
        doc.x = L;
      }

      /* ── Тип и заголовок (тип не дублируем, если заголовок с него начинается) ── */
      const dupType = docType && String(title || '').toLowerCase().startsWith(String(docType).toLowerCase());
      if (docType && !dupType) {
        doc.font('b').fontSize(10).fillColor(MUTED)
          .text(String(docType).toUpperCase(), L, doc.y, { width: W, align: 'center', characterSpacing: 2 });
        doc.moveDown(0.3);
      }
      doc.font('b').fontSize(15.5).fillColor(INK)
        .text(title || 'Документ', L, doc.y, { width: W, align: 'center', lineGap: 2 });
      doc.moveDown(1.1);

      /* ── Тело: заголовки разделов («1. Общие положения») — жирные ── */
      const isHead = (line) => /^\d+\.\s+\S/.test(line) && !/^\d+\.\d/.test(line) && line.length < 90;
      for (const rawLine of rest.split('\n')) {
        const line = rawLine.trimEnd();
        if (doc.y > doc.page.height - 110) doc.addPage();
        if (!line.trim()) { doc.moveDown(0.5); continue; }
        if (isHead(line)) {
          doc.moveDown(0.35);
          doc.font('b').fontSize(11.5).fillColor(INK).text(line, L, doc.y, { width: W, lineGap: 3 });
          doc.moveDown(0.12);
        } else {
          doc.font('r').fontSize(11).fillColor('#1a1e26').text(line, L, doc.y, { width: W, align: 'justify', lineGap: 3.4 });
        }
      }

      /* ── Подпись ─────────────────────────────────────────────────── */
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.moveDown(2);
      const sy = doc.y;
      doc.font('r').fontSize(9.5).fillColor(MUTED).text(`Исп.: ${author || '—'} · тел. 1477`, L, sy + 14);
      const sigX = L + W * 0.5;
      doc.moveTo(sigX, sy + 22).lineTo(sigX + 130, sy + 22).lineWidth(0.8).strokeColor(SOFT).stroke();
      doc.font('r').fontSize(8).fillColor(MUTED).text('(подпись)', sigX, sy + 26, { width: 130, align: 'center' });
      doc.font('b').fontSize(10.5).fillColor(INK).text(author || '', sigX + 140, sy + 14, { width: R - sigX - 140 });

      /* ── Футер на каждой странице: линия + реквизит + номер страницы ── */
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // Пишем НИЖЕ нижнего поля: временно обнуляем margin, иначе pdfkit
        // сочтёт это переполнением и молча добавит новую (пустую) страницу.
        const savedBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const fy = doc.page.height - 46;
        doc.moveTo(L, fy).lineTo(R, fy).lineWidth(0.6).strokeColor(LINE).stroke();
        doc.font('r').fontSize(8).fillColor(MUTED)
          .text('АО «Центр цифрового развития» · Документ сформирован в портале сотрудника DDC', L, fy + 7, { width: W * 0.8, lineBreak: false });
        doc.text(`стр. ${i - range.start + 1} из ${range.count}`, L, fy + 7, { width: W, align: 'right', lineBreak: false });
        doc.page.margins.bottom = savedBottom;
      }

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildDocPDF, docFontsAvailable };
