// lib/sse.js — realtime через Server-Sent Events: живые уведомления/сообщения/присутствие
// без поллинга. Одна карта соединений на процесс; доставка адресная или всем.
const db = require('../db');

const sseClients = new Map();   // userId -> Set<res>

function sseSend(res, event, data) { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* соединение закрыто */ } }

function broadcast(userIds, event, data) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  for (const id of ids) { const set = sseClients.get(Number(id)); if (set) for (const res of set) sseSend(res, event, data); }
}
function broadcastAll(event, data) { for (const set of sseClients.values()) for (const res of set) sseSend(res, event, data); }
const onlineUserIds = () => [...sseClients.keys()];
const onlineCount = () => sseClients.size;

// Обработчик GET /api/portal/stream (монтируется в server.js под auth).
function streamHandler(req, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const uid = Number(req.admin.id);
  if (!sseClients.has(uid)) sseClients.set(uid, new Set());
  const set = sseClients.get(uid);
  const wasOffline = set.size === 0;
  set.add(res);
  sseSend(res, 'hello', { ok: true, online: onlineUserIds() });
  if (wasOffline) broadcastAll('presence', { userId: uid, online: true });
  const hb = setInterval(() => sseSend(res, 'ping', { t: Date.now() }), 25000);
  req.on('close', () => {
    clearInterval(hb);
    const s = sseClients.get(uid);
    if (s) { s.delete(res); if (!s.size) { sseClients.delete(uid); broadcastAll('presence', { userId: uid, online: false }); } }
  });
}

// Создать in-app уведомление пользователю (доставляется мгновенно по SSE + поллингом как фолбэк).
// userId может быть null (напр. суперадмин без записи в users) — тогда тихо пропускаем.
async function notify(userId, type, leadId, title, body) {
  if (!userId) return;
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, lead_id, title, body) VALUES ($1,$2,$3,$4,$5)`,
      [userId, type, leadId == null ? null : Number(leadId), (title || '').slice(0, 200), (body || '').slice(0, 500)]
    );
    broadcast(userId, 'notification', { type, title: (title || '').slice(0, 200), body: (body || '').slice(0, 500) });
  } catch (e) { console.error('notify:', e.message); }
}

module.exports = { streamHandler, broadcast, broadcastAll, notify, onlineUserIds, onlineCount };
