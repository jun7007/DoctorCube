/**
 * 흰색 십자 최단 풀이기.
 * 흰색 엣지 네 개의 위치와 방향만 보면 상태가 190,080가지(12·11·10·9·2⁴)뿐이라,
 * 완성된 십자에서 거꾸로 너비 우선 탐색을 해 거리표를 만들어 두고 그 표를 따라 내려간다.
 *
 * 잡는 방향: 흰색 센터가 아래(D). 옆면 센터는 어느 쪽을 보고 있어도 된다.
 * 엣지를 색이 아니라 "지금 F·R·B·L 센터와 짝인 엣지"로 구분하므로 따로 돌려 맞출 필요가 없다.
 *
 * 화면이나 Node 기능을 쓰지 않는 순수 모듈이다 (Web Worker에서도 돌릴 수 있다).
 */
import { FACELETS, applyMove, type BaseMove, type CubeState, type Face, type Move } from '../core/cube';
import { centerColor, colorAt, facelet } from '../core/pieces';

const WHITE = 0;
const SIDES: readonly Face[] = ['F', 'R', 'B', 'L'];

/** 초보자가 돌리기 불편한 D, B를 맨 뒤에 둔다. */
const BASES: readonly BaseMove[] = ['U', 'R', 'F', 'L', 'D', 'B'];
const AMOUNTS = [1, -1, 2] as const;
const MOVES: readonly Move[] = BASES.flatMap((base) => AMOUNTS.map((amount) => ({ base, amount })));
const MOVE_COUNT = MOVES.length;
/** 이 번호부터가 D, B 동작 */
const AWKWARD_FROM = 12;

/** 엣지 스티커 자리 수. 좌표 하나(0~23)가 엣지의 위치와 방향을 함께 나타낸다. */
const COORDS = 24;
const SIZE = COORDS ** 4;
const STATE_COUNT = 12 * 11 * 10 * 9 * 16;
const UNSEEN = 255;

interface Tables {
  /** 좌표 → 흰색 스티커가 있는 칸 번호 */
  readonly cells: readonly number[];
  /** 좌표 → 같은 엣지의 반대쪽 칸 번호 */
  readonly partners: readonly number[];
  /** move[m * 24 + c] = 좌표 c의 스티커가 m번 동작 뒤에 있는 좌표 */
  readonly move: Uint8Array;
  /** dist[번호] = 십자까지 남은 최소 회전 수. 나올 수 없는 번호는 UNSEEN */
  readonly dist: Uint8Array;
}

let tables: Tables | null = null;

function buildTables(): Tables {
  const isEdge = (i: number) => FACELETS[i].pos.filter((v) => v === 0).length === 1;
  const cells = FACELETS.flatMap((_, i) => (isEdge(i) ? [i] : []));
  const partners = cells.map((i) =>
    cells.find((j) => j !== i && FACELETS[j].pos.join() === FACELETS[i].pos.join())!,
  );
  const coordOf = new Map(cells.map((cell, c) => [cell, c]));

  // 칸 번호를 적어 둔 큐브를 돌려 보고 엣지 스티커가 어디로 가는지 읽는다.
  const labels: CubeState = FACELETS.map((_, i) => i);
  const move = new Uint8Array(MOVE_COUNT * COORDS);
  MOVES.forEach((m, mi) => {
    const after = applyMove(labels, m);
    cells.forEach((cell, c) => {
      move[mi * COORDS + coordOf.get(after[cell])!] = c;
    });
  });

  const dist = new Uint8Array(SIZE).fill(UNSEEN);
  const queue = new Int32Array(STATE_COUNT);
  const solved = SIDES.reduceRight((acc, side) => acc * COORDS + coordOf.get(facelet(`D${side}`, 'D'))!, 0);
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
    for (let o = 0; o < MOVE_COUNT * COORDS; o += COORDS) {
      const next = move[o + a] + 24 * move[o + b] + 576 * move[o + c] + 13824 * move[o + e];
      if (dist[next] === UNSEEN) {
        dist[next] = d;
        queue[tail++] = next;
      }
    }
  }
  return { cells, partners, move, dist };
}

/** 흰색 엣지 네 개의 좌표를 읽어 거리표 번호로 만든다. */
function indexOf(t: Tables, state: CubeState): number {
  if (centerColor(state, 'D') !== WHITE) {
    throw new Error('흰색 센터가 아래(D)에 오도록 잡아 주세요.');
  }
  const centers = SIDES.map((side) => centerColor(state, side));
  const coords = [-1, -1, -1, -1];
  let found = 0;
  for (let c = 0; c < COORDS; c++) {
    if (state[t.cells[c]] !== WHITE) continue;
    const k = centers.indexOf(state[t.partners[c]]);
    if (k < 0 || coords[k] >= 0) break;
    coords[k] = c;
    found++;
  }
  const index = coords[0] + 24 * coords[1] + 576 * coords[2] + 13824 * coords[3];
  if (found !== 4 || t.dist[index] === UNSEEN) {
    throw new Error('흰색 엣지 네 개를 찾을 수 없어요. 큐브의 색 배치를 다시 확인해 주세요.');
  }
  return index;
}

/**
 * 거리표에서 거리가 1씩 줄어드는 길만 따라간다 (어느 길이든 최단).
 * 그중 D, B 동작이 가장 적은 길을 고른다. 최단 길만 보므로 가장 나쁜 상태에서도 2천 번 안쪽으로 끝난다.
 */
function extract(t: Tables, start: number): number[] {
  const { move, dist } = t;
  const length = dist[start];
  const path = new Array<number>(length);
  let best: number[] = [];
  let bestCost = Infinity;

  const visit = (index: number, depth: number, cost: number): void => {
    if (depth === length) {
      best = path.slice();
      bestCost = cost;
      return;
    }
    const want = length - depth - 1;
    const a = index % 24;
    const b = ((index / 24) | 0) % 24;
    const c = ((index / 576) | 0) % 24;
    const e = (index / 13824) | 0;
    for (let m = 0; m < MOVE_COUNT; m++) {
      const nextCost = m >= AWKWARD_FROM ? cost + 1 : cost;
      // 뒤에 남은 동작은 모두 D, B라 더 볼 필요가 없다.
      if (nextCost >= bestCost) return;
      const o = m * COORDS;
      const next = move[o + a] + 24 * move[o + b] + 576 * move[o + c] + 13824 * move[o + e];
      if (dist[next] !== want) continue;
      path[depth] = m;
      visit(next, depth + 1, nextCost);
      if (bestCost === 0) return;
    }
  };
  visit(start, 0, 0);
  return best;
}

/** 흰색 엣지 네 개가 모두 아래층에서 흰색이 아래를 보고, 옆 색이 센터와 맞는지 */
export function crossSolved(state: CubeState): boolean {
  return (
    centerColor(state, 'D') === WHITE &&
    SIDES.every(
      (side) =>
        colorAt(state, `D${side}`, 'D') === WHITE &&
        colorAt(state, `D${side}`, side) === centerColor(state, side),
    )
  );
}

/**
 * 아래(D)에 흰색 십자를 맞추는 가장 짧은 회전 순서 (U D L R F B만, 반 바퀴도 1회전으로 센다).
 * 이미 맞춰져 있으면 빈 배열. 처음 부를 때 거리표를 만든다.
 */
export function solveCross(state: CubeState): Move[] {
  tables ??= buildTables();
  return extract(tables, indexOf(tables, state)).map((m) => MOVES[m]);
}
