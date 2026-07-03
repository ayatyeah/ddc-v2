import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

const CATS = {
  company: { label: 'Компания', color: '#2f6fe0' },
  hr: { label: 'HR', color: '#0a8a5a' },
  it: { label: 'IT', color: '#5a3fd6' },
  finance: { label: 'Финансы', color: '#b07d12' },
  event: { label: 'Событие', color: '#c0455a' },
};
const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };

export default function PortalNews({ me, onAuthLost }) {
  const [items, setItems] = useState([]);
  const [canWrite, setCanWrite] = useState(false);
  const [cat, setCat] = useState('all');
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    try { const d = await getJSON('/api/portal/news'); setItems(d.items || []); setCanWrite(!!d.canWrite); }
    catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [onAuthLost]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim() || !form.body.trim()) return;
    try {
      await sendJSON('/api/portal/news', 'POST', { title: form.title.trim(), body: form.body.trim(), category: form.category, pinned: form.pinned, author_name: me?.username });
      setForm(null); load();
    } catch (e2) { if (e2.status === 401) onAuthLost?.(); else alert(e2.message || 'Не удалось'); }
  };
  const del = async (n) => {
    if (!confirm('Удалить новость?')) return;
    try { await sendJSON(`/api/portal/news/${n.id}`, 'DELETE'); load(); } catch (e) { if (e.status === 401) onAuthLost?.(); }
  };

  const shown = cat === 'all' ? items : items.filter((n) => n.category === cat);
  const canDelete = (n) => me?.role === 'admin' || n.author_id === me?.id;

  return (
    <div className="pt-view pt-news">
      <div className="pt-view-h">
        <h2>Новости</h2>
        <span className="pt-hint">Объявления и корпоративные новости</span>
        {canWrite && <button className="adm-btn sm pt-view-act" onClick={() => setForm({ title: '', body: '', category: 'company', pinned: false })}>+ Написать</button>}
      </div>

      <div className="cal-filters">
        <button className={`cal-fchip ${cat === 'all' ? 'on' : ''}`} style={{ '--c': '#5b6472' }} onClick={() => setCat('all')}><span className="cal-dot" /> Все</button>
        {Object.entries(CATS).map(([k, v]) => (
          <button key={k} className={`cal-fchip ${cat === k ? 'on' : ''}`} style={{ '--c': v.color }} onClick={() => setCat(k)}>
            <span className="cal-dot" /> {v.label}
          </button>
        ))}
      </div>

      {shown.length === 0 && <div className="pt-empty">Новостей пока нет.</div>}
      <div className="news-feed">
        {shown.map((n) => {
          const c = CATS[n.category] || CATS.company;
          return (
            <article className={`news-card ${n.pinned ? 'pinned' : ''}`} key={n.id} style={{ '--c': c.color }}>
              <div className="news-card-top">
                <span className="news-cat">{c.label}</span>
                {n.pinned && <span className="news-pin">📌 Закреплено</span>}
                <span className="news-date">{fmtDate(n.created_at)}</span>
                {canDelete(n) && <button className="cal-del" onClick={() => del(n)} aria-label="Удалить">×</button>}
              </div>
              <h3 className="news-title">{n.title}</h3>
              <div className="news-body">{n.body}</div>
              <div className="news-author"><span className="pt-av xs">{initials(n.author_name)}</span>{n.author_name}</div>
            </article>
          );
        })}
      </div>

      {form && (
        <div className="pt-modal-bg" onClick={() => setForm(null)}>
          <form className="pt-modal wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3>Новая новость</h3>
            <div className="cal-form-row">
              <div className="adm-field"><label>Категория</label>
                <select className="adm-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <label className="cal-allday" style={{ alignSelf: 'end', paddingBottom: 10 }}>
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Закрепить
              </label>
            </div>
            <div className="adm-field"><label>Заголовок</label>
              <input className="adm-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></div>
            <div className="adm-field"><label>Текст</label>
              <textarea className="adm-input" rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
            <div className="pt-modal-foot">
              <button type="button" className="adm-btn ghost" onClick={() => setForm(null)}>Отмена</button>
              <button type="submit" className="adm-btn">Опубликовать</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
