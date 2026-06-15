import { useEffect, useRef } from 'react';
import { useTheme } from '../store.js';
import Nav from './Nav.jsx';
import Hero from './Hero.jsx';
import BuildingShot from './BuildingShot.jsx';
import Services from './Services.jsx';
import Showcase from './Showcase.jsx';
import Stats from './Stats.jsx';
import Workstation from './Workstation.jsx';
import About from './About.jsx';
import News from './News.jsx';
import Contact from './Contact.jsx';
import Footer from './Footer.jsx';
import Assistant from './Assistant.jsx';
import Background3D from './Background3D.jsx';
import Logo3D from './Logo3D.jsx';
import Particles from './Particles.jsx';
import Fog from './Fog.jsx';

/* Мягкие палитры фона на ключевых точках прокрутки (0 → верх, 1 → низ).
   top — пятно-подсветка сверху, a/b — вертикальный градиент. */
const STOPS = {
  light: [
    { p: 0.00, top: '#eef3ff', a: '#fbfbfd', b: '#eef2fb' },
    { p: 0.30, top: '#e9f6ff', a: '#f6f9ff', b: '#eaf1fc' },
    { p: 0.55, top: '#fff6e8', a: '#fbfaf7', b: '#f4f0e6' },
    { p: 0.78, top: '#eafaf2', a: '#f7fcf9', b: '#eaf3ef' },
    { p: 1.00, top: '#eef3ff', a: '#fafbfe', b: '#eef2fb' },
  ],
  dark: [
    { p: 0.00, top: '#0a1430', a: '#000000', b: '#05080f' },
    { p: 0.30, top: '#0b1a38', a: '#02040a', b: '#070b16' },
    { p: 0.55, top: '#251c08', a: '#050402', b: '#0f0c06' },
    { p: 0.78, top: '#08231a', a: '#020503', b: '#06100b' },
    { p: 1.00, top: '#0a1430', a: '#000000', b: '#05080f' },
  ],
};

function hex(v) {
  const n = parseInt(v.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a, b, k) {
  const ca = hex(a), cb = hex(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * k);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * k);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * k);
  return `rgb(${r}, ${g}, ${bl})`;
}

export default function Site() {
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const bg = document.getElementById('scroll-bg');
    if (!bg) return;
    bg.style.transition = 'background 0.18s linear';
    let raf = 0;

    const apply = () => {
      raf = 0;
      const stops = STOPS[themeRef.current] || STOPS.light;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      let i = 0;
      while (i < stops.length - 2 && p > stops[i + 1].p) i++;
      const s0 = stops[i], s1 = stops[i + 1];
      const k = s1.p === s0.p ? 0 : (p - s0.p) / (s1.p - s0.p);
      bg.style.setProperty('--bg-top', lerp(s0.top, s1.top, k));
      bg.style.setProperty('--bg-a', lerp(s0.a, s1.a, k));
      bg.style.setProperty('--bg-b', lerp(s0.b, s1.b, k));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Пересчёт палитры при переключении темы.
  useEffect(() => { window.dispatchEvent(new Event('scroll')); }, [theme]);

  return (
    <>
      <div id="scroll-bg" />
      <Background3D />
      <Logo3D />
      <Particles />
      <Fog />
      <div id="scroll-grain" />
      <Nav />
      <main>
        <Hero />
        <BuildingShot />
        <Services />
        <Showcase />
        <Stats />
        <Workstation />
        <About />
        <News />
        <Contact />
      </main>
      <Footer />
      <Assistant />
    </>
  );
}
