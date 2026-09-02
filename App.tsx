import { useEffect, useState } from 'react';
import { createDefaultSession, DEMO_SLIDES } from './data/demo';
import type { AppStep, DecisionItem, ReportSession, SlideData } from './types';
import { ProjectorScreen } from './components/ProjectorScreen';
import { ReportScreen } from './components/ReportScreen';
import { PresenterScreen } from './components/PresenterScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { SetupScreen } from './components/SetupScreen';
import { UploadScreen } from './components/UploadScreen';

function loadDraft(): ReportSession {
  try {
    const stored = localStorage.getItem('report-navi:draft');
    if (stored) {
      const parsed = JSON.parse(stored) as ReportSession;
      if (parsed?.id && Array.isArray(parsed.decisionItems)) return parsed;
    }
  } catch {
    // Storage is optional; a fresh session is the safe fallback.
  }
  return createDefaultSession();
}

function initialStep(session: ReportSession): AppStep {
  if (session.endedAt) return 'report';
  if (session.decisionItems.length) return session.demoMode && session.startedAt ? 'presenter' : 'review';
  return 'setup';
}

export default function App() {
  const [session, setSession] = useState<ReportSession>(() => loadDraft());
  const [step, setStep] = useState<AppStep>(() => initialStep(loadDraft()));
  const [slides, setSlides] = useState<SlideData[]>(() => loadDraft().demoMode ? DEMO_SLIDES.map((slide) => ({ ...slide })) : []);
  const projectorMode = new URLSearchParams(window.location.search).get('view') === 'presentation';

  useEffect(() => {
    if (projectorMode) return;
    try {
      localStorage.setItem('report-navi:draft', JSON.stringify(session));
    } catch {
      // Continue without persistence if browser storage is blocked.
    }
  }, [projectorMode, session]);

  useEffect(() => {
    if (!projectorMode) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [projectorMode, step]);

  if (projectorMode) return <ProjectorScreen />;

  function continueSetup(next: ReportSession) {
    setSession(next);
    setStep('upload');
  }

  function updateSlides(nextSlides: SlideData[], demoMode: boolean) {
    setSlides(nextSlides);
    setSession((current) => ({ ...current, demoMode }));
  }

  function readyDecisionSet(items: DecisionItem[]) {
    setSession((current) => ({ ...current, decisionItems: items, currentSlide: 1, transcript: '' }));
    setStep('review');
  }

  function startReport(items: DecisionItem[]) {
    setSession((current) => ({
      ...current,
      decisionItems: items.map((item) => ({ ...item, delivered: false, deliveredAt: undefined, manuallyOverridden: false })),
      currentSlide: 1,
      startedAt: Date.now(),
      endedAt: undefined,
      transcript: '',
      rerouteCount: 0,
      evidenceSearchCount: 0,
      manualOverrideCount: 0,
    }));
    setStep('presenter');
  }

  function finishReport() {
    setSession((current) => ({ ...current, endedAt: Date.now() }));
    setStep('report');
  }

  function restart() {
    const fresh = createDefaultSession();
    setSession(fresh);
    setSlides([]);
    setStep('setup');
    try {
      localStorage.removeItem('report-navi:draft');
    } catch {
      // Nothing else is required for a fresh in-memory session.
    }
  }

  function returnToPriorStep(target: AppStep) {
    const steps: AppStep[] = ['setup', 'upload', 'review', 'presenter', 'report'];
    const targetIndex = steps.indexOf(target);
    const currentIndex = steps.indexOf(step);
    const canReturn = targetIndex >= 0 && targetIndex < currentIndex && currentIndex < steps.indexOf('presenter');
    if (canReturn) setStep(target);
  }

  if (step === 'setup') return <SetupScreen session={session} onContinue={continueSetup} onStepBack={returnToPriorStep} />;
  if (step === 'upload') return <UploadScreen session={session} slides={slides} onSlidesChange={updateSlides} onReady={readyDecisionSet} onStepBack={returnToPriorStep} />;
  if (step === 'review') return <ReviewScreen session={session} onStart={startReport} onStepBack={returnToPriorStep} />;
  if (step === 'presenter') return <PresenterScreen session={session} slides={slides.length ? slides : DEMO_SLIDES} setSession={setSession} onFinish={finishReport} />;
  return <ReportScreen session={session} onRestart={restart} onReview={() => setStep('review')} onStepBack={returnToPriorStep} />;
}
