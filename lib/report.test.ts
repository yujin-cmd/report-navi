import { describe, expect, it } from 'vitest';
import { cloneDemoItems, DEMO_SLIDES } from '../data/demo';
import { findDeliveredItemIds, generateExpectedQuestions, generateFallbackDecisionSet, normalizeText, searchEvidence, shouldReroute } from './report';

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

  it('reroutes when remaining time cannot cover required items', () => {
    expect(shouldReroute(30, cloneDemoItems())).toBe(true);
    expect(shouldReroute(300, cloneDemoItems())).toBe(false);
  });

  it('finds the supporting slide without generating an answer', () => {
    const result = searchEvidence('106kW 근거는?', DEMO_SLIDES);
    expect(result[0].slide).toBe(4);
    expect(result[0].excerpt).toContain('106.2');
  });

  it('always creates all five decision types in local fallback mode', () => {
    const generated = generateFallbackDecisionSet(DEMO_SLIDES, 'B안 적용 승인을 받는다.');
    expect(generated.map((item) => item.type).sort()).toEqual(['assumption', 'conclusion', 'evidence', 'request', 'risk']);
    expect(generated.every((item) => item.required)).toBe(true);
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
