import { describe, expect, it } from 'vitest';
import { FACELETS, SOLVED, applyMoves, isRotation, isSolved, type CubeState, type Move } from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { parseAlg } from '../core/notation';
import { generateScramble } from '../core/scramble';
import { ROUX_STAGE_ORDER, ROUX_STAGE_TITLES, solveRoux, type RouxStageId } from './roux';
import { stageMoves, type SolveStage } from './types';

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 단계별 목표는 풀이기와 따로, YELLOW_UP과 칸을 직접 견주어 확인한다.
const cellsWhere = (test: (pos: readonly number[]) => boolean) => FACELETS.flatMap((f, i) => (test(f.pos) ? [i] : []));
/** 왼쪽 아래 두 층의 1×2×3 (왼쪽 센터 포함) */
const FIRST_BLOCK = cellsWhere(([x, y]) => x === -1 && y !== 1);
const SECOND_BLOCK = cellsWhere(([x, y]) => x === 1 && y !== 1);
const TOP_CORNERS = cellsWhere(([x, y, z]) => y === 1 && x !== 0 && z !== 0);
const matches = (s: CubeState, cells: readonly number[]) => cells.every((i) => s[i] === YELLOW_UP[i]);
const U_TURNS: readonly Move[][] = ['', 'U', 'U2', "U'"].map(parseAlg);

const held = (s: CubeState) => s[3 * 9 + 4] === 0 && s[2 * 9 + 4] === 2; // 흰색 아래, 초록색 앞
const firstBlockDone = (s: CubeState) => matches(s, FIRST_BLOCK);
const blocksDone = (s: CubeState) => firstBlockDone(s) && matches(s, SECOND_BLOCK);
/** 윗층 코너가 서로 맞고, U만 돌리면 블록과도 맞는지 */
const cornersDone = (s: CubeState) => blocksDone(s) && U_TURNS.some((u) => matches(applyMoves(s, u), TOP_CORNERS));

const GOALS: Readonly<Record<RouxStageId, (s: CubeState) => boolean>> = {
  orient: held,
  fb: firstBlockDone,
  sb: blocksDone,
  cmll: cornersDone,
  lse: isSolved,
};

const ALLOWED: Partial<Record<RouxStageId, string>> = { sb: 'RrUM', lse: 'MU' };

const turnCount = (moves: readonly Move[]) => moves.filter((m) => !isRotation(m)).length;

/** 단계 순서, 단계별 목표, 단계별로 쓸 수 있는 동작을 확인하고 끝 상태를 돌려준다. */
function check(start: CubeState, stages: SolveStage<RouxStageId>[], label: string): CubeState {
  expect(stages.map((s) => s.id), label).toEqual(ROUX_STAGE_ORDER);
  let state = start;
  for (const stage of stages) {
    const moves = stageMoves(stage);
    expect(stage.title, label).toBe(ROUX_STAGE_TITLES[stage.id]);
    for (const step of stage.steps) {
      expect(step.moves.length, `${label} ${stage.id}`).toBeGreaterThan(0);
      expect(step.note, `${label} ${stage.id}`).toMatch(/요( \(\d+수\))?\.$/);
    }
    // 처음 잡은 방향을 끝까지 유지한다.
    expect(moves.every((m) => isRotation(m) === (stage.id === 'orient')), `${label} ${stage.id}`).toBe(true);
    const allowed = ALLOWED[stage.id];
    if (allowed) expect(moves.every((m) => allowed.includes(m.base)), `${label} ${stage.id}`).toBe(true);
    state = applyMoves(state, moves);
    expect(GOALS[stage.id](state), `${label} ${stage.id} 단계 뒤`).toBe(true);
  }
  expect(isSolved(state), label).toBe(true);
  return state;
}

describe('Roux 풀이기', () => {
  it('무작위로 섞은 큐브 300개를 모두 풀고, 단계마다 목표를 이룬다', () => {
    // 첫 풀이에서 표를 만든다. 그 시간은 따로 잰다.
    const warmStart = performance.now();
    solveRoux(applyMoves(SOLVED, parseAlg("R U F' L2 D B' M U2 r")));
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
      const stages = solveRoux(start);
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
      `Roux: 평균 ${avg.toFixed(1)}회전, 최대 ${worst}회전 · ` +
        ROUX_STAGE_ORDER.map((id) => `${id} ${(sum[id] / 300).toFixed(1)} (최대 ${max[id]})`).join(', ') +
        ` · 풀이 시간 평균 ${(time / 300).toFixed(2)}ms, 최대 ${slowest.toFixed(1)}ms, 표 만들기 포함 첫 풀이 ${warmUp.toFixed(0)}ms`,
    );
    // 사람이 푸는 Roux는 45~50회전 안팎. 블록과 LSE를 최단으로 찾으므로 그보다 짧아야 한다.
    expect(avg).toBeLessThanOrEqual(62);
    // 비교 화면을 열 때 메인 스레드에서 돌린다.
    expect(time / 300).toBeLessThanOrEqual(60);
    expect(slowest).toBeLessThanOrEqual(600);
    expect(warmUp).toBeLessThanOrEqual(1500);
  });

  it('CMLL 단계는 U 맞추기와 공식 하나, 블록과 LSE 단계는 한 묶음이다', () => {
    const random = rng(31);
    for (let i = 0; i < 100; i++) {
      const stages = solveRoux(applyMoves(SOLVED, generateScramble(25, random)));
      for (const stage of stages) expect(stage.steps.length, stage.id).toBeLessThanOrEqual(stage.id === 'cmll' ? 2 : 1);
    }
  });

  it('큐브를 통째로 돌려 놓은 상태나 중간층을 돌린 상태도 푼다', () => {
    for (const alg of ["x y' R U F", 'M E S', "M2 U M U2 M' U M2 z", "R U R' U'", 'y', "r U R' U' M U R U' R'"]) {
      const start = applyMoves(SOLVED, parseAlg(alg));
      check(start, solveRoux(start), alg);
    }
  });

  it('이미 완성된 큐브는 잡는 방향만 바꾼다', () => {
    expect(solveRoux(SOLVED).slice(1).every((s) => s.steps.length === 0)).toBe(true);
    expect(solveRoux(YELLOW_UP).every((s) => s.steps.length === 0)).toBe(true);
    // 윗층만 돌아간 큐브는 U 한 번, 엣지 3개만 돌아간 큐브(Ua)는 LSE 단계만으로 끝난다.
    expect(solveRoux(applyMoves(YELLOW_UP, parseAlg('U'))).map((s) => stageMoves(s).length)).toEqual([0, 0, 0, 0, 1]);
    const ua = solveRoux(applyMoves(YELLOW_UP, parseAlg("M2 U M U2 M' U M2")));
    expect(ua.slice(0, 4).every((s) => s.steps.length === 0)).toBe(true);
    expect(stageMoves(ua[4]).length).toBeGreaterThan(0);
    expect(stageMoves(ua[4]).length).toBeLessThanOrEqual(7);
  });

  it('풀 수 없는 상태는 오류', () => {
    const message = '풀 수 없는 상태예요. 큐브의 색 배치를 다시 확인해 주세요.';
    // 엣지 하나만 뒤집힘
    const flipped = [...SOLVED];
    [flipped[7], flipped[19]] = [flipped[19], flipped[7]];
    expect(() => solveRoux(flipped)).toThrow(message);
    // 코너 하나만 돌아감 (UFR)
    const twisted = [...SOLVED];
    [twisted[8], twisted[9], twisted[20]] = [twisted[9], twisted[20], twisted[8]];
    expect(() => solveRoux(twisted)).toThrow(message);
    // 엣지 두 개만 자리가 바뀜 (UF ↔ UR)
    const swapped = [...SOLVED];
    [swapped[7], swapped[5]] = [swapped[5], swapped[7]];
    [swapped[19], swapped[10]] = [swapped[10], swapped[19]];
    expect(() => solveRoux(swapped)).toThrow(message);
    // 같은 색 스티커가 너무 많음
    const painted = [...SOLVED];
    painted[0] = 1;
    expect(() => solveRoux(painted)).toThrow(message);
    // 섞은 뒤에 엣지를 뒤집어도 마찬가지
    const random = rng(7);
    for (let i = 0; i < 20; i++) {
      const bad = [...applyMoves(SOLVED, generateScramble(25, random))];
      [bad[7], bad[19]] = [bad[19], bad[7]];
      expect(() => solveRoux(bad)).toThrow(message);
    }
  });
});
