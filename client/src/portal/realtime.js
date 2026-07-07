// Единое SSE-соединение портала: живые уведомления, сообщения и присутствие (online).
// Компоненты подписываются через on(event, fn); соединение живёт, пока есть подписчики.
// EventSource сам переподключается при обрыве. Cookie-сессия отправляется автоматически (same-origin).
import { useEffect, useReducer } from 'react';
let es = null, refs = 0;
const listeners = new Map();   // event -> Set<fn>
export const onlineSet = new Set();   // id онлайн-пользователей

const emit = (event, data) => { const s = listeners.get(event); if (s) for (const fn of [...s]) { try { fn(data); } catch { /* подписчик упал — не роняем остальных */ } } };

// Сервер шлёт ИМЕНОВАННЫЕ SSE-события (event: task / request / poll / booking / event…),
// а EventSource доставляет только те, на которые навешан addEventListener. Раньше были
// прошиты 4 имени — подписки вкладок (rtOn('request'…)) молча не срабатывали. Теперь
// слушатель для имени вешается динамически при первой подписке (и перевешивается,
// если соединение пересоздали).
const wired = new Set();
function wire(name) {
  if (!es || wired.has(name)) return;
  wired.add(name);
  if (name === 'presence' || name === 'hello') return;   // спец-обработка ниже
  es.addEventListener(name, (e) => { try { emit(name, JSON.parse(e.data)); } catch { /* ignore */ } });
}

function ensure() {
  if (es || typeof window === 'undefined' || !window.EventSource) return;
  es = new EventSource('/api/portal/stream', { withCredentials: true });
  wired.clear();
  es.addEventListener('hello', (e) => { try { const d = JSON.parse(e.data); onlineSet.clear(); (d.online || []).forEach((id) => onlineSet.add(Number(id))); emit('presence', null); } catch { /* ignore */ } });
  es.addEventListener('presence', (e) => { try { const d = JSON.parse(e.data); if (d.online) onlineSet.add(Number(d.userId)); else onlineSet.delete(Number(d.userId)); emit('presence', d); } catch { /* ignore */ } });
  wired.add('hello'); wired.add('presence');
  for (const name of listeners.keys()) wire(name);   // подписки, оформленные до соединения
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
  wire(event);   // соединение уже открыто — довешиваем слушатель имени
  return () => { listeners.get(event)?.delete(fn); };
}

export const isOnline = (id) => onlineSet.has(Number(id));

// Хук: перерисовывает компонент при изменении присутствия. Возвращает предикат isOnline.
export function usePresence() {
  const [, tick] = useReducer((x) => x + 1, 0);
  useEffect(() => on('presence', tick), []);
  return isOnline;
}
