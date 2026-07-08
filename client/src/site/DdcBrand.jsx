// Фирменный слой DDC: еле заметные финтех-глифы (₸, хеш, код, безопасность, данные) медленно
// дрейфуют в глубине + тонкий скан-лайн «дата-центра». Только десктоп, off на слабых устройствах
// и в reduced-motion (гейтится в CSS по data-perf-tier). pointer-events:none — не мешает кликам.
// 6 глифов вместо 10 — меньше одновременных фоновых анимаций (перф на средних машинах)
const GLYPHS = [
  { c: '₸', x: 8, y: 22, s: 1.5, d: 0 },
  { c: '</>', x: 84, y: 18, s: 1.0, d: 3 },
  { c: '⛓', x: 16, y: 72, s: 1.2, d: 6 },
  { c: '₸', x: 72, y: 78, s: 1.1, d: 9 },
  { c: '0x1F', x: 90, y: 56, s: 0.8, d: 5 },
  { c: '⬡', x: 78, y: 34, s: 1.1, d: 1 },
];

export default function DdcBrand() {
  return (
    <div id="ddc-brand" aria-hidden="true">
      <div className="ddc-scan" />
      {GLYPHS.map((g, i) => (
        <span key={i} className="ddc-glyph" style={{ left: `${g.x}%`, top: `${g.y}%`, fontSize: `${g.s}rem`, animationDelay: `${g.d}s` }}>{g.c}</span>
      ))}
    </div>
  );
}
