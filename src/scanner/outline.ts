/**
 * 사진에서 큐브의 겉 윤곽을 찾는다.
 *
 * 틈이 없는(스티커 없는) 큐브는 칸을 하나씩 찾을 수 없으므로, 큐브 전체에서 출발한다.
 * 1. 색이 선명한 픽셀을 모은다. 큐브의 색 칸은 선명하고, 배경(이불, 벽)이나 손은 그렇지 않다.
 * 2. 그 가운데 가장 큰 덩어리를 큐브로 보고, 볼록한 테두리를 구한다.
 * 3. 테두리를 변이 k개인 다각형으로 줄인다 (한 면이면 4, 꼭짓점 쪽에서 보면 6).
 *    짧은 변을 없애고 양옆의 긴 변을 늘려 만나게 하므로, 흰색 칸 때문에 잘려 나간 모서리도 복원된다.
 */
import type { PixelSource } from './sample';

export interface Point {
  x: number;
  y: number;
}

/** 채도(0~1)와 밝기(0~255) */
function saturation(r: number, g: number, b: number): { s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { s: max === 0 ? 0 : (max - min) / max, v: max };
}

/** 큐브의 색 칸으로 볼 만큼 선명한 픽셀인지 */
const MIN_SATURATION = 0.5;
const MIN_VALUE = 70;
/** 둘레의 이만큼이 선명해야 큐브의 일부로 본다 */
const DENSE = 0.75;

/** 네모 창 안의 개수를 빠르게 세기 위한 누적 합 */
function prefixSums(flags: Uint8Array, width: number, height: number): Int32Array {
  const sum = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += flags[y * width + x];
      sum[(y + 1) * (width + 1) + x + 1] = sum[y * (width + 1) + x + 1] + row;
    }
  }
  return sum;
}

/** (x, y) 둘레 반지름 r인 네모 창 안에서 표시된 픽셀의 수와 창의 넓이 */
function inWindow(sum: Int32Array, width: number, height: number, x: number, y: number, r: number): [number, number] {
  const x0 = Math.max(0, x - r);
  const x1 = Math.min(width, x + r + 1);
  const y0 = Math.max(0, y - r);
  const y1 = Math.min(height, y + r + 1);
  const w = width + 1;
  return [sum[y1 * w + x1] - sum[y0 * w + x1] - sum[y1 * w + x0] + sum[y0 * w + x0], (x1 - x0) * (y1 - y0)];
}

/**
 * 표시된 픽셀을 r만큼 부풀려 이어 붙였을 때 가장 큰 덩어리를 찾는다.
 * 돌려주는 것은 그 덩어리에 든 (부풀리기 전의) 픽셀 표시와 픽셀 수.
 */
function largestBlob(flags: Uint8Array, width: number, height: number, r: number): { mask: Uint8Array; size: number } {
  const n = width * height;
  const sum = prefixSums(flags, width, height);
  const fat = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inWindow(sum, width, height, x, y, r)[0] > 0) fat[y * width + x] = 1;
    }
  }
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (!fat[start] || label[start]) continue;
    next++;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    label[start] = next;
    while (top > 0) {
      const i = stack[--top];
      // 덩어리의 크기는 부풀리기 전의 픽셀로 센다.
      size += flags[i];
      const x = i % width;
      if (x > 0 && fat[i - 1] && !label[i - 1]) (label[i - 1] = next), (stack[top++] = i - 1);
      if (x < width - 1 && fat[i + 1] && !label[i + 1]) (label[i + 1] = next), (stack[top++] = i + 1);
      if (i >= width && fat[i - width] && !label[i - width]) (label[i - width] = next), (stack[top++] = i - width);
      if (i < n - width && fat[i + width] && !label[i + width]) (label[i + width] = next), (stack[top++] = i + width);
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] === best && flags[i]) mask[i] = 1;
  return { mask, size: bestSize };
}

/** 큐브의 색 칸으로 보이는 픽셀들의 표시(1)를 돌려준다. 큐브가 없으면 null */
export function cubeMask(image: PixelSource): Uint8Array | null {
  const { data, width, height } = image;
  const n = width * height;
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const { s, v } = saturation(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (s >= MIN_SATURATION && v >= MIN_VALUE) raw[i] = 1;
  }

  // 손바닥의 붉은 주름처럼 드문드문 선명한 픽셀은 버린다: 둘레가 대부분 선명할 때만 남긴다.
  const vivid = new Uint8Array(n);
  {
    const sum = prefixSums(raw, width, height);
    const r = Math.max(2, Math.round(width / 100));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!raw[y * width + x]) continue;
        const [count, area] = inWindow(sum, width, height, x, y, r);
        if (count >= DENSE * area) vivid[y * width + x] = 1;
      }
    }
  }

  // 먼저 조금만 이어 붙여 가장 큰 덩어리를 찾는다. 틈이 없는 큐브는 이것으로 거의 다 잡힌다.
  const near = Math.max(1, Math.round(width / 160));
  let blob = largestBlob(vivid, width, height, near);
  // 칸 사이에 검은 틈이 있는 큐브는 칸들이 떨어져 있다. 칸 크기에 견주어 가까운 덩어리들은 같은 큐브로 묶는다.
  const far = Math.min(Math.round(width / 25), Math.round(0.3 * Math.sqrt(blob.size)));
  if (far > near) {
    const joined = largestBlob(vivid, width, height, far);
    // 여러 칸이 새로 붙어 크게 늘어났을 때만 받아들인다. 조금 늘어난 것은 큐브 옆의 다른 것(손 등)이 붙은 것이다.
    if (joined.size >= blob.size * 1.8) blob = joined;
  }
  // 너무 작으면 큐브가 아니다.
  if (blob.size < n / 3000) return null;
  return blob.mask;
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** 표시된 픽셀들을 감싸는 볼록 다각형 (꼭짓점이 한 방향으로 도는 순서) */
export function convexHull(mask: Uint8Array, width: number, height: number): Point[] {
  // 줄마다 맨 왼쪽과 맨 오른쪽 픽셀만 보면 된다.
  const points: Point[] = [];
  for (let y = 0; y < height; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left >= 0) {
      points.push({ x: left, y });
      if (right !== left) points.push({ x: right, y });
    }
  }
  if (points.length < 3) return [];
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** 두 직선(a1→a2, b1→b2)이 만나는 점. 나란하면 null */
function intersect(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/** 거의 일직선 위에 있는 꼭짓점을 없애 다각형을 단순하게 만든다 (둥근 모서리의 잔 변들이 정리된다). */
function simplify(hull: readonly Point[], tolerance: number): Point[] {
  const poly = hull.map((p) => ({ ...p }));
  for (;;) {
    let best = -1;
    let bestD = tolerance;
    for (let i = 0; i < poly.length && poly.length > 4; i++) {
      const a = poly[(i + poly.length - 1) % poly.length];
      const c = poly[(i + 1) % poly.length];
      const d = Math.abs(cross(a, c, poly[i])) / Math.max(1e-9, Math.hypot(c.x - a.x, c.y - a.y));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return poly;
    poly.splice(best, 1);
  }
}

/**
 * 볼록한 테두리를 감싸는, 변이 k개인 가장 작은 다각형을 찾는다.
 * 테두리의 변 가운데 k개를 골라 그 직선들이 만나는 점을 꼭짓점으로 삼는데, 모든 조합을 비교해 넓이가 가장 작은 것을 고른다.
 * 큐브의 진짜 변을 빼면 넓이가 크게 늘어나므로 진짜 변들이 남고, 흰색 칸 때문에 잘려 나간 모서리는 양옆 변이 만나며 복원된다.
 */
export function reduceToPolygon(hull: readonly Point[], k: number): Point[] | null {
  const size = Math.max(...hull.map((p) => p.x)) - Math.min(...hull.map((p) => p.x));
  let poly = simplify(hull, size * 0.012);
  // 변이 너무 많으면 조합 수가 커지므로 더 단순하게
  for (let t = 0.02; poly.length > 14; t += 0.01) poly = simplify(hull, size * t);
  const m = poly.length;
  if (m < k) return null;
  if (m === k) return poly;

  const edge = (i: number): [Point, Point] => [poly[i], poly[(i + 1) % m]];
  let best: Point[] | null = null;
  let bestArea = Infinity;
  const chosen: number[] = [];
  const pick = (from: number) => {
    if (chosen.length === k) {
      const vertices: Point[] = [];
      for (let j = 0; j < k; j++) {
        const [a1, a2] = edge(chosen[j]);
        const [b1, b2] = edge(chosen[(j + 1) % k]);
        const v = intersect(a1, a2, b1, b2);
        if (!v) return;
        // 만나는 점은 앞 변의 끝을 지나고 뒤 변의 시작보다 앞에 있어야 한다. 아니면 테두리를 감싸지 못한다.
        const ahead = (v.x - a2.x) * (a2.x - a1.x) + (v.y - a2.y) * (a2.y - a1.y);
        const before = (b1.x - v.x) * (b2.x - b1.x) + (b1.y - v.y) * (b2.y - b1.y);
        if (ahead < -1e-6 || before < -1e-6) return;
        vertices.push(v);
      }
      let area = 0;
      for (let j = 0; j < k; j++) {
        const p = vertices[j];
        const q = vertices[(j + 1) % k];
        area += p.x * q.y - q.x * p.y;
      }
      area = Math.abs(area) / 2;
      if (area < bestArea) {
        bestArea = area;
        best = vertices;
      }
      return;
    }
    for (let i = from; i <= m - (k - chosen.length); i++) {
      chosen.push(i);
      pick(i + 1);
      chosen.pop();
    }
  };
  pick(0);
  return best;
}

/** 사진에서 큐브의 겉 윤곽을 변이 k개인 다각형으로 찾는다. 못 찾으면 null */
export function findOutline(image: PixelSource, k: number): Point[] | null {
  const mask = cubeMask(image);
  if (!mask) return null;
  const hull = convexHull(mask, image.width, image.height);
  if (hull.length < k) return null;
  return reduceToPolygon(hull, k);
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 큐브가 그림의 어디에 있는지 (둘레에 여유를 둔 네모). 큐브가 없으면 null.
 * 큐브가 멀리 있어 작게 보일 때, 이 부분만 원본에서 크게 잘라 다시 보기 위해 쓴다.
 */
export function findCubeBox(image: PixelSource, margin = 0.3): Box | null {
  const mask = cubeMask(image);
  if (!mask) return null;
  let x0 = image.width;
  let y0 = image.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!mask[y * image.width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  // 흰색 칸은 표시에 없으므로 여유를 넉넉히 둔다. 정사각형으로 잡아 다시 볼 때 모양이 눌리지 않게 한다.
  const side = Math.max(x1 - x0, y1 - y0) * (1 + 2 * margin);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: cx - side / 2, y: cy - side / 2, width: side, height: side };
}
