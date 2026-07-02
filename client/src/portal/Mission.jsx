import { useEffect, useState, useCallback } from 'react';
import { getJSON } from '../api.js';

const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const pad = (n) => String(n).padStart(2, '0');

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

  const stats = d ? [
    { k: 'Онлайн', v: d.onlineCount, sub: `из ${d.users?.active || 0} активных`, tone: 'green' },
    { k: 'Сообщений · 24ч', v: d.messages?.today ?? 0, sub: `${d.messages?.hour || 0} за час`, tone: 'cyan' },
    { k: 'Задач открыто', v: d.tasks?.open ?? 0, sub: `${d.tasks?.done || 0} выполнено`, tone: 'amber' },
    { k: 'Документов', v: d.files?.total ?? 0, sub: `+${d.files?.today || 0} за сутки`, tone: 'cyan' },
    { k: 'Сотрудников', v: d.users?.total ?? 0, sub: `${d.chats || 0} чатов`, tone: 'blue' },
    { k: 'Групп-чатов', v: d.chats ?? 0, sub: 'команды', tone: 'blue' },
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
        </div>
      )}
    </div>
  );
}
