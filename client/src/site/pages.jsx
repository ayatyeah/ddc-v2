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
  // prog 0.62 = конечный вид (здания исчезли, надпись DDC на карте, вид сверху); карта
  // довёрнута под угол страницы (yaw). Контакты — низкий prog: здания возвращаются.
  '/':         { prog: 0.06, yaw: 0,      Comp: HomePage, title: 'Центр цифрового развития · Национальный Банк Казахстана', desc: 'Цифровые продукты и IT-инфраструктура для финансового сектора Казахстана.',     light: { top: '#dcefff', a: '#a9d4f7', b: '#f2f9ff' }, dark: { top: '#1d4a8f', a: '#0b1d3a', b: '#050e1f' } },
  '/uslugi':   { prog: 0.62, yaw: -0.16,  Comp: ServicesPage, title: 'Услуги · Центр цифрового развития', desc: 'Разработка цифровых продуктов, low-code платформы, интеграции и IT-консалтинг.', light: { top: '#d6f7ec', a: '#aee6d3', b: '#f0fdf8' }, dark: { top: '#0c3a44', a: '#06120f', b: '#04080a' } },
  '/o-nas':    { prog: 0.62, yaw: 0,      Comp: AboutPage, title: 'О нас · Центр цифрового развития', desc: 'О команде и миссии Центра цифрового развития Национального Банка Казахстана.',    light: { top: '#dde9ff', a: '#aec7ec', b: '#f3f7ff' }, dark: { top: '#102a52', a: '#070f20', b: '#04070f' } },
  '/kontakty': { prog: 0.10, yaw: 0,      Comp: ContactPage, title: 'Контакты · Центр цифрового развития', desc: 'Свяжитесь с Центром цифрового развития: Астана, пр. Мангилик Ел, 57А.',  light: { top: '#d9f1ff', a: '#a6d6ef', b: '#f1fbff' }, dark: { top: '#0b3050', a: '#06101c', b: '#04070f' } },
};
