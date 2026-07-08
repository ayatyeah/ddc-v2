import { useEffect, useRef, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

// Анимированный счётчик: число «набегает» от 0 при появлении (design-wow, дёшево).
function CountUp({ value }) {
  const [n, setN] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const target = Number(value) || 0; const from = ref.current; const dur = 650; const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur); const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick); else ref.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

const ENTITY_LABEL = { lead: 'Заявка', news: 'Новость', feed: 'AI-лента' };
const fmt = (ts) => { try { return new Date(ts).toLocaleString('ru-RU'); } catch { return ''; } };
const fmtDay = (s) => { try { const d = new Date(s); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); } catch { return s; } };

const STATUS = {
  new:          { label: 'Новые',     color: '#6ea0ff' },
  in_progress:  { label: 'В работе',  color: '#d8b25a' },
  on_hold:      { label: 'Отложены',  color: '#8fa0bf' },
  served:       { label: 'Обслужены', color: '#5fd1a0' },
  rejected:     { label: 'Отказ',     color: '#e06a82' },
};
const STATUS_ORDER = ['new', 'in_progress', 'on_hold', 'served', 'rejected'];

/* ── Линейный график динамики заявок (чистый SVG) ───────────────────── */
function TrendChart({ data }) {
  const W = 560, H = 170, pad = { t: 14, r: 14, b: 26, l: 26 };
  const pts = data && data.length ? data : [];
  if (pts.length < 2) return <div className="adm-hint">Недостаточно данных для графика</div>;
  const max = Math.max(1, ...pts.map((p) => p.leads));
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (iw * i) / (pts.length - 1);
  const y = (v) => pad.t + ih - (ih * v) / max;
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.leads).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Динамика заявок за 14 дней">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ea0ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6ea0ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={pad.l} y1={y(tk)} x2={W - pad.r} y2={y(tk)} className="chart-grid" />
          <text x={pad.l - 6} y={y(tk) + 3} className="chart-axis" textAnchor="end">{tk}</text>
        </g>
      ))}
      <path d={area} fill="url(#trendFill)" />
      <path d={line} className="chart-line" fill="none" />
      {pts.map((p, i) => (
        (i === 0 || i === pts.length - 1 || i % 3 === 0) && (
          <text key={i} x={x(i)} y={H - 8} className="chart-axis" textAnchor="middle">{fmtDay(p.day)}</text>
        )
      ))}
      {pts.map((p, i) => p.leads > 0 && <circle key={`d${i}`} cx={x(i)} cy={y(p.leads)} r="3" className="chart-dot" />)}
    </svg>
  );
}

/* ── Пончик по статусам заявок (чистый SVG) ─────────────────────────── */
function DonutChart({ byStatus, total }) {
  const rows = STATUS_ORDER
    .map((k) => ({ key: k, ...STATUS[k], value: (byStatus.find((s) => s.status === k)?.c) || 0 }))
    .filter((r) => r.value > 0);
  const sum = rows.reduce((a, r) => a + r.value, 0);
  if (sum === 0) return <div className="adm-hint">Заявок пока нет</div>;
  const R = 52, sw = 18, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut-svg" role="img" aria-label="Заявки по статусам">
        <g transform="translate(70,70) rotate(-90)">
          <circle r={R} fill="none" stroke="var(--line)" strokeWidth={sw} />
          {rows.map((r) => {
            const frac = r.value / sum;
            const dash = `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`;
            const el = (
              <circle key={r.key} r={R} fill="none" stroke={r.color} strokeWidth={sw}
                strokeDasharray={dash} strokeDashoffset={-offset * C} strokeLinecap="butt" />
            );
            offset += frac;
            return el;
          })}
        </g>
        <text x="70" y="66" textAnchor="middle" className="donut-num">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="donut-cap">заявок</text>
      </svg>
      <ul className="donut-legend">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="dl-dot" style={{ background: r.color }} />
            <span className="dl-lbl">{r.label}</span>
            <span className="dl-val">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard({ onAuthLost, onGoTab }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [insight, setInsight] = useState('');
  const [insBusy, setInsBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => getJSON('/api/admin/dashboard')
      .then((x) => { if (alive) setD(x); })
      .catch((e) => { if (e.status === 401) return onAuthLost?.(); if (alive && !d) setErr('Не удалось загрузить дашборд'); });
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 20000);   // живой онлайн/цифры
    return () => { alive = false; clearInterval(t); };
  }, []); // eslint-disable-line
  if (err) return <div className="adm-note">{err}</div>;
  if (!d) return <div className="adm-hint">Загрузка…</div>;

  const peak = d.by_day?.length ? Math.max(...d.by_day.map((x) => x.leads)) : 0;
  const last14 = d.by_day?.reduce((a, x) => a + x.leads, 0) || 0;
  const h = d.health || {};
  const getInsight = async () => {
    setInsBusy(true);
    try { const r = await sendJSON('/api/admin/insight', 'POST', { stats: { ...d, last14 } }); setInsight(r.insight); }
    catch (e) { setInsight(e.message || 'ИИ недоступен'); } finally { setInsBusy(false); }
  };

  return (
    <div className="dash-bento">
      <button className="dash-card dc-leads" onClick={() => onGoTab?.('leads')}>
        <span className="dc-num"><CountUp value={d.leads_total} /></span>
        <span className="dc-lbl">Заявки</span>
        <span className="dc-sub">{d.leads_new} новых · {d.leads_progress} в работе</span>
      </button>
      <button className="dash-card dc-news" onClick={() => onGoTab?.('news')}>
        <span className="dc-num"><CountUp value={d.news_total} /></span>
        <span className="dc-lbl">Новости</span>
        <span className="dc-sub">{d.news_published} опубликовано</span>
      </button>
      <div className="dash-card dc-online">
        <span className="dc-num"><span className="dc-live-dot" /><CountUp value={d.online || 0} /></span>
        <span className="dc-lbl">Сейчас онлайн</span>
        <span className="dc-sub">сотрудников в портале</span>
      </div>
      <div className="dash-card dc-static">
        <span className="dc-num"><CountUp value={last14} /></span>
        <span className="dc-lbl">Заявок за 14 дней</span>
        <span className="dc-sub">пик {peak} в день</span>
      </div>

      <section className="chart-card bento-full dash-insight">
        <div className="chart-head">
          <h3>🤖 ИИ-инсайт</h3>
          <button className="adm-btn sm" onClick={getInsight} disabled={insBusy}>{insBusy ? 'Анализирую…' : insight ? 'Обновить' : 'Получить сводку'}</button>
        </div>
        {insight ? <p className="dash-insight-t">{insight}</p> : <p className="adm-hint">ИИ проанализирует цифры и подскажет, что происходит и на что обратить внимание.</p>}
        <div className="dash-sys">
          <span className={`sys-chip ${h.db ? 'ok' : 'bad'}`}>БД {h.db ? '●' : '○'}</span>
          <span className={`sys-chip ${h.ai ? 'ok' : 'bad'}`}>OpenAI {h.ai ? '●' : '○'}</span>
          <span className={`sys-chip ${h.gemini ? 'ok' : 'bad'}`}>Gemini {h.gemini ? '●' : '○'}</span>
          {h.uptime != null && <span className="sys-chip">аптайм {Math.floor(h.uptime / 3600)}ч {Math.floor((h.uptime % 3600) / 60)}м</span>}
          {h.version && <span className="sys-chip">v{h.version}</span>}
        </div>
      </section>

      <section className="chart-card chart-trend bento-2">
        <div className="chart-head">
          <h3>Динамика заявок</h3>
          <span className="chart-sub">за последние 14 дней</span>
        </div>
        <TrendChart data={d.by_day || []} />
      </section>
      <section className="chart-card chart-donut bento-2">
        <div className="chart-head">
          <h3>По статусам</h3>
          <span className="chart-sub">распределение заявок</span>
        </div>
        <DonutChart byStatus={d.by_status || []} total={d.leads_total} />
      </section>

      <div className="dash-recent bento-full">
        <div className="dash-recent-head">
          <h3>Последние изменения</h3>
          <button className="adm-ghost" onClick={() => onGoTab?.('history')}>Вся история →</button>
        </div>
        {d.recent.length === 0 ? <div className="adm-hint">Пока пусто</div> : (
          <ul className="audit-list">
            {d.recent.map((r, i) => (
              <li key={i}>
                <span className={`au-badge au-${r.entity}`}>{ENTITY_LABEL[r.entity] || r.entity}</span>
                <span className="au-sum">{r.summary}</span>
                <span className="au-meta">{r.actor} · {fmt(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
