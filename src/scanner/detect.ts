/**
 * 사진에서 큐브를 찾아낸다. 사용자가 안내선에 맞출 필요 없이, 어떻게 찍든 스티커를 직접 찾는다.
 *
 * 1. 색이 고른 조각(스티커 후보)을 모두 찾는다. 스티커 사이의 검은 틈이 조각을 나눠 준다.
 * 2. 한 조각을 가운데로 3×3 격자를 이루는 묶음을 찾는다. 이것이 큐브의 한 면이다.
 * 3. 꼭짓점 쪽에서 찍은 사진이면 그런 면이 셋이고, 세 면이 만나는 꼭짓점을 기준으로 칸의 순서를 정한다.
 *
 * 원근 때문에 격자가 반듯하지 않아도 되도록, 위치를 맞춰 볼 때 넉넉한 오차를 허용한다.
 */
import type { PixelSource, RGB } from './sample';

/** 큐브를 찾을 때 쓰는 그림의 가로 크기(픽셀). 화면(ScanView)과 시험이 같은 값을 쓴다. 클수록 멀리 있는 큐브도 찾지만 느리다. */
export const DETECT_WIDTH = 400;

export interface Point {
  x: number;
  y: number;
}

/** 색이 고른 조각 하나 */
export interface Blob extends Point {
  area: number;
  rgb: RGB;
}

/** 면의 한 칸 */
export interface Cell extends Point {
  rgb: RGB;
  /** 조각으로 직접 찾았는지 (아니면 격자에서 예상한 자리의 색을 읽은 것) */
  found: boolean;
}

/** 3×3으로 놓인 한 면. cells[i][j]에서 가운데는 cells[1][1] */
export interface Grid {
  cells: Cell[][];
  /** 격자가 얼마나 반듯한지 (작을수록 좋다) */
  residual: number;
}

// ───────── 1. 조각 찾기 ─────────

/** 이웃한 두 픽셀을 같은 조각으로 보는 색 차이 (세 채널 차이의 합) */
const SIMILAR = 34;
/**
 * 픽셀이나 조각을 한 조각에 넣을 때, 그 조각의 평균 색과 달라도 되는 정도.
 * 이웃끼리만 비교하면 색이 조금씩 변하는 경계를 타고 다른 것(예: 흰 스티커와 밝은 배경)이 한 덩어리가 된다.
 */
const SAME_BLOB = 38;
/** 이보다 어두운 픽셀은 틈이나 그림자로 보고 버린다 */
const DARK = 42;

export function findBlobs(image: PixelSource): Blob[] {
  const { data, width, height } = image;
  const n = width * height;
  const parent = new Int32Array(n).fill(-1);
  // 조각(대표 픽셀)마다 지금까지의 색 합과 픽셀 수
  const sumR = new Float32Array(n);
  const sumG = new Float32Array(n);
  const sumB = new Float32Array(n);
  const count = new Int32Array(n);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const bright = (i: number) => (data[i * 4] * 3 + data[i * 4 + 1] * 6 + data[i * 4 + 2]) / 10 >= DARK;
  const similar = (a: number, b: number) =>
    Math.abs(data[a * 4] - data[b * 4]) + Math.abs(data[a * 4 + 1] - data[b * 4 + 1]) + Math.abs(data[a * 4 + 2] - data[b * 4 + 2]) <=
    SIMILAR;
  /** 픽셀 i의 색이 조각 root의 평균 색과 비슷한지 */
  const fits = (i: number, root: number) =>
    Math.abs(data[i * 4] - sumR[root] / count[root]) +
      Math.abs(data[i * 4 + 1] - sumG[root] / count[root]) +
      Math.abs(data[i * 4 + 2] - sumB[root] / count[root]) <=
    SAME_BLOB;
  const sameColor = (a: number, b: number) =>
    Math.abs(sumR[a] / count[a] - sumR[b] / count[b]) +
      Math.abs(sumG[a] / count[a] - sumG[b] / count[b]) +
      Math.abs(sumB[a] / count[a] - sumB[b] / count[b]) <=
    SAME_BLOB;
  const add = (i: number, root: number) => {
    parent[i] = root;
    sumR[root] += data[i * 4];
    sumG[root] += data[i * 4 + 1];
    sumB[root] += data[i * 4 + 2];
    count[root]++;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!bright(i)) continue;
      const left = x > 0 && parent[i - 1] >= 0 && similar(i, i - 1) ? find(i - 1) : -1;
      const up = y > 0 && parent[i - width] >= 0 && similar(i, i - width) ? find(i - width) : -1;
      const joinLeft = left >= 0 && fits(i, left);
      const joinUp = up >= 0 && fits(i, up);
      if (joinLeft) add(i, left);
      else if (joinUp) add(i, up);
      else add(i, i);
      // 왼쪽 조각과 위쪽 조각이 이 픽셀에서 만나면, 평균 색이 비슷할 때만 하나로 합친다.
      if (joinLeft && joinUp && left !== up && sameColor(left, up)) {
        parent[up] = left;
        sumR[left] += sumR[up];
        sumG[left] += sumG[up];
        sumB[left] += sumB[up];
        count[left] += count[up];
      }
    }
  }

  // 조각마다 넓이, 무게중심, 퍼진 정도, 평균 색을 모은다.
  const stats = new Map<number, Float64Array>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (parent[i] < 0) continue;
      const root = find(i);
      let s = stats.get(root);
      if (!s) stats.set(root, (s = new Float64Array(9)));
      s[0]++;
      s[1] += x;
      s[2] += y;
      s[3] += x * x;
      s[4] += y * y;
      s[5] += x * y;
      s[6] += data[i * 4];
      s[7] += data[i * 4 + 1];
      s[8] += data[i * 4 + 2];
    }
  }

  const blobs: Blob[] = [];
  const minArea = Math.max(14, n / 5000);
  const maxArea = n / 10;
  for (const s of stats.values()) {
    const area = s[0];
    if (area < minArea || area > maxArea) continue;
    const x = s[1] / area;
    const y = s[2] / area;
    const xx = s[3] / area - x * x;
    const yy = s[4] / area - y * y;
    const xy = s[5] / area - x * y;
    const det = xx * yy - xy * xy;
    if (det <= 0) continue;
    // 평행사변형이면 넓이 = 12·√det. 들쭉날쭉하거나 속이 빈 모양은 이 비율이 작다.
    const fill = area / (12 * Math.sqrt(det));
    if (fill < 0.72 || fill > 1.3) continue;
    // 너무 길쭉한 것은 스티커가 아니다.
    const trace = xx + yy;
    const root = Math.sqrt(Math.max(0, trace * trace - 4 * det));
    if ((trace + root) / Math.max(1e-6, trace - root) > 30) continue;
    const rgb: RGB = [s[6] / area, s[7] / area, s[8] / area];
    if (Math.max(rgb[0], rgb[1], rgb[2]) < 70) continue;
    blobs.push({ x, y, area, rgb });
  }
  return blobs;
}

// ───────── 2. 3×3 격자 찾기 ─────────

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** 처음에 반듯한 격자로 어림할 때, 예상 위치에서 벗어나도 되는 정도 (칸 간격 대비) */
const ROUGH_TOLERANCE = 0.55;
/** 원근 변환에 맞춘 뒤, 예상 위치에서 벗어나도 되는 정도 */
const FINE_TOLERANCE = 0.33;
/**
 * 가운데 칸을 뺀 여덟 칸 중 이만큼은 실제 조각으로 찾아야 면으로 인정한다.
 * 세 칸까지는 빠져도 된다 (흰 스티커가 밝은 배경에 묻히거나, 빛이 번쩍여 조각이 깨진 경우).
 */
const MIN_FOUND = 5;

/** 원근 변환에 맞춘 뒤 조각들이 예상 자리에서 벗어난 평균 거리의 한도 (칸 간격 대비) */
const MAX_ERROR = 0.09;

/** 격자 좌표(-1, 0, 1) → 그림 좌표. 원근이 있어도 맞도록 사영 변환으로 맞춘다. */
type Mapping = (i: number, j: number) => Point;

/** 대응점들에 가장 잘 맞는 사영 변환을 구한다 (최소 제곱). 점이 4개보다 적거나 풀 수 없으면 null. */
function fitMapping(pairs: readonly { i: number; j: number; x: number; y: number }[]): Mapping | null {
  if (pairs.length < 4) return null;
  // x = (h0·i + h1·j + h2) / (h6·i + h7·j + 1), y = (h3·i + h4·j + h5) / (같은 분모)
  const ata = Array.from({ length: 8 }, () => new Float64Array(9));
  const accumulate = (row: number[], value: number) => {
    for (let r = 0; r < 8; r++) {
      if (row[r] === 0) continue;
      for (let c = 0; c < 8; c++) ata[r][c] += row[r] * row[c];
      ata[r][8] += row[r] * value;
    }
  };
  for (const { i, j, x, y } of pairs) {
    accumulate([i, j, 1, 0, 0, 0, -x * i, -x * j], x);
    accumulate([0, 0, 0, i, j, 1, -y * i, -y * j], y);
  }
  // 가우스 소거
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(ata[r][col]) > Math.abs(ata[pivot][col])) pivot = r;
    if (Math.abs(ata[pivot][col]) < 1e-9) return null;
    [ata[col], ata[pivot]] = [ata[pivot], ata[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const factor = ata[r][col] / ata[col][col];
      if (factor === 0) continue;
      for (let c = col; c < 9; c++) ata[r][c] -= factor * ata[col][c];
    }
  }
  const h = ata.map((row, k) => row[8] / row[k]);
  return (i, j) => {
    const w = h[6] * i + h[7] * j + 1;
    return { x: (h[0] * i + h[1] * j + h[2]) / w, y: (h[3] * i + h[4] * j + h[5]) / w };
  };
}

const OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

interface Candidate {
  center: Blob;
  /** OFFSETS 순서로, 그 자리에서 찾은 조각 (없으면 null) */
  found: (Blob | null)[];
  mapping: Mapping;
  spacing: number;
  residual: number;
}

/** 이 조각을 가운데로 하는 3×3 격자를 찾는다. */
function gridAround(image: PixelSource, center: Blob, blobs: readonly Blob[]): Candidate | null {
  const reach = 3.8 * Math.sqrt(center.area);
  const near = blobs
    .filter((b) => b !== center && b.area > center.area * 0.2 && b.area < center.area * 5 && dist(b, center) < reach)
    .sort((a, b) => dist(a, center) - dist(b, center))
    .slice(0, 18);
  if (near.length < MIN_FOUND) return null;

  /** 예상 위치마다 가장 가까운 조각을 고른다 (한 조각은 한 자리에만). */
  const match = (mapping: Mapping, tolerance: number) => {
    const used = new Set<Blob>();
    let error = 0;
    const found = OFFSETS.map(([i, j]) => {
      const target = mapping(i, j);
      let best: Blob | null = null;
      let bestD = tolerance;
      for (const b of near) {
        if (used.has(b)) continue;
        const d = dist(b, target);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        used.add(best);
        error += bestD;
      }
      return best;
    });
    return { found, count: used.size, error };
  };

  let best: Candidate | null = null;
  const first = near.slice(0, 9);
  for (let a = 0; a < first.length; a++) {
    for (let b = a + 1; b < first.length; b++) {
      const u = { x: first[a].x - center.x, y: first[a].y - center.y };
      const v = { x: first[b].x - center.x, y: first[b].y - center.y };
      const lu = Math.hypot(u.x, u.y);
      const lv = Math.hypot(v.x, v.y);
      // 두 방향이 거의 나란하거나 길이가 너무 다르면 격자의 두 축이 아니다.
      if (Math.abs(u.x * v.y - u.y * v.x) < 0.35 * lu * lv || lu > 2.6 * lv || lv > 2.6 * lu) continue;
      let spacing = Math.min(lu, lv);

      // 먼저 반듯한 격자로 어림하고, 찾은 조각들로 원근 변환을 맞춰 다시 본다.
      let mapping: Mapping = (i, j) => ({ x: center.x + i * u.x + j * v.x, y: center.y + i * u.y + j * v.y });
      let result = match(mapping, ROUGH_TOLERANCE * spacing);
      for (let round = 0; round < 2 && result.count >= 5; round++) {
        const pairs = [{ i: 0, j: 0, x: center.x, y: center.y }];
        result.found.forEach((blob, k) => {
          if (blob) pairs.push({ i: OFFSETS[k][0], j: OFFSETS[k][1], x: blob.x, y: blob.y });
        });
        const fitted = fitMapping(pairs);
        if (!fitted) break;
        mapping = fitted;
        const right = mapping(1, 0);
        const down = mapping(0, 1);
        spacing = Math.min(dist(right, mapping(0, 0)), dist(down, mapping(0, 0)));
        result = match(mapping, FINE_TOLERANCE * spacing);
      }
      if (result.count < MIN_FOUND) continue;
      // 빠진 칸의 예상 자리는 스티커처럼 밝아야 한다. 검은 틈이나 큐브 바깥이면 엉뚱한 격자다.
      const missingLooksWrong = result.found.some((blob, k) => {
        if (blob) return false;
        const at = mapping(OFFSETS[k][0], OFFSETS[k][1]);
        const [r, g, b] = samplePatch(image, at, spacing * 0.16);
        return (r * 3 + g * 6 + b) / 10 < 90;
      });
      if (missingLooksWrong) continue;
      // 진짜 면이면 조각들이 예상 자리에 거의 정확히 놓인다. 여러 면에 걸쳐 느슨하게 맞은 격자는 버린다.
      const error = result.error / result.count / spacing;
      if (error > MAX_ERROR) continue;
      // 한 면 안의 스티커는 크기가 비슷하다 (원근으로 달라지는 정도까지만 허용).
      const areas = result.found.filter((b): b is Blob => b !== null).map((b) => b.area);
      if (Math.min(...areas) < center.area * 0.35 || Math.max(...areas) > center.area * 2.8) continue;
      // 빠진 칸이 있으면 조금 덜 믿는다.
      const residual = error + (8 - result.count) * 0.03;
      if (!best || residual < best.residual) best = { center, found: result.found, mapping, spacing, residual };
    }
  }
  return best;
}

/** 그림의 한 점 둘레에서 대표 색(채널별 중앙값)을 읽는다. 조각으로 못 찾은 칸의 색을 채울 때 쓴다. */
function samplePatch(image: PixelSource, at: Point, radius: number): RGB {
  const channels: [number[], number[], number[]] = [[], [], []];
  const r = Math.max(1, Math.round(radius));
  for (let y = Math.round(at.y) - r; y <= Math.round(at.y) + r; y++) {
    if (y < 0 || y >= image.height) continue;
    for (let x = Math.round(at.x) - r; x <= Math.round(at.x) + r; x++) {
      if (x < 0 || x >= image.width) continue;
      const i = (y * image.width + x) * 4;
      channels[0].push(image.data[i]);
      channels[1].push(image.data[i + 1]);
      channels[2].push(image.data[i + 2]);
    }
  }
  if (channels[0].length === 0) return [0, 0, 0];
  const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];
  return [median(channels[0]), median(channels[1]), median(channels[2])];
}

/** 그림에서 서로 겹치지 않는 3×3 면들을 찾아, 믿을 만한 순서로 돌려준다. */
export function findGrids(image: PixelSource): Grid[] {
  const blobs = findBlobs(image);
  const candidates: Candidate[] = [];
  for (const blob of blobs) {
    const candidate = gridAround(image, blob, blobs);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => a.residual - b.residual);

  const taken = new Set<Blob>();
  const grids: Grid[] = [];
  for (const c of candidates) {
    const members = [c.center, ...c.found.filter((b): b is Blob => b !== null)];
    if (members.some((b) => taken.has(b))) continue;
    members.forEach((b) => taken.add(b));
    const cells: Cell[][] = [[], [], []];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const k = OFFSETS.findIndex(([a, b]) => a === i && b === j);
        const blob = i === 0 && j === 0 ? c.center : c.found[k];
        if (blob) {
          cells[i + 1][j + 1] = { x: blob.x, y: blob.y, rgb: blob.rgb, found: true };
        } else {
          const at = c.mapping(i, j);
          cells[i + 1][j + 1] = { x: at.x, y: at.y, rgb: samplePatch(image, at, c.spacing * 0.16), found: false };
        }
      }
    }
    grids.push({ cells, residual: c.residual });
  }
  return grids;
}

// ───────── 3. 한 면 읽기 ─────────

export interface FaceReading {
  /** 화면에 보이는 대로 왼쪽 위 → 오른쪽 아래 9칸의 색 */
  colors: RGB[];
  /** 같은 순서의 칸 위치 (화면에 표시할 때 쓴다) */
  points: Point[];
}

/** 한 면을 정면에서 찍은 사진을 읽는다. 큐브를 대체로 똑바로 들고 있다고 본다. */
export function readFace(image: PixelSource): FaceReading | null {
  const grid = findGrids(image)[0];
  if (!grid) return null;
  const c = grid.cells;
  // 두 격자 방향 중 가로에 가까운 쪽을 열로, 나머지를 행으로 삼는다.
  const di = { x: c[2][1].x - c[0][1].x, y: c[2][1].y - c[0][1].y };
  const dj = { x: c[1][2].x - c[1][0].x, y: c[1][2].y - c[1][0].y };
  const iIsColumn = Math.abs(di.x) * Math.abs(dj.y) > Math.abs(dj.x) * Math.abs(di.y);
  const column = iIsColumn ? di : dj;
  const row = iIsColumn ? dj : di;
  const cells: Cell[] = [];
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 3; col++) {
      const cc = column.x >= 0 ? col : 2 - col;
      const rr = row.y >= 0 ? r : 2 - r;
      cells.push(iIsColumn ? c[cc][rr] : c[rr][cc]);
    }
  }
  return { colors: cells.map((b) => b.rgb), points: cells.map(({ x, y }) => ({ x, y })) };
}

// ───────── 4. 꼭짓점 쪽에서 본 세 면 읽기 ─────────

export interface CornerFace {
  center: Point;
  /**
   * colors[a][b]: 세 면이 만나는 꼭짓점 칸이 [0][0].
   * a는 alongA 면과 맞닿은 모서리를 따라, b는 alongB 면과 맞닿은 모서리를 따라 꼭짓점에서 멀어지는 걸음 수.
   */
  colors: RGB[][];
  points: Point[][];
  /** a 방향 줄이 맞닿아 있는 이웃 면의 번호 (CornerReading.faces 안에서) */
  alongA: number;
  alongB: number;
}

export interface CornerReading {
  faces: [CornerFace, CornerFace, CornerFace];
  /** 화면에서 faces[0] → [1] → [2]가 시계 방향인지 */
  clockwise: boolean;
}

/** 꼭짓점이 카메라를 보게 든 사진에서 세 면을 읽는다. 어느 꼭짓점이든, 어느 쪽으로 기울였든 된다. */
export function readCorner(image: PixelSource): CornerReading | null {
  const grids = findGrids(image).slice(0, 3);
  if (grids.length < 3) return null;
  const centers = grids.map((g) => g.cells[1][1]);
  const middle = {
    x: (centers[0].x + centers[1].x + centers[2].x) / 3,
    y: (centers[0].y + centers[1].y + centers[2].y) / 3,
  };
  // 세 면은 서로 붙어 있어야 한다.
  const spacing = grids.map((g) => (dist(g.cells[0][1], g.cells[2][1]) + dist(g.cells[1][0], g.cells[1][2])) / 4);
  for (let k = 0; k < 3; k++) {
    const other = (k + 1) % 3;
    if (dist(centers[k], centers[other]) > 4.2 * Math.max(spacing[k], spacing[other])) return null;
  }

  const nearestFace = (p: Point, self: number): number => {
    let best = -1;
    let bestD = Infinity;
    grids.forEach((g, k) => {
      if (k === self) return;
      for (const cell of g.cells.flat()) {
        const d = dist(cell, p);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
    });
    return best;
  };

  const faces: CornerFace[] = [];
  for (let k = 0; k < 3; k++) {
    const c = grids[k].cells;
    // 세 면이 만나는 꼭짓점의 칸 = 네 모서리 칸 중 세 면의 한가운데에 가장 가까운 것
    let vi = 0;
    let vj = 0;
    let bestD = Infinity;
    for (const i of [0, 2]) {
      for (const j of [0, 2]) {
        const d = dist(c[i][j], middle);
        if (d < bestD) {
          bestD = d;
          vi = i;
          vj = j;
        }
      }
    }
    // i 방향으로 늘어선 줄(j = vj)과 j 방향으로 늘어선 줄(i = vi)이 각각 어느 이웃 면과 맞닿아 있는지
    const alongA = nearestFace(c[1][vj], k);
    const alongB = nearestFace(c[vi][1], k);
    if (alongA === alongB) return null;
    const colors: RGB[][] = [];
    const points: Point[][] = [];
    for (let a = 0; a < 3; a++) {
      colors.push([]);
      points.push([]);
      for (let b = 0; b < 3; b++) {
        const cell = c[vi === 0 ? a : 2 - a][vj === 0 ? b : 2 - b];
        colors[a].push(cell.rgb);
        points[a].push({ x: cell.x, y: cell.y });
      }
    }
    faces.push({ center: { x: centers[k].x, y: centers[k].y }, colors, points, alongA, alongB });
  }

  const cross =
    (centers[1].x - centers[0].x) * (centers[2].y - centers[0].y) - (centers[1].y - centers[0].y) * (centers[2].x - centers[0].x);
  return { faces: faces as [CornerFace, CornerFace, CornerFace], clockwise: cross > 0 };
}
