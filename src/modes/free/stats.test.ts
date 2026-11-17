import { describe, expect, it } from 'vitest';
import {
  MAX_SOLVES,
  SOLVES_KEY,
  addSolve,
  aoN,
  bestAoN,
  bestOf,
  countedTimes,
  formatStat,
  formatTime,
  loadSolves,
  meanOf,
  parseSolves,
  removeSolve,
  saveSolves,
  summarize,
  type SolveRecord,
} from './stats';

const solve = (ms: number, extra: Partial<SolveRecord> = {}): SolveRecord => ({
  at: 1_700_000_000_000 + ms,
  ms,
  turns: 40,
  scramble: "R U R' U'",
  hint: false,
  ...extra,
});

/** 시각이 겹치지 않는 기록 목록 */
const solves = (...times: number[]): SolveRecord[] => times.map((ms, i) => solve(ms, { at: 1000 + i }));

/** localStorage 흉내 */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('시간 표시', () => {
  it('1분 미만은 12.34, 1분 이상은 1:02.34', () => {
    expect(formatTime(12340)).toBe('12.34');
    expect(formatTime(0)).toBe('0.00');
    expect(formatTime(950)).toBe('0.95');
    expect(formatTime(62340)).toBe('1:02.34');
    expect(formatTime(60000)).toBe('1:00.00');
    expect(formatTime(605010)).toBe('10:05.01');
  });

  it('1/100초 아래는 버린다 (59.999초가 60.00으로 보이지 않는다)', () => {
    expect(formatTime(12349.9)).toBe('12.34');
    expect(formatTime(59999)).toBe('59.99');
    expect(formatTime(-5)).toBe('0.00');
  });

  it('값이 없으면 "-"', () => {
    expect(formatStat(null)).toBe('-');
    expect(formatStat(12340)).toBe('12.34');
  });
});

describe('aoN', () => {
  it('ao5: 최근 5번에서 가장 빠른 것과 느린 것을 빼고 평균한다', () => {
    // 10, 20, 30, 40, 90초 → 10과 90을 빼고 (20+30+40)/3 = 30초
    expect(aoN([20000, 90000, 10000, 40000, 30000], 5)).toBe(30000);
  });

  it('ao5: 5번보다 많으면 마지막 5번만 본다', () => {
    expect(aoN([1000, 1000, 20000, 90000, 10000, 40000, 30000], 5)).toBe(30000);
  });

  it('ao5: 5번이 안 되면 null', () => {
    expect(aoN([], 5)).toBeNull();
    expect(aoN([10000, 20000, 30000, 40000], 5)).toBeNull();
  });

  it('ao5: 같은 시간이 여럿이어도 하나씩만 뺀다', () => {
    expect(aoN([10000, 10000, 10000, 10000, 10000], 5)).toBe(10000);
    expect(aoN([10000, 10000, 20000, 30000, 30000], 5)).toBe(20000);
  });

  it('ao5: 1/100초로 반올림한다', () => {
    // (10.00 + 10.00 + 10.01) / 3 = 10.0033… → 10.00
    expect(aoN([5000, 10000, 10000, 10010, 99000], 5)).toBe(10000);
    // (10.00 + 10.01 + 10.01) / 3 = 10.0066… → 10.01
    expect(aoN([5000, 10000, 10010, 10010, 99000], 5)).toBe(10010);
  });

  it('ao12: 최근 12번에서 가장 빠른 것과 느린 것을 빼고 10개를 평균한다', () => {
    const times = [1000, 99000, ...Array.from({ length: 10 }, (_, i) => 10000 + i * 1000)];
    // 10~19초 열 개의 평균 = 14.5초
    expect(aoN(times, 12)).toBe(14500);
    // 앞에 하나 더 있으면 최근 12번만: 1초가 빠지고 0.5초가 들어온 것과 같다
    expect(aoN([500, ...times], 12)).toBe(14500);
  });

  it('ao12: 12번이 안 되면 null', () => {
    expect(aoN(Array.from({ length: 11 }, () => 10000), 12)).toBeNull();
  });

  it('최고 ao5: 연속한 5번 묶음 중 가장 좋은 것', () => {
    // [30,30,10,10,10] → (30+10+10)/3 = 16.67 이 가장 좋다
    const times = [30000, 30000, 30000, 30000, 30000, 10000, 10000, 10000, 50000, 50000, 50000];
    expect(bestAoN(times, 5)).toBe(16670);
    expect(aoN(times, 5)).toBe(36670); // 지금 ao5: [10,10,50,50,50] → (10+50+50)/3
    expect(bestAoN([10000, 20000, 30000, 40000], 5)).toBeNull();
  });
});

describe('최고와 평균', () => {
  it('최고는 가장 짧은 시간, 평균은 모두의 평균', () => {
    expect(bestOf([30000, 12340, 20000])).toBe(12340);
    expect(meanOf([10000, 20000, 40000])).toBe(23330);
    expect(bestOf([])).toBeNull();
    expect(meanOf([])).toBeNull();
  });

  it('통계는 1/100초 아래를 버린 시간으로 계산한다', () => {
    expect(countedTimes([solve(12349), solve(9999)])).toEqual([12340, 9990]);
  });
});

describe('힌트를 쓴 풀이', () => {
  it('최고·평균·ao5에서 빠진다', () => {
    const list = [
      ...solves(20000, 30000, 40000, 50000),
      solve(1000, { at: 1, hint: true }), // 힌트로 1초 만에 끝낸 풀이
      solve(60000, { at: 2 }),
    ];
    const stats = summarize(list);
    expect(stats.count).toBe(6);
    expect(stats.hinted).toBe(1);
    expect(stats.best).toBe(20000);
    expect(stats.mean).toBe(40000);
    // 힌트 풀이를 뺀 다섯 번: 20, 30, 40, 50, 60 → 40
    expect(stats.ao5).toBe(40000);
    expect(stats.bestAo5).toBe(40000);
    expect(stats.ao12).toBeNull();
  });

  it('힌트 풀이는 ao5에 필요한 5번에도 들어가지 않는다', () => {
    const list = [...solves(20000, 30000, 40000, 50000), solve(1000, { at: 1, hint: true })];
    expect(summarize(list).ao5).toBeNull();
  });

  it('힌트 풀이는 ao12에서도 빠진다', () => {
    const twelve = solves(...Array.from({ length: 12 }, (_, i) => 10000 + i * 1000));
    expect(summarize(twelve).ao12).toBe(15500);
    const withHint = twelve.map((s, i) => (i === 3 ? { ...s, hint: true } : s));
    expect(summarize(withHint).ao12).toBeNull();
    // 하나 더 풀면 다시 12번이 된다: 10초와 22초를 빼고 11, 12, 14~21초 열 개의 평균
    const again = [...withHint, solve(22000, { at: 5 })];
    expect(summarize(again).ao12).toBe(16300);
  });

  it('힌트 풀이뿐이면 통계는 모두 비어 있다', () => {
    const stats = summarize([solve(5000, { hint: true })]);
    expect(stats).toEqual({ count: 1, hinted: 1, best: null, mean: null, ao5: null, ao12: null, bestAo5: null });
  });

  it('기록이 없을 때', () => {
    expect(summarize([])).toEqual({ count: 0, hinted: 0, best: null, mean: null, ao5: null, ao12: null, bestAo5: null });
  });
});

describe('기록 더하기와 지우기', () => {
  it('맨 뒤에 붙는다', () => {
    const list = addSolve(solves(10000), solve(20000, { at: 5000 }));
    expect(list.map((s) => s.ms)).toEqual([10000, 20000]);
  });

  it('최근 200개만 남긴다', () => {
    let list: SolveRecord[] = [];
    for (let i = 0; i < MAX_SOLVES + 5; i++) list = addSolve(list, solve(1000 + i, { at: i }));
    expect(MAX_SOLVES).toBe(200);
    expect(list).toHaveLength(200);
    expect(list[0].ms).toBe(1005); // 오래된 5개가 빠졌다
    expect(list.at(-1)?.ms).toBe(1204);
  });

  it('시각이 겹치면 다르게 만들어서 하나씩 지울 수 있다', () => {
    let list = addSolve([], solve(10000, { at: 777 }));
    list = addSolve(list, solve(20000, { at: 777 }));
    expect(new Set(list.map((s) => s.at)).size).toBe(2);
    list = removeSolve(list, list[1].at);
    expect(list.map((s) => s.ms)).toEqual([10000]);
  });

  it('지우면 그 기록만 사라지고 통계가 바뀐다', () => {
    const list = solves(20000, 90000, 10000, 40000, 30000);
    expect(summarize(list).ao5).toBe(30000);
    const after = removeSolve(list, list[2].at); // 10초 기록
    expect(after.map((s) => s.ms)).toEqual([20000, 90000, 40000, 30000]);
    expect(summarize(after).best).toBe(20000);
    expect(summarize(after).ao5).toBeNull();
    expect(list).toHaveLength(5); // 원래 목록은 그대로
  });

  it('없는 기록을 지우면 그대로', () => {
    const list = solves(10000, 20000);
    expect(removeSolve(list, 123456)).toEqual(list);
  });
});

describe('저장과 불러오기', () => {
  it('저장한 것을 그대로 불러온다', () => {
    const storage = fakeStorage();
    const list = [...solves(12340, 62340), solve(5000, { at: 9, hint: true, scramble: "F2 L' D" })];
    saveSolves(list, storage);
    expect(SOLVES_KEY).toBe('doctorcube.solves');
    expect(storage.data.has(SOLVES_KEY)).toBe(true);
    expect(loadSolves(storage)).toEqual(list);
  });

  it('저장된 것이 없으면 빈 목록', () => {
    expect(loadSolves(fakeStorage())).toEqual([]);
    expect(loadSolves(null)).toEqual([]);
  });

  it('깨진 내용이면 빈 목록', () => {
    for (const raw of ['{', 'null', '"abc"', '{"at":1}', '12', '', '[[]]', 'undefined']) {
      expect(loadSolves(fakeStorage({ [SOLVES_KEY]: raw }))).toEqual([]);
      expect(parseSolves(raw)).toEqual([]);
    }
  });

  it('목록 안의 깨진 기록만 버린다', () => {
    const good = solve(12340, { at: 1 });
    const raw = JSON.stringify([
      good,
      null,
      'x',
      { ...good, at: 2, ms: -1 },
      { ...good, at: 3, ms: 'fast' },
      { ...good, at: 4, turns: 1.5 },
      { ...good, at: 5, scramble: 7 },
      { ...good, at: 6, hint: 'yes' },
      { ...good, at: null },
      { at: 8, ms: 1000 },
      good, // 같은 시각이 두 번
      { ...good, at: 9, ms: 20000, extra: 'ignored' },
    ]);
    expect(parseSolves(raw)).toEqual([good, { ...good, at: 9, ms: 20000 }]);
  });

  it('200개보다 많이 저장돼 있으면 최근 200개만 불러온다', () => {
    const many = Array.from({ length: MAX_SOLVES + 30 }, (_, i) => solve(1000 + i, { at: i }));
    const loaded = parseSolves(JSON.stringify(many));
    expect(loaded).toHaveLength(MAX_SOLVES);
    expect(loaded[0].at).toBe(30);
  });

  it('저장소가 오류를 내도 멈추지 않는다', () => {
    const broken = {
      getItem: (): string => {
        throw new Error('막힘');
      },
      setItem: (): void => {
        throw new Error('가득 참');
      },
    };
    expect(loadSolves(broken)).toEqual([]);
    expect(() => saveSolves(solves(1000), broken)).not.toThrow();
  });
});
