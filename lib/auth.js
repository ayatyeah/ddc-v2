// lib/auth.js — авторизация и безопасность: JWT-middleware, роли, TOTP (2FA), аудит.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { SECRET } = require('./config');

// Присутствие «онлайн»: обновляем users.last_seen не чаще раза в 45с на пользователя
// (лёгкий апдейт), чтобы Mission Control видел, кто сейчас в системе.
const _presence = new Map();
function touchPresence(id) {
  if (!id) return;
  const now = Date.now();
  if (now - (_presence.get(id) || 0) < 45000) return;
  _presence.set(id, now);
  db.query(`UPDATE users SET last_seen = now() WHERE id = $1`, [id]).catch(() => {});
}

// Кеш состояния сессии (active + token_version), TTL 30с. JWT stateless, поэтому:
//  • деактивированный (уволенный) сотрудник иначе работал бы до истечения 8-часового токена;
//  • ревокация: в токене лежит tv (token_version). При logout / смене пароля / деактивации
//    инкрементируем users.token_version — все ранее выданные токены (со старым tv) перестают
//    приниматься. Так «выход» и смена пароля реально убивают живые/украденные сессии.
// Перечитываем не чаще раза в 30с на пользователя; при изменениях кеш сбрасывается сразу.
const _sessCache = new Map();   // id -> { active, tv, ts }
async function sessionState(id) {
  const c = _sessCache.get(id);
  if (c && Date.now() - c.ts < 30000) return c;
  try {
    const { rows } = await db.query(`SELECT active, token_version FROM users WHERE id = $1`, [id]);
    const st = rows.length
      ? { active: rows[0].active !== false, tv: Number(rows[0].token_version) || 0, ts: Date.now() }
      : { active: false, tv: -1, ts: Date.now() };   // запись пропала → доступ закрыт
    _sessCache.set(id, st);
    return st;
  } catch { return { active: true, tv: null, ts: Date.now() }; }   // сбой БД не запирает всех (fail-open)
}
function invalidateActive(id) { if (id != null) _sessCache.delete(id); }   // сброс кеша при смене active/tv

// Инкремент token_version → мгновенная ревокация всех сессий пользователя.
async function bumpTokenVersion(id) {
  if (id == null) return;
  try { await db.query(`UPDATE users SET token_version = COALESCE(token_version,0) + 1 WHERE id = $1`, [id]); }
  catch (e) { console.error('bumpTokenVersion:', e.message); }
  invalidateActive(id);
}

async function auth(req, res, next) {
  const token = req.cookies && req.cookies.ddc_token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    // algorithms: ['HS256'] — явно пинуем симметричный алгоритм (защита от alg-confusion на будущее).
    req.admin = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Сессия истекла' });
  }
  // Суперадмин из .env (id = null) в таблице users не живёт — active/ревокация к нему не применимы.
  if (req.admin.id != null) {
    const st = await sessionState(req.admin.id);
    if (!st.active) return res.status(401).json({ error: 'Учётная запись отключена' });
    if (st.tv != null && (req.admin.tv || 0) !== st.tv) return res.status(401).json({ error: 'Сессия завершена' });
  }
  touchPresence(req.admin.id);
  next();
}

// Доступ только для указанных ролей
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

// ── TOTP (RFC 6238) для двухфакторной аутентификации — на чистом crypto, без зависимостей ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  const rem = bits.length % 5;
  if (rem) out += B32[parseInt(bits.slice(bits.length - rem).padEnd(5, '0'), 2)];
  return out;
}
function base32Decode(s) {
  let bits = ''; const out = [];
  for (const c of String(s).replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0'); }
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totpCode(secretB32, t = Date.now()) {
  const key = base32Decode(secretB32);
  let counter = Math.floor(t / 1000 / 30);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24 | (hmac[off + 1] & 0xff) << 16 | (hmac[off + 2] & 0xff) << 8 | (hmac[off + 3] & 0xff)) % 1000000;
  return String(code).padStart(6, '0');
}
function totpVerify(secretB32, token) {
  if (!secretB32 || !/^\d{6}$/.test(String(token || ''))) return false;
  const now = Date.now();
  for (const d of [-1, 0, 1]) if (totpCode(secretB32, now + d * 30000) === String(token)) return true;   // ±30с окно
  return false;
}
const totpNewSecret = () => base32Encode(crypto.randomBytes(20));

// Запись в историю изменений (кто, что, когда)
async function logAudit(req, entity, entityId, action, summary) {
  try {
    const actor = (req && req.admin && req.admin.u) || 'system';
    const role = (req && req.admin && req.admin.role) || '';
    await db.query(
      `INSERT INTO audit_log (actor, actor_role, entity, entity_id, action, summary) VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor, role, entity, entityId == null ? null : Number(entityId), action, (summary || '').slice(0, 500)]
    );
  } catch (e) { console.error('audit:', e.message); }
}

// Запись события входа (аудит безопасности).
async function logLogin(req, userId, username, event) {
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 60);
    const ua = String(req.headers['user-agent'] || '').slice(0, 200);
    await db.query(`INSERT INTO login_events (user_id, username, event, ip, ua) VALUES ($1,$2,$3,$4,$5)`, [userId || null, String(username || '').slice(0, 60), event, ip, ua]);
  } catch { /* аудит не критичен */ }
}

module.exports = { auth, requireRole, touchPresence, totpVerify, totpNewSecret, logAudit, logLogin, invalidateActive, bumpTokenVersion };
