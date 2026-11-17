import { describe, expect, it } from 'vitest';
import {
  FACELETS,
  applyMoves,
  invertMove,
  type BaseMove,
  type CubeState,
  type Face,
  type Move,
} from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { invertAlg, parseAlg } from '../core/notation';
import { colorAt } from '../core/pieces';
import { OLL_CASES } from './oll';

const YELLOW = 3;
const U_TURNS: readonly Move[][] = ['', 'U', 'U2', "U'"].map(parseAlg);

/** 윗층에 있는 칸 21개 (윗면 9칸 + 옆면 맨 윗줄 12칸) */
const TOP_LAYER = FACELETS.flatMap((f, i) => (f.pos[1] === 1 ? [i] : []));

const lowerLayersUntouched = (s: CubeState) => FACELETS.every((f, i) => f.pos[1] === 1 || s[i] === YELLOW_UP[i]);
const topAllYellow = (s: CubeState) => s.slice(0, 9).every((c) => c === YELLOW);

/** 공식이 푸는 케이스: 완성 상태에 공식을 거꾸로 적용한 상태 */
const startOf = (moves: readonly Move[]) => applyMoves(YELLOW_UP, invertAlg(moves));

/** 윗층 21칸 중 노란색인 칸의 무늬 */
const pattern = (s: CubeState) => TOP_LAYER.map((i) => (s[i] === YELLOW ? '1' : '0')).join('');

/** U로 돌린 네 가지 무늬 중 가장 작은 것. 같은 케이스면 같은 값이 나온다. */
const caseKey = (s: CubeState) => U_TURNS.map((u) => pattern(applyMoves(s, u))).sort()[0];

const MIRROR_BASE: Partial<Record<BaseMove, BaseMove>> = { R: 'L', L: 'R', r: 'l', l: 'r' };

/** 좌우를 뒤집은 공식. 좌우 축으로 도는 M과 x만 방향이 그대로다. */
function mirrorAlg(moves: readonly Move[]): Move[] {
  return moves.map((m) =>
    m.base === 'M' || m.base === 'x' ? m : invertMove({ base: MIRROR_BASE[m.base] ?? m.base, amount: m.amount }),
  );
}

// 위에서 볼 때 시계 방향 순서. i번 엣지(와 i번 옆면)는 i번 코너와 i+1번 코너 사이에 있다.
const CORNERS = ['UBL', 'UBR', 'UFR', 'UFL'];
const EDGES = ['UB', 'UR', 'UF', 'UL'];
const SIDES: readonly Face[] = ['B', 'R', 'F', 'L'];

const yellowUp = (s: CubeState, piece: string) => colorAt(s, piece, 'U') === YELLOW;
/** 노란색이 위를 보는 조각 번호들 */
const upIndexes = (s: CubeState, pieces: readonly string[]) => pieces.flatMap((p, i) => (yellowUp(s, p) ? [i] : []));

/** 옆면을 보는 노란 칸들. 예: ['UBL:B', 'UFR:F'] */
function sideYellows(s: CubeState): string[] {
  return [...CORNERS, ...EDGES]
    .flatMap((p) => [...p].filter((f) => f !== 'U' && colorAt(s, p, f as Face) === YELLOW).map((f) => `${p}:${f}`))
    .sort();
}

/** 옆면마다 보이는 노란 칸 수를 시계 방향으로 이어 쓴 것 (돌려 잡는 방향과 무관하게 가장 작은 값) */
function sideCounts(s: CubeState): string {
  const counts = SIDES.map(
    (side, i) => [CORNERS[i], EDGES[i], CORNERS[(i + 1) % 4]].filter((p) => colorAt(s, p, side) === YELLOW).length,
  );
  return [0, 1, 2, 3].map((k) => [...counts.slice(k), ...counts.slice(0, k)].join('')).sort()[0];
}

const far = ([a, b]: readonly number[]) => (b - a + 4) % 4 === 2;

const FAMILIES: Readonly<Record<string, readonly number[]>> = {
  '점 (엣지 0개 맞음)': [1, 2, 3, 4, 17, 18, 19, 20],
  '네모': [5, 6],
  '작은 번개': [7, 8, 11, 12],
  '물고기': [9, 10, 35, 37],
  '나이트': [13, 14, 15, 16],
  '십자 (엣지 4개 맞음)': [21, 22, 23, 24, 25, 26, 27],
  '코너 4개 맞음': [28, 57],
  '어색한 모양': [29, 30, 41, 42],
  'P 모양': [31, 32, 43, 44],
  'T 모양': [33, 45],
  'C 모양': [34, 46],
  'W 모양': [36, 38],
  '큰 번개': [39, 40],
  '작은 ㄱ자': [47, 48, 49, 50, 53, 54],
  '일자': [51, 52, 55, 56],
};

/** 윗면에 보이는 노란색 모양만으로 묶음을 정한다. */
function familyOf(s: CubeState): string {
  const edges = upIndexes(s, EDGES);
  const corners = upIndexes(s, CORNERS);
  if (edges.length === 0) return '점 (엣지 0개 맞음)';
  if (edges.length === 4) return '십자 (엣지 4개 맞음)';
  if (edges.length !== 2 || corners.length === 3) return '?';
  if (corners.length === 4) return '코너 4개 맞음';

  if (far(edges)) {
    // 노란 엣지가 일자
    if (corners.length === 0) return '일자';
    if (corners.length === 1) return '나이트';
    if (far(corners)) return '큰 번개';
    // 이웃한 두 노란 코너 사이의 엣지가 노란색이면 T, 아니면 C
    const between = (corners[0] + 1) % 4 === corners[1] ? corners[0] : corners[1];
    return edges.includes(between) ? 'T 모양' : 'C 모양';
  }

  // 노란 엣지가 ㄱ자. i번 코너에 닿는 엣지는 i-1번과 i번이다.
  if (corners.length === 0) return '작은 ㄱ자';
  const touching = (corner: number) => [(corner + 3) % 4, corner].filter((e) => edges.includes(e)).length;
  const inner = corners.some((c) => touching(c) === 2); // ㄱ자 안쪽 코너까지 노란색이면 네모가 생긴다
  if (corners.length === 1) return inner ? '네모' : touching(corners[0]) === 1 ? '작은 번개' : '물고기';
  if (far(corners)) return inner ? '물고기' : 'W 모양';
  return inner ? 'P 모양' : '어색한 모양';
}

const numberOf = (id: string) => Number(id.slice(4));
const byNumber = new Map(OLL_CASES.map((c) => [numberOf(c.id), c]));
const movesOf = (n: number) => parseAlg(byNumber.get(n)!.alg);
const startOfNumber = (n: number) => startOf(movesOf(n));
const allAlgs = OLL_CASES.flatMap((c) => [c.alg, ...(c.alts ?? [])].map((alg) => ({ id: c.id, alg })));
const numbersWhere = (test: (s: CubeState) => boolean) =>
  OLL_CASES.map((c) => numberOf(c.id)).filter((n) => test(startOfNumber(n)));

describe('OLL 공식', () => {
  it('57가지가 번호 순서대로 있고 id와 이름이 규칙에 맞다', () => {
    expect(OLL_CASES.length).toBe(57);
    OLL_CASES.forEach((c, i) => {
      const n = i + 1;
      expect(c.id).toBe(`oll-${String(n).padStart(2, '0')}`);
      expect(c.name === `OLL ${n}` || c.name.startsWith(`OLL ${n} (`), c.name).toBe(true);
      expect(c.group.length, c.id).toBeGreaterThan(0);
    });
    expect(byNumber.get(26)!.name).toBe('OLL 26 (Antisune)');
    expect(byNumber.get(27)!.name).toBe('OLL 27 (Sune)');
  });

  it('모든 공식(alts 포함)이 아래 두 층은 그대로 두고, 윗면이 덜 맞은 상태를 모두 노란색으로 만든다', () => {
    for (const { id, alg } of allAlgs) {
      const moves = parseAlg(alg);
      const s = startOf(moves);
      expect(lowerLayersUntouched(s), `${id}: ${alg}`).toBe(true);
      expect(topAllYellow(s), `${id}: ${alg}`).toBe(false);
      const done = applyMoves(s, moves);
      expect(lowerLayersUntouched(done) && topAllYellow(done), `${id}: ${alg}`).toBe(true);
    }
  });

  it('57가지가 서로 다른 케이스다 (그러면 빠진 케이스가 없다)', () => {
    const keys = new Map<string, string>();
    for (const c of OLL_CASES) {
      const key = caseKey(startOf(parseAlg(c.alg)));
      expect(keys.get(key), `${c.id}와 같은 케이스`).toBeUndefined();
      keys.set(key, c.id);
    }
    expect(keys.size).toBe(57);
  });

  it('alts는 대표 공식과 같은 케이스를 푼다', () => {
    for (const c of OLL_CASES) {
      const key = caseKey(startOf(parseAlg(c.alg)));
      for (const alt of c.alts ?? []) expect(caseKey(startOf(parseAlg(alt))), `${c.id}: ${alt}`).toBe(key);
    }
  });

  describe('번호와 모양이 맞는다', () => {
    it('위를 보는 노란 엣지 수: 점 8가지는 0개, 십자 7가지는 4개, 나머지 42가지는 2개', () => {
      const edgeCount = (n: number) => upIndexes(startOfNumber(n), EDGES).length;
      expect(numbersWhere((s) => upIndexes(s, EDGES).length === 0)).toEqual([1, 2, 3, 4, 17, 18, 19, 20]);
      expect(numbersWhere((s) => upIndexes(s, EDGES).length === 4)).toEqual([21, 22, 23, 24, 25, 26, 27]);
      for (let n = 1; n <= 57; n++) expect([0, 2, 4], `OLL ${n}`).toContain(edgeCount(n));
      // 엣지 2개 + 코너가 덜 맞은 것 40가지, 엣지 2개 + 코너 4개 맞은 것 2가지 (28, 57)
      const twoEdges = numbersWhere((s) => upIndexes(s, EDGES).length === 2);
      expect(twoEdges.length).toBe(42);
      expect(twoEdges.filter((n) => upIndexes(startOfNumber(n), CORNERS).length < 4).length).toBe(40);
    });

    it('코너 4개가 모두 위를 보는 것은 20, 28, 57뿐이고, 28은 이웃한 엣지, 57은 마주 보는 엣지가 뒤집혀 있다', () => {
      expect(numbersWhere((s) => upIndexes(s, CORNERS).length === 4)).toEqual([20, 28, 57]);
      expect(far(upIndexes(startOfNumber(28), EDGES))).toBe(false);
      expect(far(upIndexes(startOfNumber(57), EDGES))).toBe(true);
    });

    it('윗면 모양으로 정한 묶음이 표준 번호의 묶음, 그리고 group과 같다', () => {
      const listed = Object.values(FAMILIES).flat();
      expect([...listed].sort((a, b) => a - b)).toEqual(Array.from({ length: 57 }, (_, i) => i + 1));
      for (const [family, numbers] of Object.entries(FAMILIES)) {
        for (const n of numbers) {
          expect(familyOf(startOfNumber(n)), `OLL ${n}`).toBe(family);
          expect(byNumber.get(n)!.group, `OLL ${n}`).toBe(family);
        }
      }
    });

    it('좌우를 뒤집으면 짝이 되는 번호가 나온다', () => {
      const PAIRS: readonly (readonly [number, number])[] = [
        [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [26, 27], [29, 30],
        [31, 32], [36, 38], [39, 40], [41, 42], [43, 44], [47, 48], [49, 50], [53, 54],
      ];
      const partner = new Map(PAIRS.flatMap(([a, b]) => [[a, b], [b, a]] as const));
      for (let n = 1; n <= 57; n++) {
        const other = partner.get(n) ?? n; // 짝이 없는 번호는 좌우 대칭이다
        expect(caseKey(startOf(mirrorAlg(movesOf(n)))), `OLL ${n} → ${other}`).toBe(caseKey(startOfNumber(other)));
      }
    });

    it('OLL 27은 Sune, OLL 26은 그 거꾸로이자 좌우 대칭인 Antisune', () => {
      const sune = parseAlg("R U R' U R U2 R'");
      expect(caseKey(startOfNumber(27))).toBe(caseKey(startOf(sune)));
      // Sune을 거꾸로 한 공식이 푸는 케이스 = 완성 상태에 Sune을 한 상태
      expect(caseKey(startOfNumber(26))).toBe(caseKey(applyMoves(YELLOW_UP, sune)));
      expect(caseKey(startOfNumber(26))).toBe(caseKey(startOf(mirrorAlg(sune))));
      expect(caseKey(startOfNumber(26))).not.toBe(caseKey(startOfNumber(27)));
    });

    it('십자 7가지(21~27)의 모양과 잡는 방향', () => {
      // [위를 보는 노란 코너, 옆을 보는 노란 칸] — 대표 공식을 시작할 때의 방향이다.
      const EXPECTED: Readonly<Record<number, readonly [string[], string[]]>> = {
        21: [[], ['UBL:B', 'UBR:B', 'UFL:F', 'UFR:F']], // H: 마주 보는 두 면에 둘씩
        22: [[], ['UBL:L', 'UBR:B', 'UFL:L', 'UFR:F']], // Pi: 한 면에 둘, 그 양옆 면에 하나씩
        23: [['UFR', 'UFL'], ['UBL:B', 'UBR:B']], // 헤드라이트: 한 면에 둘
        24: [['UBR', 'UFR'], ['UBL:B', 'UFL:F']], // 이웃한 코너 둘이 서로 반대쪽을 본다
        25: [['UBR', 'UFL'], ['UBL:L', 'UFR:F']], // 대각선 코너 둘
        26: [['UBR'], ['UBL:L', 'UFL:F', 'UFR:R']],
        27: [['UFL'], ['UBL:B', 'UBR:R', 'UFR:F']],
      };
      for (const [n, [up, side]] of Object.entries(EXPECTED)) {
        const s = startOfNumber(Number(n));
        expect(upIndexes(s, CORNERS).map((i) => CORNERS[i]), `OLL ${n}`).toEqual(up);
        expect(sideYellows(s), `OLL ${n}`).toEqual(side);
      }
    });

    it('옆면에 보이는 노란 칸 수로 같은 묶음 안의 번호를 가린다', () => {
      const EXPECTED: Readonly<Record<number, string>> = {
        1: '1313', // 마주 보는 두 면이 3칸 모두 노란색
        2: '1232', // 한 면만 3칸 모두 노란색
        18: '1113', // 한 면이 3칸 모두 노란색
        19: '1212',
        20: '1111',
        21: '0202',
        22: '0121',
        23: '0002',
        24: '0101',
        25: '0011',
        28: '0011',
        33: '0202', // T: 덜 맞은 두 코너가 서로 반대쪽을 본다
        45: '0121', // T: 덜 맞은 두 코너가 같은 쪽을 본다
        34: '1111', // C: 덜 맞은 두 코너가 서로 반대쪽을 본다
        46: '0103', // C: 한 면이 3칸 모두 노란색
        55: '0303', // 일자: 마주 보는 두 면이 3칸 모두 노란색
        56: '1212',
        57: '0101',
      };
      for (const [n, counts] of Object.entries(EXPECTED)) {
        expect(sideCounts(startOfNumber(Number(n))), `OLL ${n}`).toBe(counts);
      }
    });
  });
});
