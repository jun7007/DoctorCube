/**
 * Roux 과정의 글이 실제 큐브와 맞는지 확인한다.
 * 목표(블록, 코너, 엣지 방향 등)는 풀이기를 거치지 않고 YELLOW_UP과 칸을 직접 견주어 판단한다.
 */
import { describe, expect, it } from 'vitest';
import { CMLL_CASES } from '../../algorithms/cmll';
import { F2L_CASES } from '../../algorithms/f2l';
import { OLL_CASES } from '../../algorithms/oll';
import { PLL_CASES } from '../../algorithms/pll';
import { TWO_LOOK_OLL_CORNERS, TWO_LOOK_OLL_EDGES, TWO_LOOK_PLL_CORNERS } from '../../algorithms/twoLook';
import {
  FACELETS,
  SOLVED,
  applyMove,
  applyMoves,
  invertMove,
  isRotation,
  isSolved,
  type CubeState,
  type Face,
  type Move,
} from '../../core/cube';
import { YELLOW_UP } from '../../core/frames';
import { algToString, invertAlg, parseAlg } from '../../core/notation';
import { colorAt, facelet, homeOf } from '../../core/pieces';
import { generateScramble } from '../../core/scramble';
import { ALG } from '../../solvers/beginner';
import { solveCfop } from '../../solvers/cfop';
import { solveRoux } from '../../solvers/roux';
import { stageMoves } from '../../solvers/types';
import type { Lesson, LessonStep } from './courses';
import { METHODS, resolveStep } from './resolve';
import { rouxCourse } from './rouxCourse';

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────── 색과 칸 ─────────
// 색 번호: 0 흰색, 1 빨강, 2 초록, 3 노랑, 4 주황, 5 파랑. YELLOW_UP에서 위 노랑, 앞 초록, 왼쪽 빨강, 오른쪽 주황.
const W = 0;
const R = 1;
const G = 2;
const Y = 3;
const O = 4;
const B = 5;
const U_CENTER = 4;
const F_CENTER = 2 * 9 + 4;

/** 잡은 방향(YELLOW_UP) 기준 좌표로 칸을 고른다: x 오른쪽, y 위, z 앞 */
const cellsWhere = (test: (pos: readonly number[]) => boolean) => FACELETS.flatMap((f, i) => (test(f.pos) ? [i] : []));
const LEFT_BLOCK = cellsWhere(([x, y]) => x === -1 && y !== 1);
const RIGHT_BLOCK = cellsWhere(([x, y]) => x === 1 && y !== 1);
const BLOCKS = [...LEFT_BLOCK, ...RIGHT_BLOCK];
/** 왼쪽·오른쪽 뒤의 1×2×2 사각형 (센터, 아래 엣지, 뒤쪽 코너와 엣지) */
const LEFT_SQUARE = cellsWhere(([x, y, z]) => x === -1 && y !== 1 && z !== 1);
const RIGHT_SQUARE = cellsWhere(([x, y, z]) => x === 1 && y !== 1 && z !== 1);
const RIGHT_CENTER = cellsWhere(([x, y, z]) => x === 1 && y === 0 && z === 0);
const TOP_CORNERS = cellsWhere(([x, y, z]) => y === 1 && x !== 0 && z !== 0);
/** 윗층 왼쪽·오른쪽 엣지 */
const SIDE_EDGES = cellsWhere(([x, y, z]) => y === 1 && x !== 0 && z === 0);
/** 가운데 줄: 센터 4개와 엣지 4개 */
const M_SLICE = cellsWhere(([x]) => x === 0);
const ALL_CELLS = FACELETS.map((_, i) => i);

const matches = (s: CubeState, cells: readonly number[]) => cells.every((i) => s[i] === YELLOW_UP[i]);
const same = (a: CubeState, b: CubeState) => a.every((c, i) => c === b[i]);
const alg = (text: string) => parseAlg(text);
const run = (s: CubeState, text: string) => applyMoves(s, alg(text));
const U_TURNS: readonly Move[][] = ['', 'U', 'U2', "U'"].map(alg);

// ───────── 조각 ─────────
const EDGES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'];
const CORNERS = ['UFR', 'UFL', 'UBR', 'UBL', 'DFR', 'DFL', 'DBR', 'DBL'];
const POSITIONS = [...EDGES, ...CORNERS];
const col = (s: CubeState, pos: string, face: string) => colorAt(s, pos, face as Face);
const pieceKey = (s: CubeState, pos: string) =>
  [...pos]
    .map((f) => col(s, pos, f))
    .sort()
    .join('');
const HOME_BY_KEY = new Map(POSITIONS.map((p) => [pieceKey(YELLOW_UP, p), p]));
/** 제자리가 piece인 조각이 지금 있는 자리 (YELLOW_UP 기준 이름) */
const where = (s: CubeState, piece: string) => POSITIONS.find((p) => HOME_BY_KEY.get(pieceKey(s, p)) === piece)!;
const cellsOf = (pos: string) => [...pos].map((f) => facelet(pos, f as Face));
/** 조각이 제자리에 바른 방향으로 있는지 */
const home = (s: CubeState, piece: string) => matches(s, cellsOf(piece));

// ───────── 단계별 목표 ─────────
const centersHome = (s: CubeState) => s[U_CENTER] === Y && s[F_CENTER] === G;
const leftSquare = (s: CubeState) => matches(s, LEFT_SQUARE);
const firstBlock = (s: CubeState) => matches(s, LEFT_BLOCK);
const rightSquare = (s: CubeState) => matches(s, RIGHT_SQUARE);
const blocks = (s: CubeState) => matches(s, BLOCKS);
const cornersHome = (s: CubeState) => blocks(s) && matches(s, TOP_CORNERS);
/** 블록이 되어 있고, 윗층 코너가 U만 돌리면 맞는지 */
const cornersUpToU = (s: CubeState) => blocks(s) && U_TURNS.some((u) => matches(applyMoves(s, u), TOP_CORNERS));

const LSE_POSITIONS = ['UF', 'UL', 'UB', 'UR', 'DF', 'DB'];
/** 윗면 센터가 노란색이나 흰색인지 */
const aligned = (s: CubeState) => s[U_CENTER] === Y || s[U_CENTER] === W;
/** 나쁜 엣지: 위·아래를 보는 스티커가 노란색도 흰색도 아닌 자리 */
const badEdges = (s: CubeState) => LSE_POSITIONS.filter((p) => col(s, p, p[0]) !== Y && col(s, p, p[0]) !== W);
/** 4a 끝: 코너까지 된 상태에서 엣지 방향이 모두 맞음 */
const eoDone = (s: CubeState) => cornersUpToU(s) && aligned(s) && badEdges(s).length === 0;
/** 4b 끝: 엣지 방향이 맞고, 코너와 왼쪽·오른쪽 엣지가 제자리 */
const sideEdgesDone = (s: CubeState) => eoDone(s) && cornersHome(s) && matches(s, SIDE_EDGES);
const yellowUpCorners = (s: CubeState) => ['UBL', 'UBR', 'UFR', 'UFL'].filter((c) => col(s, c, 'U') === Y);

// ───────── 과정 읽기 ─────────
const lessonOf = (id: string): Lesson => rouxCourse.lessons.find((l) => l.id === id)!;
const keyOf = (lesson: Lesson, step: LessonStep) => `${lesson.id}/${step.title}`;
const ALL_STEPS = rouxCourse.lessons.flatMap((lesson) => lesson.steps.map((step) => ({ lesson, step, key: keyOf(lesson, step) })));
const stepOf = (key: string) => ALL_STEPS.find((x) => x.key === key)!.step;
const flat = (p: ReturnType<typeof resolveStep>) => p.groups.flatMap((g) => g.moves);
const startOf = (key: string) => resolveStep(rouxCourse, stepOf(key)).start;
const endOf = (key: string) => {
  const p = resolveStep(rouxCourse, stepOf(key));
  return applyMoves(p.start, flat(p));
};

// ───────── 손으로 만든 예시마다 글이 말하는 것 ─────────

interface Claim {
  /** 시작 모습에서 성립해야 하는 것 */
  before: (s: CubeState) => void;
  /** n수를 돌린 뒤에 성립해야 하는 것 */
  mid?: Readonly<Record<number, (s: CubeState) => void>>;
  /** 동작을 다 한 뒤에 성립해야 하는 것 (동작이 있는 단계는 꼭 적는다) */
  after?: (s: CubeState) => void;
  /** 한 수 한 수 뒤에 늘 지켜져야 하는 것 */
  keep?: (s: CubeState) => boolean;
  /** 쓸 수 있는 동작 글자 */
  only?: string;
}

const yes = (value: boolean, what: string) => expect(value, what).toBe(true);
const no = (value: boolean, what: string) => expect(value, what).toBe(false);
/** 조각 둘이 짝으로 붙어 있는지: 두 면에서 같은 색끼리 닿아 있다 */
const paired = (s: CubeState, corner: string, edge: string, faces: readonly [string, number][]) => {
  for (const [face, color] of faces) {
    expect(col(s, corner, face), `${corner}의 ${face}`).toBe(color);
    expect(col(s, edge, face), `${edge}의 ${face}`).toBe(color);
  }
};

const EDGES_MIXED = run(YELLOW_UP, "M U M2 U' M");

/** CMLL 예시: 공식 전에는 블록만, 공식 뒤에는 코너까지 맞고 엣지는 섞여 있다 */
const cmllClaim = (key: string, id: string, pattern: (s: CubeState) => void): Claim => ({
  before: (s) => {
    // 이 단계가 보여 주는 것은 공식 모음의 그 공식 그대로다.
    const found = CMLL_CASES.find((c) => c.id === id)!;
    expect(stepOf(key).alg).toBe(found.alg);
    expect(stepOf(key).title).toContain(found.name);
    expect(stepOf(key).body.at(-1)).toBe(`공식: ${found.alg}`);
    yes(blocks(s), '블록 두 개');
    yes(centersHome(s), '센터 제자리');
    no(cornersUpToU(s), '코너는 아직');
    pattern(s);
  },
  after: (s) => {
    yes(cornersHome(s), '코너 제자리');
    no(isSolved(s), '엣지는 아직');
    yes(same(s, EDGES_MIXED), '엣지만 섞인 상태');
  },
});

const CMLL_U6 = 'roux-cmll/예시: U 6 (노란 십자 공식)';
const CMLL_SUNE = 'roux-cmll/예시: Sune 1 (2-Look OLL의 Sune)';
const CMLL_ANTISUNE = 'roux-cmll/예시: Antisune 1 (Sune과 회전 방향이 반대)';

const CLAIMS: Readonly<Record<string, Claim>> = {
  'roux-intro/M과 r: 가운데 줄을 돌리는 동작': {
    before: (s) => yes(same(s, YELLOW_UP), '완성 상태'),
    mid: {
      // M: 윗면의 가운데 줄이 앞으로 내려온다.
      1: (s) => {
        expect(s[F_CENTER]).toBe(Y);
        expect(col(s, 'DF', 'F')).toBe(col(YELLOW_UP, 'UF', 'U'));
        yes(blocks(s), '양옆은 그대로');
      },
      2: (s) => yes(same(s, YELLOW_UP), "M'은 M의 반대"),
      // r: 오른쪽 면과 가운데 줄이 R 방향으로 함께 돈다.
      3: (s) => yes(same(s, run(YELLOW_UP, "R M'")), "r = R + M'"),
    },
    after: (s) => yes(same(s, YELLOW_UP), '제자리'),
  },

  // ───── 첫 번째 블록 ─────
  'roux-fb/만드는 순서: 사각형 먼저, 그다음 짝': {
    before: (s) => {
      yes(leftSquare(s), '뒤쪽 사각형');
      no(firstBlock(s), '블록은 아직');
    },
  },
  'roux-fb/예시 1-가: 사각형 만들기': {
    before: (s) => {
      yes(centersHome(s), '센터 제자리');
      no(leftSquare(s), '사각형은 아직');
      no(home(s, 'DL'), '아래 엣지도 아직');
      expect(where(s, 'DL')).toBe('DR');
      expect(where(s, 'DBL')).toBe('UBL');
      expect(where(s, 'BL')).toBe('UR');
    },
    mid: {
      1: (s) => yes(home(s, 'DL'), '흰색-빨강 엣지 제자리'),
      2: (s) => {
        expect([where(s, 'DBL'), where(s, 'BL')]).toEqual(['UBR', 'UR']);
        paired(s, 'UBR', 'UR', [
          ['U', R],
          ['R', B],
        ]);
      },
      3: (s) => expect([where(s, 'DBL'), where(s, 'BL')]).toEqual(['UBL', 'UB']),
    },
    after: (s) => {
      yes(leftSquare(s), '사각형');
      no(firstBlock(s), '블록은 아직');
    },
  },
  'roux-fb/예시 1-나: 남은 짝 넣기': {
    before: (s) => {
      yes(leftSquare(s), '사각형');
      no(firstBlock(s), '블록은 아직');
      expect(where(s, 'DFL')).toBe('UFL');
      expect(where(s, 'FL')).toBe('UR');
    },
    mid: {
      1: (s) => {
        expect([where(s, 'DFL'), where(s, 'FL')]).toEqual(['UFR', 'UR']);
        paired(s, 'UFR', 'UR', [
          ['U', R],
          ['R', G],
        ]);
      },
      2: (s) => expect([where(s, 'DFL'), where(s, 'FL')]).toEqual(['UFL', 'UF']),
    },
    keep: leftSquare,
    after: (s) => {
      yes(firstBlock(s), '첫 번째 블록');
      yes(same(s, YELLOW_UP), '나머지도 그대로');
    },
  },
  'roux-fb/예시 2: 가운데 줄에서 엣지 데려오기': {
    before: (s) => {
      yes(centersHome(s), '센터 제자리');
      no(firstBlock(s), '블록은 아직');
      for (const piece of ['DL', 'DBL', 'BL', 'DFL', 'FL']) no(home(s, piece), `${piece}는 아직`);
      expect(where(s, 'DL')).toBe('DF');
      expect([where(s, 'DBL'), where(s, 'BL')]).toEqual(['UBR', 'UR']);
      paired(s, 'UBR', 'UR', [
        ['U', R],
        ['R', B],
      ]);
      expect([where(s, 'DFL'), where(s, 'FL')]).toEqual(['UFL', 'UB']);
    },
    mid: {
      1: (s) => yes(home(s, 'DL'), '흰색-빨강 엣지 제자리'),
      2: (s) => {
        expect([where(s, 'DFL'), where(s, 'FL')]).toEqual(['UFL', 'UF']);
        paired(s, 'UFL', 'UF', [
          ['U', R],
          ['F', G],
        ]);
      },
      3: (s) => yes(home(s, 'DFL') && home(s, 'FL'), '앞쪽 짝 제자리'),
      4: (s) => expect([where(s, 'DBL'), where(s, 'BL')]).toEqual(['UBL', 'UB']),
    },
    after: (s) => {
      yes(firstBlock(s), '첫 번째 블록');
      expect(s[U_CENTER], '윗면 센터는 파랑').toBe(B);
      yes(same(s, run(YELLOW_UP, 'M')), '가운데 줄만 돌아가 있음');
    },
  },

  // ───── 두 번째 블록 ─────
  'roux-sb/예시 1-가: 아래 엣지 놓기': {
    before: (s) => {
      yes(centersHome(s), '센터 제자리');
      yes(firstBlock(s), '첫 번째 블록');
      for (const piece of ['DR', 'DBR', 'BR', 'DFR', 'FR']) no(home(s, piece), `${piece}는 아직`);
      expect(where(s, 'DR')).toBe('DF');
      expect(col(s, 'DF', 'F')).toBe(W);
    },
    mid: {
      1: (s) => expect(where(s, 'DR')).toBe('UF'),
      2: (s) => expect(where(s, 'DR')).toBe('UR'),
    },
    keep: firstBlock,
    only: 'RrUM',
    after: (s) => {
      yes(home(s, 'DR'), '흰색-주황 엣지 제자리');
      no(rightSquare(s), '사각형은 아직');
      expect(s[U_CENTER], '윗면 센터는 초록').toBe(G);
    },
  },
  'roux-sb/예시 1-나: 뒤쪽 짝 넣기': {
    before: (s) => {
      yes(firstBlock(s), '첫 번째 블록');
      yes(home(s, 'DR'), '아래 엣지');
      no(rightSquare(s), '사각형은 아직');
      expect([where(s, 'DBR'), where(s, 'BR')]).toEqual(['UBL', 'UB']);
      paired(s, 'UBL', 'UB', [
        ['U', B],
        ['B', O],
      ]);
    },
    mid: { 2: (s) => expect([where(s, 'DBR'), where(s, 'BR')]).toEqual(['UBR', 'UR']) },
    keep: firstBlock,
    only: 'RrUM',
    after: (s) => {
      yes(rightSquare(s), '오른쪽 뒤 사각형');
      no(blocks(s), '블록은 아직');
    },
  },
  'roux-sb/예시 1-다: 앞쪽 짝 넣기': {
    before: (s) => {
      yes(firstBlock(s), '첫 번째 블록');
      yes(rightSquare(s), '오른쪽 뒤 사각형');
      no(blocks(s), '블록은 아직');
      expect([where(s, 'DFR'), where(s, 'FR')]).toEqual(['UFR', 'UR']);
      paired(s, 'UFR', 'UR', [
        ['U', G],
        ['R', O],
      ]);
      // U 다음은 F2L 기본 넣기의 공식 그대로다.
      expect(stepOf('roux-sb/예시 1-다: 앞쪽 짝 넣기').alg).toBe(`U ${F2L_CASES[2].alg}`);
    },
    mid: { 1: (s) => expect([where(s, 'DFR'), where(s, 'FR')]).toEqual(['UFL', 'UF']) },
    keep: firstBlock,
    only: 'RrUM',
    after: (s) => {
      yes(blocks(s), '블록 두 개');
      yes(same(s, run(YELLOW_UP, "M'")), '가운데 줄만 돌아가 있음');
    },
  },
  'roux-sb/예시 2: 엣지가 가운데 줄에 있을 때': {
    before: (s) => {
      yes(centersHome(s), '센터 제자리');
      yes(firstBlock(s), '첫 번째 블록');
      yes(rightSquare(s), '오른쪽 뒤 사각형');
      no(blocks(s), '블록은 아직');
      expect([where(s, 'DFR'), where(s, 'FR')]).toEqual(['UFL', 'DF']);
      // r 대신 R로는 풀리지 않는다.
      no(blocks(run(s, "R U' R'")), 'R로는 안 됨');
    },
    mid: {
      1: (s) => {
        expect([where(s, 'DFR'), where(s, 'FR')]).toEqual(['UFL', 'UF']);
        paired(s, 'UFL', 'UF', [
          ['U', G],
          ['F', O],
        ]);
      },
    },
    keep: firstBlock,
    only: 'RrUM',
    after: (s) => yes(same(s, YELLOW_UP), '완성'),
  },

  // ───── CMLL ─────
  'roux-cmll/CMLL이 맞추는 것': {
    before: (s) => {
      yes(cornersHome(s), '블록과 코너');
      yes(centersHome(s), '센터 제자리');
      no(isSolved(s), '엣지는 아직');
      expect(LSE_POSITIONS.filter((p) => !home(s, p)), '엣지 6개가 모두 섞여 있음').toHaveLength(6);
    },
  },
  [CMLL_U6]: cmllClaim(CMLL_U6, 'cmll-u-6', (s) => {
    // 초보자 공식의 노란 십자 공식, 2-Look OLL의 일자 공식과 같다.
    expect(stepOf(CMLL_U6).alg).toBe(ALG.yellowCross);
    expect(stepOf(CMLL_U6).alg).toBe(TWO_LOOK_OLL_EDGES.find((c) => c.id === '2l-oll-line')!.alg);
    expect(yellowUpCorners(s)).toEqual(['UBR', 'UFR']);
    expect([col(s, 'UBL', 'L'), col(s, 'UFL', 'L')]).toEqual([Y, Y]);
  }),
  [CMLL_SUNE]: cmllClaim(CMLL_SUNE, 'cmll-s-1', (s) => {
    expect(TWO_LOOK_OLL_CORNERS).toContain('oll-27');
    expect(stepOf(CMLL_SUNE).alg).toBe(OLL_CASES.find((c) => c.id === 'oll-27')!.alg);
    expect(yellowUpCorners(s)).toEqual(['UFL']);
    expect(col(s, 'UFR', 'F')).toBe(Y);
  }),
  [CMLL_ANTISUNE]: cmllClaim(CMLL_ANTISUNE, 'cmll-as-1', (s) => {
    // Sune의 회전을 하나하나 반대 방향으로 바꾼 것 (순서는 그대로)
    const sune = alg(CMLL_CASES.find((c) => c.id === 'cmll-s-1')!.alg);
    expect(stepOf(CMLL_ANTISUNE).alg).toBe(algToString(sune.map(invertMove)));
    expect(yellowUpCorners(s)).toEqual(['UBL']);
    expect(col(s, 'UFR', 'R')).toBe(Y);
  }),

  // ───── LSE ─────
  'roux-lse/남은 것과 세 단계': {
    before: (s) => {
      yes(cornersUpToU(s), '블록과 코너');
      no(isSolved(s), '엣지는 아직');
    },
  },
  'roux-lse/4a. 좋은 엣지와 나쁜 엣지': {
    before: (s) => {
      yes(cornersUpToU(s), '블록과 코너');
      yes(aligned(s), '윗면 센터가 노랑이나 흰색');
      expect(badEdges(s)).toEqual(['UF', 'UL', 'UR', 'DF']);
    },
  },
  "roux-lse/4a. 화살표 모양: M' U' M'": {
    before: (s) => {
      yes(cornersUpToU(s), '블록과 코너');
      yes(centersHome(s), '센터 제자리');
      expect(badEdges(s)).toEqual(['UF', 'UL', 'UR', 'DF']);
      expect(stepOf("roux-lse/4a. 화살표 모양: M' U' M'").alg).toBe("M' U' M'");
    },
    keep: blocks,
    only: 'MU',
    after: (s) => {
      yes(eoDone(s), '엣지 방향');
      expect(s[U_CENTER], '윗면 센터는 흰색').toBe(W);
      no(sideEdgesDone(s), '왼쪽·오른쪽 엣지는 아직');
    },
  },
  'roux-lse/4a. 나쁜 엣지가 둘일 때': {
    before: (s) => {
      yes(cornersUpToU(s), '블록과 코너');
      yes(centersHome(s), '센터 제자리');
      expect(badEdges(s)).toEqual(['UF', 'UB']);
    },
    mid: {
      3: (s) => {
        yes(aligned(s), '윗면 센터가 노랑이나 흰색');
        expect(badEdges(s)).toEqual(['UF', 'UL', 'UB', 'DF']);
      },
      4: (s) => expect(badEdges(s)).toEqual(['UF', 'UL', 'UR', 'DF']),
    },
    keep: blocks,
    only: 'MU',
    after: (s) => {
      yes(eoDone(s), '엣지 방향');
      // 끝나면 다음 예시(4b)의 시작 모습과 같다.
      yes(same(s, startOf('roux-lse/4b. 왼쪽·오른쪽 엣지: 둘 다 아래에 있을 때')), '4b 예시로 이어짐');
    },
  },
  'roux-lse/4b. 왼쪽·오른쪽 엣지: 둘 다 아래에 있을 때': {
    before: (s) => {
      yes(eoDone(s), '엣지 방향');
      yes(cornersHome(s), '코너 제자리');
      no(home(s, 'UL') || home(s, 'UR'), '왼쪽·오른쪽 엣지는 아직');
      expect([where(s, 'UL'), where(s, 'UR')]).toEqual(['DB', 'DF']);
      expect(stepOf('roux-lse/4b. 왼쪽·오른쪽 엣지: 둘 다 아래에 있을 때').alg).toBe("U' M2 U");
    },
    mid: {
      1: (s) => expect([col(s, 'UFL', 'F'), col(s, 'UFR', 'F')]).toEqual([R, R]),
      2: (s) => {
        expect(['UFL', 'UF', 'UFR'].map((p) => col(s, p, 'F'))).toEqual([R, R, R]);
        expect(['UBL', 'UB', 'UBR'].map((p) => col(s, p, 'B'))).toEqual([O, O, O]);
      },
    },
    keep: (s) => blocks(s) && badEdges(s).length === 0,
    only: 'MU',
    after: (s) => {
      yes(sideEdgesDone(s), '왼쪽·오른쪽 엣지');
      no(isSolved(s), '가운데 줄은 아직');
    },
  },
  'roux-lse/4c. 가운데 줄: 엣지 셋이 돌아가며 바뀐 경우': {
    before: (s) => {
      yes(sideEdgesDone(s), '왼쪽·오른쪽 엣지');
      yes(centersHome(s), '센터 제자리');
      no(isSolved(s), '가운데 줄은 아직');
      expect(['UF', 'UB', 'DF', 'DB'].filter((p) => home(s, p))).toEqual(['DB']);
      expect(stepOf('roux-lse/4c. 가운데 줄: 엣지 셋이 돌아가며 바뀐 경우').alg).toBe("M' U2 M U2");
    },
    keep: blocks,
    only: 'MU',
    after: (s) => yes(same(s, YELLOW_UP), '완성'),
  },
  'roux-lse/4b. 하나는 위에, 하나는 아래에 있을 때': {
    before: (s) => {
      yes(eoDone(s), '엣지 방향');
      no(home(s, 'UL') || home(s, 'UR'), '왼쪽·오른쪽 엣지는 아직');
      expect([where(s, 'UR'), where(s, 'UL')]).toEqual(['UB', 'DF']);
      // 이대로 M2를 하면 둘이 자리만 맞바꾼다.
      const swapped = run(s, 'M2');
      expect([where(swapped, 'UR'), where(swapped, 'UL')]).toEqual(['DF', 'UB']);
    },
    mid: {
      3: (s) => {
        yes(eoDone(s), '엣지 방향은 그대로');
        yes(cornersHome(s), '코너 제자리');
        expect([where(s, 'UL'), where(s, 'UR')]).toEqual(['DF', 'DB']);
      },
    },
    keep: blocks,
    only: 'MU',
    after: (s) => {
      yes(sideEdgesDone(s), '왼쪽·오른쪽 엣지');
      no(isSolved(s), '가운데 줄은 아직');
    },
  },
  'roux-lse/4c. 앞뒤가 서로 바뀐 경우': {
    before: (s) => {
      yes(sideEdgesDone(s), '왼쪽·오른쪽 엣지');
      yes(centersHome(s), '센터 제자리');
      expect(['UF', 'UB', 'DF', 'DB'].map((p) => where(s, p))).toEqual(['UB', 'UF', 'DB', 'DF']);
      expect(stepOf('roux-lse/4c. 앞뒤가 서로 바뀐 경우').alg).toBe('U2 M2 U2 M2');
    },
    keep: blocks,
    only: 'MU',
    after: (s) => yes(same(s, YELLOW_UP), '완성'),
  },
};

// ───────── 강조하는 조각 ─────────

const FOCUS_SETS = {
  left: LEFT_BLOCK,
  /** 풀이기 단계의 기본값: 왼쪽 블록과 오른쪽 센터 */
  leftAndCenter: [...LEFT_BLOCK, ...RIGHT_CENTER],
  blocks: BLOCKS,
  cmll: [...BLOCKS, ...TOP_CORNERS],
  lse: [...M_SLICE, ...SIDE_EDGES],
  sideEdges: [...TOP_CORNERS, ...SIDE_EDGES],
  mSlice: M_SLICE,
  all: ALL_CELLS,
} as const;

const FOCUS: Readonly<Record<string, keyof typeof FOCUS_SETS>> = {
  'roux-intro/층이 아니라 블록': 'blocks',
  'roux-intro/네 단계': 'all',
  'roux-intro/CFOP와 다른 점': 'all',
  'roux-intro/외울 공식은 CMLL뿐': 'all',
  'roux-intro/M과 r: 가운데 줄을 돌리는 동작': 'all',
  'roux-intro/전체 풀이 미리 보기': 'all',
  'roux-fb/목표: 왼쪽 아래 1×2×3': 'left',
  'roux-fb/만드는 순서: 사각형 먼저, 그다음 짝': 'left',
  'roux-fb/예시 1-가: 사각형 만들기': 'left',
  'roux-fb/예시 1-나: 남은 짝 넣기': 'left',
  'roux-fb/예시 2: 가운데 줄에서 엣지 데려오기': 'left',
  'roux-fb/직접 해 보기': 'leftAndCenter',
  'roux-sb/목표와 쓸 수 있는 동작': 'blocks',
  'roux-sb/예시 1-가: 아래 엣지 놓기': 'blocks',
  'roux-sb/예시 1-나: 뒤쪽 짝 넣기': 'blocks',
  'roux-sb/예시 1-다: 앞쪽 짝 넣기': 'blocks',
  'roux-sb/예시 2: 엣지가 가운데 줄에 있을 때': 'blocks',
  'roux-sb/직접 해 보기': 'blocks',
  'roux-cmll/CMLL이 맞추는 것': 'cmll',
  'roux-cmll/코너의 노란색으로 알아보기': 'cmll',
  'roux-cmll/예시: U 6 (노란 십자 공식)': 'cmll',
  'roux-cmll/예시: Sune 1 (2-Look OLL의 Sune)': 'cmll',
  'roux-cmll/예시: Antisune 1 (Sune과 회전 방향이 반대)': 'cmll',
  'roux-cmll/42개를 외우기 전에': 'cmll',
  'roux-cmll/직접 해 보기': 'cmll',
  'roux-lse/남은 것과 세 단계': 'lse',
  'roux-lse/4a. 좋은 엣지와 나쁜 엣지': 'lse',
  "roux-lse/4a. 화살표 모양: M' U' M'": 'lse',
  'roux-lse/4a. 나쁜 엣지가 둘일 때': 'lse',
  'roux-lse/4b. 왼쪽·오른쪽 엣지: 둘 다 아래에 있을 때': 'sideEdges',
  'roux-lse/4c. 가운데 줄: 엣지 셋이 돌아가며 바뀐 경우': 'mSlice',
  'roux-lse/4b. 하나는 위에, 하나는 아래에 있을 때': 'sideEdges',
  'roux-lse/4c. 앞뒤가 서로 바뀐 경우': 'mSlice',
  'roux-lse/직접 해 보기': 'all',
  'roux-full/전체 풀이 따라 하기': 'all',
};

/** 화면과 같은 방법으로, 이 상태에서 밝게 보이는 칸을 구한다. */
function litCells(state: CubeState, focus: ReadonlySet<number> | null): number[] {
  if (!focus) return ALL_CELLS;
  const homes = homeOf(state);
  return ALL_CELLS.filter((i) => focus.has(homes[i]));
}

// ───────── LSE 상태 전체 ─────────

const keyOfState = (s: CubeState) => s.join('');

/** starts에서 moves만으로 갈 수 있는 모든 상태와 거기까지의 최소 회전 수 */
function reach(starts: readonly CubeState[], moves: readonly Move[]) {
  const dist = new Map<string, number>();
  const states: CubeState[] = [...starts];
  for (const s of starts) dist.set(keyOfState(s), 0);
  for (let head = 0; head < states.length; head++) {
    const d = dist.get(keyOfState(states[head]))! + 1;
    for (const m of moves) {
      const next = applyMove(states[head], m);
      const k = keyOfState(next);
      if (!dist.has(k)) {
        dist.set(k, d);
        states.push(next);
      }
    }
  }
  return { dist, states };
}

describe('Roux 과정', () => {
  it("과정의 틀: id, 잡는 방향, 레슨 id는 'roux-'로 시작하고 서로 다르다", () => {
    expect(rouxCourse.id).toBe('roux');
    expect(rouxCourse.frame).toBe('yellow');
    const ids = rouxCourse.lessons.map((l) => l.id);
    expect(ids).toEqual(['roux-intro', 'roux-fb', 'roux-sb', 'roux-cmll', 'roux-lse', 'roux-full']);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('roux-')).toBe(true);
    expect(new Set(ALL_STEPS.map((x) => x.key)).size, '레슨 안에서 단계 제목이 겹치지 않음').toBe(ALL_STEPS.length);
  });

  it('모든 단계에 글이 있고, 해요체로 끝난다', () => {
    for (const lesson of rouxCourse.lessons) {
      expect(lesson.title.trim().length).toBeGreaterThan(0);
      expect(lesson.summary.trim().length).toBeGreaterThan(0);
      expect(lesson.steps.length).toBeGreaterThan(0);
      for (const step of lesson.steps) {
        expect(step.title.trim().length, keyOf(lesson, step)).toBeGreaterThan(0);
        expect(step.body.length, keyOf(lesson, step)).toBeGreaterThan(0);
        for (const paragraph of step.body) expect(paragraph.trim().length, keyOf(lesson, step)).toBeGreaterThan(0);
        // 공식으로 끝나는 줄을 빼면 문단은 '~요.'로 끝난다.
        const prose = step.body.filter((p) => !/^공식: /.test(p) && !/: [A-Za-z2' ]+\.$/.test(p));
        for (const paragraph of prose) expect(paragraph, keyOf(lesson, step)).toMatch(/(요|세요)\.$/);
      }
    }
  });

  it('적어 둔 setup과 alg는 모두 읽을 수 있는 공식이다', () => {
    for (const { step, key } of ALL_STEPS) {
      expect(() => parseAlg(step.setup ?? ''), key).not.toThrow();
      expect(() => parseAlg(step.alg ?? ''), key).not.toThrow();
      // 풀이기에서 동작을 가져오는 단계는 모두 Roux 풀이기를 쓰고 무작위 예제다.
      if (step.auto) {
        expect(step.method, key).toBe('roux');
        expect(step.random, key).toBe(true);
        expect(step.alg ?? step.setup, key).toBeUndefined();
      }
    }
  });

  describe('풀이기에서 가져오는 예제', () => {
    const method = METHODS.roux;
    for (const { step, key } of ALL_STEPS) {
      if (!step.auto) continue;

      if (step.auto === 'all') {
        it(`${key}: 20개 모두 끝까지 풀리고, 처음에만 큐브를 돌려 잡는다`, () => {
          const random = rng(7);
          for (let n = 0; n < 20; n++) {
            const p = resolveStep(rouxCourse, step, random);
            expect(isSolved(applyMoves(p.start, flat(p)))).toBe(true);
            for (const group of p.groups) {
              expect(group.note, '무엇을 하는지 적혀 있음').toBeTruthy();
              if (group.moves.some(isRotation)) expect(group.note).toContain('[큐브 잡기]');
            }
          }
        });
        continue;
      }

      const index = method.order.indexOf(step.auto);
      it(`${key}: 무작위 예제 30개가 앞 단계까지 된 상태에서 시작해 이 단계를 끝낸다`, () => {
        expect(index).toBeGreaterThan(0);
        const random = rng(11 + index);
        const checkedBySolver = { start: 0, end: 0 };
        for (let n = 0; n < 30; n++) {
          const p = resolveStep(rouxCourse, step, random);
          expect(flat(p).length, '이 단계에 할 일이 있어야 함').toBeGreaterThan(0);
          const end = applyMoves(p.start, flat(p));

          // courses.test.ts와 같은 확인: 풀이기에 다시 물어서 앞 단계는 끝나 있고, 동작을 다 하면 이 단계까지 끝난다
          // ('큐브 잡기'는 빼고 본다). 다만 Roux 풀이기는 위·앞 센터 색으로 큐브를 다시 잡기 때문에,
          // 가운데 줄이 돌아가 센터가 옮겨진 상태를 주면 큐브를 돌려 잡고 블록부터 다시 만든다.
          // 그래서 이 확인은 센터가 제자리일 때만 하고, 모든 경우는 아래에서 칸을 직접 견주어 확인한다.
          if (centersHome(p.start)) {
            const before = method.solve(p.start);
            expect(before[0].steps, '이미 잡은 방향').toHaveLength(0);
            expect(before.slice(1, index).every((s) => s.steps.length === 0), '앞 단계가 끝나 있어야 함').toBe(true);
            expect(stageMoves(before[index]), '보여 주는 동작이 이 단계의 풀이').toEqual(flat(p));
            checkedBySolver.start++;
          }
          if (centersHome(end)) {
            const after = method.solve(end);
            expect(after.slice(0, index + 1).every((s) => s.steps.length === 0), '이 단계가 끝나야 함').toBe(true);
            checkedBySolver.end++;
          }

          // 풀이기와 따로, 칸을 직접 견주어서도 확인한다.
          yes(sideCentersHome(p.start), '왼쪽 빨강·오른쪽 주황으로 잡은 채 시작');
          if (step.auto === 'fb') yes(centersHome(p.start), '노란색 위·초록색 앞으로 잡은 채 시작');
          const goals: Record<string, [(s: CubeState) => boolean, (s: CubeState) => boolean]> = {
            fb: [() => true, firstBlock],
            sb: [firstBlock, blocks],
            cmll: [blocks, cornersUpToU],
            lse: [cornersUpToU, isSolved],
          };
          const [had, has] = goals[step.auto as string];
          yes(had(p.start), '시작할 때 앞 단계의 목표');
          no(has(p.start), '시작할 때 이 단계는 아직');
          yes(has(end), '끝났을 때 이 단계의 목표');
          no(flat(p).some(isRotation), '큐브를 돌려 잡지 않음');
          if (step.auto === 'sb') yes(flat(p).every((m) => 'RrUM'.includes(m.base)), 'R, r, U, M만');
          if (step.auto === 'lse') yes(flat(p).every((m) => 'MU'.includes(m.base)), 'M, U만');
          // 블록과 LSE는 한 묶음, CMLL은 U 맞추기와 공식 하나이고 공식 이름이 함께 나온다.
          expect(p.groups.every((g) => g.note)).toBe(true);
          expect(p.groups.length).toBeLessThanOrEqual(step.auto === 'cmll' ? 2 : 1);
          if (step.auto === 'cmll') {
            const last = p.groups.at(-1)!;
            const used = CMLL_CASES.filter((c) => last.note!.startsWith(`${c.name} 공식`));
            expect(used, last.note).toHaveLength(1);
            expect(last.moves).toEqual(alg(used[0].alg));
          }
        }
        // 풀이기로 다시 확인한 예제도 있어야 한다 (첫 번째 블록은 늘 센터가 제자리에서 시작하고, LSE는 늘 완성으로 끝난다).
        if (step.auto === 'fb') expect(checkedBySolver.start).toBe(30);
        if (step.auto === 'lse') expect(checkedBySolver.end).toBe(30);
        expect(checkedBySolver.start + checkedBySolver.end).toBeGreaterThan(0);
      });
    }
  });

  describe('손으로 만든 예시', () => {
    it('setup이나 alg가 있는 단계는 빠짐없이 확인 항목이 있다', () => {
      const handmade = ALL_STEPS.filter((x) => !x.step.auto && (x.step.setup || x.step.alg)).map((x) => x.key);
      expect(Object.keys(CLAIMS).sort()).toEqual([...handmade].sort());
      for (const { step, key } of ALL_STEPS) if (step.alg) expect(CLAIMS[key].after, key).toBeDefined();
      // 레슨마다 요구한 만큼 예시가 있다.
      const withAlg = (id: string, title: RegExp) => lessonOf(id).steps.filter((s) => s.alg && title.test(s.title)).length;
      expect(withAlg('roux-fb', /^예시/)).toBeGreaterThanOrEqual(2);
      expect(withAlg('roux-sb', /^예시/)).toBeGreaterThanOrEqual(2);
      expect(withAlg('roux-cmll', /^예시/)).toBeGreaterThanOrEqual(2);
      for (const part of ['4a', '4b', '4c']) expect(withAlg('roux-lse', new RegExp(`^${part}\\.`)), part).toBeGreaterThanOrEqual(1);
    });

    for (const [key, claim] of Object.entries(CLAIMS)) {
      it(`${key}: 글대로 시작하고 글대로 끝난다`, () => {
        const step = stepOf(key);
        const p = resolveStep(rouxCourse, step);
        const moves = flat(p);
        expect(moves).toEqual(alg(step.alg ?? ''));
        // 시작 모습은 YELLOW_UP에 setup을 적용한 것이고, 왼쪽·오른쪽 센터는 늘 제자리다.
        yes(same(p.start, run(YELLOW_UP, step.setup ?? '')), '시작 모습');
        claim.before(p.start);

        let state = p.start;
        moves.forEach((move, i) => {
          state = applyMove(state, move);
          claim.mid?.[i + 1]?.(state);
          if (claim.keep) yes(claim.keep(state), `${i + 1}수 뒤에도 지켜져야 함`);
          if (claim.only) yes(claim.only.includes(move.base), `${claim.only}만 씀`);
          no(isRotation(move), '큐브를 돌려 잡지 않음');
        });
        for (const n of Object.keys(claim.mid ?? {})) expect(Number(n)).toBeLessThanOrEqual(moves.length);
        claim.after?.(state);
      });
    }

    it('이어지는 예시는 앞 단계가 끝난 모습에서 다음 단계가 시작한다', () => {
      const chains = [
        ['roux-fb/예시 1-가: 사각형 만들기', 'roux-fb/예시 1-나: 남은 짝 넣기'],
        ['roux-sb/예시 1-가: 아래 엣지 놓기', 'roux-sb/예시 1-나: 뒤쪽 짝 넣기', 'roux-sb/예시 1-다: 앞쪽 짝 넣기'],
        [
          "roux-lse/4a. 화살표 모양: M' U' M'",
          'roux-lse/4b. 왼쪽·오른쪽 엣지: 둘 다 아래에 있을 때',
          'roux-lse/4c. 가운데 줄: 엣지 셋이 돌아가며 바뀐 경우',
        ],
        ['roux-lse/4b. 하나는 위에, 하나는 아래에 있을 때', 'roux-lse/4c. 앞뒤가 서로 바뀐 경우'],
      ];
      for (const chain of chains) {
        for (let i = 1; i < chain.length; i++) yes(same(endOf(chain[i - 1]), startOf(chain[i])), `${chain[i - 1]} → ${chain[i]}`);
      }
      // 같은 큐브를 보여 주는 단계들
      yes(same(startOf('roux-lse/남은 것과 세 단계'), startOf("roux-lse/4a. 화살표 모양: M' U' M'")), 'LSE 첫 화면');
      yes(same(startOf('roux-lse/4a. 좋은 엣지와 나쁜 엣지'), startOf("roux-lse/4a. 화살표 모양: M' U' M'")), '4a 첫 화면');
      yes(same(startOf('roux-fb/만드는 순서: 사각형 먼저, 그다음 짝'), startOf('roux-fb/예시 1-나: 남은 짝 넣기')), '사각형 화면');
    });
  });

  describe('강조하는 조각', () => {
    it('단계마다 무엇이 밝게 보이는지 정해 두었다', () => {
      expect(Object.keys(FOCUS).sort()).toEqual(ALL_STEPS.map((x) => x.key).sort());
    });

    it('칸 모음은 잡은 방향 기준으로 센 개수와 맞다', () => {
      // 블록 하나: 센터 1칸 + 엣지 3개(6칸) + 코너 2개(6칸)
      expect(LEFT_BLOCK).toHaveLength(13);
      expect(RIGHT_BLOCK).toHaveLength(13);
      expect(TOP_CORNERS).toHaveLength(12);
      expect(SIDE_EDGES).toHaveLength(4);
      expect(M_SLICE).toHaveLength(12);
      // 왼쪽 블록은 빨간 센터에 붙어 있고, 조각마다 빨간색이 있다. 오른쪽은 주황.
      expect(LEFT_BLOCK.filter((i) => YELLOW_UP[i] === R)).toHaveLength(6);
      expect(RIGHT_BLOCK.filter((i) => YELLOW_UP[i] === O)).toHaveLength(6);
      expect(TOP_CORNERS.filter((i) => YELLOW_UP[i] === Y)).toHaveLength(4);
    });

    for (const { step, key } of ALL_STEPS) {
      it(`${key}: 밝게 보이는 조각이 이 단계의 조각과 같다`, () => {
        const expected = [...FOCUS_SETS[FOCUS[key]]].sort((a, b) => a - b);
        const p = resolveStep(rouxCourse, step, rng(3));
        // 노란색을 위로 잡은 완성 상태에서 밝게 보이는 칸
        expect(litCells(YELLOW_UP, p.focus)).toEqual(expected);
        // 강조는 조각을 따라간다: 시작 모습에서도 같은 조각(같은 수의 칸)이 밝다.
        expect(litCells(p.start, p.focus)).toHaveLength(expected.length);
        if (FOCUS[key] === 'all') expect(p.focus).toBeNull();
      });
    }
  });

  describe('글에 적은 사실', () => {
    it('R, r, U, M은 첫 번째 블록을 지나가지 않고, F, B, D, L은 흐트러뜨린다', () => {
      for (const base of ['R', 'r', 'U', 'M']) {
        for (const suffix of ['', "'", '2']) yes(firstBlock(run(YELLOW_UP, base + suffix)), base + suffix);
      }
      for (const base of ['F', 'B', 'D', 'L']) {
        for (const suffix of ['', "'", '2']) no(firstBlock(run(YELLOW_UP, base + suffix)), base + suffix);
      }
      // M과 U는 블록 두 개를 건드리지 않고, U는 코너를 블록과 어긋나게만 한다.
      for (const move of ['M', "M'", 'M2', 'U', "U'", 'U2']) {
        yes(blocks(run(YELLOW_UP, move)), move);
        yes(cornersUpToU(run(YELLOW_UP, move)), move);
      }
      no(cornersHome(run(YELLOW_UP, 'U')), 'U 뒤에는 코너가 어긋남');
      // 앞면은 왼쪽 뒤 사각형을 지나가지 않는다.
      yes(leftSquare(run(YELLOW_UP, 'F')), 'F');
      // M2는 아래 뒤를 윗층 앞으로, 아래 앞을 윗층 뒤로 올린다.
      const m2 = run(YELLOW_UP, 'M2');
      expect([where(m2, 'DB'), where(m2, 'DF')]).toEqual(['UF', 'UB']);
    });

    it('블록 조각의 색: 빨간색(주황색)은 옆면을, 흰색은 아래를 본다', () => {
      const colorsOf = (pos: string) => new Set([...pos].map((f) => col(YELLOW_UP, pos, f)));
      expect(['DL', 'FL', 'BL'].map(colorsOf)).toEqual([new Set([W, R]), new Set([G, R]), new Set([B, R])]);
      expect(['DFL', 'DBL'].map(colorsOf)).toEqual([new Set([W, G, R]), new Set([W, B, R])]);
      expect(['DR', 'FR', 'BR'].map(colorsOf)).toEqual([new Set([W, O]), new Set([G, O]), new Set([B, O])]);
      expect(['DFR', 'DBR'].map(colorsOf)).toEqual([new Set([W, G, O]), new Set([W, B, O])]);
      for (const p of ['DL', 'FL', 'BL', 'DFL', 'DBL']) expect(col(YELLOW_UP, p, 'L')).toBe(R);
      for (const p of ['DR', 'FR', 'BR', 'DFR', 'DBR']) expect(col(YELLOW_UP, p, 'R')).toBe(O);
      for (const p of ['DL', 'DFL', 'DBL', 'DR', 'DFR', 'DBR']) expect(col(YELLOW_UP, p, 'D')).toBe(W);
      // 남은 엣지 6개에는 모두 노란색이나 흰색이 있고, 왼쪽·오른쪽 엣지는 노랑-빨강, 노랑-주황이다.
      for (const p of LSE_POSITIONS) expect(colorsOf(p).has(Y) || colorsOf(p).has(W)).toBe(true);
      expect([colorsOf('UL'), colorsOf('UR')]).toEqual([new Set([Y, R]), new Set([Y, O])]);
    });

    it('회전 수: 첫 번째 블록 7수쯤, 두 번째 블록 10수쯤, 전체는 CFOP 60회전쯤·Roux 40회전쯤', () => {
      const random = rng(2026);
      const N = 200;
      const sum = { fb: 0, sb: 0, roux: 0, cfop: 0 };
      for (let n = 0; n < N; n++) {
        const start = applyMoves(SOLVED, generateScramble(25, random));
        const roux = solveRoux(start);
        // 처음 잡을 때 말고는 큐브를 돌려 잡지 않는다.
        no(roux.slice(1).flatMap(stageMoves).some(isRotation), 'Roux는 돌려 잡지 않음');
        const turns = (moves: readonly Move[]) => moves.filter((m) => !isRotation(m)).length;
        sum.fb += turns(stageMoves(roux[1]));
        sum.sb += turns(stageMoves(roux[2]));
        sum.roux += turns(roux.flatMap(stageMoves));
        sum.cfop += turns(solveCfop(start).flatMap(stageMoves));
      }
      expect(Math.round(sum.fb / N)).toBe(7);
      expect(Math.round(sum.sb / N)).toBe(10);
      expect(Math.round(sum.roux / N / 10) * 10).toBe(40);
      expect(Math.round(sum.cfop / N / 10) * 10).toBe(60);
      // 글에도 같은 숫자가 적혀 있다.
      const text = (key: string) => stepOf(key).body.join(' ');
      expect(text('roux-fb/직접 해 보기')).toContain('평균 7수쯤');
      expect(text('roux-sb/직접 해 보기')).toContain('평균 10수쯤');
      expect(text('roux-intro/CFOP와 다른 점')).toContain('CFOP는 60회전쯤, Roux는 40회전쯤');
      // 컴퓨터가 찾은 풀이라는 것과 사람은 더 걸린다는 것을 밝힌다.
      for (const key of ['roux-fb/직접 해 보기', 'roux-sb/직접 해 보기']) {
        expect(text(key)).toContain('컴퓨터가 찾은 가장 짧은 풀이');
        expect(text(key)).toMatch(/사람이 풀면 이보다 .*더 걸려요/);
      }
      expect(text('roux-lse/직접 해 보기')).toContain('4a, 4b, 4c 순서를 따르지 않아요');
    });

    it('CMLL 묶음은 코너의 노란색이 보는 방향으로 나뉜다 (O 2, H 4, 나머지 6개씩, 모두 42개)', () => {
      expect(CMLL_CASES).toHaveLength(42);
      const groups = new Map<string, CubeState[]>();
      for (const c of CMLL_CASES) {
        const name = c.group.split(' ')[0];
        groups.set(name, [...(groups.get(name) ?? []), applyMoves(YELLOW_UP, invertAlg(alg(c.alg)))]);
      }
      expect([...groups].map(([name, cases]) => [name, cases.length])).toEqual([
        ['O', 2],
        ['H', 4],
        ['Pi', 6],
        ['U', 6],
        ['T', 6],
        ['Sune', 6],
        ['Antisune', 6],
        ['L', 6],
      ]);
      const upCount: Record<string, number> = { O: 4, H: 0, Pi: 0, U: 2, T: 2, Sune: 1, Antisune: 1, L: 2 };
      const ring = ['UBL', 'UBR', 'UFR', 'UFL'];
      /** 위를 보지 않는 코너의 노란색이 보는 옆면 */
      const sideOf = (s: CubeState, corner: string) => [...corner].find((f) => f !== 'U' && col(s, corner, f) === Y)!;
      const OPPOSITE: Record<string, string> = { F: 'B', B: 'F', L: 'R', R: 'L' };
      for (const [name, cases] of groups) {
        for (const s of cases) {
          yes(blocks(s), `${name}: 블록은 그대로`);
          const up = yellowUpCorners(s);
          expect(up.length, name).toBe(upCount[name]);
          const sides = ring.filter((c) => !up.includes(c)).map((c) => sideOf(s, c));
          const tally = [...new Set(sides)].map((f) => sides.filter((x) => x === f).length).sort();
          if (up.length === 2) {
            const adjacent = Math.abs(ring.indexOf(up[0]) - ring.indexOf(up[1])) !== 2;
            expect(adjacent, `${name}: 위를 보는 두 코너가 이웃인지`).toBe(name !== 'L');
            if (name === 'U') expect(sides[0], 'U: 같은 옆면').toBe(sides[1]);
            if (name === 'T') expect(sides[0], 'T: 서로 반대쪽').toBe(OPPOSITE[sides[1]]);
          }
          if (name === 'H') {
            expect(tally).toEqual([2, 2]);
            expect(OPPOSITE[sides.find((f) => f !== sides[0])!], 'H: 마주 보는 두 옆면').toBe(sides[0]);
          }
          if (name === 'Pi') {
            expect(tally).toEqual([1, 1, 2]);
            const twice = sides.find((f) => sides.filter((x) => x === f).length === 2)!;
            expect(sides.includes(OPPOSITE[twice]), 'Pi: 나머지는 양옆 면').toBe(false);
          }
        }
      }
    });

    it('CMLL은 2-Look OLL의 코너 공식과 2-Look PLL의 코너 공식(T, Y)으로 두 번에 나눠 맞출 수 있다', () => {
      const pick = (from: readonly { id: string; alg: string }[], ids: readonly string[]) =>
        ids.map((id) => alg(from.find((c) => c.id === id)!.alg));
      const orient = pick(OLL_CASES, TWO_LOOK_OLL_CORNERS);
      const permute = pick(PLL_CASES, TWO_LOOK_PLL_CORNERS);
      expect(orient).toHaveLength(7);
      expect(TWO_LOOK_PLL_CORNERS).toEqual(['pll-T', 'pll-Y']);
      // 이 공식들은 블록을 그대로 둔다.
      for (const moves of [...orient, ...permute]) yes(blocks(applyMoves(YELLOW_UP, moves)), algToString(moves));

      const random = rng(42);
      for (let n = 0; n < 100; n++) {
        const scrambled = applyMoves(SOLVED, generateScramble(25, random));
        const start = applyMoves(scrambled, solveRoux(scrambled).slice(0, 3).flatMap(stageMoves));
        yes(blocks(start), '블록 두 개가 된 상태');
        // 1) 노란색을 모두 위로 (이미 그렇다면 건너뛴다)
        const oriented =
          yellowUpCorners(start).length === 4
            ? [start]
            : U_TURNS.flatMap((u) => orient.map((moves) => applyMoves(applyMoves(start, u), moves))).filter(
                (s) => yellowUpCorners(s).length === 4,
              );
        expect(oriented.length, '코너 방향을 맞추는 공식이 있음').toBeGreaterThan(0);
        // 2) 자리 맞추기 (이미 맞았다면 건너뛴다)
        const done = oriented.some(
          (s) => cornersUpToU(s) || U_TURNS.some((u) => permute.some((moves) => cornersUpToU(applyMoves(applyMoves(s, u), moves)))),
        );
        yes(done, '코너 자리를 맞추는 공식이 있음');
      }
    });

    it('LSE: 나쁜 엣지 개수, 화살표, 4b·4c의 요령이 모든 경우에 맞다', () => {
      const MU = alg("M M' M2 U U' U2");
      const all = reach([YELLOW_UP], MU).states;
      expect(all).toHaveLength(184320);
      const pattern = (s: CubeState) => badEdges(s).join(' ');

      const eoStates: CubeState[] = [];
      for (const s of all) {
        // M과 U만으로는 블록과 코너(U를 빼고)가 흐트러지지 않는다.
        if (!cornersUpToU(s)) throw new Error('M, U만으로 블록이나 코너가 흐트러짐');
        if (!aligned(s)) {
          // 센터가 초록이나 파랑이면 M을 한 번 돌리면 노랑이나 흰색이 된다.
          if (!aligned(run(s, 'M')) || !aligned(run(s, "M'"))) throw new Error('M으로 센터가 맞지 않음');
          continue;
        }
        const bad = badEdges(s);
        if (bad.length % 2 !== 0) throw new Error(`나쁜 엣지가 홀수: ${bad}`);
        if (bad.length === 0) eoStates.push(s);

        // 화살표: 윗층 셋 + 아래 하나, 가운데 것이 아래의 나쁜 엣지와 같은 쪽
        if (pattern(s) === 'UF UL UR DF' && !eoDone(run(s, "M' U' M'"))) throw new Error('앞 화살표');
        if (pattern(s) === 'UL UB UR DB' && !eoDone(run(s, "M U' M'"))) throw new Error('뒤 화살표');
        // 나쁜 엣지 둘이 윗층 앞뒤
        if (pattern(s) === 'UF UB') {
          const arrow = run(s, "M' U M U'");
          if (pattern(arrow) !== 'UF UL UR DF' || !aligned(arrow)) throw new Error('둘 → 화살표');
          if (!eoDone(run(arrow, "M' U' M'"))) throw new Error('둘 → 끝');
        }
      }
      expect(eoStates.length).toBeGreaterThan(0);

      const sideDone: CubeState[] = [];
      for (const s of eoStates) {
        // U, M2와 M U2 M', M' U2 M은 엣지 방향을 흐트러뜨리지 않는다.
        for (const keep of ['U', "U'", 'U2', 'M2', "M U2 M'", "M' U2 M"]) {
          if (!eoDone(run(s, keep))) throw new Error(`${keep}이 엣지 방향을 흐트러뜨림`);
        }
        const ul = where(s, 'UL');
        const ur = where(s, 'UR');
        // M U2 M': 윗층 뒤 ↔ 아래 뒤, 아래 앞은 그대로. M' U2 M: 윗층 앞 ↔ 아래 앞, 아래 뒤는 그대로.
        if (ur === 'UB' && ul === 'DF') {
          const t = run(s, "M U2 M'");
          if (where(t, 'UR') !== 'DB' || where(t, 'UL') !== 'DF') throw new Error("M U2 M'");
        }
        if (ur === 'UF' && ul === 'DB') {
          const t = run(s, "M' U2 M");
          if (where(t, 'UR') !== 'DF' || where(t, 'UL') !== 'DB') throw new Error("M' U2 M");
        }
        // 둘 다 아래에 있고 코너가 블록과 맞아 있을 때
        if (cornersHome(s) && ul === 'DB' && ur === 'DF' && !sideEdgesDone(run(s, "U' M2 U"))) throw new Error("U' M2 U");
        if (cornersHome(s) && ul === 'DF' && ur === 'DB' && !sideEdgesDone(run(s, "U M2 U'"))) throw new Error("U M2 U'");
        if (sideEdgesDone(s)) sideDone.push(s);
      }

      // 4c: 완성까지 쳐서 24가지, M 계열과 U2만으로 8수 안에 풀린다.
      expect(sideDone).toHaveLength(24);
      const lastStep = reach([YELLOW_UP], alg("M M' M2 U2")).dist;
      for (const s of sideDone) {
        expect(lastStep.get(keyOfState(s)), 'M 계열과 U2만으로 풀림').toBeLessThanOrEqual(8);
        // 윗면 센터가 흰색이면 M2를 하면 노란색이 되고, 여전히 4c 상태다.
        if (s[U_CENTER] === W) {
          const t = run(s, 'M2');
          yes(t[U_CENTER] === Y && sideEdgesDone(t), 'M2부터');
        }
      }
      expect(sideDone.filter((s) => s[U_CENTER] === Y)).toHaveLength(12);
    });
  });
});

/** 왼쪽 센터가 빨강, 오른쪽 센터가 주황인지 (가운데 줄을 돌려도 이 둘은 움직이지 않는다) */
function sideCentersHome(s: CubeState): boolean {
  return s[4 * 9 + 4] === YELLOW_UP[4 * 9 + 4] && s[1 * 9 + 4] === YELLOW_UP[1 * 9 + 4];
}
