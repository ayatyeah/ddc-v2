import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n.js';
import { sendJSON } from '../api.js';

const EMPTY = { full_name: '', email: '', phone: '', message: '' };

/* Модальная форма заявки на услугу. services — список {id, name, color},
   initialId — услуга, по которой кликнули (предвыбрана в селекте, можно сменить). */
export default function ServiceApplyModal({ services, initialId, lang, onClose }) {
  const [serviceId, setServiceId] = useState(initialId);
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const selected = services.find((s) => String(s.id) === String(serviceId)) || services[0];

  // Esc закрывает окно; на время показа блокируем прокрутку фона.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const submit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (state === 'sending') return;
    if (!form.full_name.trim()) { setErr(t(lang, 'contact.err.name')); setState('error'); return; }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErr(t(lang, 'contact.err.email')); setState('error'); return;
    }
    if (!consent) { setErr(t(lang, 'contact.err.consent')); setState('error'); return; }
    setState('sending'); setErr('');
    try {
      await sendJSON('/api/leads', 'POST', {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        subject: selected ? selected.name : '',
        message: form.message.trim(),
      });
      setState('sent');
      setTimeout(() => onClose?.(), 1400);
    } catch {
      setErr(t(lang, 'contact.err.server')); setState('error');
    }
  };

  const btnClass = state === 'sent' ? 'btn btn-primary ok' : state === 'error' ? 'btn btn-primary bad' : 'btn btn-primary';
  const btnLabel = state === 'sending' ? t(lang, 'contact.sending')
    : state === 'sent' ? t(lang, 'contact.sent')
    : state === 'error' ? err
    : t(lang, 'contact.send');

  // Через портал в <body>: иначе position:fixed ловит трансформируемый .page-tx
  // (will-change: transform) и окно «прилипает» к верху страницы, а не к экрану.
  return createPortal((
    <div className="modal-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal apply-modal" role="dialog" aria-modal="true" aria-label={t(lang, 'services.apply')} data-lenis-prevent>
        <div className="bar" style={{ background: selected?.color || 'var(--blue)' }} />
        <div className="inner">
          <button className="x" onClick={onClose} aria-label={t(lang, 'news.close')}>×</button>
          <div className="eyebrow">{t(lang, 'contact.eyebrow')}</div>
          <h2>{t(lang, 'services.apply')}</h2>
          <form className="form" onSubmit={submit} noValidate>
            <label className="apply-field">
              <span className="apply-lab">{t(lang, 'services.select')}</span>
              <select className="inp" value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label={t(lang, 'services.select')}>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <input className="inp" placeholder={t(lang, 'contact.name')} aria-label={t(lang, 'contact.name')}
              value={form.full_name} onChange={set('full_name')} required autoComplete="name" />
            <div className="row2">
              <input className="inp" type="email" placeholder={t(lang, 'contact.email')} aria-label={t(lang, 'contact.email')}
                value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" />
              <input className="inp" type="tel" placeholder={t(lang, 'contact.phone')} aria-label={t(lang, 'contact.phone')}
                value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" />
            </div>
            <textarea className="inp" placeholder={t(lang, 'contact.message')} aria-label={t(lang, 'contact.message')}
              value={form.message} onChange={set('message')} />
            <label className="form-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>{t(lang, 'contact.consent')}</span>
            </label>
            <button type="submit" className={btnClass} disabled={state === 'sending'} aria-busy={state === 'sending'}>{btnLabel}</button>
            <span className="form-status" role="status" aria-live="polite">
              {state === 'error' ? err : state === 'sent' ? t(lang, 'contact.sent') : ''}
            </span>
          </form>
        </div>
      </div>
    </div>
  ), document.body);
}
