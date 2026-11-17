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
  /** 섞은 뒤 첫 회전을 기다리는 중 */
  | { status: 'ready' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; elapsed: number };

export interface FreeSnapshot {
  readonly cube: CubeState;
  /** 섞기 이후 사용자가 돌린 기록 */
  readonly history: readonly Move[];
  readonly redo: readonly Move[];
  readonly scramble: readonly Move[] | null;
  readonly timer: TimerState;
}

const INITIAL: FreeSnapshot = { cube: SOLVED, history: [], redo: [], scramble: null, timer: { status: 'idle' } };

/**
 * 자유 모드의 상태. 모든 변경은 즉시(동기) 반영되므로
 * 버튼을 빠르게 연타해도 화면 애니메이션과 어긋나지 않는다.
 */
export class FreeSession {
  private snap: FreeSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): FreeSnapshot => this.snap;

  private set(next: FreeSnapshot): void {
    this.snap = next;
    for (const l of this.listeners) l();
  }

  move(move: Move, now = performance.now()): void {
    const s = this.snap;
    const cube = applyMove(s.cube, move);
    let timer = s.timer;
    if (timer.status === 'ready' && !isRotation(move)) timer = { status: 'running', startedAt: now };
    if (timer.status === 'running' && isSolved(cube)) timer = { status: 'done', elapsed: now - timer.startedAt };
    this.set({ ...s, cube, history: [...s.history, move], redo: [], timer });
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
  scramble(moves: readonly Move[]): void {
    this.set({ cube: applyMoves(SOLVED, moves), history: [], redo: [], scramble: moves, timer: { status: 'ready' } });
  }

  reset(): void {
    this.set(INITIAL);
  }
}

/** 큐브 전체 회전(x, y, z)을 뺀 회전 수 */
export function countTurns(history: readonly Move[]): number {
  return history.reduce((n, m) => n + (isRotation(m) ? 0 : 1), 0);
}
