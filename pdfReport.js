/* pdfReport.js — серверная генерация PDF-отчёта по клиенту (pdfkit).
   Кириллица: встроенный шрифт Roboto (assets/fonts) — работает и на Linux-сервере.
   Логотип: векторные пути DDC (из logo_ddc_for_pdf.svg) рисуются напрямую в PDF. */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_R = path.join(__dirname, 'assets', 'fonts', 'Roboto-Regular.ttf');
const FONT_B = path.join(__dirname, 'assets', 'fonts', 'Roboto-Medium.ttf');

// Палитра
const GREEN = '#005500', GREEN_L = '#9bbf9b', INK = '#1a2330', MUTED = '#5a6573';
const BORDER = '#d8dee6', HEAD_BG = '#f3f6f9', BOX_BG = '#f7f9fb';

// Геометрия A4
const MX = 40;                 // поля слева/справа
const PAGE_W = 595.28, CW = PAGE_W - MX * 2;

// Векторный логотип DDC (viewBox 0 0 282 282), все пути fill #005500.
const LOGO_PATHS = [
  'm 129,57.9 -6.5,3.9 -0.3,28.3 -0.2,28.3 5,4.8 c 4.2,4.2 5.5,4.9 8.2,4.6 l 3.3,-0.3 -0.2,-10.2 c -0.1,-9.9 -0.2,-10.4 -3.2,-14 -3.9,-4.7 -4,-8.1 -0.2,-11.7 2.7,-2.6 3,-3.4 3.5,-13 0.7,-11.1 -0.3,-23.7 -1.9,-24.3 -0.6,-0.2 -4,1.4 -7.5,3.6',
  'm 105.73106,72.093178 -6.000001,3.3 -0.3,12.4 -0.2,12.400002 3.100001,3.3 c 4.2,4.5 4.2,8.9 0,13.7 -2.3,2.6 -3.100001,4.6 -3.100001,7.3 0,3.3 0.800001,4.5 6.000001,9.7 3.5,3.4 6,6.8 6,8 0,1.2 -2.5,4.6 -6,8 -5.500001,5.5 -6.000001,6.3 -6.000001,10.3 0,3.4 0.7,5.3 3.000001,8.2 3.9,4.9 3.9,8.6 0,13.5 l -3.100001,3.8 0.3,12.6 0.3,12.6 6.800001,3.9 c 5.3,3 7.1,3.6 8,2.7 0.9,-0.9 1.3,-8.6 1.4,-27.3 l 0.2,-26.1 5.6,-5.8 5.5,-5.8 v -19.8 l -5.7,-5.2 -5.8,-5.2 V 98.393178 c -0.1,-13.3 -0.2,-25.4 -0.3,-27 -0.3,-3.6 -2.2,-3.5 -9.7,0.7',
  'm 127.2,161.9 -5.2,5 0.2,28.3 0.3,28.3 6,3.7 c 8.9,5.5 9.2,5.4 10,-4.8 0.4,-4.7 0.4,-12.2 0,-16.7 -0.6,-7 -1.1,-8.6 -3.6,-11.5 -3.7,-4.1 -3.7,-7.3 0,-12.5 3.4,-4.9 4.6,-11.2 3.6,-19.2 -0.6,-5.2 -0.8,-5.5 -3.4,-5.5 -1.9,0 -4.3,1.5 -7.9,4.9',
  'm 156.04235,160.48726 5.2,5 -0.2,28.3 -0.3,28.3 -6,3.7 c -8.9,5.5 -9.2,5.4 -10,-4.8 -0.4,-4.7 -0.4,-12.2 0,-16.7 0.6,-7 1.1,-8.6 3.6,-11.5 3.7,-4.1 3.7,-7.3 0,-12.5 -3.4,-4.9 -4.6,-11.2 -3.6,-19.2 0.6,-5.2 0.8,-5.5 3.4,-5.5 1.9,0 4.3,1.5 7.9,4.9',
  'm 134,143 v 8 h 16 v -16 h -16 z',
  'm 63.5,95.4 c -1.9,1.4 -2,2.8 -2.1,46 -0.1,47.6 0,49.1 4.6,49.1 h 2.5 l 0.3,-19 0.2,-19.1 -3,-3.4 c -4.1,-4.5 -4.1,-8.9 0,-13.2 l 3,-3.1 -0.2,-19.1 C 68.5,97.5 68.3,94.5 67,94.2 c -0.9,-0.1 -2.4,0.4 -3.5,1.2',
  'M 82.3,84.7 76,88.4 v 22.3 c 0,12.2 0.4,22.4 0.8,22.7 0.5,0.3 2.1,2.3 3.6,4.4 2.6,3.8 2.6,4.2 1.3,7.3 -0.8,1.9 -2.4,4.3 -3.6,5.3 -2,1.8 -2.1,2.7 -2.1,24.2 v 22.2 l 5.7,3.7 c 3.2,1.9 6.7,3.4 7.8,3.3 1.8,-0.3 2,-1.2 2.3,-9.5 0.3,-8.9 0.2,-9.2 -2.7,-12.6 -1.9,-2.2 -3.1,-4.6 -3.1,-6.4 0,-2.9 2.3,-7.1 4.7,-8.6 0.9,-0.5 1.3,-3 1.3,-7.2 V 153 l 5.6,-5.6 5.6,-5.6 -5.6,-5.7 c -5.4,-5.5 -5.6,-5.8 -5.6,-11.2 0,-4.7 -0.4,-5.9 -3,-8.7 -4,-4.4 -4,-8.3 0,-12.9 3,-3.4 3.1,-3.7 2.8,-12.6 -0.2,-7.2 -0.6,-9.2 -1.8,-9.4 -0.8,-0.2 -4.3,1.4 -7.7,3.4',
  'm 204.34631,84.670595 6.3,3.7 V 110.6706 c 0,12.20002 -0.4,22.40001 -0.8,22.70002 -0.5,0.3 -2.1,2.3 -3.6,4.4 -2.6,3.8 -2.6,4.2 -1.3,7.3 0.8,1.9 2.4,4.3 3.6,5.3 2,1.8 2.1,2.7 2.1,24.2 v 22.19999 l -5.7,3.7 c -3.2,1.9 -6.7,3.4 -7.8,3.3 -1.8,-0.3 -2,-1.19999 -2.3,-9.5 -0.3,-8.9 -0.2,-9.19999 2.7,-12.59999 1.9,-2.2 3.1,-4.6 3.1,-6.40001 0,-2.9 -2.3,-7.09999 -4.7,-8.59999 -0.9,-0.5 -1.3,-3 -1.3,-7.2 v -6.50001 l -5.6,-5.6 -5.6,-5.59999 5.6,-5.7 c 5.4,-5.5 5.6,-5.8 5.6,-11.2 0,-4.70001 0.4,-5.90001 3,-8.70002 4,-4.4 4,-8.3 0,-12.9 -3,-3.400009 -3.1,-3.700005 -2.8,-12.600005 0.2,-7.2 0.6,-9.2 1.8,-9.4 0.8,-0.2 4.3,1.4 7.7,3.4',
  'm 179.2071,72.586603 6,3.3 0.3,12.399999 0.2,12.400008 -3.1,3.3 c -4.2,4.50001 -4.2,8.90001 0,13.70001 2.3,2.6 3.1,4.6 3.1,7.3 0,3.3 -0.8,4.5 -6,9.7 -3.5,3.4 -6,6.8 -6,8 0,1.2 2.5,4.6 6,8 5.5,5.5 6,6.3 6,10.3 0,3.4 -0.7,5.3 -3,8.2 -3.9,4.9 -3.9,8.6 0,13.5 l 3.1,3.8 -0.3,12.6 -0.3,12.6 -6.8,3.9 c -5.3,3 -7.1,3.6 -8,2.7 -0.9,-0.9 -1.3,-8.6 -1.4,-27.3 l -0.2,-26.1 -5.6,-5.8 -5.5,-5.8 v -19.8 l 5.7,-5.2 5.8,-5.2 V 98.886602 c 0.1,-13.3 0.2,-25.399999 0.3,-26.999999 0.3,-3.6 2.2,-3.5 9.7,0.7',
  'm 152.91118,57.958389 6.5,3.9 0.3,28.3 0.2,28.300001 -5,4.8 c -4.2,4.2 -5.5,4.9 -8.2,4.6 l -3.3,-0.3 0.2,-10.2 c 0.1,-9.9 0.2,-10.4 3.2,-14 3.9,-4.700001 4,-8.100001 0.2,-11.700001 -2.7,-2.6 -3,-3.4 -3.5,-13 -0.7,-11.1 0.3,-23.7 1.9,-24.3 0.6,-0.2 4,1.4 7.5,3.6',
  'm 222.33716,95.962771 c 1.9,1.4 2,2.8 2.1,45.999999 0.1,47.6 0,49.1 -4.6,49.1 h -2.5 l -0.3,-19 -0.2,-19.1 3,-3.4 c 4.1,-4.5 4.1,-8.9 0,-13.2 l -3,-3.1 0.2,-19.1 c 0.3,-16.099999 0.5,-19.099999 1.8,-19.399999 0.9,-0.1 2.4,0.4 3.5,1.2',
];

// ── Словари меток ─────────────────────────────────────────────────────────────
const STATUS_LABELS = { new: 'Новый', in_progress: 'В процессе', on_hold: 'Отложен', served: 'Обслужен', rejected: 'Отказ' };
const SPEED = { fast: 'Быстро', medium: 'Средне', slow: 'Долго' };
const PAID = { yes: 'Вовремя', partial: 'С задержкой', no: 'Не оплатил' };
const CLARITY = { low: 'Низкая', medium: 'Средняя', high: 'Высокая' };

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return '—'; } };
const fmtDT = (iso) => { try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };
const dash = (v) => (v === 0 || v ? String(v) : '—');
const money = (v) => { const n = Number(v); return n ? n.toLocaleString('ru-RU') + ' ₸' : '—'; };

function drawLogo(doc, x, y, size) {
  const s = size / 282;
  doc.save();
  doc.translate(x, y).scale(s);
  doc.fillColor(GREEN);
  for (const d of LOGO_PATHS) doc.path(d).fill();
  doc.restore();
}

// Гарантировать место под блок высотой h (иначе новая страница).
function ensureSpace(doc, h) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + h > bottom) doc.addPage();
}

function section(doc, title) {
  ensureSpace(doc, 30);
  doc.moveDown(0.7);
  const y = doc.y;
  doc.font('B').fontSize(12).fillColor(GREEN).text(title, MX, y);
  doc.moveTo(MX, doc.y + 2).lineTo(MX + CW, doc.y + 2).lineWidth(1).strokeColor(GREEN_L).stroke();
  doc.moveDown(0.5);
}

// Универсальная таблица. cols: [{w, align, font}]; rows: [[cellText|{text,font,align,color,fill}]]
function table(doc, cols, rows) {
  const PAD = 6;
  for (const row of rows) {
    const cells = row.map((c, i) => (typeof c === 'string' ? { text: c } : c));
    let h = 0;
    cells.forEach((c, i) => {
      doc.font(c.font || 'R').fontSize(c.size || 10);
      h = Math.max(h, doc.heightOfString(c.text, { width: cols[i].w - PAD * 2 }));
    });
    h += PAD * 2;
    ensureSpace(doc, h);
    const y = doc.y; let x = MX;
    cells.forEach((c, i) => {
      const w = cols[i].w;
      if (c.fill) doc.rect(x, y, w, h).fill(c.fill);
      doc.font(c.font || 'R').fontSize(c.size || 10).fillColor(c.color || INK)
        .text(c.text, x + PAD, y + PAD, { width: w - PAD * 2, align: c.align || cols[i].align || 'left' });
      doc.rect(x, y, w, h).lineWidth(0.7).strokeColor(BORDER).stroke();
      x += w;
    });
    doc.y = y + h;
  }
}

function note(doc, label, text) {
  if (!text) return;
  const innerW = CW - 16;
  doc.font('B').fontSize(10); const lh = label ? doc.heightOfString(label, { width: innerW }) : 0;
  doc.font('R').fontSize(10); const th = doc.heightOfString(text, { width: innerW });
  const h = lh + th + 14;
  ensureSpace(doc, h);
  const y = doc.y;
  doc.rect(MX, y, CW, h).fill(BOX_BG);
  let ty = y + 7;
  if (label) { doc.font('B').fontSize(10).fillColor(MUTED).text(label, MX + 8, ty, { width: innerW }); ty = doc.y + 1; }
  doc.font('R').fontSize(10).fillColor(INK).text(text, MX + 8, ty, { width: innerW });
  doc.rect(MX, y, CW, h).lineWidth(0.7).strokeColor(BORDER).stroke();
  doc.y = y + h; doc.moveDown(0.3);
}

/* Сборка PDF. lead — строка лида (rating, assignee_name…),
   ev — { facts, prior_orders, notes }. Возвращает Promise<Buffer>. */
function buildReportPDF(lead, ev) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: MX, right: MX } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', FONT_R);
    doc.registerFont('B', FONT_B);

    const facts = ev && ev.facts && typeof ev.facts === 'object' ? ev.facts : {};
    const who = lead.assignee_name || lead.assignee_username || '—';

    // ── Шапка: логотип слева + заголовок + мета справа ──
    drawLogo(doc, MX, 38, 54);
    doc.font('B').fontSize(19).fillColor(GREEN).text('Отчёт по клиенту', MX + 70, 42);
    doc.font('R').fontSize(10).fillColor(MUTED).text('Центр цифрового развития (ЦЦР) — внутренний отчёт', MX + 70, doc.y + 1);
    doc.fontSize(9).fillColor(MUTED)
      .text(`Сформирован: ${fmtDate(new Date().toISOString())}`, MX, 44, { width: CW, align: 'right' })
      .text(`Клиент №${lead.id}`, MX, doc.y, { width: CW, align: 'right' });
    doc.y = 104;
    doc.moveTo(MX, doc.y).lineTo(MX + CW, doc.y).lineWidth(2).strokeColor(GREEN).stroke();
    doc.y += 6;

    const COL_KV = [{ w: 180, font: 'B' }, { w: CW - 180 }];

    // ── Данные клиента ──
    section(doc, 'Данные клиента');
    table(doc, COL_KV, [
      [{ text: 'ФИО', font: 'B', fill: HEAD_BG }, lead.full_name || '—'],
      [{ text: 'Email', font: 'B', fill: HEAD_BG }, lead.email || '—'],
      [{ text: 'Телефон', font: 'B', fill: HEAD_BG }, lead.phone || '—'],
      [{ text: 'Дата обращения', font: 'B', fill: HEAD_BG }, fmtDT(lead.created_at)],
      [{ text: 'Статус', font: 'B', fill: HEAD_BG }, STATUS_LABELS[lead.status] || lead.status],
      [{ text: 'Исполнитель', font: 'B', fill: HEAD_BG }, who],
      [{ text: 'Прошлых обращений', font: 'B', fill: HEAD_BG }, dash(ev && ev.prior_orders)],
    ]);

    // ── Что хотел клиент ──
    section(doc, 'Что хотел клиент');
    table(doc, COL_KV, [[{ text: 'Тема обращения', font: 'B', fill: HEAD_BG }, lead.subject || '—']]);
    note(doc, lead.message ? 'Сообщение клиента:' : '', lead.message || '');

    // ── Сводка оценок ──
    section(doc, 'Сводка оценок');
    const COL_R = [{ w: 175, font: 'B' }, { w: 150, align: 'left' }, { w: CW - 325 }];
    table(doc, COL_R, [
      [{ text: 'Источник', font: 'B', fill: HEAD_BG }, { text: 'Оценка', font: 'B', fill: HEAD_BG }, { text: 'Комментарий', font: 'B', fill: HEAD_BG }],
      ['Оценка клиента (с сайта)', { text: lead.rating ? `${lead.rating} / 5` : '—', color: GREEN, font: 'B' }, '—'],
      ['Оценка сотрудника', { text: facts.repeat_prob != null ? `повтор ${facts.repeat_prob}/10` : '—', color: GREEN, font: 'B' },
        [facts.conflict ? 'был конфликт' : 'без конфликтов', facts.ts_clarity ? `ТЗ: ${CLARITY[facts.ts_clarity]}` : ''].filter(Boolean).join('; ') || '—'],
    ]);

    // ── Как выполнена работа ──
    section(doc, 'Как выполнена работа');
    table(doc, COL_KV, [
      [{ text: 'Скорость ответа клиента', font: 'B', fill: HEAD_BG }, SPEED[facts.response_speed] || '—'],
      [{ text: 'Оплата', font: 'B', fill: HEAD_BG }, PAID[facts.paid_on_time] || '—'],
      [{ text: 'Чёткость ТЗ', font: 'B', fill: HEAD_BG }, CLARITY[facts.ts_clarity] || '—'],
      [{ text: 'Количество правок', font: 'B', fill: HEAD_BG }, dash(facts.revisions)],
      [{ text: 'Был конфликт', font: 'B', fill: HEAD_BG }, facts.conflict ? 'Да' : 'Нет'],
      [{ text: 'Стоимость проекта', font: 'B', fill: HEAD_BG }, money(facts.cost)],
      [{ text: 'Срок выполнения', font: 'B', fill: HEAD_BG }, facts.duration_days ? `${facts.duration_days} дн.` : '—'],
      [{ text: 'Сообщений / созвонов', font: 'B', fill: HEAD_BG }, `${dash(facts.messages)} / ${dash(facts.calls)}`],
      [{ text: 'Средний ответ клиента', font: 'B', fill: HEAD_BG }, facts.avg_response || '—'],
      [{ text: 'Вероятность повтора (сотрудник)', font: 'B', fill: HEAD_BG }, facts.repeat_prob != null ? `${facts.repeat_prob}/10` : '—'],
    ]);
    note(doc, 'Комментарий сотрудника:', facts.comment || (ev && ev.notes) || '');
    note(doc, 'Комментарий менеджера:', lead.admin_comment || '');

    // ── Подвал ──
    doc.moveDown(1.2);
    ensureSpace(doc, 24);
    doc.moveTo(MX, doc.y).lineTo(MX + CW, doc.y).lineWidth(0.7).strokeColor(BORDER).stroke();
    doc.moveDown(0.4);
    doc.font('R').fontSize(8.5).fillColor('#97a0af')
      .text(`Документ сформирован автоматически в админ-панели ЦЦР · ${fmtDT(new Date().toISOString())}`, MX, doc.y, { width: CW, align: 'center' });

    doc.end();
  });
}

// Доступность шрифтов проверяем один раз при старте сервера (понятная ошибка вместо падения в рантайме).
function fontsAvailable() {
  return fs.existsSync(FONT_R) && fs.existsSync(FONT_B);
}

module.exports = { buildReportPDF, fontsAvailable };
