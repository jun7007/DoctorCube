import { describe, expect, it } from 'vitest';
import {
  FACELETS,
  applyMoves,
  invertMove,
  isSolved,
  toFaceletString,
  type BaseMove,
  type CubeState,
  type Face,
  type Move,
} from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { invertAlg, parseAlg } from '../core/notation';
import { colorAt } from '../core/pieces';
import { PLL_CASES } from './pll';

const YELLOW = 3;
const U_TURNS: readonly Move[][] = ['', 'U', 'U2', "U'"].map(parseAlg);

/** 윗층이 아닌 칸이 모두 그대로인지 */
const lowerLayersUntouched = (s: CubeState) => FACELETS.every((f, i) => f.pos[1] === 1 || s[i] === YELLOW_UP[i]);
const topAllYellow = (s: CubeState) => s.slice(0, 9).every((c) => c === YELLOW);

/** 공식 앞뒤로 U를 돌린 16가지 중 가장 작은 문자열. 같은 케이스면 같은 값이 나온다. */
function caseKey(moves: readonly Move[]): string {
  let best = '';
  for (const pre of U_TURNS) {
    for (const post of U_TURNS) {
      const key = toFaceletString(applyMoves(YELLOW_UP, [...pre, ...moves, ...post]));
      if (!best || key < best) best = key;
    }
  }
  return best;
}

const MIRROR_BASE: Partial<Record<BaseMove, BaseMove>> = { R: 'L', L: 'R', r: 'l', l: 'r' };

/** 좌우를 뒤집은 공식. 좌우 축으로 도는 M과 x만 방향이 그대로다. */
function mirrorAlg(moves: readonly Move[]): Move[] {
  return moves.map((m) =>
    m.base === 'M' || m.base === 'x' ? m : invertMove({ base: MIRROR_BASE[m.base] ?? m.base, amount: m.amount }),
  );
}

// 위에서 볼 때 시계 방향 순서. i번 엣지는 i번 코너와 i+1번 코너 사이에 있다.
const CORNERS = ['UBL', 'UBR', 'UFR', 'UFL'];
const EDGES = ['UB', 'UR', 'UF', 'UL'];

const pieceColors = (s: CubeState, piece: string) =>
  [...piece]
    .map((f) => colorAt(s, piece, f as Face))
    .sort()
    .join('');

/** 자리 바꿈을 순환으로 나눈다. [a, b, c]는 a 자리 조각이 b로, b가 c로, c가 a로 간다는 뜻 */
function cyclesOf(s: CubeState, pieces: readonly string[]): number[][] {
  const home = pieces.map((p) => pieceColors(YELLOW_UP, p));
  const to = pieces.map(() => -1);
  pieces.forEach((p, at) => {
    to[home.indexOf(pieceColors(s, p))] = at;
  });
  const seen = new Set<number>();
  const out: number[][] = [];
  to.forEach((_, start) => {
    if (seen.has(start) || to[start] === start) return;
    const cycle: number[] = [];
    for (let i = start; !seen.has(i); i = to[i]) {
      seen.add(i);
      cycle.push(i);
    }
    out.push(cycle);
  });
  return out;
}

interface Shape {
  corners: number[][];
  edges: number[][];
}

/** 공식 뒤에 U를 k번 더 돌렸을 때의 조각 움직임 */
function shapeAfter(moves: readonly Move[], k: number): Shape {
  const s = applyMoves(YELLOW_UP, [...moves, ...U_TURNS[k]]);
  return { corners: cyclesOf(s, CORNERS), edges: cyclesOf(s, EDGES) };
}

const movedCount = (shape: Shape) => [...shape.corners, ...shape.edges].flat().length;

/**
 * 케이스의 조각 움직임. 끝에 U를 어떻게 돌리느냐에 따라 달라 보이므로,
 * 움직인 조각이 가장 적은 것 → 가장 긴 순환이 짧은 것 → 움직인 코너가 적은 것을 고른다.
 */
function shapeOf(moves: readonly Move[]): Shape {
  const rank = (x: Shape) => [
    movedCount(x),
    Math.max(0, ...[...x.corners, ...x.edges].map((c) => c.length)),
    x.corners.flat().length,
  ];
  return [0, 1, 2, 3]
    .map((k) => shapeAfter(moves, k))
    .sort((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    })[0];
}

const adjacent = ([a, b]: number[]) => (b - a + 4) % 4 !== 2;

/** 순환 모양을 글자로. 예: 'none', 'swap-adj', 'swap-far', '2swap-adj', '2swap-far', '3cw', '3ccw' */
function describeCycles(cycles: number[][]): string {
  if (cycles.length === 0) return 'none';
  const lengths = cycles.map((c) => c.length);
  if (lengths.every((n) => n === 2)) {
    const kinds = new Set(cycles.map((c) => (adjacent(c) ? 'adj' : 'far')));
    return `${cycles.length === 2 ? '2' : ''}swap-${kinds.size === 1 ? [...kinds][0] : 'mixed'}`;
  }
  if (cycles.length === 1 && lengths[0] === 3) {
    // 시계 방향으로 간 칸 수를 모두 더하면 시계 방향 순환은 4, 반시계 방향은 8이다.
    const [a, b, c] = cycles[0];
    const steps = ((b - a + 4) % 4) + ((c - b + 4) % 4) + ((a - c + 4) % 4);
    return steps === 4 ? '3cw' : '3ccw';
  }
  return lengths.join('+');
}

const describeShape = (shape: Shape) => `${describeCycles(shape.corners)} / ${describeCycles(shape.edges)}`;

/** 이웃한 두 코너 사이에 낀 엣지 번호 */
function edgeBetween([a, b]: number[]): number {
  return (a + 1) % 4 === b ? a : b;
}

const byName = new Map(PLL_CASES.map((c) => [c.name, c]));
const movesOf = (name: string) => parseAlg(byName.get(name)!.alg);
const allAlgs = PLL_CASES.flatMap((c) => [c.alg, ...(c.alts ?? [])].map((alg) => ({ name: c.name, alg })));

const NAMES = [
  ...['Aa', 'Ab', 'E', 'F', 'Ga', 'Gb', 'Gc', 'Gd', 'H', 'Ja', 'Jb'],
  ...['Na', 'Nb', 'Ra', 'Rb', 'T', 'Ua', 'Ub', 'V', 'Y', 'Z'],
];

describe('PLL 공식', () => {
  it('21가지가 모두 있고 id, 이름, 묶음, 요령이 채워져 있다', () => {
    expect(PLL_CASES.map((c) => c.name).sort()).toEqual([...NAMES].sort());
    for (const c of PLL_CASES) {
      expect(c.id).toBe(`pll-${c.name}`);
      expect(c.group.length, c.id).toBeGreaterThan(0);
      expect(c.note?.length ?? 0, c.id).toBeGreaterThan(0);
    }
    const groups = new Set(PLL_CASES.map((c) => c.group)).size;
    expect(groups).toBeGreaterThanOrEqual(3);
    expect(groups).toBeLessThanOrEqual(5);
  });

  it('모든 공식(alts 포함)이 아래 두 층과 윗면 노란색은 그대로 두고 윗층 자리만 바꾼다', () => {
    for (const { name, alg } of allAlgs) {
      const s = applyMoves(YELLOW_UP, parseAlg(alg));
      expect(lowerLayersUntouched(s), `${name}: ${alg}`).toBe(true);
      expect(topAllYellow(s), `${name}: ${alg}`).toBe(true);
      for (const u of U_TURNS) expect(isSolved(applyMoves(s, u)), `${name}: ${alg}`).toBe(false);
    }
  });

  it('21가지가 서로 다른 케이스다 (그러면 빠진 케이스가 없다)', () => {
    const keys = new Map<string, string>();
    for (const c of PLL_CASES) {
      const key = caseKey(parseAlg(c.alg));
      expect(keys.get(key), `${c.name}와 같은 케이스`).toBeUndefined();
      keys.set(key, c.name);
    }
    expect(keys.size).toBe(21);
  });

  it('alts는 대표 공식과 같은 케이스를 푼다', () => {
    for (const c of PLL_CASES) {
      const key = caseKey(parseAlg(c.alg));
      for (const alt of c.alts ?? []) expect(caseKey(parseAlg(alt)), `${c.name}: ${alt}`).toBe(key);
    }
  });

  it('대표 공식은 끝에 U를 더 돌릴 필요가 없다', () => {
    for (const c of PLL_CASES) {
      const moved = [0, 1, 2, 3].map((k) => movedCount(shapeAfter(parseAlg(c.alg), k)));
      expect(moved[0], c.name).toBe(Math.min(...moved));
    }
  });

  describe('이름과 조각 움직임이 맞는다', () => {
    const EXPECTED: Readonly<Record<string, string>> = {
      // 엣지만: Ua는 반시계, Ub는 시계 방향 3순환. H는 마주 보는 엣지끼리, Z는 이웃한 엣지끼리 교환
      Ua: 'none / 3ccw',
      Ub: 'none / 3cw',
      H: 'none / 2swap-far',
      Z: 'none / 2swap-adj',
      // 코너만: Aa는 시계, Ab는 반시계 방향 3순환. E는 이웃한 코너끼리 두 쌍 교환
      Aa: '3cw / none',
      Ab: '3ccw / none',
      E: '2swap-adj / none',
      // 이웃한 코너 한 쌍 + 엣지 한 쌍
      T: 'swap-adj / swap-far',
      F: 'swap-adj / swap-far',
      Ja: 'swap-adj / swap-adj',
      Jb: 'swap-adj / swap-adj',
      Ra: 'swap-adj / swap-adj',
      Rb: 'swap-adj / swap-adj',
      // 대각선 코너 한 쌍 + 엣지 한 쌍
      V: 'swap-far / swap-adj',
      Y: 'swap-far / swap-adj',
      Na: 'swap-far / swap-far',
      Nb: 'swap-far / swap-far',
    };

    it('순환 모양', () => {
      for (const name of NAMES) {
        const shape = shapeOf(movesOf(name));
        if (name.startsWith('G')) {
          // 코너 3순환 + 엣지 3순환
          expect(describeShape(shape), name).toMatch(/^3c?cw \/ 3c?cw$/);
        } else {
          expect(describeShape(shape), name).toBe(EXPECTED[name]);
        }
      }
    });

    it('T와 J는 바뀌는 두 코너 사이의 엣지가 함께 바뀌고, F와 R은 그 엣지가 그대로다', () => {
      const CASES = [['T', true], ['Ja', true], ['Jb', true], ['F', false], ['Ra', false], ['Rb', false]] as const;
      for (const [name, want] of CASES) {
        const { corners, edges } = shapeOf(movesOf(name));
        expect(edges[0].includes(edgeBetween(corners[0])), name).toBe(want);
      }
    });

    it('Jb는 사이 엣지가 시계 방향 옆 엣지와, Ja는 반시계 방향 옆 엣지와 바뀐다', () => {
      for (const [name, step] of [['Jb', 1], ['Ja', 3]] as const) {
        const { corners, edges } = shapeOf(movesOf(name));
        const between = edgeBetween(corners[0]);
        expect([...edges[0]].sort(), name).toEqual([between, (between + step) % 4].sort());
      }
    });

    it('Y는 바뀌는 코너를 감싼 두 엣지가 바뀌고, V는 그대로 있는 코너를 감싼 두 엣지가 바뀐다', () => {
      // i번 코너를 감싼 엣지는 i-1번과 i번이다.
      const around = (corner: number) => [(corner + 3) % 4, corner].sort().join();
      for (const [name, want] of [['Y', true], ['V', false]] as const) {
        const { corners, edges } = shapeOf(movesOf(name));
        const pair = [...edges[0]].sort().join();
        expect(corners[0].some((c) => around(c) === pair), name).toBe(want);
      }
    });

    it('거꾸로 한 공식은 짝이 되는 케이스다 (Ua↔Ub, Aa↔Ab, Ga↔Gb, Gc↔Gd, 나머지는 자기 자신)', () => {
      const INVERSE: Readonly<Record<string, string>> = {
        ...{ Ua: 'Ub', Ub: 'Ua', Aa: 'Ab', Ab: 'Aa' },
        ...{ Ga: 'Gb', Gb: 'Ga', Gc: 'Gd', Gd: 'Gc' },
      };
      for (const name of NAMES) {
        const partner = INVERSE[name] ?? name;
        expect(caseKey(invertAlg(movesOf(name))), `${name} → ${partner}`).toBe(caseKey(movesOf(partner)));
      }
    });

    it('좌우를 뒤집은 공식은 짝이 되는 케이스다 (a↔b, Ga↔Gc, Gb↔Gd, 나머지는 자기 자신)', () => {
      const MIRROR: Readonly<Record<string, string>> = {
        ...{ Ua: 'Ub', Ub: 'Ua', Aa: 'Ab', Ab: 'Aa' },
        ...{ Ja: 'Jb', Jb: 'Ja', Ra: 'Rb', Rb: 'Ra', Na: 'Nb', Nb: 'Na' },
        ...{ Ga: 'Gc', Gc: 'Ga', Gb: 'Gd', Gd: 'Gb' },
      };
      for (const name of NAMES) {
        const partner = MIRROR[name] ?? name;
        expect(caseKey(mirrorAlg(movesOf(name))), `${name} → ${partner}`).toBe(caseKey(movesOf(partner)));
      }
    });

    it('Ua 다음에 Ub를 하면 원래대로 돌아온다', () => {
      const s = applyMoves(YELLOW_UP, [...movesOf('Ua'), ...movesOf('Ub')]);
      expect(isSolved(s)).toBe(true);
    });
  });
});
