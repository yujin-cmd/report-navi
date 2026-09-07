import { useMemo, useState } from 'react';
import { DEMO_QUESTIONS } from '../data/demo';
import { decisionMatchScore, generateExpectedQuestions } from '../lib/report';
import { DECISION_LABELS, type AppStep, type DecisionItem, type DecisionType, type ReportSession } from '../types';
import { Badge, Icon, PageShell } from './common';

export function ReviewScreen({ session, onStart, onStepNavigate, furthestStep }: { session: ReportSession; onStart: (items: DecisionItem[]) => void; onStepNavigate: (step: AppStep) => void; furthestStep: AppStep }) {
  const [items, setItems] = useState(session.decisionItems);
  const [questionOpen, setQuestionOpen] = useState(true);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [simulationAnswer, setSimulationAnswer] = useState('');
  const [simulationFeedback, setSimulationFeedback] = useState<{ covered: boolean; message: string; slide?: number } | null>(null);
  const requiredCount = items.filter((item) => item.required).length;
  const optionalCount = items.length - requiredCount;
  const estimatedSeconds = items.reduce((total, item) => total + item.estimatedSeconds, 0);
  const grouped = useMemo(() => {
    const result = {} as Record<DecisionType, DecisionItem[]>;
    (Object.keys(DECISION_LABELS) as DecisionType[]).forEach((type) => { result[type] = items.filter((item) => item.type === type); });
    return result;
  }, [items]);
  const expectedQuestions = useMemo(
    () => session.demoMode ? DEMO_QUESTIONS : generateExpectedQuestions(items, session.objective),
    [items, session.demoMode, session.objective],
  );

  function update(id: string, patch: Partial<DecisionItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addItem() {
    setItems((current) => [...current, {
      id: `manual-${Date.now()}`,
      type: 'evidence',
      title: '새 핵심 항목',
      detail: '보고 전에 내용을 구체화해 주세요.',
      slide: 1,
      required: false,
      estimatedSeconds: 12,
      variants: [],
      delivered: false,
    }]);
  }

  function checkSimulationAnswer() {
    const answer = simulationAnswer.trim();
    if (!answer) {
      setSimulationFeedback({ covered: false, message: '답변을 입력하면 근거와 전제의 포함 여부만 확인합니다.' });
      return;
    }
    const question = expectedQuestions[activeQuestion] || expectedQuestions[0];
    const focusItem = [...items].sort((left, right) => decisionMatchScore(question, right) - decisionMatchScore(question, left))[0];
    if (!focusItem) {
      setSimulationFeedback({ covered: false, message: '확인할 Decision Set 항목이 없습니다.' });
      return;
    }
    const score = decisionMatchScore(answer, focusItem);
    setSimulationFeedback(score >= 0.32
      ? { covered: true, message: `“${focusItem.title}” 핵심이 답변에 포함되었습니다. 문장 작성이나 답변 평가는 수행하지 않습니다.`, slide: focusItem.slide }
      : { covered: false, message: `“${focusItem.title}” 관련 근거가 답변에 포함되지 않았습니다. Slide ${focusItem.slide}의 원문을 확인하세요.`, slide: focusItem.slide });
  }

  return (
    <PageShell step="review" onStepNavigate={onStepNavigate} furthestStep={furthestStep}>
      <div className="page-title-row review-title-row">
        <div><span className="eyebrow"><Icon name="spark" size={15}/> DECISION SET</span><h1>보고 전 기준을 확정하세요</h1><p>{session.demoMode ? '샘플 분석이 제안한' : '로컬 기본 분석이 제안한'} 핵심 항목입니다. 보고 전 직접 검토해 주세요.</p></div>
        <button type="button" className="button button--secondary" onClick={addItem}><Icon name="plus" size={17}/> 새 항목 추가</button>
      </div>

      <section className="review-summary">
        <div><small>필수 항목</small><strong>{requiredCount}<em>개</em></strong></div>
        <div><small>선택 항목</small><strong>{optionalCount}<em>개</em></strong></div>
        <div><small>예상 전달시간</small><strong>{Math.floor(estimatedSeconds / 60)}:{String(estimatedSeconds % 60).padStart(2, '0')}</strong></div>
        {(session.timeLimitSeconds || session.meetingEndAt) && <div><small>선택 시간 안내</small><strong>{session.timeLimitSeconds ? `${Math.floor(session.timeLimitSeconds / 60)}분` : '회의 종료'}</strong></div>}
        <div className="summary-destination"><span><Icon name="target" size={17}/> 목적지</span><strong>{session.objective}</strong></div>
      </section>

      <div className="review-layout">
        <div className="decision-groups">
          {(Object.keys(DECISION_LABELS) as DecisionType[]).map((type) => (
            <section className={`decision-group type-${type}`} key={type}>
              <div className="decision-group-heading"><span className="type-dot"/><h2>{DECISION_LABELS[type]}</h2><Badge>{grouped[type].length}</Badge><small>{type === 'conclusion' ? '최종 제안·판단' : type === 'evidence' ? '수치·계산·비교' : type === 'assumption' ? '조건·가정' : type === 'risk' ? '영향·제약' : '최종 행동'}</small></div>
              {grouped[type].length === 0 && <div className="empty-decision">이 유형의 항목이 없습니다.</div>}
              {grouped[type].map((item) => (
                <article className="decision-editor" key={item.id}>
                  <button type="button" className={`required-toggle ${item.required ? 'is-required' : ''}`} onClick={() => update(item.id, { required: !item.required })} aria-pressed={item.required}>
                    <span>{item.required && <Icon name="check" size={13}/>}</span>{item.required ? '필수' : '선택'}
                  </button>
                  <div className="editor-content">
                    <input className="editor-title" aria-label={`${DECISION_LABELS[item.type]} 항목 제목`} value={item.title} onChange={(event) => update(item.id, { title: event.target.value })}/>
                    <textarea rows={2} aria-label={`${DECISION_LABELS[item.type]} 항목 상세 내용`} value={item.detail} onChange={(event) => update(item.id, { detail: event.target.value })}/>
                    <div className="editor-meta">
                      <label>유형<select value={item.type} onChange={(event) => update(item.id, { type: event.target.value as DecisionType })}>{Object.entries(DECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label>Slide <input type="number" min={1} value={item.slide} onChange={(event) => update(item.id, { slide: Number(event.target.value) })}/></label>
                      <label>예상 <input type="number" min={5} max={180} value={item.estimatedSeconds} onChange={(event) => update(item.id, { estimatedSeconds: Number(event.target.value) })}/><em>초</em></label>
                    </div>
                  </div>
                  <button type="button" className="icon-button danger" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} aria-label={`${item.title} 삭제`}><Icon name="trash" size={17}/></button>
                </article>
              ))}
            </section>
          ))}
        </div>

        <aside className="review-aside">
          <div className="review-checklist"><div className="panel-heading"><div><span>PRE-FLIGHT CHECK</span><h2>검토 체크</h2></div></div>{[
            ['5개 유형이 모두 있는가', Object.values(grouped).every((group) => group.length > 0)],
            ['필수 항목이 지정됐는가', requiredCount > 0],
            ['최종 요청이 포함됐는가', grouped.request.length > 0],
            ...(session.timeLimitSeconds ? [['예상시간이 목표시간 내인가', estimatedSeconds <= session.timeLimitSeconds] as [string, boolean]] : []),
          ].map(([label, checked]) => <div className="check-row" key={String(label)}><span className={checked ? 'checked' : ''}>{checked && <Icon name="check" size={13}/>}</span><strong>{label}</strong></div>)}</div>

          <div className="question-panel">
            <button type="button" onClick={() => setQuestionOpen((value) => !value)}><span><Icon name="search" size={17}/><strong>예상 확인 질문</strong></span><Icon name={questionOpen ? 'chevron-left' : 'chevron-right'} size={16}/></button>
            {questionOpen && <div>{expectedQuestions.map((question, index) => <p key={question}><span>Q{index + 1}</span>{question}</p>)}</div>}
          </div>

          <div className="review-principle"><Icon name="alert" size={17}/><p><strong>최종 책임은 보고자에게 있습니다.</strong>자동 추출 결과는 실전 전에 반드시 확인하세요.</p></div>
        </aside>
      </div>

      <section className="review-simulation" aria-labelledby="simulation-title">
        <div className="section-heading">
          <div><span>REVIEW SIMULATION</span><h2 id="simulation-title">검토 시뮬레이션</h2><p>상급자나 발주처의 질문을 선택하고 답해 보세요. Report Navi는 답변을 대신 만들지 않고 빠진 근거만 확인합니다.</p></div>
          <Badge tone="blue">선택 기능</Badge>
        </div>
        <div className="simulation-grid">
          <div className="simulation-questions">
            {expectedQuestions.map((question, index) => (
              <button type="button" className={index === activeQuestion ? 'active' : ''} key={question} onClick={() => { setActiveQuestion(index); setSimulationAnswer(''); setSimulationFeedback(null); }}>
                <span>Q{index + 1}</span><strong>{question}</strong>
              </button>
            ))}
          </div>
          <div className="simulation-answer">
            <label htmlFor="simulation-answer">내 답변</label>
            <textarea id="simulation-answer" rows={5} value={simulationAnswer} onChange={(event) => setSimulationAnswer(event.target.value)} placeholder="답변할 내용을 직접 입력하세요." />
            <div className="simulation-actions"><small>내용의 완결성만 확인하며 표현이나 말하기를 평가하지 않습니다.</small><button className="button button--secondary" type="button" onClick={checkSimulationAnswer}>빠진 근거 확인</button></div>
            {simulationFeedback && <div className={`simulation-feedback ${simulationFeedback.covered ? 'is-covered' : 'is-missing'}`}><Icon name={simulationFeedback.covered ? 'check' : 'alert'} size={17}/><p>{simulationFeedback.message}</p></div>}
          </div>
        </div>
      </section>

      <div className="sticky-actionbar"><div><span className="ready-dot"/><p><strong>보고 준비 완료</strong><small>마이크 권한이 없어도 텍스트 입력으로 전체 흐름을 시연할 수 있습니다.</small></p></div><button className="button button--primary button--large" onClick={() => onStart(items)} disabled={!items.length || requiredCount === 0}><Icon name="play" size={18}/> 보고 시작</button></div>
    </PageShell>
  );
}
