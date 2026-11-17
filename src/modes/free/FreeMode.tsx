import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SOLVED, isSolved, type CubeState, type Move } from '../../core/cube';
import { algToString } from '../../core/notation';
import { generateScramble } from '../../core/scramble';
import { locate, makePlan, nextStep, type NextStep, type Plan } from '../../solvers/plan';
import { CubeCanvas, type CubeCanvasHandle } from '../../ui/CubeCanvas';
import { MovePad } from '../../ui/MovePad';
import { SPEEDS, SpeedControl, useSpeed } from '../../ui/speed';
import { useMoveKeys } from '../../ui/useMoveKeys';
import { countTurns, type FreeSession, type TimerState } from './session';

const SCRAMBLE_MS = 70;

export function FreeMode({ session }: { session: FreeSession }) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const view = useRef<CubeCanvasHandle>(null);
  const [speed, setSpeed] = useSpeed();
  const [hintOpen, setHintOpen] = useState(false);
  const historyBox = useRef<HTMLDivElement>(null);

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
  const scramble = useCallback(() => {
    const moves = generateScramble();
    session.scramble(moves);
    view.current?.setState(SOLVED);
    for (const m of moves) view.current?.enqueue(m, SCRAMBLE_MS);
  }, [session]);
  const reset = useCallback(() => {
    session.reset();
    view.current?.setState(SOLVED);
  }, [session]);

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
          <div className="status__timer">
            <TimerText timer={snap.timer} />
          </div>
          <div className="status__meta">
            <span className="status__turns">{turns}회전</span>
            <span className={`chip chip--${snap.timer.status}`}>{STATUS_LABEL[snap.timer.status]}</span>
          </div>
        </div>

        <div className="actions">
          <button className="btn btn--primary" onClick={scramble}>
            섞기
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
          {hintOpen && <Hint cube={snap.cube} onRun={(moves) => moves.forEach(turn)} />}
        </div>

        <div className="history">
          <h2>돌린 기록</h2>
          <div className="history__box" ref={historyBox}>
            {snap.history.length > 0 ? algToString(snap.history) : <span className="muted">아직 없어요</span>}
          </div>
        </div>

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

function TimerText({ timer }: { timer: TimerState }) {
  const [, setTick] = useState(0);
  const running = timer.status === 'running';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 50);
    return () => clearInterval(id);
  }, [running]);

  const ms =
    timer.status === 'running' ? performance.now() - timer.startedAt : timer.status === 'done' ? timer.elapsed : 0;
  return <>{formatTime(ms)}</>;
}

function formatTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  const s = seconds.toFixed(2);
  return minutes > 0 ? `${minutes}:${s.padStart(5, '0')}` : s;
}
