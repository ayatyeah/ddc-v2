import { useCallback, useRef, useState } from 'react';
import { sendJSON } from '../api.js';

// Голосовой агент портала. Запись микрофона (MediaRecorder) → сервер: распознавание речи
// (gpt-4o-mini-transcribe) + разбор в действия (gpt-5-mini) → исполняем через существующие
// эндпоинты (права роли соблюдаются на сервере) + голосовой ответ (SpeechSynthesis).
// Фолбэк — ввод команды текстом. getUserMedia работает по https или на localhost.
const TAB_LABEL = {
  home: 'Главная', calendar: 'Календарь', news: 'Новости', docs: 'Документы', requests: 'Заявки',
  tasks: 'Задачи', people: 'Сотрудники', depts: 'Отделы', dm: 'Личные сообщения', chat: 'Чаты',
  profile: 'Профиль', mission: 'Mission Control',
};
const hasMic = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof window !== 'undefined' && window.MediaRecorder;

function speak(text) {
  try {
    if (!text || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ru-RU'; u.rate = 1.02;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  } catch { /* TTS необязателен */ }
}
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob);
});

export default function VoiceAgent({ onGo, me }) {
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [typed, setTyped] = useState('');
  const mrRef = useRef(null);
  const addLog = (role, text) => setLog((l) => [...l.slice(-8), { role, text }]);

  // Исполнение действий через уже существующие эндпоинты (права проверяет сервер).
  const execute = useCallback(async (actions, say) => {
    const done = [];
    for (const a of (actions || [])) {
      try {
        if (a.type === 'navigate' && a.tab) { onGo?.(a.tab); done.push(`Открываю: ${TAB_LABEL[a.tab] || a.tab}`); }
        else if (a.type === 'create_event' && a.title && a.date) {
          const starts_at = a.time ? `${a.date}T${a.time}:00` : `${a.date}T00:00:00`;
          await sendJSON('/api/portal/events', 'POST', { kind: a.kind || 'meeting', title: a.title, starts_at, all_day: !a.time, author_name: me?.username });
          done.push(`Событие «${a.title}» на ${a.date}`); onGo?.('calendar');
        }
        else if (a.type === 'create_task' && a.title) {
          await sendJSON('/api/portal/tasks', 'POST', { title: a.title, priority: a.priority || 'normal', due_date: a.due_date || undefined });
          done.push(`Задача «${a.title}»`); onGo?.('tasks');
        }
        else if (a.type === 'create_news' && a.title) {
          await sendJSON('/api/portal/news', 'POST', { title: a.title, body: a.body || a.title, category: a.category || 'company', author_name: me?.username });
          done.push(`Новость «${a.title}»`); onGo?.('news');
        }
      } catch (e) { done.push(`⚠ ${e.message || 'не удалось выполнить'}`); }
    }
    const reply = say || (done.length ? done.join('; ') : 'Не понял команду');
    addLog('bot', reply); speak(reply);
  }, [onGo, me]);

  // Текстовая команда (фолбэк)
  const runText = useCallback(async (text) => {
    const t = (text || '').trim(); if (!t) return;
    addLog('me', t); setBusy(true);
    try { const r = await sendJSON('/api/assistant/command', 'POST', { text: t }); await execute(r.actions, r.say); }
    catch (e) { addLog('bot', e.message || 'Ассистент недоступен'); }
    finally { setBusy(false); }
  }, [execute]);

  const startRec = async () => {
    if (!hasMic || rec || busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (!blob.size) return;
        setBusy(true);
        try {
          const audio = await blobToDataUrl(blob);
          const r = await sendJSON('/api/assistant/voice', 'POST', { audio });
          if (r.text) addLog('me', r.text);
          await execute(r.actions, r.say);
        } catch (e) { addLog('bot', e.message || 'Ассистент недоступен'); }
        finally { setBusy(false); }
      };
      mrRef.current = mr; mr.start(); setRec(true);
    } catch { addLog('bot', 'Нет доступа к микрофону (нужен https или localhost и разрешение).'); }
  };
  const stopRec = () => { try { mrRef.current?.stop(); } catch {} setRec(false); };

  return (
    <div className={`va ${open ? 'open' : ''}`}>
      {open && (
        <div className="va-panel">
          <div className="va-head">
            <b>🎙 Голосовой ассистент</b>
            <button className="va-x" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
          </div>
          <div className="va-log">
            {log.length === 0 && <div className="va-hint">Нажмите «Говорить» и скажите, например: «Открой календарь и впиши встречу на 3 июля в 10 утра» или «Создай задачу подготовить отчёт на завтра».</div>}
            {log.map((m, i) => <div key={i} className={`va-msg ${m.role}`}>{m.text}</div>)}
            {busy && <div className="va-msg bot">…</div>}
          </div>
          {hasMic ? (
            <button className={`va-mic ${rec ? 'on' : ''}`} onClick={rec ? stopRec : startRec} disabled={busy}>
              {rec ? '● Стоп (распознать)' : '🎙 Говорить'}
            </button>
          ) : (
            <div className="va-nofb">Микрофон недоступен в этом контексте — введите команду текстом:</div>
          )}
          <form className="va-typed" onSubmit={(e) => { e.preventDefault(); runText(typed); setTyped(''); }}>
            <input className="adm-input" placeholder="Команда текстом…" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="adm-btn sm" type="submit" disabled={busy || !typed.trim()}>→</button>
          </form>
        </div>
      )}
      <button className="va-fab" onClick={() => setOpen((o) => !o)} aria-label="Голосовой ассистент" title="Голосовой ассистент">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
    </div>
  );
}
