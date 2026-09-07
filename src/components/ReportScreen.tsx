import { useEffect } from 'react';
import { formatClock } from '../lib/report';
import { DECISION_LABELS, type AppStep, type ReportSession } from '../types';
import { Badge, Icon, PageShell } from './common';

export function ReportScreen({ session, onRestart, onReview, onStepNavigate, furthestStep }: { session: ReportSession; onRestart: () => void; onReview: () => void; onStepNavigate: (step: AppStep) => void; furthestStep: AppStep }) {
  const required = session.decisionItems.filter((item) => item.required);
  const optional = session.decisionItems.filter((item) => !item.required);
  const requiredDelivered = required.filter((item) => item.delivered).length;
  const optionalDelivered = optional.filter((item) => item.delivered).length;
  const missed = required.filter((item) => !item.delivered);
  const actualSeconds = Math.max(0, Math.round(((session.endedAt || Date.now()) - (session.startedAt || Date.now())) / 1000));
  const completion = required.length ? Math.round((requiredDelivered / required.length) * 100) : 0;

  useEffect(() => {
    try {
      const safeReport = {
        ...session,
        transcript: '',
        decisionItems: session.decisionItems.map(({ sourceText: _sourceText, ...item }) => item),
        actualSeconds,
        completion,
      };
      localStorage.setItem('report-navi:last-report', JSON.stringify(safeReport));
    } catch {
      // The app remains usable when storage is unavailable.
    }
  }, [actualSeconds, completion, session]);

  return (
    <PageShell step="report" onStepNavigate={onStepNavigate} furthestStep={furthestStep}>
      <section className="report-hero">
        <div><span className="eyebrow"><Icon name="target" size={15}/> ARRIVAL REPORT</span><h1>도착 리포트</h1><p>이번 보고에서 의사결정에 필요한 정보가 어디까지 전달됐는지 정리했습니다.</p></div>
        <div className="report-grade"><div style={{ '--progress': `${completion * 3.6}deg` } as React.CSSProperties}><span><strong>{completion}</strong><em>%</em><small>의사결정 준비도</small></span></div><p>{completion === 100 ? '필수 정보 전달 완료' : '보완 필요'}</p></div>
      </section>

      <div className="report-destination"><span><Icon name="target" size={18}/> 이번 보고의 목적지</span><strong>{session.objective}</strong><Badge tone={completion === 100 ? 'green' : 'amber'}>{completion === 100 ? '완결' : `${missed.length}개 미전달`}</Badge></div>

      <section className="report-kpis">
        <div><span>목적지 도달률</span><strong>{completion}<em>%</em></strong><small>필수 정보 기준</small></div>
        <div><span>필수 정보 전달</span><strong>{requiredDelivered}<em>/ {required.length}</em></strong><small>보고 중 확인된 핵심 정보</small></div>
        <div><span>보완이 필요한 핵심</span><strong>{missed.length}<em>개</em></strong><small>{missed.length ? '다음 보고 전 보완 필요' : '필수 정보 전달 완료'}</small></div>
      </section>
      <div className="report-secondary-meta">
        <span>선택 정보 {optionalDelivered}/{optional.length} 전달</span>
        <span>Evidence Navi {session.evidenceSearchCount}회</span>
        <span>수동 상태 수정 {session.manualOverrideCount}회</span>
        {session.timerMode !== 'off' && (session.timeLimitSeconds || session.meetingEndAt) && <span>실제 보고 {formatClock(actualSeconds)} · 시간 기반 우선 안내 {session.priorityGuideCount}회</span>}
      </div>

      <section className="report-detail-grid">
        <div className="delivery-ledger">
          <div className="section-heading"><div><span>DECISION SET LEDGER</span><h2>핵심 정보 전달 결과</h2></div><Badge>{session.decisionItems.length} items</Badge></div>
          <div>
            {session.decisionItems.map((item) => (
              <article className={item.delivered ? 'delivered' : 'missed'} key={item.id}>
                <span className="ledger-status">{item.delivered ? <Icon name="check" size={15}/> : <Icon name="alert" size={15}/>}</span>
                <div><span><em className={`type-text type-text--${item.type}`}>{DECISION_LABELS[item.type]}</em><small>PAGE {item.slide}</small>{item.required && <Badge tone="blue">필수</Badge>}</span><strong>{item.title}</strong></div>
                <small>{item.delivered ? '전달됨' : '미전달'}</small>
              </article>
            ))}
          </div>
        </div>
        <aside className="missed-summary">
          <div className="panel-heading"><div><span>NEXT ACTION</span><h2>{missed.length ? '다음 보고 전 보완' : '보고 완결'}</h2></div></div>
          {missed.length ? <>{missed.map((item) => <div className="missed-card" key={item.id}><span>{DECISION_LABELS[item.type]}</span><strong>{item.title}</strong><p>{item.detail}</p></div>)}<p className="missed-note">미전달 항목은 다음 보고의 Decision Set에 우선 반영하세요.</p></> : <div className="arrival-complete"><div><Icon name="check" size={26}/></div><strong>필수 정보가 모두 전달됐습니다</strong><p>결론·근거·전제·리스크·요청사항이 보고 과정에서 확인되었습니다.</p></div>}
        </aside>
      </section>

      <div className="report-actions"><button className="button button--secondary" onClick={onReview}><Icon name="edit" size={17}/> Decision Set 다시 보기</button><button className="button button--primary" onClick={onRestart}>새 보고 시작 <Icon name="arrow-right"/></button></div>
    </PageShell>
  );
}
