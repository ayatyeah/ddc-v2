// Единое SSE-соединение портала: живые уведомления, сообщения и присутствие (online).
// Компоненты подписываются через on(event, fn); соединение живёт, пока есть подписчики.
// EventSource сам переподключается при обрыве. Cookie-сессия отправляется автоматически (same-origin).
import { useEffect, useReducer } from 'react';
let es = null, refs = 0;
const listeners = new Map();   // event -> Set<fn>
export const onlineSet = new Set();   // id онлайн-пользователей

const emit = (event, data) => { const s = listeners.get(event); if (s) for (const fn of [...s]) { try { fn(data); } catch { /* подписчик упал — не роняем остальных */ } } };

function ensure() {
  if (es || typeof window === 'undefined' || !window.EventSource) return;
  es = new EventSource('/api/portal/stream', { withCredentials: true });
  es.addEventListener('hello', (e) => { try { const d = JSON.parse(e.data); onlineSet.clear(); (d.online || []).forEach((id) => onlineSet.add(Number(id))); emit('presence', null); } catch { /* ignore */ } });
  es.addEventListener('presence', (e) => { try { const d = JSON.parse(e.data); if (d.online) onlineSet.add(Number(d.userId)); else onlineSet.delete(Number(d.userId)); emit('presence', d); } catch { /* ignore */ } });
  es.addEventListener('notification', (e) => { try { emit('notification', JSON.parse(e.data)); } catch { /* ignore */ } });
  es.addEventListener('chat', (e) => { try { emit('chat', JSON.parse(e.data)); } catch { /* ignore */ } });
  es.onerror = () => { /* EventSource переподключится сам */ };
}

// Держим соединение, пока есть хотя бы один потребитель (обычно PortalApp).
export function connect() {
  refs++; ensure();
  return () => { refs = Math.max(0, refs - 1); if (refs === 0 && es) { es.close(); es = null; } };
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => { listeners.get(event)?.delete(fn); };
}

export const isOnline = (id) => onlineSet.has(Number(id));

// Хук: перерисовывает компонент при изменении присутствия. Возвращает предикат isOnline.
export function usePresence() {
  const [, tick] = useReducer((x) => x + 1, 0);
  useEffect(() => on('presence', tick), []);
  return isOnline;
}
