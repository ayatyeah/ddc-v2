import { useState } from 'react';
import Hero from './Hero.jsx';
import BuildingShot from './BuildingShot.jsx';
import Services from './Services.jsx';
import Showcase from './Showcase.jsx';
import Projects from './Projects.jsx';
import Stats from './Stats.jsx';
import Directions from './Directions.jsx';
import About from './About.jsx';
import News from './News.jsx';
import Contact from './Contact.jsx';
import Privacy from './Privacy.jsx';
import CtaBand from './CtaBand.jsx';
import NotFound from './NotFound.jsx';
import SectionLanding from './SectionLanding.jsx';
import LeadForm from './LeadForm.jsx';
import Vacancies from './Vacancies.jsx';
import Ribbon from './Ribbon.jsx';

export function HomePage() {
  return (<><Hero /><Ribbon /><Directions /><div className="page-soft"><News /></div><CtaBand /></>);
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
   Все тона выведены из фирменного спектра (#0F534C зелёный, #2BBAAC бирюза, #022622 глубокий):
   светлая тема — разбелённые версии, тёмная — производные от глубокого. Разделы остаются
   различимы по температуре: главная и услуги ближе к бирюзе, карьера и партнёры — к зелёному,
   проекты и контакты — самые холодные. */
export const ROUTES = {
  // prog 0.62 = конечный вид (здания исчезли, надпись DDC на карте, вид сверху); карта
  // довёрнута под угол страницы (yaw). Контакты — низкий prog: здания возвращаются.
  '/':         { prog: 0.06, yaw: 0,      Comp: HomePage, title: 'Центр цифрового развития · Национальный Банк Казахстана', desc: 'Цифровые продукты и IT-инфраструктура для финансового сектора Казахстана.',     light: { top: '#d7f0ec', a: '#a4dbd3', b: '#f3fbfa' }, dark: { top: '#0d4f48', a: '#052b27', b: '#021d1a' } },
  '/uslugi':   { prog: 0.62, yaw: 0,  Comp: ServicesPage, title: 'Услуги · Центр цифрового развития', desc: 'Разработка цифровых продуктов, low-code платформы, интеграции и IT-консалтинг.', light: { top: '#d2f1e7', a: '#9fdfc9', b: '#eefbf6' }, dark: { top: '#0a554b', a: '#042c27', b: '#021c19' } },
  '/proekty':  { prog: 0.62, yaw: 0,  Comp: ProjectsPage, title: 'Проекты и инновации · Центр цифрового развития', desc: 'Ключевые технологические проекты ЦЦР: Фабрика данных, NBK AI Platform, портал госзакупок НБК, регуляторная песочница.', light: { top: '#d4eeee', a: '#a2d6d6', b: '#f1fafa' }, dark: { top: '#0b4d50', a: '#042a2c', b: '#021b1c' } },
  '/karera':     { prog: 0.62, yaw: 0,  Comp: CareersPage, title: 'Карьера · Центр цифрового развития', desc: 'Разрабатывай ИТ-решения национального масштаба: вакансии, стек, стажировки.', light: { top: '#ddeee4', a: '#b2d9c4', b: '#f4faf7' }, dark: { top: '#10513f', a: '#062d24', b: '#021d18' } },
  '/partners':   { prog: 0.62, yaw: 0, Comp: PartnersPage, title: 'Партнёрам · Центр цифрового развития', desc: 'Экспресс-комплаенс и подача документов для ИТ-подрядчиков.', light: { top: '#d9ebe4', a: '#a9d2c2', b: '#f2f9f6' }, dark: { top: '#0b463a', a: '#042722', b: '#021a17' } },
  '/o-nas':    { prog: 0.62, yaw: 0,      Comp: AboutPage, title: 'О нас · Центр цифрового развития', desc: 'О команде и миссии Центра цифрового развития Национального Банка Казахстана.',    light: { top: '#d9ebe4', a: '#a9d2c2', b: '#f2f9f6' }, dark: { top: '#0b463a', a: '#042722', b: '#021a17' } },
  '/kontakty': { prog: 0.10, yaw: 0,      Comp: ContactPage, title: 'Контакты · Центр цифрового развития', desc: 'Свяжитесь с Центром цифрового развития: Астана, пр. Мангилик Ел, 57А.',  light: { top: '#d0f0ea', a: '#9adacf', b: '#eefaf8' }, dark: { top: '#094b4d', a: '#042a2b', b: '#021b1c' } },
  '/politika-konfidencialnosti': { prog: 0.62, yaw: 0, Comp: PrivacyPage, title: 'Политика конфиденциальности · Центр цифрового развития', desc: 'Политика конфиденциальности и обработки персональных данных Центра цифрового развития.', light: { top: '#dceee7', a: '#aed4c6', b: '#f3faf8' }, dark: { top: '#0a3f36', a: '#042420', b: '#021a17' } },
};
