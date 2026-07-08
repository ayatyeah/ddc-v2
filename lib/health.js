// lib/health.js — реальный мониторинг доступности систем (health-checks).
// Виды проверок: 'self' — HTTP-пинг собственного /api/health; 'db' — SELECT 1 к
// PostgreSQL; 'http' — GET внешнего URL; 'tcp' — TCP-коннект host:port; 'none' —
// ручной статус (админ выставляет сам). Аптайм считается по факту: checks_ok/checks_total.
const net = require('net');
const db = require('../db');
const { PORT } = require('./config');

const CHECK_KINDS = ['none', 'self', 'db', 'http', 'tcp'];

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
      const r = await fetchTimeout(url, 6000);
      const lat = Date.now() - t0;
      if (r.status >= 500) return { status: 'down', latency: lat };
      if (r.status >= 400 || lat > 2500) return { status: 'degraded', latency: lat };
      return { status: 'operational', latency: lat };
    }
    if (sys.check_kind === 'tcp') {
      if (!sys.check_target) return null;
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
