// Летающие казахские орнаменты (орнамент.png) на фоне карты.
// Лёгкий слой: одна картинка кэшируется браузером, дрейф через CSS-трансформы (GPU).
const ORNS = [
  { top: '11%', left: '7%',  size: 132, dur: 34, delay: 0, rot: -8,  dx: 26,  dy: -34 },
  { top: '58%', left: '12%', size: 96,  dur: 44, delay: 6, rot: 12,  dx: -22, dy: -30 },
  { top: '20%', left: '80%', size: 150, dur: 38, delay: 3, rot: 6,   dx: -30, dy: 26  },
  { top: '70%', left: '76%', size: 108, dur: 48, delay: 9, rot: -14, dx: 30,  dy: 24  },
  { top: '42%', left: '46%', size: 84,  dur: 54, delay: 2, rot: 18,  dx: 20,  dy: 34  },
];

export default function OrnamentField() {
  return (
    <div className="kz-field" aria-hidden="true">
      {ORNS.map((o, i) => (
        <img
          key={i}
          src="/ornament.png"
          alt=""
          className="kz-orn-img"
          loading="lazy"
          decoding="async"
          style={{
            top: o.top, left: o.left, width: o.size,
            '--dur': `${o.dur}s`, '--delay': `${o.delay}s`,
            '--rot': `${o.rot}deg`, '--dx': `${o.dx}px`, '--dy': `${o.dy}px`,
          }}
        />
      ))}
    </div>
  );
}
