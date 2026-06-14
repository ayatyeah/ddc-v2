import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJSON } from '../api.js';

const STATUS = [
  ['new', 'Новые', '#2f6fe0'],
  ['in_progress', 'В процессе', '#c98a16'],
  ['on_hold', 'Отложены', '#7a52e0'],
  ['served', 'Обслужены', '#0a8a5a'],
  ['rejected', 'Отказ', '#c0455a'],
];

/* Круговая диаграмма (донат) по статусам. */
function Donut({ data, total }) {
  const R = 60, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 160 160" className="an-donut">
      <circle cx="80" cy="80" r={R} fill="none" stroke="var(--line)" strokeWidth="20" />
      {total > 0 && data.map(([k, , color, count]) => {
        if (!count) return null;
        const frac = count / total;
        const len = frac * C;
        const seg = (
          <circle key={k} cx="80" cy="80" r={R} fill="none" stroke={color} strokeWidth="20"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
            transform="rotate(-90 80 80)" />
        );
        offset += len;
        return seg;
      })}
      <text x="80" y="74" textAnchor="middle" className="an-donut-num">{total}</text>
      <text x="80" y="94" textAnchor="middle" className="an-donut-lab">клиентов</text>
    </svg>
  );
}

/* Вертикальные столбцы: заявки по дням. */
function Bars({ series }) {
  const W = 520, H = 180, pad = 24;
  const max = Math.max(1, ...series.map((d) => d.count));
  const bw = (W - pad * 2) / series.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="an-bars">
      {[0.5, 1].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={H - pad - (H - pad * 2) * g} y2={H - pad - (H - pad * 2) * g} stroke="var(--line)" strokeWidth="1" />
      ))}
      {series.map((d, i) => {
        const h = (d.count / max) * (H - pad * 2);
        const x = pad + i * bw;
        return (
          <g key={i}>
            <rect x={x + bw * 0.18} y={H - pad - h} width={bw * 0.64} height={h} rx="3" fill="var(--blue)" />
            {d.count > 0 && <text x={x + bw / 2} y={H - pad - h - 5} textAnchor="middle" className="an-bar-val">{d.count}</text>}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="an-bar-lab">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Analytics({ onAuthLost }) {
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([getJSON('/api/stats'), getJSON('/api/leads')]);
      setStats(s); setLeads(Array.isArray(l) ? l : []);
    } catch (e) {
      if (e.status === 401) onAuthLost?.();
    } finally { setLoaded(true); }
  }, [onAuthLost]);

  useEffect(() => { load(); }, [load]);

  const statusData = useMemo(
    () => STATUS.map(([k, lbl, color]) => [k, lbl, color, stats?.[k] || 0]),
    [stats]
  );

  const series = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      days.push({ key: d.toISOString().slice(0, 10), label: `${d.getDate()}`, count: 0 });
    }
    const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));
    leads.forEach((l) => {
      const k = (l.created_at || '').slice(0, 10);
      if (k in idx) days[idx[k]].count++;
    });
    return days;
  }, [leads]);

  const ratings = useMemo(() => {
    const dist = [0, 0, 0, 0, 0]; // 1..5
    let sum = 0, n = 0;
    leads.forEach((l) => { const r = l.rating || 0; if (r >= 1 && r <= 5) { dist[r - 1]++; sum += r; n++; } });
    return { dist, avg: n ? (sum / n) : 0, n };
  }, [leads]);

  const ratingMax = Math.max(1, ...ratings.dist);

  if (!loaded) return <div className="adm-hint">Загрузка аналитики…</div>;

  return (
    <>
      <div className="nm-head"><h2>Аналитика по клиентам</h2></div>

      <div className="an-grid">
        <div className="an-card">
          <div className="an-title">Распределение по статусам</div>
          <div className="an-donut-wrap">
            <Donut data={statusData} total={stats?.total || 0} />
            <div className="an-legend">
              {statusData.map(([k, lbl, color, count]) => (
                <div className="an-leg" key={k}>
                  <i style={{ background: color }} /><span>{lbl}</span><b>{count}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="an-card">
          <div className="an-title">Средняя оценка</div>
          <div className="an-rating">
            <div className="an-avg">{ratings.avg ? ratings.avg.toFixed(1) : '—'}<small>/ 5</small></div>
            <div className="an-rbars">
              {[5, 4, 3, 2, 1].map((star) => (
                <div className="an-rrow" key={star}>
                  <span className="an-rstar">{star}★</span>
                  <span className="an-rtrack"><span className="an-rfill" style={{ width: `${(ratings.dist[star - 1] / ratingMax) * 100}%` }} /></span>
                  <b>{ratings.dist[star - 1]}</b>
                </div>
              ))}
            </div>
            <div className="an-hint">Оценили клиентов: {ratings.n}</div>
          </div>
        </div>

        <div className="an-card span2">
          <div className="an-title">Заявки за последние 14 дней</div>
          <Bars series={series} />
        </div>
      </div>
    </>
  );
}
