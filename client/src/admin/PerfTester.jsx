import { useEffect, useMemo, useState } from 'react';

/* Вкладка «Перф» — показывает фризы фона, записанные perfMonitor (модуль грузится в
   main.jsx, работает на всём сайте). Здесь только просмотр/агрегация: где (страница),
   в какой МОМЕНТ сцены (прогресс 0..1) и насколько сильно проседает плавность. */

const PATH_LABEL = (p) => {
  const m = { '/': 'Главная', '/uslugi': 'Услуги', '/proekty': 'Проекты', '/o-nas': 'О нас', '/kontakty': 'Контакты', '/admin': 'Админка' };
  return m[p] || p;
};
const sevClass = (dt) => (dt >= 120 ? 'pf-sev-hi' : dt >= 70 ? 'pf-sev-mid' : 'pf-sev-lo');

export default function PerfTester() {
  const mon = typeof window !== 'undefined' ? window.__perfMon : null;
  const [, setTick] = useState(0);
  const [recording, setRecording] = useState(mon ? mon.get().recording : true);

  // Живое обновление (раз в 600мс) — статистика и список идут в реальном времени.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 600);
    return () => clearInterval(id);
  }, []);

  const s = mon ? mon.get() : null;

  const { byPath, byProg, recent } = useMemo(() => {
    const ev = s ? s.events : [];
    const bp = {};
    const bg = Array.from({ length: 10 }, () => 0);    // прогресс-зоны 0.0–0.1 … 0.9–1.0
    for (const e of ev) {
      bp[e.path] = (bp[e.path] || 0) + 1;
      if (typeof e.prog === 'number') bg[Math.min(9, Math.max(0, Math.floor(e.prog * 10)))]++;
    }
    return {
      byPath: Object.entries(bp).sort((a, b) => b[1] - a[1]),
      byProg: bg,
      recent: ev.slice(-60).reverse(),
    };
  }, [s, s && s.events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mon || !s) return <div className="adm-empty">Монитор недоступен (perfMonitor не загрузился).</div>;

  const maxProg = Math.max(1, ...byProg);
  const toggle = () => { const v = !recording; mon.setRecording(v); setRecording(v); };
  const clear = () => { if (window.confirm('Очистить журнал фризов?')) { mon.clear(); setTick((n) => n + 1); } };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ddc_perf_${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div className="pf-wrap">
      <div className="pf-head">
        <div>
          <h2>Тестер фризов фона</h2>
          <p className="pf-sub">Записывает каждый «долгий» кадр (&ge;{mon.freezeMs} мс) с контекстом: страница, прокрутка, <b>момент 3D-сцены</b> (прогресс 0–1) и DPR. Открой сайт, поскролль главную/услуги — фризы появятся здесь. Устройство: {s.device}.</p>
        </div>
        <div className="pf-actions">
          <button className={`adm-btn ${recording ? '' : 'pf-off'}`} onClick={toggle}>{recording ? '● Запись идёт' : '▷ Запись выкл'}</button>
          <button className="adm-ghost" onClick={exportJson}>Экспорт JSON</button>
          <button className="adm-ghost" onClick={clear}>Очистить</button>
        </div>
      </div>

      <div className="pf-stats">
        <div className="pf-stat"><div className="k">FPS сейчас</div><div className={`v ${s.fps && s.fps < 50 ? 'bad' : 'ok'}`}>{s.fps || '—'}</div></div>
        <div className="pf-stat"><div className="k">Всего фризов</div><div className="v">{s.longFrames}</div></div>
        <div className="pf-stat"><div className="k">Худший кадр</div><div className={`v ${s.worst >= 120 ? 'bad' : ''}`}>{s.worst ? s.worst + ' мс' : '—'}</div></div>
        <div className="pf-stat"><div className="k">Кадров снято</div><div className="v">{s.frames}</div></div>
        <div className="pf-stat"><div className="k">Доля фризов</div><div className="v">{s.frames ? (s.longFrames / s.frames * 100).toFixed(2) + '%' : '—'}</div></div>
      </div>

      <div className="pf-grid">
        {/* Где в сцене проседает (главное для починки фона) */}
        <section className="pf-card">
          <div className="pf-card-h">Момент 3D-сцены, где случаются фризы <small>(0 = башни на hero, ~0.4 — растворение, ~0.6 — вид сверху)</small></div>
          <div className="pf-bars">
            {byProg.map((c, i) => (
              <div className="pf-bar" key={i} title={`прогресс ${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}: ${c} фризов`}>
                <div className="pf-bar-fill" style={{ height: `${Math.round(c / maxProg * 100)}%` }} />
                <div className="pf-bar-c">{c || ''}</div>
                <div className="pf-bar-x">{(i / 10).toFixed(1)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* По страницам */}
        <section className="pf-card">
          <div className="pf-card-h">Фризы по страницам</div>
          {byPath.length === 0 ? <div className="adm-empty">Фризов пока нет — поскролль сайт.</div> : (
            <ul className="pf-paths">
              {byPath.map(([p, c]) => <li key={p}><span>{PATH_LABEL(p)}</span><b>{c}</b></li>)}
            </ul>
          )}
        </section>
      </div>

      {/* Последние события */}
      <section className="pf-card">
        <div className="pf-card-h">Последние фризы (новые сверху)</div>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Время, с</th><th>Длит.</th><th>Страница</th><th>Прогресс</th><th>DPR</th><th>scrollY</th></tr></thead>
            <tbody>
              {recent.map((e, i) => (
                <tr key={i}>
                  <td>{(e.t / 1000).toFixed(1)}</td>
                  <td><span className={`pf-dt ${sevClass(e.dt)}`}>{e.dt} мс</span></td>
                  <td>{PATH_LABEL(e.path)}</td>
                  <td>{e.prog != null ? e.prog.toFixed(2) : '—'}</td>
                  <td>{e.dpr != null ? e.dpr.toFixed(2) : '—'}</td>
                  <td>{e.scrollY}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={6} className="adm-empty" style={{ textAlign: 'center' }}>Пусто. Открой сайт и поскролль — фризы появятся тут.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
