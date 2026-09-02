import { useEffect, useState } from 'react';
import type { ProjectorSnapshot } from '../types';
import { Icon, SlideCanvas } from './common';

export function ProjectorScreen() {
  const [snapshot, setSnapshot] = useState<ProjectorSnapshot | null>(null);

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return undefined;
    const channel = new BroadcastChannel('report-navi-presentation');
    channel.onmessage = (event) => {
      if (event.data?.type === 'snapshot') setSnapshot(event.data.payload as ProjectorSnapshot);
    };
    channel.postMessage({ type: 'presentation-ready' });
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') channel.postMessage({ type: 'navigate', delta: -1 });
      if (event.key === 'ArrowRight' || event.key === ' ') channel.postMessage({ type: 'navigate', delta: 1 });
    };
    window.addEventListener('keydown', keyHandler);
    return () => { channel.close(); window.removeEventListener('keydown', keyHandler); };
  }, []);

  if (!snapshot) {
    return <div className="projector-wait"><div className="projector-logo"><span/><strong>REPORT NAVI</strong></div><div className="wait-pulse"><Icon name="monitor" size={30}/></div><h1>보고자 화면과 연결 중입니다</h1><p>보고자 화면에서 현재 슬라이드를 전송하면 자동으로 표시됩니다.</p></div>;
  }
  const active = snapshot.slides.find((slide) => slide.page === snapshot.currentSlide) || snapshot.slides[0];
  return (
    <div className="projector-shell">
      <header><div className="projector-logo"><span/><strong>REPORT NAVI</strong></div><p>{snapshot.title}</p><span>SLIDE {snapshot.currentSlide} / {snapshot.slides.length}</span></header>
      <main>{active && <SlideCanvas slide={active}/>}</main>
      <footer><span>{snapshot.objective}</span><small>← → 키로 페이지 이동</small></footer>
    </div>
  );
}
