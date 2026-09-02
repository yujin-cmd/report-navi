import { DECISION_LABELS, type DecisionItem, type DecisionType, type EvidenceResult, type SlideData } from '../types';

const STOP_WORDS = new Set([
  '그리고', '하지만', '대한', '관련', '이번', '해당', '현재', '저희', '것입니다', '합니다',
  '됩니다', '있습니다', '입니다', '으로', '에서', '에게', '까지', '보다', '정도', '약', '안은',
]);

const NUMBER_WORDS: Array<[RegExp, string]> = [
  [/퍼센트|프로|%/gi, ' percent '],
  [/킬로와트|k\s*w/gi, ' kw '],
  [/메가와트|m\s*w/gi, ' mw '],
];

export function normalizeText(input: string): string {
  let text = input.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1');
  for (const [pattern, replacement] of NUMBER_WORDS) text = text.replace(pattern, replacement);
  return text
    .replace(/([0-9]+(?:\.[0-9]+)?)(percent|kw|mw)/g, '$1 $2')
    .replace(/[^0-9a-z가-힣.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(' ')
    .filter((token) => token.length > 1 || /^\d/.test(token))
    .filter((token) => !STOP_WORDS.has(token));
}

function bigrams(value: string): Set<string> {
  const compact = value.replace(/\s/g, '');
  const result = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) result.add(compact.slice(index, index + 2));
  return result;
}

function diceSimilarity(left: string, right: string): number {
  const leftSet = bigrams(left);
  const rightSet = bigrams(right);
  if (!leftSet.size || !rightSet.size) return 0;
  let overlap = 0;
  leftSet.forEach((value) => {
    if (rightSet.has(value)) overlap += 1;
  });
  return (2 * overlap) / (leftSet.size + rightSet.size);
}

export function phraseMatchScore(transcript: string, phrase: string): number {
  const normalizedTranscript = normalizeText(transcript);
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase || !normalizedTranscript) return 0;
  if (normalizedTranscript.includes(normalizedPhrase)) return 1;

  const phraseTokens = tokenize(normalizedPhrase);
  const transcriptTokens = new Set(tokenize(normalizedTranscript));
  if (!phraseTokens.length) return 0;

  const numericTokens = phraseTokens.filter((token) => /^\d/.test(token));
  if (numericTokens.some((token) => !transcriptTokens.has(token))) return 0;

  const matched = phraseTokens.filter((token) => {
    if (transcriptTokens.has(token)) return true;
    return [...transcriptTokens].some((spoken) => token.length >= 3 && spoken.length >= 3 && diceSimilarity(spoken, token) >= 0.76);
  }).length;
  const coverage = matched / phraseTokens.length;
  const shape = diceSimilarity(normalizedTranscript, normalizedPhrase);
  return coverage * 0.78 + shape * 0.22;
}

export function decisionMatchScore(transcript: string, item: DecisionItem): number {
  const phrases = [item.title, `${item.title} ${item.detail}`, ...item.variants];
  return Math.max(...phrases.map((phrase) => phraseMatchScore(transcript, phrase)));
}

export function findDeliveredItemIds(transcript: string, items: DecisionItem[], threshold = 0.58): string[] {
  return items
    .filter((item) => !item.delivered && decisionMatchScore(transcript, item) >= threshold)
    .map((item) => item.id);
}

export function getRemainingRequiredSeconds(items: DecisionItem[]): number {
  return items
    .filter((item) => item.required && !item.delivered)
    .reduce((total, item) => total + item.estimatedSeconds, 0);
}

export function shouldReroute(remainingSeconds: number, items: DecisionItem[], safetyBuffer = 12): boolean {
  const requiredSeconds = getRemainingRequiredSeconds(items);
  return requiredSeconds > 0 && remainingSeconds < requiredSeconds + safetyBuffer;
}

export function getNextRequiredItem(items: DecisionItem[], currentSlide: number): DecisionItem | undefined {
  return [...items]
    .filter((item) => item.required && !item.delivered)
    .sort((left, right) => {
      const leftDistance = left.slide >= currentSlide ? left.slide - currentSlide : left.slide + 100;
      const rightDistance = right.slide >= currentSlide ? right.slide - currentSlide : right.slide + 100;
      return leftDistance - rightDistance || left.slide - right.slide;
    })[0];
}

export function searchEvidence(query: string, slides: SlideData[], limit = 3): EvidenceResult[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  return slides
    .map((slide) => {
      const source = `${slide.title} ${slide.sourceText}`;
      const sourceTokens = tokenize(source);
      const sourceSet = new Set(sourceTokens);
      const tokenMatches = (token: string) => {
        if (sourceSet.has(token)) return true;
        if (/^\d/.test(token)) {
          return sourceTokens.some((candidate) => /^\d/.test(candidate) && (candidate.startsWith(`${token}.`) || token.startsWith(`${candidate}.`)));
        }
        return sourceTokens.some((candidate) => token.length >= 3 && diceSimilarity(token, candidate) >= 0.72);
      };
      const matched = queryTokens.filter(tokenMatches).length;
      const numberBonus = queryTokens.some((token) => /^\d/.test(token) && tokenMatches(token)) ? 0.35 : 0;
      return {
        slide: slide.page,
        title: slide.title.replace(/\n/g, ' '),
        excerpt: slide.sourceText.length > 128 ? `${slide.sourceText.slice(0, 128)}…` : slide.sourceText,
        score: matched / queryTokens.length + numberBonus,
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

const TYPE_KEYWORDS: Record<DecisionType, string[]> = {
  conclusion: ['제안', '결론', '권고', '선정', '적용'],
  evidence: ['결과', '산정', '계산', '비교', '절감', '부하', '효율'],
  assumption: ['가정', '전제', '조건', '기준', '예상'],
  risk: ['리스크', '위험', '증가', '지연', '영향', '제약'],
  request: ['요청', '승인', '결정', '확정', '협의'],
};

const FALLBACK_TITLES: Record<DecisionType, string> = {
  conclusion: '보고의 최종 제안 확인',
  evidence: '핵심 수치와 비교 근거 확인',
  assumption: '판단에 적용된 전제조건 확인',
  risk: '선택에 따른 영향과 리스크 확인',
  request: '상대방에게 필요한 결정사항 확인',
};

export function generateFallbackDecisionSet(slides: SlideData[], objective: string): DecisionItem[] {
  const used = new Set<number>();
  const types = Object.keys(TYPE_KEYWORDS) as DecisionType[];

  return types.map((type, typeIndex) => {
    const candidates = slides.map((slide) => {
      const normalized = normalizeText(slide.sourceText);
      const score = TYPE_KEYWORDS[type].reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0);
      return { slide, score };
    });
    const best = candidates.sort((left, right) => right.score - left.score || Number(used.has(left.slide.page)) - Number(used.has(right.slide.page)))[0];
    used.add(best.slide.page);
    const source = best.slide.sourceText.trim();
    const shortSource = source.length > 80 ? `${source.slice(0, 80)}…` : source;
    const slideTitle = best.slide.title.replace(/\n/g, ' ').slice(0, 42);
    const title = best.score > 0 ? `${FALLBACK_TITLES[type]} · ${slideTitle}` : FALLBACK_TITLES[type];
    const detail = best.score > 0 ? shortSource : `보고 목적 “${objective}” 달성에 필요한 ${FALLBACK_TITLES[type]} 항목입니다.`;
    return {
      id: `fallback-${type}-${Date.now()}-${typeIndex}`,
      type,
      title,
      detail,
      slide: best.slide.page,
      required: true,
      estimatedSeconds: type === 'risk' ? 18 : 14,
      variants: [title, detail],
      sourceText: source,
      delivered: false,
    };
  });
}

const QUESTION_TYPE_ORDER: DecisionType[] = ['evidence', 'assumption', 'risk', 'request', 'conclusion'];

function questionSubject(item: DecisionItem): string {
  const parts = item.title.split('·');
  const subject = (parts.length > 1 ? parts.slice(1).join('·') : item.title).trim();
  return subject || item.detail.trim() || DECISION_LABELS[item.type];
}

export function generateExpectedQuestions(items: DecisionItem[], objective: string, limit = 3): string[] {
  const ordered = [...items].sort((left, right) => {
    const requiredOrder = Number(right.required) - Number(left.required);
    if (requiredOrder) return requiredOrder;
    return QUESTION_TYPE_ORDER.indexOf(left.type) - QUESTION_TYPE_ORDER.indexOf(right.type);
  });
  const usedTypes = new Set<DecisionType>();
  const questions: string[] = [];

  for (const item of ordered) {
    if (questions.length >= limit || usedTypes.has(item.type)) continue;
    const subject = questionSubject(item);
    const question = item.type === 'evidence'
      ? `“${subject}”의 산정 기준과 원본 근거는 무엇입니까?`
      : item.type === 'assumption'
        ? `“${subject}” 전제가 달라지면 결론에 어떤 영향이 있습니까?`
        : item.type === 'risk'
          ? `“${subject}” 리스크가 현실화될 경우 대응 방안은 무엇입니까?`
          : item.type === 'request'
            ? `“${subject}” 결정이 지연되면 일정이나 비용에 어떤 영향이 있습니까?`
            : `“${subject}”을 다른 대안보다 우선해야 하는 이유는 무엇입니까?`;
    questions.push(question);
    usedTypes.add(item.type);
  }

  if (!questions.length) {
    questions.push(`보고 목적 “${objective}”을 달성하기 위해 반드시 확인해야 할 근거는 무엇입니까?`);
  }
  return questions.slice(0, Math.max(1, limit));
}

export function validateDecisionItems(value: unknown): value is DecisionItem[] {
  if (!Array.isArray(value)) return false;
  const allowed = new Set<DecisionType>(['conclusion', 'evidence', 'assumption', 'risk', 'request']);
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return typeof record.id === 'string'
      && allowed.has(record.type as DecisionType)
      && typeof record.title === 'string'
      && typeof record.detail === 'string'
      && typeof record.slide === 'number'
      && typeof record.required === 'boolean'
      && typeof record.estimatedSeconds === 'number'
      && Array.isArray(record.variants);
  });
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
