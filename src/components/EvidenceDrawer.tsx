import { useState } from 'react';
import { searchEvidence } from '../lib/report';
import type { EvidenceResult, SlideData } from '../types';
import { Badge, Icon } from './common';

interface EvidenceDrawerProps {
  slides: SlideData[];
  onClose: () => void;
  onSearch: () => void;
  onMove: (slide: number) => void;
}

export function EvidenceDrawer({ slides, onClose, onSearch, onMove }: EvidenceDrawerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EvidenceResult[]>([]);
  const [searched, setSearched] = useState(false);

  function runSearch(value = query) {
    const clean = value.trim();
    if (!clean) return;
    setQuery(clean);
    setResults(searchEvidence(clean, slides));
    setSearched(true);
    onSearch();
  }

  return (
    <aside className="evidence-drawer" aria-label="Evidence Navi">
      <div className="drawer-heading">
        <div><span>EVIDENCE NAVI</span><h2>답변이 아닌 근거를 찾습니다</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><Icon name="x"/></button>
      </div>
      <p className="drawer-description">질문과 가장 가까운 슬라이드·수치·준비된 키워드만 안내합니다.</p>
      <form className="evidence-search" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
        <Icon name="search" size={18}/>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 106kW라는 수치는 어디서 나왔습니까?"/>
        <button type="submit">검색</button>
      </form>
      <button className="sample-query" type="button" onClick={() => runSearch('106kW라는 수치는 어디서 나온 겁니까?')}><Icon name="spark" size={15}/> 샘플 질문 실행: “106kW의 근거는?”</button>

      <div className="evidence-results">
        {!searched && <div className="evidence-empty"><div><Icon name="search" size={24}/></div><strong>질문을 입력해 주세요</strong><p>로컬 키워드 유사도로 관련 페이지를 찾습니다.</p></div>}
        {searched && !results.length && <div className="evidence-empty"><div><Icon name="alert" size={24}/></div><strong>직접 연결되는 근거를 찾지 못했습니다</strong><p>수치나 설비명처럼 구체적인 키워드로 다시 검색해 보세요.</p></div>}
        {results.map((result, index) => (
          <article className="evidence-result" key={`${result.slide}-${index}`}>
            <div><Badge tone={index === 0 ? 'blue' : 'neutral'}>{index === 0 ? '가장 관련 높음' : '관련 자료'}</Badge><span>SLIDE {result.slide}</span></div>
            <h3>{result.title}</h3>
            <p>{result.excerpt}</p>
            <button type="button" onClick={() => onMove(result.slide)}>Slide {result.slide}로 이동 <Icon name="arrow-right" size={16}/></button>
          </article>
        ))}
      </div>
      <div className="drawer-principle"><Icon name="alert" size={16}/><span>Report Navi는 답변 문장을 생성하지 않습니다. 최종 설명과 판단은 보고자에게 남습니다.</span></div>
    </aside>
  );
}
