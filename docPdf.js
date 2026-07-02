/* docPdf.js — генерация PDF из текста документа (pdfkit).
   Кириллица: шрифты Roboto из assets/fonts (как в pdfReport.js). */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_R = path.join(__dirname, 'assets', 'fonts', 'Roboto-Regular.ttf');
const FONT_B = path.join(__dirname, 'assets', 'fonts', 'Roboto-Medium.ttf');

function docFontsAvailable() {
  try { return fs.existsSync(FONT_R) && fs.existsSync(FONT_B); } catch { return false; }
}

// Возвращает Promise<Buffer> с готовым PDF.
function buildDocPDF({ title, body, author, date }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 64, left: 64, right: 64 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.registerFont('r', FONT_R);
      doc.registerFont('b', FONT_B);

      const L = 64, R = 531;
      // Шапка
      doc.font('b').fontSize(11).fillColor('#1d54d6').text('ЦЕНТР ЦИФРОВОГО РАЗВИТИЯ', L, 56, { characterSpacing: 0.5 });
      doc.font('r').fontSize(9).fillColor('#8a8f99').text('Национальный Банк Республики Казахстан', { characterSpacing: 0.3 });
      doc.moveDown(0.6);
      doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(1).strokeColor('#e2e6ec').stroke();
      doc.moveDown(1.4);

      // Заголовок документа
      doc.font('b').fontSize(17).fillColor('#12151c').text(title || 'Документ', { align: 'left', lineGap: 2 });
      doc.moveDown(1.1);

      // Тело — сохраняем переводы строк из текста
      doc.font('r').fontSize(11.5).fillColor('#1a1e26').text(body || '', { align: 'left', lineGap: 5 });

      // Подпись/дата
      doc.moveDown(2.2);
      doc.font('r').fontSize(10).fillColor('#5a6270');
      if (author) doc.text(`Составил: ${author}`, { align: 'left' });
      if (date) doc.text(`Дата: ${date}`, { align: 'left' });

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildDocPDF, docFontsAvailable };
