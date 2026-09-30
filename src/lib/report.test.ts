import { describe, expect, it } from 'vitest';
import { cloneDemoItems, DEMO_SLIDES } from '../data/demo';
import { decisionMatchScore, findDeliveredItemIds, recentTranscriptWindow, generateExpectedQuestions, generateFallbackDecisionSet, getTimeGuideState, normalizeText, searchEvidence, shouldPrioritize } from './report';

describe('Report Navi local matching', () => {
  it('normalizes Korean numeric unit variants', () => {
    expect(normalizeText('최대 106.2 킬로와트, 약 8프로')).toBe('최대 106.2 kw 약 8 percent');
  });

  it('matches a spoken load statement to the evidence item', () => {
    const ids = findDeliveredItemIds('최대 냉각부하는 106.2킬로와트입니다', cloneDemoItems());
    expect(ids).toContain('demo-evidence-load');
  });

  it('matches Korean percent variants to the cost risk', () => {
    const ids = findDeliveredItemIds('초기 공사비가 8퍼센트 증가합니다', cloneDemoItems());
    expect(ids).toContain('demo-risk-cost');
  });

  it('does not match a numeric item with the wrong value', () => {
    const ids = findDeliveredItemIds('최대 냉각부하는 96.5킬로와트입니다', cloneDemoItems());
    expect(ids).not.toContain('demo-evidence-load');
  });

  it('prioritizes required items when configured time is too short', () => {
    expect(shouldPrioritize(30, cloneDemoItems())).toBe(true);
    expect(shouldPrioritize(300, cloneDemoItems())).toBe(false);
  });

  it('fully disables time guidance when timer mode is off', () => {
    expect(getTimeGuideState({ timerMode: 'off', timeLimitSeconds: 30, meetingEndAt: '2099-01-01T00:00', startedAt: 0 }, 10_000))
      .toEqual({ enabled: false, remainingSeconds: 0 });
  });

  it('counts down only the selected duration mode', () => {
    expect(getTimeGuideState({ timerMode: 'duration', timeLimitSeconds: 60, startedAt: 1_000 }, 31_000))
      .toEqual({ enabled: true, remainingSeconds: 30 });
  });

  it('counts down to a selected meeting deadline', () => {
    expect(getTimeGuideState({ timerMode: 'deadline', meetingEndAt: '2030-01-01T00:01:00.000Z' }, Date.parse('2030-01-01T00:00:00.000Z')))
      .toEqual({ enabled: true, remainingSeconds: 60 });
  });

  it('finds the supporting slide without generating an answer', () => {
    const result = searchEvidence('106kW 근거는?', DEMO_SLIDES);
    expect(result[0].slide).toBe(4);
    expect(result[0].excerpt).toContain('106.2');
  });

  it('always creates all five decision types in local fallback mode', () => {
    const generated = generateFallbackDecisionSet(DEMO_SLIDES, 'B안 적용 승인을 받는다.');
    const types = new Set(generated.map((item) => item.type));
    expect([...types].sort()).toEqual(['assumption', 'conclusion', 'evidence', 'request', 'risk']);
    expect(generated.length).toBeGreaterThanOrEqual(5);
    expect(generated.length).toBeLessThanOrEqual(8);
    expect(generated.some((item) => item.required)).toBe(true);
    expect(generated.every((item) => item.variants.length > 0)).toBe(true);
  });

  it('generates expected questions from the uploaded document decision set', () => {
    const uploadedItems = cloneDemoItems().map((item) => item.type === 'evidence'
      ? { ...item, title: '업로드 자료의 총사업비 42억원', detail: '사용자가 올린 PDF에서 추출한 총사업비다.' }
      : item);
    const questions = generateExpectedQuestions(uploadedItems, '사업비 승인을 받는다.');
    expect(questions).toHaveLength(3);
    expect(questions.join(' ')).toContain('업로드 자료의 총사업비 42억원');
    expect(questions.join(' ')).not.toContain('106.2kW 산정에 적용한 부하 증가 가정');
  });
});

describe('임의 PDF 로컬 분석', () => {
  const slides = [
    {
      page: 1,
      title: '보고 목적',
      sourceText: '금번 보고는 신축 사옥 공조설비 대안 선정에 대한 승인을 요청드립니다.\n검토 대상은 A안과 B안 두 가지입니다.',
      imageDataUrl: '',
    },
    {
      page: 2,
      title: '설계 조건',
      sourceText: '설계 기준은 실내 26도 유지이며, 향후 인원 증가 15%를 가정하였습니다.',
      imageDataUrl: '',
    },
    {
      page: 3,
      title: '부하 산정',
      sourceText: '최대 냉방부하 산정 결과는 248.6kW로 계산되었습니다.\n장비 효율은 COP 3.8 기준입니다.',
      imageDataUrl: '',
    },
    {
      page: 4,
      title: '비용 영향',
      sourceText: 'B안 적용 시 초기 공사비가 약 12% 증가하는 리스크가 있습니다.',
      imageDataUrl: '',
    },
  ];

  const GENERIC_TITLES = ['보고의 최종 제안 확인', '핵심 수치와 비교 근거 확인', '판단에 적용된 전제조건 확인', '선택에 따른 영향과 리스크 확인', '상대방에게 필요한 결정사항 확인'];

  it('자료에 있는 유형은 일반 라벨이 아니라 원문 문장에서 제목을 만든다', () => {
    const items = generateFallbackDecisionSet(slides, '공조설비 대안 승인');
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const type of ['evidence', 'risk', 'request', 'assumption'] as const) {
      const item = items.find((entry) => entry.type === type);
      expect(item).toBeDefined();
      expect(GENERIC_TITLES).not.toContain(item!.title);
    }
  });

  it('자료에 없는 유형은 일반 라벨로 표시해 직접 채우게 한다', () => {
    const thin = [{ page: 1, title: '물량표', sourceText: '구분 수량 단가\n철근 120톤 850,000', imageDataUrl: '' }];
    const items = generateFallbackDecisionSet(thin, '물량 승인');
    const conclusion = items.find((entry) => entry.type === 'conclusion');
    expect(conclusion?.title).toBe('보고의 최종 제안 확인');
  });

  it('자료가 빈약해도 5개 유형을 모두 만든다', () => {
    const thin = [{ page: 1, title: '인사', sourceText: '안녕하십니까 함께해 주셔서 감사합니다', imageDataUrl: '' }];
    const items = generateFallbackDecisionSet(thin, '승인 요청');
    expect(new Set(items.map((item) => item.type)).size).toBe(5);
  });

  it('숫자에 한글 단위가 붙어도 매칭된다', () => {
    const table = [{ page: 1, title: '물량표', sourceText: '철근 물량은 120톤으로 산정되었습니다.', imageDataUrl: '' }];
    const items = generateFallbackDecisionSet(table, '물량 승인');
    expect(findDeliveredItemIds('철근 물량은 120톤입니다', items).length).toBeGreaterThan(0);
  });

  it('생성된 변형이 실제 발화와 매칭된다', () => {
    const items = generateFallbackDecisionSet(slides, '공조설비 대안 승인');
    const delivered = findDeliveredItemIds('최대 냉방부하 산정 결과는 248.6킬로와트로 계산되었습니다', items);
    expect(delivered.length).toBeGreaterThan(0);
  });

  it('숫자를 틀리게 말하면 수치 항목이 체크되지 않는다', () => {
    const items = generateFallbackDecisionSet(slides, '공조설비 대안 승인');
    const target = items.find((item) => item.title.includes('248.6'));
    expect(target).toBeDefined();
    expect(decisionMatchScore('최대 냉방부하는 198.2킬로와트입니다', target!)).toBeLessThan(0.58);
  });

  it('변형은 짧은 구 위주로 만들어진다', () => {
    const items = generateFallbackDecisionSet(slides, '공조설비 대안 승인');
    expect(items.every((item) => item.variants.length >= 1 && item.variants.length <= 7)).toBe(true);
  });

  it('텍스트가 없는 PDF에서도 항목을 반환한다', () => {
    const blank = [{ page: 1, title: '', sourceText: '', imageDataUrl: '' }];
    const items = generateFallbackDecisionSet(blank, '승인 요청');
    expect(items).toHaveLength(5);
    expect(items.some((item) => item.required)).toBe(true);
  });
});

describe('한국어 발화 인식 보정', () => {
  const items = cloneDemoItems();
  const conclusion = items.find((item) => item.title.includes('B안') && item.type === 'conclusion')!;
  const request = items.find((item) => item.title.includes('B안') && item.type === 'request')!;

  it('음성 인식이 적은 "비안"을 B안으로 인식한다', () => {
    expect(normalizeText('비안 적용을 제안드립니다')).toContain('b안');
    expect(normalizeText('비 안 적용')).toContain('b안');
    expect(normalizeText('에이안과 비안을 비교')).toBe('a안과 b안을 비교');
  });

  it('한글 단어 안의 "비안"은 바꾸지 않는다', () => {
    expect(normalizeText('예비안을 검토')).toContain('예비안');
    expect(normalizeText('비안정 구간')).toContain('비안정');
  });

  it('조사와 어미가 붙어도 결론 항목이 체크된다', () => {
    expect(decisionMatchScore('B안 적용을 제안드립니다', conclusion)).toBeGreaterThanOrEqual(0.58);
    expect(decisionMatchScore('비안 적용을 제안드립니다', conclusion)).toBeGreaterThanOrEqual(0.58);
  });

  it('조사와 어미가 붙어도 요청 항목이 체크된다', () => {
    expect(decisionMatchScore('비안 적용 승인을 요청드립니다', request)).toBeGreaterThanOrEqual(0.58);
  });

  it('결론을 말했다고 요청 항목까지 체크되지는 않는다', () => {
    expect(decisionMatchScore('비안 적용을 제안드립니다', request)).toBeLessThan(0.58);
  });

  it('숫자는 여전히 정확히 일치해야 한다', () => {
    const evidence = items.find((item) => item.title.includes('106.2'))!;
    expect(decisionMatchScore('최대 냉각부하는 96.5킬로와트입니다', evidence)).toBe(0);
  });
});

describe('실제 발표 음성 조건', () => {
  const items = () => cloneDemoItems();
  const titleOf = (id: string) => cloneDemoItems().find((item) => item.id === id)!.title;

  it('"비안입니다" 형태도 B안으로 인식한다', () => {
    expect(normalizeText('제안은 비안입니다')).toContain('b안입니다');
  });

  it('자연스러운 결론 표현을 결론 항목으로 인식한다', () => {
    for (const said of ['비안을 선택하겠습니다', '비안으로 결정하겠습니다', '비안을 권고합니다', '비안 채택을 제안합니다', '결론은 비안입니다']) {
      const ids = findDeliveredItemIds(said, items());
      expect(ids.map(titleOf)).toEqual(['냉각설비 B안 적용 제안']);
    }
  });

  it('요청 표현은 결론까지 함께 체크하지 않는다', () => {
    for (const said of ['비안 채택을 승인해 주세요', '비안 승인을 부탁드립니다']) {
      expect(findDeliveredItemIds(said, items()).map(titleOf)).toEqual(['B안 적용 승인 요청']);
    }
  });

  it('한 문장에 두 정보를 모두 말하면 둘 다 체크한다', () => {
    const ids = findDeliveredItemIds('최대 냉각부하는 106.2킬로와트이고 초기 공사비는 8퍼센트 증가합니다', items());
    expect(ids.length).toBe(2);
  });

  it('두 조각으로 나뉜 발화를 이어 붙여 인식한다', () => {
    const now = 10_000;
    const joined = recentTranscriptWindow([{ text: '비안 적용을', at: now - 1500 }, { text: '제안드립니다', at: now }], now);
    expect(findDeliveredItemIds('제안드립니다', items())).toEqual([]);
    expect(findDeliveredItemIds(joined, items()).map(titleOf)).toEqual(['냉각설비 B안 적용 제안']);
  });

  it('오래된 조각이나 세 조각 이상은 묶지 않는다', () => {
    const now = 10_000;
    expect(recentTranscriptWindow([{ text: '비안 적용을', at: now - 6000 }, { text: '제안드립니다', at: now }], now)).toBe('제안드립니다');
    expect(recentTranscriptWindow([{ text: 'a', at: now - 2 }, { text: 'b', at: now - 1 }, { text: 'c', at: now }], now)).toBe('b c');
  });

  it('A안과 B안 비교 중 B안만 언급하면 결론으로 체크하지 않는다', () => {
    const now = 10_000;
    const joined = recentTranscriptWindow([{ text: '비교해 보겠습니다', at: now - 1500 }, { text: '에이안과 비안을', at: now }], now);
    expect(findDeliveredItemIds(joined, items())).toEqual([]);
  });

  it('데모 표현 변형은 모두 해당 항목을 실제로 체크할 수 있다', () => {
    for (const item of items()) {
      for (const variant of item.variants) {
        expect(decisionMatchScore(variant, item)).toBeGreaterThanOrEqual(0.58);
      }
    }
  });
});
