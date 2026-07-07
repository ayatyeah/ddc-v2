import { useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { sendJSON } from '../api.js';
import Reveal from './Reveal.jsx';
import Consent from './Consent.jsx';

const EMPTY = { full_name: '', email: '', phone: '', subject: '', message: '' };

export default function Contact() {
  const lang = useLang();
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
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
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setState('sent');
      setForm(EMPTY);
      setConsent(false);
      setTimeout(() => setState('idle'), 3500);
    } catch {
      setErr(t(lang, 'contact.err.server'));
      setState('error');
    }
  };

  const btnClass = state === 'sent' ? 'btn btn-primary ok' : state === 'error' ? 'btn btn-primary bad' : 'btn btn-primary';
  const btnLabel = state === 'sending' ? t(lang, 'contact.sending')
    : state === 'sent' ? t(lang, 'contact.sent')
    : state === 'error' ? err
    : t(lang, 'contact.send');

  return (
    <section className="section contact" id="contacts">
      <div className="wrap">
        <div className="contact-grid">
          <Reveal>
            <div className="contact-info text-glass">
              <div className="eyebrow">{t(lang, 'contact.eyebrow')}</div>
              <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'contact.title')}</h2>
              <p className="lede" style={{ marginTop: 18 }}>{t(lang, 'contact.sub')}</p>
              <p style={{ marginTop: 26 }}>{t(lang, 'contact.addr')}</p>
              <a href="tel:+77272584958">+7 727 258-49-58</a>
              <a href="mailto:info@bsbnb.kz">info@bsbnb.kz</a>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <form className="form" onSubmit={submit} noValidate aria-label={t(lang, 'contact.title')}>
              <input className="inp" placeholder={t(lang, 'contact.name')} aria-label={t(lang, 'contact.name')}
                value={form.full_name} onChange={set('full_name')} required autoComplete="name" />
              <div className="row2">
                <input className="inp" type="email" placeholder={t(lang, 'contact.email')} aria-label={t(lang, 'contact.email')}
                  value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" />
                <input className="inp" type="tel" placeholder={t(lang, 'contact.phone')} aria-label={t(lang, 'contact.phone')}
                  value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" />
              </div>
              <input className="inp" placeholder={t(lang, 'contact.subject')} aria-label={t(lang, 'contact.subject')}
                value={form.subject} onChange={set('subject')} />
              <textarea className="inp" placeholder={t(lang, 'contact.message')} aria-label={t(lang, 'contact.message')}
                value={form.message} onChange={set('message')} />
              <label className="form-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
                <Consent lang={lang} />
              </label>
              <button type="submit" className={btnClass} disabled={state === 'sending'} aria-busy={state === 'sending'}>{btnLabel}</button>
              <span className="form-status" role="status" aria-live="polite">
                {state === 'error' ? err : state === 'sent' ? t(lang, 'contact.sent') : ''}
              </span>
            </form>
          </Reveal>
        </div>

        <Reveal delay={200}>
          <div className="contact-map">
            <iframe
              title={t(lang, 'contact.addr')}
              src="https://yandex.ru/map-widget/v1/?um=constructor%3A559caa52e2037f65fed187374363c14995a318f4efb2819fb2b67e6e893013ac&source=constructor"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
            />
            <a
              className="contact-map-link"
              href="https://yandex.kz/maps/163/astana/house/manggilik_el_dangghyly_57a/Y0gYcgVjTkIEQFtrfXx5eHRgbA==/?ll=71.423773%2C51.089838&pt=71.423773%2C51.089838&z=17"
              target="_blank"
              rel="noopener noreferrer"
            >
              Мәңгілік Ел, 57А → {t(lang, 'contact.map')}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
