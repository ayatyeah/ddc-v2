import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';

const DOC_TYPES = [
  { id: 'memo', label: 'Служебная записка' },
  { id: 'statement', label: 'Заявление' },
  { id: 'order', label: 'Приказ' },
  { id: 'letter', label: 'Деловое письмо' },
  { id: 'explanatory', label: 'Объяснительная' },
  { id: 'request', label: 'Служебный запрос' },
];
const typeLabel = (id) => DOC_TYPES.find((t) => t.id === id)?.label || id || 'Документ';
const DOC_CATS = [
  { id: 'general', label: 'Общие', color: '#5b6472' },
  { id: 'hr', label: 'Кадровые', color: '#0a8a5a' },
  { id: 'finance', label: 'Финансовые', color: '#b07d12' },
  { id: 'legal', label: 'Юридические', color: '#5a3fd6' },
  { id: 'it', label: 'ИТ', color: '#2f6fe0' },
];
const catLabel = (id) => DOC_CATS.find((c) => c.id === id)?.label || 'Общие';
const catColor = (id) => DOC_CATS.find((c) => c.id === id)?.color || '#5b6472';
const fmtDate = (v) => { try { return new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const EMPTY = { type: 'memo', category: 'general', to: '', subject: '', details: '' };

// Раздел «Документы»: ИИ-генерация документов + предпросмотр PDF прямо на странице.
export default function Documents({ me, onAuthLost }) {
  const [view, setView] = useState('list');   // list | create | preview
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [active, setActive] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [gen, setGen] = useState(null);        // { title, body } — сгенерированный черновик
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => getJSON('/api/portal/docs').then(setItems).catch((e) => { if (e.status === 401) onAuthLost?.(); }), [onAuthLost]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (!form.subject.trim() && !form.details.trim()) { setErr('Укажите тему или суть документа'); return; }
    setBusy(true); setErr('');
    try { const r = await sendJSON('/api/portal/docs/generate', 'POST', form); setGen({ title: r.title, body: r.body }); }
    catch (e) { if (e.status === 401) onAuthLost?.(); else setErr(e.message || 'ИИ недоступен'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!gen) return;
    setBusy(true); setErr('');
    try {
      const d = await sendJSON('/api/portal/docs', 'POST', { title: gen.title, doc_type: form.type, category: form.category, body: gen.body });
      setGen(null); setForm(EMPTY); load(); setActive(d); setView('preview');
    } catch (e) { if (e.status === 401) onAuthLost?.(); else setErr(e.message || 'Не удалось сохранить'); }
    finally { setBusy(false); }
  };
  const del = async (d, e) => {
    e?.stopPropagation?.();
    if (!window.confirm('Удалить документ?')) return;
    try { await apiFetch(`/api/portal/docs/${d.id}`, { method: 'DELETE' }); load(); } catch {}
  };

  const ql = q.trim().toLowerCase();
  const list = items
    .filter((d) => catFilter === 'all' || (d.category || 'general') === catFilter)
    .filter((d) => !ql || [d.title, typeLabel(d.doc_type), catLabel(d.category), d.author_name].some((x) => (x || '').toLowerCase().includes(ql)));

  // ── Предпросмотр PDF ──
  if (view === 'preview' && active) {
    return (
      <div className="pt-view pt-docview">
        <div className="pt-doc-bar">
          <button className="pt-back-btn" onClick={() => { setActive(null); setView('list'); }} aria-label="Назад">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="pt-doc-bar-t"><b>{active.title}</b><small>{typeLabel(active.doc_type)}</small></div>
          <a className="adm-btn pt-doc-dl" href={`/api/portal/docs/${active.id}/pdf?download=1`} target="_blank" rel="noreferrer">Скачать PDF</a>
        </div>
        <iframe className="pt-doc-frame" src={`/api/portal/docs/${active.id}/pdf`} title={active.title} />
      </div>
    );
  }

  // ── Создание (форма → генерация → черновик) ──
  if (view === 'create') {
    return (
      <div className="pt-view">
        <div className="pt-view-h"><h2>Создать документ</h2>
          <button className="pt-new pt-new-ghost" onClick={() => { setView('list'); setGen(null); setErr(''); }}>← К списку</button>
        </div>
        {!gen ? (
          <div className="pt-doc-form">
            <div className="cal-form-row">
              <label className="pt-doc-lab" style={{ flex: 1 }}>Тип документа
                <select className="adm-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label className="pt-doc-lab" style={{ flex: 1 }}>Категория
                <select className="adm-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {DOC_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <input className="adm-input" placeholder="Кому / адресат (напр. Директору департамента ИС)" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
            <input className="adm-input" placeholder="Тема документа" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            <textarea className="adm-input pt-doc-details" placeholder="Суть: что нужно изложить (ИИ развернёт в официальный текст)" value={form.details} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))} />
            <button className="adm-btn" onClick={generate} disabled={busy}>{busy ? 'ИИ пишет документ…' : '✨ Сгенерировать документ'}</button>
            {err && <div className="adm-err">{err}</div>}
          </div>
        ) : (
          <div className="pt-doc-gen">
            <div className="pt-doc-gen-h">Черновик готов — проверьте и при необходимости отредактируйте:</div>
            <input className="adm-input pt-doc-title" value={gen.title} onChange={(e) => setGen((g) => ({ ...g, title: e.target.value }))} />
            <textarea className="adm-input pt-doc-body" value={gen.body} onChange={(e) => setGen((g) => ({ ...g, body: e.target.value }))} />
            {err && <div className="adm-err">{err}</div>}
            <div className="pt-doc-actions">
              <button className="adm-ghost" onClick={() => setGen(null)}>← Изменить запрос</button>
              <button className="adm-ghost" onClick={generate} disabled={busy}>{busy ? '…' : 'Перегенерировать'}</button>
              <button className="adm-btn" onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить и открыть'}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Список ──
  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Документы</h2>
        <button className="pt-new" onClick={() => { setView('create'); setGen(null); setForm(EMPTY); setErr(''); }}>+ Создать</button>
      </div>
      <input className="adm-input pt-search" placeholder="Поиск документа…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="cal-filters">
        <button className={`cal-fchip ${catFilter === 'all' ? 'on' : ''}`} style={{ '--c': '#5b6472' }} onClick={() => setCatFilter('all')}><span className="cal-dot" /> Все</button>
        {DOC_CATS.map((c) => (
          <button key={c.id} className={`cal-fchip ${catFilter === c.id ? 'on' : ''}`} style={{ '--c': c.color }} onClick={() => setCatFilter(c.id)}><span className="cal-dot" /> {c.label}</button>
        ))}
      </div>
      <div className="pt-docs">
        {list.map((d) => (
          <div className="pt-doc-card" key={d.id}>
            <button className="pt-doc-open" onClick={() => { setActive(d); setView('preview'); }}>
              <span className="pt-doc-ic" style={{ color: catColor(d.category) }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></svg>
              </span>
              <span className="pt-doc-t"><b>{d.title}</b><small>{catLabel(d.category)} · {typeLabel(d.doc_type)} · {d.author_name} · {fmtDate(d.created_at)}</small></span>
            </button>
            {(d.author_id === me?.id || ['admin', 'manager'].includes(me?.role)) && (
              <button className="nm-mini del" onClick={(e) => del(d, e)}>Удалить</button>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="pt-empty">{items.length ? 'Ничего не найдено.' : 'Документов пока нет. Создайте первый — ИИ напишет его за вас.'}</div>}
      </div>
    </div>
  );
}
