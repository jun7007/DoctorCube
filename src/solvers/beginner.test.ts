import { describe, expect, it } from 'vitest';
import { SOLVED, applyMoves, isRotation, isSolved } from '../core/cube';
import { parseAlg } from '../core/notation';
import { generateScramble } from '../core/scramble';
import { STAGE_ORDER, solveBeginner, stageMoves } from './beginner';
import { locate, makePlan, nextStep } from './plan';

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

describe('초보자 공식 풀이기', () => {
  it('무작위로 섞은 큐브 300개를 모두 푼다', () => {
    const random = rng(7);
    let total = 0;
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      const start = applyMoves(SOLVED, generateScramble(25, random));
      const stages = solveBeginner(start);
      expect(stages.map((s) => s.id)).toEqual(STAGE_ORDER);
      const moves = stages.flatMap(stageMoves);
      expect(isSolved(applyMoves(start, moves)), `scramble #${i}`).toBe(true);
      const turns = moves.filter((m) => !isRotation(m)).length;
      total += turns;
      worst = Math.max(worst, turns);
    }
    console.log(`평균 ${Math.round(total / 300)}회전, 최대 ${worst}회전`);
  });

  it('큐브를 통째로 돌려 놓은 상태나 중간층을 돌린 상태도 푼다', () => {
    for (const alg of ["x y' R U F", 'M E S', "M2 U M U2 M' U M2 z", "R U R' U'", 'y']) {
      const start = applyMoves(SOLVED, parseAlg(alg));
      expect(isSolved(applyMoves(start, solveBeginner(start).flatMap(stageMoves))), alg).toBe(true);
    }
  });

  it('풀이 도중 어느 묶음 뒤에서 다시 풀어도 풀린다', () => {
    const random = rng(21);
    for (let i = 0; i < 40; i++) {
      let state = applyMoves(SOLVED, generateScramble(25, random));
      for (const stage of solveBeginner(state)) {
        for (const step of stage.steps) {
          state = applyMoves(state, step.moves);
          const again = solveBeginner(state).flatMap(stageMoves);
          expect(isSolved(applyMoves(state, again))).toBe(true);
        }
      }
    }
  });

  it('십자를 만드는 도중에는 다시 풀어도 뒤로 가지 않는다', () => {
    const random = rng(5);
    for (let i = 0; i < 100; i++) {
      let state = applyMoves(SOLVED, generateScramble(25, random));
      const stages = solveBeginner(state);
      // 큐브 잡기 ~ 십자 (0, 1, 2번 단계)
      for (const stage of stages.slice(0, 3)) {
        for (const step of stage.steps) {
          const before = solveBeginner(state).slice(0, 3).flatMap(stageMoves).length;
          state = applyMoves(state, step.moves);
          const after = solveBeginner(state).slice(0, 3).flatMap(stageMoves).length;
          expect(after, `scramble #${i}`).toBeLessThan(before);
        }
      }
    }
  });

  it('계획을 묶음 단위로 따라가면 끝난다 (힌트 버튼)', () => {
    const random = rng(3);
    for (let i = 0; i < 40; i++) {
      let state = applyMoves(SOLVED, generateScramble(25, random));
      const plan = makePlan(state);
      let clicks = 0;
      while (!isSolved(state)) {
        const at = locate(plan, state);
        expect(at).toBeGreaterThanOrEqual(0);
        const next = nextStep(plan, at)!;
        // 묶음의 첫 동작만 직접 하고 나머지는 버튼으로 하는 경우도 섞는다.
        if (clicks % 3 === 0 && next.moves.length > 1) state = applyMoves(state, next.moves.slice(0, 1));
        else state = applyMoves(state, next.moves);
        expect(++clicks).toBeLessThan(400);
      }
    }
  });

  it('이미 완성된 큐브는 할 일이 없다', () => {
    const stages = solveBeginner(SOLVED);
    // 잡는 방향만 바꾼다 (노란색이 위)
    expect(stages.slice(1).every((s) => s.steps.length === 0)).toBe(true);
  });

  it('조각을 하나만 뒤집은, 풀 수 없는 상태는 오류', () => {
    const bad = [...SOLVED];
    // UF 엣지의 두 스티커를 맞바꿈
    [bad[7], bad[19]] = [bad[19], bad[7]];
    expect(() => solveBeginner(bad)).toThrow();
  });
});
