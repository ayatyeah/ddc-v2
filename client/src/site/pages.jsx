import Hero from './Hero.jsx';
import BuildingShot from './BuildingShot.jsx';
import Services from './Services.jsx';
import Showcase from './Showcase.jsx';
import Stats from './Stats.jsx';
import Workstation from './Workstation.jsx';
import About from './About.jsx';
import News from './News.jsx';
import Contact from './Contact.jsx';

export function HomePage() {
  return (<><Hero /><Stats /><div className="page-soft"><News /></div></>);
}
export function ServicesPage() {
  return (<div className="page-top"><Services /><Showcase /></div>);
}
export function AboutPage() {
  return (<div className="page-top"><About /><BuildingShot /><Workstation /></div>);
}
export function ContactPage() {
  return (<div className="page-top"><Contact /></div>);
}

/* Каждая страница — своё состояние 3D-фона + свой мягкий оттенок неба.
   Главная остаётся «небесной», остальные — другие пастельные тона. */
export const ROUTES = {
  '/':         { prog: 0.06, Comp: HomePage,     light: { top: '#cfe6ff', a: '#8fbdf0', b: '#e6f3ff' }, dark: { top: '#12244e', a: '#05080f', b: '#03060c' } },
  '/uslugi':   { prog: 0.34, Comp: ServicesPage, light: { top: '#d4f2ea', a: '#a6dccd', b: '#e9faf4' }, dark: { top: '#0e2a4a', a: '#04070f', b: '#03060c' } },
  '/o-nas':    { prog: 0.52, Comp: AboutPage,    light: { top: '#e4e4ff', a: '#b4b6ef', b: '#eeefff' }, dark: { top: '#1a2050', a: '#05070f', b: '#04060c' } },
  '/kontakty': { prog: 0.92, Comp: ContactPage,  light: { top: '#ffe7da', a: '#f0bda6', b: '#fff1ea' }, dark: { top: '#102a52', a: '#05080f', b: '#03060c' } },
};
