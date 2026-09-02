import { useRef, useState, type DragEvent } from 'react';
import { cloneDemoItems, DEMO_SLIDES } from '../data/demo';
import { requestDecisionSet } from '../lib/ai';
import type { DecisionItem, ReportSession, SlideData } from '../types';
import { Badge, Icon, PageShell, SlideCanvas } from './common';

interface UploadScreenProps {
  session: ReportSession;
  slides: SlideData[];
  onSlidesChange: (slides: SlideData[], demoMode: boolean) => void;
  onReady: (items: DecisionItem[]) => void;
}

export function UploadScreen({ session, slides, onSlidesChange, onReady }: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(slides.length ? 100 : 0);
  const [progressLabel, setProgressLabel] = useState(slides.length ? '자료 준비 완료' : '대기 중');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF 파일만 업로드할 수 있습니다.');
      return;
    }
    setError('');
    setIsLoading(true);
    setFileName(file.name);
    try {
      const { extractPdfSlides } = await import('../lib/pdf');
      const pages = await extractPdfSlides(file, (value, label) => {
        setProgress(value);
        setProgressLabel(label);
      });
      onSlidesChange(pages, false);
    } catch (caught) {
      setError(caught instanceof Error ? `PDF를 분석하지 못했습니다: ${caught.message}` : 'PDF를 분석하지 못했습니다.');
      setProgress(0);
      setProgressLabel('분석 실패');
    } finally {
      setIsLoading(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  function loadDemo() {
    setFileName('Report_Navi_냉각설비_가상보고자료 (HTML Deck)');
    setProgress(100);
    setProgressLabel('8개 페이지 · 데모 자료 준비 완료');
    setError('');
    onSlidesChange(DEMO_SLIDES.map((slide) => ({ ...slide })), true);
  }

  async function generate() {
    if (!slides.length) return;
    setIsLoading(true);
    setError('');
    setProgress(92);
    setProgressLabel('보고 목적 기준으로 Decision Set 구조화 중');

    if (session.demoMode) {
      const items = cloneDemoItems();
      setProgress(100);
      setProgressLabel(`${items.length}개 Decision Item 준비 완료 · 사전 확정된 데모 세트`);
      setIsLoading(false);
      onReady(items);
      return;
    }

    const outcome = await requestDecisionSet(session, slides);
    setProgress(100);
    setProgressLabel(
      outcome.source === 'ai'
        ? `${outcome.items.length}개 Decision Item 생성 완료 · AI 분석`
        : `${outcome.items.length}개 Decision Item 생성 완료 · 로컬 분석`,
    );
    if (outcome.notice) setError(outcome.notice);
    setIsLoading(false);
    onReady(outcome.items);
  }

  return (
    <PageShell step="upload">
      <div className="page-title-row">
        <div><span className="eyebrow"><Icon name="upload" size={15}/> SOURCE ANALYSIS</span><h1>보고자료를 분석합니다</h1><p>첫 PDF를 보고자료로 읽고, 목적지에 필요한 정보만 구조화합니다.</p></div>
        <div className="destination-chip"><span>현재 목적지</span><strong>{session.objective}</strong></div>
      </div>

      <section className="upload-layout">
        <div className="upload-primary">
          <div
            className={`drop-zone ${isDragging ? 'is-dragging' : ''} ${slides.length ? 'has-file' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => void handleFile(event.target.files?.[0])}/>
            <div className="drop-icon"><Icon name={slides.length ? 'check' : 'file'} size={28}/></div>
            {slides.length ? <><strong>{fileName || '보고자료'}</strong><p>{slides.length}개 페이지를 읽었습니다.</p></> : <><strong>PDF를 끌어다 놓으세요</strong><p>또는 파일을 선택해 보고자료를 불러옵니다.</p></>}
            <button className="button button--secondary" type="button" onClick={() => inputRef.current?.click()} disabled={isLoading}>{slides.length ? '다른 PDF 선택' : 'PDF 파일 선택'}</button>
            <span className="file-rule">PDF · 첫 파일은 메인 보고자료로 처리</span>
          </div>

          <div className="demo-loader">
            <div><Badge tone="blue">3분 시연용</Badge><strong>가상 냉각설비 자료로 바로 시작</strong><p>실제 기업자료가 아닌 8장 HTML 데모 덱입니다.</p></div>
            <button type="button" className="button button--ghost" onClick={loadDemo}>샘플 자료 불러오기 <Icon name="spark" size={16}/></button>
          </div>

          {(progress > 0 || isLoading) && (
            <div className="analysis-progress">
              <div><span>{progressLabel}</span><strong>{progress}%</strong></div>
              <div className="progress-track"><i style={{ width: `${progress}%` }}/></div>
            </div>
          )}
          {error && <div className="inline-error"><Icon name="alert" size={17}/>{error}</div>}
        </div>

        <aside className="analysis-aside">
          <div className="panel-heading"><div><span>EXTRACTION MAP</span><h2>분석 범위</h2></div>{session.demoMode && <Badge tone="blue">데모 모드</Badge>}</div>
          {(['conclusion', 'evidence', 'assumption', 'risk', 'request'] as const).map((type, index) => (
            <div className={`analysis-type type-${type}`} key={type}><span>{index + 1}</span><div><strong>{['결론', '근거', '전제조건', '리스크', '요청·결정'][index]}</strong><small>{['무엇을 제안하는가', '왜 이 판단이 타당한가', '어떤 조건에서 성립하는가', '무엇을 감수해야 하는가', '어떤 행동이 필요한가'][index]}</small></div></div>
          ))}
          <div className="safe-mode-note"><Icon name="spark" size={17}/><div><strong>AI 없이도 중단되지 않습니다</strong><p>API가 없는 현재 빌드는 PDF 텍스트와 키워드를 이용한 로컬 fallback으로 5개 유형을 생성합니다.</p></div></div>
        </aside>
      </section>

      {slides.length > 0 && (
        <section className="slide-preview-section">
          <div className="section-heading"><div><span>PAGE PREVIEW</span><h2>페이지 미리보기</h2></div><Badge tone="green">{slides.length} pages ready</Badge></div>
          <div className="thumbnail-strip">
            {slides.map((slide) => <div className="thumbnail-card" key={slide.page}><div><SlideCanvas slide={slide} compact/></div><span>Slide {slide.page}</span></div>)}
          </div>
          <div className="upload-actionbar"><div><Icon name="check" size={18}/><span><strong>텍스트 추출 완료</strong><small>다음 단계에서 항목을 직접 수정할 수 있습니다.</small></span></div><button className="button button--primary" type="button" onClick={() => void generate()} disabled={isLoading}>AI로 Decision Set 생성 <Icon name="arrow-right"/></button></div>
        </section>
      )}
    </PageShell>
  );
}
