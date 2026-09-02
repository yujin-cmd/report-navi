import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { findDeliveredItemIds, formatClock, getNextRequiredItem, getRemainingRequiredSeconds, shouldReroute } from '../lib/report';
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
  const [showOptionalInReroute, setShowOptionalInReroute] = useState(false);
  const warnedRef = useRef(new Set<string>());
  const rerouteActiveRef = useRef(false);
  const toastTimerRef = useRef<number>();
  const channelRef = useRef<BroadcastChannel | null>(null);
  const snapshotRef = useRef<ProjectorSnapshot>({ currentSlide: session.currentSlide, slides, title: session.title, objective: session.objective });
  const slidesRef = useRef(slides);

  const elapsedSeconds = Math.max(0, Math.floor((now - (session.startedAt || now)) / 1000));
  const remainingSeconds = Math.max(0, session.timeLimitSeconds - elapsedSeconds);
  const remainingRequiredSeconds = getRemainingRequiredSeconds(session.decisionItems);
  const reroute = shouldReroute(remainingSeconds, session.decisionItems);
  const activeSlide = slides.find((slide) => slide.page === session.currentSlide) || slides[0];
  const remainingItems = session.decisionItems.filter((item) => !item.delivered);
  const remainingRequired = remainingItems.filter((item) => item.required).sort((a, b) => a.slide - b.slide);
  const deliveredCount = session.decisionItems.filter((item) => item.delivered).length;
  const nextItem = getNextRequiredItem(session.decisionItems, session.currentSlide);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (reroute && !rerouteActiveRef.current) {
      rerouteActiveRef.current = true;
      setSession((current) => ({ ...current, rerouteCount: current.rerouteCount + 1 }));
    } else if (!reroute) {
      rerouteActiveRef.current = false;
    }
  }, [reroute, setSession]);

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
    setSession((current) => {
      const elapsedForThirtySeconds = Math.max(0, current.timeLimitSeconds - 30);
      return { ...current, startedAt: Date.now() - elapsedForThirtySeconds * 1000 };
    });
    announce('남은 시간을 30초로 조정했습니다.');
  }

  const progress = session.decisionItems.length ? Math.round((deliveredCount / session.decisionItems.length) * 100) : 0;
  const timeTone = reroute ? 'danger' : remainingSeconds < 60 ? 'warning' : 'normal';
  const visibleRerouteItems = useMemo(() => showOptionalInReroute ? remainingItems : remainingRequired, [remainingItems, remainingRequired, showOptionalInReroute]);

  return (
    <div className={`presenter-shell ${reroute ? 'is-rerouting' : ''}`}>
      <header className="presenter-header">
        <div className="brand-lockup brand-lockup--light"><div className="brand-mark"><span /></div><div><strong>REPORT NAVI</strong><small>LIVE GUIDANCE</small></div></div>
        <div className="live-destination"><span><Icon name="target" size={15}/> PURPOSE</span><strong>{session.objective}</strong></div>
        <div className={`live-timer timer--${timeTone}`}><span>남은 시간</span><strong>{formatClock(remainingSeconds)}</strong><small>{reroute ? `필수 전달 예상 ${formatClock(remainingRequiredSeconds)}` : `목표 ${formatClock(session.timeLimitSeconds)}`}</small></div>
        <a className="presenter-header-button" href={`${window.location.origin}${window.location.pathname}?view=presentation`} target="_blank" rel="noopener noreferrer" onClick={() => window.setTimeout(() => channelRef.current?.postMessage({ type: 'snapshot', payload: snapshotRef.current }), 450)}><Icon name="monitor" size={17}/> 프로젝터 화면 열기 <Icon name="external" size={14}/></a>
        <button className="presenter-end-button" type="button" onClick={() => { speech.stop(); onFinish(); }}><Icon name="stop" size={14}/> 보고 종료</button>
      </header>

      {reroute && <div className="reroute-banner"><span><Icon name="route" size={17}/><strong>경로 재탐색</strong></span><p>남은 시간에는 필수 정보만 전달해야 목적지에 도착할 수 있습니다.</p><Badge tone="red">필수 {remainingRequired.length}개 남음</Badge></div>}
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
            <div><span>{reroute ? 'REROUTED PATH' : 'REMAINING CORE'}</span><h2>{reroute ? '지금부터 이것만 전달하세요' : '아직 남은 핵심'}</h2></div>
            <div className="completion-dial"><span style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}><b>{progress}%</b></span><small>{deliveredCount}/{session.decisionItems.length}</small></div>
          </div>

          {reroute ? (
            <div className="reroute-content">
              <div className="reroute-lead"><Icon name="route" size={24}/><div><strong>{formatClock(remainingSeconds)} 남음</strong><p>선택 항목을 접고 미전달 필수 항목을 가까운 슬라이드 순으로 재배치했습니다.</p></div></div>
              <div className="reroute-list">
                {visibleRerouteItems.map((item, index) => (
                  <button type="button" className="reroute-item" key={item.id} onClick={() => moveToSlide(item.slide)}>
                    <span>{index + 1}</span><div><small>{DECISION_LABELS[item.type]} · SLIDE {item.slide}</small><strong>{item.title}</strong><p>{item.detail}</p></div><Icon name="arrow-right" size={17}/>
                  </button>
                ))}
                {!visibleRerouteItems.length && <div className="all-complete"><Icon name="check" size={22}/><strong>필수 정보 전달을 완료했습니다</strong></div>}
              </div>
              {remainingItems.some((item) => !item.required) && <button className="optional-toggle" onClick={() => setShowOptionalInReroute((value) => !value)}>{showOptionalInReroute ? '선택 항목 다시 숨기기' : `생략 가능 ${remainingItems.filter((item) => !item.required).length}개 보기`} <Icon name="chevron-right" size={15}/></button>}
            </div>
          ) : (
            <div className="remaining-list">
              {session.decisionItems.map((item) => (
                <button type="button" className={`remaining-item ${item.delivered ? 'is-delivered' : ''} ${item.required ? 'is-required' : ''}`} key={item.id} onClick={() => toggleItem(item.id)}>
                  <span className="check-box">{item.delivered && <Icon name="check" size={14}/>}</span>
                  <div><span><Badge tone={item.required ? 'blue' : 'neutral'}>{item.required ? '필수' : '선택'}</Badge><em className={`type-text type-text--${item.type}`}>{DECISION_LABELS[item.type]}</em><small>SLIDE {item.slide}</small></span><strong>{item.title}</strong></div>
                </button>
              ))}
            </div>
          )}

          <div className="next-core-card">
            <div><span><Icon name="target" size={15}/> NEXT CORE</span><strong>{nextItem ? nextItem.title : '필수 정보 전달 완료'}</strong><p>{nextItem ? `이 내용을 설명하세요. 관련 자료: Slide ${nextItem.slide}` : '이제 최종 요청과 보고 목적지를 확인하세요.'}</p></div>
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

      {session.demoMode && <div className="demo-controls"><span><Icon name="spark" size={14}/> DEMO CONTROL</span><button onClick={() => submitManual('최대 냉각부하는 106.2킬로와트입니다')}>106.2kW 발화</button><button onClick={setDemoScenario}>리스크·요청만 남기기</button><button onClick={setThirtySeconds}>남은 시간 30초</button></div>}
    </div>
  );
}
