import { useEffect, useState, useCallback } from 'react';
import { getJSON } from '../api.js';

const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const pad = (n) => String(n).padStart(2, '0');
const fmtUptime = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}д ${h}ч` : h > 0 ? `${h}ч ${m}м` : `${m}м`;
};
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'только что';
  const m = Math.floor(s / 60); if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} ч`;
  return `${Math.floor(h / 24)} д`;
};
const loadColor = (l) => (l > 80 ? '#ff5a5a' : l > 50 ? '#ffd24a' : '#37e0a0');

// Режим «центр управления»: сводная телеметрия портала, авто-обновление каждые 5с.
export default function Mission({ onAuthLost }) {
  const [d, setD] = useState(null);
  const [clock, setClock] = useState('');
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try { setD(await getJSON('/api/portal/mission')); setErr(false); }
    catch (e) { if (e.status === 401) onAuthLost?.(); else setErr(true); }
  }, [onAuthLost]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const tick = () => { const n = new Date(); setClock(`${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`); };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);

  const s = d?.server || {};
  const stats = d ? [
    { k: 'Онлайн', v: d.onlineCount, sub: `из ${d.users?.active || 0} активных`, tone: 'green' },
    { k: 'Сообщений · 24ч', v: d.messages?.today ?? 0, sub: `${d.messages?.hour || 0} за час`, tone: 'cyan' },
    { k: 'Задач открыто', v: d.tasks?.open ?? 0, sub: `${d.tasks?.done || 0} выполнено`, tone: 'amber' },
    { k: 'Документов', v: d.files?.total ?? 0, sub: `+${d.files?.today || 0} за сутки`, tone: 'cyan' },
    { k: 'Сотрудников', v: d.users?.total ?? 0, sub: `${d.chats || 0} чатов`, tone: 'blue' },
    { k: 'Нагрузка', v: `${s.load ?? 0}%`, sub: `${s.cores || 0} ядер CPU`, tone: s.load > 80 ? 'red' : s.load > 50 ? 'amber' : 'green' },
  ] : [];

  return (
    <div className="pt-view mc">
      <div className="mc-head">
        <div className="mc-title"><span className="mc-led" aria-hidden="true" /> MISSION CONTROL</div>
        <div className="mc-clock">{clock} <span className={`mc-status ${err ? 'bad' : 'ok'}`}>{err ? 'СВЯЗЬ ПОТЕРЯНА' : 'SYSTEMS NOMINAL'}</span></div>
      </div>

      {!d ? <div className="pt-empty">Загрузка телеметрии…</div> : (
        <div className="mc-grid">
          <div className="mc-kpis">
            {stats.map((st, i) => (
              <div className={`mc-stat t-${st.tone}`} key={i}>
                <div className="mc-stat-k">{st.k}</div>
                <div className="mc-stat-v">{st.v}</div>
                <div className="mc-stat-s">{st.sub}</div>
              </div>
            ))}
          </div>

          <div className="mc-panel mc-load">
            <div className="mc-panel-h">НАГРУЗКА СИСТЕМЫ</div>
            <div className="mc-gauge" style={{ '--p': s.load || 0, '--g': loadColor(s.load || 0) }}>
              <div className="mc-gauge-v">{s.load ?? 0}<small>%</small></div>
            </div>
            <div className="mc-metrics">
              <div><span>LOAD AVG</span><b>{s.loadavg ?? 0}</b></div>
              <div><span>ПАМЯТЬ</span><b>{s.memMB ?? 0} МБ</b></div>
              <div><span>UPTIME</span><b>{fmtUptime(s.uptimeSec || 0)}</b></div>
            </div>
          </div>

          <div className="mc-panel mc-online">
            <div className="mc-panel-h">ОНЛАЙН · {d.onlineCount}</div>
            <div className="mc-online-list">
              {d.online.length === 0 && <div className="pt-empty sm">Сейчас никого нет в сети.</div>}
              {d.online.map((u) => (
                <div className="mc-person" key={u.id}>
                  <span className="mc-av">{initials(u.name)}<i /></span>
                  <span className="mc-person-t"><b>{u.name}</b><small>{u.department || '—'}</small></span>
                </div>
              ))}
            </div>
          </div>

          <div className="mc-panel mc-feed">
            <div className="mc-panel-h">ПОСЛЕДНИЕ ИЗМЕНЕНИЯ · LIVE</div>
            <div className="mc-feed-list">
              {d.activity.length === 0 && <div className="pt-empty sm">Пока нет событий.</div>}
              {d.activity.map((a, i) => (
                <div className={`mc-ev e-${a.type}`} key={i}>
                  <span className="mc-ev-dot" />
                  <span className="mc-ev-t">{a.text}</span>
                  <time>{ago(a.at)}</time>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
