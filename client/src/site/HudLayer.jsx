/* HUD-слой (передний план): техно-оверлей вокруг 3D-сцены — угловые скобки, координаты,
   телеметрия, сканирующая линия, реткл. Самый быстрый параллакс (ближе всех к зрителю).
   Только десктоп; гаснет при скролле (через opacity от --sy в CSS). */
export default function HudLayer() {
  return (
    <div className="hud-layer" aria-hidden="true">
      <span className="hud-corner tl" />
      <span className="hud-corner tr" />
      <span className="hud-corner bl" />
      <span className="hud-corner br" />

      <div className="hud-chip hud-coord">
        <b>51.1690° N · 71.4491° E</b>
        <small>ASTANA · HEADQUARTERS</small>
      </div>

      <div className="hud-chip hud-tele">
        <span><i />DDC · ЦЦР</span>
        <span><i />NBK GROUP</span>
        <span><i />ICT · SECURE</span>
      </div>

      <div className="hud-scan" />

      <div className="hud-reticle">
        <span className="hr-h" /><span className="hr-v" /><b />
      </div>
    </div>
  );
}
