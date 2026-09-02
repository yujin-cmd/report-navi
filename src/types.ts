export type AppStep = 'setup' | 'upload' | 'review' | 'presenter' | 'report';

export type DecisionType = 'conclusion' | 'evidence' | 'assumption' | 'risk' | 'request';

export interface DecisionItem {
  id: string;
  type: DecisionType;
  title: string;
  detail: string;
  slide: number;
  required: boolean;
  estimatedSeconds: number;
  variants: string[];
  sourceText?: string;
  delivered: boolean;
  deliveredAt?: number;
  manuallyOverridden?: boolean;
}

export interface SlideData {
  page: number;
  title: string;
  kicker?: string;
  body?: string;
  bullets?: string[];
  metrics?: Array<{ label: string; value: string; note?: string }>;
  footer?: string;
  imageDataUrl?: string;
  sourceText: string;
  tone?: 'default' | 'compare' | 'result' | 'risk' | 'final';
}

export interface ReportSession {
  id: string;
  title: string;
  objectiveType: string;
  objective: string;
  timeLimitSeconds: number;
  startedAt?: number;
  endedAt?: number;
  currentSlide: number;
  decisionItems: DecisionItem[];
  transcript: string;
  rerouteCount: number;
  evidenceSearchCount: number;
  manualOverrideCount: number;
  demoMode: boolean;
}

export interface EvidenceResult {
  slide: number;
  title: string;
  excerpt: string;
  score: number;
}

export interface ProjectorSnapshot {
  currentSlide: number;
  slides: SlideData[];
  title: string;
  objective: string;
}

export const DECISION_LABELS: Record<DecisionType, string> = {
  conclusion: '결론',
  evidence: '근거',
  assumption: '전제',
  risk: '리스크',
  request: '요청',
};

export const OBJECTIVE_TYPES = [
  '현황 공유',
  '설계안 검토',
  '대안 선택',
  '예산 승인',
  '발주처 승인',
  '문제 대응방안 결정',
  '직접 입력',
] as const;
