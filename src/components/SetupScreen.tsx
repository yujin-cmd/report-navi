import { useState } from 'react';
import { OBJECTIVE_TYPES, type AppStep, type ReportSession } from '../types';
import { Icon, PageShell } from './common';

export function SetupScreen({ session, onContinue, onStepBack }: { session: ReportSession; onContinue: (session: ReportSession) => void; onStepBack: (step: AppStep) => void }) {
  const [draft, setDraft] = useState(session);
  const minutes = Math.max(1, Math.round(draft.timeLimitSeconds / 60));
  const valid = draft.title.trim().length > 2 && draft.objective.trim().length > 5;

  return (
    <PageShell step="setup" onStepBack={onStepBack}>
      <section className="setup-grid">
        <div className="setup-copy">
          <span className="eyebrow"><Icon name="target" size={15}/> REPORT DESTINATION</span>
          <h1>오늘의 보고 목적지는<br/>무엇인가요?</h1>
          <p>보고 종료가 아니라, 상대방에게 받아야 할 판단과 행동을 먼저 정합니다.</p>
          <aside className="judge-guide" aria-label="처음 방문한 심사위원을 위한 시연 안내">
            <span><Icon name="spark" size={16}/> 처음 오셨다면</span>
            <ol>
              <li>아래 목적지를 그대로 두고 <strong>자료 업로드로 이동</strong></li>
              <li>다음 화면에서 <strong>샘플 자료 불러오기</strong></li>
              <li>화면 하단 <strong>DEMO CONTROL</strong> 버튼으로 3분 시연 재현</li>
            </ol>
            <p><Icon name="mic" size={14}/> 마이크 권한이 없어도 하단 텍스트 입력으로 동일하게 동작합니다.</p>
          </aside>
          <div className="route-preview" aria-label="Report Navi 핵심 흐름">
            <div><span>01</span><strong>기준 생성</strong><small>자료에서 Decision Set 추출</small></div>
            <i />
            <div><span>02</span><strong>전달 추적</strong><small>말한 내용과 남은 정보 비교</small></div>
            <i />
            <div><span>03</span><strong>경로 재탐색</strong><small>시간에 맞춰 필수 정보 우선</small></div>
          </div>
          <div className="principle-note">
            <span className="principle-line" />
            <div><strong>보고를 대신하지 않습니다.</strong><p>의사결정에 필요한 정보를 끝까지 안내합니다.</p></div>
          </div>
        </div>

        <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); if (valid) onContinue(draft); }}>
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
          <label className="field">
            <span>제한시간 *</span>
            <div className="time-input"><Icon name="clock" size={18}/><input type="number" min={1} max={120} value={minutes} onChange={(event) => setDraft({ ...draft, timeLimitSeconds: Math.max(60, Number(event.target.value) * 60) })}/><em>분</em></div>
          </label>
          <div className="destination-summary">
            <span><Icon name="target" size={17}/> 목적지</span>
            <strong>{draft.objective || '목적을 입력해 주세요.'}</strong>
          </div>
          <button className="button button--primary button--wide" type="submit" disabled={!valid}>
            자료 업로드로 이동 <Icon name="arrow-right" />
          </button>
        </form>
      </section>
    </PageShell>
  );
}
