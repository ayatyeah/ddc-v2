import { useEffect, useRef, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

/* Колокольчик уведомлений в шапке админки.
   Доставка — поллингом раз в 30с (см. план: без доп. инфраструктуры).
   Открытие дропдауна помечает непрочитанные как прочитанные. */
export default function NotificationBell({ onOpenLead }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const load = async () => {
    try { const d = await getJSON('/api/notifications'); setItems(d.items || []); setUnread(d.unread || 0); } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Закрытие по клику вне
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread > 0) {
      try { await sendJSON('/api/notifications/read', 'POST', {}); } catch {}
      setUnread(0);
      setItems((xs) => xs.map((i) => ({ ...i, read: true })));
    }
  };

  const click = (n) => { setOpen(false); if (n.lead_id) onOpenLead?.(n.lead_id); };

  const fmt = (iso) => {
    try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div className="notif" ref={boxRef}>
      <button className="notif-btn" onClick={toggle} aria-label="Уведомления" title="Уведомления">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="notif-head">Уведомления</div>
          {items.length === 0 && <div className="notif-empty">Пока пусто</div>}
          {items.map((n) => (
            <button key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => click(n)}>
              <div className="notif-title">{n.title}</div>
              {n.body && <div className="notif-body">{n.body}</div>}
              <div className="notif-time">{fmt(n.created_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
