import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Move } from '../../core/cube';
import { parseAlg } from '../../core/notation';
import { Scrambler } from './scrambler';

const FALLBACK = parseAlg('F B F B');
const A = parseAlg("R U R'");
const B = parseAlg("L D L'");

/** 답을 원하는 때에 줄 수 있는 가짜 워커 */
function fakeWorker() {
  const calls: { resolve: (moves: Move[]) => void; reject: (err: Error) => void }[] = [];
  const request = () => new Promise<Move[]>((resolve, reject) => calls.push({ resolve, reject }));
  return { calls, request };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('Scrambler', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('미리 만들어 둔 것이 있으면 바로 꺼내고, 다음 것을 만들기 시작한다', async () => {
    const worker = fakeWorker();
    const s = new Scrambler({ request: worker.request, fallback: () => FALLBACK });
    s.prepare();
    s.prepare(); // 두 번 불러도 요청은 하나
    expect(worker.calls).toHaveLength(1);
    expect(s.takeReady()).toBeNull(); // 아직 준비 안 됨
    expect(worker.calls).toHaveLength(1);

    worker.calls[0].resolve(A);
    await flush();
    expect(s.takeReady()).toBe(A);
    expect(worker.calls).toHaveLength(2);
    expect(s.takeReady()).toBeNull();

    worker.calls[1].resolve(B);
    await flush();
    await expect(s.take()).resolves.toBe(B);
  });

  it('기다리는 동안 도착하면 그것을 쓴다', async () => {
    const worker = fakeWorker();
    const s = new Scrambler({ request: worker.request, fallback: () => FALLBACK, timeoutMs: 1500 });
    const taking = s.take();
    expect(worker.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    worker.calls[0].resolve(A);
    await expect(taking).resolves.toBe(A);
  });

  it('1.5초 안에 못 받으면 대신할 스크램블을 쓰고, 늦게 온 것은 다음에 쓴다', async () => {
    const worker = fakeWorker();
    const s = new Scrambler({ request: worker.request, fallback: () => FALLBACK });
    const got: Move[][] = [];
    void s.take().then((moves) => got.push(moves));
    await vi.advanceTimersByTimeAsync(1499);
    expect(got).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toEqual([FALLBACK]);

    // 늦게 도착: 이미 섞은 큐브를 또 섞지 않고(take가 한 번만 답한다) 보관만 한다
    worker.calls[0].resolve(A);
    await flush();
    expect(got).toEqual([FALLBACK]);
    expect(worker.calls).toHaveLength(1);
    expect(s.takeReady()).toBe(A);
  });

  it('워커가 실패하면 바로 대신할 스크램블을 쓰고, 다음에 다시 요청한다', async () => {
    const worker = fakeWorker();
    const s = new Scrambler({ request: worker.request, fallback: () => FALLBACK });
    const taking = s.take();
    worker.calls[0].reject(new Error('실패'));
    await expect(taking).resolves.toBe(FALLBACK);

    expect(s.takeReady()).toBeNull();
    expect(worker.calls).toHaveLength(2);
    worker.calls[1].resolve(A);
    await flush();
    expect(s.takeReady()).toBe(A);
  });

  it('워커를 만들 수 없어도 대신할 스크램블을 쓴다', async () => {
    const s = new Scrambler({
      request: () => {
        throw new Error('Worker 없음');
      },
      fallback: () => FALLBACK,
    });
    expect(() => s.prepare()).not.toThrow();
    await expect(s.take()).resolves.toBe(FALLBACK);
  });

  it('빈 스크램블은 쓰지 않는다', async () => {
    const worker = fakeWorker();
    const s = new Scrambler({ request: worker.request, fallback: () => FALLBACK });
    const taking = s.take();
    worker.calls[0].resolve([]);
    await expect(taking).resolves.toBe(FALLBACK);
  });
});
