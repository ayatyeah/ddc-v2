import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { SERVICE_ICONS, SERVICE_ICON_KEYS } from '../site/icons.jsx';
import { emitAdminDataChange, useAdminDataSync } from './adminEvents.js';

const LANGS = [['ru', 'RU'], ['kk', 'KZ'], ['en', 'EN']];

function blank() {
  return {
    name_ru: '', name_kk: '', name_en: '',
    desc_ru: '', desc_kk: '', desc_en: '',
    icon: 'code', color: '#2f6fe0', sort_order: 0, published: true,
  };
}

function Editor({ initial, onClose, onSaved, onAuthLost }) {
  const [form, setForm] = useState(() => ({ ...blank(), ...initial }));
  const [lang, setLang] = useState('ru');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = Boolean(initial?.id);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name_ru.trim()) { setErr('Название (RU) обязательно'); setLang('ru'); return; }
    setBusy(true); setErr('');
    try {
      if (isEdit) await sendJSON(`/api/admin/services/${initial.id}`, 'PUT', form);
      else await sendJSON('/api/admin/services', 'POST', form);
      onSaved();
    } catch (e) {
      if (e.status === 401) { onAuthLost?.(); return; }
      setErr(e.message || 'Ошибка сохранения');
      setBusy(false);
    }
  };

  const Ico = SERVICE_ICONS[form.icon] || SERVICE_ICONS.code;

  return (
    <div className="nm-ov" onClick={onClose}>
      <div className="nm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h3>{isEdit ? 'Редактировать услугу' : 'Новая услуга'}</h3>
          <button className="x" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="nm-body">
          <div className="nm-langtabs">
            {LANGS.map(([l, lbl]) => (
              <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}>{lbl}</button>
            ))}
          </div>

          <div>
            <label className="nm-lab">Название ({lang.toUpperCase()})</label>
            <input className="adm-input" value={form[`name_${lang}`]} onChange={set(`name_${lang}`)} />
          </div>
          <div>
            <label className="nm-lab">Описание ({lang.toUpperCase()})</label>
            <textarea className="adm-input" value={form[`desc_${lang}`]} onChange={set(`desc_${lang}`)} />
          </div>

          <div>
            <label className="nm-lab">Иконка</label>
            <div className="svc-icon-pick">
              {SERVICE_ICON_KEYS.map((k) => {
                const I = SERVICE_ICONS[k];
                return (
                  <button key={k} type="button" title={k}
                    className={`svc-icon-opt ${form.icon === k ? 'active' : ''}`}
                    style={form.icon === k ? { color: form.color, borderColor: form.color } : undefined}
                    onClick={() => setForm((f) => ({ ...f, icon: k }))}>
                    <I size={20} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="nm-2col">
            <div>
              <label className="nm-lab">Цвет акцента</label>
              <input className="adm-input" type="color" style={{ height: 44, padding: 4 }} value={form.color} onChange={set('color')} />
            </div>
            <div>
              <label className="nm-lab">Порядок вывода</label>
              <input className="adm-input" type="number" min="0" value={form.sort_order} onChange={set('sort_order')} />
            </div>
          </div>

          {err && <div className="adm-err">{err}</div>}

          <div className="nm-foot">
            <label className="nm-check">
              <input type="checkbox" checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} />
              Опубликовано (видно на сайте)
            </label>
            <span className="sp" />
            <button className="adm-ghost" onClick={onClose}>Отмена</button>
            <button className="adm-btn" onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ServicesManager({ onAuthLost, canEdit = true }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getJSON('/api/admin/services');
      setItems(Array.isArray(d) ? d : []);
    } catch (e) {
      if (e.status === 401) onAuthLost?.();
    } finally { setLoaded(true); }
  }, [onAuthLost]);

  useEffect(() => { load(); }, [load]);
  useAdminDataSync(load);

  const remove = async (id) => {
    if (!window.confirm('Удалить эту услугу?')) return;
    try {
      const r = await apiFetch(`/api/admin/services/${id}`, { method: 'DELETE' });
      if (r.status === 401) { onAuthLost?.(); return; }
      emitAdminDataChange('services');
      load();
    } catch {}
  };

  return (
    <>
      <div className="nm-head">
        <h2>Услуги</h2>
        <span style={{ flex: 1 }} />
        {canEdit && <button className="adm-btn" onClick={() => setEditing({})}>+ Добавить услугу</button>}
      </div>
      {!canEdit && <div className="adm-note">Режим просмотра: редактирование услуг недоступно для вашей роли.</div>}

      {loaded && items.length === 0 ? (
        <div className="adm-empty">Услуг пока нет.{canEdit ? ' Нажмите «Добавить услугу».' : ''}</div>
      ) : (
        <div className="nm-grid">
          {items.map((row) => {
            const Ico = SERVICE_ICONS[row.icon] || SERVICE_ICONS.code;
            return (
              <div className="nm-card" key={row.id}>
                <div className="bar" style={{ background: row.color || '#2f6fe0' }} />
                <div className="in">
                  <div className="nm-tags">
                    <span className="svc-mini-ico" style={{ color: row.color }}><Ico size={18} /></span>
                    <span className={`nm-badge ${row.published ? 'pub' : 'draft'}`}>{row.published ? 'Опубликовано' : 'Скрыто'}</span>
                  </div>
                  <h3>{row.name_ru || '(без названия)'}</h3>
                  <p>{row.desc_ru || ''}</p>
                  {canEdit && (
                    <div className="nm-row">
                      <button className="nm-mini" onClick={() => setEditing(row)}>Редактировать</button>
                      <button className="nm-mini del" onClick={() => remove(row.id)}>Удалить</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && canEdit && (
        <Editor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); emitAdminDataChange('services'); load(); }}
          onAuthLost={onAuthLost}
        />
      )}
    </>
  );
}
