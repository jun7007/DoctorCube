import { describe, expect, it } from 'vitest';
import { FACELETS, applyMoves, isSolved, type CubeState, type Move } from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { invertAlg, parseAlg } from '../core/notation';
import { colorAt } from '../core/pieces';
import { OLL_CASES } from './oll';
import { PLL_CASES } from './pll';
import { TWO_LOOK_OLL_CORNERS, TWO_LOOK_OLL_EDGES, TWO_LOOK_PLL_CORNERS, TWO_LOOK_PLL_EDGES } from './twoLook';
import type { AlgCase } from './types';

const YELLOW = 3;
const U_TURNS: readonly Move[][] = ['', 'U', 'U2', "U'"].map(parseAlg);
const EDGES = ['UB', 'UR', 'UF', 'UL'];

const lowerLayersUntouched = (s: CubeState) => FACELETS.every((f, i) => f.pos[1] === 1 || s[i] === YELLOW_UP[i]);
const topAllYellow = (s: CubeState) => s.slice(0, 9).every((c) => c === YELLOW);
const startOf = (alg: string) => applyMoves(YELLOW_UP, invertAlg(parseAlg(alg)));
/** 노란색이 위를 보는 엣지들. 예: 'UB,UL' */
const yellowEdges = (s: CubeState) => EDGES.filter((e) => colorAt(s, e, 'U') === YELLOW).join();

const ollById = new Map(OLL_CASES.map((c) => [c.id, c]));
const pllById = new Map(PLL_CASES.map((c) => [c.id, c]));
const pick = (map: Map<string, AlgCase>, ids: readonly string[]) => ids.map((id) => parseAlg(map.get(id)!.alg));

/** 아무것도 안 하거나, U로 윗면을 맞춘 뒤 공식 하나를 한 결과들 */
function afterOneLook(s: CubeState, algs: readonly Move[][]): CubeState[] {
  return [s, ...U_TURNS.flatMap((u) => algs.map((alg) => applyMoves(s, [...u, ...alg])))];
}

describe('2단계 OLL / PLL', () => {
  it('가리키는 id가 모두 있다', () => {
    expect(TWO_LOOK_OLL_EDGES.map((c) => c.id)).toEqual(['2l-oll-dot', '2l-oll-L', '2l-oll-line']);
    expect(TWO_LOOK_OLL_CORNERS).toEqual([21, 22, 23, 24, 25, 26, 27].map((n) => `oll-${n}`));
    for (const id of TWO_LOOK_OLL_CORNERS) expect(ollById.has(id), id).toBe(true);
    expect(TWO_LOOK_PLL_CORNERS.length).toBe(2);
    for (const id of TWO_LOOK_PLL_CORNERS) expect(pllById.has(id), id).toBe(true);
    expect(TWO_LOOK_PLL_EDGES).toEqual(['pll-Ua', 'pll-Ub', 'pll-Z', 'pll-H']);
    for (const id of TWO_LOOK_PLL_EDGES) expect(pllById.has(id), id).toBe(true);
  });

  describe('노란 십자 만들기', () => {
    // 공식을 시작할 때 위를 보고 있어야 하는 노란 엣지
    const BEFORE: Readonly<Record<string, string>> = {
      '2l-oll-dot': '',
      '2l-oll-L': 'UR,UF',
      '2l-oll-line': 'UR,UL',
    };

    it('공식을 거꾸로 해서 만든 상태는 각각 점, ㄱ자, 일자이고 공식을 하면 십자가 된다', () => {
      for (const c of TWO_LOOK_OLL_EDGES) {
        const s = startOf(c.alg);
        expect(lowerLayersUntouched(s), c.id).toBe(true);
        expect(yellowEdges(s), c.id).toBe(BEFORE[c.id]);
        const done = applyMoves(s, parseAlg(c.alg));
        expect(lowerLayersUntouched(done), c.id).toBe(true);
        expect(yellowEdges(done), c.id).toBe('UB,UR,UF,UL');
      }
    });

    it('코너가 어떤 모양이든, 엣지 모양이 맞으면 십자가 된다 (OLL 57가지를 네 방향으로 돌려 확인)', () => {
      const tried = new Map(TWO_LOOK_OLL_EDGES.map((c) => [c.id, 0]));
      for (const oll of OLL_CASES) {
        for (const u of U_TURNS) {
          const s = applyMoves(startOf(oll.alg), u);
          for (const c of TWO_LOOK_OLL_EDGES) {
            if (yellowEdges(s) !== BEFORE[c.id]) continue;
            const done = applyMoves(s, parseAlg(c.alg));
            expect(lowerLayersUntouched(done), `${oll.id} + ${c.id}`).toBe(true);
            expect(yellowEdges(done), `${oll.id} + ${c.id}`).toBe('UB,UR,UF,UL');
            tried.set(c.id, tried.get(c.id)! + 1);
          }
        }
      }
      // 점 8가지는 네 방향 모두, ㄱ자 27가지는 한 방향, 일자 15가지는 두 방향에서 맞는다.
      expect([...tried.values()]).toEqual([32, 27, 30]);
    });
  });

  it('OLL 57가지 모두 엣지 공식 한 번 + 코너 공식 한 번 안에 윗면이 노란색이 된다', () => {
    const edgeAlgs = TWO_LOOK_OLL_EDGES.map((c) => parseAlg(c.alg));
    const cornerAlgs = pick(ollById, TWO_LOOK_OLL_CORNERS);
    for (const oll of OLL_CASES) {
      const results = afterOneLook(startOf(oll.alg), edgeAlgs)
        .filter((s) => yellowEdges(s) === 'UB,UR,UF,UL')
        .flatMap((s) => afterOneLook(s, cornerAlgs));
      expect(results.some((s) => topAllYellow(s) && lowerLayersUntouched(s)), oll.id).toBe(true);
    }
  });

  it('PLL 21가지 모두 코너 공식 한 번 + 엣지 공식 한 번 안에 풀린다', () => {
    const cornerAlgs = pick(pllById, TWO_LOOK_PLL_CORNERS);
    const edgeAlgs = pick(pllById, TWO_LOOK_PLL_EDGES);
    const solvedByU = (s: CubeState) => U_TURNS.some((u) => isSolved(applyMoves(s, u)));
    for (const pll of PLL_CASES) {
      const results = afterOneLook(startOf(pll.alg), cornerAlgs).flatMap((s) => afterOneLook(s, edgeAlgs));
      expect(results.some(solvedByU), pll.id).toBe(true);
    }
  });
});
