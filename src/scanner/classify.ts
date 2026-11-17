/**
 * 카메라로 찍은 여섯 면의 색(면마다 9칸)을 큐브 상태로 바꾼다 (화면과 무관한 순수 로직).
 *
 * 1. 흰색 센터로 조명 색을 걷어 내고, 밝기에 덜 흔들리는 색 좌표(Oklab의 색상·채도 위주)로 옮긴다.
 * 2. 센터 6개를 기준 색으로 삼아, 색마다 정확히 9칸이 되도록 나머지 48칸을 나눈다 (헝가리안 알고리즘).
 * 3. 그 결과가 실제 큐브로 만들 수 없는 상태면 조각 단위로 다시 맞춘다:
 *    엣지 12자리 · 코너 8자리에 실제 조각을 하나씩 (방향까지) 놓는 가장 싼 방법을 찾는다.
 *    둘째로 싼 큐브와 차이가 뚜렷할 때만 받아들이고, 아니면 고치지 않은 결과를 그대로 돌려준다.
 *
 * DOM이나 Node API를 쓰지 않아 Web Worker 안에서도 돈다.
 */
import { FACES, type Face } from '../core/cube';
import { facelet } from '../core/pieces';
import { validateState, type Validation } from '../solvers/kociemba';
import type { RGB } from './sample';

/** 한 면의 9칸 (왼쪽 위 → 오른쪽 아래) */
export type FaceSamples = readonly RGB[];

export interface ScanResult {
  /** cube.ts 순서의 색 번호 54개 */
  state: number[];
  /** 칸마다 0~1. 낮을수록 그 칸이 틀렸을 수 있다. */
  confidence: number[];
  /** validateState(state) */
  check: Validation;
}

// ───────────────────────── 색 좌표 ─────────────────────────

const CENTERS = [4, 13, 22, 31, 40, 49];
const IS_CENTER = Array.from({ length: 54 }, (_, i) => i % 9 === 4);
/** 센터가 아닌 48칸 */
const OUTER = Array.from({ length: 54 }, (_, i) => i).filter((i) => !IS_CENTER[i]);

/** 밝기는 조명에 따라 크게 달라지므로 색상·채도보다 가볍게 본다. */
const LIGHTNESS_WEIGHT = 0.4;
/** 어두운 칸에서 채도(a/L, b/L)가 잡음으로 튀지 않게 하는 값 */
const DARK_FLOOR = 0.08;
/** 흰색 센터로 구한 채널 보정값의 한계. 흰색 센터가 흰색이 아닐 때(다른 면을 찍었을 때) 폭주하지 않게 한다. */
const MAX_GAIN = 2.5;

function toLinear(v: number): number {
  const x = Number.isFinite(v) ? Math.min(255, Math.max(0, v)) / 255 : 0;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/**
 * 54칸의 색 좌표 (칸마다 3개).
 * 흰색 센터가 무채색이 되도록 채널을 맞춘 뒤 Oklab으로 옮기고, a·b를 밝기로 나눈다.
 * 선형 RGB에 밝기를 곱하면 Oklab의 L·a·b가 같은 비율로 변하므로 a/L, b/L은 밝기와 무관하다.
 */
function features(samples: readonly RGB[]): Float64Array {
  const lin = new Float64Array(54 * 3);
  for (let i = 0; i < 54; i++) for (let k = 0; k < 3; k++) lin[i * 3 + k] = toLinear(samples[i][k]);

  const w = [lin[4 * 3], lin[4 * 3 + 1], lin[4 * 3 + 2]];
  const mean = (w[0] + w[1] + w[2]) / 3;
  const gain = w.map((x) => (mean > 1e-3 ? Math.min(MAX_GAIN, Math.max(1 / MAX_GAIN, mean / Math.max(x, 1e-4))) : 1));

  const out = new Float64Array(54 * 3);
  for (let i = 0; i < 54; i++) {
    const r = lin[i * 3] * gain[0];
    const g = lin[i * 3 + 1] * gain[1];
    const b = lin[i * 3 + 2] * gain[2];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const scale = 1 / (Math.max(L, 0) + DARK_FLOOR);
    out[i * 3] = LIGHTNESS_WEIGHT * L;
    out[i * 3 + 1] = A * scale;
    out[i * 3 + 2] = B * scale;
  }
  return out;
}

/** 54칸 × 6색의 거리 */
function distances(feat: Float64Array, centroids: Float64Array): Float64Array {
  const d = new Float64Array(54 * 6);
  for (let i = 0; i < 54; i++) {
    for (let c = 0; c < 6; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        const diff = feat[i * 3 + k] - centroids[c * 3 + k];
        sum += diff * diff;
      }
      d[i * 6 + c] = Math.sqrt(sum);
    }
  }
  return d;
}

// ───────────────────────── 짝짓기 ─────────────────────────

/** 못 쓰는 칸에 넣는 비용 */
const BIG = 1e9;

/** n × n 비용 행렬에서 합이 가장 작은 짝짓기 (헝가리안 알고리즘, O(n³)). 결과: 행 → 열 */
function hungarian(cost: Float64Array, n: number): Int32Array {
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1);
  const way = new Int32Array(n + 1);
  const minv = new Float64Array(n + 1);
  const used = new Uint8Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(Infinity);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[(i0 - 1) * n + j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      // 비용이 유한하면 일어나지 않지만, 혹시라도 끝없이 돌지 않게 한다.
      if (j1 === 0) break;
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    while (j0) {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    }
  }
  const rowToCol = new Int32Array(n);
  for (let j = 1; j <= n; j++) if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/** 센터를 뺀 48칸을 색마다 8칸씩, 비용의 합이 가장 작게 나눈다. */
function balanced(cost: Float64Array): number[] {
  const n = OUTER.length;
  const m = new Float64Array(n * n);
  // 열 j는 색 ⌊j / 8⌋의 빈자리
  for (let r = 0; r < n; r++) for (let j = 0; j < n; j++) m[r * n + j] = cost[OUTER[r] * 6 + (j >> 3)];
  const slot = hungarian(m, n);
  const state = Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));
  OUTER.forEach((i, r) => (state[i] = slot[r] >> 3));
  return state;
}

// ───────────────────────── 조각 단위 맞추기 ─────────────────────────

interface PieceGroup {
  /** 자리(= 조각)의 수 */
  readonly n: number;
  /** 조각 하나에 붙은 스티커 수 (엣지 2, 코너 3). 방향의 합이 이 수의 배수여야 한다. */
  readonly size: number;
  /** 자리 → 칸 번호들 */
  readonly facelets: readonly (readonly number[])[];
  /** 조각 → 색들 (같은 순서) */
  readonly colors: readonly (readonly number[])[];
}

// 자리 이름은 Kociemba의 순서. 코너는 U/D 면부터 시계 방향으로 읽는다 (방향 합 규칙이 성립하려면 필요).
function pieceGroup(names: readonly string[]): PieceGroup {
  return {
    n: names.length,
    size: names[0].length,
    facelets: names.map((name) => [...name].map((ch) => facelet(name, ch as Face))),
    colors: names.map((name) => [...name].map((ch) => FACES.indexOf(ch as Face))),
  };
}

const CORNERS = pieceGroup(['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB']);
const EDGES = pieceGroup(['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR']);

interface Placement {
  /** 자리 → 조각 */
  readonly piece: Int32Array;
  /** 자리 → 방향 (조각의 k번째 색이 자리의 (k + 방향)번째 칸에 온다) */
  readonly ori: Int32Array;
  readonly cost: number;
}

function permParity(perm: Int32Array): number {
  let p = 0;
  for (let i = 0; i < perm.length; i++) for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) p ^= 1;
  return p;
}

/** 한 번에 살펴볼 짝짓기의 수 (보통 서너 번이면 끝난다) */
const MAX_RANKED = 60;

interface SearchNode {
  readonly cost: number;
  readonly assign: Int32Array;
  /** 앞에서부터 이만큼의 행은 assign대로 고정 */
  readonly fixed: number;
  /** 못 쓰는 칸 (행 × n + 열) */
  readonly banned: readonly number[];
}

function solveNode(
  base: Float64Array,
  n: number,
  prefix: Int32Array,
  fixed: number,
  banned: readonly number[],
): SearchNode | null {
  const m = Float64Array.from(base);
  for (let r = 0; r < fixed; r++) {
    const c = prefix[r];
    for (let j = 0; j < n; j++) if (j !== c) m[r * n + j] = BIG;
    for (let i = 0; i < n; i++) if (i !== r) m[i * n + c] = BIG;
  }
  for (const at of banned) m[at] = BIG;
  const assign = hungarian(m, n);
  let cost = 0;
  for (let r = 0; r < n; r++) cost += m[r * n + assign[r]];
  return cost < BIG / 2 ? { cost, assign, fixed, banned } : null;
}

/**
 * 조각을 자리에 하나씩 놓는 방법 가운데 가장 싼 것과 둘째로 싼 것을, 순열의 홀짝별로 돌려준다 ([짝, 홀]).
 * 방향의 합은 항상 규칙(엣지는 짝수, 코너는 3의 배수)에 맞춘다.
 *
 * 방향을 따지지 않은 비용으로 짝짓기를 싼 것부터 차례로 꺼내고(Murty의 방법),
 * 꺼낸 순열마다 방향 규칙을 지키는 가장 싼 방향을 구한다. 방향을 따지지 않은 비용은
 * 실제 비용보다 클 수 없으므로, 그 값이 지금까지 찾은 것 이상이 되면 더 볼 필요가 없다.
 * 정해진 횟수 안에 끝나지 않으면 (색이 거의 구분되지 않는 입력) null
 */
function bestPlacements(group: PieceGroup, cost: Float64Array): [Placement[], Placement[]] | null {
  const { n, size, facelets, colors } = group;
  // oriCost[(q × n + p) × size + o] = q자리에 p조각을 o방향으로 놓는 비용
  const oriCost = new Float64Array(n * n * size);
  const base = new Float64Array(n * n);
  for (let q = 0; q < n; q++) {
    for (let p = 0; p < n; p++) {
      let least = Infinity;
      for (let o = 0; o < size; o++) {
        let sum = 0;
        for (let k = 0; k < size; k++) sum += cost[facelets[q][(k + o) % size] * 6 + colors[p][k]];
        oriCost[(q * n + p) * size + o] = sum;
        if (sum < least) least = sum;
      }
      base[q * n + p] = least;
    }
  }

  /**
   * 주어진 순열에서 방향의 합이 규칙에 맞는 가장 싼 방향 (자리 순서대로 나머지를 따라가는 DP).
   * banAt자리의 banOri방향은 쓰지 않는다. 방법이 없으면 null
   */
  const orient = (piece: Int32Array, banAt = -1, banOri = -1): Placement | null => {
    let dp = new Float64Array(size).fill(Infinity);
    dp[0] = 0;
    const choice = new Int32Array(n * size);
    for (let q = 0; q < n; q++) {
      const next = new Float64Array(size).fill(Infinity);
      for (let r = 0; r < size; r++) {
        if (dp[r] === Infinity) continue;
        for (let o = 0; o < size; o++) {
          if (q === banAt && o === banOri) continue;
          const total = dp[r] + oriCost[(q * n + piece[q]) * size + o];
          const to = (r + o) % size;
          if (total < next[to]) {
            next[to] = total;
            choice[q * size + to] = o;
          }
        }
      }
      dp = next;
    }
    if (dp[0] === Infinity) return null;
    const ori = new Int32Array(n);
    let r = 0;
    for (let q = n - 1; q >= 0; q--) {
      ori[q] = choice[q * size + r];
      r = (r - ori[q] + size) % size;
    }
    return { piece, ori, cost: dp[0] };
  };

  const top: [Placement[], Placement[]] = [[], []];
  const keep = (list: Placement[], placed: Placement | null) => {
    if (!placed) return;
    let at = list.length;
    while (at > 0 && list[at - 1].cost > placed.cost) at--;
    list.splice(at, 0, placed);
    if (list.length > 2) list.length = 2;
  };

  const queue: SearchNode[] = [];
  const root = solveNode(base, n, new Int32Array(n), 0, []);
  if (root) queue.push(root);
  let round = 0;
  for (; round < MAX_RANKED && queue.length > 0; round++) {
    let at = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[at].cost) at = i;
    const node = queue.splice(at, 1)[0];
    if (top[0].length === 2 && top[1].length === 2 && node.cost >= Math.max(top[0][1].cost, top[1][1].cost)) break;

    const list = top[permParity(node.assign)];
    const first = orient(node.assign);
    keep(list, first);
    if (first) {
      // 같은 순열에서 둘째로 싼 방향: 어느 한 자리는 방향이 달라야 하므로, 자리마다 그 방향을 막고 다시 구한다.
      let second: Placement | null = null;
      for (let q = 0; q < n; q++) {
        const other = orient(node.assign, q, first.ori[q]);
        if (other && (!second || other.cost < second.cost)) second = other;
      }
      keep(list, second);
    }

    // 이 짝짓기를 뺀 나머지를 겹치지 않게 나눈다: r행 앞까지는 그대로 두고 r행만 다른 열로.
    // (마지막 행은 남는 열이 하나뿐이라 바꿀 수 없다.)
    for (let r = node.fixed; r < n - 1; r++) {
      const child = solveNode(base, n, node.assign, r, [...node.banned, r * n + node.assign[r]]);
      if (child) queue.push(child);
    }
  }
  return queue.length > 0 && round >= MAX_RANKED ? null : top;
}

/**
 * 비용의 합이 가장 작은 "실제로 만들 수 있는" 상태와, 둘째로 싼 상태와의 비용 차이(margin).
 * 엣지와 코너를 따로 맞추되, 두 순열의 홀짝이 같은 조합 가운데 싼 쪽을 고른다.
 */
function cheapestValid(cost: Float64Array): { state: number[]; margin: number } | null {
  const edges = bestPlacements(EDGES, cost);
  const corners = bestPlacements(CORNERS, cost);
  if (!edges || !corners) return null;
  let pick: [Placement, Placement] | null = null;
  let least = Infinity;
  let second = Infinity;
  for (let parity = 0; parity < 2; parity++) {
    for (const e of edges[parity]) {
      for (const c of corners[parity]) {
        const total = e.cost + c.cost;
        if (total < least) {
          second = least;
          least = total;
          pick = [e, c];
        } else if (total < second) {
          second = total;
        }
      }
    }
  }
  if (!pick) return null;
  const chosen = pick;
  const state = Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));
  [EDGES, CORNERS].forEach((group, g) => {
    const { piece, ori } = chosen[g];
    for (let q = 0; q < group.n; q++) {
      for (let k = 0; k < group.size; k++) {
        state[group.facelets[q][(k + ori[q]) % group.size]] = group.colors[piece[q]][k];
      }
    }
  });
  return { state, margin: second - least };
}

// ───────────────────────── 분류 ─────────────────────────

function readSamples(faces: readonly FaceSamples[]): RGB[] {
  const out: RGB[] = [];
  for (let i = 0; i < 54; i++) {
    const rgb = faces?.[Math.floor(i / 9)]?.[i % 9];
    out.push([Number(rgb?.[0]) || 0, Number(rgb?.[1]) || 0, Number(rgb?.[2]) || 0]);
  }
  return out;
}

/** 기준 색을 다시 잡을 때 센터 한 칸이 갖는 무게 (나머지 칸은 1) */
const ANCHOR_WEIGHT = 3;
const REFINE_ROUNDS = 3;
/** 두 센터의 색이 이보다 가까우면 기준 색으로 쓸 수 없다 (같은 면을 두 번 찍었을 때 등). */
const MIN_ANCHOR_GAP = 0.01;
/** 조각 단위로 고칠 때 바꿔도 되는 칸 수. 이보다 많이 바꿔야 하면 찍은 것 자체가 잘못됐다고 본다. */
const MAX_REPAIRED = 12;
/**
 * 고친 결과를 믿으려면, 둘째로 싼 큐브가 "칸들이 기준 색에서 흩어진 정도"의 몇 배만큼 더 비싸야 하는지.
 * 조각 단위로 맞추면 무엇을 찍었든 만들 수 있는 큐브가 하나는 나오므로, 뚜렷하게 하나로 정해질 때만 받아들인다.
 * (예: 두 면의 색이 구분되지 않으면 엣지 네 쌍을 어느 쪽으로 놓아도 비용이 거의 같다.)
 */
const MIN_MARGIN = 3;

function classify(faces: readonly FaceSamples[], repair: boolean): ScanResult {
  const feat = features(readSamples(faces));
  const anchors = new Float64Array(18);
  CENTERS.forEach((i, c) => anchors.set(feat.subarray(i * 3, i * 3 + 3), c * 3));

  // 비용은 거리 그대로 쓴다. 제곱하면 반사광 같은 튀는 칸 하나가 전체 배치를 끌고 간다.
  let dist = distances(feat, anchors);
  let state: number[];

  let gap = Infinity;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) gap = Math.min(gap, dist[CENTERS[a] * 6 + b]);

  if (!(gap >= MIN_ANCHOR_GAP)) {
    // 기준 색끼리 구분이 안 되면 색 수를 억지로 맞추지 않는다 (맞추면 우연히 그럴듯한 큐브가 나올 수 있다).
    state = Array.from({ length: 54 }, (_, i) => {
      if (IS_CENTER[i]) return Math.floor(i / 9);
      let c = 0;
      for (let k = 1; k < 6; k++) if (dist[i * 6 + k] < dist[i * 6 + c]) c = k;
      return c;
    });
  } else {
    state = balanced(dist);
    // 센터 한 칸만으로는 기준 색이 흔들리므로, 같은 색으로 묶인 칸들의 평균 쪽으로 옮겨 다시 나눈다.
    for (let round = 0; round < REFINE_ROUNDS; round++) {
      const centroids = new Float64Array(18);
      for (let k = 0; k < 18; k++) centroids[k] = ANCHOR_WEIGHT * anchors[k];
      for (const i of OUTER) for (let k = 0; k < 3; k++) centroids[state[i] * 3 + k] += feat[i * 3 + k];
      for (let k = 0; k < 18; k++) centroids[k] /= ANCHOR_WEIGHT + 8;
      dist = distances(feat, centroids);
      const next = balanced(dist);
      const same = next.every((c, i) => c === state[i]);
      state = next;
      if (same) break;
    }

    if (repair && !validateState(state).ok) {
      const fixed = cheapestValid(dist);
      if (fixed && validateState(fixed.state).ok) {
        let changed = 0;
        for (let i = 0; i < 54; i++) if (fixed.state[i] !== state[i]) changed++;
        // 흩어진 정도: 칸에서 자기 색까지 거리의 중앙값
        const own = OUTER.map((i) => dist[i * 6 + state[i]]).sort((x, y) => x - y);
        const spread = (own[23] + own[24]) / 2;
        if (changed <= MAX_REPAIRED && fixed.margin >= MIN_MARGIN * spread) state = fixed.state;
      }
    }
  }

  // 고른 색까지의 거리와, 나머지 색 중 가장 가까운 것까지의 거리를 견준다.
  const confidence = state.map((c, i) => {
    if (IS_CENTER[i]) return 1;
    let other = Infinity;
    for (let k = 0; k < 6; k++) if (k !== c) other = Math.min(other, dist[i * 6 + k]);
    if (!(other > 0)) return 0;
    return Math.min(1, Math.max(0, 1 - dist[i * 6 + c] / other));
  });

  return { state, confidence, check: validateState(state) };
}

/**
 * faces: U R F D L B 순서의 여섯 면, 각 9칸. 센터 6개를 기준 색으로 삼아 나머지를 분류한다.
 * 색마다 9칸이 되게 나눈 결과가 만들 수 없는 큐브면, 조각 단위로 가장 가까운 만들 수 있는 큐브를 찾는다.
 */
export function classifyFaces(faces: readonly FaceSamples[]): ScanResult {
  return classify(faces, true);
}

/** classifyFaces에서 조각 단위 보정만 뺀 것 (색 수만 맞춘다). 보정이 얼마나 도움이 되는지 견줄 때 쓴다. */
export function classifyBalanced(faces: readonly FaceSamples[]): ScanResult {
  return classify(faces, false);
}

// ───────────────────────── 어림 ─────────────────────────

/**
 * 조명 보정 없이 한 칸의 색을 어림한다 (0~5). 실시간 미리보기와 "다른 면을 찍은 것 같아요" 경고에 쓴다.
 * 채도가 낮으면 흰색, 아니면 색상 각도로 나눈다.
 */
export function guessColor(rgb: RGB): number {
  const r = Number(rgb?.[0]) || 0;
  const g = Number(rgb?.[1]) || 0;
  const b = Number(rgb?.[2]) || 0;
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (max <= 0 || chroma <= 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / chroma + 6) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue *= 60;

  // 따뜻한 실내조명에서는 흰색이 누렇게 찍히므로 노랑~주황 쪽은 흰색으로 보는 범위를 넓힌다.
  // (노란색·주황색 스티커는 채도가 훨씬 높다.)
  const saturation = chroma / max;
  if (saturation < (hue >= 20 && hue < 80 ? 0.4 : 0.3)) return 0;

  // 빨강은 0° 근처, 주황은 15~35°라 그 사이에서 가른다. 보라 쪽(300° 이상)은 빨강으로 본다.
  if (hue < 9 || hue >= 300) return 1;
  if (hue < 41) return 4;
  if (hue < 80) return 3;
  if (hue < 175) return 2;
  return 5;
}
