import { useCallback, useEffect, useRef, useState } from 'react';
import { sendJSON } from '../api.js';
import { parseVoice } from './voiceNlu.js';

// Голосовой агент портала — работает во ВСЕХ браузерах:
//  • Chrome/Edge/Safari: встроенное распознавание речи (SpeechRecognition) — мгновенно, потоково,
//    без сети до нашего сервера и без OpenAI-ключа. Авто-стоп по тишине — нативный.
//  • Firefox и прочие без SpeechRecognition: запись → WAV → сервер (OpenAI) как фолбэк.
// Понимание команды: сперва локальный парсер на правилах (voiceNlu, без ИИ, мгновенно); если
// фраза незнакомая — тихий фолбэк на ИИ (/api/assistant/command). Исполнение — через существующие
// эндпоинты (права роли проверяет сервер). Плюс всегда есть ввод команды текстом.
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const TAB_LABEL = {
  home: 'Главная', calendar: 'Календарь', news: 'Новости', docs: 'Документы', requests: 'Заявки',
  tasks: 'Задачи', people: 'Сотрудники', depts: 'Отделы', dm: 'Личные сообщения', chat: 'Чаты',
  profile: 'Профиль', mission: 'Mission Control',
};
const REQ_LABEL = { vacation: 'Отпуск', sick: 'Больничный', trip: 'Командировка', certificate: 'Справка', access: 'Доступ', equipment: 'Оборудование', pass: 'Пропуск', other: 'Заявка' };
const hasMic = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof window !== 'undefined' && window.MediaRecorder;
const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });

// webm/opus от MediaRecorder бывает капризным для распознавания. Декодируем его в браузере и
// перекодируем в WAV (моно, 16 кГц, 16-бит PCM) — этот формат сервер/OpenAI распознают железно,
// и он в разы легче (16 кГц моно вместо 48 кГц стерео). Возвращаем WAV-Blob.
function encodeWav(audioBuffer, targetRate = 16000) {
  const srcRate = audioBuffer.sampleRate, len = audioBuffer.length;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  // Даунмикс в моно
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) mono[i] = ch1 ? (ch0[i] + ch1[i]) / 2 : ch0[i];
  // Ресемпл в targetRate (линейная интерполяция) — если исходник уже ≤ target, оставляем как есть
  let out = mono, rate = srcRate;
  if (srcRate > targetRate) {
    const ratio = srcRate / targetRate, outLen = Math.floor(len / ratio);
    out = new Float32Array(outLen); rate = targetRate;
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio, i0 = Math.floor(pos), frac = pos - i0;
      out[i] = mono[i0] * (1 - frac) + (mono[i0 + 1] || 0) * frac;
    }
  }
  const n = out.length, buffer = new ArrayBuffer(44 + n * 2), view = new DataView(buffer);
  const wr = (o, str) => { for (let i = 0; i < str.length; i++) view.setUint8(o + i, str.charCodeAt(i)); };
  wr(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wr(36, 'data'); view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { let s = Math.max(-1, Math.min(1, out[i])); view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return new Blob([buffer], { type: 'audio/wav' });
}

export default function VoiceAgent({ onGo, me }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('idle');    // idle | listening | processing
  const [level, setLevel] = useState(0);
  const [log, setLog] = useState([]);
  const [typed, setTyped] = useState('');
  const [interim, setInterim] = useState('');   // живой текст распознавания (нативный движок)
  const [wake, setWake] = useState(() => { try { return localStorage.getItem('dd_wake') === '1'; } catch { return false; } });   // режим отклика на имя «ДиДи»
  const [mode, setMode] = useState('cmd');   // cmd = выполнять команды | ask = отвечать на вопросы (RAG по базе портала)
  const mrRef = useRef(null), streamRef = useRef(null), ctxRef = useRef(null), vadRef = useRef(0), cancelRef = useRef(false);
  const recRef = useRef(null);
  const startNativeRef = useRef(() => {});   // всегда актуальная ссылка на запуск распознавания (для wake-слушателя)
  const modeRef = useRef('cmd'); modeRef.current = mode;   // актуальный режим для голосового ввода
  const voicesRef = useRef([]);
  const canVoice = !!SR || hasMic;
  const addLog = (role, text, extra) => setLog((l) => [...l.slice(-12), { role, text, ...extra }]);

  // Голоса TTS: подгружаются асинхронно — кэшируем и обновляем по событию.
  useEffect(() => {
    const load = () => { try { voicesRef.current = window.speechSynthesis?.getVoices() || []; } catch {} };
    load();
    window.speechSynthesis?.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load);
  }, []);
  // Если панель закрыли во время записи — прекращаем слушать (без отправки).
  useEffect(() => { if (!open && phase === 'listening') { cancelRef.current = true; try { mrRef.current?.state !== 'inactive' && mrRef.current?.stop(); } catch {} try { recRef.current?.stop(); } catch {} } }, [open, phase]);
  // Запасной голос — браузерный. Спокойные параметры (pitch 1.0, чуть медленнее), избегаем
  // роботизированных системных голосов (MS Irina/Pavel Desktop), если есть выбор получше.
  const speakBrowser = useCallback((text) => {
    try {
      const synth = window.speechSynthesis; if (!synth || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; u.rate = 0.98; u.pitch = 1.0;
      const ru = voicesRef.current.filter((v) => /ru/i.test(v.lang));
      const robotic = /desktop|irina|pavel|microsoft/i;
      const v = ru.find((x) => /natural|neural|online/i.test(x.name))
        || ru.find((x) => /google|yandex|alena|alyona|milena|svetlana|katya|dariya|female|женск/i.test(x.name))
        || ru.find((x) => !robotic.test(x.name))
        || ru[0];
      if (v) u.voice = v;
      synth.cancel(); synth.speak(u);
    } catch { /* TTS необязателен */ }
  }, []);
  // Основной голос ДиДи — тёплый нейросетевой (сервер, gpt-4o-mini-tts). Если недоступен —
  // мгновенно откатываемся на браузерный голос. Предыдущее воспроизведение прерываем.
  const ttsRef = useRef(null);
  const speak = useCallback(async (text) => {
    if (!text) return;
    try { ttsRef.current?.pause(); } catch {}
    try { window.speechSynthesis?.cancel(); } catch {}
    try {
      const res = await fetch('/api/assistant/tts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error('tts ' + res.status);
      const blob = await res.blob();
      if (!/audio/.test(blob.type)) throw new Error('not audio');
      const url = URL.createObjectURL(blob);
      const a = new Audio(url); ttsRef.current = a;
      a.onended = () => { try { URL.revokeObjectURL(url); } catch {} };
      await a.play();
    } catch { speakBrowser(text); }   // фолбэк на браузерный голос
  }, [speakBrowser]);

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

  // Разбор → исполнение. Сначала локальный парсер (без ИИ, мгновенно). Если он не понял —
  // тихий фолбэк на ИИ (/api/assistant/command). Обратная связь по фазам мгновенная.
  const runText = useCallback(async (text) => {
    const t = (text || '').trim(); if (!t) return;
    addLog('me', t); setPhase('processing');
    try {
      const local = parseVoice(t);
      if (local.length) { await execute(local); }
      else { const r = await sendJSON('/api/assistant/command', 'POST', { text: t }); await execute(r.actions, r.say); }
    } catch (e) { addLog('bot', e.message || 'Ассистент недоступен'); speak('Ассистент недоступен'); }
    finally { setPhase('idle'); }
  }, [execute, speak]);

  // Режим «Спроси»: RAG-ответ по базе портала со ссылками на источники (документы/новости/люди…).
  const runAsk = useCallback(async (text) => {
    const t = (text || '').trim(); if (!t) return;
    addLog('me', t); setPhase('processing');
    try {
      const r = await sendJSON('/api/assistant/ask', 'POST', { question: t });
      addLog('bot', r.answer || 'Не нашёл ответа.', { sources: r.sources || [] });
      speak(r.answer || '');
    } catch (e) { addLog('bot', e.message || 'ИИ недоступен'); }
    finally { setPhase('idle'); }
  }, [speak]);

  // Обработка распознанного/введённого текста по текущему режиму (команда или вопрос).
  const handleInput = useCallback((text) => { (modeRef.current === 'ask' ? runAsk : runText)(text); }, [runAsk, runText]);

  const cleanup = () => {
    clearTimeout(vadRef.current);
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { ctxRef.current?.close(); } catch {}
    streamRef.current = null; ctxRef.current = null; mrRef.current = null;
    setLevel(0);
  };

  // Основной движок: встроенное распознавание браузера. Мгновенно, потоково, авто-стоп по тишине.
  const startNative = () => {
    cancelRef.current = false; setInterim('');
    let rec;
    try { rec = new SR(); } catch { return startMedia(); }
    recRef.current = rec;
    rec.lang = 'ru-RU'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += seg; else live += seg;
      }
      setInterim(live || finalText); setLevel(0.5);
    };
    rec.onerror = (e) => {
      recRef.current = null; setLevel(0); setInterim('');
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setPhase('idle'); addLog('bot', 'Нет доступа к микрофону — разрешите его в браузере (нужен https или localhost).'); return; }
      if (e.error === 'no-speech') { setPhase('idle'); addLog('bot', 'Не услышал — говорите чуть ближе к микрофону и попробуйте снова.'); return; }
      if (e.error === 'audio-capture') { setPhase('idle'); addLog('bot', 'Микрофон не найден. Проверьте, что он подключён.'); return; }
      if (e.error === 'network') { addLog('bot', 'Перехожу на запасной способ распознавания…'); startMedia(); return; }   // фолбэк на серверный STT
      setPhase('idle');
    };
    rec.onend = () => {
      recRef.current = null; setLevel(0); setInterim('');
      const t = finalText.trim();
      if (cancelRef.current) { setPhase('idle'); return; }
      if (t) handleInput(t); else { setPhase('idle'); addLog('bot', 'Не услышал. Повторите, пожалуйста.'); }
    };
    try { rec.start(); setPhase('listening'); } catch { startMedia(); }
  };

  const startRec = () => { if (phase !== 'idle') return; if (SR) startNative(); else startMedia(); };
  startNativeRef.current = startNative;

  // Режим «ДиДи»: фоновое распознавание ждёт обращение по имени и сразу запускает приём команды.
  // Работает только на движках с SpeechRecognition (Chrome/Edge/Safari). Пока идёт команда
  // (phase≠idle) — слушатель имени приостановлен, чтобы не было двух распознавателей на один микрофон.
  useEffect(() => {
    if (!wake || !SR || phase !== 'idle') return;
    let rec, stopped = false, restartT = 0;
    try { rec = new SR(); } catch { return; }
    rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
    const WAKE = /(^|\s)(ди\s?ди|диди|деди|dd|d\s?d|дида)(\s|$)/i;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = (e.results[i][0].transcript || '').toLowerCase().replace(/ё/g, 'е');
        if (WAKE.test(tr)) { stopped = true; try { rec.stop(); } catch {} setOpen(true); startNativeRef.current(); return; }
      }
    };
    rec.onerror = (ev) => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { stopped = true; setWake(false); addLog('bot', 'Нет доступа к микрофону для режима «ДиДи».'); } };
    rec.onend = () => { if (!stopped) restartT = setTimeout(() => { try { rec.start(); } catch {} }, 300); };   // авто-рестарт (Chrome сам обрывает continuous)
    try { rec.start(); } catch {}
    return () => { stopped = true; clearTimeout(restartT); try { rec.stop(); } catch {} };
  }, [wake, phase]);
  useEffect(() => { try { localStorage.setItem('dd_wake', wake ? '1' : '0'); } catch {} }, [wake]);

  // Фолбэк-движок (Firefox и т.п. без SpeechRecognition): запись → WAV → сервер.
  const startMedia = async () => {
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
        let audio;
        try {
          const ab = await blob.arrayBuffer();
          const dctx = new (window.AudioContext || window.webkitAudioContext)();
          const audioBuffer = await dctx.decodeAudioData(ab);
          dctx.close();
          audio = await blobToDataUrl(encodeWav(audioBuffer));   // WAV 16кГц — надёжное распознавание
        } catch { audio = await blobToDataUrl(blob); }           // фолбэк: как записали
        const r = await sendJSON('/api/assistant/voice', 'POST', { audio });
        if (r.text) {
          addLog('me', r.text);
          const local = parseVoice(r.text);   // сперва локальный разбор и здесь
          if (local.length) { await execute(local); } else { await execute(r.actions, r.say); }
        } else { await execute(r.actions, r.say); }
      } catch (e) { addLog('bot', e.message || 'Ассистент недоступен'); speak('Ассистент недоступен'); }
      finally { setPhase('idle'); }
    };
    // Детект голоса/тишины (VAD): автоматически останавливаем запись после паузы.
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctxRef.current = ctx;
      ctx.resume?.().catch(() => {});   // браузер часто создаёт контекст «suspended» → анализатор молчит
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      // Порог адаптируется к микрофону: первые ~450мс меряем фоновый шум, речь = заметно выше него.
      const SIL_MS = 900, MAX_MS = 14000, NOSPEECH_MS = 6000;
      let speaking = false, silence = 0, t0 = Date.now(), calib = [], noise = 0.01;
      const tick = () => {
        if (!mrRef.current || mrRef.current.state === 'inactive') return;
        analyser.getByteTimeDomainData(data);
        let s = 0; for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; s += x * x; }
        const vol = Math.sqrt(s / data.length); setLevel(vol);
        const now = Date.now(), el = now - t0;
        if (el < 450) calib.push(vol);
        else if (calib) { noise = Math.max(0.008, calib.reduce((a, b) => a + b, 0) / (calib.length || 1)); calib = null; }
        const speakThr = Math.max(0.02, noise * 2.4), silThr = Math.max(0.014, noise * 1.6);
        if (vol > speakThr) { speaking = true; silence = 0; }
        else if (speaking && vol < silThr) { if (!silence) silence = now; else if (now - silence > SIL_MS) { stopRec(); return; } }
        if (el > MAX_MS) { stopRec(); return; }
        if (!speaking && el > NOSPEECH_MS) { stopRec(); return; }   // отправляем всё равно — тихую речь распознаёт сервер
        vadRef.current = setTimeout(tick, 60);
      };
      mr.start(); setPhase('listening'); vadRef.current = setTimeout(tick, 60);
    } catch { cleanup(); setPhase('idle'); addLog('bot', 'Не удалось начать запись.'); }
  };
  const stopRec = () => { clearTimeout(vadRef.current); try { if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop(); } catch {} try { recRef.current?.stop(); } catch {} };
  const cancelRec = () => { cancelRef.current = true; stopRec(); };

  const listening = phase === 'listening', processing = phase === 'processing';
  return (
    <div className={`va ${open ? 'open' : ''}`}>
      {open && (
        <div className="va-panel">
          <div className="va-head">
            <b>🎙 ДиДи <span className="va-sub">— голосовой ассистент</span></b>
            <button className="va-x" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
          </div>
          <div className="va-modes" role="tablist">
            <button className={`va-mode ${mode === 'cmd' ? 'on' : ''}`} onClick={() => setMode('cmd')} role="tab" aria-selected={mode === 'cmd'}>⚡ Команда</button>
            <button className={`va-mode ${mode === 'ask' ? 'on' : ''}`} onClick={() => setMode('ask')} role="tab" aria-selected={mode === 'ask'}>❓ Спросить</button>
          </div>
          <div className="va-log">
            {log.length === 0 && (mode === 'ask'
              ? <div className="va-hint">Спросите что угодно о работе — я найду ответ в базе портала. Например: «Как оформить отпуск?», «Какие требования к паролю?», «Можно ли работать удалённо?», «Что делать при фишинговом письме?». Отвечу и покажу источники.</div>
              : <div className="va-hint">Я — <b>ДиДи</b>. Нажмите «Говорить», скажите команду и сделайте паузу — я всё выполню. Например: «Открой календарь и впиши встречу на завтра в 10 утра», «Создай срочную задачу — отчёт к пятнице», «Оформи заявку на отпуск с 15 июля».{SR ? ' Включите «Реагировать на имя» — и просто скажите «ДиДи».' : ''}</div>)}
            {log.map((m, i) => (
              <div key={i} className={`va-msg ${m.role}`}>
                {m.text}
                {m.sources && m.sources.length > 0 && (
                  <div className="va-sources">
                    {m.sources.slice(0, 5).map((s, j) => (
                      <button key={j} className="va-src" onClick={() => s.tab && onGo?.(s.tab)} title={s.title} disabled={!s.tab}>
                        <span className="va-src-k">{s.kindLabel || s.kind}</span> {s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {listening && interim && <div className="va-msg me interim">{interim}…</div>}
            {processing && <div className="va-msg bot">{mode === 'ask' ? 'Ищу ответ в базе…' : 'Распознаю и выполняю…'}</div>}
          </div>
          {canVoice ? (
            <button className={`va-mic ${listening ? 'on' : ''}`} onClick={listening ? stopRec : startRec} disabled={processing}
              style={listening ? { '--lvl': Math.min(1, level * 8) } : undefined}>
              {listening ? '● Слушаю… (пауза = выполнить)' : processing ? 'Обрабатываю…' : '🎙 Говорить'}
            </button>
          ) : (
            <div className="va-nofb">Микрофон недоступен — введите команду текстом:</div>
          )}
          {SR && (
            <label className="va-wake" title="Фоновое прослушивание имени «ДиДи»">
              <input type="checkbox" checked={wake} onChange={(e) => setWake(e.target.checked)} />
              <span>Реагировать на имя «ДиДи»{wake ? ' — слушаю…' : ''}</span>
            </label>
          )}
          <form className="va-typed" onSubmit={(e) => { e.preventDefault(); handleInput(typed); setTyped(''); }}>
            <input className="adm-input" placeholder={mode === 'ask' ? 'Ваш вопрос…' : 'Команда текстом…'} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={processing} />
            <button className="adm-btn sm" type="submit" disabled={processing || !typed.trim()}>→</button>
          </form>
        </div>
      )}
      <button className={`va-fab ${listening ? 'live' : ''} ${wake && !open ? 'wake' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="ДиДи — голосовой ассистент" title={wake ? 'ДиДи слушает имя' : 'ДиДи — голосовой ассистент'}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
    </div>
  );
}
