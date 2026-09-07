import { useState } from 'react';
import { OBJECTIVE_TYPES, type AppStep, type ReportSession } from '../types';
import { Icon, PageShell } from './common';

export function SetupScreen({ session, onContinue, onSampleStart, onStepNavigate, furthestStep }: { session: ReportSession; onContinue: (session: ReportSession) => void; onSampleStart: () => void; onStepNavigate: (step: AppStep) => void; furthestStep: AppStep }) {
  const [draft, setDraft] = useState(session);
  const [showSetupForm, setShowSetupForm] = useState(furthestStep !== 'setup');
  const minutes = draft.timeLimitSeconds ? Math.max(1, Math.round(draft.timeLimitSeconds / 60)) : '';
  const valid = draft.title.trim().length > 2 && draft.objective.trim().length > 5;

  return (
    <PageShell step="setup" onStepNavigate={onStepNavigate} furthestStep={furthestStep}>
      <section className={`setup-grid ${showSetupForm ? 'is-configuring' : 'is-landing'}`}>
        <div className="setup-copy">
          <span className="eyebrow"><Icon name="target" size={15}/> REPORT DESTINATION</span>
          <h1>의사결정에 필요한 정보,<br/>빠짐없이 전달되고 있나요?</h1>
          <p>Report Navi는 보고자료를 사전 분석하고, 보고 중 아직 전달되지 않은 핵심 정보를 실시간으로 추적합니다.</p>
          <div className="setup-hero-actions">
            <button className="button button--primary" type="button" onClick={onSampleStart}><Icon name="spark" size={17}/> 샘플 보고로 체험하기</button>
            <button className="button button--secondary" type="button" onClick={() => setShowSetupForm(true)}><Icon name="upload" size={17}/> 내 PDF로 시작하기</button>
          </div>
          <aside className="judge-guide" aria-label="처음 방문한 심사위원을 위한 시연 안내">
            <span><Icon name="spark" size={16}/> 처음 오셨다면</span>
            <ol>
              <li><strong>샘플 보고로 체험하기</strong>를 눌러 검토 화면으로 바로 이동</li>
              <li>Decision Set을 확인한 뒤 <strong>보고 시작</strong></li>
              <li>화면 하단 <strong>심사 시연 도구</strong>로 핵심 기능 재현</li>
            </ol>
            <p><Icon name="mic" size={14}/> 마이크 권한이 없어도 하단 텍스트 입력으로 동일하게 동작합니다.</p>
          </aside>
          <div className="route-preview" aria-label="Report Navi 핵심 흐름">
            <div><span>01</span><strong>기준 생성</strong><small>자료에서 Decision Set 추출</small></div>
            <i />
            <div><span>02</span><strong>전달 추적</strong><small>말한 내용과 남은 정보 비교</small></div>
            <i />
            <div><span>03</span><strong>근거 탐색</strong><small>질문과 관련된 자료 즉시 확인</small></div>
          </div>
          <div className="principle-note">
            <span className="principle-line" />
            <div><strong>보고를 대신하지 않습니다.</strong><p>의사결정에 필요한 정보를 끝까지 안내합니다.</p></div>
          </div>
        </div>

        {showSetupForm && <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); if (valid) onContinue(draft); }}>
          <div className="panel-heading">
            <div><span>STEP 01</span><h2>보고 목적지 설정</h2></div>
            <span className="required-note">* 필수 입력</span>
          </div>
          <label className="field">
            <span>보고 제목 *</span>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="예: 데이터센터 냉각설비 설계안 검토" />
          </label>
          <label className="field">
            <span>보고 목적 유형 *</span>
            <select value={draft.objectiveType} onChange={(event) => setDraft({ ...draft, objectiveType: event.target.value })}>
              {OBJECTIVE_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{draft.objectiveType === '직접 입력' ? '목적 직접 입력 *' : '구체적인 목적 *'}</span>
            <textarea rows={3} value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value })} placeholder="이 보고를 통해 받아야 할 결정이나 행동을 적어주세요." />
            <small>가능하면 “누구에게서 무엇을 얻는다” 형태로 작성하세요.</small>
          </label>
          <div className="optional-time-fields">
            <div className="optional-field-heading"><span><Icon name="clock" size={16}/> 시간 안내</span><em>선택사항</em></div>
            <label className="field">
              <span>목표 보고시간</span>
              <div className="time-input"><Icon name="clock" size={18}/><input type="number" min={1} max={120} value={minutes} placeholder="설정 안 함" onChange={(event) => setDraft({ ...draft, timeLimitSeconds: event.target.value ? Math.max(60, Number(event.target.value) * 60) : undefined })}/><em>분</em></div>
            </label>
            <label className="field">
              <span>회의 종료 예정시간</span>
              <input type="datetime-local" value={draft.meetingEndAt || ''} onChange={(event) => setDraft({ ...draft, meetingEndAt: event.target.value || undefined })}/>
            </label>
            <small className="optional-time-note">시간을 설정하지 않아도 미전달 추적과 근거 탐색은 동일하게 작동합니다.</small>
          </div>
          <div className="destination-summary">
            <span><Icon name="target" size={17}/> 목적지</span>
            <strong>{draft.objective || '목적을 입력해 주세요.'}</strong>
          </div>
          <button className="button button--primary button--wide" type="submit" disabled={!valid}>
            자료 업로드로 이동 <Icon name="arrow-right" />
          </button>
        </form>}
      </section>
    </PageShell>
  );
}
