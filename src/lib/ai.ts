import type { DecisionItem, ReportSession, SlideData } from '../types';
import { generateFallbackDecisionSet, validateDecisionItems } from './report';

export interface AnalysisOutcome {
  items: DecisionItem[];
  /** 'ai' = 서버 함수를 통한 실제 모델 분석, 'local' = 오프라인 규칙 분석 */
  source: 'ai' | 'local';
  notice?: string;
}

const TIMEOUT_MS = 45000;

/**
 * Decision Set을 생성한다.
 * 1순위: /api/analyze (Netlify Function → Anthropic API)
 * 2순위: 실패 시 로컬 규칙 분석으로 자동 대체하여 시연이 중단되지 않게 한다.
 */
export async function requestDecisionSet(
  session: ReportSession,
  slides: SlideData[],
): Promise<AnalysisOutcome> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        objective: session.objective,
        objectiveType: session.objectiveType,
        // 렌더 이미지(imageDataUrl)는 용량이 매우 크므로 반드시 제외하고 텍스트만 보낸다.
        slides: slides.map((slide) => ({
          page: slide.page,
          title: slide.title,
          sourceText: slide.sourceText,
        })),
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.items) {
      const reason = payload?.error || `서버 응답 오류 (${response.status})`;
      return {
        items: generateFallbackDecisionSet(slides, session.objective),
        source: 'local',
        notice: `${reason} 로컬 분석 결과로 대체했습니다.`,
      };
    }

    if (!validateDecisionItems(payload.items)) {
      return {
        items: generateFallbackDecisionSet(slides, session.objective),
        source: 'local',
        notice: 'AI 응답 형식이 올바르지 않아 로컬 분석 결과로 대체했습니다.',
      };
    }

    return { items: payload.items, source: 'ai' };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      items: generateFallbackDecisionSet(slides, session.objective),
      source: 'local',
      notice: aborted
        ? '분석 시간이 초과되어 로컬 분석 결과로 대체했습니다.'
        : '네트워크 오류로 로컬 분석 결과로 대체했습니다.',
    };
  } finally {
    window.clearTimeout(timer);
  }
}
