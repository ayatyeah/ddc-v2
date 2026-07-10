// routes/auth.js — вход/выход/сессия: /api/login (+2FA), /api/logout, /api/me.
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, COOKIE_OPTS } = require('../lib/config');
const { auth, totpVerify, logLogin, bumpTokenVersion } = require('../lib/auth');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
// Валидный bcrypt-хеш от случайной строки (сгенерирован один раз при старте): сравниваем с ним
// для несуществующих логинов, чтобы bcrypt.compare занимал столько же времени, сколько для
// реальной учётки — иначе валидные логины выдаются по времени ответа (анти-timing).
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

router.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  // id — идентификатор записи в users (нужен для привязки лидов к сотруднику).
  // У суперадмина из .env записи в users нет → id = null.
  // tv — token_version на момент выдачи: при logout/смене пароля/деактивации его инкрементят
  // в БД, и токены со старым tv перестают приниматься (ревокация). Суперадмин без записи → tv 0.
  const issue = (u, role, id = null, tv = 0) => {
    const token = jwt.sign({ u, role, id, tv }, SECRET, { expiresIn: '8h' });
    res.cookie('ddc_token', token, { ...COOKIE_OPTS, maxAge: 8 * 60 * 60 * 1000 });
    logLogin(req, id, u, 'success');
    return res.json({ ok: true, username: u, role, id });
  };

  // 1) Суперадмин из .env
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return issue(username, 'admin');
  }
  // 2) Пользователь из таблицы users (bcrypt).
  // Анти-enumeration: несуществующий логин, неверный пароль и отключённая учётка дают ОДИН и
  // тот же ответ (401 «неверный логин или пароль»), а bcrypt.compare выполняется ВСЕГДА —
  // по dummy-хешу для несуществующих, чтобы не выдавать валидные логины по времени ответа.
  try {
    const { rows } = await db.query(
      `SELECT id, username, password_hash, role, active, totp_enabled, token_version FROM users WHERE username = $1`,
      [String(username || '').trim()]
    );
    const user = rows[0];
    const ok = await bcrypt.compare(String(password || ''), user ? user.password_hash : DUMMY_HASH);
    if (user && ok && user.active) {
      // Если включена 2FA — не выдаём сессию сразу, а просим одноразовый код (второй шаг).
      if (user.totp_enabled) {
        const ticket = jwt.sign({ uid: user.id, purpose: '2fa' }, SECRET, { expiresIn: '5m' });
        return res.json({ twofa: true, ticket });
      }
      return issue(user.username, user.role, user.id, Number(user.token_version) || 0);
    }
  } catch (e) {
    console.error('POST /api/login:', e.message);
  }
  logLogin(req, null, username, 'fail');
  return res.status(401).json({ error: 'Неверный логин или пароль' });
});

// Второй шаг входа: проверка одноразового кода 2FA по тикету от /api/login.
router.post('/api/login/2fa', loginLimiter, async (req, res) => {
  const { ticket, code } = req.body || {};
  let payload;
  try { payload = jwt.verify(String(ticket || ''), SECRET, { algorithms: ['HS256'] }); } catch { return res.status(401).json({ error: 'Сессия истекла, войдите заново' }); }
  if (payload.purpose !== '2fa' || !payload.uid) return res.status(400).json({ error: 'Некорректный запрос' });
  try {
    const { rows } = await db.query(`SELECT id, username, role, active, totp_secret, totp_enabled, token_version FROM users WHERE id = $1`, [payload.uid]);
    const u = rows[0];
    if (!u || !u.active || !u.totp_enabled) return res.status(401).json({ error: 'Недоступно' });
    if (!totpVerify(u.totp_secret, code)) { logLogin(req, u.id, u.username, '2fa_fail'); return res.status(401).json({ error: 'Неверный код' }); }
    const token = jwt.sign({ u: u.username, role: u.role, id: u.id, tv: Number(u.token_version) || 0 }, SECRET, { expiresIn: '8h' });
    res.cookie('ddc_token', token, { ...COOKIE_OPTS, maxAge: 8 * 60 * 60 * 1000 });
    logLogin(req, u.id, u.username, '2fa_success');
    res.json({ ok: true, username: u.username, role: u.role, id: u.id });
  } catch (e) { console.error('POST /api/login/2fa:', e.message); res.status(500).json({ error: 'Ошибка входа' }); }
});

router.post('/api/logout', async (req, res) => {
  // Чистим cookie на клиенте И ревокируем сам токен: инкремент token_version делает выданный
  // токен недействительным на сервере — украденная копия перестаёт работать после выхода.
  // (logout без auth-middleware, поэтому токен читаем и проверяем вручную.)
  try {
    const t = req.cookies && req.cookies.ddc_token;
    if (t) { const p = jwt.verify(t, SECRET, { algorithms: ['HS256'] }); if (p && p.id != null) await bumpTokenVersion(p.id); }
  } catch { /* токен невалиден/истёк — ревокировать нечего */ }
  res.clearCookie('ddc_token', COOKIE_OPTS);
  res.json({ ok: true });
});

router.get('/api/me', auth, (req, res) => {
  res.json({ username: req.admin.u, role: req.admin.role, id: req.admin.id ?? null });
});

module.exports = router;
