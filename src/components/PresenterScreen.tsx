import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { findDeliveredItemIds, formatClock, getNextRequiredItem, shouldPrioritize } from '../lib/report';
import { DECISION_LABELS, type ProjectorSnapshot, type ReportSession, type SlideData } from '../types';
import { Badge, Icon, SlideCanvas } from './common';
import { EvidenceDrawer } from './EvidenceDrawer';

interface PresenterScreenProps {
  session: ReportSession;
  slides: SlideData[];
  setSession: Dispatch<SetStateAction<ReportSession>>;
  onFinish: () => void;
}

export function PresenterScreen({ session, slides, setSession, onFinish }: PresenterScreenProps) {
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const warnedRef = useRef(new Set<string>());
  const priorityGuideActiveRef = useRef(false);
  const toastTimerRef = useRef<number>();
  const channelRef = useRef<BroadcastChannel | null>(null);
  const snapshotRef = useRef<ProjectorSnapshot>({ currentSlide: session.currentSlide, slides, title: session.title, objective: session.objective });
  const slidesRef = useRef(slides);

  const elapsedSeconds = Math.max(0, Math.floor((now - (session.startedAt || now)) / 1000));
  const meetingEndTimestamp = session.meetingEndAt ? new Date(session.meetingEndAt).getTime() : Number.NaN;
  const configuredTimes = [
    session.timeLimitSeconds ? Math.max(0, session.timeLimitSeconds - elapsedSeconds) : undefined,
    Number.isFinite(meetingEndTimestamp) ? Math.max(0, Math.floor((meetingEndTimestamp - now) / 1000)) : undefined,
  ].filter((value): value is number => typeof value === 'number');
  const hasTimeGuide = configuredTimes.length > 0;
  const remainingSeconds = hasTimeGuide ? Math.min(...configuredTimes) : 0;
  const priorityGuide = hasTimeGuide && shouldPrioritize(remainingSeconds, session.decisionItems);
  const activeSlide = slides.find((slide) => slide.page === session.currentSlide) || slides[0];
  const remainingItems = session.decisionItems.filter((item) => !item.delivered);
  const remainingRequired = remainingItems.filter((item) => item.required).sort((a, b) => a.slide - b.slide);
  const requiredItems = session.decisionItems.filter((item) => item.required);
  const deliveredRequiredCount = requiredItems.filter((item) => item.delivered).length;
  const nextItem = getNextRequiredItem(session.decisionItems, session.currentSlide);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (priorityGuide && !priorityGuideActiveRef.current) {
      priorityGuideActiveRef.current = true;
      setSession((current) => ({ ...current, priorityGuideCount: current.priorityGuideCount + 1 }));
    } else if (!priorityGuide) {
      priorityGuideActiveRef.current = false;
    }
  }, [priorityGuide, setSession]);

  const announce = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 1800);
  }, []);

  const handleTranscript = useCallback((text: string) => {
    setSession((current) => {
      const matchedIds = new Set(findDeliveredItemIds(text, current.decisionItems));
      const nextItems = current.decisionItems.map((item) => matchedIds.has(item.id) ? { ...item, delivered: true, deliveredAt: Date.now(), manuallyOverridden: false } : item);
      return { ...current, transcript: `${current.transcript}${current.transcript ? '\n' : ''}${text}`, decisionItems: nextItems };
    });
  }, [setSession]);

  const speech = useSpeechRecognition(handleTranscript);

  const moveToSlide = useCallback((target: number) => {
    const safeTarget = Math.min(Math.max(1, target), slides.length || 1);
    if (safeTarget > session.currentSlide) {
      const missed = session.decisionItems.filter((item) => item.slide === session.currentSlide && item.required && !item.delivered && !warnedRef.current.has(item.id));
      if (missed.length) {
        warnedRef.current.add(missed[0].id);
        announce(`“${missed[0].title}” 항목이 아직 전달되지 않았습니다.`);
      }
    }
    setSession((current) => ({ ...current, currentSlide: safeTarget }));
  }, [announce, session.currentSlide, session.decisionItems, setSession, slides.length]);

  useEffect(() => {
    slidesRef.current = slides;
    snapshotRef.current = { currentSlide: session.currentSlide, slides, title: session.title, objective: session.objective };
    channelRef.current?.postMessage({ type: 'snapshot', payload: snapshotRef.current });
  }, [session.currentSlide, session.objective, session.title, slides]);

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return undefined;
    const channel = new BroadcastChannel('report-navi-presentation');
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === 'presentation-ready') channel.postMessage({ type: 'snapshot', payload: snapshotRef.current });
      if (event.data?.type === 'navigate') {
        const delta = Number(event.data.delta || 0);
        setSession((current) => ({ ...current, currentSlide: Math.min(Math.max(1, current.currentSlide + delta), slidesRef.current.length || 1) }));
      }
    };
    channel.postMessage({ type: 'snapshot', payload: snapshotRef.current });
    return () => { channel.close(); channelRef.current = null; };
  }, [setSession]);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  function toggleItem(id: string) {
    setSession((current) => ({
      ...current,
      manualOverrideCount: current.manualOverrideCount + 1,
      decisionItems: current.decisionItems.map((item) => item.id === id ? { ...item, delivered: !item.delivered, deliveredAt: !item.delivered ? Date.now() : undefined, manuallyOverridden: true } : item),
    }));
  }

  function submitManual(text = manualText) {
    if (!text.trim()) return;
    handleTranscript(text.trim());
    setManualText('');
  }

  function setDemoScenario() {
    setSession((current) => ({
      ...current,
      currentSlide: Math.min(5, slides.length),
      decisionItems: current.decisionItems.map((item) => ({
        ...item,
        delivered: item.required && !['demo-risk-cost', 'demo-request'].includes(item.id),
        deliveredAt: item.required && !['demo-risk-cost', 'demo-request'].includes(item.id) ? Date.now() : undefined,
      })),
    }));
    announce('시연 상태: 비용 리스크와 승인 요청만 남겼습니다.');
  }

  function setThirtySeconds() {
    setSession((current) => ({ ...current, timeLimitSeconds: 30, meetingEndAt: undefined, startedAt: Date.now() }));
    announce('선택 시간 안내를 30초로 설정했습니다.');
  }

  const readiness = requiredItems.length ? Math.round((deliveredRequiredCount / requiredItems.length) * 100) : 0;
  const timeTone = priorityGuide ? 'warning' : 'normal';
  const visibleItems = priorityGuide
    ? [...session.decisionItems].sort((left, right) => Number(right.required && !right.delivered) - Number(left.required && !left.delivered) || left.slide - right.slide)
    : session.decisionItems;

  return (
    <div className={`presenter-shell ${priorityGuide ? 'has-priority-guide' : ''}`}>
      <header className="presenter-header">
        <div className="brand-lockup brand-lockup--light"><div className="brand-mark"><span /></div><div><strong>REPORT NAVI</strong><small>LIVE GUIDANCE</small></div></div>
        <div className="live-destination"><span><Icon name="target" size={15}/> PURPOSE</span><strong>{session.objective}</strong></div>
        <div className="live-readiness"><span>의사결정 준비도</span><strong>{deliveredRequiredCount}<em>/ {requiredItems.length}</em></strong><small>{readiness}% · 필수 정보 기준</small></div>
        {hasTimeGuide && <div className={`live-timer timer--${timeTone}`}><span>선택 시간 안내</span><strong>{formatClock(remainingSeconds)}</strong><small>{priorityGuide ? `필수 핵심 ${remainingRequired.length}개 우선` : '핵심 추적에는 영향 없음'}</small></div>}
        <a className="presenter-header-button" href={`${window.location.origin}${window.location.pathname}?view=presentation`} target="_blank" rel="noopener noreferrer" onClick={() => window.setTimeout(() => channelRef.current?.postMessage({ type: 'snapshot', payload: snapshotRef.current }), 450)}><Icon name="monitor" size={17}/> 프로젝터 화면 열기 <Icon name="external" size={14}/></a>
        <button className="presenter-end-button" type="button" onClick={() => { speech.stop(); onFinish(); }}><Icon name="stop" size={14}/> 보고 종료</button>
      </header>

      {priorityGuide && <div className="priority-banner"><span><Icon name="route" size={17}/><strong>우선 확인할 핵심</strong></span><p>선택한 종료시간이 가까워 미전달 필수 항목을 위에 표시합니다.</p><Badge tone="amber">필수 {remainingRequired.length}개 남음</Badge></div>}
      {toast && <div className="live-toast"><Icon name="alert" size={17}/>{toast}</div>}

      <main className="presenter-workspace">
        <section className="live-slide-panel">
          <div className="live-panel-heading"><div><span>CURRENT MATERIAL</span><strong>Slide {session.currentSlide} / {slides.length}</strong></div><Badge tone="blue">발표 자료</Badge></div>
          <div className="live-slide-stage">{activeSlide ? <SlideCanvas slide={activeSlide}/> : <div className="missing-slide">표시할 자료가 없습니다.</div>}</div>
          <div className="slide-controls">
            <button type="button" onClick={() => moveToSlide(session.currentSlide - 1)} disabled={session.currentSlide <= 1}><Icon name="chevron-left"/> 이전</button>
            <div>{slides.map((slide) => <button aria-label={`Slide ${slide.page}`} className={slide.page === session.currentSlide ? 'active' : ''} key={slide.page} onClick={() => moveToSlide(slide.page)}><span>{slide.page}</span></button>)}</div>
            <button type="button" onClick={() => moveToSlide(session.currentSlide + 1)} disabled={session.currentSlide >= slides.length}>다음 <Icon name="chevron-right"/></button>
          </div>
        </section>

        <section className="guidance-panel">
          <div className="guidance-heading">
            <div><span>DECISION READINESS</span><h2>의사결정 준비도</h2><p>아직 남은 필수 핵심 {remainingRequired.length}개</p></div>
            <div className="completion-dial"><span style={{ '--progress': `${readiness * 3.6}deg` } as React.CSSProperties}><b>{readiness}%</b></span><small>필수 {deliveredRequiredCount}/{requiredItems.length}</small></div>
          </div>

          <div className="remaining-list">
            {visibleItems.map((item) => (
              <button type="button" className={`remaining-item ${item.delivered ? 'is-delivered' : ''} ${item.required ? 'is-required' : ''}`} key={item.id} onClick={() => toggleItem(item.id)}>
                <span className="check-box">{item.delivered && <Icon name="check" size={14}/>}</span>
                <div><span><Badge tone={item.required ? 'blue' : 'neutral'}>{item.required ? '필수' : '선택'}</Badge><em className={`type-text type-text--${item.type}`}>{DECISION_LABELS[item.type]}</em><small>SLIDE {item.slide}</small></span><strong>{item.title}</strong></div>
              </button>
            ))}
          </div>

          <div className="next-core-card">
            <div><span><Icon name="target" size={15}/> NEXT CORE</span><strong>{nextItem ? nextItem.title : '필수 정보 전달 완료'}</strong><p>{nextItem ? `관련 자료: Slide ${nextItem.slide}` : '의사결정에 필요한 필수 정보가 모두 전달되었습니다.'}</p></div>
            {nextItem && <button type="button" onClick={() => moveToSlide(nextItem.slide)}>다음 핵심 <Icon name="arrow-right" size={16}/></button>}
          </div>
        </section>
      </main>

      <footer className="speech-console">
        <div className={`speech-status ${speech.isListening ? 'is-listening' : ''}`}>
          <button type="button" aria-label={!speech.supported ? '음성 인식 미지원' : speech.isListening ? '음성 인식 중지' : '음성 인식 시작'} aria-pressed={speech.isListening} onClick={speech.isListening ? speech.stop : speech.start} disabled={!speech.supported}><Icon name="mic" size={18}/></button>
          <div><span>{speech.supported ? (speech.isListening ? '음성 인식 중 · ko-KR' : '음성 인식 대기') : '이 브라우저는 Web Speech API를 지원하지 않습니다'}</span><strong>{speech.interimTranscript || speech.error || '마이크를 시작하거나 텍스트 입력으로 전달 여부를 확인하세요.'}</strong></div>
        </div>
        <form className="manual-transcript" onSubmit={(event) => { event.preventDefault(); submitManual(); }}>
          <input aria-label="발화 내용 직접 입력" value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder="음성 권한이 없으면 발화 내용을 입력하세요"/>
          <button type="submit">전달 확인</button>
        </form>
        <button className="console-action" type="button" onClick={() => setEvidenceOpen(true)}><Icon name="search" size={17}/> Evidence Navi</button>
        <button className="console-action" type="button" onClick={() => setDebugOpen((value) => !value)}><Icon name="menu" size={17}/> Transcript</button>
      </footer>

      {debugOpen && <div className="transcript-debug"><div><span>LIVE TRANSCRIPT</span><button onClick={() => setDebugOpen(false)}><Icon name="x" size={16}/></button></div><pre>{session.transcript || '아직 확정된 발화가 없습니다.'}{speech.interimTranscript && `\n[interim] ${speech.interimTranscript}`}</pre></div>}
      {evidenceOpen && <><div className="drawer-scrim" onClick={() => setEvidenceOpen(false)}/><EvidenceDrawer slides={slides} onClose={() => setEvidenceOpen(false)} onSearch={() => setSession((current) => ({ ...current, evidenceSearchCount: current.evidenceSearchCount + 1 }))} onMove={(slide) => { moveToSlide(slide); setEvidenceOpen(false); }}/></>}

      {session.demoMode && <div className="demo-controls"><span><Icon name="spark" size={14}/> DEMO CONTROL</span><small>공사비 증가를 말하지 않고 Slide 5를 넘겨 보세요.</small><button onClick={() => submitManual('최대 냉각부하는 106.2킬로와트입니다')}>106.2kW 발화</button><button onClick={setDemoScenario}>리스크·요청만 남기기</button><button onClick={setThirtySeconds}>선택 시간 30초</button></div>}
    </div>
  );
}
