import { useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { sendJSON } from '../api.js';
import Reveal from './Reveal.jsx';

const EMPTY = { full_name: '', email: '', phone: '', message: '' };

/* Универсальная inline-форма заявки → /api/leads. subject — тема (напр. «Партнёрство»
   или «Отклик на вакансию»), чтобы в админке было видно источник. title/sub — заголовки. */
export default function LeadForm({ subject, titleKey, subKey, msgPlaceholderKey }) {
  const lang = useLang();
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (state === 'sending') return;
    if (!form.full_name.trim()) { setErr(t(lang, 'contact.err.name')); setState('error'); return; }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr(t(lang, 'contact.err.email')); setState('error'); return; }
    if (!consent) { setErr(t(lang, 'contact.err.consent')); setState('error'); return; }
    setState('sending'); setErr('');
    try {
      await sendJSON('/api/leads', 'POST', {
        full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        subject: t(lang, subject), message: form.message.trim(),
      });
      setState('sent'); setForm(EMPTY); setConsent(false);
      setTimeout(() => setState('idle'), 3500);
    } catch { setErr(t(lang, 'contact.err.server')); setState('error'); }
  };

  const btnClass = state === 'sent' ? 'btn btn-primary ok' : state === 'error' ? 'btn btn-primary bad' : 'btn btn-primary';
  const btnLabel = state === 'sending' ? t(lang, 'contact.sending') : state === 'sent' ? t(lang, 'contact.sent') : state === 'error' ? err : t(lang, 'contact.send');

  return (
    <section className="section leadform-sec">
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
