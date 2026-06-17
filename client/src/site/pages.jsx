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
   Светлая тема: посветлее и с заметно разными оттенками по разделам.
   Тёмная тема: глубокие, но различимые тона. */
export const ROUTES = {
  '/':         { prog: 0.06, Comp: HomePage, title: 'Центр цифрового развития · Национальный Банк Казахстана', desc: 'Цифровые продукты и IT-инфраструктура для финансового сектора Казахстана.',     light: { top: '#dcefff', a: '#a9d4f7', b: '#f2f9ff' }, dark: { top: '#16306a', a: '#070d1c', b: '#04070f' } },
  '/uslugi':   { prog: 0.34, Comp: ServicesPage, title: 'Услуги · Центр цифрового развития', desc: 'Разработка цифровых продуктов, low-code платформы, интеграции и IT-консалтинг.', light: { top: '#d6f7ec', a: '#aee6d3', b: '#f0fdf8' }, dark: { top: '#0c3a44', a: '#06120f', b: '#04080a' } },
  '/o-nas':    { prog: 0.52, Comp: AboutPage, title: 'О нас · Центр цифрового развития', desc: 'О команде и миссии Центра цифрового развития Национального Банка Казахстана.',    light: { top: '#e7e6ff', a: '#c2c2f6', b: '#f4f3ff' }, dark: { top: '#241a5c', a: '#0a0820', b: '#05060f' } },
  '/kontakty': { prog: 0.92, Comp: ContactPage, title: 'Контакты · Центр цифрового развития', desc: 'Свяжитесь с Центром цифрового развития: Астана, пр. Мангилик Ел, 57А.',  light: { top: '#ffe9dc', a: '#f6c8b1', b: '#fff5ee' }, dark: { top: '#3a1f2c', a: '#170a12', b: '#0a050a' } },
};
