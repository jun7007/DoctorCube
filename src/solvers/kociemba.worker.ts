/**
 * Kociemba 풀이기를 화면과 다른 스레드에서 돌린다.
 * 처음 한 번 표를 만드는 데 시간이 걸려서, 화면이 멈추지 않도록 따로 돌린다.
 *
 * 요청은 두 가지다.
 * - 풀이: `{ id, state }` → 그 상태의 최단 풀이
 * - 섞기: `{ id, kind: 'scramble' }` → 무작위 "상태" 스크램블
 */
import type { CubeState, Move } from '../core/cube';
import { randomStateScramble, solveKociemba } from './kociemba';

export interface ShortestRequest {
  id: number;
  kind?: 'solve';
  state: CubeState;
}

export interface ScrambleRequest {
  id: number;
  kind: 'scramble';
}

export type WorkerRequest = ShortestRequest | ScrambleRequest;

export type ShortestResponse = { id: number; moves: Move[] } | { id: number; error: string };

const scope = self as unknown as {
  addEventListener(type: 'message', listener: (e: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: ShortestResponse): void;
};

scope.addEventListener('message', (e) => {
  const request = e.data;
  try {
    const moves = request.kind === 'scramble' ? randomStateScramble() : solveKociemba(request.state);
    scope.postMessage({ id: request.id, moves });
  } catch (err) {
    scope.postMessage({ id: request.id, error: err instanceof Error ? err.message : String(err) });
  }
});
