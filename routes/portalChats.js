// routes/portalChats.js — мессенджер портала: командный чат, личные сообщения,
// групповые чаты, правка/удаление сообщений и контролируемая отдача вложений.
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { auth } = require('../lib/auth');
const { clip } = require('../lib/util');
const { broadcast, broadcastAll, notify } = require('../lib/sse');
const { saveUpload, UPLOAD_DIR } = require('../lib/uploads');

const router = express.Router();

// Поля сообщения, отдаваемые клиенту (тело удалённых — пустое)
const MSG_COLS = `id, author_id, author_name, recipient_id, chat_id,
  CASE WHEN deleted THEN '' ELSE body END AS body, created_at, edited_at, deleted, file_id`;
// Чтение сообщений с присоединённым вложением (имя/тип/размер файла)
const MSG_READ = `SELECT m.id, m.author_id, m.author_name, m.recipient_id, m.chat_id,
  CASE WHEN m.deleted THEN '' ELSE m.body END AS body, m.created_at, m.edited_at, m.deleted,
  m.file_id, f.orig AS file_name, f.mime AS file_mime, f.size AS file_size
  FROM messages m LEFT JOIN files f ON f.id = m.file_id`;

// ── Командный чат (общий канал: recipient_id IS NULL И chat_id IS NULL) ──
router.get('/api/portal/chat', auth, async (req, res) => {
  try {
    // Полное чтение последних сообщений (не инкремент) — чтобы правки/удаления доходили при поллинге.
    const { rows } = await db.query(
      `${MSG_READ} WHERE m.recipient_id IS NULL AND m.chat_id IS NULL ORDER BY m.id DESC LIMIT 80`);
    res.json(rows.reverse());
  } catch (e) { console.error('GET /api/portal/chat:', e.message); res.status(500).json({ error: 'Ошибка чтения чата' }); }
});
router.post('/api/portal/chat', auth, async (req, res) => {
  const body = clip(req.body?.body, 2000);
  if (!body && !req.body?.file) return res.status(400).json({ error: 'Пустое сообщение' });
  try {
    const saved = req.body?.file ? await saveUpload(req.body.file, 'chat', req.admin.id) : null;
    const { rows } = await db.query(
      `INSERT INTO messages (author_id, author_name, recipient_id, body, file_id) VALUES ($1, $2, NULL, $3, $4)
       RETURNING ${MSG_COLS}`,
      [req.admin.id, req.admin.u, body, saved?.id || null]);
    broadcastAll('chat', { scope: 'team', from: req.admin.id });   // живой общий канал
    res.status(201).json({ ...rows[0], file_name: saved?.orig, file_mime: saved?.mime, file_size: saved?.size });
  } catch (e) { console.error('POST /api/portal/chat:', e.message); res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось отправить' }); }
});

// ── Личные сообщения (диалог с конкретным сотрудником) ──
router.get('/api/portal/dm/:userId(\\d+)', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Личные сообщения доступны сотрудникам с учётной записью' });
  const other = Number(req.params.userId);
  try {
    const { rows } = await db.query(
      `${MSG_READ}
        WHERE m.chat_id IS NULL AND ((m.author_id = $1 AND m.recipient_id = $2) OR (m.author_id = $2 AND m.recipient_id = $1))
        ORDER BY m.id ASC LIMIT 300`, [me, other]);
    res.json(rows);
  } catch (e) { console.error('GET /api/portal/dm:', e.message); res.status(500).json({ error: 'Ошибка чтения диалога' }); }
});
router.post('/api/portal/dm', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Личные сообщения доступны сотрудникам с учётной записью' });
  const to = Number(req.body?.to);
  const body = clip(req.body?.body, 2000);
  if (!Number.isInteger(to) || (!body && !req.body?.file)) return res.status(400).json({ error: 'Укажите адресата и текст' });
  try {
    const saved = req.body?.file ? await saveUpload(req.body.file, 'chat', me) : null;
    const { rows } = await db.query(
      `INSERT INTO messages (author_id, author_name, recipient_id, body, file_id) VALUES ($1, $2, $3, $4, $5)
       RETURNING ${MSG_COLS}`,
      [me, req.admin.u, to, body, saved?.id || null]);
    if (to !== me) await notify(to, 'dm', null, 'Личное сообщение', `${req.admin.u}: ${(body || 'файл').slice(0, 80)}`);
    broadcast([to, me], 'chat', { scope: 'dm', from: me, to });   // живой диалог у обоих
    res.status(201).json({ ...rows[0], file_name: saved?.orig, file_mime: saved?.mime, file_size: saved?.size });
  } catch (e) { console.error('POST /api/portal/dm:', e.message); res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось отправить' }); }
});

// ── Групповые чаты команд ──
async function isChatMember(chatId, userId) {
  if (!userId) return false;
  const { rows } = await db.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, userId]);
  return rows.length > 0;
}

// Список моих групповых чатов (где я состою)
router.get('/api/portal/chats', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.json([]);
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.created_by,
              (SELECT count(*)::int FROM chat_members m WHERE m.chat_id = c.id) AS members,
              (SELECT max(id) FROM messages msg WHERE msg.chat_id = c.id) AS last_msg_id
         FROM chats c JOIN chat_members cm ON cm.chat_id = c.id
        WHERE cm.user_id = $1 ORDER BY last_msg_id DESC NULLS LAST, c.id DESC`, [me]);
    res.json(rows);
  } catch (e) { console.error('GET /api/portal/chats:', e.message); res.status(500).json({ error: 'Ошибка чтения чатов' }); }
});

// Создать групповой чат: {name, member_ids:[]}
router.post('/api/portal/chats', auth, async (req, res) => {
  const me = req.admin.id;
  if (!me) return res.status(403).json({ error: 'Создавать чаты могут сотрудники с учётной записью' });
  const name = clip(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: 'Укажите название чата' });
  const ids = Array.isArray(req.body?.member_ids) ? req.body.member_ids.map(Number).filter(Number.isInteger) : [];
  try {
    const { rows } = await db.query(`INSERT INTO chats (name, created_by) VALUES ($1, $2) RETURNING id, name, created_by`, [name, me]);
    const chatId = rows[0].id;
    const members = Array.from(new Set([me, ...ids]));                    // создатель всегда участник
    for (const uid of members) {
      await db.query(`INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [chatId, uid]);
      if (uid !== me) await notify(uid, 'chat', null, 'Новый чат', `${req.admin.u} добавил вас в «${name}»`);
    }
    res.status(201).json({ ...rows[0], members: members.length });
  } catch (e) { console.error('POST /api/portal/chats:', e.message); res.status(500).json({ error: 'Не удалось создать чат' }); }
});

// Сообщения группового чата (только участникам)
router.get('/api/portal/chats/:id(\\d+)/messages', auth, async (req, res) => {
  const me = req.admin.id, chatId = Number(req.params.id);
  if (!(await isChatMember(chatId, me))) return res.status(403).json({ error: 'Вы не участник этого чата' });
  try {
    const { rows } = await db.query(
      `${MSG_READ} WHERE m.chat_id = $1 ORDER BY m.id DESC LIMIT 100`, [chatId]);
    res.json(rows.reverse());
  } catch (e) { console.error('GET /api/portal/chats/messages:', e.message); res.status(500).json({ error: 'Ошибка чтения чата' }); }
});
router.post('/api/portal/chats/:id(\\d+)/messages', auth, async (req, res) => {
  const me = req.admin.id, chatId = Number(req.params.id);
  const body = clip(req.body?.body, 2000);
  if (!body && !req.body?.file) return res.status(400).json({ error: 'Пустое сообщение' });
  if (!(await isChatMember(chatId, me))) return res.status(403).json({ error: 'Вы не участник этого чата' });
  try {
    const saved = req.body?.file ? await saveUpload(req.body.file, 'chat', me) : null;
    const { rows } = await db.query(
      `INSERT INTO messages (author_id, author_name, chat_id, body, file_id) VALUES ($1, $2, $3, $4, $5) RETURNING ${MSG_COLS}`,
      [me, req.admin.u, chatId, body, saved?.id || null]);
    // уведомляем остальных участников
    const { rows: mem } = await db.query(`SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id <> $2`, [chatId, me]);
    const { rows: ch } = await db.query(`SELECT name FROM chats WHERE id = $1`, [chatId]);
    for (const m of mem) await notify(m.user_id, 'chat', null, ch[0]?.name || 'Чат', `${req.admin.u}: ${(body || 'файл').slice(0, 80)}`);
    broadcast([me, ...mem.map((m) => m.user_id)], 'chat', { scope: 'chat', chatId });   // живой групповой чат
    res.status(201).json({ ...rows[0], file_name: saved?.orig, file_mime: saved?.mime, file_size: saved?.size });
  } catch (e) { console.error('POST /api/portal/chats/messages:', e.message); res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось отправить' }); }
});

// ── Правка / удаление своего сообщения (мессенджер-фичи) ──
router.patch('/api/portal/messages/:id(\\d+)', auth, async (req, res) => {
  const me = req.admin.id, id = Number(req.params.id);
  const body = clip(req.body?.body, 2000);
  if (!body) return res.status(400).json({ error: 'Пустой текст' });
  try {
    const { rows } = await db.query(
      `UPDATE messages SET body = $1, edited_at = now() WHERE id = $2 AND author_id = $3 AND deleted = FALSE
       RETURNING ${MSG_COLS}`, [body, id, me]);
    if (!rows.length) return res.status(404).json({ error: 'Сообщение не найдено или нет прав' });
    res.json(rows[0]);
  } catch (e) { console.error('PATCH /api/portal/messages:', e.message); res.status(500).json({ error: 'Не удалось изменить' }); }
});
router.delete('/api/portal/messages/:id(\\d+)', auth, async (req, res) => {
  const me = req.admin.id, id = Number(req.params.id);
  try {
    const { rows } = await db.query(
      `UPDATE messages SET deleted = TRUE, body = '' WHERE id = $1 AND author_id = $2 RETURNING ${MSG_COLS}`, [id, me]);
    if (!rows.length) return res.status(404).json({ error: 'Сообщение не найдено или нет прав' });
    res.json(rows[0]);
  } catch (e) { console.error('DELETE /api/portal/messages:', e.message); res.status(500).json({ error: 'Не удалось удалить' }); }
});

// Есть ли у пользователя доступ к вложению чата: файл виден лишь тому, кто видит сообщение,
// где он выложен. Общий канал — всем сотрудникам; ЛС — двум собеседникам; групповой чат —
// участникам. Иначе перебором id можно было выкачать вложения чужих переписок (IDOR).
async function canSeeChatFile(fileId, me) {
  const { rows } = await db.query(
    `SELECT recipient_id, author_id, chat_id FROM messages WHERE file_id = $1 ORDER BY id ASC LIMIT 1`, [fileId]);
  if (!rows.length) return false;                                    // файл не привязан к сообщению — не отдаём
  const m = rows[0];
  if (m.chat_id != null) return isChatMember(m.chat_id, me);         // групповой чат
  if (m.recipient_id == null) return true;                           // общий командный канал
  return me != null && (m.author_id === me || m.recipient_id === me); // личный диалог
}

// ── Скачивание/просмотр загруженного файла (контролируемая отдача) ──
router.get('/api/files/:id(\\d+)', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await db.query(`SELECT * FROM files WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Файл не найден' });
    const f = rows[0];
    // CV откликов — только рекрутерам (admin/manager).
    if (f.kind === 'cv') {
      if (!['admin', 'manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Доступ только для рекрутеров' });
    } else {
      // Вложения чата — только участнику переписки, где файл выложен.
      if (!(await canSeeChatFile(id, req.admin.id))) return res.status(403).json({ error: 'Нет доступа к файлу' });
    }
    const p = path.join(UPLOAD_DIR, f.stored);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Файл отсутствует на диске' });
    const inline = /^image\//.test(f.mime);                       // картинки показываем, остальное — скачиваем
    const safe = String(f.orig || 'file').replace(/[\r\n"]+/g, '_');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');           // запрет MIME-sniffing
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(safe)}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(p).pipe(res);
  } catch (e) { console.error('GET /api/files:', e.message); res.status(500).json({ error: 'Ошибка чтения файла' }); }
});

module.exports = router;
