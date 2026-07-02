import { useEffect, useState, useCallback } from 'react';
import { getJSON } from '../api.js';

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
const loadColor = (l) => (l > 80 ? '#c0455a' : l > 50 ? '#c8960c' : '#1f9d57');

// Системная телеметрия (CPU-нагрузка, ресурсы, последние изменения) — только для админов.
export default function System({ onAuthLost }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const load = useCallback(async () => {
    try { setD(await getJSON('/api/portal/mission')); setErr(false); }
    catch (e) { if (e.status === 401) onAuthLost?.(); else setErr(true); }
  }, [onAuthLost]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  if (!d) return <div className="adm-hint">{err ? 'Телеметрия недоступна' : 'Загрузка телеметрии…'}</div>;
  const s = d.server || {};

  return (
    <>
      <div className="nm-head"><h2>Система</h2></div>
      <div className="adm-note">Живой мониторинг сервера и активности портала. Обновляется каждые 5 секунд.</div>

      <div className="sys-grid">
        <div className="sys-card">
          <div className="sys-h">Нагрузка CPU</div>
          <div className="sys-gauge" style={{ '--p': s.load || 0, '--g': loadColor(s.load || 0) }}>
            <div className="sys-gauge-v">{s.load ?? 0}<small>%</small></div>
          </div>
          <div className="sys-metrics">
            <div><span>Load avg (1m)</span><b>{s.loadavg ?? 0}</b></div>
            <div><span>Ядер CPU</span><b>{s.cores ?? 0}</b></div>
          </div>
        </div>

        <div className="sys-card">
          <div className="sys-h">Ресурсы и активность</div>
          <div className="sys-stat"><span>Память (RSS)</span><b>{s.memMB ?? 0} МБ</b></div>
          <div className="sys-stat"><span>Аптайм</span><b>{fmtUptime(s.uptimeSec || 0)}</b></div>
          <div className="sys-stat"><span>Онлайн сейчас</span><b>{d.onlineCount} / {d.users?.active || 0}</b></div>
          <div className="sys-stat"><span>Сообщений за 24ч</span><b>{d.messages?.today ?? 0}</b></div>
          <div className="sys-stat"><span>Задач открыто</span><b>{d.tasks?.open ?? 0}</b></div>
          <div className="sys-stat"><span>Файлов загружено</span><b>{d.files?.total ?? 0}</b></div>
        </div>

        <div className="sys-card sys-feed">
          <div className="sys-h">Последние изменения</div>
          <div className="sys-feed-list">
            {d.activity.length === 0 && <div className="adm-empty">Пока нет событий.</div>}
            {d.activity.map((a, i) => (
              <div className={`sys-ev e-${a.type}`} key={i}>
                <span className="sys-ev-dot" />
                <span className="sys-ev-t">{a.text}</span>
                <time>{ago(a.at)}</time>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
