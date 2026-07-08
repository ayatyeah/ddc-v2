import { useCallback, useEffect, useState } from 'react';
import { getJSON } from '../api.js';

const DEV = { desktop: ['Десктоп', '#2f6fe0'], mobile: ['Телефон', '#1f9d57'], tablet: ['Планшет', '#c8960c'] };
const PAGE_NAMES = {
  '/': 'Главная', '/uslugi': 'Услуги', '/proekty': 'Проекты', '/o-nas': 'О нас',
  '/karera': 'Карьера', '/partners': 'Партнёрам', '/kontakty': 'Контакты',
  '/politika-konfidencialnosti': 'Политика',
};

// Собственная веб-аналитика: просмотры страниц + разбивка по устройствам.
export default function WebAnalytics({ onAuthLost }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const load = useCallback(async () => {
    try { setD(await getJSON('/api/admin/analytics/site')); setErr(false); }
    catch (e) { if (e.status === 401) onAuthLost?.(); else setErr(true); }
  }, [onAuthLost]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (!d) return <div className="adm-hint">{err ? 'Аналитика недоступна' : 'Загрузка…'}</div>;
  const devTotal = d.byDevice.reduce((s, x) => s + x.c, 0) || 1;
  const maxPage = Math.max(1, ...d.topPages.map((p) => p.c));
  const maxDay = Math.max(1, ...d.byDay.map((x) => x.c));

  return (
    <>
      <div className="nm-head"><h2>Веб-аналитика сайта</h2></div>
      <div className="adm-note">Собственная аналитика посещений (без внешних сервисов). Учитываются страницы публичного сайта; устройство определяется по браузеру.</div>

      <div className="wa-kpis">
        <div className="wa-kpi"><span>Всего просмотров</span><b>{d.total.total}</b></div>
        <div className="wa-kpi"><span>За 24 часа</span><b>{d.total.today}</b></div>
        <div className="wa-kpi"><span>За 7 дней</span><b>{d.total.week}</b></div>
      </div>

      <div className="wa-grid">
        <div className="wa-panel">
          <div className="wa-h">Устройства · телефон / десктоп</div>
          {d.byDevice.length === 0 && <div className="adm-empty">Нет данных.</div>}
          {d.byDevice.map((x) => {
            const [lbl, col] = DEV[x.device] || [x.device, '#8a8a8a'];
            const pct = Math.round((x.c / devTotal) * 100);
            return (
              <div className="wa-bar-row" key={x.device}>
                <span className="wa-bar-lbl">{lbl}</span>
                <div className="wa-bar"><i style={{ width: `${pct}%`, background: col }} /></div>
                <span className="wa-bar-v">{pct}% · {x.c}</span>
              </div>
            );
          })}
        </div>

        <div className="wa-panel">
          <div className="wa-h">Топ страниц</div>
          {d.topPages.length === 0 && <div className="adm-empty">Нет данных.</div>}
          {d.topPages.map((p) => {
            const pct = Math.round((p.c / maxPage) * 100);
            return (
              <div className="wa-bar-row" key={p.path}>
                <span className="wa-bar-lbl" title={p.path}>{PAGE_NAMES[p.path] || p.path}</span>
                <div className="wa-bar"><i style={{ width: `${pct}%` }} /></div>
                <span className="wa-bar-v">{p.c}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="wa-panel">
        <div className="wa-h">Просмотры по дням · {d.days} дн.</div>
        {d.byDay.length === 0 ? <div className="adm-empty">Данные появятся после первых посещений сайта.</div> : (
          <div className="wa-days">
            {d.byDay.map((x) => (
              <div className="wa-day" key={x.d} title={`${x.d}: ${x.c}`}>
                <div className="wa-day-bar" style={{ height: `${Math.max(3, (x.c / maxDay) * 100)}%` }} />
                <span>{x.d.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {d.byLang.length > 0 && (
        <div className="wa-panel">
          <div className="wa-h">Языки</div>
          <div className="wa-langs">
            {d.byLang.map((l) => <span className="wa-lang" key={l.lang}>{l.lang.toUpperCase()} · {l.c}</span>)}
          </div>
        </div>
      )}
    </>
  );
}
