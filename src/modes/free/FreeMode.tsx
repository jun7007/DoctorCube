import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SOLVED, isSolved, type CubeState, type Move } from '../../core/cube';
import { algToString } from '../../core/notation';
import { locate, makePlan, nextStep, type NextStep, type Plan } from '../../solvers/plan';
import { CubeCanvas, type CubeCanvasHandle } from '../../ui/CubeCanvas';
import { MovePad } from '../../ui/MovePad';
import { SPEEDS, SpeedControl, useSpeed } from '../../ui/speed';
import { useMoveKeys } from '../../ui/useMoveKeys';
import { Records } from './RecordsPanel';
import { INSPECTION_MS, solveStore, useInspection } from './solveStore';
import { scrambler } from './scrambler';
import { countTurns, type FreeSession, type TimerState } from './session';
import { formatTime } from './stats';
import './free.css';

/** 섞을 때 한 수가 도는 시간 */
const SCRAMBLE_MS = 70;

export function FreeMode({ session }: { session: FreeSession }) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const view = useRef<CubeCanvasHandle>(null);
  const [speed, setSpeed] = useSpeed();
  const [hintOpen, setHintOpen] = useState(false);
  const historyBox = useRef<HTMLDivElement>(null);
  const [inspection, setInspection] = useInspection();
  // 스크램블을 기다리는 중인지. 번호는 "가장 최근에 누른 섞기"를 가리킨다.
  const [scrambling, setScrambling] = useState(false);
  const scrambleJob = useRef(0);

  const turn = useCallback(
    (move: Move) => {
      session.move(move);
      view.current?.enqueue(move);
    },
    [session],
  );
  const undo = useCallback(() => {
    const move = session.undo();
    if (move) view.current?.enqueue(move);
  }, [session]);
  const redo = useCallback(() => {
    const move = session.redo();
    if (move) view.current?.enqueue(move);
  }, [session]);
  const applyScramble = useCallback(
    (moves: readonly Move[]) => {
      // 관찰 시간은 섞는 애니메이션이 끝난 뒤부터 센다. (180° 회전은 1.4배 걸린다)
      const animation = moves.reduce((ms, m) => ms + SCRAMBLE_MS * (m.amount === 2 ? 1.4 : 1), 0);
      session.scramble(
        moves,
        inspection ? { inspectMs: INSPECTION_MS, inspectFrom: performance.now() + animation } : {},
      );
      view.current?.setState(SOLVED);
      for (const m of moves) view.current?.enqueue(m, SCRAMBLE_MS);
    },
    [session, inspection],
  );
  const scramble = useCallback(() => {
    const job = ++scrambleJob.current;
    // 미리 만들어 둔 무작위 상태 스크램블이 있으면 바로 섞는다.
    const ready = scrambler.takeReady();
    if (ready) {
      applyScramble(ready);
      return;
    }
    // 없으면 잠깐 기다린다. 너무 늦으면 무작위 회전 스크램블로 대신한다.
    setScrambling(true);
    void scrambler.take().then((moves) => {
      if (scrambleJob.current !== job) return; // 그 사이 초기화했거나 화면을 떠났다
      setScrambling(false);
      applyScramble(moves);
    });
  }, [applyScramble]);
  const reset = useCallback(() => {
    scrambleJob.current++;
    setScrambling(false);
    session.reset();
    view.current?.setState(SOLVED);
  }, [session]);
  const runHint = useCallback(
    (moves: Move[]) => {
      session.markHintUsed();
      moves.forEach(turn);
    },
    [session, turn],
  );

  // 탭을 열 때 스크램블을 미리 만들어 둔다 (처음에는 풀이기 표를 만드느라 조금 걸린다).
  useEffect(() => {
    scrambler.prepare();
    const job = scrambleJob;
    return () => {
      job.current++;
    };
  }, []);

  // 풀이가 끝나면 기록에 남긴다.
  useEffect(
    () =>
      session.onSolve((result) =>
        solveStore.add({
          at: Date.now(),
          ms: Math.floor(result.ms),
          turns: result.turns,
          scramble: algToString(result.scramble),
          hint: result.hintUsed,
        }),
      ),
    [session],
  );

  // 키보드: 글자 = 회전, Shift+글자 = 반대 방향, Ctrl+Z / Ctrl+Y = 되돌리기 / 다시 실행
  useMoveKeys(turn, (e) => {
    if (!e.ctrlKey) return false;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) undo();
    else if (key === 'y' || (key === 'z' && e.shiftKey)) redo();
    else return false;
    return true;
  });

  useEffect(() => {
    const box = historyBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [snap.history.length]);

  const turns = countTurns(snap.history);
  const done = snap.timer.status === 'done';
  const inspecting = snap.timer.status === 'ready' && snap.timer.inspectUntil !== undefined;

  return (
    <div className="workspace">
      <section className="stage" aria-label="3D 큐브">
        <CubeCanvas ref={view} getState={() => session.getSnapshot().cube} onTurn={turn} duration={SPEEDS[speed].ms} />
        {snap.scramble && !done && (
          <p className="stage__scramble">
            <span>섞기</span> {algToString(snap.scramble)}
          </p>
        )}
        {snap.timer.status === 'done' && (
          <p className="stage__banner" role="status">
            🎉 완성! {formatTime(snap.timer.elapsed)} · {turns}회전
          </p>
        )}
        <button className="stage__view" onClick={() => view.current?.resetView()}>
          시점 초기화
        </button>
      </section>

      <section className="panel" aria-label="조작">
        <div className="status">
          <div className={inspecting ? 'status__timer status__timer--inspect' : 'status__timer'}>
            <TimerText timer={snap.timer} onTick={session.tick} />
          </div>
          <div className="status__meta">
            <span className="status__turns">{turns}회전</span>
            <span className={`chip chip--${snap.timer.status}`}>{STATUS_LABEL[snap.timer.status]}</span>
          </div>
        </div>

        <div className="actions">
          <button className="btn btn--primary" onClick={scramble} disabled={scrambling} aria-busy={scrambling}>
            {scrambling ? '섞는 중…' : '섞기'}
          </button>
          <button className="btn" onClick={undo} disabled={snap.history.length === 0}>
            되돌리기
          </button>
          <button className="btn" onClick={redo} disabled={snap.redo.length === 0}>
            다시 실행
          </button>
          <button className="btn" onClick={reset}>
            초기화
          </button>
        </div>

        <MovePad onTurn={turn} trailing={<SpeedControl speed={speed} onChange={setSpeed} />} />

        <div className="hint">
          <button className="btn hint__toggle" aria-expanded={hintOpen} onClick={() => setHintOpen((o) => !o)}>
            {hintOpen ? '힌트 닫기' : '힌트 보기 (초보자 공식)'}
          </button>
          {hintOpen && <Hint cube={snap.cube} onRun={runHint} />}
        </div>

        <div className="history">
          <h2>돌린 기록</h2>
          <div className="history__box" ref={historyBox}>
            {snap.history.length > 0 ? algToString(snap.history) : <span className="muted">아직 없어요</span>}
          </div>
        </div>

        <Records inspection={inspection} onInspection={setInspection} />

        <details className="help">
          <summary>조작 방법</summary>
          <ul>
            <li>큐브 위를 밀면 그 줄이 돌아가요.</li>
            <li>큐브 바깥 빈 곳을 끌면 보는 방향이 바뀌어요.</li>
            <li>
              기호에 <b>'</b>가 붙으면 반대 방향이에요. 예: <b>R</b>은 오른쪽 면을 시계 방향으로, <b>R'</b>은 반시계
              방향으로.
            </li>
            <li>섞은 뒤 처음 돌리는 순간 타이머가 시작돼요.</li>
            <li>
              다 맞추면 <b>기록</b>에 시간이 남아요. ao5는 최근 5번에서 가장 빠른 것과 느린 것을 뺀 평균이에요.
            </li>
            <li>
              키보드: <kbd>R</kbd> <kbd>U</kbd> <kbd>F</kbd> 등 글자 키로 회전, <kbd>Shift</kbd>와 함께 누르면 반대
              방향, <kbd>Ctrl</kbd>+<kbd>Z</kbd>로 되돌리기.
            </li>
          </ul>
        </details>
      </section>
    </div>
  );
}

/** 지금 상태에서 초보자 공식으로 다음에 할 일 */
function Hint({ cube, onRun }: { cube: CubeState; onRun: (moves: Move[]) => void }) {
  // 한 번 구한 풀이를 기억해 두고, 큐브가 그 풀이 위에 있는 동안은 이어서 안내한다.
  // 사용자가 다른 동작을 해서 풀이에서 벗어나면 그때 새로 구한다.
  const planRef = useRef<Plan | null>(null);
  const next = useMemo((): NextStep | 'solved' | 'error' => {
    if (isSolved(cube)) return 'solved';
    let plan = planRef.current;
    let at = plan ? locate(plan, cube) : -1;
    if (!plan || at < 0) {
      try {
        plan = makePlan(cube);
      } catch {
        return 'error';
      }
      planRef.current = plan;
      at = 0;
    }
    return nextStep(plan, at) ?? 'solved';
  }, [cube]);

  if (next === 'solved') return <p className="hint__box muted">이미 완성된 상태예요.</p>;
  if (next === 'error') return <p className="hint__box muted">이 상태는 풀이를 찾지 못했어요.</p>;
  return (
    <div className="hint__box">
      <p className="hint__stage">
        지금 단계: <b>{next.stage.title}</b> <span className="muted">· 완성까지 약 {next.left}수</span>
      </p>
      <p>{next.note}</p>
      <div className="hint__run">
        <code>{algToString(next.moves)}</code>
        <button className="btn" onClick={() => onRun(next.moves)}>
          이 동작 하기
        </button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<TimerState['status'], string> = {
  idle: '연습',
  ready: '준비',
  running: '푸는 중',
  done: '완성',
};

function TimerText({ timer, onTick }: { timer: TimerState; onTick: () => void }) {
  const [, setTick] = useState(0);
  const inspectUntil = timer.status === 'ready' ? timer.inspectUntil : undefined;
  const ticking = timer.status === 'running' || inspectUntil !== undefined;
  useEffect(() => {
    if (!ticking) return;
    const tick = () => {
      onTick(); // 관찰 시간이 끝났으면 여기서 타이머가 시작된다
      setTick((n) => n + 1);
    };
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [ticking, onTick]);

  if (inspectUntil !== undefined) {
    const left = Math.ceil((inspectUntil - performance.now()) / 1000);
    return (
      <>
        <small>관찰</small> {Math.min(INSPECTION_MS / 1000, Math.max(0, left))}
      </>
    );
  }
  const ms =
    timer.status === 'running' ? performance.now() - timer.startedAt : timer.status === 'done' ? timer.elapsed : 0;
  return <>{formatTime(ms)}</>;
}
