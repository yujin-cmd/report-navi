import { describe, expect, it } from 'vitest';
import { cloneDemoItems, DEMO_SLIDES } from '../data/demo';
import { decisionMatchScore, findDeliveredItemIds, generateExpectedQuestions, generateFallbackDecisionSet, getTimeGuideState, normalizeText, searchEvidence, shouldPrioritize } from './report';

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

  it('일반 라벨이 아니라 원문 문장에서 제목을 만든다', () => {
    const items = generateFallbackDecisionSet(slides, '공조설비 대안 승인');
    const generic = ['보고의 최종 제안 확인', '핵심 수치와 비교 근거 확인', '판단에 적용된 전제조건 확인', '선택에 따른 영향과 리스크 확인', '상대방에게 필요한 결정사항 확인'];
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((item) => !generic.includes(item.title))).toBe(true);
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
