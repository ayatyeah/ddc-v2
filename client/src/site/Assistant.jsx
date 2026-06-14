import { useEffect, useRef, useState } from 'react';
import { useLang } from '../store.js';
import { t, FAQ } from '../i18n.js';
import { IcoChat } from './icons.jsx';

export default function Assistant() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [typing, setTyping] = useState(false);
  const bodyRef = useRef(null);

  // Приветствие при первом открытии и сброс диалога при смене языка.
  useEffect(() => {
    setMsgs([{ who: 'bot', text: t(lang, 'asst.greeting') }]);
  }, [lang]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing, open]);

  const ask = (item) => {
    if (typing) return;
    setMsgs((m) => [...m, { who: 'user', text: item.q }]);
    setTyping(true);
    setTimeout(() => {
      setMsgs((m) => [...m, { who: 'bot', text: item.a }]);
      setTyping(false);
    }, 600);
  };

  const faq = FAQ[lang] || FAQ.ru;

  return (
    <>
      <button className="asst-bubble" onClick={() => setOpen((o) => !o)} aria-label={t(lang, 'asst.title')}>
        <IcoChat size={24} />
      </button>

      {open && (
        <div className="asst-panel" role="dialog">
          <div className="asst-head">
            <span className="av"><IcoChat size={18} /></span>
            <div>
              <b>{t(lang, 'asst.title')}</b>
              <i>{t(lang, 'asst.status')}</i>
            </div>
            <button className="x" onClick={() => setOpen(false)} aria-label="×">×</button>
          </div>

          <div className="asst-body" ref={bodyRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.who}`}>{m.text}</div>
            ))}
            {typing && <div className="msg bot">…</div>}
          </div>

          <div className="asst-quick">
            {faq.map((item, i) => (
              <button key={i} className="asst-q" onClick={() => ask(item)}>{item.q}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
