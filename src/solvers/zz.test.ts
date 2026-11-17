import { describe, expect, it } from 'vitest';
import {
  FACELETS,
  SOLVED,
  applyMove,
  applyMoves,
  isRotation,
  isSolved,
  type BaseMove,
  type CubeState,
  type Move,
} from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { invertAlg, parseAlg } from '../core/notation';
import { generateScramble } from '../core/scramble';
import { stageMoves, type SolveStage } from './types';
import { ZZ_STAGE_ORDER, ZZ_STAGE_TITLES, solveZz, type ZzStageId } from './zz';

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────── 풀이기와 따로 쓴 확인 도구 ─────────
// 풀이기는 조각 좌표와 표로 따지지만, 여기서는 칸의 위치와 센터 색만 보고 따진다.

interface EdgeSpot {
  /** 윗층·아래층이면 위·아래를 보는 칸, 가운데층이면 앞·뒤를 보는 칸 */
  readonly key: number;
  readonly other: number;
}

/** 엣지 자리 12곳. 칸의 좌표에서 직접 뽑는다. */
const EDGE_SPOTS: readonly EdgeSpot[] = (() => {
  const spots = new Map<string, number[]>();
  FACELETS.forEach((f, i) => {
    if (f.pos.filter((v) => v === 0).length !== 1) return;
    const name = f.pos.join();
    spots.set(name, [...(spots.get(name) ?? []), i]);
  });
  return [...spots.values()].map(([a, b]) => {
    const [y, z] = [1, 2].map((axis) => [a, b].find((i) => FACELETS[i].normal[axis] !== 0));
    const key = y ?? z!;
    return { key, other: key === a ? b : a };
  });
})();

/** 색 → 그 색 센터가 있는 축 (0 왼쪽·오른쪽, 1 위·아래, 2 앞·뒤) */
function colorAxes(s: CubeState): number[] {
  const axes = new Array<number>(6).fill(-1);
  for (let f = 0; f < 6; f++) axes[s[f * 9 + 4]] = FACELETS[f * 9 + 4].normal.findIndex((v) => v !== 0);
  return axes;
}

/**
 * 나쁜 엣지의 수 (앞뒤 축 기준). 자리마다 key 칸의 색을 본다.
 * - 위·아래 센터 색이면 좋은 엣지
 * - 왼쪽·오른쪽 센터 색이면 나쁜 엣지
 * - 앞·뒤 센터 색이면 other 칸을 본다: 위·아래 센터 색이면 나쁜 엣지, 아니면 좋은 엣지
 */
function badEdges(s: CubeState): number {
  const axes = colorAxes(s);
  let bad = 0;
  for (const { key, other } of EDGE_SPOTS) {
    const axis = axes[s[key]];
    if (axis === 0 || (axis === 2 && axes[s[other]] === 1)) bad++;
  }
  return bad;
}

const cellsWhere = (test: (pos: readonly number[]) => boolean) => FACELETS.flatMap((f, i) => (test(f.pos) ? [i] : []));
/** 아래층 앞뒤 엣지 (아래 센터 포함) */
const LINE = cellsWhere(([x, y]) => x === 0 && y === -1);
const LEFT_BLOCK = cellsWhere(([x, y]) => x === -1 && y !== 1);
const TWO_LAYERS = cellsWhere(([, y]) => y !== 1);
const matches = (s: CubeState, cells: readonly number[]) => cells.every((i) => s[i] === YELLOW_UP[i]);
const YELLOW = 3;

const held = (s: CubeState) => s[3 * 9 + 4] === 0 && s[2 * 9 + 4] === 2; // 흰색 아래, 초록색 앞
const eoLineDone = (s: CubeState) => held(s) && badEdges(s) === 0 && matches(s, LINE);
const leftDone = (s: CubeState) => eoLineDone(s) && matches(s, LEFT_BLOCK);
const twoLayersDone = (s: CubeState) => matches(s, TWO_LAYERS);

const GOALS: Readonly<Record<ZzStageId, (s: CubeState) => boolean>> = {
  orient: held,
  eoline: eoLineDone,
  left: leftDone,
  right: (s) => twoLayersDone(s) && [1, 3, 5, 7].every((i) => s[i] === YELLOW),
  oll: (s) => twoLayersDone(s) && [0, 1, 2, 3, 4, 5, 6, 7, 8].every((i) => s[i] === YELLOW),
  pll: isSolved,
};

const ALLOWED: Readonly<Partial<Record<ZzStageId, string>>> = { left: 'RUL', right: 'RU' };

const turnCount = (moves: readonly Move[]) => moves.filter((m) => !isRotation(m)).length;

/** 단계 순서, 단계별 목표, 단계별로 쓸 수 있는 동작을 확인하고 끝 상태를 돌려준다. */
function check(start: CubeState, stages: SolveStage<ZzStageId>[], label: string): CubeState {
  expect(stages.map((s) => s.id), label).toEqual(ZZ_STAGE_ORDER);
  let state = start;
  for (const stage of stages) {
    const moves = stageMoves(stage);
    expect(stage.title, label).toBe(ZZ_STAGE_TITLES[stage.id]);
    expect(stage.steps.length, `${label} ${stage.id}`).toBeLessThanOrEqual(stage.id === 'pll' ? 2 : 1);
    for (const step of stage.steps) {
      expect(step.moves.length, `${label} ${stage.id}`).toBeGreaterThan(0);
      expect(step.note, `${label} ${stage.id}`).toMatch(/요( \(\d+수\))?\.$/);
    }
    // 처음 잡은 뒤로는 큐브를 돌려 잡지 않는다.
    expect(moves.every((m) => isRotation(m) === (stage.id === 'orient')), `${label} ${stage.id}`).toBe(true);
    const allowed = ALLOWED[stage.id];
    if (allowed) expect(moves.every((m) => allowed.includes(m.base)), `${label} ${stage.id}`).toBe(true);
    state = applyMoves(state, moves);
    expect(GOALS[stage.id](state), `${label} ${stage.id} 단계 뒤`).toBe(true);
  }
  expect(isSolved(state), label).toBe(true);
  return state;
}

const AMOUNTS = [1, -1, 2] as const;
const FACE_TURNS: readonly Move[] = (['U', 'D', 'L', 'R', 'F', 'B'] as BaseMove[]).flatMap((base) =>
  AMOUNTS.map((amount) => ({ base, amount })),
);

/** 칸 번호를 적어 둔 큐브 */
const LABELS: CubeState = FACELETS.map((_, i) => i);
/** 엣지 칸 24개만 따로 모은 것: 짝수 번째가 key 칸, 그다음이 같은 자리의 other 칸 */
const EDGE_CELLS: readonly number[] = EDGE_SPOTS.flatMap(({ key, other }) => [key, other]);
/** TURN_SOURCES[m][i] = m번 동작 뒤 i번 엣지 칸에 오는 스티커가 원래 있던 엣지 칸 */
const TURN_SOURCES: readonly (readonly number[])[] = FACE_TURNS.map((move) => {
  const after = applyMove(LABELS, move);
  return EDGE_CELLS.map((cell) => EDGE_CELLS.indexOf(after[cell]));
});
const LINE_SLOTS: readonly number[] = EDGE_CELLS.flatMap((cell, i) => (LINE.includes(cell) ? [i] : []));

/**
 * EO 라인을 depth수 안에 끝낼 수 있는지, 엣지 칸 24개의 색을 직접 돌려 가며 깊이 우선으로 찾는다.
 * 풀이기의 표는 쓰지 않는다. 가지치기는 둘뿐이다: 같은 면을 연달아 돌리지 않고,
 * 한 번 돌려 고칠 수 있는 나쁜 엣지는 많아야 4개다. (센터가 YELLOW_UP과 같은 상태에만 쓴다.)
 */
function eoLineWithin(start: CubeState, depth: number): boolean {
  const axes = colorAxes(start);
  const levels = Array.from({ length: depth + 1 }, () => new Uint8Array(24));
  EDGE_CELLS.forEach((cell, i) => {
    levels[0][i] = start[cell];
  });
  const visit = (level: number, lastBase: number): boolean => {
    const s = levels[level];
    let bad = 0;
    for (let i = 0; i < 24; i += 2) {
      const axis = axes[s[i]];
      if (axis === 0 || (axis === 2 && axes[s[i + 1]] === 1)) bad++;
    }
    if (bad === 0 && LINE_SLOTS.every((i) => s[i] === YELLOW_UP[EDGE_CELLS[i]])) return true;
    const left = depth - level;
    if (left === 0 || bad > 4 * left) return false;
    const next = levels[level + 1];
    for (let m = 0; m < FACE_TURNS.length; m++) {
      const base = (m / 3) | 0;
      if (base === lastBase) continue;
      const from = TURN_SOURCES[m];
      for (let i = 0; i < 24; i++) next[i] = s[from[i]];
      if (visit(level + 1, base)) return true;
    }
    return false;
  };
  return visit(0, -1);
}

describe('ZZ 풀이기', () => {
  it('무작위로 섞은 큐브 300개를 모두 풀고, 단계마다 목표를 이룬다', () => {
    // 첫 풀이에서 표를 만든다. 그 시간은 따로 잰다.
    const warmStart = performance.now();
    solveZz(applyMoves(SOLVED, parseAlg("R U F' L2 D B' M U2 r")));
    const warmUp = performance.now() - warmStart;

    const random = rng(12);
    let total = 0;
    let worst = 0;
    let time = 0;
    let slowest = 0;
    const sum: Record<string, number> = {};
    const max: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const start = applyMoves(SOLVED, generateScramble(25, random));
      const began = performance.now();
      const stages = solveZz(start);
      const elapsed = performance.now() - began;
      time += elapsed;
      slowest = Math.max(slowest, elapsed);

      check(start, stages, `scramble #${i}`);
      const count = turnCount(stages.flatMap(stageMoves));
      total += count;
      worst = Math.max(worst, count);
      for (const s of stages) {
        const n = turnCount(stageMoves(s));
        sum[s.id] = (sum[s.id] ?? 0) + n;
        max[s.id] = Math.max(max[s.id] ?? 0, n);
      }
    }
    const avg = total / 300;
    console.log(
      `ZZ: 평균 ${avg.toFixed(1)}회전, 최대 ${worst}회전 · ` +
        ZZ_STAGE_ORDER.map((id) => `${id} ${(sum[id] / 300).toFixed(2)} (최대 ${max[id]})`).join(', ') +
        ` · 풀이 시간 평균 ${(time / 300).toFixed(2)}ms, 최대 ${slowest.toFixed(1)}ms, 표 만들기 포함 첫 풀이 ${warmUp.toFixed(0)}ms`,
    );
    // 사람이 푸는 ZZ는 45~55회전 안팎.
    expect(avg).toBeLessThanOrEqual(60);
    // 가장 짧은 EO 라인의 평균은 6.1수쯤으로 알려져 있다.
    expect(sum.eoline / 300).toBeGreaterThan(5.9);
    expect(sum.eoline / 300).toBeLessThan(6.35);
    expect(max.eoline).toBeLessThanOrEqual(9);
    // 비교 화면을 열 때 메인 스레드에서 돌린다.
    expect(time / 300).toBeLessThanOrEqual(60);
    expect(slowest).toBeLessThanOrEqual(600);
    expect(warmUp).toBeLessThanOrEqual(1500);
  });

  it('엣지 방향 확인 도구: R, U, L, D, F2, B2로는 나쁜 엣지가 생기지 않고, F를 90° 돌리면 4개가 나빠진다', () => {
    const safe = parseAlg("R R' R2 U U' U2 L L' L2 D D' D2 F2 B2");
    const random = rng(5);
    for (let i = 0; i < 200; i++) {
      let s = i % 2 ? SOLVED : YELLOW_UP;
      for (let n = 0; n < 30; n++) s = applyMove(s, safe[Math.floor(random() * safe.length)]);
      expect(badEdges(s), `#${i}`).toBe(0);
      for (const quarter of ['F', "F'", 'B', "B'"]) {
        expect(badEdges(applyMoves(s, parseAlg(quarter))), `#${i} ${quarter}`).toBe(4);
      }
      expect(badEdges(applyMoves(s, parseAlg('F B'))), `#${i} F B`).toBe(8);
      expect(badEdges(applyMoves(s, parseAlg("F U F'"))), `#${i} F U F'`).toBe(2);
    }
    expect(EDGE_SPOTS.length).toBe(12);
  });

  it('EO 라인은 가장 짧다: 6수 이하인 풀이 100개에 대해 더 짧은 길이 없다', () => {
    // 찾는 도구부터 확인한다: EO 라인이 된 상태에서 4번 돌린 것은 4수 안에 되돌릴 수 있어야 한다.
    const random = rng(41);
    for (let i = 0; i < 10; i++) {
      const done = applyMoves(YELLOW_UP, generateScramble(20, random).filter((m) => 'RUL'.includes(m.base)));
      expect(eoLineWithin(done, 0)).toBe(true);
      const undone = applyMoves(done, generateScramble(4, random));
      expect(eoLineWithin(undone, 4), `#${i}`).toBe(true);
    }

    let checked = 0;
    for (let i = 0; checked < 100; i++) {
      expect(i).toBeLessThan(400);
      const start = applyMoves(YELLOW_UP, generateScramble(25, random));
      const eoLine = stageMoves(solveZz(start)[1]);
      expect(eoLineDone(applyMoves(start, eoLine)), `#${i}`).toBe(true);
      if (eoLine.length === 0 || eoLine.length > 6) continue;
      expect(eoLineWithin(start, eoLine.length - 1), `#${i}: ${eoLine.length}수보다 짧은 길이 있음`).toBe(false);
      checked++;
    }
  }, 60_000);

  it('큐브를 통째로 돌려 놓은 상태나 중간층을 돌린 상태도 푼다', () => {
    for (const alg of ["x y' R U F", 'M E S', "M2 U M U2 M' U M2 z", "R U R' U'", 'y', "r U R' U' M U R U' R'"]) {
      const start = applyMoves(SOLVED, parseAlg(alg));
      check(start, solveZz(start), alg);
    }
  });

  it('이미 완성된 큐브는 잡는 방향만 바꾼다', () => {
    const solved = solveZz(SOLVED);
    expect(stageMoves(solved[0]).every(isRotation)).toBe(true);
    expect(solved.slice(1).every((s) => s.steps.length === 0)).toBe(true);
    expect(solveZz(YELLOW_UP).every((s) => s.steps.length === 0)).toBe(true);
    // 윗층만 돌아간 큐브는 U 한 번으로 끝난다.
    expect(solveZz(applyMoves(YELLOW_UP, parseAlg('U'))).map((s) => stageMoves(s).length)).toEqual([0, 0, 0, 0, 0, 1]);
    // 앞면만 돌아간 큐브는 EO 라인 단계에서 끝난다.
    expect(solveZz(applyMoves(YELLOW_UP, parseAlg('F'))).map((s) => stageMoves(s).length)).toEqual([0, 1, 0, 0, 0, 0]);
  });

  it('윗층 공식은 큐브를 돌려 잡지 않게 풀어 쓴다 (PLL 21가지 모두)', async () => {
    const { PLL_CASES } = await import('../algorithms/pll');
    for (const algCase of PLL_CASES) {
      // 공식을 거꾸로 적용한 상태가 그 케이스의 모습이다.
      const start = applyMoves(YELLOW_UP, invertAlg(parseAlg(algCase.alg)));
      const stages = solveZz(start);
      check(start, stages, algCase.id);
      expect(stages.slice(0, 5).every((s) => s.steps.length === 0), algCase.id).toBe(true);
      expect(stages[5].steps[0].note, algCase.id).toContain(`${algCase.name} 공식`);
    }
  });

  it('풀 수 없는 상태는 오류', () => {
    const message = '풀 수 없는 상태예요. 큐브의 색 배치를 다시 확인해 주세요.';
    // 엣지 하나만 뒤집힘
    const flipped = [...SOLVED];
    [flipped[7], flipped[19]] = [flipped[19], flipped[7]];
    expect(() => solveZz(flipped)).toThrow(message);
    // 코너 하나만 돌아감 (UFR)
    const twisted = [...SOLVED];
    [twisted[8], twisted[9], twisted[20]] = [twisted[9], twisted[20], twisted[8]];
    expect(() => solveZz(twisted)).toThrow(message);
    // 엣지 두 개만 자리가 바뀜 (UF ↔ UR)
    const swapped = [...SOLVED];
    [swapped[7], swapped[5]] = [swapped[5], swapped[7]];
    [swapped[19], swapped[10]] = [swapped[10], swapped[19]];
    expect(() => solveZz(swapped)).toThrow(message);
    // 같은 색 스티커가 너무 많음
    const painted = [...SOLVED];
    painted[0] = 1;
    expect(() => solveZz(painted)).toThrow(message);
    // 센터가 잘못됨
    const centers = [...SOLVED];
    [centers[4], centers[13]] = [centers[13], centers[4]];
    expect(() => solveZz(centers)).toThrow(message);
    // 섞은 뒤에 엣지를 뒤집거나 코너를 돌려도 마찬가지
    const random = rng(7);
    for (let i = 0; i < 20; i++) {
      const scrambled = applyMoves(SOLVED, generateScramble(25, random));
      const bad = [...scrambled];
      [bad[7], bad[19]] = [bad[19], bad[7]];
      expect(() => solveZz(bad)).toThrow(message);
      const turned = [...scrambled];
      [turned[8], turned[9], turned[20]] = [turned[9], turned[20], turned[8]];
      expect(() => solveZz(turned)).toThrow(message);
    }
  });
});
