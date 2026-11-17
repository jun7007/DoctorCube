import { describe, expect, it } from 'vitest';
import { SOLVED, isSolved, type Move } from '../../core/cube';
import { invertAlg, parseAlg } from '../../core/notation';
import { FreeSession, countTurns, type SolveResult } from './session';

const SCRAMBLE = parseAlg("R U2 F' L D");
const SOLUTION = invertAlg(SCRAMBLE);

/** 풀이 결과를 모아 두는 세션 */
function setup() {
  const session = new FreeSession();
  const results: SolveResult[] = [];
  session.onSolve((r) => results.push(r));
  return { session, results, status: () => session.getSnapshot().timer.status };
}

/** 주어진 시각부터 100ms 간격으로 돌린다. 마지막 회전의 시각을 돌려준다. */
function play(session: FreeSession, moves: readonly Move[], from: number): number {
  let now = from;
  moves.forEach((m, i) => {
    now = from + i * 100;
    session.move(m, now);
  });
  return now;
}

describe('타이머', () => {
  it('처음에는 연습 상태이고, 돌려도 타이머가 돌지 않는다', () => {
    const { session, results, status } = setup();
    expect(status()).toBe('idle');
    play(session, parseAlg("R R'"), 0);
    expect(status()).toBe('idle');
    expect(isSolved(session.getSnapshot().cube)).toBe(true);
    expect(results).toEqual([]);
  });

  it('섞으면 준비, 첫 회전에 시작, 다 맞추면 멈춘다', () => {
    const { session, status } = setup();
    session.scramble(SCRAMBLE);
    expect(status()).toBe('ready');
    expect(isSolved(session.getSnapshot().cube)).toBe(false);

    session.move(SOLUTION[0], 1000);
    expect(session.getSnapshot().timer).toEqual({ status: 'running', startedAt: 1000 });

    play(session, SOLUTION.slice(1), 1100);
    expect(session.getSnapshot().timer).toEqual({ status: 'done', elapsed: 400 });
    expect(session.getSnapshot().cube).toEqual(SOLVED);
  });

  it('큐브 전체 회전(x y z)으로는 타이머가 시작되지 않는다', () => {
    const { session, status } = setup();
    session.scramble(SCRAMBLE);
    session.move({ base: 'y', amount: 1 }, 500);
    session.move({ base: 'x', amount: -1 }, 600);
    expect(status()).toBe('ready');
    session.move({ base: 'R', amount: 1 }, 700);
    expect(session.getSnapshot().timer).toEqual({ status: 'running', startedAt: 700 });
  });

  it('초기화하면 연습 상태로 돌아간다', () => {
    const { session, results, status } = setup();
    session.scramble(SCRAMBLE);
    session.move(SOLUTION[0], 0);
    session.reset();
    expect(status()).toBe('idle');
    expect(session.getSnapshot().cube).toEqual(SOLVED);
    expect(session.getSnapshot().scramble).toBeNull();
    expect(results).toEqual([]);
  });

  it('푸는 중에 다시 섞으면 기록 없이 준비 상태가 된다', () => {
    const { session, results, status } = setup();
    session.scramble(SCRAMBLE);
    session.move(SOLUTION[0], 0);
    session.scramble(parseAlg('F U'));
    expect(status()).toBe('ready');
    expect(session.getSnapshot().history).toEqual([]);
    expect(results).toEqual([]);
  });
});

describe('풀이 알림', () => {
  it('다 맞춘 순간 한 번만 알린다', () => {
    const { session, results } = setup();
    session.scramble(SCRAMBLE);
    play(session, SOLUTION.slice(0, -1), 2000);
    expect(results).toEqual([]);
    session.move(SOLUTION.at(-1)!, 14340);
    expect(results).toEqual([{ ms: 12340, turns: SOLUTION.length, scramble: SCRAMBLE, hintUsed: false }]);
  });

  it('큐브 전체 회전은 회전 수에 넣지 않는다', () => {
    const { session, results } = setup();
    session.scramble(SCRAMBLE);
    session.move({ base: 'y', amount: 1 }, 0);
    session.move({ base: 'y', amount: -1 }, 10);
    play(session, SOLUTION, 100);
    expect(results).toHaveLength(1);
    expect(results[0].turns).toBe(SOLUTION.length);
    expect(countTurns(session.getSnapshot().history)).toBe(SOLUTION.length);
  });

  it('완성 뒤에 되돌리고 다시 실행해도 두 번째 알림은 없다', () => {
    const { session, results, status } = setup();
    session.scramble(SCRAMBLE);
    play(session, SOLUTION, 0);
    expect(results).toHaveLength(1);

    session.undo();
    expect(isSolved(session.getSnapshot().cube)).toBe(false);
    expect(status()).toBe('done');
    session.redo();
    expect(isSolved(session.getSnapshot().cube)).toBe(true);
    expect(results).toHaveLength(1);
  });

  it('완성 뒤에 되돌리고 같은 회전을 다시 해도 두 번째 알림은 없다', () => {
    const { session, results } = setup();
    session.scramble(SCRAMBLE);
    const end = play(session, SOLUTION, 0);
    session.undo();
    session.move(SOLUTION.at(-1)!, end + 5000);
    expect(isSolved(session.getSnapshot().cube)).toBe(true);
    // 타이머는 처음 맞춘 시간에 멈춰 있다
    expect(session.getSnapshot().timer).toEqual({ status: 'done', elapsed: end });
    expect(results).toHaveLength(1);
  });

  it('완성 뒤에 더 돌렸다가 다시 맞춰도 알리지 않는다', () => {
    const { session, results } = setup();
    session.scramble(SCRAMBLE);
    play(session, SOLUTION, 0);
    play(session, parseAlg("R U R' U' U R U' R'"), 10000);
    expect(isSolved(session.getSnapshot().cube)).toBe(true);
    expect(results).toHaveLength(1);
  });

  it('푸는 중에 되돌려도 타이머는 계속 돌고, 맞추면 한 번 알린다', () => {
    const { session, results, status } = setup();
    session.scramble(SCRAMBLE);
    session.move({ base: 'B', amount: 1 }, 100); // 잘못 돌림 (여기서 타이머 시작)
    session.undo();
    expect(status()).toBe('running');
    const end = play(session, SOLUTION, 200);
    expect(results).toHaveLength(1);
    expect(results[0].ms).toBe(end - 100);
    expect(results[0].turns).toBe(SOLUTION.length);
  });

  it('새로 섞어서 또 맞추면 또 알린다', () => {
    const { session, results } = setup();
    session.scramble(SCRAMBLE);
    play(session, SOLUTION, 0);
    const second = parseAlg("F R U'");
    session.scramble(second);
    play(session, invertAlg(second), 5000);
    expect(results.map((r) => r.scramble)).toEqual([SCRAMBLE, second]);
    expect(results[1]).toMatchObject({ ms: 200, turns: 3 });
  });

  it('듣기를 그만두면 알림이 오지 않는다', () => {
    const session = new FreeSession();
    const results: SolveResult[] = [];
    const stop = session.onSolve((r) => results.push(r));
    stop();
    session.scramble(SCRAMBLE);
    play(session, SOLUTION, 0);
    expect(results).toEqual([]);
  });
});

describe('힌트 사용 표시', () => {
  it('힌트를 쓰면 그 풀이에 표시된다', () => {
    const { session, results } = setup();
    session.scramble(SCRAMBLE);
    session.move(SOLUTION[0], 0);
    session.markHintUsed();
    expect(session.getSnapshot().hintUsed).toBe(true);
    play(session, SOLUTION.slice(1), 100);
    expect(results).toHaveLength(1);
    expect(results[0].hintUsed).toBe(true);
  });

  it('새로 섞으면 표시가 지워진다', () => {
    const { session, results } = setup();
    session.scramble(SCRAMBLE);
    session.markHintUsed();
    play(session, SOLUTION, 0);
    expect(results[0].hintUsed).toBe(true);

    session.scramble(SCRAMBLE);
    expect(session.getSnapshot().hintUsed).toBe(false);
    play(session, SOLUTION, 5000);
    expect(results[1].hintUsed).toBe(false);
  });

  it('연습 중에 쓴 힌트는 다음 풀이에 남지 않는다', () => {
    const { session, results } = setup();
    session.markHintUsed();
    session.scramble(SCRAMBLE);
    play(session, SOLUTION, 0);
    expect(results[0].hintUsed).toBe(false);
  });

  it('초기화해도 표시가 지워진다', () => {
    const { session } = setup();
    session.scramble(SCRAMBLE);
    session.markHintUsed();
    session.reset();
    expect(session.getSnapshot().hintUsed).toBe(false);
  });

  it('되돌려도 표시는 남는다', () => {
    const { session } = setup();
    session.scramble(SCRAMBLE);
    session.markHintUsed();
    session.move(SOLUTION[0], 0);
    session.undo();
    expect(session.getSnapshot().hintUsed).toBe(true);
  });
});

describe('관찰 시간', () => {
  const inspect = { inspectMs: 15000, inspectFrom: 1000 };

  it('섞으면 준비 상태에 끝나는 시각이 적힌다', () => {
    const { session } = setup();
    session.scramble(SCRAMBLE, inspect);
    expect(session.getSnapshot().timer).toEqual({ status: 'ready', inspectUntil: 16000 });
  });

  it('관찰 시간을 주지 않으면 끝나는 시각이 없고, 시간이 지나도 시작되지 않는다', () => {
    const { session, status } = setup();
    session.scramble(SCRAMBLE);
    expect(session.getSnapshot().timer).toEqual({ status: 'ready' });
    session.tick(999999);
    expect(status()).toBe('ready');
  });

  it('관찰 중에 첫 회전을 하면 그 순간 타이머가 시작된다', () => {
    const { session } = setup();
    session.scramble(SCRAMBLE, inspect);
    session.tick(5000);
    expect(session.getSnapshot().timer.status).toBe('ready');
    session.move(SOLUTION[0], 6000);
    expect(session.getSnapshot().timer).toEqual({ status: 'running', startedAt: 6000 });
  });

  it('관찰 중 큐브 전체 회전은 타이머를 시작하지 않는다', () => {
    const { session, status } = setup();
    session.scramble(SCRAMBLE, inspect);
    session.move({ base: 'x', amount: 1 }, 3000);
    expect(status()).toBe('ready');
  });

  it('관찰 시간이 끝나면 저절로 시작된다', () => {
    const { session } = setup();
    session.scramble(SCRAMBLE, inspect);
    session.tick(15999);
    expect(session.getSnapshot().timer.status).toBe('ready');
    session.tick(16040);
    // 화면이 조금 늦게 알아채도 끝난 그 순간부터 잰다
    expect(session.getSnapshot().timer).toEqual({ status: 'running', startedAt: 16000 });
  });

  it('끝난 뒤에 첫 회전을 해도 관찰이 끝난 순간부터 잰다', () => {
    const { session, results } = setup();
    session.scramble(SCRAMBLE, inspect);
    session.move({ base: 'y', amount: 1 }, 20000); // 전체 회전이어도 이미 시작된 것으로 본다
    expect(session.getSnapshot().timer).toEqual({ status: 'running', startedAt: 16000 });
    session.move({ base: 'y', amount: -1 }, 20100);
    const end = play(session, SOLUTION, 21000);
    expect(results).toHaveLength(1);
    expect(results[0].ms).toBe(end - 16000);
  });

  it('바뀐 것이 없으면 tick은 화면을 다시 그리게 하지 않는다', () => {
    const { session } = setup();
    let calls = 0;
    session.subscribe(() => calls++);
    session.scramble(SCRAMBLE, inspect);
    calls = 0;
    session.tick(2000);
    session.tick(3000);
    expect(calls).toBe(0);
    session.tick(16000);
    session.tick(17000);
    expect(calls).toBe(1);
  });

  it('tick은 떼어서 불러도 된다 (화면이 콜백으로 넘긴다)', () => {
    const { session, status } = setup();
    session.scramble(SCRAMBLE, inspect);
    const { tick } = session;
    tick(16000);
    expect(status()).toBe('running');
  });
});
