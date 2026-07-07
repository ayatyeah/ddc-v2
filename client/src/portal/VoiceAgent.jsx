import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';
import { parseVoice } from './voiceNlu.js';

// ДиДи — текст-первый ассистент портала (чат как основной путь, голос — бонус).
//  • Текст: команды разбирает ИИ (/api/assistant/command) — свободные формулировки,
//    перенос встреч, несколько действий за фразу. Локальный парсер (voiceNlu) — страховка,
//    когда ИИ недоступен. Вопросы — RAG по базе портала.
//    ИИ БЕЗ истории диалога: каждый запрос независим (диалог хранится только в UI/sessionStorage) —
//    предсказуемые ответы и минимальный расход токенов.
//  • Голос: Chrome/Edge/Safari — нативный SpeechRecognition; Firefox — запись → WAV → сервер.
//    Озвучка ответа — только если ввод был голосом (на текст ДиДи отвечает тихо).
// Исполнение действий — через существующие эндпоинты (права роли проверяет сервер).
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const TAB_LABEL = {
  home: 'Главная', calendar: 'Календарь', booking: 'Переговорные', news: 'Новости', polls: 'Опросы',
  docs: 'Документы', requests: 'Заявки', tasks: 'Задачи', people: 'Сотрудники', depts: 'Отделы',
  dm: 'Личные сообщения', chat: 'Чаты', profile: 'Профиль', mission: 'Mission Control',
};
const REQ_LABEL = { vacation: 'Отпуск', sick: 'Больничный', trip: 'Командировка', certificate: 'Справка', access: 'Доступ', equipment: 'Оборудование', pass: 'Пропуск', other: 'Заявка' };
// Подсказки-чипы: жюри/новичок видит, что умеет ассистент, и запускает сценарий одним кликом.
const CHIPS = {
  cmd: ['Создай задачу: подготовить отчёт к пятнице', 'Впиши встречу завтра в 10:00', 'Оформи заявку на отпуск', 'Открой календарь'],
  ask: ['Как оформить отпуск?', 'Какие требования к паролю?', 'Можно ли работать удалённо?', 'Как оформить командировку?'],
};
// Человеческая дата для подтверждений и озвучки («2026-07-08» → «8 июля»).
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const humanDate = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} ${MONTHS_RU[+m[2] - 1]}` : String(iso || ''); };
// Озвучиваем не больше ~400 символов и режем по границе предложения (сервер клипует по 500 —
// иначе голос обрывается на полуслове).
const ttsTrim = (text) => {
  const t = String(text || '').trim();
  if (t.length <= 400) return t;
  const cut = t.slice(0, 400), m = cut.match(/^[\s\S]*[.!?…]/);
  return (m ? m[0] : cut).trim();
};
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
  // Позиция перетащенной панели ({x,y} в px) или null — стандартный угол.
  const [panelPos, setPanelPos] = useState(() => { try { return JSON.parse(localStorage.getItem('dd_pos') || 'null'); } catch { return null; } });
  const panelRef = useRef(null);
  // Диалог живёт в sessionStorage: перезагрузка страницы не стирает демо-переписку.
  // На сервер при этом уходит ТОЛЬКО текущая фраза (ИИ без истории — stateless).
  const [log, setLog] = useState(() => { try { return (JSON.parse(sessionStorage.getItem('dd_chat') || '[]') || []).slice(-40); } catch { return []; } });
  const [typed, setTyped] = useState('');
  const [interim, setInterim] = useState('');   // живой текст распознавания (нативный движок)
  const [wake, setWake] = useState(() => { try { return localStorage.getItem('dd_wake') === '1'; } catch { return false; } });   // режим отклика на имя «ДиДи»
  const [mode, setMode] = useState('cmd');   // cmd = выполнять команды | ask = отвечать на вопросы (RAG по базе портала)
  const mrRef = useRef(null), streamRef = useRef(null), ctxRef = useRef(null), vadRef = useRef(0), cancelRef = useRef(false);
  const recRef = useRef(null);
  const logRef = useRef(null), inputRef = useRef(null);
  const startNativeRef = useRef(() => {});   // всегда актуальная ссылка на запуск распознавания (для wake-слушателя)
  const modeRef = useRef('cmd'); modeRef.current = mode;   // актуальный режим для голосового ввода
  const voicesRef = useRef([]);
  const canVoice = !!SR || hasMic;
  const addLog = (role, text, extra) => setLog((l) => [...l.slice(-39), { role, text, ...extra }]);
  useEffect(() => { try { sessionStorage.setItem('dd_chat', JSON.stringify(log)); } catch { /* необязательно */ } }, [log]);
  // Автопрокрутка чата вниз + фокус на вводе при открытии панели.
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log, phase, interim]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60); }, [open, mode]);

  // Голоса TTS: подгружаются асинхронно — кэшируем и обновляем по событию.
  useEffect(() => {
    const load = () => { try { voicesRef.current = window.speechSynthesis?.getVoices() || []; } catch {} };
    load();
    window.speechSynthesis?.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load);
  }, []);
  // Пока ДиДи говорит — держим флаг: на это время глушится wake-слушатель (иначе ассистент
  // услышит в колонках сам себя и своё имя) и появляется кнопка «стоп».
  const [speaking, setSpeaking] = useState(false);
  const ttsRef = useRef(null), ttsUrlRef = useRef('');
  const stopSpeaking = useCallback(() => {
    try { ttsRef.current?.pause(); } catch {}
    try { if (ttsUrlRef.current) URL.revokeObjectURL(ttsUrlRef.current); } catch {}
    ttsRef.current = null; ttsUrlRef.current = '';
    try { window.speechSynthesis?.cancel(); } catch {}
    setSpeaking(false);
  }, []);
  // Если панель закрыли — замолкаем; если закрыли во время записи — прекращаем слушать (без отправки).
  useEffect(() => {
    if (open) return;
    stopSpeaking();
    if (phase === 'listening') { cancelRef.current = true; try { mrRef.current?.state !== 'inactive' && mrRef.current?.stop(); } catch {} try { recRef.current?.stop(); } catch {} }
  }, [open, phase, stopSpeaking]);
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
      u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
      synth.cancel(); setSpeaking(true); synth.speak(u);
    } catch { setSpeaking(false); /* TTS необязателен */ }
  }, []);
  // Основной голос ДиДи — тёплый нейросетевой (сервер, gpt-4o-mini-tts). Если недоступен —
  // мгновенно откатываемся на браузерный голос. Предыдущее воспроизведение прерываем.
  const speak = useCallback(async (text) => {
    const spoken = ttsTrim(text);
    if (!spoken) return;
    stopSpeaking();
    try {
      setSpeaking(true);
      const res = await fetch('/api/assistant/tts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: spoken }) });
      if (!res.ok) throw new Error('tts ' + res.status);
      const blob = await res.blob();
      if (!/audio/.test(blob.type)) throw new Error('not audio');
      const url = URL.createObjectURL(blob);
      const a = new Audio(url); ttsRef.current = a; ttsUrlRef.current = url;
      a.onended = () => { try { URL.revokeObjectURL(url); } catch {} if (ttsUrlRef.current === url) ttsUrlRef.current = ''; setSpeaking(false); };
      await a.play();
    } catch { setSpeaking(false); speakBrowser(spoken); }   // фолбэк на браузерный голос
  }, [speakBrowser, stopSpeaking]);

  // Исполнение действий (через уже существующие эндпоинты — права проверяет сервер).
  // voice=true — ввод был голосом: тогда подтверждение озвучиваем; на текст отвечаем тихо.
  const execute = useCallback(async (actions, say, voice) => {
    const done = [];
    for (const a of (actions || [])) {
      try {
        if (a.type === 'navigate' && a.tab) { onGo?.(a.tab); done.push(`Открыл: ${TAB_LABEL[a.tab] || a.tab}`); }
        else if (a.type === 'create_event' && a.title && a.date) {
          const starts_at = a.time ? `${a.date}T${a.time}:00` : `${a.date}T00:00:00`;
          await sendJSON('/api/portal/events', 'POST', { kind: a.kind || 'meeting', title: a.title, starts_at, all_day: !a.time, author_name: me?.username });
          done.push(`Событие «${a.title}» — ${humanDate(a.date)}${a.time ? ' в ' + a.time : ''}`); onGo?.('calendar');
        }
        else if (a.type === 'create_task' && a.title) {
          await sendJSON('/api/portal/tasks', 'POST', { title: a.title, priority: a.priority || 'normal', due_date: a.due_date || undefined });
          done.push(`Задача «${a.title}»${a.due_date ? ' — к ' + humanDate(a.due_date) : ''}`); onGo?.('tasks');
        }
        else if (a.type === 'create_news' && a.title) {
          await sendJSON('/api/portal/news', 'POST', { title: a.title, body: a.body || a.title, category: a.category || 'company', author_name: me?.username });
          done.push(`Новость «${a.title}»`); onGo?.('news');
        }
        else if (a.type === 'create_request' && a.title) {
          await sendJSON('/api/portal/requests', 'POST', { kind: a.kind || 'other', title: a.title, body: a.body || '' });
          done.push(`Заявка (${REQ_LABEL[a.kind] || 'Заявка'}): «${a.title}»`); onGo?.('requests');
        }
        else if (a.type === 'move_event') {
          // Перенос встречи: находим событие по дате/времени/словам из названия → PATCH.
          // ВАЖНО: сервер отдаёт starts_at в UTC — дату/время сравниваем в ЛОКАЛЬНЫХ
          // координатах пользователя (как их видит календарь), иначе «в 10:00» не совпадёт.
          const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          const hhmm = (s) => { const d0 = new Date(s); return `${String(d0.getHours()).padStart(2, '0')}:${String(d0.getMinutes()).padStart(2, '0')}`; };
          const from = a.date || iso(new Date());
          const to = a.date || iso(new Date(Date.now() + 60 * 864e5));   // без даты ищем на 2 месяца вперёд
          const evs = await getJSON(`/api/portal/events?from=${from}&to=${to}`);
          let cand = (Array.isArray(evs) ? evs : []).filter((e) => e.source === 'event');
          if (a.date) cand = cand.filter((e) => iso(new Date(e.starts_at)) === a.date);
          if (a.time) cand = cand.filter((e) => hhmm(e.starts_at) === a.time);
          if (a.query) {
            const q = String(a.query).toLowerCase();
            const byQ = cand.filter((e) => (e.title || '').toLowerCase().includes(q));
            if (byQ.length) cand = byQ;
          }
          if (!cand.length) done.push('⚠ Не нашла такую встречу в календаре — уточните название или дату');
          else {
            const ev = cand[0];   // ближайший подходящий кандидат (список отсортирован по времени)
            const d = a.new_date || iso(new Date(ev.starts_at));
            const t2 = a.new_time || (ev.all_day ? null : hhmm(ev.starts_at));
            await sendJSON(`/api/portal/events/${ev.id}`, 'PATCH', { starts_at: t2 ? `${d}T${t2}:00` : `${d}T00:00:00`, all_day: !t2 });
            done.push(`Встреча «${ev.title}» перенесена: ${humanDate(d)}${t2 ? ' в ' + t2 : ''}`); onGo?.('calendar');
          }
        }
      } catch (e) { done.push(`⚠ ${e.message || 'не удалось выполнить'}`); }
    }
    const reply = say || (done.length ? done.join('; ') : 'Не понял команду');
    if (done.length) addLog('done', done.join('\n'));
    // Текстовый пузырь — только если есть что сказать сверх карточки результата
    // (иначе один и тот же текст дублировался зелёным и серым).
    if (say || !done.length) addLog('bot', reply);
    if (voice) speak(reply);
  }, [onGo, me, speak]);

  // Разбор → исполнение. ИИ-первый: модель понимает свободные формулировки
  // («перенеси встречу с 10 на 12», «задача на послезавтра…») сильно лучше
  // локальных правил. Локальный парсер — только страховка, когда ИИ недоступен:
  // прямые команды продолжают работать даже без сети к провайдерам.
  const runText = useCallback(async (text, voice) => {
    const t = (text || '').trim(); if (!t) return;
    addLog('me', t); setPhase('processing');
    try {
      try {
        const r = await sendJSON('/api/assistant/command', 'POST', { text: t });
        await execute(r.actions, r.say, voice);
      } catch {
        // ИИ недоступен — пробуем локальный парсер (мгновенно, 0 токенов).
        const local = parseVoice(t);
        if (local.length) await execute(local, undefined, voice);
        else addLog('bot', 'Эту фразу я не разобрала, а ИИ сейчас недоступен. Я понимаю прямые команды, например: «создай задачу подготовить отчёт к пятнице», «встреча завтра в 10», «оформи заявку на отпуск», «открой календарь».');
      }
    } catch (e) { addLog('bot', e.message || 'Не получилось выполнить'); }
    finally { setPhase('idle'); }
  }, [execute]);

  // Режим «Спросить»: RAG-ответ по базе портала со ссылками на источники.
  // Если ИИ недоступен — показываем результаты обычного поиска (тоже полезно, без «ошибки»).
  const runAsk = useCallback(async (text, voice) => {
    const t = (text || '').trim(); if (!t) return;
    addLog('me', t); setPhase('processing');
    try {
      const r = await sendJSON('/api/assistant/ask', 'POST', { question: t });
      addLog('bot', r.answer || 'Не нашёл ответа.', { sources: r.sources || [] });
      if (voice) speak(r.answer || '');
    } catch {
      try {
        const s = await sendJSON('/api/portal/search', 'POST', { q: t });
        const found = (s.results || []).slice(0, 5);
        if (found.length) addLog('bot', 'ИИ сейчас недоступен, но вот что нашлось в базе портала:', { sources: found.map((f) => ({ ...f, kindLabel: f.kindLabel || f.kind })) });
        else addLog('bot', 'ИИ сейчас недоступен, и по запросу ничего не нашлось. Попробуйте другими словами.');
      } catch { addLog('bot', 'Поиск сейчас недоступен. Попробуйте чуть позже.'); }
    }
    finally { setPhase('idle'); }
  }, [speak]);

  // Обработка распознанного/введённого текста по текущему режиму (команда или вопрос).
  const handleInput = useCallback((text, voice = false) => { (modeRef.current === 'ask' ? runAsk : runText)(text, voice); }, [runAsk, runText]);

  const cleanup = () => {
    clearTimeout(vadRef.current);
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { ctxRef.current?.close(); } catch {}
    streamRef.current = null; ctxRef.current = null; mrRef.current = null;
    setLevel(0);
  };

  // Основной движок: встроенное распознавание браузера. Мгновенно, потоково, авто-стоп по тишине.
  const startNative = () => {
    stopSpeaking();   // замолкаем перед прослушиванием — иначе микрофон ловит голос ДиДи
    cancelRef.current = false; setInterim('');
    let rec;
    try { rec = new SR(); } catch { return startMedia(); }
    recRef.current = rec;
    rec.lang = 'ru-RU'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = (e.results[i][0].transcript || '').trim();
        if (e.results[i].isFinal) finalText += (finalText && seg ? ' ' : '') + seg; else live += seg;
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
      if (t) handleInput(t, true); else { setPhase('idle'); addLog('bot', 'Не услышал. Повторите, пожалуйста.'); }
    };
    try { rec.start(); setPhase('listening'); } catch { startMedia(); }
  };

  const startRec = () => { if (phase !== 'idle') return; if (SR) startNative(); else startMedia(); };
  startNativeRef.current = startNative;

  // Режим «ДиДи»: фоновое распознавание ждёт обращение по имени и сразу запускает приём команды.
  // Работает только на движках с SpeechRecognition (Chrome/Edge/Safari). Пока идёт команда
  // (phase≠idle) или ДиДи говорит (speaking) — слушатель имени приостановлен: не должно быть
  // двух распознавателей на один микрофон, и ассистент не должен просыпаться от своего же голоса.
  useEffect(() => {
    if (!wake || !SR || phase !== 'idle' || speaking) return;
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
  }, [wake, phase, speaking]);
  useEffect(() => { try { localStorage.setItem('dd_wake', wake ? '1' : '0'); } catch {} }, [wake]);

  // Фолбэк-движок (Firefox и т.п. без SpeechRecognition): запись → WAV → сервер.
  const startMedia = async () => {
    if (!hasMic || phase !== 'idle') return;
    stopSpeaking();   // замолкаем перед прослушиванием — иначе микрофон ловит голос ДиДи
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
        // В режиме «Спросить» серверу нужна только транскрипция — дальше вопрос уходит в RAG,
        // а не в разбор команд (mode передаём, чтобы сервер не тратил ИИ-вызов на NLU).
        const r = await sendJSON('/api/assistant/voice', 'POST', { audio, mode: modeRef.current });
        if (modeRef.current === 'ask') {
          if (r.text) await runAsk(r.text, true);
          else addLog('bot', 'Не расслышал. Повторите, пожалуйста.');
        } else if (r.text) {
          addLog('me', r.text);
          const local = parseVoice(r.text);   // сперва локальный разбор и здесь
          if (local.length) { await execute(local, undefined, true); } else { await execute(r.actions, r.say, true); }
        } else { await execute(r.actions, r.say, true); }
      } catch (e) { addLog('bot', e.message || 'Ассистент недоступен'); }
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
      let speakingNow = false, silence = 0, t0 = Date.now(), calib = [], noise = 0.01;
      const tick = () => {
        if (!mrRef.current || mrRef.current.state === 'inactive') return;
        analyser.getByteTimeDomainData(data);
        let s = 0; for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; s += x * x; }
        const vol = Math.sqrt(s / data.length); setLevel(vol);
        const now = Date.now(), el = now - t0;
        if (el < 450) calib.push(vol);
        else if (calib) { noise = Math.max(0.008, calib.reduce((a, b) => a + b, 0) / (calib.length || 1)); calib = null; }
        const speakThr = Math.max(0.02, noise * 2.4), silThr = Math.max(0.014, noise * 1.6);
        if (vol > speakThr) { speakingNow = true; silence = 0; }
        else if (speakingNow && vol < silThr) { if (!silence) silence = now; else if (now - silence > SIL_MS) { stopRec(); return; } }
        if (el > MAX_MS) { stopRec(); return; }
        if (!speakingNow && el > NOSPEECH_MS) { stopRec(); return; }   // отправляем всё равно — тихую речь распознаёт сервер
        vadRef.current = setTimeout(tick, 60);
      };
      mr.start(); setPhase('listening'); vadRef.current = setTimeout(tick, 60);
    } catch { cleanup(); setPhase('idle'); addLog('bot', 'Не удалось начать запись.'); }
  };
  const stopRec = () => { clearTimeout(vadRef.current); try { if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop(); } catch {} try { recRef.current?.stop(); } catch {} };

  const listening = phase === 'listening', processing = phase === 'processing';

  // Перетаскивание панели за шапку (только десктоп; телефон — фикс у края).
  // Позиция запоминается в localStorage; двойной клик по шапке возвращает на место.
  const startDrag = (e) => {
    if (e.target.closest('button')) return;                              // крестик и т.п. — не драг
    if (window.matchMedia('(max-width: 760px)').matches) return;
    const el = panelRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const move = (ev) => {
      const x = Math.min(window.innerWidth - 70, Math.max(8 - r.width + 70, ev.clientX - sx));
      const y = Math.min(window.innerHeight - 56, Math.max(8, ev.clientY - sy));
      setPanelPos({ x, y });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setPanelPos((p) => { try { if (p) localStorage.setItem('dd_pos', JSON.stringify(p)); } catch {} return p; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };
  const resetPos = () => { setPanelPos(null); try { localStorage.removeItem('dd_pos'); } catch {} };
  // Сохранённая позиция применяется только на десктопе и мягко зажимается в экран.
  const dragPos = panelPos && typeof window !== 'undefined' && window.innerWidth > 760
    ? { x: Math.min(panelPos.x, window.innerWidth - 70), y: Math.min(panelPos.y, window.innerHeight - 56) }
    : null;

  return (
    <div className={`va ${open ? 'open' : ''}`}>
      {open && (
        <div className="va-panel" ref={panelRef}
          style={dragPos ? { position: 'fixed', left: dragPos.x, top: dragPos.y, right: 'auto', bottom: 'auto', zIndex: 95 } : undefined}>
          <div className="va-head" onPointerDown={startDrag} onDoubleClick={resetPos}
            title="Перетащите панель за шапку · двойной клик — вернуть на место">
            <b>💬 ДиДи <span className="va-sub">— ассистент ЦЦР</span></b>
            <button className="va-x" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
          </div>
          <div className="va-modes" role="tablist">
            <button className={`va-mode ${mode === 'cmd' ? 'on' : ''}`} onClick={() => setMode('cmd')} role="tab" aria-selected={mode === 'cmd'}>⚡ Сделать</button>
            <button className={`va-mode ${mode === 'ask' ? 'on' : ''}`} onClick={() => setMode('ask')} role="tab" aria-selected={mode === 'ask'}>❓ Спросить</button>
          </div>
          <div className="va-log" ref={logRef}>
            {log.length === 0 && (mode === 'ask'
              ? <div className="va-hint">Спросите что угодно о работе — я найду ответ в базе портала и покажу источники. Можно начать с подсказки ниже.</div>
              : <div className="va-hint">Я — <b>ДиДи</b>. Напишите команду — создам задачу, встречу, заявку или открою раздел. Можно голосом: кнопка 🎙 рядом с полем ввода.{SR ? ' А если включить «Реагировать на имя» — просто скажите «ДиДи».' : ''}</div>)}
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
            {processing && <div className="va-msg bot">{mode === 'ask' ? 'Ищу ответ в базе…' : 'Разбираю и выполняю…'}</div>}
            {speaking && <button className="adm-btn sm" onClick={stopSpeaking} style={{ alignSelf: 'flex-start' }}>⏹ Прервать озвучку</button>}
          </div>
          <div className="va-chips" aria-label="Примеры">
            {CHIPS[mode].map((c) => (
              <button key={c} className="va-chip" disabled={processing || listening} onClick={() => handleInput(c)}>{c}</button>
            ))}
          </div>
          <form className="va-typed" onSubmit={(e) => { e.preventDefault(); const t = typed; setTyped(''); handleInput(t); }}>
            <input ref={inputRef} className="adm-input" placeholder={mode === 'ask' ? 'Ваш вопрос…' : 'Команда: «создай задачу…», «открой…»'} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={processing || listening} />
            {canVoice && (
              <button type="button" className={`va-mic2 ${listening ? 'on' : ''}`} onClick={listening ? stopRec : startRec} disabled={processing}
                title={listening ? 'Остановить и выполнить' : 'Сказать голосом'} aria-label="Голосовой ввод"
                style={listening ? { '--lvl': Math.min(1, level * 8) } : undefined}>
                {listening ? '●' : '🎙'}
              </button>
            )}
            <button className="adm-btn sm" type="submit" disabled={processing || listening || !typed.trim()}>→</button>
          </form>
          {listening && <div className="va-nofb">Слушаю… скажите фразу и сделайте паузу — я выполню. Повторное нажатие ● останавливает.</div>}
          {SR && (
            <label className="va-wake" title="Фоновое прослушивание имени «ДиДи»">
              <input type="checkbox" checked={wake} onChange={(e) => setWake(e.target.checked)} />
              <span>Реагировать на имя «ДиДи»{wake ? ' — слушаю…' : ''}</span>
            </label>
          )}
        </div>
      )}
      <button className={`va-fab ${listening ? 'live' : ''} ${wake && !open ? 'wake' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="ДиДи — ассистент" title={wake ? 'ДиДи слушает имя' : 'ДиДи — ассистент'}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-8 8H5a2 2 0 0 1-2-2v-6a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" /><path d="M8 11h.01M12 11h.01M16 11h.01" />
        </svg>
      </button>
    </div>
  );
}
