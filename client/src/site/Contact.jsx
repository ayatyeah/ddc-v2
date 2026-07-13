import { useState, useEffect, useRef } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { sendJSON } from '../api.js';
import Reveal from './Reveal.jsx';
import Consent from './Consent.jsx';

const EMPTY = { full_name: '', email: '', phone: '', subject: '', message: '' };

// Офис DDC: Астана, Мәңгілік Ел, 57А (Nur Alem / EXPO).
const OFFICE = { lat: 51.089838, lon: 71.423773 };
// Основная карта — фирменный конструктор Яндекса. Работает у большинства.
const YMAP_SRC = 'https://yandex.ru/map-widget/v1/?um=constructor%3A559caa52e2037f65fed187374363c14995a318f4efb2819fb2b67e6e893013ac&source=constructor';
// Фолбэк — Google Maps: грузится там, где Яндекс режут (корп-файрвол банка, антитрекинг-
// блокировщики держат домены Яндекса в чёрных списках из-за Метрики). Ключ/аккаунт не нужны.
const GMAP_SRC = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2506.0152570307673!2d71.42083987720851!3d51.08972594112904!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4245845413b94003%3A0xb6cd478279e9e301!2z0L_RgC3Rgi4g0JzQsNC90LPQuNC70LjQuiDQldC7LiA1N2EsINCQ0YHRgtCw0L3QsCAwMjAwMDA!5e0!3m2!1sru!2skz!4v1783924038046!5m2!1sru!2skz';
// Внешние ссылки «открыть в картах» — всегда на виду: если инлайн-карта у кого-то не грузится,
// адрес всё равно открывается в том сервисе, что доступен в его сети.
const MAP_LINKS = [
  { label: 'Яндекс', href: `https://yandex.kz/maps/163/astana/?ll=${OFFICE.lon}%2C${OFFICE.lat}&pt=${OFFICE.lon}%2C${OFFICE.lat}&z=17` },
  { label: 'Google', href: `https://www.google.com/maps/search/?api=1&query=${OFFICE.lat},${OFFICE.lon}` },
  { label: '2ГИС', href: 'https://go.2gis.com/2AsQp' },
];

// Карта контактов с устойчивостью к блокировке Яндекса.
function ContactMap({ lang }) {
  const wrapRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [fallback, setFallback] = useState(false);

  // Рендерим карту только когда она подъезжает к экрану (перф) — и лишь тогда пингуем Яндекс.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin: '250px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Доступен ли Яндекс? Пингуем фавикон картинкой: onerror/таймаут → домен режется
  // (корп-файрвол банка, антитрекинг-блокировщик держит домены Яндекса в чёрных списках) →
  // сразу показываем Google Maps вместо пустого iframe. Пинг картинкой проходит CSP
  // (img-src https:), в отличие от fetch (connect-src 'self'). onLoad самого iframe для
  // детекта НЕ годится: у заблокированного домена браузер отдаёт страницу-ошибку и load всё равно
  // срабатывает — поэтому проверяем связность отдельным лёгким запросом.
  useEffect(() => {
    if (!inView) return undefined;
    let done = false;
    const decide = (blocked) => { if (!done) { done = true; if (blocked) setFallback(true); } };
    const img = new Image();
    const tid = setTimeout(() => decide(true), 3000);   // не ответил за 3с → считаем заблокированным
    img.onload = () => { clearTimeout(tid); decide(false); };
    img.onerror = () => { clearTimeout(tid); decide(true); };
    img.src = 'https://yandex.ru/favicon.ico?_=' + Date.now();
    return () => { clearTimeout(tid); done = true; img.onload = null; img.onerror = null; };
  }, [inView]);

  return (
    <div className="contact-map" ref={wrapRef}>
      {inView && (
        <iframe
          key={fallback ? 'gmap' : 'ya'}
          title={t(lang, 'contact.addr')}
          src={fallback ? GMAP_SRC : YMAP_SRC}
          referrerPolicy="strict-origin-when-cross-origin"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
        />
      )}
      <div className="contact-map-link">
        <span className="cml-addr">Мәңгілік Ел, 57А</span>
        {MAP_LINKS.map((m) => (
          <a key={m.label} href={m.href} target="_blank" rel="noopener noreferrer">{m.label}</a>
        ))}
      </div>
    </div>
  );
}

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
          <ContactMap lang={lang} />
        </Reveal>
      </div>
    </section>
  );
}
