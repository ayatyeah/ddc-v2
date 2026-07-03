import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

// Уведомления сотрудника: поллинг /api/notifications, дропдаун, переход в нужный раздел по клику.
const TYPE_TAB = { task: 'tasks', dm: 'dm', chat: 'chat', request: 'requests', news: 'news', assignment: 'tasks' };
const fmtWhen = (iso) => { try { const d = new Date(iso); const diff = (Date.now() - d) / 6e4; if (diff < 1) return 'только что'; if (diff < 60) return `${Math.floor(diff)} мин`; if (diff < 1440) return `${Math.floor(diff / 60)} ч`; return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); } catch { return ''; } };

export default function PortalBell({ onGo, onAuthLost }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try { const d = await getJSON('/api/notifications'); setItems(d.items || []); setUnread(d.unread || 0); }
    catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [onAuthLost]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && unread > 0) { try { await sendJSON('/api/notifications/read', 'POST', {}); setUnread(0); } catch {} }
  };
  const click = (n) => { setOpen(false); const tab = TYPE_TAB[n.type]; if (tab) onGo?.(tab); };

  return (
    <div className="pt-bell" ref={ref}>
      <button className="pt-bell-btn" onClick={toggle} aria-label="Уведомления">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="pt-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="pt-bell-pop">
          <div className="pt-bell-h">Уведомления</div>
          {items.length === 0 && <div className="pt-empty sm">Пока пусто.</div>}
          {items.map((n) => (
            <button key={n.id} className={`pt-bell-item ${n.read ? '' : 'unread'}`} onClick={() => click(n)}>
              <div className="pt-bell-t">{n.title}</div>
              {n.body && <div className="pt-bell-b">{n.body}</div>}
              <div className="pt-bell-w">{fmtWhen(n.created_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
