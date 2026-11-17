/**
 * 최단 풀이(Kociemba)를 화면과 다른 스레드에서 계산한다.
 * 처음 한 번 표를 만드는 데 시간이 걸려서, 화면이 멈추지 않도록 따로 돌린다.
 */
import type { CubeState, Move } from '../core/cube';
import { solveKociemba } from './kociemba';

export interface ShortestRequest {
  id: number;
  state: CubeState;
}

export type ShortestResponse = { id: number; moves: Move[] } | { id: number; error: string };

const scope = self as unknown as {
  addEventListener(type: 'message', listener: (e: MessageEvent<ShortestRequest>) => void): void;
  postMessage(message: ShortestResponse): void;
};

scope.addEventListener('message', (e) => {
  const { id, state } = e.data;
  try {
    scope.postMessage({ id, moves: solveKociemba(state) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
