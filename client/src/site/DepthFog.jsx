/* Слой атмосферного тумана между PCB-линиями и 3D-сценой — даёт глубину (воздух между
   планами). Большие мягкие пятна, лёгкий дрейф + параллакс по скроллу/мыши (через --sy/--mx). */
export default function DepthFog() {
  return (
    <div className="depth-fog" aria-hidden="true">
      <span className="df-blob b1" />
      <span className="df-blob b2" />
      <span className="df-blob b3" />
    </div>
  );
}
