import { describe, expect, it } from 'vitest';
import { FACELETS, SOLVED, applyMove, applyMoves, type CubeState, type Move } from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { parseAlg } from '../core/notation';
import { generateScramble } from '../core/scramble';
import { crossSolved, solveCross } from './cross';

/** 재현 가능한 난수 */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACE_BASES = ['U', 'D', 'L', 'R', 'F', 'B'] as const;
const FACE_TURNS: readonly Move[] = FACE_BASES.flatMap((base) =>
  ([1, -1, 2] as const).map((amount) => ({ base, amount })),
);

const isFaceTurn = (m: Move) =>
  (FACE_BASES as readonly string[]).includes(m.base) && [1, -1, 2].includes(m.amount);

const dbCount = (moves: readonly Move[]) => moves.filter((m) => m.base === 'D' || m.base === 'B').length;

function scrambles(seed: number, count: number): CubeState[] {
  const random = rng(seed);
  return Array.from({ length: count }, () => applyMoves(YELLOW_UP, generateScramble(25, random)));
}

// ───────── 풀이기와 무관한 검산용 탐색 (스티커 54칸 모델 그대로) ─────────

const EDGE_CELLS = FACELETS.flatMap((f, i) => (f.pos.filter((v) => v === 0).length === 1 ? [i] : []));
const EDGE_PARTNER = new Map(
  EDGE_CELLS.map((i) => [
    i,
    EDGE_CELLS.find((j) => j !== i && FACELETS[j].pos.join() === FACELETS[i].pos.join())!,
  ]),
);

/** 흰색 엣지 네 개의 스티커만 남긴 열쇠. 나머지 칸은 '.' */
function crossKey(s: CubeState): string {
  let key = '';
  for (const i of EDGE_CELLS) key += s[i] === 0 || s[EDGE_PARTNER.get(i)!] === 0 ? s[i] : '.';
  return key;
}

const BACK_DEPTH = 4;
const FRONT_DEPTH = 3;
let backTable: Map<string, number> | null = null;

/** 완성된 십자에서 BACK_DEPTH번 안에 닿는 상태와 그 거리 */
function nearSolved(): Map<string, number> {
  if (backTable) return backTable;
  const seen = new Map<string, number>([[crossKey(YELLOW_UP), 0]]);
  let layer: CubeState[] = [YELLOW_UP];
  for (let d = 1; d <= BACK_DEPTH; d++) {
    const next: CubeState[] = [];
    for (const s of layer) {
      for (const m of FACE_TURNS) {
        const t = applyMove(s, m);
        const key = crossKey(t);
        if (seen.has(key)) continue;
        seen.set(key, d);
        next.push(t);
      }
    }
    layer = next;
  }
  return (backTable = seen);
}

/**
 * 양쪽에서 만나는 탐색으로 구한 최단 길이.
 * 앞에서 FRONT_DEPTH번, 뒤에서 BACK_DEPTH번까지 보므로 7 이하는 정확하고, 그보다 길면 Infinity.
 */
function bruteForceLength(start: CubeState): number {
  const back = nearSolved();
  let best = back.get(crossKey(start)) ?? Infinity;
  const walk = (s: CubeState, depth: number, last: string): void => {
    for (const m of FACE_TURNS) {
      if (m.base === last) continue;
      const t = applyMove(s, m);
      const b = back.get(crossKey(t));
      if (b !== undefined) best = Math.min(best, depth + 1 + b);
      if (depth + 1 < FRONT_DEPTH) walk(t, depth + 1, m.base);
    }
  };
  walk(start, 0, '');
  return best;
}

/**
 * 길이가 length(최단, 7 이하)인 풀이를 모두 훑어 D, B 동작이 가장 적은 것의 개수를 구한다.
 * 남은 회전이 BACK_DEPTH 이하가 되면 뒤쪽 표로 가망 없는 길을 버린다.
 */
function fewestAwkward(start: CubeState, length: number): number {
  const back = nearSolved();
  let best = Infinity;
  const walk = (s: CubeState, depth: number, last: string, cost: number): void => {
    const left = length - depth;
    if (left <= BACK_DEPTH) {
      const b = back.get(crossKey(s));
      if (b === undefined || b > left) return;
    }
    if (left === 0) {
      best = Math.min(best, cost);
      return;
    }
    for (const m of FACE_TURNS) {
      if (m.base === last) continue;
      walk(applyMove(s, m), depth + 1, m.base, cost + dbCount([m]));
    }
  };
  walk(start, 0, '', 0);
  return best;
}

describe('흰색 십자 최단 풀이기', () => {
  it('거리표를 금방 만든다', () => {
    const t0 = performance.now();
    expect(solveCross(YELLOW_UP)).toEqual([]);
    const ms = performance.now() - t0;
    console.log(`거리표 만들기 ${ms.toFixed(0)}ms`);
    expect(ms).toBeLessThan(2000);
  });

  it('무작위로 섞은 큐브 1000개의 십자를 8회전 안에 맞춘다', () => {
    let total = 0;
    let worst = 0;
    let awkward = 0;
    const histogram = new Array<number>(9).fill(0);
    scrambles(11, 1000).forEach((start, i) => {
      const moves = solveCross(start);
      expect(moves.every(isFaceTurn), `scramble #${i}`).toBe(true);
      expect(crossSolved(applyMoves(start, moves)), `scramble #${i}`).toBe(true);
      expect(moves.length, `scramble #${i}`).toBeLessThanOrEqual(8);
      total += moves.length;
      worst = Math.max(worst, moves.length);
      awkward += dbCount(moves);
      histogram[moves.length]++;
    });
    const average = total / 1000;
    console.log(
      `평균 ${average.toFixed(3)}회전, 최대 ${worst}회전, D·B 평균 ${(awkward / 1000).toFixed(3)}회 / 길이별 ${histogram.join(' ')}`,
    );
    expect(average).toBeGreaterThan(5.3);
    expect(average).toBeLessThan(6.3);
  });

  it('더 짧은 풀이가 없다 (스티커 모델에서 따로 탐색해 100개 검산)', () => {
    scrambles(11, 100).forEach((start, i) => {
      const length = solveCross(start).length;
      const exact = bruteForceLength(start);
      // 검산 탐색은 7회전까지만 본다. 못 찾았다면 8회전이 최단이다.
      expect(length, `scramble #${i}`).toBe(Number.isFinite(exact) ? exact : 8);
    });
  });

  it('옆면 센터가 돌아가 있어도 맞춘다', () => {
    scrambles(29, 60).forEach((base, i) => {
      const length = solveCross(base).length;
      for (const alg of ['y', 'y2', "y'"]) {
        const start = applyMoves(base, parseAlg(alg));
        const moves = solveCross(start);
        expect(moves.every(isFaceTurn)).toBe(true);
        expect(crossSolved(applyMoves(start, moves)), `scramble #${i} ${alg}`).toBe(true);
        // 큐브를 통째로 돌린 것뿐이라 최단 길이는 같다.
        expect(moves.length, `scramble #${i} ${alg}`).toBe(length);
      }
      // 가운데 층만 돌리면 센터와 엣지의 짝이 달라진다.
      for (const alg of ['E', 'E2', "E'"]) {
        const start = applyMoves(base, parseAlg(alg));
        const moves = solveCross(start);
        expect(crossSolved(applyMoves(start, moves)), `scramble #${i} ${alg}`).toBe(true);
        expect(moves.length).toBeLessThanOrEqual(8);
      }
    });
  });

  it('이미 맞춰진 십자는 할 일이 없다', () => {
    expect(crossSolved(YELLOW_UP)).toBe(true);
    expect(solveCross(YELLOW_UP)).toEqual([]);
    for (const alg of ['y', "U R U' R'", "y' U2", 'E']) {
      const state = applyMoves(YELLOW_UP, parseAlg(alg));
      expect(crossSolved(state), alg).toBe(alg !== 'E');
    }
    expect(solveCross(applyMoves(YELLOW_UP, parseAlg("y R U R' U'")))).toEqual([]);
    expect(crossSolved(applyMoves(YELLOW_UP, parseAlg('F')))).toBe(false);
    expect(solveCross(applyMoves(YELLOW_UP, parseAlg('F')))).toEqual(parseAlg("F'"));
  });

  it('흰색 센터가 아래에 없거나 흰색 엣지가 모자라면 오류', () => {
    expect(crossSolved(SOLVED)).toBe(false);
    expect(() => solveCross(SOLVED)).toThrow('흰색 센터');
    expect(() => solveCross(applyMoves(YELLOW_UP, parseAlg('x')))).toThrow('흰색 센터');
    // DF 엣지의 흰색 스티커를 노란색으로 바꿈
    const bad = [...YELLOW_UP];
    bad[EDGE_CELLS.find((i) => bad[i] === 0)!] = 3;
    expect(() => solveCross(bad)).toThrow('흰색 엣지');
  });

  it('같은 길이의 풀이 중 D, B를 가장 적게 쓰는 것을 고른다 (100개 검산)', () => {
    // 길이가 먼저다: 한 번에 끝나면 D나 B라도 그대로 쓴다.
    expect(solveCross(applyMoves(YELLOW_UP, parseAlg('D')))).toEqual(parseAlg("D'"));
    expect(solveCross(applyMoves(YELLOW_UP, parseAlg('B2')))).toEqual(parseAlg('B2'));
    let checked = 0;
    scrambles(11, 100).forEach((start, i) => {
      const moves = solveCross(start);
      if (moves.length > FRONT_DEPTH + BACK_DEPTH) return;
      expect(dbCount(moves), `scramble #${i}`).toBe(fewestAwkward(start, moves.length));
      checked++;
    });
    expect(checked).toBeGreaterThan(90);
  });

  it('1000번 푸는 데 2초가 안 걸린다', () => {
    const starts = scrambles(41, 1000);
    solveCross(starts[0]);
    const t0 = performance.now();
    for (const start of starts) solveCross(start);
    const ms = performance.now() - t0;
    console.log(`1000번 풀이 ${ms.toFixed(1)}ms (한 번에 ${(ms / 1000).toFixed(4)}ms)`);
    expect(ms).toBeLessThan(2000);
  });
});
