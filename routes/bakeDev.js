// routes/bakeDev.js — приём запечённых кадров пролёта от /bake.html. ТОЛЬКО dev:
// монтируется в server.js при !PROD. Кадры кладутся в client/public/bake/ и коммитятся —
// прод их просто раздаёт как статику (сборка Vite копирует client/public → public).
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const DIR = path.join(__dirname, '..', 'client', 'public', 'bake');

router.post('/api/bake/frame', (req, res) => {
  const { theme, i, dataUrl } = req.body || {};
  const th = theme === 'light' ? 'light' : 'dark';
  const n = Number(i);
  const m = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!Number.isInteger(n) || n < 0 || n > 200 || !m) return res.status(400).json({ error: 'Некорректный кадр' });
  try {
    const dir = path.join(DIR, th);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, String(n).padStart(2, '0') + '.webp'), Buffer.from(m[1], 'base64'));
    res.json({ ok: true });
  } catch (e) { console.error('bake frame:', e.message); res.status(500).json({ error: e.message }); }
});

// Манифест: каждый прогон добавляет свою тему (dark и light пекутся отдельными заходами).
router.post('/api/bake/manifest', (req, res) => {
  const b = req.body || {};
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const mPath = path.join(DIR, 'manifest.json');
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(mPath, 'utf8')); } catch { /* первого манифеста ещё нет */ }
    const themes = new Set(cur.themes || []);
    if (b.theme) themes.add(b.theme);
    const man = { v: 1, frames: b.frames || cur.frames, pMax: b.pMax || cur.pMax, w: b.w || cur.w, h: b.h || cur.h, themes: [...themes] };
    fs.writeFileSync(mPath, JSON.stringify(man));
    res.json({ ok: true, manifest: man });
  } catch (e) { console.error('bake manifest:', e.message); res.status(500).json({ error: e.message }); }
});

module.exports = router;
