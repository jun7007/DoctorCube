/**
 * 큐브 엔진 (화면과 무관한 순수 로직).
 *
 * 상태는 스티커 54칸의 색 번호 배열이다.
 * - 면 순서: U R F D L B (색 번호 0~5도 같은 순서)
 * - 각 면의 9칸은 그 면을 정면에서 볼 때 왼쪽 위 → 오른쪽 아래 순서
 * - 좌표계는 three.js와 같다: x 오른쪽, y 위, z 보는 사람 쪽
 *
 * 회전 표는 손으로 적지 않고 좌표 회전으로 계산한다. 렌더러도 같은 좌표를 쓴다.
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export type Vec3 = readonly [number, number, number];
export type Axis = 0 | 1 | 2;
export type CubeState = readonly number[];

export interface Facelet {
  /** 이 스티커가 붙은 조각의 격자 좌표 (-1, 0, 1) */
  readonly pos: Vec3;
  /** 스티커가 바라보는 방향 */
  readonly normal: Vec3;
}

function buildFacelets(): Facelet[] {
  const out: Facelet[] = [];
  const add = (make: (r: number, c: number) => Vec3, normal: Vec3) => {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push({ pos: make(r, c), normal });
  };
  add((r, c) => [c - 1, 1, r - 1], [0, 1, 0]); // U: 뒤쪽 줄부터
  add((r, c) => [1, 1 - r, 1 - c], [1, 0, 0]); // R: 앞쪽 열부터
  add((r, c) => [c - 1, 1 - r, 1], [0, 0, 1]); // F
  add((r, c) => [c - 1, -1, 1 - r], [0, -1, 0]); // D: 앞쪽 줄부터
  add((r, c) => [-1, 1 - r, c - 1], [-1, 0, 0]); // L: 뒤쪽 열부터
  add((r, c) => [1 - c, 1 - r, -1], [0, 0, -1]); // B: 오른쪽 열부터
  return out;
}

export const FACELETS: readonly Facelet[] = buildFacelets();

const faceletKey = (pos: Vec3, normal: Vec3) => `${pos.join(',')}|${normal.join(',')}`;
const FACELET_INDEX = new Map(FACELETS.map((f, i) => [faceletKey(f.pos, f.normal), i]));

/** 축의 양의 방향을 기준으로 90°씩 quarterTurns번 돌린다 (오른손 법칙). */
export function rotateVec(v: Vec3, axis: Axis, quarterTurns: number): Vec3 {
  let [x, y, z] = v;
  const k = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < k; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

export type BaseMove =
  | 'U' | 'D' | 'L' | 'R' | 'F' | 'B'
  | 'M' | 'E' | 'S'
  | 'x' | 'y' | 'z'
  | 'u' | 'd' | 'l' | 'r' | 'f' | 'b';

interface BaseDef {
  readonly axis: Axis;
  readonly layers: readonly number[];
  /** 기호 그대로(프라임 없이) 돌릴 때, 축의 양의 방향 기준 회전 부호 */
  readonly dir: 1 | -1;
}

const ALL = [-1, 0, 1] as const;

export const BASE_MOVES: Readonly<Record<BaseMove, BaseDef>> = {
  R: { axis: 0, layers: [1], dir: -1 },
  L: { axis: 0, layers: [-1], dir: 1 },
  U: { axis: 1, layers: [1], dir: -1 },
  D: { axis: 1, layers: [-1], dir: 1 },
  F: { axis: 2, layers: [1], dir: -1 },
  B: { axis: 2, layers: [-1], dir: 1 },
  M: { axis: 0, layers: [0], dir: 1 }, // L과 같은 방향
  E: { axis: 1, layers: [0], dir: 1 }, // D와 같은 방향
  S: { axis: 2, layers: [0], dir: -1 }, // F와 같은 방향
  x: { axis: 0, layers: ALL, dir: -1 }, // R과 같은 방향
  y: { axis: 1, layers: ALL, dir: -1 }, // U와 같은 방향
  z: { axis: 2, layers: ALL, dir: -1 }, // F와 같은 방향
  r: { axis: 0, layers: [0, 1], dir: -1 },
  l: { axis: 0, layers: [-1, 0], dir: 1 },
  u: { axis: 1, layers: [0, 1], dir: -1 },
  d: { axis: 1, layers: [-1, 0], dir: 1 },
  f: { axis: 2, layers: [0, 1], dir: -1 },
  b: { axis: 2, layers: [-1, 0], dir: 1 },
};

export interface Move {
  readonly base: BaseMove;
  /** 1 = 기호 그대로, -1 = 프라임('), 2 = 두 번 */
  readonly amount: 1 | 2 | -1;
}

export interface Turn {
  readonly axis: Axis;
  readonly layers: readonly number[];
  /** 축의 양의 방향 기준 90° 회전 횟수 (부호 포함) */
  readonly quarterTurns: number;
}

export function moveTurn(move: Move): Turn {
  const def = BASE_MOVES[move.base];
  return { axis: def.axis, layers: def.layers, quarterTurns: def.dir * move.amount };
}

export function moveToString(move: Move): string {
  return move.base + (move.amount === 2 ? '2' : move.amount === -1 ? "'" : '');
}

export function invertMove(move: Move): Move {
  return move.amount === 2 ? move : { base: move.base, amount: move.amount === 1 ? -1 : 1 };
}

/** 큐브 전체를 돌리는 동작(x, y, z)인지 */
export function isRotation(move: Move): boolean {
  return move.base === 'x' || move.base === 'y' || move.base === 'z';
}

const SINGLE_LAYER: readonly BaseMove[] = ['U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S'];

/** (축, 층, 회전 방향)을 표기법 기호로 바꾼다. 화면에서 스와이프한 동작을 해석할 때 쓴다. */
export function turnToMove(axis: Axis, layer: number, quarterTurns: 1 | -1): Move | null {
  for (const base of SINGLE_LAYER) {
    const def = BASE_MOVES[base];
    if (def.axis === axis && def.layers[0] === layer) {
      return { base, amount: def.dir === quarterTurns ? 1 : -1 };
    }
  }
  return null;
}

const permCache = new Map<string, readonly number[]>();

/** perm[i] = i번 칸의 스티커가 옮겨 가는 칸 */
function permutationOf(move: Move): readonly number[] {
  const key = moveToString(move);
  let perm = permCache.get(key);
  if (!perm) {
    const { axis, layers, quarterTurns } = moveTurn(move);
    perm = FACELETS.map((f, i) => {
      if (!layers.includes(f.pos[axis])) return i;
      const to = FACELET_INDEX.get(
        faceletKey(rotateVec(f.pos, axis, quarterTurns), rotateVec(f.normal, axis, quarterTurns)),
      );
      if (to === undefined) throw new Error(`회전 표 계산 실패: ${key}`);
      return to;
    });
    permCache.set(key, perm);
  }
  return perm;
}

export const SOLVED: CubeState = Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));

export function applyMove(state: CubeState, move: Move): CubeState {
  const perm = permutationOf(move);
  const next = new Array<number>(54);
  for (let i = 0; i < 54; i++) next[perm[i]] = state[i];
  return next;
}

export function applyMoves(state: CubeState, moves: readonly Move[]): CubeState {
  let s = state;
  for (const m of moves) s = applyMove(s, m);
  return s;
}

/** 여섯 면이 각각 한 가지 색인지. 큐브를 통째로 돌린 상태도 완성으로 본다. */
export function isSolved(state: CubeState): boolean {
  for (let f = 0; f < 6; f++) {
    const color = state[f * 9];
    for (let i = 1; i < 9; i++) if (state[f * 9 + i] !== color) return false;
  }
  return true;
}

/** "UUUUUUUUURRR..." 형식 문자열 (Kociemba 표기) */
export function toFaceletString(state: CubeState): string {
  return state.map((c) => FACES[c]).join('');
}

/** (조각 좌표, 바라보는 방향) → 칸 번호. 없으면 undefined */
export function faceletIndex(pos: Vec3, normal: Vec3): number | undefined {
  return FACELET_INDEX.get(faceletKey(pos, normal));
}
