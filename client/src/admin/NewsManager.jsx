import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';

const LANGS = [['ru', 'RU'], ['kk', 'KZ'], ['en', 'EN']];
const CROP_ASPECT = 16 / 9;   // соотношение кадра новости

/* Кадрирование: двигаем/масштабируем фото в рамке нужного соотношения, оставляя видимой
   нужную часть. Результат «запекается» в изображение фиксированного размера (1280×720),
   что заодно держит вес небольшим (нет ошибки «request entity too large»). */
function ImageCropper({ src, onApply, onCancel }) {
  const VIEW_W = 360, VIEW_H = Math.round(VIEW_W / CROP_ASPECT);
  const [nat, setNat] = useState(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  const clampOff = (o, s, n) => {
    if (!n) return o;
    const w = n.w * s, h = n.h * s;
    return { x: Math.min(0, Math.max(VIEW_W - w, o.x)), y: Math.min(0, Math.max(VIEW_H - h, o.y)) };
  };

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const cover = Math.max(VIEW_W / img.width, VIEW_H / img.height);
      const n = { w: img.width, h: img.height };
      setNat(n); setMinScale(cover); setScale(cover);
      setOff({ x: (VIEW_W - img.width * cover) / 2, y: (VIEW_H - img.height * cover) / 2 });
    };
    img.src = src;
  }, [src]);

  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} };
  const onMove = (e) => { if (!drag.current) return; setOff(clampOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }, scale, nat)); };
  const onUp = () => { drag.current = null; };
  const onZoom = (e) => {
    const s = Number(e.target.value), cx = VIEW_W / 2, cy = VIEW_H / 2, k = s / scale;
    setScale(s); setOff(clampOff({ x: cx - (cx - off.x) * k, y: cy - (cy - off.y) * k }, s, nat));
  };
  const apply = () => {
    if (!nat) return;
    const OUT_W = 1280, OUT_H = Math.round(OUT_W / CROP_ASPECT);
    const cv = document.createElement('canvas'); cv.width = OUT_W; cv.height = OUT_H;
    const sx = -off.x / scale, sy = -off.y / scale, sw = VIEW_W / scale, sh = VIEW_H / scale;
    const img = new Image();
    img.onload = () => { cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H); onApply(cv.toDataURL('image/jpeg', 0.82)); };
    img.src = src;
  };

  return (
    <div className="nm-crop-ov" onClick={onCancel}>
      <div className="nm-crop" onClick={(e) => e.stopPropagation()}>
        <div className="nm-crop-h">Кадрирование — двигайте фото и меняйте масштаб</div>
        <div className="nm-crop-view" style={{ width: VIEW_W, height: VIEW_H }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {nat && <img src={src} draggable={false} alt="" style={{ position: 'absolute', left: off.x, top: off.y, width: nat.w * scale, height: nat.h * scale }} />}
          <div className="nm-crop-grid" />
        </div>
        <div className="nm-crop-zoom">
          <span className="nm-fit-lab">Масштаб</span>
          <input type="range" min={minScale} max={minScale * 4} step="0.0001" value={scale} onChange={onZoom} />
        </div>
        <div className="nm-crop-actions">
          <button className="adm-ghost" onClick={onCancel}>Отмена</button>
          <button className="adm-btn" onClick={apply}>Применить кадр</button>
        </div>
      </div>
    </div>
  );
}

function blank() {
  return {
    title_ru: '', title_kk: '', title_en: '',
    excerpt_ru: '', excerpt_kk: '', excerpt_en: '',
    body_ru: '', body_kk: '', body_en: '',
    color: '#1a4aaa', image: '', image_fit: 'cover', image_pos: '50% 50%',
    news_date: new Date().toISOString().slice(0, 10),
    published: true,
  };
}

function fmtDate(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return value; }
}

/* Загружает файл, уменьшает до ширины <= 1280 и отдаёт data-URL (JPEG ~0.82). */
function fileToDataURL(file, maxW = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(cv.toDataURL(type, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function Editor({ initial, onClose, onSaved, onAuthLost }) {
  const [form, setForm] = useState(() => ({ ...blank(), ...initial, news_date: (initial?.news_date || blank().news_date).slice(0, 10) }));
  const [lang, setLang] = useState('ru');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cropSrc, setCropSrc] = useState('');
  const isEdit = Boolean(initial?.id);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { setErr('Файл должен быть изображением'); return; }
    try {
      const url = await fileToDataURL(file, 1600, 0.9);   // источник для кадрирования
      setCropSrc(url); setErr('');
    } catch (e2) { setErr(e2.message); }
  };

  const save = async () => {
    if (!form.title_ru.trim()) { setErr('Заголовок (RU) обязателен'); setLang('ru'); return; }
    setBusy(true); setErr('');
    try {
      if (isEdit) await sendJSON(`/api/admin/news/${initial.id}`, 'PUT', form);
      else await sendJSON('/api/admin/news', 'POST', form);
      onSaved();
    } catch (e) {
      if (e.status === 401) { onAuthLost?.(); return; }
      setErr(e.message || 'Ошибка сохранения');
      setBusy(false);
    }
  };

  return (
    <div className="nm-ov" onClick={onClose}>
      <div className="nm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h3>{isEdit ? 'Редактировать новость' : 'Новая новость'}</h3>
          <button className="x" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="nm-body">
          <div className="nm-langtabs">
            {LANGS.map(([l, lbl]) => (
              <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}>{lbl}</button>
            ))}
          </div>

          <div>
            <label className="nm-lab">Заголовок ({lang.toUpperCase()})</label>
            <input className="adm-input" value={form[`title_${lang}`]} onChange={set(`title_${lang}`)} />
          </div>
          <div>
            <label className="nm-lab">Краткое описание ({lang.toUpperCase()})</label>
            <textarea className="adm-input" value={form[`excerpt_${lang}`]} onChange={set(`excerpt_${lang}`)} />
          </div>
          <div>
            <label className="nm-lab">Текст новости ({lang.toUpperCase()})</label>
            <textarea className="adm-input" style={{ minHeight: 140 }} value={form[`body_${lang}`]} onChange={set(`body_${lang}`)} />
          </div>

          <div>
            <label className="nm-lab">Изображение новости</label>
            <div className="nm-img">
              <div className="nm-img-prev" style={form.image
                ? { backgroundImage: `url(${form.image})`, backgroundSize: form.image_fit === 'contain' ? 'contain' : 'cover', backgroundPosition: form.image_pos, backgroundColor: form.color, backgroundRepeat: 'no-repeat' }
                : { background: form.color }}>
                {!form.image && <span>Цветная заглушка</span>}
              </div>
              <div className="nm-img-ctrl">
                <label className="nm-mini upload">
                  {form.image ? 'Заменить фото' : 'Загрузить фото'}
                  <input type="file" accept="image/*" hidden onChange={onPickImage} />
                </label>
                {form.image && <button className="nm-mini" onClick={() => setCropSrc(form.image)}>Кадрировать</button>}
                {form.image && <button className="nm-mini del" onClick={() => setForm((f) => ({ ...f, image: '' }))}>Убрать фото</button>}
                <div className="nm-hint">JPG/PNG. При загрузке откроется кадрирование — двигайте и масштабируйте фото, оставив нужную часть.</div>
              </div>
            </div>

            {cropSrc && (
              <ImageCropper
                src={cropSrc}
                onApply={(url) => { setForm((f) => ({ ...f, image: url, image_fit: 'cover', image_pos: '50% 50%' })); setCropSrc(''); }}
                onCancel={() => setCropSrc('')}
              />
            )}
          </div>

          <div className="nm-2col">
            <div>
              <label className="nm-lab">Дата</label>
              <input className="adm-input" type="date" value={form.news_date} onChange={set('news_date')} />
            </div>
            <div>
              <label className="nm-lab">Цвет карточки (если нет фото)</label>
              <input className="adm-input" type="color" style={{ height: 44, padding: 4 }} value={form.color} onChange={set('color')} />
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

export default function NewsManager({ onAuthLost, canEdit = true }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');

  const refreshAi = async () => {
    setAiBusy(true); setAiMsg('');
    try {
      const d = await sendJSON('/api/admin/news/aggregate/refresh', 'POST', {});
      const when = d.updated_at ? new Date(d.updated_at).toLocaleString('ru-RU') : '';
      setAiMsg(`AI-лента обновлена: ${d.count} новостей${when ? ` · ${when}` : ''}.`);
    } catch (e) {
      if (e.status === 401) return onAuthLost?.();
      setAiMsg(e.data?.error || 'Не удалось обновить AI-ленту.');
    } finally { setAiBusy(false); }
  };

  const load = useCallback(async () => {
    try {
      const data = await getJSON('/api/admin/news');
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e.status === 401) onAuthLost?.();
    } finally { setLoaded(true); }
  }, [onAuthLost]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    if (!window.confirm('Удалить эту новость?')) return;
    try {
      const r = await apiFetch(`/api/admin/news/${id}`, { method: 'DELETE' });
      if (r.status === 401) { onAuthLost?.(); return; }
      load();
    } catch {}
  };

  return (
    <>
      <div className="nm-head">
        <h2>Новости</h2>
        <span style={{ flex: 1 }} />
        {canEdit && <button className="adm-ghost" onClick={refreshAi} disabled={aiBusy} title="Принудительно обновить AI-ленту (Профит.kz, Digital Business)">{aiBusy ? 'Обновляю ленту…' : '↻ Обновить AI-ленту'}</button>}
        {canEdit && <button className="adm-btn" onClick={() => setEditing({})}>+ Добавить новость</button>}
      </div>
      {aiMsg && <div className="adm-note">{aiMsg}</div>}
      {!canEdit && <div className="adm-note">Режим просмотра: редактирование новостей недоступно для вашей роли.</div>}

      {loaded && items.length === 0 ? (
        <div className="adm-empty">Новостей пока нет.{canEdit ? ' Нажмите «Добавить новость».' : ''}</div>
      ) : (
        <div className="nm-grid">
          {items.map((row) => (
            <div className="nm-card" key={row.id}>
              <div className={`bar ${row.image ? 'has-img' : ''}`} style={row.image
                ? { backgroundImage: `url(${row.image})`, backgroundSize: row.image_fit === 'contain' ? 'contain' : 'cover', backgroundPosition: row.image_pos || 'center', backgroundColor: row.color || '#1a4aaa', backgroundRepeat: 'no-repeat' }
                : { background: row.color || '#1a4aaa' }} />
              <div className="in">
                <div className="nm-tags">
                  <time>{fmtDate(row.news_date || row.created_at)}</time>
                  <span className={`nm-badge ${row.published ? 'pub' : 'draft'}`}>{row.published ? 'Опубликовано' : 'Черновик'}</span>
                </div>
                <h3>{row.title_ru || '(без заголовка)'}</h3>
                <p>{row.excerpt_ru || ''}</p>
                {canEdit && (
                  <div className="nm-row">
                    <button className="nm-mini" onClick={() => setEditing(row)}>Редактировать</button>
                    <button className="nm-mini del" onClick={() => remove(row.id)}>Удалить</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && canEdit && (
        <Editor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          onAuthLost={onAuthLost}
        />
      )}
    </>
  );
}
