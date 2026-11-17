import {
  SOLVED,
  applyMove,
  applyMoves,
  invertMove,
  isRotation,
  isSolved,
  type CubeState,
  type Move,
} from '../../core/cube';

export type TimerState =
  | { status: 'idle' }
  /**
   * 섞은 뒤 첫 회전을 기다리는 중.
   * 관찰 시간을 켰으면 inspectUntil(performance.now() 기준)에 타이머가 저절로 시작된다.
   */
  | { status: 'ready'; inspectUntil?: number }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; elapsed: number };

export interface FreeSnapshot {
  readonly cube: CubeState;
  /** 섞기 이후 사용자가 돌린 기록 */
  readonly history: readonly Move[];
  readonly redo: readonly Move[];
  readonly scramble: readonly Move[] | null;
  readonly timer: TimerState;
  /** 이번 풀이에서 힌트의 "이 동작 하기"를 썼는지 */
  readonly hintUsed: boolean;
}

/** 타이머가 멈춘 순간(완성)에 한 번 알려 주는 풀이 결과 */
export interface SolveResult {
  /** 걸린 시간 (ms) */
  readonly ms: number;
  /** 회전 수 (큐브 전체 회전은 뺌) */
  readonly turns: number;
  readonly scramble: readonly Move[];
  readonly hintUsed: boolean;
}

export interface ScrambleOptions {
  /** 관찰 시간(ms). 주면 그 시간이 지났을 때 타이머가 저절로 시작된다. */
  inspectMs?: number;
  /** 관찰을 시작하는 시각. 섞는 애니메이션이 끝나는 때를 넣는다. */
  inspectFrom?: number;
}

const INITIAL: FreeSnapshot = {
  cube: SOLVED,
  history: [],
  redo: [],
  scramble: null,
  timer: { status: 'idle' },
  hintUsed: false,
};

/**
 * 자유 모드의 상태. 모든 변경은 즉시(동기) 반영되므로
 * 버튼을 빠르게 연타해도 화면 애니메이션과 어긋나지 않는다.
 */
export class FreeSession {
  private snap: FreeSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private readonly solveListeners = new Set<(result: SolveResult) => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): FreeSnapshot => this.snap;

  /** 풀이가 끝날 때(타이머가 멈출 때)마다 한 번씩 불린다. 돌려받은 함수를 부르면 그만 듣는다. */
  onSolve(listener: (result: SolveResult) => void): () => void {
    this.solveListeners.add(listener);
    return () => this.solveListeners.delete(listener);
  }

  private set(next: FreeSnapshot): void {
    this.snap = next;
    for (const l of this.listeners) l();
  }

  move(move: Move, now = performance.now()): void {
    const s = this.snap;
    const cube = applyMove(s.cube, move);
    const history = [...s.history, move];
    let timer = startIfInspectionOver(s.timer, now);
    if (timer.status === 'ready' && !isRotation(move)) timer = { status: 'running', startedAt: now };
    let solved: SolveResult | null = null;
    if (timer.status === 'running' && isSolved(cube)) {
      timer = { status: 'done', elapsed: now - timer.startedAt };
      solved = { ms: timer.elapsed, turns: countTurns(history), scramble: s.scramble ?? [], hintUsed: s.hintUsed };
    }
    this.set({ ...s, cube, history, redo: [], timer });
    // 타이머는 이미 'done'이라, 그 뒤에 되돌리거나 더 돌려도 다시 알리지 않는다.
    if (solved) for (const l of this.solveListeners) l(solved);
  }

  /** 마지막 회전을 취소한다. 화면에 보여 줄 회전(역동작)을 돌려준다. */
  undo(): Move | null {
    const s = this.snap;
    const last = s.history.at(-1);
    if (!last) return null;
    const inverse = invertMove(last);
    this.set({ ...s, cube: applyMove(s.cube, inverse), history: s.history.slice(0, -1), redo: [...s.redo, last] });
    return inverse;
  }

  redo(): Move | null {
    const s = this.snap;
    const move = s.redo.at(-1);
    if (!move) return null;
    this.set({ ...s, cube: applyMove(s.cube, move), history: [...s.history, move], redo: s.redo.slice(0, -1) });
    return move;
  }

  /** 완성 상태에서 이 스크램블을 적용한 상태로 새로 시작한다. */
  scramble(moves: readonly Move[], options: ScrambleOptions = {}): void {
    const timer: TimerState =
      options.inspectMs === undefined
        ? { status: 'ready' }
        : { status: 'ready', inspectUntil: (options.inspectFrom ?? performance.now()) + options.inspectMs };
    this.set({ cube: applyMoves(SOLVED, moves), history: [], redo: [], scramble: moves, timer, hintUsed: false });
  }

  /** 힌트의 "이 동작 하기"를 썼다고 적어 둔다. 다시 섞거나 초기화할 때까지 남는다. */
  markHintUsed(): void {
    if (!this.snap.hintUsed) this.set({ ...this.snap, hintUsed: true });
  }

  /** 관찰 시간이 끝났으면 타이머를 시작한다. 화면이 남은 시간을 셀 때 부른다. */
  tick = (now = performance.now()): void => {
    const timer = startIfInspectionOver(this.snap.timer, now);
    if (timer !== this.snap.timer) this.set({ ...this.snap, timer });
  };

  reset(): void {
    this.set(INITIAL);
  }
}

/** 관찰 시간이 지났으면, 끝난 그 순간부터 타이머가 돌고 있던 것으로 한다. */
function startIfInspectionOver(timer: TimerState, now: number): TimerState {
  if (timer.status === 'ready' && timer.inspectUntil !== undefined && now >= timer.inspectUntil) {
    return { status: 'running', startedAt: timer.inspectUntil };
  }
  return timer;
}

/** 큐브 전체 회전(x, y, z)을 뺀 회전 수 */
export function countTurns(history: readonly Move[]): number {
  return history.reduce((n, m) => n + (isRotation(m) ? 0 : 1), 0);
}
