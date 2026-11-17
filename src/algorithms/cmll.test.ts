import { describe, expect, it } from 'vitest';
import {
  FACELETS,
  applyMoves,
  invertMove,
  isRotation,
  type BaseMove,
  type CubeState,
  type Face,
  type Move,
} from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { invertAlg, parseAlg } from '../core/notation';
import { colorAt } from '../core/pieces';
import { CMLL_CASES } from './cmll';

const YELLOW = 3;
const U_TURNS: readonly Move[][] = ['', 'U', 'U2', "U'"].map(parseAlg);

// 위에서 볼 때 시계 방향 순서. U를 돌리면 i번 자리의 코너가 i+1번 자리로 간다.
const CORNERS = ['UBL', 'UBR', 'UFR', 'UFL'];
/** 코너마다 스티커를 시계 방향으로 읽는 순서 (윗면부터) */
const STICKERS: readonly (readonly Face[])[] = [
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
];
const SIDES: readonly Face[] = ['B', 'R', 'F', 'L'];

/** 양쪽 블록의 칸 (왼쪽·오른쪽 층에서 윗층을 뺀 것, 센터 포함) */
const BLOCK_CELLS = FACELETS.flatMap((f, i) => (f.pos[0] !== 0 && f.pos[1] !== 1 ? [i] : []));
const blocksIntact = (s: CubeState) => BLOCK_CELLS.every((i) => s[i] === YELLOW_UP[i]);

/** 윗층 코너의 상태: 자리마다 [어느 코너인지(0~3), 노란색이 몇 번째 스티커에 있는지(0 = 위)] */
type CornerState = readonly (readonly [number, number])[];

const sideKey = (colors: readonly number[]) => [...colors].sort().join('');
const HOME_KEYS = CORNERS.map((c, i) => sideKey(STICKERS[i].slice(1).map((f) => colorAt(YELLOW_UP, c, f))));

function readCorners(s: CubeState): CornerState {
  return CORNERS.map((corner, i) => {
    const colors = STICKERS[i].map((f) => colorAt(s, corner, f));
    const twist = colors.indexOf(YELLOW);
    const piece = HOME_KEYS.indexOf(sideKey(colors.filter((_, k) => k !== twist)));
    if (twist < 0 || piece < 0) throw new Error(`윗층 코너가 아님: ${corner}`);
    return [piece, twist] as const;
  });
}

/**
 * 공식 앞에서 U를 a번, 뒤에서 U를 b번 돌린 16가지 중 가장 작은 것. 같은 케이스면 같은 값이 나온다.
 * 앞에서 돌리면 코너 번호가 a만큼 밀리고, 뒤에서 돌리면 자리가 b만큼 밀린다.
 */
function canonical(state: CornerState): string {
  const keys: string[] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      keys.push(
        [0, 1, 2, 3]
          .map((i) => {
            const [piece, twist] = state[(i + b) % 4];
            return `${(piece + a) % 4}${twist}`;
          })
          .join(' '),
      );
    }
  }
  return keys.sort()[0];
}

const SOLVED_KEY = canonical([0, 1, 2, 3].map((i) => [i, 0] as const));

/** 공식이 푸는 케이스: 완성 상태에 공식을 거꾸로 적용한 상태 */
const startOf = (moves: readonly Move[]) => applyMoves(YELLOW_UP, invertAlg(moves));
const caseKey = (alg: string) => canonical(readCorners(startOf(parseAlg(alg))));

const cornersSolved = (s: CubeState) => canonical(readCorners(s)) === SOLVED_KEY;

/** 나올 수 있는 모든 코너 상태 (자리 4! × 방향 3³ = 648가지)를 공식 없이 직접 만든다. */
function allCornerStates(): CornerState[] {
  const perms: number[][] = [];
  const build = (cur: number[]) => {
    if (cur.length === 4) perms.push(cur);
    else for (let i = 0; i < 4; i++) if (!cur.includes(i)) build([...cur, i]);
  };
  build([]);
  const out: CornerState[] = [];
  for (const perm of perms) {
    for (let code = 0; code < 81; code++) {
      const twists = [code % 3, Math.floor(code / 3) % 3, Math.floor(code / 9) % 3, Math.floor(code / 27)];
      // 코너 방향의 합은 3의 배수여야 한다.
      if (twists.reduce((a, b) => a + b, 0) % 3 !== 0) continue;
      out.push(perm.map((piece, i) => [piece, twists[i]] as const));
    }
  }
  return out;
}

/** 노란색이 위를 보는 코너의 자리 번호들 */
const upCorners = (s: CubeState) => CORNERS.flatMap((c, i) => (colorAt(s, c, 'U') === YELLOW ? [i] : []));
/** 옆면마다 보이는 노란 코너 칸 수 (B, R, F, L 순서) */
const sideCounts = (s: CubeState) =>
  SIDES.map((side, i) => [CORNERS[i], CORNERS[(i + 1) % 4]].filter((c) => colorAt(s, c, side) === YELLOW).length);

/** 노란색이 어디를 보는지만으로 묶음을 정한다 (코너를 읽는 방식과 따로 계산한다). */
function familyOf(s: CubeState): string {
  const up = upCorners(s);
  const counts = sideCounts(s);
  if (up.length === 4) return 'O';
  if (up.length === 0) return counts.filter((n) => n === 2).length === 2 ? 'H' : 'Pi';
  if (up.length === 2) {
    if ((up[1] - up[0]) % 2 === 0) return 'L';
    return counts.includes(2) ? 'U' : 'T';
  }
  if (up.length !== 1) return '?';
  // 노란색이 위인 코너를 앞-왼쪽에 두면, 앞-오른쪽 코너의 노란색이 Sune은 앞, Antisune은 오른쪽을 본다.
  const turned = U_TURNS.map((u) => applyMoves(s, u)).find((t) => colorAt(t, 'UFL', 'U') === YELLOW)!;
  return colorAt(turned, 'UFR', 'F') === YELLOW ? 'Sune' : 'Antisune';
}

const MIRROR_BASE: Partial<Record<BaseMove, BaseMove>> = { R: 'L', L: 'R', r: 'l', l: 'r' };

/** 좌우를 뒤집은 공식. 좌우 축으로 도는 M과 x만 방향이 그대로다. */
function mirrorAlg(moves: readonly Move[]): Move[] {
  return moves.map((m) =>
    m.base === 'M' || m.base === 'x' ? m : invertMove({ base: MIRROR_BASE[m.base] ?? m.base, amount: m.amount }),
  );
}

const FAMILY_SIZES: Readonly<Record<string, number>> = {
  O: 2,
  H: 4,
  Pi: 6,
  U: 6,
  T: 6,
  Sune: 6,
  Antisune: 6,
  L: 6,
};

const byName = new Map(CMLL_CASES.map((c) => [c.name, c]));
const allAlgs = CMLL_CASES.flatMap((c) => [c.alg, ...(c.alts ?? [])].map((alg) => ({ id: c.id, alg })));
/** 'H 1' → 'H', 'O Adj' → 'O' */
const familyOfName = (name: string) => name.split(' ')[0];

describe('CMLL 공식', () => {
  it('42가지가 묶음 순서대로 있고 id와 이름이 규칙에 맞다', () => {
    expect(CMLL_CASES.length).toBe(42);
    expect(new Set(CMLL_CASES.map((c) => c.id)).size).toBe(42);
    expect(new Set(CMLL_CASES.map((c) => c.name)).size).toBe(42);
    const expectedNames = Object.entries(FAMILY_SIZES).flatMap(([family, size]) =>
      family === 'O' ? ['O Adj', 'O Diag'] : Array.from({ length: size }, (_, i) => `${family} ${i + 1}`),
    );
    expect(CMLL_CASES.map((c) => c.name)).toEqual(expectedNames);
    for (const c of CMLL_CASES) {
      expect(c.id, c.name).toMatch(/^cmll-[a-z]+-[a-z0-9]+$/);
      expect(c.group.startsWith(`${familyOfName(c.name)} (`), `${c.name}: ${c.group}`).toBe(true);
    }
    // 직접 외운 표준 공식만 쓴다. 컴퓨터로 찾은 공식은 없다.
    expect(CMLL_CASES.filter((c) => c.note === '컴퓨터로 찾은 공식')).toEqual([]);
  });

  it('모든 공식(alts 포함)이 양쪽 블록은 그대로 두고, 덜 맞은 윗층 코너 4개를 맞춘다', () => {
    for (const { id, alg } of allAlgs) {
      const moves = parseAlg(alg);
      // 풀이기는 처음 잡은 방향을 끝까지 유지하므로 큐브를 통째로 돌리는 동작은 쓰지 않는다.
      expect(moves.some(isRotation), `${id}: ${alg}`).toBe(false);
      const s = startOf(moves);
      expect(blocksIntact(s), `${id}: ${alg}`).toBe(true);
      expect(cornersSolved(s), `${id}: ${alg}`).toBe(false);
      const done = applyMoves(s, moves);
      expect(blocksIntact(done), `${id}: ${alg}`).toBe(true);
      // U를 돌리지 않아도 코너가 제자리다.
      expect(readCorners(done), `${id}: ${alg}`).toEqual([0, 1, 2, 3].map((i) => [i, 0]));
    }
  });

  it('앞뒤로 U를 돌려도 같은 케이스로 읽는다', () => {
    for (const c of CMLL_CASES) {
      const key = caseKey(c.alg);
      for (const pre of U_TURNS) {
        for (const post of U_TURNS) {
          const s = applyMoves(YELLOW_UP, [...pre, ...invertAlg(parseAlg(c.alg)), ...post]);
          expect(canonical(readCorners(s)), c.id).toBe(key);
        }
      }
    }
  });

  it('42가지가 서로 다른 케이스다', () => {
    const keys = new Map<string, string>();
    for (const c of CMLL_CASES) {
      const key = caseKey(c.alg);
      expect(keys.get(key), `${c.id}와 같은 케이스`).toBeUndefined();
      keys.set(key, c.id);
    }
    expect(keys.size).toBe(42);
  });

  it('나올 수 있는 코너 상태 648가지는 (다 맞은 것을 빼고) 42가지 케이스이고, 모두 공식이 있다', () => {
    const states = allCornerStates();
    expect(states.length).toBe(648);
    const classes = new Set(states.map(canonical));
    expect(classes.has(SOLVED_KEY)).toBe(true);
    classes.delete(SOLVED_KEY);
    expect(classes.size).toBe(42);
    const covered = new Set(CMLL_CASES.map((c) => caseKey(c.alg)));
    for (const key of classes) expect(covered.has(key), `공식이 없는 케이스: ${key}`).toBe(true);
  });

  it('alts는 대표 공식과 같은 케이스를 푼다', () => {
    for (const c of CMLL_CASES) {
      for (const alt of c.alts ?? []) expect(caseKey(alt), `${c.id}: ${alt}`).toBe(caseKey(c.alg));
    }
  });

  describe('이름과 모양이 맞는다', () => {
    it('노란색이 보는 방향으로 정한 묶음이 이름, 그리고 group과 같다', () => {
      const counts: Record<string, number> = {};
      for (const c of CMLL_CASES) {
        const family = familyOf(startOf(parseAlg(c.alg)));
        expect(family, c.name).toBe(familyOfName(c.name));
        counts[family] = (counts[family] ?? 0) + 1;
      }
      expect(counts).toEqual(FAMILY_SIZES);
    });

    it('O 두 가지는 이웃한 코너 교환과 대각선 코너 교환이다', () => {
      // 제자리에 있는 코너 수가 가장 많게 U를 맞췄을 때: 이웃 교환은 2개, 대각선 교환도 2개지만 자리가 다르다.
      const moved = (name: string) => {
        const s = startOf(parseAlg(byName.get(name)!.alg));
        return U_TURNS.map((u) => readCorners(applyMoves(s, u)).flatMap(([piece], i) => (piece === i ? [] : [i])))
          .filter((list) => list.length === 2)
          .map(([a, b]) => (b - a) % 2 === 0);
      };
      // 대각선 교환은 어떻게 돌려도 "이웃한 두 자리만 틀린" 모습이 되지 않는다.
      expect(moved('O Adj').some((diagonal) => !diagonal)).toBe(true);
      expect(moved('O Diag').length).toBeGreaterThan(0);
      expect(moved('O Diag').every((diagonal) => diagonal)).toBe(true);
    });

    it('Sune 1은 Sune, Antisune 1은 그 좌우 대칭이다', () => {
      const sune = "R U R' U R U2 R'";
      expect(caseKey(byName.get('Sune 1')!.alg)).toBe(caseKey(sune));
      expect(caseKey(byName.get('Antisune 1')!.alg)).toBe(canonical(readCorners(startOf(mirrorAlg(parseAlg(sune))))));
    });

    it('좌우를 뒤집으면 짝이 되는 케이스가 나온다', () => {
      const PAIRS: readonly (readonly [string, string])[] = [
        ['Pi 2', 'Pi 4'],
        ['U 1', 'U 2'],
        ['T 1', 'T 2'],
        ['Sune 1', 'Antisune 1'],
        ['Sune 2', 'Antisune 4'],
        ['Sune 3', 'Antisune 3'],
        ['Sune 4', 'Antisune 2'],
        ['Sune 5', 'Antisune 6'],
        ['Sune 6', 'Antisune 5'],
        ['L 1', 'L 2'],
        ['L 4', 'L 6'],
      ];
      const partner = new Map(PAIRS.flatMap(([a, b]) => [[a, b], [b, a]] as const));
      const nameOfKey = new Map(CMLL_CASES.map((c) => [caseKey(c.alg), c.name]));
      for (const c of CMLL_CASES) {
        const other = partner.get(c.name) ?? c.name; // 짝이 없는 케이스는 좌우 대칭이다
        const mirrored = canonical(readCorners(startOf(mirrorAlg(parseAlg(c.alg)))));
        expect(nameOfKey.get(mirrored), `${c.name} → ${other}`).toBe(other);
      }
    });
  });
});
