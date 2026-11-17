import type { CubeState, Move } from '../core/cube';
import type { ShortestResponse, WorkerRequest } from './kociemba.worker';

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

/** 요청 하나를 보내고 답을 기다린다. 워커를 만들 수 없는 환경이면 거절된 약속을 돌려준다. */
function ask(request: (id: number) => WorkerRequest): Promise<Move[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    try {
      getWorker().postMessage(request(id));
    } catch (err) {
      waiting.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** 가장 짧은 풀이(약 20수)를 다른 스레드에서 계산한다. 처음 한 번은 몇 초 걸릴 수 있다. */
export function solveShortest(state: CubeState): Promise<Move[]> {
  return ask((id) => ({ id, state }));
}

/**
 * 무작위 "상태" 스크램블(WCA 방식)을 다른 스레드에서 만든다.
 * 완성 상태에 적용하면 모든 상태가 같은 확률로 나온다. 처음 한 번은 표를 만드느라 더 걸린다.
 */
export function randomScramble(): Promise<Move[]> {
  return ask((id) => ({ id, kind: 'scramble' }));
}
