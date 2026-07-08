import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { on as rtOn } from './realtime.js';

const HH = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const today = () => new Date().toISOString().slice(0, 10);
const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

// Раздел «Переговорные»: бронирование на выбранный день, контроль конфликтов, живое обновление.
export default function Booking({ me, onAuthLost }) {
  const [rooms, setRooms] = useState([]);
  const [day, setDay] = useState(today());
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState({ room_id: '', title: '', start: '10:00', end: '11:00' });

  const load = useCallback(() => getJSON(`/api/portal/bookings?day=${day}`).then((d) => setBookings(d.bookings || [])).catch((e) => { if (e.status === 401) onAuthLost?.(); }), [day, onAuthLost]);
  useEffect(() => { getJSON('/api/portal/rooms').then((r) => { setRooms(r); setForm((f) => ({ ...f, room_id: f.room_id || r[0]?.id || '' })); }).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => rtOn('booking', () => load()), [load]);

  const book = async (e) => {
    e?.preventDefault?.();
    const start_min = toMin(form.start), end_min = toMin(form.end);
    if (!(end_min > start_min)) { alert('Время окончания должно быть позже начала'); return; }
    try { await sendJSON('/api/portal/bookings', 'POST', { room_id: Number(form.room_id), day, title: form.title.trim() || 'Встреча', start_min, end_min }); setForm((f) => ({ ...f, title: '' })); load(); }
    catch (e2) { if (e2.status === 401) onAuthLost?.(); else alert(e2.message || 'Не удалось'); }
  };
  const cancel = async (b) => { if (!confirm('Отменить бронь?')) return; try { await apiFetch(`/api/portal/bookings/${b.id}`, { method: 'DELETE' }); load(); } catch {} };

  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Переговорные</h2><span className="pt-hint">Бронирование на день</span>
        <input type="date" className="adm-input pt-view-act" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <form className="book-form" onSubmit={book}>
        <select className="adm-input" value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.capacity} чел.</option>)}
        </select>
        <input className="adm-input" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        <input className="adm-input" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        <input className="adm-input book-title" placeholder="Тема встречи" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <button className="adm-btn" type="submit">Забронировать</button>
      </form>
      <div className="book-rooms">
        {rooms.map((r) => {
          const list = bookings.filter((b) => b.room_id === r.id).sort((a, b) => a.start_min - b.start_min);
          return (
            <div className="book-room" key={r.id}>
              <div className="book-room-h"><b>{r.name}</b><small>{r.capacity} чел.</small></div>
              {list.length === 0 ? <div className="book-free">свободна весь день</div>
                : list.map((b) => (
                  <div className="book-slot" key={b.id}>
                    <span className="book-time">{HH(b.start_min)}–{HH(b.end_min)}</span>
                    <span className="book-t"><b>{b.title}</b><small>{b.user_name}</small></span>
                    {(b.user_id === me?.id || ['admin', 'manager'].includes(me?.role)) && <button className="book-x" onClick={() => cancel(b)} aria-label="Отменить">×</button>}
                  </div>
                ))}
            </div>
          );
        })}
        {rooms.length === 0 && <div className="pt-empty">Переговорные не настроены.</div>}
      </div>
    </div>
  );
}
