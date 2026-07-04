import { useCallback, useEffect, useRef, useState } from 'react';
import { sendJSON } from '../api.js';

// Голосовой агент портала. Нажал «Говорить» → говоришь → пауза → запись САМА останавливается
// (детект тишины) → сервер распознаёт речь (gpt-4o-mini-transcribe) + разбирает в действия
// (gpt-5-mini) → исполняем через существующие эндпоинты (права роли соблюдаются на сервере) →
// приятный голосовой ответ. Фолбэк — команда текстом. getUserMedia работает по https/localhost.
const TAB_LABEL = {
  home: 'Главная', calendar: 'Календарь', news: 'Новости', docs: 'Документы', requests: 'Заявки',
  tasks: 'Задачи', people: 'Сотрудники', depts: 'Отделы', dm: 'Личные сообщения', chat: 'Чаты',
  profile: 'Профиль', mission: 'Mission Control',
};
const REQ_LABEL = { vacation: 'Отпуск', sick: 'Больничный', trip: 'Командировка', certificate: 'Справка', access: 'Доступ', equipment: 'Оборудование', pass: 'Пропуск', other: 'Заявка' };
const hasMic = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof window !== 'undefined' && window.MediaRecorder;
const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });

export default function VoiceAgent({ onGo, me }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('idle');    // idle | listening | processing
  const [level, setLevel] = useState(0);
  const [log, setLog] = useState([]);
  const [typed, setTyped] = useState('');
  const mrRef = useRef(null), streamRef = useRef(null), ctxRef = useRef(null), vadRef = useRef(0), cancelRef = useRef(false);
  const voicesRef = useRef([]);
  const addLog = (role, text) => setLog((l) => [...l.slice(-10), { role, text }]);

  // Голоса TTS: подгружаются асинхронно — кэшируем и обновляем по событию.
  useEffect(() => {
    const load = () => { try { voicesRef.current = window.speechSynthesis?.getVoices() || []; } catch {} };
    load();
    window.speechSynthesis?.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load);
  }, []);
  // Приятный русский голос: предпочитаем нейросетевые (Natural/Online) и женские.
  const speak = useCallback((text) => {
    try {
      const synth = window.speechSynthesis; if (!synth || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; u.rate = 1.0; u.pitch = 1.08;
      const ru = voicesRef.current.filter((v) => /ru/i.test(v.lang));
      const v = ru.find((x) => /natural|online|neural/i.test(x.name))
        || ru.find((x) => /google/i.test(x.name))
        || ru.find((x) => /svetlana|alyona|milena|katya|dariya|female|женск/i.test(x.name))
        || ru[0];
      if (v) u.voice = v;
      synth.cancel(); synth.speak(u);
    } catch { /* TTS необязателен */ }
  }, []);

  // Исполнение действий (через уже существующие эндпоинты — права проверяет сервер).
  const execute = useCallback(async (actions, say) => {
    const done = [];
    for (const a of (actions || [])) {
      try {
        if (a.type === 'navigate' && a.tab) { onGo?.(a.tab); done.push(`Открыл: ${TAB_LABEL[a.tab] || a.tab}`); }
        else if (a.type === 'create_event' && a.title && a.date) {
          const starts_at = a.time ? `${a.date}T${a.time}:00` : `${a.date}T00:00:00`;
          await sendJSON('/api/portal/events', 'POST', { kind: a.kind || 'meeting', title: a.title, starts_at, all_day: !a.time, author_name: me?.username });
          done.push(`Событие «${a.title}» на ${a.date}${a.time ? ' ' + a.time : ''}`); onGo?.('calendar');
        }
        else if (a.type === 'create_task' && a.title) {
          await sendJSON('/api/portal/tasks', 'POST', { title: a.title, priority: a.priority || 'normal', due_date: a.due_date || undefined });
          done.push(`Задача «${a.title}»`); onGo?.('tasks');
        }
        else if (a.type === 'create_news' && a.title) {
          await sendJSON('/api/portal/news', 'POST', { title: a.title, body: a.body || a.title, category: a.category || 'company', author_name: me?.username });
          done.push(`Новость «${a.title}»`); onGo?.('news');
        }
        else if (a.type === 'create_request' && a.title) {
          await sendJSON('/api/portal/requests', 'POST', { kind: a.kind || 'other', title: a.title, body: a.body || '' });
          done.push(`Заявка (${REQ_LABEL[a.kind] || 'Заявка'}): «${a.title}»`); onGo?.('requests');
        }
      } catch (e) { done.push(`⚠ ${e.message || 'не удалось выполнить'}`); }
    }
    const reply = say || (done.length ? done.join('; ') : 'Не понял команду');
    if (done.length) addLog('done', done.join('\n'));
    addLog('bot', reply); speak(reply);
  }, [onGo, me, speak]);

  // Отправка (аудио или текст) → разбор → исполнение. Мгновенная обратная связь по фазам.
  const dispatchText = useCallback(async (text) => {
    const t = (text || '').trim(); if (!t) return;
    addLog('me', t); setPhase('processing');
    try { const r = await sendJSON('/api/assistant/command', 'POST', { text: t }); await execute(r.actions, r.say); }
    catch (e) { addLog('bot', e.message || 'Ассистент недоступен'); speak('Ассистент недоступен'); }
    finally { setPhase('idle'); }
  }, [execute, speak]);

  const cleanup = () => {
    clearTimeout(vadRef.current);
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { ctxRef.current?.close(); } catch {}
    streamRef.current = null; ctxRef.current = null; mrRef.current = null;
    setLevel(0);
  };

  const startRec = async () => {
    if (!hasMic || phase !== 'idle') return;
    cancelRef.current = false;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { addLog('bot', 'Нет доступа к микрофону — разрешите его в браузере (нужен https или localhost).'); return; }
    streamRef.current = stream;
    const mr = new MediaRecorder(stream); mrRef.current = mr;
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      cleanup();
      if (cancelRef.current || !blob.size) { setPhase('idle'); return; }
      setPhase('processing');
      try {
        const audio = await blobToDataUrl(blob);
        const r = await sendJSON('/api/assistant/voice', 'POST', { audio });
        if (r.text) addLog('me', r.text);
        await execute(r.actions, r.say);
      } catch (e) { addLog('bot', e.message || 'Ассистент недоступен'); speak('Ассистент недоступен'); }
      finally { setPhase('idle'); }
    };
    // Детект голоса/тишины (VAD): автоматически останавливаем запись после паузы.
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctxRef.current = ctx;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const SPEECH = 0.03, SIL_MS = 1000, MAX_MS = 13000, NOSPEECH_MS = 4500;
      let speaking = false, silence = 0, t0 = Date.now();
      const tick = () => {
        if (!mrRef.current || mrRef.current.state === 'inactive') return;
        analyser.getByteTimeDomainData(data);
        let s = 0; for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; s += x * x; }
        const vol = Math.sqrt(s / data.length); setLevel(vol);
        const now = Date.now();
        if (vol > SPEECH) { speaking = true; silence = 0; }
        else if (speaking) { if (!silence) silence = now; else if (now - silence > SIL_MS) { stopRec(); return; } }
        if (now - t0 > MAX_MS) { stopRec(); return; }
        if (!speaking && now - t0 > NOSPEECH_MS) { cancelRec(); return; }
        vadRef.current = setTimeout(tick, 70);
      };
      mr.start(); setPhase('listening'); vadRef.current = setTimeout(tick, 70);
    } catch { cleanup(); setPhase('idle'); addLog('bot', 'Не удалось начать запись.'); }
  };
  const stopRec = () => { clearTimeout(vadRef.current); try { if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop(); } catch {} };
  const cancelRec = () => { cancelRef.current = true; stopRec(); };

  const listening = phase === 'listening', processing = phase === 'processing';
  return (
    <div className={`va ${open ? 'open' : ''}`}>
      {open && (
        <div className="va-panel">
          <div className="va-head">
            <b>🎙 Голосовой ассистент</b>
            <button className="va-x" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
          </div>
          <div className="va-log">
            {log.length === 0 && <div className="va-hint">Нажмите «Говорить», скажите команду и сделайте паузу — я всё выполню. Например: «Открой календарь и впиши встречу на завтра в 10 утра», «Создай срочную задачу — отчёт к пятнице», «Оформи заявку на отпуск с 15 июля».</div>}
            {log.map((m, i) => <div key={i} className={`va-msg ${m.role}`}>{m.text}</div>)}
            {processing && <div className="va-msg bot">Распознаю и выполняю…</div>}
          </div>
          {hasMic ? (
            <button className={`va-mic ${listening ? 'on' : ''}`} onClick={listening ? stopRec : startRec} disabled={processing}
              style={listening ? { '--lvl': Math.min(1, level * 8) } : undefined}>
              {listening ? '● Слушаю… (пауза = выполнить)' : processing ? 'Обрабатываю…' : '🎙 Говорить'}
            </button>
          ) : (
            <div className="va-nofb">Микрофон недоступен — введите команду текстом:</div>
          )}
          <form className="va-typed" onSubmit={(e) => { e.preventDefault(); dispatchText(typed); setTyped(''); }}>
            <input className="adm-input" placeholder="Команда текстом…" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={processing} />
            <button className="adm-btn sm" type="submit" disabled={processing || !typed.trim()}>→</button>
          </form>
        </div>
      )}
      <button className={`va-fab ${listening ? 'live' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Голосовой ассистент" title="Голосовой ассистент">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
    </div>
  );
}
