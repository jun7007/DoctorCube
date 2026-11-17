/**
 * Kociemba 2단계 풀이기 (거의 최단, 보통 20~22회전).
 *
 * 1단계: 아무 상태 → G1 = ⟨U, D, R2, L2, F2, B2⟩ (코너 방향 · 엣지 방향 · 중간층 엣지 자리)
 * 2단계: G1 → 완성 (코너 순서 · 위아래 엣지 순서 · 중간층 엣지 순서)
 *
 * 이동 표와 가지치기 표는 처음 쓸 때 한 번 만든다 (약 6MB, 0.3초쯤).
 * 탐색은 1단계 길이를 하나씩 늘려 가며, 찾은 것보다 짧은 풀이만 계속 찾는다.
 * 조각 ↔ 칸 대응과 회전 표는 외워 적지 않고 큐브 엔진에서 계산한다.
 * DOM이나 Node API를 쓰지 않는 순수 모듈이라 Web Worker 안에서도 돈다.
 */
import { FACES, SOLVED, applyMove, applyMoves, type CubeState, type Face, type Move } from '../core/cube';
import { invertAlg, parseAlg } from '../core/notation';
import { facelet } from '../core/pieces';

/** 조각 단위 상태. cp[i] = i번 자리에 있는 코너, co[i] = 그 코너가 돌아간 정도 (엣지도 같다) */
export interface Cubies {
  readonly cp: readonly number[];
  readonly co: readonly number[];
  readonly ep: readonly number[];
  readonly eo: readonly number[];
}

export type Validation = { ok: true } | { ok: false; reason: string };

export interface KociembaOptions {
  /** 이 길이 이하의 풀이를 찾으면 (잠깐 더 찾아본 뒤) 끝낸다 (기본 22) */
  maxLength?: number;
  /** 더 짧은 풀이를 찾는 데 쓸 시간 (기본 300ms). 지나면 그때까지 찾은 가장 짧은 풀이를 돌려준다. 하나도 없으면 찾을 때까지 계속한다. */
  timeLimitMs?: number;
}

export const REASON = {
  count: '색의 개수가 맞지 않아요',
  center: '가운데 조각의 배치가 올바르지 않아요',
  missing: '존재하지 않는 조각이 있어요',
  duplicate: '같은 조각이 두 개 있어요',
  flip: '엣지 하나가 뒤집혀 있어요',
  twist: '코너 하나가 돌아가 있어요',
  swap: '두 조각의 자리가 서로 바뀌어 있어요',
} as const;

// ───────────────────────── 조각 ↔ 칸 ─────────────────────────

// 자리 번호는 Kociemba의 순서. 이름의 첫 글자가 방향의 기준 면이고, 코너는 시계 방향으로 읽는다.
const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

const faceletsOf = (name: string) => [...name].map((ch) => facelet(name, ch as Face));
const colorsOf = (name: string) => [...name].map((ch) => FACES.indexOf(ch as Face));

const CORNER_FACELETS = CORNER_NAMES.map(faceletsOf);
const CORNER_COLORS = CORNER_NAMES.map(colorsOf);
const EDGE_FACELETS = EDGE_NAMES.map(faceletsOf);
const EDGE_COLORS = EDGE_NAMES.map(colorsOf);

/** 색 조합 → 조각 번호 (방향까지 맞는 것만) */
const CORNER_BY_COLORS = new Map(CORNER_COLORS.map((c, j) => [c.join(), j]));
const EDGE_BY_COLORS = new Map(EDGE_COLORS.map((c, j) => [c.join(), j]));

/** 센터가 제자리인 상태를 조각 단위로 읽는다. 없는 조각이 있으면 null */
function readCubies(state: CubeState): Cubies | null {
  const cp: number[] = [];
  const co: number[] = [];
  const ep: number[] = [];
  const eo: number[] = [];
  for (const f of CORNER_FACELETS) {
    // 흰색(0)이나 노란색(3)이 붙은 칸이 방향의 기준
    let ori = f.findIndex((i) => state[i] % 3 === 0);
    if (ori < 0) ori = 0;
    const colors = [0, 1, 2].map((k) => state[f[(ori + k) % 3]]);
    const j = CORNER_BY_COLORS.get(colors.join());
    if (j === undefined) return null;
    cp.push(j);
    co.push(ori);
  }
  for (const f of EDGE_FACELETS) {
    const a = state[f[0]];
    const b = state[f[1]];
    let j = EDGE_BY_COLORS.get(`${a},${b}`);
    let ori = 0;
    if (j === undefined) {
      j = EDGE_BY_COLORS.get(`${b},${a}`);
      ori = 1;
    }
    if (j === undefined) return null;
    ep.push(j);
    eo.push(ori);
  }
  return { cp, co, ep, eo };
}

/** 조각 단위 상태 → 54칸 상태 (센터는 제자리) */
export function cubiesToState(c: Cubies): CubeState {
  const state = [...SOLVED];
  CORNER_FACELETS.forEach((f, i) => {
    for (let k = 0; k < 3; k++) state[f[(k + c.co[i]) % 3]] = CORNER_COLORS[c.cp[i]][k];
  });
  EDGE_FACELETS.forEach((f, i) => {
    for (let k = 0; k < 2; k++) state[f[(k + c.eo[i]) % 2]] = EDGE_COLORS[c.ep[i]][k];
  });
  return state;
}

/** a 상태에서 b를 이어서 한 상태 */
function multiply(a: Cubies, b: Cubies): Cubies {
  return {
    cp: b.cp.map((from) => a.cp[from]),
    co: b.cp.map((from, i) => (a.co[from] + b.co[i]) % 3),
    ep: b.ep.map((from) => a.ep[from]),
    eo: b.ep.map((from, i) => a.eo[from] ^ b.eo[i]),
  };
}

// ───────────────────────── 큐브 방향 맞추기 ─────────────────────────

interface Rotation {
  readonly moves: readonly Move[];
  /** 돌려 놓은 뒤의 g면은 원래 큐브의 faceMap[g]면이다 */
  readonly faceMap: readonly number[];
}

const CENTERS = [4, 13, 22, 31, 40, 49];

/** 큐브를 통째로 돌리는 24가지 방법 */
const ROTATIONS: readonly Rotation[] = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((tilt) =>
  ['', 'y', 'y2', "y'"].map((spin) => {
    const moves = parseAlg(`${tilt} ${spin}`);
    const turned = applyMoves(SOLVED, moves);
    return { moves, faceMap: CENTERS.map((i) => turned[i]) };
  }),
);

/** 센터가 모두 제자리(c번 색이 c번 면)에 오도록 큐브를 통째로 돌린다. 그런 방법이 없으면 null */
function normalize(state: CubeState): { state: CubeState; rotation: Rotation } | null {
  for (const rotation of ROTATIONS) {
    // 돌린 뒤 g면에 오는 센터는 지금 faceMap[g]면의 센터
    if (!rotation.faceMap.every((from, g) => state[CENTERS[from]] === g)) continue;
    return { state: applyMoves(state, rotation.moves), rotation };
  }
  return null;
}

// ───────────────────────── 검사 ─────────────────────────

function parity(perm: readonly number[]): number {
  let p = 0;
  for (let i = 0; i < perm.length; i++) for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) p ^= 1;
  return p;
}

type Analysis = { ok: true; cubies: Cubies; rotation: Rotation } | { ok: false; reason: string };

function analyze(state: CubeState): Analysis {
  const fail = (reason: string): Analysis => ({ ok: false, reason });
  if (state.length !== 54) return fail(REASON.count);
  const counts = [0, 0, 0, 0, 0, 0];
  for (const c of state) {
    if (!Number.isInteger(c) || c < 0 || c > 5) return fail(REASON.count);
    counts[c]++;
  }
  if (counts.some((n) => n !== 9)) return fail(REASON.count);

  const normal = normalize(state);
  if (!normal) return fail(REASON.center);
  const cubies = readCubies(normal.state);
  if (!cubies) return fail(REASON.missing);
  if (new Set(cubies.cp).size !== 8 || new Set(cubies.ep).size !== 12) return fail(REASON.duplicate);
  if (cubies.eo.reduce((a, b) => a + b, 0) % 2 !== 0) return fail(REASON.flip);
  if (cubies.co.reduce((a, b) => a + b, 0) % 3 !== 0) return fail(REASON.twist);
  if (parity(cubies.cp) !== parity(cubies.ep)) return fail(REASON.swap);
  return { ok: true, cubies, rotation: normal.rotation };
}

/** 실제 큐브로 만들 수 있는(풀 수 있는) 상태인지. 안 되면 이유를 알려 준다. */
export function validateState(state: CubeState): Validation {
  const result = analyze(state);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/** 54칸 상태를 조각 단위로 읽는다 (큐브를 통째로 돌려 센터를 제자리에 둔 기준). 잘못된 상태면 오류 */
export function stateToCubies(state: CubeState): Cubies {
  const result = analyze(state);
  if (!result.ok) throw new Error(result.reason);
  return result.cubies;
}

// ───────────────────────── 좌표 ─────────────────────────

const N_TWIST = 2187; // 3^7
const N_FLIP = 2048; // 2^11
const N_SLICE = 495; // 12C4
const N_PERM = 40320; // 8!
const N_SLICE_PERM = 24; // 4!
const N_MOVES = 18;

/** 2단계에서 쓰는 동작: U U2 U' D D2 D' R2 F2 L2 B2 (동작 번호 = 면 × 3 + 횟수 − 1) */
const PHASE2_MOVES = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16];
const N_MOVES2 = PHASE2_MOVES.length;
const AMOUNTS = [1, 2, -1] as const;

function twistOf(co: readonly number[]): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t = t * 3 + co[i];
  return t;
}

function flipOf(eo: readonly number[]): number {
  let f = 0;
  for (let i = 0; i < 11; i++) f = f * 2 + eo[i];
  return f;
}

const CHOOSE: number[][] = [];
for (let n = 0; n < 12; n++) {
  CHOOSE.push([1]);
  for (let k = 1; k <= 4; k++) CHOOSE[n].push(n === 0 ? 0 : CHOOSE[n - 1][k - 1] + (CHOOSE[n - 1][k] ?? 0));
}

/** 중간층 엣지 4개가 차지한 자리(비트 12개)의 번호. 모두 중간층에 있으면 0 */
function sliceOfMask(mask: number): number {
  let a = 0;
  let x = 0;
  for (let j = 11; j >= 0; j--) if ((mask >> j) & 1) a += CHOOSE[11 - j][++x];
  return a;
}

function sliceOf(ep: readonly number[]): number {
  let mask = 0;
  for (let i = 0; i < 12; i++) if (ep[i] >= 8) mask |= 1 << i;
  return sliceOfMask(mask);
}

/** 순열의 번호 (사전 순). a[off..off+n)의 크기 순서만 본다. */
function permIndex(a: ArrayLike<number>, off: number, n: number): number {
  let index = 0;
  for (let i = 0; i < n; i++) {
    const v = a[off + i];
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (a[off + j] < v) smaller++;
    index = index * (n - i) + smaller;
  }
  return index;
}

function permOfIndex(index: number, n: number): number[] {
  const digits = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    digits[i] = index % (n - i);
    index = Math.floor(index / (n - i));
  }
  const rest = Array.from({ length: n }, (_, i) => i);
  return digits.map((d) => rest.splice(d, 1)[0]);
}

// ───────────────────────── 표 ─────────────────────────

// 동작 18개의 조각 이동 (m × 8 + i, m × 12 + i)
let moveCp = new Uint8Array(0);
let moveCo = new Uint8Array(0);
let moveEp = new Uint8Array(0);
let moveEo = new Uint8Array(0);

let twistMove = new Uint16Array(0);
let flipMove = new Uint16Array(0);
let sliceMove = new Uint16Array(0);
let cornerMove = new Uint16Array(0);
let udEdgeMove = new Uint16Array(0);
let slicePermMove = new Uint8Array(0);

let twistSlicePrune = new Uint8Array(0);
let flipSlicePrune = new Uint8Array(0);
let cornerPrune = new Uint8Array(0);
let udEdgePrune = new Uint8Array(0);

let ready = false;

function buildMoveCubies(): void {
  moveCp = new Uint8Array(N_MOVES * 8);
  moveCo = new Uint8Array(N_MOVES * 8);
  moveEp = new Uint8Array(N_MOVES * 12);
  moveEo = new Uint8Array(N_MOVES * 12);
  FACES.forEach((base, face) => {
    const quarter = readCubies(applyMove(SOLVED, { base, amount: 1 }));
    if (!quarter) throw new Error(`회전 표 계산 실패: ${base}`);
    let cur = quarter;
    for (let power = 0; power < 3; power++) {
      const m = face * 3 + power;
      moveCp.set(cur.cp, m * 8);
      moveCo.set(cur.co, m * 8);
      moveEp.set(cur.ep, m * 12);
      moveEo.set(cur.eo, m * 12);
      cur = multiply(cur, quarter);
    }
  });
}

function buildMoveTables(): void {
  twistMove = new Uint16Array(N_TWIST * N_MOVES);
  const co = new Array<number>(8);
  const co2 = new Array<number>(8);
  for (let t = 0; t < N_TWIST; t++) {
    let rest = t;
    let sum = 0;
    for (let i = 6; i >= 0; i--) {
      co[i] = rest % 3;
      sum += co[i];
      rest = Math.floor(rest / 3);
    }
    co[7] = (3 - (sum % 3)) % 3;
    for (let m = 0; m < N_MOVES; m++) {
      for (let i = 0; i < 8; i++) co2[i] = (co[moveCp[m * 8 + i]] + moveCo[m * 8 + i]) % 3;
      twistMove[t * N_MOVES + m] = twistOf(co2);
    }
  }

  flipMove = new Uint16Array(N_FLIP * N_MOVES);
  const eo = new Array<number>(12);
  const eo2 = new Array<number>(12);
  for (let f = 0; f < N_FLIP; f++) {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      eo[i] = (f >> (10 - i)) & 1;
      sum ^= eo[i];
    }
    eo[11] = sum;
    for (let m = 0; m < N_MOVES; m++) {
      for (let i = 0; i < 12; i++) eo2[i] = eo[moveEp[m * 12 + i]] ^ moveEo[m * 12 + i];
      flipMove[f * N_MOVES + m] = flipOf(eo2);
    }
  }

  sliceMove = new Uint16Array(N_SLICE * N_MOVES);
  for (let mask = 0; mask < 4096; mask++) {
    let bits = 0;
    for (let i = 0; i < 12; i++) bits += (mask >> i) & 1;
    if (bits !== 4) continue;
    const s = sliceOfMask(mask);
    for (let m = 0; m < N_MOVES; m++) {
      let next = 0;
      for (let i = 0; i < 12; i++) if ((mask >> moveEp[m * 12 + i]) & 1) next |= 1 << i;
      sliceMove[s * N_MOVES + m] = sliceOfMask(next);
    }
  }

  cornerMove = new Uint16Array(N_PERM * N_MOVES2);
  udEdgeMove = new Uint16Array(N_PERM * N_MOVES2);
  const next = new Array<number>(8);
  for (let p = 0; p < N_PERM; p++) {
    const perm = permOfIndex(p, 8);
    for (let k = 0; k < N_MOVES2; k++) {
      const m = PHASE2_MOVES[k];
      for (let i = 0; i < 8; i++) next[i] = perm[moveCp[m * 8 + i]];
      cornerMove[p * N_MOVES2 + k] = permIndex(next, 0, 8);
      // G1 안의 동작은 위아래 엣지를 위아래 층 안에서만 옮긴다.
      for (let i = 0; i < 8; i++) next[i] = perm[moveEp[m * 12 + i]];
      udEdgeMove[p * N_MOVES2 + k] = permIndex(next, 0, 8);
    }
  }

  slicePermMove = new Uint8Array(N_SLICE_PERM * N_MOVES2);
  for (let p = 0; p < N_SLICE_PERM; p++) {
    const perm = permOfIndex(p, 4);
    for (let k = 0; k < N_MOVES2; k++) {
      const m = PHASE2_MOVES[k];
      for (let i = 0; i < 4; i++) next[i] = perm[moveEp[m * 12 + 8 + i] - 8];
      slicePermMove[p * N_MOVES2 + k] = permIndex(next, 0, 4);
    }
  }
}

/**
 * 두 좌표를 묶은 상태(a × sizeB + b)에서 완성(0, 0)까지 필요한 최소 회전 수.
 * 완성에서부터 한 겹씩 넓혀 가고, 절반쯤 채운 뒤에는 빈칸 쪽에서 거꾸로 찾는다.
 */
function buildPrune(
  sizeA: number,
  sizeB: number,
  moveA: ArrayLike<number>,
  moveB: ArrayLike<number>,
  nMoves: number,
): Uint8Array<ArrayBuffer> {
  const total = sizeA * sizeB;
  const table = new Uint8Array(total);
  table.fill(255);
  table[0] = 0;
  let filled = 1;
  for (let depth = 0; filled < total; depth++) {
    const before = filled;
    const backward = filled > total / 2;
    for (let index = 0; index < total; index++) {
      if (table[index] !== (backward ? 255 : depth)) continue;
      const a = Math.floor(index / sizeB);
      const b = index - a * sizeB;
      for (let m = 0; m < nMoves; m++) {
        const to = moveA[a * nMoves + m] * sizeB + moveB[b * nMoves + m];
        if (backward) {
          if (table[to] === depth) {
            table[index] = depth + 1;
            filled++;
            break;
          }
        } else if (table[to] === 255) {
          table[to] = depth + 1;
          filled++;
        }
      }
    }
    if (filled === before) throw new Error('가지치기 표 계산 실패');
  }
  return table;
}

/** 이동 표와 가지치기 표를 만든다. 한 번만 만들고, 풀이기를 처음 쓸 때 자동으로 불린다. */
export function initKociemba(): void {
  if (ready) return;
  buildMoveCubies();
  buildMoveTables();
  twistSlicePrune = buildPrune(N_SLICE, N_TWIST, sliceMove, twistMove, N_MOVES);
  flipSlicePrune = buildPrune(N_SLICE, N_FLIP, sliceMove, flipMove, N_MOVES);
  cornerPrune = buildPrune(N_PERM, N_SLICE_PERM, cornerMove, slicePermMove, N_MOVES2);
  udEdgePrune = buildPrune(N_PERM, N_SLICE_PERM, udEdgeMove, slicePermMove, N_MOVES2);
  ready = true;
}

// ───────────────────────── 탐색 ─────────────────────────

/** 처음에는 이 길이 이하의 풀이만 찾는다 (2단계를 깊이 뒤지느라 시간을 버리지 않게) */
const FIRST_BOUND = 22;
/**
 * 충분히 짧은 풀이(maxLength 이하)를 찾은 뒤에도 조금 더 찾아본다.
 * - 탐색 노드 수가 EXTRA_NODES에 이를 때까지. 무작위 상태라면 1단계 11회전까지를 거의 다 훑는 양이다 (수십 ms).
 * - 1단계 SURE_DEPTH회전까지는 반드시 끝까지. 그래서 시간 안에 나온 9회전 이하의 풀이는 최단이다.
 * 그 전에 더 짧은 풀이가 없다고 확인되면(탐색이 끝나면) 거기서 멈춘다.
 */
const EXTRA_NODES = 150_000;
const SURE_DEPTH = 8;
/** 시간이 다 되도록 풀이가 없으면 여기까지 허용한다 */
const LATE_BOUND = 24;
const MAX_BOUND = 30;

/** 센터가 제자리인 상태의 풀이를 동작 번호(면 × 3 + 횟수 − 1) 목록으로 돌려준다. */
function search(start: Cubies, maxLength: number, timeLimitMs: number): number[] {
  initKociemba();
  const deadline = Date.now() + timeLimitMs;

  const moves = new Uint8Array(MAX_BOUND + 2);
  // 1단계 동작을 k개 한 뒤의 조각 순서 (k × 8, k × 12). valid번째까지만 맞는 값이다.
  const cpStack = new Uint8Array((MAX_BOUND + 2) * 8);
  const epStack = new Uint8Array((MAX_BOUND + 2) * 12);
  cpStack.set(start.cp);
  epStack.set(start.ep);
  let valid = 0;

  let best = null as number[] | null;
  /** 찾으려는 풀이 길이의 상한 (찾을 때마다 줄인다) */
  let bound = Math.min(MAX_BOUND, Math.max(maxLength, FIRST_BOUND));
  let expired = false;
  let stop = false;
  let nodes = 0;
  /** 지금 훑고 있는 1단계 길이 */
  let depth1 = 0;

  /** 충분히 찾아봤는지 */
  const enough = (): boolean =>
    best !== null && best.length <= maxLength && nodes >= EXTRA_NODES && depth1 > SURE_DEPTH;

  /** 가끔 불러서 탐색을 멈춰야 하는지 확인한다. 멈춰야 하면 true */
  const checkStop = (): boolean => {
    if (best) return (stop = enough() || Date.now() >= deadline);
    if (!expired && Date.now() >= deadline) {
      expired = true;
      bound = Math.max(bound, LATE_BOUND);
    }
    return false;
  };

  /** 2단계: 남은 rem번 안에 완성되는지. 찾으면 moves에 적고 true (중단할 때도 true) */
  const phase2 = (corner: number, udEdge: number, slicePerm: number, rem: number, lastFace: number, depth: number): boolean => {
    for (let k = 0; k < N_MOVES2; k++) {
      const m = PHASE2_MOVES[k];
      const face = (m / 3) | 0;
      // 같은 면을 연달아 돌리지 않고, 마주 보는 두 면은 한 가지 순서로만 돌린다.
      if (face === lastFace || face + 3 === lastFace) continue;
      const s = slicePermMove[slicePerm * N_MOVES2 + k];
      const c = cornerMove[corner * N_MOVES2 + k];
      if (cornerPrune[c * N_SLICE_PERM + s] >= rem) continue;
      const e = udEdgeMove[udEdge * N_MOVES2 + k];
      if (udEdgePrune[e * N_SLICE_PERM + s] >= rem) continue;
      moves[depth] = m;
      // 두 값이 모두 0이면 완성
      if (rem === 1) return true;
      if (phase2(c, e, s, rem - 1, face, depth + 1)) return true;
      if ((++nodes & 4095) === 0 && checkStop()) return true;
    }
    return false;
  };

  /** 1단계 풀이(moves의 앞 d개)에 이어 2단계를 찾는다. 탐색을 끝내야 하면 true */
  const tryPhase2 = (d: number, lastFace: number): boolean => {
    // 1단계만으로 이미 상한을 넘으면 더 짧은 풀이는 나올 수 없다.
    if (d > bound) return (stop = true);
    for (let k = valid + 1; k <= d; k++) {
      const m = moves[k - 1];
      for (let i = 0; i < 8; i++) cpStack[k * 8 + i] = cpStack[(k - 1) * 8 + moveCp[m * 8 + i]];
      for (let i = 0; i < 12; i++) epStack[k * 12 + i] = epStack[(k - 1) * 12 + moveEp[m * 12 + i]];
    }
    valid = d;
    const corner = permIndex(cpStack, d * 8, 8);
    const slicePerm = permIndex(epStack, d * 12 + 8, 4);
    if (cornerPrune[corner * N_SLICE_PERM + slicePerm] > bound - d) return false;
    const udEdge = permIndex(epStack, d * 12, 8);
    const need = Math.max(cornerPrune[corner * N_SLICE_PERM + slicePerm], udEdgePrune[udEdge * N_SLICE_PERM + slicePerm]);
    // 짧은 것부터 찾으므로, 이 1단계 풀이에 이어지는 가장 짧은 2단계가 나온다.
    for (let n = need; n <= bound - d; n++) {
      if (n > 0 && !phase2(corner, udEdge, slicePerm, n, lastFace, d)) continue;
      if (stop) return true;
      best = Array.from(moves.subarray(0, d + n));
      bound = d + n - 1;
      if (expired || enough()) stop = true;
      return stop;
    }
    return stop;
  };

  /** 1단계: 정확히 rem번 만에 G1에 들어가는 길을 모두 훑는다. 탐색을 끝내야 하면 true */
  const phase1 = (twist: number, flip: number, slice: number, rem: number, lastFace: number, depth: number): boolean => {
    const left = rem - 1;
    for (let m = 0; m < N_MOVES; m++) {
      const face = (m / 3) | 0;
      if (face === lastFace || face + 3 === lastFace) continue;
      const s = sliceMove[slice * N_MOVES + m];
      const t = twistMove[twist * N_MOVES + m];
      const ht = twistSlicePrune[s * N_TWIST + t];
      if (ht > left) continue;
      const f = flipMove[flip * N_MOVES + m];
      const hf = flipSlicePrune[s * N_FLIP + f];
      if (hf > left) continue;
      if (left === 0) {
        // 마지막 동작이 G1 안의 동작이면 더 짧은 1단계에서 이미 본 길이다.
        if (face % 3 === 0 || m % 3 === 1) continue;
        moves[depth] = m;
        if (valid > depth) valid = depth;
        if (tryPhase2(depth + 1, face)) return true;
      } else {
        // G1에서 나갔다가 다시 들어오려면 적어도 5번은 돌려야 한다.
        if (left < 5 && ht === 0 && hf === 0) continue;
        moves[depth] = m;
        if (valid > depth) valid = depth;
        if (phase1(t, f, s, left, face, depth + 1)) return true;
      }
      if ((++nodes & 4095) === 0 && checkStop()) return true;
    }
    return false;
  };

  const twist = twistOf(start.co);
  const flip = flipOf(start.eo);
  const slice = sliceOf(start.ep);
  const least = Math.max(twistSlicePrune[slice * N_TWIST + twist], flipSlicePrune[slice * N_FLIP + flip]);
  while (depth1 <= bound && !stop && !enough()) {
    if (depth1 === 0) {
      if (least === 0) tryPhase2(0, -1);
    } else if (least <= depth1 && (least > 0 || depth1 >= 5)) {
      phase1(twist, flip, slice, depth1, -1, 0);
    }
    depth1++;
  }
  if (!best) throw new Error('풀이를 찾지 못했어요');
  return best;
}

// ───────────────────────── 공개 함수 ─────────────────────────

/**
 * 거의 최단 풀이. 면 회전(U D L R F B)만 쓴다.
 * 큐브를 통째로 돌려 놓았거나 중간층을 돌린 상태도 받는다. 그때는 센터를 기준으로 풀고,
 * 결과는 받은 상태에 그대로 적용할 수 있게 면 이름을 바꿔 돌려준다.
 * 풀 수 없는 상태면 이유를 담은 오류를 던진다.
 */
export function solveKociemba(state: CubeState, options: KociembaOptions = {}): Move[] {
  const result = analyze(state);
  if (!result.ok) throw new Error(result.reason);
  const { faceMap } = result.rotation;
  return search(result.cubies, options.maxLength ?? 22, options.timeLimitMs ?? 300).map((m) => ({
    base: FACES[faceMap[(m / 3) | 0]],
    amount: AMOUNTS[m % 3],
  }));
}

/** 풀 수 있는 모든 상태 중 하나를 고르게 뽑는다 (센터는 제자리). */
export function randomState(random: () => number = Math.random): CubeState {
  const shuffled = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** 합이 mod의 배수가 되도록 마지막 하나는 나머지로 정한다. */
  const orientations = (n: number, mod: number) => {
    const a = Array.from({ length: n - 1 }, () => Math.floor(random() * mod));
    const sum = a.reduce((x, y) => x + y, 0);
    a.push((mod - (sum % mod)) % mod);
    return a;
  };
  const cp = shuffled(8);
  const ep = shuffled(12);
  // 코너와 엣지의 홀짝이 다르면 만들 수 없는 상태라, 엣지 둘을 맞바꿔 맞춘다.
  if (parity(cp) !== parity(ep)) [ep[0], ep[1]] = [ep[1], ep[0]];
  return cubiesToState({ cp, co: orientations(8, 3), ep, eo: orientations(12, 2) });
}

/** 완성 상태에서 시작해 무작위 상태를 만드는 스크램블 (WCA 방식) */
export function randomStateScramble(random: () => number = Math.random): Move[] {
  return invertAlg(solveKociemba(randomState(random)));
}
