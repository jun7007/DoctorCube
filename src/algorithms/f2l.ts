/**
 * CFOP F2L 공식 41개.
 *
 * 모든 공식은 YELLOW_UP(노란색 위, 초록색 앞)에서 앞-오른쪽 슬롯(코너 DFR, 엣지 FR)을 채우는 기준이다.
 * 흰색 십자는 아래에 이미 맞춰져 있다고 본다. 큐브를 돌려 잡는 동작(x y z)이나 두 층 돌리기는 쓰지 않는다.
 * 공식 앞에 U로 자리만 맞추는 동작은 넣지 않았다. 케이스는 "공식을 거꾸로 적용한 자리"로 정해지고,
 * 같은 케이스가 윗면에서 다른 자리에 있으면 f2lSolve가 U를 먼저 돌려 맞춘다.
 */
import { applyMoves, type CubeState, type Face, type Move } from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { invertAlg, parseAlg } from '../core/notation';
import { centerColor, facelet } from '../core/pieces';
import type { AlgCase } from './types';

/** [공식, 알아보는 요령, 같은 자리에서 쓸 수 있는 다른 공식들] */
type Row = readonly [alg: string, note: string, alts?: readonly string[]];

const GROUPS: readonly (readonly [group: string, rows: readonly Row[]])[] = [
  [
    '기본 넣기',
    [
      ["R U R'", '코너는 앞-오른쪽 위에서 흰색이 오른쪽을 봐요. 엣지는 윗층 뒤에 있고 윗면 색이 코너와 달라요.'],
      ["F' U' F", '코너는 앞-오른쪽 위에서 흰색이 앞을 봐요. 엣지는 윗층 왼쪽에 있고 윗면 색이 코너와 달라요.'],
      [
        "R U' R'",
        '코너는 앞-왼쪽 위에서 흰색이 왼쪽을 봐요. 엣지는 윗층 앞에 짝으로 붙어 있고 윗면 색이 코너와 같아요.',
      ],
      [
        "F' U F",
        '코너는 뒤-오른쪽 위에서 흰색이 뒤를 봐요. 엣지는 윗층 오른쪽에 짝으로 붙어 있고 윗면 색이 코너와 같아요.',
      ],
    ],
  ],
  [
    '코너와 엣지 모두 윗층 · 흰색이 옆',
    [
      [
        "R U' R' U R U R'",
        '코너는 뒤-오른쪽 위에서 흰색이 뒤를 봐요. 엣지는 흰색 옆 윗층 뒤에 붙어 있고 윗면 색이 코너와 달라요.',
      ],
      [
        "F' U F U' F' U' F",
        '코너는 앞-왼쪽 위에서 흰색이 왼쪽을 봐요. 엣지는 흰색 옆 윗층 왼쪽에 붙어 있고 윗면 색이 코너와 달라요.',
      ],
      [
        "R U R' U2 R U' R'",
        '코너는 뒤-오른쪽 위에서 흰색이 오른쪽을 봐요. 엣지는 윗층 왼쪽에 있고 윗면 색이 코너와 같아요.',
        ["R U R' U' R U2 R'"],
      ],
      [
        "F' U' F U2 F' U F",
        '코너는 앞-왼쪽 위에서 흰색이 앞을 봐요. 엣지는 윗층 뒤에 있고 윗면 색이 코너와 같아요.',
        ["F' U' F U F' U2 F"],
      ],
      [
        "R U2 R' U2 R U' R'",
        '코너는 뒤-오른쪽 위에서 흰색이 오른쪽을 봐요. 엣지는 윗층 앞에 있고 윗면 색이 코너와 같아요.',
        ["R U2 R' U' R U2 R'"],
      ],
      [
        "F' U2 F U2 F' U F",
        '코너는 앞-왼쪽 위에서 흰색이 앞을 봐요. 엣지는 윗층 오른쪽에 있고 윗면 색이 코너와 같아요.',
        ["F' U2 F U F' U2 F"],
      ],
      [
        "R U R' U R U R'",
        '코너는 뒤-오른쪽 위에서 흰색이 뒤를 봐요. 엣지는 윗층 앞에 있고 윗면 색이 코너와 달라요.',
        ["F' U' F U2 R U R'"],
      ],
      [
        "R U' R' U F' U' F",
        '코너는 뒤-오른쪽 위에서 흰색이 오른쪽을 봐요. 엣지는 윗층 왼쪽에 있고 윗면 색이 코너와 달라요.',
      ],
      [
        "R U2 R' U F' U' F",
        '코너는 뒤-오른쪽 위에서 흰색이 오른쪽을 봐요. 엣지는 윗층 뒤에 붙어 있고 윗면 색이 코너와 달라요.',
      ],
      [
        "F' U2 F U' R U R'",
        '코너는 앞-왼쪽 위에서 흰색이 앞을 봐요. 엣지는 윗층 왼쪽에 붙어 있고 윗면 색이 코너와 달라요.',
      ],
      [
        "R U' R' U2 F' U' F",
        '코너는 앞-오른쪽 위에서 흰색이 오른쪽을 봐요. 엣지는 흰색 옆 윗층 오른쪽에 붙어 있고 윗면 색이 코너와 같아요.',
      ],
      [
        "F' U F U2 R U R'",
        '코너는 앞-오른쪽 위에서 흰색이 앞을 봐요. 엣지는 흰색 옆 윗층 앞에 붙어 있고 윗면 색이 코너와 같아요.',
      ],
    ],
  ],
  [
    '코너와 엣지 모두 윗층 · 흰색이 위',
    [
      [
        "R U2 R' U' R U R'",
        '코너는 앞-오른쪽 위에서 흰색이 위를 봐요. 엣지는 윗층 오른쪽에 있고 윗면이 앞 센터 색이에요.',
      ],
      [
        "F' U2 F U F' U' F",
        '코너는 앞-오른쪽 위에서 흰색이 위를 봐요. 엣지는 윗층 앞에 있고 윗면이 오른쪽 센터 색이에요.',
      ],
      [
        "R U2 R' U R U' R'",
        '코너는 앞-왼쪽 위에서 흰색이 위를 봐요. 엣지는 윗층 오른쪽에 있고 윗면이 앞 센터 색이에요.',
        ["R U2 R2 F R F'"],
      ],
      [
        "F' U2 F U' F' U F",
        '코너는 뒤-오른쪽 위에서 흰색이 위를 봐요. 엣지는 윗층 앞에 있고 윗면이 오른쪽 센터 색이에요.',
        ["F' U2 F2 R' F' R"],
      ],
      [
        "R U' R' U2 R U R'",
        '코너는 앞-오른쪽 위에서 흰색이 위를 봐요. 엣지는 윗층 왼쪽에 있고 윗면이 앞 센터 색이에요.',
      ],
      [
        "F' U F U2 F' U' F",
        '코너는 앞-오른쪽 위에서 흰색이 위를 봐요. 엣지는 윗층 뒤에 있고 윗면이 오른쪽 센터 색이에요.',
      ],
      [
        "R2 U2 R' U' R U' R2",
        '코너는 뒤-왼쪽 위에서 흰색이 위를 봐요. 엣지는 윗층 뒤에 있고 윗면이 앞 센터 색이에요.',
      ],
      [
        "F U R U' R' F' R U' R'",
        '코너는 앞-오른쪽 위에서 흰색이 위를 봐요. 엣지는 윗층 오른쪽에 있고 윗면이 오른쪽 센터 색이에요.',
        ["F' U' F U2 F' U' F U F' U' F"],
      ],
    ],
  ],
  [
    '코너는 윗층, 엣지는 제자리 층',
    [
      [
        "R U' R' U2 R U' R'",
        '코너는 뒤-오른쪽 위에서 흰색이 오른쪽을 봐요. 엣지는 제자리에 바르게 들어가 있어요.',
        ["R U' R' U' R U2 R'"],
      ],
      ["R U2 R' U R U R'", '코너는 뒤-오른쪽 위에서 흰색이 뒤를 봐요. 엣지는 제자리에 바르게 들어가 있어요.'],
      ["R U R' U F' U' F", '코너는 뒤-오른쪽 위에서 흰색이 오른쪽을 봐요. 엣지는 제자리에 뒤집혀 들어가 있어요.'],
      ["F' U' F U' R U R'", '코너는 앞-왼쪽 위에서 흰색이 앞을 봐요. 엣지는 제자리에 뒤집혀 들어가 있어요.'],
      [
        "R U' R' U F' U F",
        '코너는 앞-오른쪽 위에서 흰색이 위를 봐요. 엣지는 제자리에 뒤집혀 들어가 있어요.',
        ["R U' R' F' U2 F"],
      ],
      [
        "R U R' U' R U R' U' R U R'",
        '코너는 앞-오른쪽 위에서 흰색이 위를 봐요. 엣지는 제자리에 바르게 들어가 있어요.',
        ['R2 U R2 U R2 U2 R2'],
      ],
    ],
  ],
  [
    '엣지는 윗층, 코너는 아래',
    [
      [
        "R U' R' U' F' U F",
        '코너는 제자리에서 흰색이 아래를 봐요. 엣지는 윗층 왼쪽에 있고 윗면이 오른쪽 센터 색이에요.',
        ["R U' R' F R' F' R"],
      ],
      [
        "F' U F U R U' R'",
        '코너는 제자리에서 흰색이 아래를 봐요. 엣지는 윗층 뒤에 있고 윗면이 앞 센터 색이에요.',
        ["F' U F R' F R F'"],
      ],
      [
        "R U' R' U R U' R'",
        '코너는 제자리에서 흰색이 앞을 봐요. 엣지는 윗층 오른쪽에 있고 윗면이 앞 센터 색이에요.',
      ],
      [
        "F' U F U' F' U F",
        '코너는 제자리에서 흰색이 오른쪽을 봐요. 엣지는 윗층 앞에 있고 윗면이 오른쪽 센터 색이에요.',
        ["R U R' U' F R' F' R"],
      ],
      [
        "R U R' U' R U R'",
        '코너는 제자리에서 흰색이 오른쪽을 봐요. 엣지는 윗층 오른쪽에 있고 윗면이 앞 센터 색이에요.',
      ],
      [
        "F' U' F U F' U' F",
        '코너는 제자리에서 흰색이 앞을 봐요. 엣지는 윗층 앞에 있고 윗면이 오른쪽 센터 색이에요.',
        ["R' F R F' U R U' R'", "R' F R F' R' F R F'"],
      ],
    ],
  ],
  [
    '둘 다 아래 (잘못 들어감)',
    [
      [
        "R2 U2 F R2 F' U2 R' U R'",
        '코너는 제자리에서 흰색이 아래를 봐요. 엣지는 제자리에 뒤집혀 들어가 있어요.',
        ["R U' R' U F' U2 F U2 F' U F"],
      ],
      [
        "R U R' U' R U2 R' U' R U R'",
        '코너는 제자리에서 흰색이 앞을 봐요. 엣지는 제자리에 바르게 들어가 있어요.',
        ["R U' R' U' R U R' U2 R U' R'", "R2 U2 R' U' R U' R' U2 R'"],
      ],
      [
        "R U' R' U R U2 R' U R U' R'",
        '코너는 제자리에서 흰색이 오른쪽을 봐요. 엣지는 제자리에 바르게 들어가 있어요.',
        ["R U R' U2 R U' R' U R U R'", "R U2 R U R' U R U2 R2"],
      ],
      [
        "R U F R U R' U' F' R'",
        '코너는 제자리에서 흰색이 오른쪽을 봐요. 엣지는 제자리에 뒤집혀 들어가 있어요.',
        ["R U' R' U2 R U R' F' U' F"],
      ],
      [
        "R F U R U' R' F' U' R'",
        '코너는 제자리에서 흰색이 앞을 봐요. 엣지는 제자리에 뒤집혀 들어가 있어요.',
        ["F' U F U2 F' U' F R U R'"],
      ],
    ],
  ],
];

function buildCases(): AlgCase[] {
  const out: AlgCase[] = [];
  for (const [group, rows] of GROUPS) {
    for (const [alg, note, alts] of rows) {
      const n = out.length + 1;
      out.push({
        id: `f2l-${String(n).padStart(2, '0')}`,
        name: `F2L ${n}`,
        group,
        alg,
        ...(alts && { alts: [...alts] }),
        note,
      });
    }
  }
  return out;
}

/** F2L 41개 케이스. 쉬운 것부터, 묶음별로 모여 있다. */
export const F2L_CASES: readonly AlgCase[] = buildCases();

// ───────── 짝(코너 + 엣지)의 자리 읽기 ─────────

interface Spot {
  readonly name: string;
  readonly faces: readonly Face[];
  /** faces와 같은 순서의 칸 번호 */
  readonly cells: readonly number[];
}

const spot = (name: string, faces: readonly Face[]): Spot => ({
  name,
  faces,
  cells: faces.map((f) => facelet(name, f)),
});

/** 윗층 코너 자리. 번호는 UFR에서 U를 그만큼 돌렸을 때 가는 자리이고, 면 순서도 U를 따라 돈다. */
const TOP_CORNERS: readonly Spot[] = [
  spot('UFR', ['U', 'R', 'F']),
  spot('UFL', ['U', 'F', 'L']),
  spot('UBL', ['U', 'L', 'B']),
  spot('UBR', ['U', 'B', 'R']),
];
const SLOT_CORNER = spot('DFR', ['D', 'R', 'F']);

/** 윗층 엣지 자리. 번호는 UF에서 U를 그만큼 돌렸을 때 가는 자리 */
const TOP_EDGES: readonly Spot[] = [
  spot('UF', ['U', 'F']),
  spot('UL', ['U', 'L']),
  spot('UB', ['U', 'B']),
  spot('UR', ['U', 'R']),
];
const SLOT_EDGE = spot('FR', ['F', 'R']);

interface PairPlace {
  /** 코너 자리: 0~3은 TOP_CORNERS 번호, -1은 제자리(DFR) */
  readonly corner: number;
  /** 흰색이 보는 면이 그 자리 faces의 몇 번째인지 (0 = 위 또는 아래) */
  readonly twist: number;
  /** 엣지 자리: 0~3은 TOP_EDGES 번호, -1은 제자리(FR) */
  readonly edge: number;
  /** 앞 센터 색이 보는 면이 그 자리 faces의 몇 번째인지 */
  readonly flip: number;
}

/** 앞-오른쪽 짝의 코너와 엣지가 어디에 어떻게 있는지. 다른 슬롯에 들어가 있으면 null */
function locatePair(state: CubeState): PairPlace | null {
  const white = centerColor(state, 'D');
  const front = centerColor(state, 'F');
  const right = centerColor(state, 'R');
  const isPair = (a: number, b: number) => (a === front && b === right) || (a === right && b === front);

  let corner = -2;
  let twist = 0;
  for (let i = -1; i < 4; i++) {
    const cells = i < 0 ? SLOT_CORNER.cells : TOP_CORNERS[i].cells;
    for (let t = 0; t < 3; t++) {
      if (state[cells[t]] === white && isPair(state[cells[(t + 1) % 3]], state[cells[(t + 2) % 3]])) {
        corner = i;
        twist = t;
      }
    }
  }
  if (corner === -2) return null;

  for (let i = -1; i < 4; i++) {
    const cells = i < 0 ? SLOT_EDGE.cells : TOP_EDGES[i].cells;
    if (isPair(state[cells[0]], state[cells[1]])) {
      return { corner, twist, edge: i, flip: state[cells[0]] === front ? 0 : 1 };
    }
  }
  return null;
}

/**
 * 자리를 글자로 적는다. 예: 'UFR/R+UB/U' = 코너는 UFR에 있고 흰색이 R면, 엣지는 UB에 있고 앞 센터 색이 U면.
 * turns는 윗면을 U 방향으로 더 돌렸다고 칠 횟수 (윗층 조각의 자리 이름만 바뀐다).
 */
function describe(p: PairPlace, turns: number): string {
  const c = p.corner < 0 ? SLOT_CORNER : TOP_CORNERS[(p.corner + turns + 4) % 4];
  const e = p.edge < 0 ? SLOT_EDGE : TOP_EDGES[(p.edge + turns + 4) % 4];
  return `${c.name}/${c.faces[p.twist]}+${e.name}/${e.faces[p.flip]}`;
}

const SOLVED_PLACE = 'DFR/D+FR/F';

/**
 * 앞-오른쪽 짝이 어떤 케이스인지 나타내는 키. 윗면을 돌린 것(U, U2, U')은 같은 케이스로 본다.
 * 코너가 윗층에 있으면 코너를 UFR로, 코너가 제자리에 있고 엣지만 윗층이면 엣지를 UF로 옮긴 모습을 적는다.
 * 십자와 나머지 세 슬롯은 보지 않는다. 짝이 다 맞았으면 'solved',
 * 코너나 엣지가 다른 슬롯에 들어가 있으면 null.
 */
export function f2lCaseKey(state: CubeState): string | null {
  const p = locatePair(state);
  if (!p) return null;
  const key = describe(p, p.corner >= 0 ? -p.corner : p.edge >= 0 ? -p.edge : 0);
  return key === SOLVED_PLACE ? 'solved' : key;
}

/** 케이스의 모습: 완성 상태에 공식을 거꾸로 적용한 상태 */
const caseState = (alg: string) => applyMoves(YELLOW_UP, invertAlg(parseAlg(alg)));

function buildByKey(): Map<string, AlgCase> {
  const map = new Map<string, AlgCase>();
  for (const c of F2L_CASES) {
    const key = f2lCaseKey(caseState(c.alg));
    if (key === null || key === 'solved' || map.has(key)) throw new Error(`F2L 공식 표가 잘못됨: ${c.id}`);
    map.set(key, c);
  }
  return map;
}

/** 케이스 키 → 공식 */
export const F2L_BY_KEY: ReadonlyMap<string, AlgCase> = buildByKey();

/** 공식이 기대하는 정확한 자리(U를 돌려 맞추기 전) → 그 공식의 동작 */
const ALG_BY_PLACE: ReadonlyMap<string, readonly Move[]> = new Map(
  F2L_CASES.map((c) => {
    const p = locatePair(caseState(c.alg));
    if (!p) throw new Error(`F2L 공식 표가 잘못됨: ${c.id}`);
    return [describe(p, 0), parseAlg(c.alg)] as const;
  }),
);

const U_ADJUSTS: readonly (readonly [turns: number, moves: readonly Move[]])[] = [
  [0, []],
  [1, [{ base: 'U', amount: 1 }]],
  [-1, [{ base: 'U', amount: -1 }]],
  [2, [{ base: 'U', amount: 2 }]],
];

/**
 * 앞-오른쪽 슬롯을 채우는 동작: [윗면 맞추기(U) …, 공식 …].
 * 이미 맞았으면 [], 코너나 엣지가 다른 슬롯에 들어가 있으면 null.
 */
export function f2lSolve(state: CubeState): Move[] | null {
  const p = locatePair(state);
  if (!p) return null;
  if (describe(p, 0) === SOLVED_PLACE) return [];
  for (const [turns, pre] of U_ADJUSTS) {
    const alg = ALG_BY_PLACE.get(describe(p, turns));
    if (alg) return [...pre, ...alg];
  }
  return null;
}
