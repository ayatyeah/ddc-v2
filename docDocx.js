/* docDocx.js — Word-версия документа портала на фирменном бланке ЦЦР (библиотека docx).
   Смысловой аналог docPdf.js, но результат — редактируемый .docx: пользователь может
   скачать и доработать в Word. Структура повторяет PDF: логотип + двуязычная шапка,
   номер/дата/город, тип документа, ЗАГОЛОВОК ПО ЦЕНТРУ, нумерованные разделы,
   блок «УТВЕРЖДЕНО» справа, подпись исполнителя. Кириллица — шрифт по умолчанию Word. */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel,
  BorderStyle, Table, TableRow, TableCell, WidthType, TabStopType, TabStopPosition, PageNumber, Footer,
} = require('docx');

const BLUE = '1D54D6', INK = '12151C', SOFT = '3C4350', MUTED = '7A818C', LINE = 'C9D2DE';
const LOGO_PNG = path.join(__dirname, 'client', 'public', 'ddc.png');

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function longDate(d) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  if (Number.isNaN(dt.getTime())) return String(d || '');
  return `«${String(dt.getDate()).padStart(2, '0')}» ${MONTHS[dt.getMonth()]} ${dt.getFullYear()} года`;
}

// Заголовок раздела вида «1. Общие положения» (но не «1.1 …» и не слишком длинный).
const isHead = (line) => /^\d+\.\s+\S/.test(line) && !/^\d+\.\d/.test(line) && line.length < 90;

function logoParagraph() {
  try {
    const png = fs.readFileSync(LOGO_PNG);
    return new Paragraph({
      children: [new ImageRun({ data: png, transformation: { width: 54, height: 54 } })],
      spacing: { after: 0 },
    });
  } catch { return null; }
}

/* Возвращает Promise<Buffer> с .docx. Параметры совместимы с buildDocPDF. */
function buildDocDOCX({ id, title, body, author, date, createdAt, docType }) {
  const when = createdAt || date || new Date();
  const year = (when instanceof Date ? when : new Date(when)).getFullYear() || new Date().getFullYear();

  // '→' в тексте — на тире (единообразно с PDF).
  let rest = String(body || '').replace(/\s*→\s*/g, ' — ');

  const children = [];

  // ── Шапка: логотип + организация (двуязычно) ───────────────────────────────
  const logo = logoParagraph();
  const headText = [
    new Paragraph({ children: [new TextRun({ text: '«ЦИФРЛЫҚ ДАМУ ОРТАЛЫҒЫ» АҚ', bold: true, size: 23, color: BLUE })], spacing: { after: 20 } }),
    new Paragraph({ children: [new TextRun({ text: 'АО «ЦЕНТР ЦИФРОВОГО РАЗВИТИЯ»', bold: true, size: 23, color: INK })], spacing: { after: 20 } }),
    new Paragraph({ children: [new TextRun({ text: 'Национальный Банк Республики Казахстан · г. Астана, пр. Мангилик Ел, 57А · тел. 1477 · info@bsbnb.kz', size: 15, color: MUTED })], spacing: { after: 0 } }),
  ];
  // Логотип и текст шапки — в одной строке через таблицу без границ.
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders(),
    rows: [new TableRow({
      children: [
        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, borders: noBorders(), children: [logo || new Paragraph('')] }),
        new TableCell({ width: { size: 88, type: WidthType.PERCENTAGE }, borders: noBorders(), children: headText }),
      ],
    })],
  }));

  // Двойная линия бланка (толстая синяя).
  children.push(new Paragraph({
    spacing: { before: 80, after: 40 },
    border: { bottom: { color: BLUE, space: 1, style: BorderStyle.SINGLE, size: 18 } },
    children: [new TextRun({ text: '', size: 2 })],
  }));
  children.push(new Paragraph({
    spacing: { after: 120 },
    border: { bottom: { color: LINE, space: 1, style: BorderStyle.SINGLE, size: 4 } },
    children: [new TextRun({ text: '', size: 2 })],
  }));

  // ── Реквизиты: номер (слева) и город (справа) на одной строке ──────────────
  children.push(new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    spacing: { after: 220 },
    children: [
      new TextRun({ text: `№ ЦЦР-ДОК-${id || '__'}/${year} от ${longDate(when)}`, size: 19, color: SOFT }),
      new TextRun({ text: '\tг. Астана', size: 19, color: SOFT }),
    ],
  }));

  // ── Блок «УТВЕРЖДЕНО …» (если тело начинается с него) — выравнивание справа ──
  if (/^\s*УТВЕРЖД/.test(rest)) {
    const parts = rest.split(/\n\s*\n/);
    const approve = parts.shift();
    rest = parts.join('\n\n');
    for (const ln of approve.trim().split('\n')) {
      children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 20 }, children: [new TextRun({ text: ln.trim(), size: 19, color: SOFT })] }));
    }
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }

  // ── Тип документа (по центру, разрядка) — если заголовок его не дублирует ──
  const dupType = docType && String(title || '').toLowerCase().startsWith(String(docType).toLowerCase());
  if (docType && !dupType) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 60 },
      children: [new TextRun({ text: spaced(String(docType).toUpperCase()), bold: true, size: 20, color: MUTED })],
    }));
  }

  // ── ЗАГОЛОВОК ДОКУМЕНТА — ПО ЦЕНТРУ ───────────────────────────────────────
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new TextRun({ text: title || 'Документ', bold: true, size: 31, color: INK })],
  }));

  // ── Тело: заголовки разделов — жирные, остальное — выключка по ширине ──────
  for (const rawLine of rest.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) { children.push(new Paragraph({ spacing: { after: 80 }, children: [] })); continue; }
    if (isHead(line)) {
      children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: line, bold: true, size: 23, color: INK })] }));
    } else {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 300 }, children: [new TextRun({ text: line, size: 22, color: '1A1E26' })] }));
    }
  }

  // ── Подпись исполнителя ───────────────────────────────────────────────────
  children.push(new Paragraph({ spacing: { before: 400, after: 20 }, children: [new TextRun({ text: `Исп.: ${author || '—'} · тел. 1477`, size: 19, color: MUTED })] }));
  children.push(new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    spacing: { after: 0 },
    children: [
      new TextRun({ text: '\t_____________________', size: 22, color: SOFT }),
    ],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.RIGHT, spacing: { after: 0 },
    children: [new TextRun({ text: `${author || ''}   (подпись)`, size: 17, color: MUTED })],
  }));

  const doc = new Document({
    creator: 'Портал сотрудника DDC',
    title: title || 'Документ',
    styles: { default: { document: { run: { font: 'Times New Roman' } } } },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 900, left: 850, right: 850 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            border: { top: { color: LINE, space: 1, style: BorderStyle.SINGLE, size: 4 } },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            spacing: { before: 60 },
            children: [
              new TextRun({ text: 'АО «Центр цифрового развития» · Документ сформирован в портале сотрудника DDC', size: 14, color: MUTED }),
              new TextRun({ children: ['\tстр. ', PageNumber.CURRENT, ' из ', PageNumber.TOTAL_PAGES], size: 14, color: MUTED }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

// Разрядка букв (аналог characterSpacing в PDF) — вставляем тонкие пробелы.
function spaced(s) { return String(s).split('').join('\u2009'); }
function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
}

function docxAvailable() {
  try { return !!Document; } catch { return false; }
}

module.exports = { buildDocDOCX, docxAvailable };
