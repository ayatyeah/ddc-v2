import { useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { sendJSON } from '../api.js';
import Reveal from './Reveal.jsx';

const EMPTY = { full_name: '', email: '', phone: '', message: '' };
const CV_EXTS = ['pdf', 'doc', 'docx'];
const CV_MAX = 5 * 1024 * 1024;
const readCv = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res({ name: file.name, data: String(r.result) });
  r.onerror = () => rej(new Error('read'));
  r.readAsDataURL(file);
});

/* Универсальная inline-форма заявки → /api/leads. subject — тема (напр. «Партнёрство»
   или «Отклик на вакансию»), чтобы в админке было видно источник. title/sub — заголовки.
   withFile+kind — для карьеры: приём CV (проверка типа/размера на клиенте и сервере). */
export default function LeadForm({ subject, titleKey, subKey, msgPlaceholderKey, kind, withFile }) {
  const lang = useLang();
  const [form, setForm] = useState(EMPTY);
  const [cv, setCv] = useState(null);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onCv = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setCv(null); return; }
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!CV_EXTS.includes(ext)) { setErr(t(lang, 'careers.cv.type')); setState('error'); e.target.value = ''; return; }
    if (f.size > CV_MAX) { setErr(t(lang, 'careers.cv.big')); setState('error'); e.target.value = ''; return; }
    setCv(f); if (state === 'error') { setState('idle'); setErr(''); }
  };

  const submit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (state === 'sending') return;
    if (!form.full_name.trim()) { setErr(t(lang, 'contact.err.name')); setState('error'); return; }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr(t(lang, 'contact.err.email')); setState('error'); return; }
    if (!consent) { setErr(t(lang, 'contact.err.consent')); setState('error'); return; }
    setState('sending'); setErr('');
    try {
      const payload = {
        full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        subject: t(lang, subject), message: form.message.trim(),
      };
      if (kind) payload.kind = kind;
      if (withFile && cv) payload.cv = await readCv(cv);
      await sendJSON('/api/leads', 'POST', payload);
      setState('sent'); setForm(EMPTY); setConsent(false); setCv(null);
      setTimeout(() => setState('idle'), 3500);
    } catch (e2) { setErr(e2?.message || t(lang, 'contact.err.server')); setState('error'); }
  };

  const btnClass = state === 'sent' ? 'btn btn-primary ok' : state === 'error' ? 'btn btn-primary bad' : 'btn btn-primary';
  const btnLabel = state === 'sending' ? t(lang, 'contact.sending') : state === 'sent' ? t(lang, 'contact.sent') : state === 'error' ? err : t(lang, 'contact.send');

  return (
    <section className="section leadform-sec" id="lead-form">
      <div className="wrap">
        <div className="contact-grid">
          <Reveal>
            <div className="contact-info text-glass">
              <div className="eyebrow">{t(lang, 'contact.eyebrow')}</div>
              <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, titleKey)}</h2>
              <p className="lede" style={{ marginTop: 18 }}>{t(lang, subKey)}</p>
              <p style={{ marginTop: 26 }}>{t(lang, 'contact.addr')}</p>
              <a href="mailto:info@bsbnb.kz">info@bsbnb.kz</a>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <form className="form" onSubmit={submit} noValidate>
              <input className="inp" placeholder={t(lang, 'contact.name')} aria-label={t(lang, 'contact.name')}
                value={form.full_name} onChange={set('full_name')} required autoComplete="name" />
              <div className="row2">
                <input className="inp" type="email" placeholder={t(lang, 'contact.email')} aria-label={t(lang, 'contact.email')}
                  value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" />
                <input className="inp" type="tel" placeholder={t(lang, 'contact.phone')} aria-label={t(lang, 'contact.phone')}
                  value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" />
              </div>
              <textarea className="inp" placeholder={t(lang, msgPlaceholderKey || 'contact.message')} aria-label={t(lang, 'contact.message')}
                value={form.message} onChange={set('message')} />
              {withFile && (
                <div className="cv-upload">
                  <label className="cv-btn">
                    <input type="file" accept=".pdf,.doc,.docx" onChange={onCv} hidden />
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11l-8.5 8.5a4.5 4.5 0 0 1-6.4-6.4l8.7-8.7a3 3 0 0 1 4.3 4.3l-8.7 8.7a1.5 1.5 0 0 1-2.1-2.1l7.9-7.9" /></svg>
                    <span>{cv ? cv.name : t(lang, 'careers.cv.pick')}</span>
                  </label>
                  {cv && <button type="button" className="cv-x" onClick={() => setCv(null)} aria-label="Убрать файл">✕</button>}
                  <p className="cv-hint">{t(lang, 'careers.cv.hint')}</p>
                </div>
              )}
              <label className="form-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
                <span>{t(lang, 'contact.consent')}</span>
              </label>
              <button type="submit" className={btnClass} disabled={state === 'sending'} aria-busy={state === 'sending'}>{btnLabel}</button>
              <span className="form-status" role="status" aria-live="polite">{state === 'error' ? err : state === 'sent' ? t(lang, 'contact.sent') : ''}</span>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
