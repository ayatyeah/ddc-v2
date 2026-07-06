import { useEffect, useState, useCallback } from 'react';
import { getJSON } from '../api.js';

const EV = {
  success: ['Успешный вход', '#1f9d57'], fail: ['Неверный пароль', '#c0455a'],
  '2fa_success': ['2FA пройдена', '#1f9d57'], '2fa_fail': ['2FA неверна', '#c0455a'],
};
const ROLE_LBL = { admin: 'Администратор', manager: 'Начальник', staff: 'Сотрудник', editor: 'Редактор', viewer: 'Просмотр' };
const when = (iso) => { try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const ago = (iso) => { const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return 'только что'; const m = Math.floor(s / 60); if (m < 60) return `${m} мин`; return `${Math.floor(m / 60)} ч`; };
const shortUa = (ua) => { if (!ua) return '—'; if (/Firefox/.test(ua)) return 'Firefox'; if (/Edg/.test(ua)) return 'Edge'; if (/Chrome/.test(ua)) return 'Chrome'; if (/Safari/.test(ua)) return 'Safari'; return ua.slice(0, 24); };

// Матрица ролей и доступов (наглядно «кто что может»).
const CAPS = [
  ['Заявки с сайта', { admin: 1, manager: 1, staff: 1, editor: 1, viewer: 0 }],
  ['Назначение исполнителя', { admin: 1, manager: 1, staff: 0, editor: 0, viewer: 0 }],
  ['ИИ-аналитика', { admin: 1, manager: 1, staff: 0, editor: 0, viewer: 0 }],
  ['Веб-аналитика', { admin: 1, manager: 1, staff: 0, editor: 0, viewer: 0 }],
  ['Карьера / отклики', { admin: 1, manager: 1, staff: 0, editor: 0, viewer: 0 }],
  ['Мониторинг ИТ-систем', { admin: 1, manager: 1, staff: 0, editor: 0, viewer: 0 }],
  ['CMS (услуги, новости)', { admin: 1, manager: 0, staff: 0, editor: 1, viewer: 0 }],
  ['Согласование заявок портала', { admin: 1, manager: 1, staff: 0, editor: 0, viewer: 0 }],
  ['Управление пользователями', { admin: 1, manager: 0, staff: 0, editor: 0, viewer: 0 }],
];
const ROLES = ['admin', 'manager', 'editor', 'staff', 'viewer'];

export default function Security({ onAuthLost }) {
  const [d, setD] = useState(null);
  const load = useCallback(() => getJSON('/api/admin/security').then(setD).catch((e) => { if (e.status === 401) onAuthLost?.(); }), [onAuthLost]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  if (!d) return <div className="adm-hint">Загрузка аудита безопасности…</div>;
  const tw = d.twofa || { total: 0, enabled: 0 };
  const pct = tw.total ? Math.round((tw.enabled / tw.total) * 100) : 0;

  return (
    <>
      <div className="nm-head"><h2>Безопасность</h2></div>
      <div className="adm-note">Журнал входов, охват двухфакторной аутентификации, активные сессии и матрица доступов.</div>

      <div className="sec-cards">
        <div className="sec-card">
          <div className="sec-card-h">Охват 2FA</div>
          <div className="sec-big">{pct}<small>%</small></div>
          <div className="sec-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="sec-sub">{tw.enabled} из {tw.total} сотрудников</div>
        </div>
        <div className="sec-card">
          <div className="sec-card-h">Активные сессии</div>
          <div className="sec-big">{d.onlineCount}</div>
          <div className="sec-sub">сейчас онлайн</div>
        </div>
        <div className="sec-card">
          <div className="sec-card-h">Неудачные входы</div>
          <div className="sec-big" style={{ color: d.failed24 > 0 ? '#c0455a' : undefined }}>{d.failed24}</div>
          <div className="sec-sub">за 24 часа</div>
        </div>
      </div>

      <div className="sec-grid">
        <div className="sec-block">
          <div className="sec-block-h">Активные сессии</div>
          {(d.sessions || []).length === 0 ? <div className="adm-empty">Нет активных сессий сотрудников с учётной записью.</div> : (
            <div className="sec-sessions">
              {d.sessions.map((s) => (
                <div className="sec-sess" key={s.id}>
                  <span className="sec-sess-dot" />
                  <span className="sec-sess-n">{s.name}<small>{ROLE_LBL[s.role] || s.role}</small></span>
                  <span className="sec-sess-t">{s.last_seen ? ago(s.last_seen) : 'онлайн'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sec-block">
          <div className="sec-block-h">Журнал входов</div>
          <div className="sec-events">
            {(d.events || []).length === 0 ? <div className="adm-empty">Событий пока нет.</div> : d.events.map((e, i) => {
              const [lbl, col] = EV[e.event] || [e.event, '#8a8a8a'];
              return (
                <div className="sec-ev" key={i}>
                  <span className="sec-ev-badge" style={{ '--c': col }}>{lbl}</span>
                  <span className="sec-ev-u">{e.username || '—'}</span>
                  <span className="sec-ev-m">{e.ip || '—'} · {shortUa(e.ua)}</span>
                  <time>{when(e.created_at)}</time>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sec-block" style={{ marginTop: 18 }}>
        <div className="sec-block-h">Матрица ролей и доступов</div>
        <div className="sec-matrix-wrap">
          <table className="sec-matrix">
            <thead><tr><th>Возможность</th>{ROLES.map((r) => <th key={r}>{ROLE_LBL[r]}</th>)}</tr></thead>
            <tbody>
              {CAPS.map(([cap, m]) => (
                <tr key={cap}><td>{cap}</td>{ROLES.map((r) => <td key={r} className={m[r] ? 'yes' : 'no'}>{m[r] ? '✓' : '—'}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
