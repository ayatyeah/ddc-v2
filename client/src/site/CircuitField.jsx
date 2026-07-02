// Большие полупрозрачные контуры микросхем на заднем плане (за 3D-сценой), с параллаксом.
// Чистый SVG/CSS — дёшево на любом устройстве. Параллакс через --sy (scrollY, ставит Site.jsx).

function Chip({ x, y, s, pins = 6 }) {
  const ticks = [];
  const gap = s / (pins + 1);
  for (let i = 1; i <= pins; i++) {
    const p = i * gap, L = 11;
    ticks.push(<line key={`t${i}`} x1={x + p} y1={y} x2={x + p} y2={y - L} />);
    ticks.push(<line key={`b${i}`} x1={x + p} y1={y + s} x2={x + p} y2={y + s + L} />);
    ticks.push(<line key={`l${i}`} x1={x} y1={y + p} x2={x - L} y2={y + p} />);
    ticks.push(<line key={`r${i}`} x1={x + s} y1={y + p} x2={x + s + L} y2={y + p} />);
  }
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx="12" />
      <rect x={x + s * 0.28} y={y + s * 0.28} width={s * 0.44} height={s * 0.44} rx="6" className="cf-inner" />
      <circle cx={x + 16} cy={y + 16} r="4.5" className="cf-dot" />
      {ticks}
    </g>
  );
}

export default function CircuitField() {
  return (
    <div className="circuit-field" aria-hidden="true">
      <svg className="circuit-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        {/* трассы (дорожки) с прямыми углами и контактными площадками */}
        <path d="M-40 250 H180 V430 H420" />
        <path d="M420 430 L520 330 H760" />
        <path d="M1240 120 V300 H1040 V520" />
        <path d="M1040 520 H1360 V760 H1640" />
        <path d="M260 780 H600 V620 H820 V820 H1120" />
        <path d="M120 120 L240 240" />
        <circle cx="180" cy="430" r="6" className="cf-pad" />
        <circle cx="760" cy="330" r="6" className="cf-pad" />
        <circle cx="1040" cy="520" r="6" className="cf-pad" />
        <circle cx="820" cy="620" r="6" className="cf-pad" />
        <circle cx="600" cy="780" r="6" className="cf-pad" />
        {/* чипы */}
        <Chip x={120} y={330} s={190} pins={6} />
        <Chip x={1120} y={640} s={230} pins={7} />
        <Chip x={900} y={140} s={150} pins={5} />
        <Chip x={430} y={40} s={120} pins={4} />
      </svg>
    </div>
  );
}
