import { DECISION_LABELS, type DecisionItem, type DecisionType, type EvidenceResult, type ReportSession, type SlideData } from '../types';

const STOP_WORDS = new Set([
  '그리고', '하지만', '대한', '관련', '이번', '해당', '현재', '저희', '것입니다', '합니다',
  '됩니다', '있습니다', '입니다', '으로', '에서', '에게', '까지', '보다', '정도', '약', '안은',
]);

const NUMBER_WORDS: Array<[RegExp, string]> = [
  [/퍼센트|프로|%/gi, ' percent '],
  [/킬로와트|k\s*w/gi, ' kw '],
  [/메가와트|m\s*w/gi, ' mw '],
  [/제곱미터|㎡|m2/gi, ' sqm '],
  [/섭씨|℃|°\s*c/gi, ' celsius '],
  [/억\s*원/gi, ' eokwon '],
  [/만\s*원/gi, ' manwon '],
];

export function normalizeText(input: string): string {
  let text = input.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1');
  for (const [pattern, replacement] of NUMBER_WORDS) text = text.replace(pattern, replacement);
  return text
    .replace(/([0-9]+(?:\.[0-9]+)?)(percent|kw|mw|sqm|celsius|eokwon|manwon)/g, '$1 $2')
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

/** 항목을 정의하는 수치 토큰. 이 수치가 있으면 해당 수치를 말해야만 전달로 인정한다. */
export function numericAnchors(item: Pick<DecisionItem, 'title' | 'detail'>): string[] {
  const tokens = tokenize(`${item.title} ${item.detail}`).filter((token) => /^\d/.test(token));
  return [...new Set(tokens)];
}

export function decisionMatchScore(transcript: string, item: DecisionItem): number {
  const anchors = numericAnchors(item);
  if (anchors.length) {
    const spoken = new Set(tokenize(transcript));
    if (!anchors.some((anchor) => spoken.has(anchor))) return 0;
  }
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

export function shouldPrioritize(remainingSeconds: number, items: DecisionItem[], safetyBuffer = 12): boolean {
  const requiredSeconds = getRemainingRequiredSeconds(items);
  return requiredSeconds > 0 && remainingSeconds < requiredSeconds + safetyBuffer;
}

export function getTimeGuideState(
  session: Pick<ReportSession, 'timerMode' | 'timeLimitSeconds' | 'meetingEndAt' | 'startedAt'>,
  now = Date.now(),
): { enabled: boolean; remainingSeconds: number } {
  if (session.timerMode === 'duration' && session.timeLimitSeconds && session.timeLimitSeconds > 0) {
    const elapsedSeconds = Math.max(0, Math.floor((now - (session.startedAt || now)) / 1000));
    return { enabled: true, remainingSeconds: Math.max(0, session.timeLimitSeconds - elapsedSeconds) };
  }
  if (session.timerMode === 'deadline' && session.meetingEndAt) {
    const deadline = new Date(session.meetingEndAt).getTime();
    if (Number.isFinite(deadline)) return { enabled: true, remainingSeconds: Math.max(0, Math.floor((deadline - now) / 1000)) };
  }
  return { enabled: false, remainingSeconds: 0 };
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

const REQUEST_HINT = /요청|승인|결정|확정|협의|바랍니다|검토해\s?주|부탁/;
const NUMERIC_WITH_UNIT = /(\d[\d,]*(?:\.\d+)?)\s*(%|퍼센트|프로|k\s?w|킬로와트|m\s?w|메가와트|㎡|제곱미터|℃|억\s?원|만\s?원|원|명|개소|개월|개|건|일|년|시간|분|배|kg|mm|cm|m)?/gi;

const KOREAN_UNIT_READING: Array<[RegExp, string]> = [
  [/^kw$/i, '킬로와트'],
  [/^mw$/i, '메가와트'],
  [/^%$/, '퍼센트'],
  [/^㎡$/, '제곱미터'],
  [/^℃$/, '도'],
];

/** 슬라이드 원문을 문장/항목 단위로 나눈다. */
export function extractSentences(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/([.!?。])\s+/g, '$1\n')
    .split(/[\n\r]+|[•▪■◦※]\s*/)
    .map((line) => line.replace(/^[\s\-–—·*∙>]+/, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 6)
    .map((line) => (line.length > 160 ? `${line.slice(0, 160)}…` : line));
}

/** 문장에서 "숫자+단위" 표현을 뽑는다. 예: 106.2kW, 8% */
export function extractNumerics(sentence: string, limit = 2): string[] {
  const found: string[] = [];
  for (const match of sentence.matchAll(NUMERIC_WITH_UNIT)) {
    const value = match[1].replace(/,/g, '');
    const unit = (match[2] || '').replace(/\s+/g, '');
    if (!unit && !/\./.test(value) && value.length < 2) continue;
    const phrase = `${value}${unit}`;
    if (!found.includes(phrase)) found.push(phrase);
    if (found.length >= limit) break;
  }
  return found;
}

function koreanReading(phrase: string): string | null {
  const match = phrase.match(/^([\d.]+)(.*)$/);
  if (!match) return null;
  const [, value, unit] = match;
  if (!unit) return null;
  for (const [pattern, reading] of KOREAN_UNIT_READING) {
    if (pattern.test(unit)) return `${value} ${reading}`;
  }
  return null;
}

/** 숫자를 제외한 핵심 단어만 추린다. */
function keyTokens(sentence: string, limit = 8): string[] {
  return tokenize(sentence)
    .filter((token) => !/^\d/.test(token) && token.length >= 2)
    .slice(0, limit);
}

/** 숫자 바로 앞에 나오는 단어를 문맥 앵커로 사용한다. */
function contextBefore(sentence: string, numberPhrase: string, count = 2): string {
  const value = numberPhrase.match(/^[\d.]+/)?.[0] ?? '';
  const index = value ? sentence.indexOf(value) : -1;
  const head = index > 0 ? sentence.slice(0, index) : sentence;
  const tokens = keyTokens(head, 12);
  return tokens.slice(Math.max(0, tokens.length - count)).join(' ');
}

/** 문장 전체를 3단어 창으로 훑어 앞·중간·끝 표현을 모두 확보한다. */
function tokenWindows(sentence: string, max = 3): string[] {
  const tokens = keyTokens(sentence, 12);
  // 긴 문장은 창을 넓혀 특정성을 높이고, 짧은 문장은 3단어로 둔다.
  const size = tokens.length >= 6 ? 4 : 3;
  if (tokens.length <= size) return tokens.length ? [tokens.join(' ')] : [];
  const windows: string[] = [];
  const positions = [0, Math.floor((tokens.length - size) / 2), tokens.length - size];
  for (const start of [...new Set(positions)]) {
    windows.push(tokens.slice(start, start + size).join(' '));
    if (windows.length >= max) break;
  }
  return windows;
}

/**
 * 실제 발화와 매칭될 수 있는 표현 변형을 만든다.
 * 긴 원문 한 덩어리는 커버리지가 낮아 매칭되지 않으므로
 * 3단어 창과 "문맥 + 숫자" 앵커 구를 함께 생성한다.
 */
export function buildVariants(sentence: string, title: string): string[] {
  const variants = new Set<string>();
  const numbers = extractNumerics(sentence);

  for (const window of tokenWindows(sentence)) variants.add(window);

  for (const number of numbers) {
    const anchor = contextBefore(sentence, number);
    variants.add(anchor ? `${anchor} ${number}` : number);
    const reading = koreanReading(number);
    if (reading) variants.add(anchor ? `${anchor} ${reading}` : reading);
  }

  variants.add(title);
  return [...variants].map((value) => value.trim()).filter((value) => value.length >= 2).slice(0, 7);
}

function buildTitle(sentence: string, type: DecisionType): string {
  const compact = sentence.replace(/\s+/g, ' ').trim();
  if (compact.length < 6) return FALLBACK_TITLES[type];
  if (compact.length <= 46) return compact;
  const cut = compact.slice(0, 46);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function keywordHits(sentence: string, type: DecisionType): number {
  const normalized = normalizeText(sentence);
  return TYPE_KEYWORDS[type].reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0);
}

function scoreSentence(sentence: string, type: DecisionType): number {
  let score = keywordHits(sentence, type);
  const hasNumber = /\d/.test(sentence);
  if (hasNumber && (type === 'evidence' || type === 'risk')) score += 0.8;
  if (type === 'request' && REQUEST_HINT.test(sentence)) score += 0.6;
  if (sentence.length >= 12 && sentence.length <= 90) score += 0.3;
  return score;
}

function toItem(
  type: DecisionType,
  sentence: string,
  slide: SlideData,
  index: number,
  required: boolean,
): DecisionItem {
  const title = buildTitle(sentence, type);
  const detail = sentence.length > 110 ? `${sentence.slice(0, 110)}…` : sentence;
  return {
    id: `local-${type}-${Date.now()}-${index}`,
    type,
    title,
    detail,
    slide: slide.page,
    required,
    estimatedSeconds: Math.min(26, Math.max(10, 10 + Math.floor(sentence.length / 8))),
    variants: buildVariants(sentence, title),
    sourceText: slide.sourceText.trim(),
    delivered: false,
  };
}

/**
 * LLM 없이 PDF 원문만으로 Decision Set을 구성한다.
 * 문장 단위로 후보를 만들고 유형별 최적 문장을 고른 뒤,
 * 수치가 포함된 문장을 근거/리스크 항목으로 추가한다.
 */
export function generateFallbackDecisionSet(slides: SlideData[], objective: string): DecisionItem[] {
  if (!slides.length) return [];
  const types = Object.keys(TYPE_KEYWORDS) as DecisionType[];

  const pool = slides.flatMap((slide) =>
    extractSentences(slide.sourceText).map((text) => ({ slide, text })));

  // 텍스트 추출이 불가능한 PDF(스캔본 등)에서는 슬라이드 단위로 최소 구성을 유지한다.
  if (!pool.length) {
    return types.map((type, index) => {
      const slide = slides[Math.min(index, slides.length - 1)];
      return {
        id: `local-${type}-${Date.now()}-${index}`,
        type,
        title: FALLBACK_TITLES[type],
        detail: `보고 목적 “${objective}” 달성에 필요한 ${FALLBACK_TITLES[type]} 항목입니다.`,
        slide: slide.page,
        required: type === 'conclusion' || type === 'request',
        estimatedSeconds: 14,
        variants: [FALLBACK_TITLES[type]],
        sourceText: slide.sourceText.trim(),
        delivered: false,
      };
    });
  }

  const usedSentences = new Set<string>();
  const usedSlides = new Set<number>();
  const items: DecisionItem[] = [];

  types.forEach((type, index) => {
    const ranked = pool
      .filter((entry) => !usedSentences.has(entry.text))
      .map((entry) => ({
        ...entry,
        score: scoreSentence(entry.text, type) - (usedSlides.has(entry.slide.page) ? 0.4 : 0),
      }))
      .sort((left, right) => right.score - left.score);

    const best = ranked[0];
    if (!best) return;
    usedSentences.add(best.text);
    usedSlides.add(best.slide.page);

    const required = type === 'conclusion' || type === 'request' || keywordHits(best.text, type) > 0;
    items.push(toItem(type, best.text, best.slide, index, required));
  });

  // 수치가 포함된 문장을 근거/리스크로 최대 3개까지 보강한다.
  const extras = pool
    .filter((entry) => !usedSentences.has(entry.text) && extractNumerics(entry.text).length > 0)
    .map((entry) => ({
      ...entry,
      type: (keywordHits(entry.text, 'risk') > 0 ? 'risk' : 'evidence') as DecisionType,
      score: Math.max(scoreSentence(entry.text, 'evidence'), scoreSentence(entry.text, 'risk')),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  extras.forEach((entry, offset) => {
    usedSentences.add(entry.text);
    items.push(toItem(entry.type, entry.text, entry.slide, types.length + offset, false));
  });

  return items
    .sort((left, right) => left.slide - right.slide)
    .slice(0, 8);
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
