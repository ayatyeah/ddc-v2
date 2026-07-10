// lib/health.js — реальный мониторинг доступности систем (health-checks).
// Виды проверок: 'self' — HTTP-пинг собственного /api/health; 'db' — SELECT 1 к
// PostgreSQL; 'http' — GET внешнего URL; 'tcp' — TCP-коннект host:port; 'none' —
// ручной статус (админ выставляет сам). Аптайм считается по факту: checks_ok/checks_total.
const net = require('net');
const dns = require('dns').promises;
const db = require('../db');
const { PORT } = require('./config');

const CHECK_KINDS = ['none', 'self', 'db', 'http', 'tcp'];

// SSRF-барьер. check_target задаёт админ/начальник отдела; без фильтра сервер сходил бы на
// http://169.254.169.254/ (метаданные облака) или внутренние адреса, а наружу утекал бы статус
// (up/down/latency) — слепое сканирование внутренней сети. Резолвим host и запрещаем частные,
// loopback и link-local диапазоны. Проверку 'self' (пинг своего /api/health) это не касается.
function isPrivateIp(ip) {
  const l = String(ip).toLowerCase();
  if (l.includes(':')) {   // IPv6
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd')) return true;   // link-local + unique-local
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);   // IPv4-mapped
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return /^(10|127|0)\./.test(l)
    || /^169\.254\./.test(l)                       // link-local (метаданные облака)
    || /^192\.168\./.test(l)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(l)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(l);   // CGNAT 100.64/10
}
async function targetAllowed(rawHost) {
  const host = String(rawHost || '').split('/')[0].split(':')[0].replace(/^\[|\]$/g, '').trim();
  if (!host) return false;
  try {
    const addrs = await dns.lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch { return false; }   // не резолвится — не ходим
}

function fetchTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, redirect: 'manual' }).finally(() => clearTimeout(t));
}
function tcpProbe(target, ms) {
  return new Promise((resolve, reject) => {
    const [host, portStr] = String(target).split(':');
    const port = Number(portStr) || 443;
    if (!host) return reject(new Error('нет адреса'));
    const t0 = Date.now();
    const sock = net.connect({ host, port });
    const finish = (fn, v) => { try { sock.destroy(); } catch { /* уже закрыт */ } fn(v); };
    sock.setTimeout(ms);
    sock.once('connect', () => finish(resolve, Date.now() - t0));
    sock.once('timeout', () => finish(reject, new Error('timeout')));
    sock.once('error', (e) => finish(reject, e));
  });
}
// Проверить одну систему → { status, latency } (или null, если проверка не задана).
async function probeSystem(sys) {
  const t0 = Date.now();
  try {
    if (sys.check_kind === 'db') { await db.query('SELECT 1'); return { status: 'operational', latency: Date.now() - t0 }; }
    if (sys.check_kind === 'self') {
      const r = await fetchTimeout(`http://127.0.0.1:${PORT}/api/health`, 4000);
      const lat = Date.now() - t0;
      return { status: r.ok ? 'operational' : 'degraded', latency: lat };
    }
    if (sys.check_kind === 'http') {
      if (!sys.check_target) return null;
      const url = /^https?:\/\//i.test(sys.check_target) ? sys.check_target : 'https://' + sys.check_target;
      let host; try { host = new URL(url).hostname; } catch { return { status: 'down', latency: 0 }; }
      if (!(await targetAllowed(host))) return { status: 'down', latency: 0 };   // SSRF-барьер
      const r = await fetchTimeout(url, 6000);
      const lat = Date.now() - t0;
      if (r.status >= 500) return { status: 'down', latency: lat };
      if (r.status >= 400 || lat > 2500) return { status: 'degraded', latency: lat };
      return { status: 'operational', latency: lat };
    }
    if (sys.check_kind === 'tcp') {
      if (!sys.check_target) return null;
      if (!(await targetAllowed(sys.check_target))) return { status: 'down', latency: 0 };   // SSRF-барьер
      const lat = await tcpProbe(sys.check_target, 6000);
      return { status: lat > 2500 ? 'degraded' : 'operational', latency: lat };
    }
  } catch { return { status: 'down', latency: Date.now() - t0 }; }
  return null;
}
let healthRunning = false;
async function runHealthChecks() {
  if (healthRunning) return;
  healthRunning = true;
  try {
    // 'maintenance' не трогаем — это ручное окно обслуживания
    const { rows } = await db.query(`SELECT id,name,status,check_kind,check_target,checks_ok,checks_total FROM systems WHERE check_kind <> 'none' AND status <> 'maintenance'`);
    for (const sys of rows) {
      const r = await probeSystem(sys);
      if (!r) continue;
      const total = Number(sys.checks_total) + 1;
      const ok = Number(sys.checks_ok) + (r.status === 'operational' ? 1 : 0);
      const uptime = Math.round((ok / total) * 10000) / 100;
      await db.query(
        `UPDATE systems SET status=$1, latency_ms=$2, last_checked=now(), checks_ok=$3, checks_total=$4, uptime=$5, updated_at=now() WHERE id=$6`,
        [r.status, Math.round(r.latency), ok, total, uptime, sys.id]);
    }
  } catch (e) { console.error('runHealthChecks:', e.message); }
  finally { healthRunning = false; }
}

// Подключить реальные проверки к уже существующим системам (для БД, засеянной до появления
// мониторинга). Срабатывает один раз — пока ни у одной системы нет авто-проверки.
async function wireSystemChecks() {
  try {
    const has = (await db.query(`SELECT count(*)::int c FROM systems WHERE check_kind <> 'none'`)).rows[0].c;
    if (has) return;   // уже настроено (seed или админ) — не трогаем
    const rules = [
      ['self', '', ['портал']],
      ['db', '', ['postgres', 'база данных', 'бд']],
      ['self', '', ['мониторинг']],
      ['http', 'https://bsbnb.kz', ['публичный сайт', 'bsbnb']],
    ];
    const { rows } = await db.query(`SELECT id,name,uptime FROM systems`);
    let n = 0;
    for (const s of rows) {
      const nm = s.name.toLowerCase();
      const rule = rules.find(([, , keys]) => keys.some((k) => nm.includes(k)));
      if (!rule) continue;
      const [kind, target] = rule;
      const total = 500, okc = Math.round((Number(s.uptime) / 100) * total);
      await db.query(`UPDATE systems SET check_kind=$1, check_target=$2, checks_ok=$3, checks_total=$4 WHERE id=$5`, [kind, target, okc, total, s.id]);
      n++;
    }
    if (n) console.log(`✓ Реальные проверки подключены к ${n} системам (портал/БД/мониторинг/сайт)`);
  } catch (e) { console.error('wireSystemChecks:', e.message); }
}

module.exports = { CHECK_KINDS, runHealthChecks, wireSystemChecks };
