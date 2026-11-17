/**
 * ZZ 풀이기: EO 라인 → 왼쪽 블록 → 오른쪽 블록 → OLL(코너만) → PLL.
 *
 * 잡는 방향은 다른 풀이기와 같다: 노란색이 위, 흰색이 아래, 초록색이 앞.
 * 처음 한 번 잡은 뒤로는 큐브를 통째로 돌리지 않는다 (x가 들어 있는 PLL 공식은 회전을 풀어서 쓴다).
 *
 * 엣지 방향(EO)의 정의 — 앞뒤(F/B) 축 기준:
 * - 엣지 자리마다 "기준 칸"을 하나 정한다. 윗층·아래층 자리는 U/D 면의 칸,
 *   가운데층 자리(FL, FR, BL, BR)는 F/B 면의 칸이다.
 * - 엣지 조각마다 "기준 스티커"를 하나 정한다. 노란색·흰색(U/D 센터 색)이 있으면 그 스티커,
 *   없으면 초록색·파란색(F/B 센터 색) 스티커다.
 * - 기준 스티커가 지금 있는 자리의 기준 칸에 붙어 있으면 "좋은 엣지", 아니면 "나쁜 엣지"다.
 * R, L, U, D와 F2, B2는 기준 칸을 기준 칸으로 옮기므로 좋고 나쁨을 바꾸지 않고,
 * F, B를 90° 돌릴 때만 그 면의 엣지 4개가 뒤집힌다. 그래서 좋은 엣지는
 * R, L, U, D, F2, B2만으로 제자리에 바르게 넣을 수 있다.
 *
 * - EO 라인: (엣지 방향 2¹¹ × DF·DB 엣지의 자리) 전체의 거리표를 만들어 가장 짧은 길을 따라간다.
 * - 왼쪽·오른쪽 블록: 조각 5개의 좌표 전체의 거리표를 만든다 (R·U·L만, R·U만).
 * - 가장 짧은 길이 여럿이면 다음 단계가 가장 짧아지는 길을 고른다.
 * - OLL, PLL: 공식 모음(src/algorithms)에서 맞는 공식을 고른다. 엣지가 이미 맞아 있어 OLL은 21~27번뿐이다.
 *
 * 표는 처음 쓸 때 만든다. 화면이나 Node 기능을 쓰지 않는 순수 모듈이다.
 */
import { OLL_CASES } from '../algorithms/oll';
import { PLL_CASES } from '../algorithms/pll';
import { TWO_LOOK_OLL_CORNERS } from '../algorithms/twoLook';
import type { AlgCase } from '../algorithms/types';
import {
  BASE_MOVES,
  FACELETS,
  applyMove,
  applyMoves,
  isRotation,
  isSolved,
  type BaseMove,
  type CubeState,
  type Face,
  type Move,
} from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { invertAlg, parseAlg } from '../core/notation';
import { centerColor, facelet } from '../core/pieces';
import type { SolveStage, SolveStep } from './types';

export type ZzStageId = 'orient' | 'eoline' | 'left' | 'right' | 'oll' | 'pll';

export const ZZ_STAGE_ORDER: readonly ZzStageId[] = ['orient', 'eoline', 'left', 'right', 'oll', 'pll'];

export const ZZ_STAGE_TITLES: Readonly<Record<ZzStageId, string>> = {
  orient: '큐브 잡기',
  eoline: 'EO 라인',
  left: '왼쪽 블록',
  right: '오른쪽 블록',
  oll: 'OLL (코너만)',
  pll: 'PLL',
};

const WHITE = 0;
const GREEN = 2;
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

// ───────── 동작 ─────────
// 앞에서부터 6개(U, R)가 오른쪽 블록, 9개(U, R, L)가 왼쪽 블록, 18개 전부가 EO 라인에서 쓰는 동작이다.

const BASES: readonly BaseMove[] = ['U', 'R', 'L', 'F', 'D', 'B'];
const MOVES: readonly Move[] = movesOf(BASES);
const AXES: readonly number[] = BASES.map((base) => BASE_MOVES[base].axis);
const EOLINE_COUNT = 18;
const LEFT_COUNT = 9;
const RIGHT_COUNT = 6;

// ───────── 조각 좌표 ─────────

/** 엣지 자리 12곳. 이름의 첫 글자 면에 있는 칸이 그 자리의 기준 칸이다. */
const EDGE_NAMES = ['UF', 'UL', 'UB', 'UR', 'DF', 'DB', 'DL', 'DR', 'FL', 'FR', 'BL', 'BR'] as const;
type EdgeName = (typeof EDGE_NAMES)[number];
const EDGE_MAIN: readonly number[] = EDGE_NAMES.map((p) => facelet(p, p[0] as Face));
const EDGE_SIDE: readonly number[] = EDGE_NAMES.map((p) => facelet(p, p[1] as Face));
/** 조각(제자리 번호)마다 기준 스티커의 색 */
const EDGE_MAIN_COLOR: readonly number[] = EDGE_MAIN.map((cell) => YELLOW_UP[cell]);
/** (기준 칸의 색, 옆 칸의 색) → 조각 번호. 어느 순서로 넣어도 된다. 없는 조합은 -1 */
const EDGE_BY_COLORS = new Int8Array(36).fill(-1);
EDGE_NAMES.forEach((_, piece) => {
  const a = YELLOW_UP[EDGE_MAIN[piece]];
  const b = YELLOW_UP[EDGE_SIDE[piece]];
  EDGE_BY_COLORS[a * 6 + b] = piece;
  EDGE_BY_COLORS[b * 6 + a] = piece;
});
const edgeAt = (name: EdgeName) => EDGE_NAMES.indexOf(name);
const DF = edgeAt('DF');
const DB = edgeAt('DB');

/** 코너 자리 8곳. 좌표 = 자리 * 3 + (이름의 몇 번째 글자 면을 보는 칸인지) */
const CORNER_NAMES = ['UFR', 'UFL', 'UBL', 'UBR', 'DFR', 'DFL', 'DBL', 'DBR'] as const;
type CornerName = (typeof CORNER_NAMES)[number];
const CORNER_CELLS: readonly number[] = CORNER_NAMES.flatMap((p) => [0, 1, 2].map((k) => facelet(p, p[k] as Face)));

/** 블록 하나: 엣지 3개와 코너 2개. 코너는 흰색 스티커를 따라간다. */
interface Block {
  /** 엣지 조각 번호 (= 제자리 번호) */
  readonly edges: readonly number[];
  /** 코너의 세 색을 비트로 모은 값 */
  readonly cornerColors: readonly number[];
  /** 다 맞았을 때의 거리표 번호 */
  readonly solved: number;
}

const colorBits = (s: CubeState, position: number) =>
  (1 << s[CORNER_CELLS[position * 3]]) |
  (1 << s[CORNER_CELLS[position * 3 + 1]]) |
  (1 << s[CORNER_CELLS[position * 3 + 2]]);

/** 번호 = 코너 좌표 2개(24 × 24) + 576 × 엣지 자리 3개(12 × 12 × 12) */
const BLOCK_SIZE = 576 * 1728;
const blockIndex = (edges: readonly number[], corners: readonly number[]) =>
  corners[0] + 24 * corners[1] + 576 * (edges[0] + 12 * edges[1] + 144 * edges[2]);

function block(edges: readonly EdgeName[], corners: readonly CornerName[]): Block {
  const edgeHomes = edges.map(edgeAt);
  const cornerHomes = corners.map((name) => CORNER_NAMES.indexOf(name));
  return {
    edges: edgeHomes,
    cornerColors: cornerHomes.map((position) => colorBits(YELLOW_UP, position)),
    solved: blockIndex(
      edgeHomes,
      cornerHomes.map((position) => position * 3),
    ),
  };
}

const LEFT_BLOCK = block(['DL', 'FL', 'BL'], ['DFL', 'DBL']);
const RIGHT_BLOCK = block(['DR', 'FR', 'BR'], ['DFR', 'DBR']);

/** 엣지 12개를 읽는다. bad = 나쁜 엣지가 있는 자리의 비트, at[조각] = 지금 있는 자리 */
function readEdges(s: CubeState): { bad: number; at: number[] } {
  const at = new Array<number>(12).fill(-1);
  let bad = 0;
  for (let p = 0; p < 12; p++) {
    const main = s[EDGE_MAIN[p]];
    const piece = EDGE_BY_COLORS[main * 6 + s[EDGE_SIDE[p]]];
    if (!(piece >= 0) || at[piece] >= 0) fail();
    at[piece] = p;
    // 기준 스티커가 기준 칸에 없으면 나쁜 엣지다.
    if (main !== EDGE_MAIN_COLOR[piece]) bad |= 1 << p;
  }
  return { bad, at };
}

/** 코너 조각의 좌표. 없거나 둘 이상이면 풀 수 없는 상태다. */
function locateCorner(s: CubeState, colors: number): number {
  let found = -1;
  for (let position = 0; position < 8; position++) {
    if (colorBits(s, position) !== colors) continue;
    if (found >= 0) fail();
    for (let k = 0; k < 3; k++) if (s[CORNER_CELLS[position * 3 + k]] === WHITE) found = position * 3 + k;
  }
  if (found < 0) fail();
  return found;
}

/** 블록 조각 5개가 지금 있는 곳의 거리표 번호 */
const blockStart = (s: CubeState, b: Block, at: readonly number[]) =>
  blockIndex(
    b.edges.map((piece) => at[piece]),
    b.cornerColors.map((colors) => locateCorner(s, colors)),
  );

const oddBits = (bits: number) => {
  let odd = 0;
  for (let v = bits; v; v &= v - 1) odd ^= 1;
  return odd;
};

// ───────── 표 ─────────

interface Tables {
  /** edge[m * 12 + 자리] = m번 동작 뒤의 자리 */
  readonly edge: Uint8Array;
  /** corner[m * 24 + 좌표] = m번 동작 뒤의 좌표 */
  readonly corner: Uint8Array;
  /** flip[m * 2048 + 나쁜 엣지 비트(11자리)] = m번 동작 뒤의 비트. 12번째 자리는 짝수 맞춤으로 정해진다. */
  readonly flip: Uint16Array;
  /** 거리표: 단계의 목표까지 남은 최소 회전 수 */
  readonly eoline: Uint8Array;
  readonly left: Uint8Array;
  readonly right: Uint8Array;
}

let tables: Tables | null = null;

/** 칸 번호를 적어 둔 큐브. 돌려 보면 스티커가 어디로 가는지 알 수 있다. */
const LABELS: CubeState = FACELETS.map((_, i) => i);

/** EO 라인 번호 = 나쁜 엣지 비트(11자리) + 2048 × (DF 엣지 자리 + 12 × DB 엣지 자리) */
const EOLINE_SIZE = 2048 * 144;
const EOLINE_SOLVED = 2048 * (DF + 12 * DB);

const eolineStep = (t: Tables, index: number, m: number): number => {
  const line = index >> 11;
  return (
    t.flip[m * 2048 + (index & 2047)] + 2048 * (t.edge[m * 12 + (line % 12)] + 12 * t.edge[m * 12 + ((line / 12) | 0)])
  );
};

const blockStep = (t: Tables, index: number, m: number): number => {
  const { edge, corner } = t;
  const c = index % 576;
  const e = (index / 576) | 0;
  const oe = m * 12;
  const oc = m * 24;
  return (
    corner[oc + (c % 24)] +
    24 * corner[oc + ((c / 24) | 0)] +
    576 * (edge[oe + (e % 12)] + 12 * edge[oe + (((e / 12) | 0) % 12)] + 144 * edge[oe + ((e / 144) | 0)])
  );
};

type Step = (t: Tables, index: number, m: number) => number;

/** 목표에서 거꾸로 너비 우선 탐색을 해 거리표를 채운다. 쓰는 동작은 앞에서부터 count개 */
function fillDistances(t: Tables, dist: Uint8Array, solved: number, count: number, step: Step, states: number): void {
  dist.fill(UNSEEN);
  const queue = new Int32Array(states);
  dist[solved] = 0;
  queue[0] = solved;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    const d = dist[index] + 1;
    for (let m = 0; m < count; m++) {
      const next = step(t, index, m);
      if (dist[next] === UNSEEN) {
        dist[next] = d;
        queue[tail++] = next;
      }
    }
  }
}

function buildTables(): Tables {
  const edge = new Uint8Array(MOVES.length * 12);
  const corner = new Uint8Array(MOVES.length * 24);
  const flip = new Uint16Array(MOVES.length * 2048);
  const cornerCoord = new Map(CORNER_CELLS.map((cell, c) => [cell, c]));

  MOVES.forEach((move, m) => {
    const after = applyMove(LABELS, move);
    CORNER_CELLS.forEach((cell, c) => {
      corner[m * 24 + cornerCoord.get(after[cell])!] = c;
    });
    // 자리 p의 엣지가 가는 자리와, 그때 기준 칸에서 벗어나는지
    const flips = new Array<number>(12);
    for (let q = 0; q < 12; q++) {
      const from = after[EDGE_MAIN[q]];
      const kept = EDGE_MAIN.indexOf(from);
      const p = kept >= 0 ? kept : EDGE_SIDE.indexOf(from);
      edge[m * 12 + p] = q;
      flips[p] = kept >= 0 ? 0 : 1;
    }
    for (let bits = 0; bits < 2048; bits++) {
      const full = bits | (oddBits(bits) << 11);
      let next = 0;
      for (let p = 0; p < 12; p++) next |= (((full >> p) & 1) ^ flips[p]) << edge[m * 12 + p];
      flip[m * 2048 + bits] = next & 2047;
    }
  });

  const t: Tables = {
    edge,
    corner,
    flip,
    eoline: new Uint8Array(EOLINE_SIZE),
    left: new Uint8Array(BLOCK_SIZE),
    right: new Uint8Array(BLOCK_SIZE),
  };
  fillDistances(t, t.eoline, EOLINE_SOLVED, EOLINE_COUNT, eolineStep, 2048 * 12 * 11);
  // 라인이 놓인 뒤라 엣지 자리는 10곳, 왼쪽 블록까지 끝나면 7곳뿐이다.
  fillDistances(t, t.left, LEFT_BLOCK.solved, LEFT_COUNT, blockStep, 10 * 9 * 8 * 24 * 21);
  fillDistances(t, t.right, RIGHT_BLOCK.solved, RIGHT_COUNT, blockStep, 7 * 6 * 5 * 18 * 15);
  return t;
}

/** 가장 짧은 길이 여럿일 때 견주어 볼 길의 수 */
const PATH_LIMIT = 400;

/**
 * 거리가 1씩 줄어드는 길(어느 길이든 최단) 가운데 score가 가장 낮은 것을 고른다.
 * score가 없으면 처음 찾은 길을 돌려준다. 같은 축의 두 면은 순서를 바꿔도 같으므로 한 가지 순서만 본다.
 */
function shortestPath(
  t: Tables,
  dist: Uint8Array,
  start: number,
  count: number,
  step: Step,
  score?: (path: readonly number[]) => number,
): Move[] {
  const length = dist[start];
  if (length === UNSEEN) fail();
  const path = new Array<number>(length);
  let best: number[] | null = null;
  let bestScore = Infinity;
  let budget = PATH_LIMIT;

  /** 더 볼 필요가 없으면 true */
  const visit = (index: number, depth: number, lastBase: number): boolean => {
    if (depth === length) {
      const value = score ? score(path) : 0;
      if (!best || value < bestScore) {
        best = path.slice();
        bestScore = value;
      }
      return !score || --budget <= 0;
    }
    const want = length - depth - 1;
    for (let m = 0; m < count; m++) {
      const base = (m / 3) | 0;
      if (lastBase >= 0 && base < lastBase && AXES[base] === AXES[lastBase]) continue;
      const next = step(t, index, m);
      if (dist[next] !== want) continue;
      path[depth] = m;
      if (visit(next, depth + 1, base)) return true;
    }
    return false;
  };
  visit(start, 0, -1);
  return ((best as number[] | null) ?? fail()).map((m) => MOVES[m]);
}

/** 길을 따라간 뒤 블록 조각들이 있을 곳에서, 그 블록까지 남은 회전 수 */
const blockAfter = (t: Tables, dist: Uint8Array, from: number) => (path: readonly number[]) => {
  let index = from;
  for (const m of path) index = blockStep(t, index, m);
  return dist[index];
};

// ───────── 윗층 공식 ─────────

interface Prepared {
  readonly algCase: AlgCase;
  /** 큐브를 돌려 잡는 동작(x, y, z)을 풀어 쓴 공식 */
  readonly alg: Move[];
  readonly rewritten: boolean;
}

/** 돌려 잡는 동작 없이 쓸 수 있는 모든 동작 */
const TURNS: readonly Move[] = movesOf(
  (Object.keys(BASE_MOVES) as BaseMove[]).filter((base) => !isRotation({ base, amount: 1 })),
);

const sameCells = (a: CubeState, b: CubeState) => a.every((v, i) => v === b[i]);

/**
 * 공식 안의 x, y, z를 없앤다. 회전 뒤의 동작은 "회전 → 동작 → 회전 되돌리기"와 같은 한 동작으로 바꾼다.
 * (공식 모음의 공식은 돌려 잡은 채로 끝나지 않으므로 결과는 원래 공식과 같다.)
 */
function withoutRotations(alg: readonly Move[]): Move[] {
  const out: Move[] = [];
  const frame: Move[] = [];
  for (const move of alg) {
    if (isRotation(move)) {
      frame.push(move);
      continue;
    }
    if (frame.length === 0) {
      out.push(move);
      continue;
    }
    const target = applyMoves(LABELS, [...frame, move, ...invertAlg(frame)]);
    out.push(TURNS.find((turn) => sameCells(applyMove(LABELS, turn), target)) ?? fail());
  }
  return out;
}

function prepare(cases: readonly AlgCase[]): Prepared[] {
  return cases.map((algCase) => {
    const original = parseAlg(algCase.alg);
    const alg = withoutRotations(original);
    return { algCase, alg, rewritten: alg.length !== original.length };
  });
}

let ollAlgs: readonly Prepared[] | null = null;
let pllAlgs: readonly Prepared[] | null = null;

const topYellow = (s: CubeState) => {
  for (let i = 0; i < 9; i++) if (s[i] !== s[4]) return false;
  return true;
};

/** U를 몇 번 돌리면 조건이 맞는지 (0~3). 없으면 -1 */
function findU(s: CubeState, test: (s: CubeState) => boolean): number {
  for (let k = 0; k < 4; k++) if (test(applyMoves(s, turns('U', k)))) return k;
  return -1;
}

interface Found {
  readonly found: Prepared;
  /** 공식 앞에 돌리는 U */
  readonly pre: Move[];
}

/**
 * cases 중에서, U를 맞춘 뒤 공식을 하면 조건이 되는 것을 찾는다.
 * 여럿이면 회전 수가 가장 적은 것, 그것도 같으면 공식 뒤에 U가 남지 않는 것을 고른다.
 */
function findCase(
  state: CubeState,
  cases: readonly Prepared[],
  /** 조건이 되면 그 뒤에 더 돌려야 하는 U, 아니면 null */
  done: (s: CubeState) => Move[] | null,
): Found | null {
  let best: Found | null = null;
  let bestCost = Infinity;
  for (let k = 0; k < 4; k++) {
    const pre = turns('U', k);
    const s = applyMoves(state, pre);
    for (const found of cases) {
      const length = pre.length + found.alg.length;
      if (length >= bestCost) continue;
      const post = done(applyMoves(s, found.alg));
      if (!post) continue;
      const cost = length + post.length * 1.5;
      if (cost >= bestCost) continue;
      best = { found, pre };
      bestCost = cost;
    }
  }
  return best;
}

// ───────── 풀이 ─────────

class Builder {
  state: CubeState;
  readonly stages: SolveStage<ZzStageId>[] = [];
  private steps: SolveStep[] = [];

  constructor(state: CubeState) {
    this.state = state;
  }

  begin(id: ZzStageId): void {
    this.steps = [];
    this.stages.push({ id, title: ZZ_STAGE_TITLES[id], steps: this.steps });
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
        // 나머지 센터도 제자리여야 엣지 방향을 센터 색으로 따질 수 있다.
        for (let f = 0; f < 6; f++) if (s[f * 9 + 4] !== YELLOW_UP[f * 9 + 4]) fail();
        b.do('노란색 센터가 위, 초록색 센터가 앞에 오도록 큐브를 잡아요.', moves);
        return;
      }
    }
  }
  fail();
}

const EO_MEANING = 'F·B를 90° 돌리지 않고도 제자리에 맞출 수 있는 방향';

function eoLine(b: Builder, t: Tables): void {
  b.begin('eoline');
  const { bad, at } = readEdges(b.state);
  // 나쁜 엣지는 늘 짝수 개다.
  if (oddBits(bad)) fail();
  const start = (bad & 2047) + 2048 * (at[DF] + 12 * at[DB]);
  if (t.eoline[start] === 0) return;

  const left = blockStart(b.state, LEFT_BLOCK, at);
  const moves = shortestPath(t, t.eoline, start, EOLINE_COUNT, eolineStep, blockAfter(t, t.left, left));
  const line = '흰색-초록, 흰색-파랑 엣지를 아래층 앞뒤 제자리에 놓아요';
  const note =
    bad === 0
      ? `엣지 방향(EO: ${EO_MEANING})은 이미 다 맞아 있어요. ${line} (${moves.length}수).`
      : at[DF] === DF && at[DB] === DB
        ? `라인(아래층 앞뒤 엣지)은 그대로 두고, 엣지 12개의 방향(EO: ${EO_MEANING})을 모두 맞춰요 (${moves.length}수).`
        : `엣지 12개의 방향(EO: ${EO_MEANING})을 모두 맞추면서 ${line} (${moves.length}수).`;
  b.do(note, moves);
}

function leftBlock(b: Builder, t: Tables): void {
  b.begin('left');
  const { at } = readEdges(b.state);
  const start = blockStart(b.state, LEFT_BLOCK, at);
  if (t.left[start] === 0) return;
  const right = blockStart(b.state, RIGHT_BLOCK, at);
  const moves = shortestPath(t, t.left, start, LEFT_COUNT, blockStep, blockAfter(t, t.right, right));
  b.do(
    `R·U·L만 돌려 왼쪽 아래 두 층에 빨간색 1×2×3 블록(엣지 3개와 코너 2개)을 만들어요 (${moves.length}수).`,
    moves,
  );
}

function rightBlock(b: Builder, t: Tables): void {
  b.begin('right');
  const { at } = readEdges(b.state);
  const start = blockStart(b.state, RIGHT_BLOCK, at);
  if (t.right[start] === 0) return;
  const moves = shortestPath(t, t.right, start, RIGHT_COUNT, blockStep);
  b.do(
    `왼쪽 블록은 그대로 두고, R·U만 돌려 오른쪽 아래 두 층에 주황색 1×2×3 블록을 만들어요 (${moves.length}수).`,
    moves,
  );
}

function oll(b: Builder): void {
  b.begin('oll');
  if (topYellow(b.state)) return;
  ollAlgs ??= prepare(OLL_CASES.filter((c) => TWO_LOOK_OLL_CORNERS.includes(c.id)));
  const match = findCase(b.state, ollAlgs, (s) => (topYellow(s) ? [] : null));
  if (!match) fail();
  b.do(
    `윗층 엣지는 이미 노란색이 위를 보고 있어요. ${match.found.algCase.name} 공식으로 코너의 노란색만 위로 올려요.`,
    [...match.pre, ...match.found.alg],
  );
}

function pll(b: Builder): void {
  b.begin('pll');
  const lastTurn = (s: CubeState) => {
    const k = findU(s, isSolved);
    return k < 0 ? null : turns('U', k);
  };

  if (!lastTurn(b.state)) {
    pllAlgs ??= prepare(PLL_CASES);
    const match = findCase(b.state, pllAlgs, lastTurn);
    if (!match) fail();
    const { algCase, alg, rewritten } = match.found;
    b.do(
      rewritten
        ? `${algCase.name} 공식으로 윗층의 자리를 한 번에 맞춰요. 큐브를 돌려 잡지 않도록 공식의 x 회전은 풀어서 적었어요.`
        : `${algCase.name} 공식으로 윗층의 자리를 한 번에 맞춰요.`,
      [...match.pre, ...alg],
    );
  }

  const last = lastTurn(b.state);
  if (!last) fail();
  b.do('U를 돌려 마무리해요.', last);
}

/**
 * ZZ 방식으로 푼다. 단계는 항상 ZZ_STAGE_ORDER 순서로 모두 들어 있고,
 * 이미 끝난 단계는 steps가 비어 있다. 풀 수 없는 상태면 오류를 던진다.
 */
export function solveZz(state: CubeState): SolveStage<ZzStageId>[] {
  const b = new Builder(state);
  orient(b);
  const t = (tables ??= buildTables());
  eoLine(b, t);
  leftBlock(b, t);
  rightBlock(b, t);
  oll(b);
  pll(b);
  if (!isSolved(b.state)) fail();
  return b.stages;
}
