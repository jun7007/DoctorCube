import { describe, expect, it } from 'vitest';
import { SOLVED, applyMoves, isSolved } from '../../core/cube';
import { generateScramble } from '../../core/scramble';
import { stageMoves } from '../../solvers/types';
import { estimateSeconds, methodRoutes, paceFromSolves } from './routes';

describe('경로 비교', () => {
  it('사람이 쓰는 방법들의 경로가 모두 큐브를 완성한다', () => {
    for (let n = 0; n < 20; n++) {
      const start = applyMoves(SOLVED, generateScramble());
      const routes = methodRoutes(start);
      expect(routes.map((r) => r.id)).toEqual(['cfop', 'cfop2', 'roux', 'zz', 'beginner']);
      for (const route of routes) {
        const moves = route.stages.flatMap(stageMoves);
        expect(isSolved(applyMoves(start, moves)), route.id).toBe(true);
        expect(route.turns + route.regrips).toBe(moves.length);
      }
    }
  });

  it('OLL·PLL 공식을 외웠다고 표시하면 "내가 외운 공식" 경로가 생긴다', () => {
    const start = applyMoves(SOLVED, generateScramble());
    expect(methodRoutes(start, new Set(['f2l-01'])).some((r) => r.id === 'mine')).toBe(false);
    const routes = methodRoutes(start, new Set(['pll-T', 'oll-27']));
    const mine = routes.find((r) => r.id === 'mine');
    expect(mine).toBeDefined();
    expect(isSolved(applyMoves(start, mine!.stages.flatMap(stageMoves)))).toBe(true);
  });

  it('예상 시간은 회전이 많거나 손이 느릴수록 길다', () => {
    const routes = methodRoutes(applyMoves(SOLVED, generateScramble()));
    const cfop = routes.find((r) => r.id === 'cfop')!;
    const beginner = routes.find((r) => r.id === 'beginner')!;
    expect(estimateSeconds(beginner, 2, 1)).toBeGreaterThan(estimateSeconds(cfop, 2, 1));
    expect(estimateSeconds(cfop, 1, 1)).toBeGreaterThan(estimateSeconds(cfop, 3, 1));
  });
});

describe('내 기록으로 잰 손 속도', () => {
  const solve = (at: number, ms: number, turns: number, hint = false) => ({ at, ms, turns, hint });

  it('기록이 3번보다 적으면 없다', () => {
    expect(paceFromSolves([])).toBeNull();
    expect(paceFromSolves([solve(1, 60000, 120), solve(2, 60000, 120)])).toBeNull();
  });

  it('전체 회전 수를 전체 시간으로 나눈다', () => {
    // 60초에 120회전, 30초에 90회전, 90초에 150회전 → 360회전 / 180초 = 초당 2회전
    expect(paceFromSolves([solve(1, 60000, 120), solve(2, 30000, 90), solve(3, 90000, 150)])).toBeCloseTo(2);
  });

  it('힌트로 푼 기록은 뺀다', () => {
    const solves = [solve(1, 60000, 60), solve(2, 60000, 60), solve(3, 60000, 60), solve(4, 1000, 180, true)];
    expect(paceFromSolves(solves)).toBeCloseTo(1);
    expect(paceFromSolves(solves.slice(1))).toBeNull();
  });

  it('최근 12번만 쓴다', () => {
    const old = Array.from({ length: 20 }, (_, i) => solve(i, 100000, 100));
    const recent = Array.from({ length: 12 }, (_, i) => solve(100 + i, 10000, 40));
    expect(paceFromSolves([...old, ...recent])).toBeCloseTo(4);
  });
});
