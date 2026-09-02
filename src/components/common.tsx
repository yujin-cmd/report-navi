import type { ReactNode } from 'react';
import type { AppStep, SlideData } from '../types';

type IconName =
  | 'arrow-right' | 'upload' | 'target' | 'mic' | 'check' | 'clock' | 'route' | 'search'
  | 'monitor' | 'chevron-left' | 'chevron-right' | 'plus' | 'trash' | 'alert' | 'play'
  | 'stop' | 'external' | 'file' | 'x' | 'spark' | 'edit' | 'menu';

export function Icon({ name, size = 18, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  const paths: Record<IconName, ReactNode> = {
    'arrow-right': <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    route: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h2a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2h2"/><path d="m15 14 3 3 3-3"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
    'chevron-left': <path d="m15 18-6-6 6-6"/>,
    'chevron-right': <path d="m9 18 6-6-6-6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></>,
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.5h.01"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    stop: <rect x="6" y="6" width="12" height="12" rx="1"/>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/></>,
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
    x: <path d="m6 6 12 12M18 6 6 18"/>,
    spark: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
    edit: <><path d="m4 16-.5 4.5L8 20 19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

const STEPS: Array<{ key: AppStep; label: string }> = [
  { key: 'setup', label: '목적지' },
  { key: 'upload', label: '자료 분석' },
  { key: 'review', label: 'Decision Set' },
  { key: 'presenter', label: '실시간 보고' },
  { key: 'report', label: '도착 리포트' },
];

export function AppHeader({ step }: { step: AppStep }) {
  const activeIndex = STEPS.findIndex((item) => item.key === step);
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark"><span /></div>
        <div><strong>REPORT NAVI</strong><small>DECISION COMPLETENESS</small></div>
      </div>
      <nav className="step-nav" aria-label="진행 단계">
        {STEPS.map((item, index) => (
          <div className={`step-item ${index === activeIndex ? 'active' : ''} ${index < activeIndex ? 'complete' : ''}`} key={item.key}>
            <span>{index < activeIndex ? <Icon name="check" size={13}/> : index + 1}</span>
            <em>{item.label}</em>
          </div>
        ))}
      </nav>
      <div className="header-status"><span /> LOCAL SAFE MODE</div>
    </header>
  );
}

export function PageShell({ step, children, narrow = false }: { step: AppStep; children: ReactNode; narrow?: boolean }) {
  return (
    <div className="app-shell">
      <AppHeader step={step} />
      <main className={`page-main ${narrow ? 'page-main--narrow' : ''}`}>{children}</main>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function SlideCanvas({ slide, compact = false }: { slide: SlideData; compact?: boolean }) {
  if (slide.imageDataUrl) {
    return <img className="pdf-slide-image" src={slide.imageDataUrl} alt={`PDF ${slide.page}페이지: ${slide.title}`} />;
  }
  return (
    <article className={`demo-slide demo-slide--${slide.tone || 'default'} ${compact ? 'demo-slide--compact' : ''}`}>
      <div className="slide-topline">
        <span className="slide-brand">REPORT NAVI <i>DEMO</i></span>
        <span>{slide.kicker}</span>
      </div>
      <div className="slide-content">
        <h2>{slide.title.split('\n').map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}</h2>
        {slide.body && <p className="slide-body">{slide.body}</p>}
        {slide.metrics && (
          <div className={`slide-metrics slide-metrics--${slide.metrics.length}`}>
            {slide.metrics.map((metric) => (
              <div className="slide-metric" key={`${metric.label}-${metric.value}`}>
                <small>{metric.label}</small><strong>{metric.value}</strong>{metric.note && <span>{metric.note}</span>}
              </div>
            ))}
          </div>
        )}
        {slide.bullets && (
          <ul className="slide-bullets">
            {slide.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
          </ul>
        )}
      </div>
      <footer><span>{slide.footer}</span><b>{slide.page.toString().padStart(2, '0')}</b></footer>
    </article>
  );
}
