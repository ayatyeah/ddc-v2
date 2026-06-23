import { useLang } from '../store.js';
import { t } from '../i18n.js';
import Reveal from './Reveal.jsx';
import { IcoCode, IcoLink, IcoCart, IcoChart, IcoSupport, IcoShield } from './icons.jsx';

const ITEMS = [
  { k: 's1', Ico: IcoCode, c: '#2f6fe0' },
  { k: 's2', Ico: IcoLink, c: '#5a3fd6' },
  { k: 's3', Ico: IcoCart, c: '#0a8a5a' },
  { k: 's4', Ico: IcoChart, c: '#b07d12' },
  { k: 's5', Ico: IcoSupport, c: '#0a7aa8' },
  { k: 's6', Ico: IcoShield, c: '#c0455a' },
];

export default function Services() {
  const lang = useLang();
  return (
    <section className="section" id="services">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="eyebrow">{t(lang, 'services.eyebrow')}</div>
          <h2 className="h2">{t(lang, 'services.title')}</h2>
        </Reveal>
        <div className="svc-grid">
          {ITEMS.map(({ k, Ico, c }, i) => (
            <Reveal key={k} className="svc" delay={i * 70}>
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <div className="svc-ico" style={{ '--c': c }}><Ico size={24} /></div>
              <h3>{t(lang, `services.${k}t`)}</h3>
              <p>{t(lang, `services.${k}d`)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
