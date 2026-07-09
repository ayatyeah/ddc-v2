import { useEffect, useRef, useState } from 'react';
import { useLang } from '../store.js';
import { t, FAQ } from '../i18n.js';
import { IcoChat } from './icons.jsx';
import { sendJSON } from '../api.js';

export default function Assistant() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
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

  // Свободный вопрос → публичный ИИ-ассистент (RAG по услугам ЦЦР).
  // Передаём последние реплики как память диалога — бэкенд сам обрежет окно.
  const send = async (e) => {
    e?.preventDefault?.();
    const q = text.trim();
    if (!q || typing) return;
    setText('');
    // История для запроса — то, что было ДО текущего вопроса (последние 8 реплик).
    const history = msgs.slice(-8).map((m) => ({ role: m.who === 'bot' ? 'assistant' : 'user', text: m.text }));
    setMsgs((m) => [...m, { who: 'user', text: q }]);
    setTyping(true);
    try { const d = await sendJSON('/api/public/ask', 'POST', { q, history }); setMsgs((m) => [...m, { who: 'bot', text: d.answer || '—' }]); }
    catch { setMsgs((m) => [...m, { who: 'bot', text: t(lang, 'asst.error') }]); }
    finally { setTyping(false); }
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

          <form className="asst-input" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t(lang, 'asst.ask')} aria-label={t(lang, 'asst.ask')} />
            <button type="submit" disabled={typing || !text.trim()} aria-label="Отправить">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
