import { useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { sendJSON } from '../api.js';
import Reveal from './Reveal.jsx';

const EMPTY = { full_name: '', email: '', phone: '', subject: '', message: '' };

export default function Contact() {
  const lang = useLang();
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (state === 'sending') return;
    if (!form.full_name.trim()) { setErr(t(lang, 'contact.err.name')); setState('error'); return; }
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
            <div className="contact-info">
              <div className="eyebrow">{t(lang, 'contact.eyebrow')}</div>
              <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'contact.title')}</h2>
              <p className="lede" style={{ marginTop: 18 }}>{t(lang, 'contact.sub')}</p>
              <p style={{ marginTop: 26 }}>{t(lang, 'contact.addr')}</p>
              <a href="tel:+77272584958">+7 727 258-49-58</a>
              <a href="mailto:info@bsbnb.kz">info@bsbnb.kz</a>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="form">
              <input className="inp" placeholder={t(lang, 'contact.name')} value={form.full_name} onChange={set('full_name')} />
              <div className="row2">
                <input className="inp" type="email" placeholder={t(lang, 'contact.email')} value={form.email} onChange={set('email')} />
                <input className="inp" placeholder={t(lang, 'contact.phone')} value={form.phone} onChange={set('phone')} />
              </div>
              <input className="inp" placeholder={t(lang, 'contact.subject')} value={form.subject} onChange={set('subject')} />
              <textarea className="inp" placeholder={t(lang, 'contact.message')} value={form.message} onChange={set('message')} />
              <button className={btnClass} onClick={submit} disabled={state === 'sending'}>{btnLabel}</button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
