import { useEffect, useState } from 'react';
import { cloneDemoItems, createDefaultSession, DEMO_SLIDES } from './data/demo';
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
      const parsed = JSON.parse(stored) as ReportSession & { rerouteCount?: number };
      if (parsed?.id && Array.isArray(parsed.decisionItems)) {
        const { rerouteCount, ...current } = parsed;
        return { ...createDefaultSession(), ...current, priorityGuideCount: parsed.priorityGuideCount ?? rerouteCount ?? 0 };
      }
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

const STEP_ORDER: AppStep[] = ['setup', 'upload', 'review', 'presenter', 'report'];

export default function App() {
  const [session, setSession] = useState<ReportSession>(() => loadDraft());
  const [step, setStep] = useState<AppStep>(() => initialStep(loadDraft()));
  const [furthestStep, setFurthestStep] = useState<AppStep>(() => initialStep(loadDraft()));
  const [slides, setSlides] = useState<SlideData[]>(() => loadDraft().demoMode ? DEMO_SLIDES.map((slide) => ({ ...slide })) : []);
  const projectorMode = new URLSearchParams(window.location.search).get('view') === 'presentation';

  useEffect(() => {
    if (projectorMode) return;
    try {
      const safeDraft = {
        ...session,
        transcript: '',
        decisionItems: session.decisionItems.map(({ sourceText: _sourceText, ...item }) => item),
      };
      localStorage.setItem('report-navi:draft', JSON.stringify(safeDraft));
    } catch {
      // Continue without persistence if browser storage is blocked.
    }
  }, [projectorMode, session]);

  useEffect(() => {
    if (!projectorMode) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [projectorMode, step]);

  if (projectorMode) return <ProjectorScreen />;

  function continueSetup(next: ReportSession) {
    const destinationChanged = next.title !== session.title
      || next.objectiveType !== session.objectiveType
      || next.objective !== session.objective
      || next.timeLimitSeconds !== session.timeLimitSeconds
      || next.meetingEndAt !== session.meetingEndAt;
    setSession(destinationChanged ? { ...next, decisionItems: [] } : next);
    setFurthestStep((current) => destinationChanged || STEP_ORDER.indexOf(current) < 1 ? 'upload' : current);
    setStep('upload');
  }

  function updateSlides(nextSlides: SlideData[], demoMode: boolean) {
    setSlides(nextSlides);
    setSession((current) => ({ ...current, demoMode, decisionItems: [] }));
    setFurthestStep('upload');
  }

  function readyDecisionSet(items: DecisionItem[]) {
    setSession((current) => ({ ...current, decisionItems: items, currentSlide: 1, transcript: '' }));
    setFurthestStep('review');
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
      priorityGuideCount: 0,
      evidenceSearchCount: 0,
      manualOverrideCount: 0,
    }));
    setFurthestStep((current) => STEP_ORDER.indexOf(current) < STEP_ORDER.indexOf('presenter') ? 'presenter' : current);
    setStep('presenter');
  }

  function startSampleReport() {
    const sample = {
      ...createDefaultSession(),
      demoMode: true,
      decisionItems: cloneDemoItems(),
    };
    setSession(sample);
    setSlides(DEMO_SLIDES.map((slide) => ({ ...slide })));
    setFurthestStep('review');
    setStep('review');
  }

  function finishReport() {
    setSession((current) => ({ ...current, endedAt: Date.now() }));
    setFurthestStep('report');
    setStep('report');
  }

  function restart() {
    const fresh = createDefaultSession();
    setSession(fresh);
    setSlides([]);
    setFurthestStep('setup');
    setStep('setup');
    try {
      localStorage.removeItem('report-navi:draft');
    } catch {
      // Nothing else is required for a fresh in-memory session.
    }
  }

  function navigateToReachedStep(target: AppStep) {
    const targetIndex = STEP_ORDER.indexOf(target);
    const furthestIndex = STEP_ORDER.indexOf(furthestStep);
    const currentIndex = STEP_ORDER.indexOf(step);
    const canNavigate = currentIndex >= 0 && targetIndex >= 0 && targetIndex <= furthestIndex && target !== step;
    if (canNavigate) setStep(target);
  }

  if (step === 'setup') return <SetupScreen session={session} onContinue={continueSetup} onSampleStart={startSampleReport} onStepNavigate={navigateToReachedStep} furthestStep={furthestStep} />;
  if (step === 'upload') return <UploadScreen session={session} slides={slides} onSlidesChange={updateSlides} onReady={readyDecisionSet} onStepNavigate={navigateToReachedStep} furthestStep={furthestStep} />;
  if (step === 'review') return <ReviewScreen session={session} onStart={startReport} onStepNavigate={navigateToReachedStep} furthestStep={furthestStep} />;
  if (step === 'presenter') return <PresenterScreen session={session} slides={slides.length ? slides : DEMO_SLIDES} setSession={setSession} onFinish={finishReport} />;
  return <ReportScreen session={session} onRestart={restart} onReview={() => setStep('review')} onStepNavigate={navigateToReachedStep} furthestStep={furthestStep} />;
}
