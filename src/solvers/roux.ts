/**
 * Roux 풀이기: 첫 번째 블록 → 두 번째 블록 → CMLL → LSE.
 *
 * 잡는 방향은 다른 풀이기와 같다: 노란색이 위, 흰색이 아래, 초록색이 앞.
 * 이때 왼쪽 블록은 빨강, 오른쪽 블록은 주황이다. 처음 잡은 방향을 끝까지 유지한다
 * (M, r처럼 가운데 줄을 돌리는 동작 때문에 위·앞 센터의 색은 중간에 바뀔 수 있다).
 *
 * - 첫 번째 블록: 조각 5개의 위치·방향만 보고 IDA*로 가장 짧은 길을 찾는다.
 * - 두 번째 블록: R, r, U, M만 쓰면 상태가 108만 가지뿐이라 거리표를 통째로 만들어 따라 내려간다.
 * - CMLL: 공식 모음(src/algorithms/cmll)에서 맞는 공식을 고른다.
 * - LSE: M, U만 쓰는 상태 전체의 거리표를 만들어 가장 짧은 길을 따라간다.
 *
 * 표는 처음 쓸 때 만든다. 화면이나 Node 기능을 쓰지 않는 순수 모듈이다.
 */
import { CMLL_CASES } from '../algorithms/cmll';
import type { AlgCase } from '../algorithms/types';
import {
  BASE_MOVES,
  FACELETS,
  applyMove,
  applyMoves,
  isSolved,
  type BaseMove,
  type CubeState,
  type Face,
  type Move,
} from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { parseAlg } from '../core/notation';
import { centerColor, colorAt, facelet } from '../core/pieces';
import type { SolveStage, SolveStep } from './types';

export type RouxStageId = 'orient' | 'fb' | 'sb' | 'cmll' | 'lse';

export const ROUX_STAGE_ORDER: readonly RouxStageId[] = ['orient', 'fb', 'sb', 'cmll', 'lse'];

export const ROUX_STAGE_TITLES: Readonly<Record<RouxStageId, string>> = {
  orient: '큐브 잡기',
  fb: '첫 번째 블록',
  sb: '두 번째 블록',
  cmll: 'CMLL',
  lse: 'LSE (마지막 6개 엣지)',
};

const WHITE = 0;
const GREEN = 2;
const YELLOW = 3;
const QUARTERS = [1, 2, -1] as const;
const AMOUNTS = [1, -1, 2] as const;
const UNSEEN = 255;

function turns(base: BaseMove, k: number): Move[] {
  const n = ((k % 4) + 4) % 4;
  return n === 0 ? [] : [{ base, amount: QUARTERS[n - 1] }];
}

function fail(): never {
  throw new Error('풀 수 없는 상태예요. 큐브의 색 배치를 다시 확인해 주세요.');
}

const movesOf = (bases: readonly BaseMove[]): Move[] =>
  bases.flatMap((base) => AMOUNTS.map((amount) => ({ base, amount })));

// ───────── 스티커 좌표 ─────────
// 엣지 스티커 24칸, 코너 스티커 24칸에 각각 0~23 번호를 붙인다.
// 조각마다 스티커 하나만 따라가면 좌표 하나가 그 조각의 위치와 방향을 함께 나타낸다.

/** 한 조각에 붙은 스티커 수 (센터 1, 엣지 2, 코너 3) */
const stickerCount = (cell: number) => FACELETS[cell].pos.filter((v) => v !== 0).length;
const EDGE_CELLS: readonly number[] = FACELETS.flatMap((_, i) => (stickerCount(i) === 2 ? [i] : []));
const CORNER_CELLS: readonly number[] = FACELETS.flatMap((_, i) => (stickerCount(i) === 3 ? [i] : []));
/** 같은 조각에 붙은 다른 칸들 */
const MATES: readonly (readonly number[])[] = FACELETS.map((f, i) =>
  FACELETS.flatMap((g, j) => (j !== i && g.pos.join() === f.pos.join() ? [j] : [])),
);
/** 칸 번호를 적어 둔 큐브. 돌려 보면 스티커가 어디로 가는지 알 수 있다. */
const LABELS: CubeState = FACELETS.map((_, i) => i);

/** table[m * 24 + c] = 좌표 c의 스티커가 m번 동작 뒤에 있는 좌표 */
function stickerMoves(cells: readonly number[], moves: readonly Move[]): Uint8Array {
  const coordOf = new Map(cells.map((cell, c) => [cell, c]));
  const table = new Uint8Array(moves.length * 24);
  moves.forEach((move, m) => {
    const after = applyMove(LABELS, move);
    cells.forEach((cell, c) => {
      table[m * 24 + coordOf.get(after[cell])!] = c;
    });
  });
  return table;
}

/** 따라갈 조각: 어떤 색 스티커를 따라가는지와, 같은 조각의 나머지 색 */
interface Tracked {
  readonly cells: readonly number[];
  readonly color: number;
  readonly mates: string;
  /** 제자리에 있을 때의 좌표 */
  readonly home: number;
}

const mateKey = (s: CubeState, cell: number) =>
  MATES[cell]
    .map((j) => s[j])
    .sort()
    .join('');

/** YELLOW_UP 기준 위치 이름과 그 조각의 한 면으로 따라갈 스티커를 정한다. 예: tracked('DFL', 'L') */
function tracked(piece: string, face: Face): Tracked {
  const cell = facelet(piece, face);
  const cells = piece.length === 2 ? EDGE_CELLS : CORNER_CELLS;
  return { cells, color: YELLOW_UP[cell], mates: mateKey(YELLOW_UP, cell), home: cells.indexOf(cell) };
}

/** 조각이 지금 있는 좌표. 없거나 둘 이상이면 풀 수 없는 상태다. */
function locate(s: CubeState, t: Tracked): number {
  let found = -1;
  for (let c = 0; c < 24; c++) {
    const cell = t.cells[c];
    if (s[cell] !== t.color || mateKey(s, cell) !== t.mates) continue;
    if (found >= 0) fail();
    found = c;
  }
  if (found < 0) fail();
  return found;
}

// ───────── 첫 번째 블록 ─────────
// 왼쪽 아래 두 층의 1×2×3: 엣지 DL, FL, BL과 코너 DFL, DBL. 다섯 조각 모두 빨간 스티커를 따라간다.

/** 왼쪽·오른쪽 센터를 움직이지 않는 동작만 쓴다. 돌리기 편한 것부터 살펴본다. */
const FB_MOVES: readonly Move[] = movesOf(['U', 'R', 'r', 'M', 'F', 'L', 'D', 'B', 'l']);
const FB_COUNT = FB_MOVES.length;
const FB_EDGES: readonly Tracked[] = [tracked('DL', 'L'), tracked('FL', 'L'), tracked('BL', 'L')];
const FB_CORNERS: readonly Tracked[] = [tracked('DFL', 'L'), tracked('DBL', 'L')];
/** 거리표마다 함께 보는 엣지 두 개 (코너 두 개는 늘 함께 본다) */
const FB_EDGE_PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 2],
];
const FB_MAX_DEPTH = 12;

interface FbTables {
  readonly edge: Uint8Array;
  readonly corner: Uint8Array;
  /** prune[k][코너 2개 + 엣지 2개의 좌표] = 그 네 조각만 맞추는 데 필요한 최소 회전 수 */
  readonly prune: readonly Uint8Array[];
  /** allowed[앞 동작 * 27 + 다음 동작] = 이어서 살펴볼 가치가 있는지 */
  readonly allowed: Uint8Array;
}

let fbTables: FbTables | null = null;

function buildFbTables(): FbTables {
  const edge = stickerMoves(EDGE_CELLS, FB_MOVES);
  const corner = stickerMoves(CORNER_CELLS, FB_MOVES);

  const cf = FB_CORNERS[0].home;
  const cb = FB_CORNERS[1].home;
  const queue = new Int32Array(24 * 21 * 24 * 22);
  const prune = FB_EDGE_PAIRS.map(([i, j]) => {
    const dist = new Uint8Array(24 ** 4).fill(UNSEEN);
    const solved = cf + 24 * cb + 576 * FB_EDGES[i].home + 13824 * FB_EDGES[j].home;
    dist[solved] = 0;
    queue[0] = solved;
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const index = queue[head];
      const d = dist[index] + 1;
      const a = index % 24;
      const b = ((index / 24) | 0) % 24;
      const c = ((index / 576) | 0) % 24;
      const e = (index / 13824) | 0;
      for (let o = 0; o < FB_COUNT * 24; o += 24) {
        const next = corner[o + a] + 24 * corner[o + b] + 576 * edge[o + c] + 13824 * edge[o + e];
        if (dist[next] === UNSEEN) {
          dist[next] = d;
          queue[tail++] = next;
        }
      }
    }
    return dist;
  });

  // 같은 층을 연달아 돌리지 않는다. 같은 축의 동작은 순서를 바꿔도 같으므로 한 가지 순서만 본다.
  const allowed = new Uint8Array(FB_COUNT * FB_COUNT);
  for (let last = 0; last < FB_COUNT; last++) {
    for (let m = 0; m < FB_COUNT; m++) {
      const sameAxis = BASE_MOVES[FB_MOVES[last].base].axis === BASE_MOVES[FB_MOVES[m].base].axis;
      const baseOrder = ((m / 3) | 0) - ((last / 3) | 0);
      allowed[last * FB_COUNT + m] = baseOrder !== 0 && (!sameAxis || baseOrder > 0) ? 1 : 0;
    }
  }
  return { edge, corner, prune, allowed };
}

/** 첫 번째 블록을 만드는 가장 짧은 동작 (IDA*). 이미 되어 있으면 빈 배열 */
function solveFirstBlock(state: CubeState): Move[] {
  const t = (fbTables ??= buildFbTables());
  const { edge, corner, allowed } = t;
  const [p01, p02, p12] = t.prune;
  const [e0, e1, e2] = FB_EDGES.map((piece) => locate(state, piece));
  const [c0, c1] = FB_CORNERS.map((piece) => locate(state, piece));

  /** 남은 회전 수의 하한 */
  const bound = (a: number, b: number, c: number, x: number, y: number): number => {
    const corners = x + 24 * y;
    const h01 = p01[corners + 576 * a + 13824 * b];
    const h02 = p02[corners + 576 * a + 13824 * c];
    const h12 = p12[corners + 576 * b + 13824 * c];
    return Math.max(h01, h02, h12);
  };

  const path: number[] = [];
  const search = (a: number, b: number, c: number, x: number, y: number, left: number, last: number): boolean => {
    const need = bound(a, b, c, x, y);
    if (need === 0) return true;
    if (need > left) return false;
    const from = last * FB_COUNT;
    for (let m = 0; m < FB_COUNT; m++) {
      if (last >= 0 && allowed[from + m] === 0) continue;
      const o = m * 24;
      path.push(m);
      if (search(edge[o + a], edge[o + b], edge[o + c], corner[o + x], corner[o + y], left - 1, m)) return true;
      path.pop();
    }
    return false;
  };

  const start = bound(e0, e1, e2, c0, c1);
  if (start === UNSEEN) fail();
  for (let depth = start; depth <= FB_MAX_DEPTH; depth++) {
    if (search(e0, e1, e2, c0, c1, depth, -1)) return path.map((m) => FB_MOVES[m]);
  }
  fail();
}

// ───────── 두 번째 블록 ─────────
// 오른쪽 아래 두 층의 1×2×3: 엣지 DR, FR, BR과 코너 DFR, DBR. 주황 스티커를 따라간다.
// R, r, U, M은 첫 번째 블록 자리를 건드리지 않으므로, 그 자리를 뺀 18칸씩만 좌표로 쓴다.

const SB_MOVES: readonly Move[] = movesOf(['U', 'R', 'r', 'M']);
const SB_COUNT = SB_MOVES.length;
const SB_EDGES: readonly Tracked[] = [tracked('DR', 'R'), tracked('FR', 'R'), tracked('BR', 'R')];
const SB_CORNERS: readonly Tracked[] = [tracked('DFR', 'R'), tracked('DBR', 'R')];
const FREE = 18;
const SB_EDGE_SIZE = FREE ** 3;
const SB_CORNER_SIZE = FREE ** 2;

const inFirstBlock = (cell: number) => FACELETS[cell].pos[0] === -1 && FACELETS[cell].pos[1] !== 1;

interface SbTables {
  /** 24칸 좌표 → 첫 번째 블록 자리를 뺀 18칸 좌표 (블록 자리는 -1) */
  readonly edgeFree: Int8Array;
  readonly cornerFree: Int8Array;
  /** edges[m * 5832 + 엣지 3개의 좌표] = m번 동작 뒤의 엣지 3개 좌표 */
  readonly edges: Uint16Array;
  readonly corners: Uint16Array;
  /** dist[엣지 좌표 * 324 + 코너 좌표] = 블록 완성까지 남은 최소 회전 수 */
  readonly dist: Uint8Array;
}

let sbTables: SbTables | null = null;

function buildSbTables(): SbTables {
  /** 18칸 좌표로 줄인 이동표 */
  const compact = (cells: readonly number[]) => {
    const full = stickerMoves(cells, SB_MOVES);
    const free = new Int8Array(24).fill(-1);
    const list = cells.flatMap((cell, c) => (inFirstBlock(cell) ? [] : [c]));
    list.forEach((c, k) => {
      free[c] = k;
    });
    const move = new Uint8Array(SB_COUNT * FREE);
    for (let m = 0; m < SB_COUNT; m++) list.forEach((c, k) => (move[m * FREE + k] = free[full[m * 24 + c]]));
    return { free, move };
  };
  const edge = compact(EDGE_CELLS);
  const corner = compact(CORNER_CELLS);

  const edges = new Uint16Array(SB_COUNT * SB_EDGE_SIZE);
  const corners = new Uint16Array(SB_COUNT * SB_CORNER_SIZE);
  for (let m = 0; m < SB_COUNT; m++) {
    const o = m * FREE;
    for (let i = 0; i < SB_EDGE_SIZE; i++) {
      edges[m * SB_EDGE_SIZE + i] =
        edge.move[o + (i % FREE)] +
        FREE * edge.move[o + (((i / FREE) | 0) % FREE)] +
        FREE * FREE * edge.move[o + ((i / (FREE * FREE)) | 0)];
    }
    for (let i = 0; i < SB_CORNER_SIZE; i++) {
      corners[m * SB_CORNER_SIZE + i] = corner.move[o + (i % FREE)] + FREE * corner.move[o + ((i / FREE) | 0)];
    }
  }

  const dist = new Uint8Array(SB_EDGE_SIZE * SB_CORNER_SIZE).fill(UNSEEN);
  const queue = new Int32Array(18 * 16 * 14 * 18 * 15);
  const solved =
    sbIndex(
      edge.free,
      corner.free,
      SB_EDGES.map((p) => p.home),
      SB_CORNERS.map((p) => p.home),
    ) ?? fail();
  dist[solved] = 0;
  queue[0] = solved;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    const d = dist[index] + 1;
    const e = (index / SB_CORNER_SIZE) | 0;
    const c = index % SB_CORNER_SIZE;
    for (let m = 0; m < SB_COUNT; m++) {
      const next = edges[m * SB_EDGE_SIZE + e] * SB_CORNER_SIZE + corners[m * SB_CORNER_SIZE + c];
      if (dist[next] === UNSEEN) {
        dist[next] = d;
        queue[tail++] = next;
      }
    }
  }
  return { edgeFree: edge.free, cornerFree: corner.free, edges, corners, dist };
}

/** 조각 5개의 24칸 좌표 → 거리표 번호. 첫 번째 블록 자리에 있는 조각이 있으면 null */
function sbIndex(
  edgeFree: Int8Array,
  cornerFree: Int8Array,
  edges: readonly number[],
  corners: readonly number[],
): number | null {
  const [a, b, c] = edges.map((coord) => edgeFree[coord]);
  const [x, y] = corners.map((coord) => cornerFree[coord]);
  if (a < 0 || b < 0 || c < 0 || x < 0 || y < 0) return null;
  return (a + FREE * b + FREE * FREE * c) * SB_CORNER_SIZE + x + FREE * y;
}

/** 두 번째 블록을 만드는 가장 짧은 동작 (R, r, U, M만). 첫 번째 블록이 되어 있어야 한다. */
function solveSecondBlock(state: CubeState): Move[] {
  const t = (sbTables ??= buildSbTables());
  let index =
    sbIndex(
      t.edgeFree,
      t.cornerFree,
      SB_EDGES.map((piece) => locate(state, piece)),
      SB_CORNERS.map((piece) => locate(state, piece)),
    ) ?? fail();
  if (t.dist[index] === UNSEEN) fail();

  // 거리가 1씩 줄어드는 길을 따라간다 (어느 길이든 최단).
  const out: Move[] = [];
  while (t.dist[index] > 0) {
    const want = t.dist[index] - 1;
    const e = (index / SB_CORNER_SIZE) | 0;
    const c = index % SB_CORNER_SIZE;
    let next = -1;
    for (let m = 0; m < SB_COUNT && next < 0; m++) {
      const candidate = t.edges[m * SB_EDGE_SIZE + e] * SB_CORNER_SIZE + t.corners[m * SB_CORNER_SIZE + c];
      if (t.dist[candidate] === want) {
        next = candidate;
        out.push(SB_MOVES[m]);
      }
    }
    if (next < 0) fail();
    index = next;
  }
  return out;
}

// ───────── CMLL ─────────

/** 윗층 코너와 그 아래 블록 코너. 옆 스티커는 블록(앞·뒤)과 센터(왼쪽·오른쪽)에 맞춰 본다. */
const TOP_CORNERS: readonly (readonly [string, string, Face, Face])[] = [
  ['UFL', 'DFL', 'F', 'L'],
  ['UFR', 'DFR', 'F', 'R'],
  ['UBL', 'DBL', 'B', 'L'],
  ['UBR', 'DBR', 'B', 'R'],
];

/** 윗층 코너 4개가 방향도 자리도 블록과 맞는지 (위 센터는 아직 노란색이 아닐 수 있다) */
const topCornersHome = (s: CubeState) =>
  TOP_CORNERS.every(
    ([corner, below, a, b]) =>
      colorAt(s, corner, 'U') === YELLOW &&
      colorAt(s, corner, a) === colorAt(s, below, a) &&
      colorAt(s, corner, b) === centerColor(s, b),
  );

/** U를 몇 번 돌리면 조건이 맞는지 (0~3). 없으면 -1 */
function findU(s: CubeState, test: (s: CubeState) => boolean): number {
  for (let k = 0; k < 4; k++) if (test(applyMoves(s, turns('U', k)))) return k;
  return -1;
}

/** 윗층 코너끼리는 다 맞고, U만 돌리면 블록과도 맞는지 */
const cornersDone = (s: CubeState) => findU(s, topCornersHome) >= 0;

let cmllAlgs: readonly { algCase: AlgCase; alg: Move[] }[] | null = null;

/** U를 맞춘 뒤 공식을 하면 코너가 다 맞는 것 중 가장 짧은 것을 고른다. */
function findCmll(state: CubeState): { algCase: AlgCase; pre: Move[]; alg: Move[] } | null {
  cmllAlgs ??= CMLL_CASES.map((algCase) => ({ algCase, alg: parseAlg(algCase.alg) }));
  let best: { algCase: AlgCase; pre: Move[]; alg: Move[] } | null = null;
  for (let k = 0; k < 4; k++) {
    const pre = turns('U', k);
    const s = applyMoves(state, pre);
    for (const { algCase, alg } of cmllAlgs) {
      if (best && pre.length + alg.length >= best.pre.length + best.alg.length) continue;
      if (cornersDone(applyMoves(s, alg))) best = { algCase, pre, alg };
    }
  }
  return best;
}

// ───────── LSE ─────────
// 남은 것: 엣지 6개(윗층 4개 + DF, DB), 가운데 줄 센터, 윗층 코너의 U 방향.
// M, U만 쓰면 상태가 18만 가지쯤이라 완성 상태에서 거꾸로 너비 우선 탐색을 해 거리표를 만든다.
// 번호 = ((엣지 자리 순열 * 64 + 엣지 방향 6비트) * 4 + 센터) * 4 + 코너의 U 방향

const LSE_MOVES: readonly Move[] = movesOf(['M', 'U']);
const LSE_COUNT = LSE_MOVES.length;
const LSE_POSITIONS = ['UF', 'UL', 'UB', 'UR', 'DF', 'DB'];
/** 자리마다 위·아래를 보는 칸과 옆을 보는 칸 */
const LSE_MAIN = LSE_POSITIONS.map((p) => facelet(p, p[0] as Face));
const LSE_SIDE = LSE_POSITIONS.map((p) => facelet(p, p[1] as Face));
/** 조각을 알아보는 열쇠 (두 색) */
const LSE_KEYS = LSE_POSITIONS.map((_, p) => [YELLOW_UP[LSE_MAIN[p]], YELLOW_UP[LSE_SIDE[p]]].sort().join(''));
/** M을 k번 돌렸을 때 앞 센터의 색 */
const LSE_CENTERS = [0, 1, 2, 3].map((k) => centerColor(applyMoves(YELLOW_UP, turns('M', k)), 'F'));
/** 동작마다 센터, 코너의 U 방향이 얼마나 도는지 (M, M', M2, U, U', U2 순서) */
const LSE_CENTER_STEP = [1, 3, 2, 0, 0, 0];
const LSE_AUF_STEP = [0, 0, 0, 1, 3, 2];
const LSE_PERMS = 720;
const LSE_SIZE = LSE_PERMS * 64 * 16;

function permRank(perm: readonly number[]): number {
  let rank = 0;
  for (let i = 0; i < 6; i++) {
    let smaller = 0;
    for (let j = i + 1; j < 6; j++) if (perm[j] < perm[i]) smaller++;
    rank = rank * (6 - i) + smaller;
  }
  return rank;
}

function permUnrank(rank: number): number[] {
  const digits = new Array<number>(6);
  let r = rank;
  for (let i = 5; i >= 0; i--) {
    digits[i] = r % (6 - i);
    r = (r / (6 - i)) | 0;
  }
  const pool = [0, 1, 2, 3, 4, 5];
  return digits.map((d) => pool.splice(d, 1)[0]);
}

interface LseTables {
  /** perm[m * 720 + 순열 번호] = m번 동작 뒤의 순열 번호 */
  readonly perm: Uint16Array;
  /** flip[m * 64 + 방향 비트] = m번 동작 뒤의 방향 비트 */
  readonly flip: Uint8Array;
  readonly dist: Uint8Array;
}

let lseTables: LseTables | null = null;

const lseStep = (t: LseTables, index: number, m: number): number => {
  const perm = t.perm[m * LSE_PERMS + (index >> 10)];
  const flip = t.flip[m * 64 + ((index >> 4) & 63)];
  const center = (((index >> 2) & 3) + LSE_CENTER_STEP[m]) & 3;
  const auf = ((index & 3) + LSE_AUF_STEP[m]) & 3;
  return (((perm << 6) | flip) << 4) | (center << 2) | auf;
};

function buildLseTables(): LseTables {
  const perm = new Uint16Array(LSE_COUNT * LSE_PERMS);
  const flip = new Uint8Array(LSE_COUNT * 64);
  LSE_MOVES.forEach((move, m) => {
    // 자리 p의 조각이 가는 자리와, 그때 뒤집히는지
    const after = applyMove(LABELS, move);
    const to = new Array<number>(6);
    const flips = new Array<number>(6);
    for (let q = 0; q < 6; q++) {
      const from = after[LSE_MAIN[q]];
      const p = LSE_MAIN.indexOf(from) >= 0 ? LSE_MAIN.indexOf(from) : LSE_SIDE.indexOf(from);
      to[p] = q;
      flips[p] = LSE_MAIN[p] === from ? 0 : 1;
    }
    for (let rank = 0; rank < LSE_PERMS; rank++) {
      const before = permUnrank(rank);
      const next = new Array<number>(6);
      for (let p = 0; p < 6; p++) next[to[p]] = before[p];
      perm[m * LSE_PERMS + rank] = permRank(next);
    }
    for (let bits = 0; bits < 64; bits++) {
      let next = 0;
      for (let p = 0; p < 6; p++) next |= (((bits >> p) & 1) ^ flips[p]) << to[p];
      flip[m * 64 + bits] = next;
    }
  });

  const dist = new Uint8Array(LSE_SIZE).fill(UNSEEN);
  const t: LseTables = { perm, flip, dist };
  const queue = new Int32Array(LSE_SIZE);
  dist[0] = 0;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    const d = dist[index] + 1;
    for (let m = 0; m < LSE_COUNT; m++) {
      const next = lseStep(t, index, m);
      if (dist[next] === UNSEEN) {
        dist[next] = d;
        queue[tail++] = next;
      }
    }
  }
  return t;
}

/** 양쪽 블록과 윗층 코너가 끝난 상태를 거리표 번호로 읽는다. */
function lseIndex(state: CubeState): number {
  const solvingTurns = findU(state, topCornersHome);
  const center = LSE_CENTERS.indexOf(centerColor(state, 'F'));
  if (solvingTurns < 0 || center < 0) fail();

  const perm: number[] = [];
  let flip = 0;
  for (let q = 0; q < 6; q++) {
    const main = state[LSE_MAIN[q]];
    const side = state[LSE_SIDE[q]];
    const piece = LSE_KEYS.indexOf([main, side].sort().join(''));
    if (piece < 0 || perm.includes(piece)) fail();
    perm.push(piece);
    // 노란색·흰색 스티커가 위·아래를 보고 있지 않으면 뒤집힌 것이다.
    if (main !== YELLOW && main !== WHITE) flip |= 1 << q;
  }
  return (((permRank(perm) << 6) | flip) << 4) | (center << 2) | ((4 - solvingTurns) & 3);
}

/** 남은 엣지 6개와 센터를 맞추는 가장 짧은 동작 (M, U만) */
function solveLse(state: CubeState): Move[] {
  const t = (lseTables ??= buildLseTables());
  let index = lseIndex(state);
  if (t.dist[index] === UNSEEN) fail();
  const out: Move[] = [];
  while (t.dist[index] > 0) {
    const want = t.dist[index] - 1;
    let next = -1;
    for (let m = 0; m < LSE_COUNT && next < 0; m++) {
      const candidate = lseStep(t, index, m);
      if (t.dist[candidate] === want) {
        next = candidate;
        out.push(LSE_MOVES[m]);
      }
    }
    if (next < 0) fail();
    index = next;
  }
  return out;
}

// ───────── 풀이 ─────────

class Builder {
  state: CubeState;
  readonly stages: SolveStage<RouxStageId>[] = [];
  private steps: SolveStep[] = [];

  constructor(state: CubeState) {
    this.state = state;
  }

  begin(id: RouxStageId): void {
    this.steps = [];
    this.stages.push({ id, title: ROUX_STAGE_TITLES[id], steps: this.steps });
  }

  do(note: string, moves: readonly Move[]): void {
    if (moves.length === 0) return;
    this.state = applyMoves(this.state, moves);
    this.steps.push({ note, moves: [...moves] });
  }
}

function orient(b: Builder): void {
  b.begin('orient');
  for (const first of ['', 'x', "x'", 'z', "z'", 'x2']) {
    for (const second of ['', 'y', "y'", 'y2']) {
      const moves = parseAlg(`${first} ${second}`);
      const s = applyMoves(b.state, moves);
      if (centerColor(s, 'D') === WHITE && centerColor(s, 'F') === GREEN) {
        b.do('노란색 센터가 위, 초록색 센터가 앞에 오도록 큐브를 잡아요.', moves);
        return;
      }
    }
  }
  fail();
}

function firstBlock(b: Builder): void {
  b.begin('fb');
  const moves = solveFirstBlock(b.state);
  b.do(`왼쪽 아래 두 층에 빨간색 1×2×3 블록(엣지 3개와 코너 2개)을 만들어요 (${moves.length}수).`, moves);
}

function secondBlock(b: Builder): void {
  b.begin('sb');
  const moves = solveSecondBlock(b.state);
  b.do(
    `첫 번째 블록은 그대로 두고, R·r·U·M만 돌려 오른쪽 아래 두 층에 주황색 1×2×3 블록을 만들어요 (${moves.length}수).`,
    moves,
  );
}

function cmll(b: Builder): void {
  b.begin('cmll');
  if (cornersDone(b.state)) return;
  const found = findCmll(b.state);
  if (!found) fail();
  b.do('U를 돌려 윗층 코너를 공식의 시작 위치에 맞춰요.', found.pre);
  b.do(`${found.algCase.name} 공식으로 윗층 코너 4개의 방향과 자리를 한 번에 맞춰요.`, found.alg);
}

function lse(b: Builder): void {
  b.begin('lse');
  const moves = solveLse(b.state);
  b.do(`M과 U만 돌려 남은 엣지 6개와 가운데 줄 센터를 맞춰요 (${moves.length}수).`, moves);
}

/**
 * Roux 방식으로 푼다. 단계는 항상 ROUX_STAGE_ORDER 순서로 모두 들어 있고,
 * 이미 끝난 단계는 steps가 비어 있다. 풀 수 없는 상태면 오류를 던진다.
 */
export function solveRoux(state: CubeState): SolveStage<RouxStageId>[] {
  const b = new Builder(state);
  orient(b);
  firstBlock(b);
  secondBlock(b);
  cmll(b);
  lse(b);
  if (!isSolved(b.state)) fail();
  return b.stages;
}
