import { useState } from 'react';
import Hero from './Hero.jsx';
import BuildingShot from './BuildingShot.jsx';
import Services from './Services.jsx';
import Showcase from './Showcase.jsx';
import Projects from './Projects.jsx';
import Stats from './Stats.jsx';
import About from './About.jsx';
import News from './News.jsx';
import Contact from './Contact.jsx';
import Privacy from './Privacy.jsx';
import CtaBand from './CtaBand.jsx';
import NotFound from './NotFound.jsx';
import SectionLanding from './SectionLanding.jsx';
import LeadForm from './LeadForm.jsx';
import Vacancies from './Vacancies.jsx';

export function HomePage() {
  return (<><Hero /><Stats /><div className="page-soft"><News /></div></>);
}
export function ServicesPage() {
  return (<div className="page-top"><Showcase /><Services /><CtaBand /></div>);
}
export function ProjectsPage() {
  return (<div className="page-top"><Projects /><CtaBand /></div>);
}
export function NotFoundPage() {
  return (<div className="page-top"><NotFound /></div>);
}
// Новые разделы архитектуры — типовой лендинг из конфига siteMap
// Карьера и Партнёрам — лендинг + своя форма-заявка (в админку падает как лид)
export function CareersPage() {
  const [vac, setVac] = useState('');
  const apply = (title) => { setVac(title); setTimeout(() => document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth' }), 30); };
  return (<div className="page-top"><SectionLanding sectionKey="careers" hideCta />
    <Vacancies onApply={apply} />
    <LeadForm subject="careers.form.subject" titleKey="careers.form.title" subKey="careers.form.sub" msgPlaceholderKey="careers.form.msg"
      kind="career" withFile pickVacancy vacancyValue={vac} onVacancyChange={setVac} /></div>);
}
export function PartnersPage() {
  return (<div className="page-top"><SectionLanding sectionKey="partners" hideCta />
    <LeadForm subject="partners.form.subject" titleKey="partners.form.title" subKey="partners.form.sub" msgPlaceholderKey="partners.form.msg" /></div>);
}
export function AboutPage() {
  return (<div className="page-top"><About /><BuildingShot /><CtaBand /></div>);
}
export function ContactPage() {
  return (<div className="page-top"><Contact /></div>);
}
export function PrivacyPage() {
  return (<div className="page-top"><Privacy /></div>);
}

/* Каждая страница — своё состояние 3D-фона + свой мягкий оттенок неба.
   Светлая тема: посветлее и с заметно разными оттенками по разделам.
   Тёмная тема: глубокие, но различимые тона. */
export const ROUTES = {
  // prog 0.62 = конечный вид (здания исчезли, надпись DDC на карте, вид сверху); карта
  // довёрнута под угол страницы (yaw). Контакты — низкий prog: здания возвращаются.
  '/':         { prog: 0.06, yaw: 0,      Comp: HomePage, title: 'Центр цифрового развития · Национальный Банк Казахстана', desc: 'Цифровые продукты и IT-инфраструктура для финансового сектора Казахстана.',     light: { top: '#dcefff', a: '#a9d4f7', b: '#f2f9ff' }, dark: { top: '#102a4f', a: '#07142a', b: '#03070f' } },
  '/uslugi':   { prog: 0.62, yaw: -0.16,  Comp: ServicesPage, title: 'Услуги · Центр цифрового развития', desc: 'Разработка цифровых продуктов, low-code платформы, интеграции и IT-консалтинг.', light: { top: '#d6f7ec', a: '#aee6d3', b: '#f0fdf8' }, dark: { top: '#0c3a44', a: '#06120f', b: '#04080a' } },
  '/proekty':  { prog: 0.62, yaw: -0.10,  Comp: ProjectsPage, title: 'Проекты и инновации · Центр цифрового развития', desc: 'Ключевые технологические проекты ЦЦР: Фабрика данных, NBK AI Platform, портал госзакупок НБК, регуляторная песочница.', light: { top: '#d4f6ff', a: '#a9def0', b: '#f0fbff' }, dark: { top: '#0c2c44', a: '#06121f', b: '#04080f' } },
  '/karera':     { prog: 0.40, yaw: 0.10,  Comp: CareersPage, title: 'Карьера · Центр цифрового развития', desc: 'Разрабатывай ИТ-решения национального масштаба: вакансии, стек, стажировки.', light: { top: '#daf2ff', a: '#aed6ef', b: '#f1fbff' }, dark: { top: '#10325c', a: '#070f20', b: '#04070f' } },
  '/partners':   { prog: 0.62, yaw: -0.08, Comp: PartnersPage, title: 'Партнёрам · Центр цифрового развития', desc: 'Экспресс-комплаенс и подача документов для ИТ-подрядчиков.', light: { top: '#dde9ff', a: '#aec7ec', b: '#f3f7ff' }, dark: { top: '#102a52', a: '#070f20', b: '#04070f' } },
  '/o-nas':    { prog: 0.62, yaw: 0,      Comp: AboutPage, title: 'О нас · Центр цифрового развития', desc: 'О команде и миссии Центра цифрового развития Национального Банка Казахстана.',    light: { top: '#dde9ff', a: '#aec7ec', b: '#f3f7ff' }, dark: { top: '#102a52', a: '#070f20', b: '#04070f' } },
  '/kontakty': { prog: 0.10, yaw: 0,      Comp: ContactPage, title: 'Контакты · Центр цифрового развития', desc: 'Свяжитесь с Центром цифрового развития: Астана, пр. Мангилик Ел, 57А.',  light: { top: '#d9f1ff', a: '#a6d6ef', b: '#f1fbff' }, dark: { top: '#0b3050', a: '#06101c', b: '#04070f' } },
  '/politika-konfidencialnosti': { prog: 0.62, yaw: 0, Comp: PrivacyPage, title: 'Политика конфиденциальности · Центр цифрового развития', desc: 'Политика конфиденциальности и обработки персональных данных Центра цифрового развития.', light: { top: '#dde9ff', a: '#aec7ec', b: '#f3f7ff' }, dark: { top: '#0b2347', a: '#070f20', b: '#04070f' } },
};
