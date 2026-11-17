import { describe, expect, it } from 'vitest';
import { SOLVED, applyMoves, isRotation, isSolved } from '../core/cube';
import { parseAlg } from '../core/notation';
import { generateScramble } from '../core/scramble';
import { CFOP_STAGE_ORDER, solveCfop } from './cfop';
import { stageMoves } from './types';

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('CFOP 풀이기', () => {
  for (const twoLook of [false, true]) {
    const label = twoLook ? '2-Look' : '전체 공식';

    it(`${label}: 무작위로 섞은 큐브 300개를 모두 푼다`, () => {
      const random = rng(twoLook ? 13 : 12);
      let total = 0;
      let worst = 0;
      const perStage: Record<string, number> = {};
      for (let i = 0; i < 300; i++) {
        const start = applyMoves(SOLVED, generateScramble(25, random));
        const stages = solveCfop(start, { twoLook });
        expect(stages.map((s) => s.id)).toEqual(CFOP_STAGE_ORDER);
        const moves = stages.flatMap(stageMoves);
        expect(isSolved(applyMoves(start, moves)), `scramble #${i}`).toBe(true);
        const turns = moves.filter((m) => !isRotation(m)).length;
        total += turns;
        worst = Math.max(worst, turns);
        for (const s of stages) {
          perStage[s.id] = (perStage[s.id] ?? 0) + stageMoves(s).filter((m) => !isRotation(m)).length;
        }
      }
      const avg = total / 300;
      console.log(
        `CFOP ${label}: 평균 ${avg.toFixed(1)}회전, 최대 ${worst}회전 · ` +
          Object.entries(perStage)
            .map(([id, n]) => `${id} ${(n / 300).toFixed(1)}`)
            .join(', '),
      );
      // 사람이 푸는 CFOP은 55~60회전 안팎. 크게 벗어나면 뭔가 잘못된 것이다.
      expect(avg).toBeLessThan(twoLook ? 90 : 80);
    });

    it(`${label}: 2-Look은 OLL·PLL에서 공식을 최대 두 번씩 쓴다`, () => {
      const random = rng(31);
      for (let i = 0; i < 100; i++) {
        const stages = solveCfop(applyMoves(SOLVED, generateScramble(25, random)), { twoLook });
        const oll = stages.find((s) => s.id === 'oll')!;
        const pll = stages.find((s) => s.id === 'pll')!;
        // PLL 단계에는 마지막 U 조정 묶음이 하나 더 있을 수 있다.
        expect(oll.steps.length).toBeLessThanOrEqual(twoLook ? 3 : 1);
        expect(pll.steps.length).toBeLessThanOrEqual(twoLook ? 3 : 2);
      }
    });
  }

  it('큐브를 통째로 돌려 놓은 상태나 중간층을 돌린 상태도 푼다', () => {
    for (const alg of ["x y' R U F", 'M E S', "M2 U M U2 M' U M2 z", "R U R' U'", 'y']) {
      const start = applyMoves(SOLVED, parseAlg(alg));
      expect(isSolved(applyMoves(start, solveCfop(start).flatMap(stageMoves))), alg).toBe(true);
    }
  });

  it('이미 완성된 큐브는 잡는 방향만 바꾼다', () => {
    expect(solveCfop(SOLVED).slice(1).every((s) => s.steps.length === 0)).toBe(true);
  });

  it('풀 수 없는 상태는 오류', () => {
    const bad = [...SOLVED];
    [bad[7], bad[19]] = [bad[19], bad[7]];
    expect(() => solveCfop(bad)).toThrow();
  });
});
