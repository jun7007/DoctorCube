import type { CubeState, Move } from '../core/cube';
import type { ShortestRequest, ShortestResponse } from './kociemba.worker';

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (moves: Move[]) => void; reject: (err: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./kociemba.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent<ShortestResponse>) => {
      const entry = waiting.get(e.data.id);
      if (!entry) return;
      waiting.delete(e.data.id);
      if ('error' in e.data) entry.reject(new Error(e.data.error));
      else entry.resolve(e.data.moves);
    });
    worker.addEventListener('error', () => {
      for (const entry of waiting.values()) entry.reject(new Error('최단 풀이 계산에 실패했어요.'));
      waiting.clear();
      worker = null;
    });
  }
  return worker;
}

/** 가장 짧은 풀이(약 20수)를 다른 스레드에서 계산한다. 처음 한 번은 몇 초 걸릴 수 있다. */
export function solveShortest(state: CubeState): Promise<Move[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    const request: ShortestRequest = { id, state };
    getWorker().postMessage(request);
  });
}
