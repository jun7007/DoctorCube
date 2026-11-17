/**
 * 공식 모음 화면들: 목록(AlgSetView), 공식 하나 공부하기(CaseStudy), 가리고 연습하기(CaseDrill).
 */
import { useMemo, useRef, useState } from 'react';
import { caseState, type AlgCase, type AlgSet } from '../../algorithms';
import type { CubeState, Move } from '../../core/cube';
import { parseAlg } from '../../core/notation';
import { CubeCanvas, type CubeCanvasHandle } from '../../ui/CubeCanvas';
import { IsoView, TopView } from '../../ui/CubeThumb';
import { SPEEDS, useSpeed } from '../../ui/speed';
import { pickCase, useCaseStats } from './caseStore';
import { drillQuestion, pickTurn, type PreTurn } from './quiz';
import './quiz.css';
import type { Playable } from './resolve';
import { StepPlayer } from './StepPlayer';

/** 케이스의 작은 그림. 모음에 맞는 종류(위에서 본 그림 / 비스듬히 본 그림)로 그린다. */
export function Thumb({ set, state, size }: { set: AlgSet; state: CubeState; size?: number }) {
  return set.view === 'iso' ? (
    <IsoView state={state} focus={set.focus} size={size} />
  ) : (
    <TopView state={state} mode={set.view} size={size} />
  );
}

function playableOf(set: AlgSet, algCase: AlgCase): Playable {
  return { start: caseState(algCase), groups: [{ moves: parseAlg(algCase.alg) }], focus: set.focus };
}

// ───────── 목록 ─────────

interface SetProps {
  set: AlgSet;
  onBack: () => void;
  onOpenCase: (caseId: string) => void;
  onDrill: () => void;
  onQuiz: () => void;
}

export function AlgSetView({ set, onBack, onOpenCase, onDrill, onQuiz }: SetProps) {
  const { stats } = useCaseStats();
  const groups = useMemo(() => {
    const map = new Map<string, AlgCase[]>();
    for (const c of set.cases) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return [...map];
  }, [set]);
  const known = set.cases.filter((c) => stats[c.id]?.known).length;

  return (
    <div className="algset">
      <div className="algset__head">
        <button className="link" onClick={onBack}>
          ← 목록
        </button>
        <span className="muted">
          외운 공식 {known} / {set.cases.length}
        </span>
      </div>
      <h2>{set.title}</h2>
      <p className="muted">{set.summary}</p>
      <div className="algset__actions">
        <button className="btn btn--primary algset__drill" onClick={onDrill}>
          공식 가리고 연습하기
        </button>
        <button className="btn algset__quiz" onClick={onQuiz}>
          그림 보고 공식 고르기
        </button>
      </div>

      {set.view === 'pll' && (
        <details className="help algset__glossary">
          <summary>용어 설명</summary>
          <ul>
            <li>
              <b>헤드라이트</b>: 한 옆면의 양쪽 코너가 같은 색이에요.
            </li>
            <li>
              <b>블록</b>: 코너와 바로 옆 엣지가 같은 색이에요 (2칸).
            </li>
            <li>
              <b>줄</b>: 한 옆면의 3칸이 모두 같은 색이에요.
            </li>
          </ul>
        </details>
      )}

      {groups.map(([group, cases]) => (
        <section key={group} className="algset__group">
          <h3>{group}</h3>
          <div className="algset__grid">
            {cases.map((c) => (
              <button key={c.id} className="case-card" onClick={() => onOpenCase(c.id)}>
                <Thumb set={set} state={caseState(c)} size={68} />
                <span className="case-card__name">
                  {stats[c.id]?.known && <span className="case-card__known">✓</span>}
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ───────── 공식 하나 공부하기 ─────────

interface StudyProps {
  set: AlgSet;
  algCase: AlgCase;
  onBack: () => void;
  /** 돌아가기 버튼에 쓸 말. 없으면 모음 이름 */
  backLabel?: string;
  onOpenCase: (caseId: string) => void;
}

export function CaseStudy({ set, algCase, onBack, backLabel, onOpenCase }: StudyProps) {
  const view = useRef<CubeCanvasHandle>(null);
  const turnHandler = useRef<((move: Move) => void) | null>(null);
  const [speed, setSpeed] = useSpeed();
  const { stats, setKnown } = useCaseStats();
  const playable = useMemo(() => playableOf(set, algCase), [set, algCase]);

  const index = set.cases.indexOf(algCase);
  const prev = set.cases[index - 1];
  const next = set.cases[index + 1];
  const known = stats[algCase.id]?.known === true;

  return (
    <div className="workspace">
      <section className="stage" aria-label="3D 큐브">
        <CubeCanvas
          ref={view}
          getState={() => playable.start}
          onTurn={(move) => turnHandler.current?.(move)}
          duration={SPEEDS[speed].ms}
        />
        <button className="stage__view" onClick={() => view.current?.resetView()}>
          시점 초기화
        </button>
      </section>

      <section className="panel panel--lesson" aria-label="공식">
        <div className="lesson__scroll">
          <div className="lesson__head">
            <button className="link" onClick={onBack}>
              ← {backLabel ?? set.title}
            </button>
            <span className="muted">
              {index + 1} / {set.cases.length}
            </span>
          </div>
          <div className="case__title">
            <Thumb set={set} state={playable.start} size={56} />
            <div>
              <h2 className="lesson__title">{algCase.name}</h2>
              <p className="muted">{algCase.group}</p>
            </div>
          </div>
          {algCase.note && <p className="lesson__body">{algCase.note}</p>}

          <StepPlayer
            key={algCase.id}
            view={view}
            playable={playable}
            speedMs={SPEEDS[speed].ms}
            speed={speed}
            onSpeed={setSpeed}
            selfOnly={false}
            turnHandler={turnHandler}
          />

          {algCase.alts && algCase.alts.length > 0 && (
            <div className="case__alts">
              <h3>다른 공식</h3>
              {algCase.alts.map((alt) => (
                <code key={alt}>{alt}</code>
              ))}
            </div>
          )}

          <label className="case__known">
            <input type="checkbox" checked={known} onChange={(e) => setKnown(algCase.id, e.target.checked)} />
            외웠어요
          </label>
        </div>
        <div className="lesson__nav lesson__nav--even">
          <button className="btn" onClick={() => prev && onOpenCase(prev.id)} disabled={!prev}>
            이전 공식
          </button>
          <button className="btn btn--primary" onClick={() => next && onOpenCase(next.id)} disabled={!next}>
            다음 공식
          </button>
        </div>
      </section>
    </div>
  );
}

// ───────── 가리고 연습하기 ─────────

export function CaseDrill({ set, onBack }: { set: AlgSet; onBack: () => void }) {
  const view = useRef<CubeCanvasHandle>(null);
  const turnHandler = useRef<((move: Move) => void) | null>(null);
  const [speed, setSpeed] = useSpeed();
  const { stats, record } = useCaseStats();
  /** 지금 문제: 케이스와, 윗층을 얼마나 돌려 놓았는지 */
  const [question, setQuestion] = useState<{ algCase: AlgCase; turn: PreTurn }>(() => {
    const algCase = pickCase(set.cases, stats, null);
    return { algCase, turn: pickTurn(algCase, set.view) };
  });
  const current = question.algCase;
  /** 문제 번호. 같은 공식이 다시 나와도 화면을 새로 시작하게 한다 */
  const [round, setRound] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<'ok' | 'fail' | null>(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  // 윗층을 돌려 놓은 상태에서 시작한다. 돌릴 동작은 "윗층 되돌리기 + 공식"이다.
  const playable = useMemo<Playable>(() => {
    const { start, moves } = drillQuestion(question.algCase, question.turn);
    return { start, groups: [{ moves }], focus: set.focus };
  }, [set, question]);

  const finish = (clean: boolean) => {
    const ok = clean && !revealed;
    setResult(ok ? 'ok' : 'fail');
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
    record(current.id, ok);
  };

  const nextCase = () => {
    // 풀지 않고 넘기면 모르는 것으로 기록한다.
    if (result === null) {
      record(current.id, false);
      setScore((s) => ({ ...s, total: s.total + 1 }));
    }
    const algCase = pickCase(set.cases, stats, current.id);
    setQuestion({ algCase, turn: pickTurn(algCase, set.view) });
    setRound((n) => n + 1);
    setRevealed(false);
    setResult(null);
  };

  return (
    <div className="workspace">
      <section className="stage" aria-label="3D 큐브">
        <CubeCanvas
          ref={view}
          getState={() => playable.start}
          onTurn={(move) => turnHandler.current?.(move)}
          duration={SPEEDS[speed].ms}
        />
        <button className="stage__view" onClick={() => view.current?.resetView()}>
          시점 초기화
        </button>
      </section>

      <section className="panel panel--lesson" aria-label="연습">
        <div className="lesson__scroll">
          <div className="lesson__head">
            <button className="link" onClick={onBack}>
              ← {set.title}
            </button>
            <span className="muted">
              {round}번째 문제 · 맞힘 {score.ok} / {score.total}
            </span>
          </div>
          <div className="case__title">
            <Thumb set={set} state={playable.start} size={56} />
            <div>
              <h2 className="lesson__title">{result || revealed ? current.name : '어떤 공식일까요?'}</h2>
              <p className="muted">윗층(U)을 맞춘 뒤 공식을 돌려 보세요.</p>
            </div>
          </div>

          <StepPlayer
            key={round}
            view={view}
            playable={playable}
            speedMs={SPEEDS[speed].ms}
            speed={speed}
            onSpeed={setSpeed}
            selfOnly
            mask={!revealed && result === null}
            onResult={finish}
            turnHandler={turnHandler}
          />

          {result === 'ok' && <p className="drill__result drill__result--ok">도움 없이 해냈어요!</p>}
          {result === 'fail' && <p className="drill__result">다음에 다시 나올 거예요.</p>}
        </div>
        <div className="lesson__nav lesson__nav--even">
          <button className="btn" onClick={() => setRevealed(true)} disabled={revealed || result !== null}>
            공식 보기
          </button>
          <button className="btn btn--primary" onClick={nextCase}>
            {result === null ? '건너뛰기' : '다음 문제'}
          </button>
        </div>
      </section>
    </div>
  );
}
