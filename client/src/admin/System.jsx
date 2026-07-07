import { useEffect, useState, useCallback } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';

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

const ST = {
  operational: ['Работает', '#1f9d57'], degraded: ['Деградация', '#c8960c'],
  down: ['Сбой', '#c0455a'], maintenance: ['Обслуживание', '#2f6fe0'],
};
const SEV = { minor: ['Низкая', '#5b6472'], major: ['Средняя', '#c8960c'], critical: ['Критическая', '#c0455a'] };
const INCST = { open: 'Открыт', monitoring: 'Наблюдение', resolved: 'Решён' };
const CHECK_KIND = {
  none: 'Ручной', self: 'Портал (self)', db: 'База данных', http: 'HTTP-пинг', tcp: 'TCP-порт',
};

export default function System({ onAuthLost }) {
  const [d, setD] = useState(null);
  const [mon, setMon] = useState(null);
  const [err, setErr] = useState(false);
  const [inc, setInc] = useState({ title: '', system_id: '', severity: 'minor' });
  const [checking, setChecking] = useState(false);
  const [cfgId, setCfgId] = useState(null);              // id системы с открытой настройкой проверки
  const [cfg, setCfg] = useState({ check_kind: 'none', check_target: '' });

  const load = useCallback(async () => {
    try {
      const [tele, m] = await Promise.all([getJSON('/api/portal/mission').catch(() => null), getJSON('/api/admin/systems').catch(() => null)]);
      if (tele) setD(tele); if (m) setMon(m); setErr(false);
    } catch (e) { if (e.status === 401) onAuthLost?.(); else setErr(true); }
  }, [onAuthLost]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const setStatus = async (sys, status) => { setMon((x) => ({ ...x, systems: x.systems.map((s) => s.id === sys.id ? { ...s, status } : s) })); try { await sendJSON(`/api/admin/systems/${sys.id}`, 'PATCH', { status }); load(); } catch { load(); } };
  const addIncident = async (e) => {
    e?.preventDefault?.();
    if (!inc.title.trim()) return;
    try { await sendJSON('/api/admin/incidents', 'POST', { title: inc.title.trim(), system_id: inc.system_id || undefined, severity: inc.severity }); setInc({ title: '', system_id: '', severity: 'minor' }); load(); }
    catch (e2) { alert(e2.message || 'Не удалось'); }
  };
  const setIncStatus = async (i, status) => { try { await sendJSON(`/api/admin/incidents/${i.id}`, 'PATCH', { status }); load(); } catch {} };

  const checkNow = async () => {
    setChecking(true);
    try { await sendJSON('/api/admin/systems/check', 'POST', {}); await load(); }
    catch (e) { alert(e.message || 'Не удалось выполнить проверку'); }
    finally { setChecking(false); }
  };
  const openCfg = (sys) => { setCfgId(sys.id); setCfg({ check_kind: sys.check_kind || 'none', check_target: sys.check_target || '' }); };
  const saveCfg = async (sys) => {
    try { await sendJSON(`/api/admin/systems/${sys.id}`, 'PATCH', { check_kind: cfg.check_kind, check_target: cfg.check_target.trim() }); setCfgId(null); await load(); }
    catch (e) { alert(e.message || 'Не удалось сохранить'); }
  };

  if (!mon && !d) return <div className="adm-hint">{err ? 'Мониторинг недоступен' : 'Загрузка мониторинга…'}</div>;
  const s = d?.server || {};
  const sla = mon?.sla || { total: 0, byStatus: {}, avgUptime: 100, openInc: 0 };
  const overallOk = (sla.byStatus.down || 0) === 0 && (sla.byStatus.degraded || 0) === 0;

  return (
    <>
      <div className="nm-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2>Мониторинг ИТ-систем</h2>
        <button className="adm-btn sm" onClick={checkNow} disabled={checking} title="Запустить реальные проверки доступности прямо сейчас">{checking ? 'Проверяю…' : '⟳ Проверить сейчас'}</button>
      </div>
      <div className="adm-note">Реестр систем ЦЦР с реальными проверками доступности (пинг каждые 30 сек), инциденты и телеметрия сервера. <b>Live</b> — статус измеряется автоматически; <b>ручной</b> — выставляется дежурным.</div>

      {/* Общий статус + SLA */}
      <div className={`mon-banner ${overallOk ? 'ok' : 'warn'}`}>
        <span className="mon-banner-dot" />
        <b>{overallOk ? 'Все системы работают штатно' : 'Есть отклонения в работе систем'}</b>
        <div className="mon-sla">
          <span>Средний аптайм <b>{sla.avgUptime}%</b></span>
          <span className="ok">● {sla.byStatus.operational || 0} работают</span>
          {(sla.byStatus.degraded || 0) > 0 && <span className="warn">● {sla.byStatus.degraded} деградация</span>}
          {(sla.byStatus.down || 0) > 0 && <span className="bad">● {sla.byStatus.down} сбой</span>}
          {(sla.byStatus.maintenance || 0) > 0 && <span className="mnt">● {sla.byStatus.maintenance} обслуживание</span>}
          <span>Открытых инцидентов <b>{sla.openInc}</b></span>
        </div>
      </div>

      {/* Реестр систем со статусами */}
      <div className="mon-systems">
        {(mon?.systems || []).map((sys) => {
          const [lbl, col] = ST[sys.status] || ST.operational;
          const auto = sys.check_kind && sys.check_kind !== 'none';
          const editing = cfgId === sys.id;
          return (
            <div className="mon-sys" key={sys.id} style={{ '--c': col }}>
              <div className="mon-sys-top">
                <span className="mon-sys-dot" />
                <div className="mon-sys-t"><b>{sys.name}</b><small>{sys.category}{sys.owner ? ` · ${sys.owner}` : ''}</small></div>
                <span className="mon-sys-badge">{lbl}</span>
              </div>
              <div className="mon-sys-up"><span className="mon-sys-bar"><i style={{ width: `${Math.min(100, sys.uptime)}%` }} /></span><b>{Number(sys.uptime).toFixed(2)}%</b></div>
              <div className="mon-sys-live">
                {auto ? (
                  <span className="mon-live" title={`Авто-проверка: ${CHECK_KIND[sys.check_kind]}${sys.check_target ? ' · ' + sys.check_target : ''}`}>
                    <span className="mon-live-dot" /> live · {CHECK_KIND[sys.check_kind]}
                    {sys.latency_ms != null && <> · {sys.latency_ms} мс</>}
                    {sys.last_checked && <> · {ago(sys.last_checked)} назад</>}
                  </span>
                ) : <span className="mon-manual">ручной статус</span>}
                <button className="mon-cfg-btn" onClick={() => (editing ? setCfgId(null) : openCfg(sys))} title="Настроить проверку доступности">⚙</button>
              </div>
              {sys.note && <div className="mon-sys-note">{sys.note}</div>}
              {editing ? (
                <div className="mon-cfg">
                  <select className="adm-input" value={cfg.check_kind} onChange={(e) => setCfg({ ...cfg, check_kind: e.target.value })}>
                    {Object.entries(CHECK_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {(cfg.check_kind === 'http' || cfg.check_kind === 'tcp') && (
                    <input className="adm-input" placeholder={cfg.check_kind === 'http' ? 'https://адрес' : 'host:port'} value={cfg.check_target}
                      onChange={(e) => setCfg({ ...cfg, check_target: e.target.value })} />
                  )}
                  <div className="mon-cfg-act">
                    <button className="adm-btn sm" onClick={() => saveCfg(sys)}>Сохранить</button>
                    <button className="adm-ghost sm" onClick={() => setCfgId(null)}>Отмена</button>
                  </div>
                </div>
              ) : (
                <select className="adm-input mon-sys-sel" value={sys.status} onChange={(e) => setStatus(sys, e.target.value)}
                  title={auto ? 'У авто-систем статус измеряется пингом; ручной выбор перезапишется при следующей проверке (кроме «Обслуживание»)' : ''}>
                  {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {/* Инциденты */}
      <div className="nm-head" style={{ marginTop: 26 }}><h2>Инциденты</h2></div>
      <form className="mon-inc-form" onSubmit={addIncident}>
        <input className="adm-input" placeholder="Заголовок инцидента" value={inc.title} onChange={(e) => setInc({ ...inc, title: e.target.value })} />
        <select className="adm-input" value={inc.system_id} onChange={(e) => setInc({ ...inc, system_id: e.target.value })}>
          <option value="">— система —</option>
          {(mon?.systems || []).map((sys) => <option key={sys.id} value={sys.id}>{sys.name}</option>)}
        </select>
        <select className="adm-input" value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })}>
          {Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
        </select>
        <button className="adm-btn" type="submit">+ Инцидент</button>
      </form>
      <div className="mon-incidents">
        {(mon?.incidents || []).length === 0 && <div className="adm-empty">Инцидентов нет.</div>}
        {(mon?.incidents || []).map((i) => {
          const [sl, sc] = SEV[i.severity] || SEV.minor;
          const resolved = i.status === 'resolved';
          return (
            <div className={`mon-inc ${resolved ? 'resolved' : ''}`} key={i.id}>
              <span className="mon-inc-sev" style={{ '--c': sc }}>{sl}</span>
              <div className="mon-inc-b">
                <b>{i.title}</b>
                <small>{i.system_name || 'без системы'} · {INCST[i.status]} · {resolved ? `решён ${ago(i.resolved_at)} назад` : `${ago(i.started_at)} в работе`}</small>
                {i.note && <p>{i.note}</p>}
              </div>
              {!resolved && (
                <div className="mon-inc-act">
                  {i.status === 'open' && <button className="adm-ghost sm" onClick={() => setIncStatus(i, 'monitoring')}>Наблюдение</button>}
                  <button className="adm-btn sm" onClick={() => setIncStatus(i, 'resolved')}>Решён</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Телеметрия сервера (как было) */}
      {d && (<>
        <div className="nm-head" style={{ marginTop: 26 }}><h2>Сервер</h2></div>
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
          </div>
          <div className="sys-card sys-feed">
            <div className="sys-h">Последние изменения</div>
            <div className="sys-feed-list">
              {d.activity.length === 0 && <div className="adm-empty">Пока нет событий.</div>}
              {d.activity.map((a, i) => (
                <div className={`sys-ev e-${a.type}`} key={i}>
                  <span className="sys-ev-dot" /><span className="sys-ev-t">{a.text}</span><time>{ago(a.at)}</time>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>)}
    </>
  );
}
