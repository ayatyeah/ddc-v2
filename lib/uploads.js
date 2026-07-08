// lib/uploads.js — безопасная загрузка файлов (base64 в JSON, без сторонних зависимостей).
// Защита: белый список расширений по типу, лимит размера, проверка СИГНАТУРЫ (magic bytes),
// случайное имя, хранение вне web-root, отдача только через /api/files с nosniff.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { UPLOAD_DIR } = require('./config');
const { httpErr } = require('./util');

try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { console.error('mkdir uploads:', e.message); }

const FILE_RULES = {
  cv:   { exts: ['pdf', 'doc', 'docx'], max: 5 * 1024 * 1024 },
  chat: { exts: ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt'], max: 6 * 1024 * 1024 },
};
const MIME = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain',
};
// Сигнатура файла должна соответствовать расширению (иначе .exe под видом .pdf и т.п.)
function signatureOk(ext, b) {
  switch (ext) {
    case 'pdf': return b.slice(0, 5).toString('latin1') === '%PDF-';
    case 'png': return b.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
    case 'jpg': case 'jpeg': return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
    case 'gif': return b.slice(0, 4).toString('latin1') === 'GIF8';
    case 'webp': return b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP';
    case 'docx': return b[0] === 0x50 && b[1] === 0x4B && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07); // zip (OOXML)
    case 'doc': return b.slice(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';                                // OLE2
    case 'txt': return !b.slice(0, 8192).includes(0);                                                        // без нулевых байт
    default: return false;
  }
}

// Принимает { name, data(base64|dataURL) }, валидирует, сохраняет, пишет строку в files.
async function saveUpload(file, kind, uploaderId) {
  const rule = FILE_RULES[kind];
  if (!rule) throw httpErr(400, 'Неизвестный тип загрузки');
  if (!file || typeof file.data !== 'string' || !file.name) throw httpErr(400, 'Файл не передан');
  const orig = String(file.name).slice(0, 200);
  const ext = (orig.split('.').pop() || '').toLowerCase();
  if (!rule.exts.includes(ext)) throw httpErr(400, `Недопустимый тип файла (.${ext}). Разрешено: ${rule.exts.join(', ')}`);
  const b64 = file.data.includes(',') ? file.data.slice(file.data.indexOf(',') + 1) : file.data;
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch { throw httpErr(400, 'Повреждённые данные файла'); }
  if (!buf.length) throw httpErr(400, 'Пустой файл');
  if (buf.length > rule.max) throw httpErr(400, `Файл больше ${Math.round(rule.max / 1024 / 1024)} МБ`);
  if (!signatureOk(ext, buf)) throw httpErr(400, 'Содержимое файла не соответствует расширению (возможно, файл повреждён или подменён)');
  const stored = crypto.randomBytes(16).toString('hex') + '.' + ext + '.bin';   // .bin — не исполняется/не отдаётся статикой
  await fs.promises.writeFile(path.join(UPLOAD_DIR, stored), buf, { mode: 0o600 });
  const { rows } = await db.query(
    `INSERT INTO files (stored, orig, mime, size, kind, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, orig, mime, size`,
    [stored, orig, MIME[ext] || 'application/octet-stream', buf.length, kind, uploaderId || null]);
  return rows[0];
}

// Извлечение текста из CV (PDF/DOCX) — чтобы ИИ анализировал само резюме, а не только письмо.
// Библиотеки грузим лениво (только при анализе). Возвращаем обрезанный текст или '' при ошибке.
async function extractCvFileText(fileRow) {
  if (!fileRow) return '';
  const ext = (String(fileRow.orig || '').split('.').pop() || '').toLowerCase();
  const p = path.join(UPLOAD_DIR, fileRow.stored);
  try {
    if (!fs.existsSync(p)) return '';
    if (ext === 'pdf') {
      const pdf = require('pdf-parse');
      const data = await pdf(await fs.promises.readFile(p));
      return (data.text || '').replace(/\s+\n/g, '\n').trim().slice(0, 7000);
    }
    if (ext === 'docx') {
      const mammoth = require('mammoth');
      const r = await mammoth.extractRawText({ path: p });
      return (r.value || '').trim().slice(0, 7000);
    }
  } catch (e) { console.error('extractCvFileText:', e.message); }
  return '';   // .doc и прочее — не распознаём
}

module.exports = { saveUpload, extractCvFileText, UPLOAD_DIR };
