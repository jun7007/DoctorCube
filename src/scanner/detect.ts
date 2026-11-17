/**
 * 사진에서 큐브를 찾아 칸마다 색을 읽는다.
 *
 * 1. 큐브의 겉 윤곽을 찾는다 (outline.ts): 한 면이면 사각형, 꼭짓점 쪽에서 보면 육각형.
 * 2. 꼭짓점 쪽 사진이면 세 면이 만나는 가운데 점을 찾아 면 세 개(사각형)로 나눈다.
 * 3. 각 면을 3×3으로 균등하게 나누고, 칸 안의 색이 가장 고르게 나오도록 꼭짓점을 조금씩 움직여 맞춘다.
 *    칸 사이에 틈이 없는 큐브도, 칸이 색 경계에 걸치지 않게 맞추면 제자리에 놓인다.
 * 4. 모든 칸의 색을 칸 가운데에서 읽는다.
 */
import { findOutline, type Point } from './outline';
import type { PixelSource, RGB } from './sample';

export type { Point } from './outline';

/** 큐브를 찾을 때 쓰는 그림의 가로 크기(픽셀). 화면(ScanView)과 시험이 같은 값을 쓴다. */
export const DETECT_WIDTH = 400;

// ───────── 사각형 안의 위치 ─────────

/** 단위 정사각형의 (u, v) → 사각형 안의 점. 원근이 있어도 맞도록 사영 변환을 쓴다. */
type Mapping = (u: number, v: number) => Point;

/** 네 꼭짓점 q0(0,0), q1(1,0), q2(1,1), q3(0,1)에 맞는 사영 변환 */
function quadMapping(q: readonly Point[]): Mapping {
  // 정사각형 → 사각형의 사영 변환은 닫힌 식으로 구할 수 있다.
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const dx1 = p1.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dx2 = p3.x - p2.x;
  const dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(den) < 1e-12 ? 0 : (sx * dy2 - dx2 * sy) / den;
  const h = Math.abs(den) < 1e-12 ? 0 : (dx1 * sy - sx * dy1) / den;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w };
  };
}

function pixel(image: PixelSource, p: Point): RGB | null {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];

/** 칸 안에서 색을 볼 자리들 (칸 크기를 1로 봤을 때의 위치). 가장자리는 이웃 칸이나 이음매가 섞이므로 피한다. */
const PROBES: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (const u of [0.26, 0.42, 0.58, 0.74]) for (const v of [0.26, 0.42, 0.58, 0.74]) out.push([u, v]);
  return out;
})();

/**
 * 한 면(사각형)을 3×3으로 나눴을 때 각 칸의 색과, 칸 안의 색이 얼마나 고르지 않은지.
 * 고르지 않은 정도는 칸 안의 점들이 칸의 대표 색에서 벗어난 정도다. 칸이 색 경계에 걸치면 커진다.
 */
function readQuad(image: PixelSource, quad: readonly Point[]): { colors: RGB[]; points: Point[]; rough: number } | null {
  const map = quadMapping(quad);
  const colors: RGB[] = [];
  const points: Point[] = [];
  let rough = 0;
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const r: number[] = [];
      const g: number[] = [];
      const b: number[] = [];
      for (const [u, v] of PROBES) {
        const c = pixel(image, map((i + u) / 3, (j + v) / 3));
        if (!c) return null;
        r.push(c[0]);
        g.push(c[1]);
        b.push(c[2]);
      }
      let color: RGB = [median([...r]), median([...g]), median([...b])];
      // 칸이 색 경계에 조금만 걸쳐도 드러나도록, 벗어난 정도는 평균으로 본다.
      const off = r.map((_, k) => Math.abs(r[k] - color[0]) + Math.abs(g[k] - color[1]) + Math.abs(b[k] - color[2]));
      rough += off.reduce((x, y) => x + y, 0) / off.length;
      // 면의 가운데 칸에는 로고가 있을 수 있다 (보통 흰색 센터에 있다). 흰 부분이 꽤 보이면 흰색 칸으로 읽는다.
      if (i === 1 && j === 1) {
        const white = r.map((_, k) => k).filter((k) => {
          const max = Math.max(r[k], g[k], b[k]);
          return max >= 120 && (max - Math.min(r[k], g[k], b[k])) / max < 0.22;
        });
        if (white.length >= r.length * 0.25 && white.length < r.length) {
          color = [median(white.map((k) => r[k])), median(white.map((k) => g[k])), median(white.map((k) => b[k]))];
        }
      }
      colors.push(color);
      points.push(map((i + 0.5) / 3, (j + 0.5) / 3));
    }
  }
  return { colors, points, rough: rough / 9 };
}

/** 칸들의 색이 이보다 고르지 않으면 큐브를 제대로 잡지 못한 것으로 본다 */
const MAX_ROUGH = 45;
/** 가장자리 한 줄을 더 내보낸 쪽을 고르려면 이만큼은 더 잘 맞아야 한다 (비슷하면 윤곽 그대로 둔다) */
const EXTEND_MARGIN = 1.5;

/** from에서 to 쪽으로 1.5배 늘인 점. 세 줄 가운데 두 줄만 보였을 때 가려진 한 줄을 되살린다. */
const stretch = (from: Point, to: Point): Point => ({ x: from.x + 1.5 * (to.x - from.x), y: from.y + 1.5 * (to.y - from.y) });

const size = (points: readonly Point[]) =>
  Math.max(
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  );

/**
 * 점들을 조금씩 움직여 score가 가장 작아지는 자리를 찾는다.
 * movable에 든 점만, 처음 자리에서 limit 안에서 움직인다.
 */
function refine(points: Point[], movable: readonly number[], limit: number, score: (p: readonly Point[]) => number): number {
  const start = points.map((p) => ({ ...p }));
  let best = score(points);
  for (const step of [limit / 2, limit / 4, limit / 8]) {
    for (let round = 0; round < 3; round++) {
      let improved = false;
      for (const k of movable) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const before = points[k];
          const moved = { x: before.x + dx * step, y: before.y + dy * step };
          if (Math.abs(moved.x - start[k].x) > limit || Math.abs(moved.y - start[k].y) > limit) continue;
          points[k] = moved;
          const s = score(points);
          if (s < best - 1e-9) {
            best = s;
            improved = true;
          } else {
            points[k] = before;
          }
        }
      }
      if (!improved) break;
    }
  }
  return best;
}

// ───────── 한 면 읽기 ─────────

export interface FaceReading {
  /** 화면에 보이는 대로 왼쪽 위 → 오른쪽 아래 9칸의 색 */
  colors: RGB[];
  /** 같은 순서의 칸 가운데 위치 */
  points: Point[];
  /** 찾아낸 면의 네 꼭짓점: 왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래 */
  outline: Point[];
  /** 칸 안의 색이 고르지 않은 정도 (작을수록 잘 맞은 것) */
  rough: number;
}

/** 한 면을 정면에서 찍은 사진을 읽는다. 큐브를 대체로 똑바로 들고 있다고 본다. */
export function readFace(image: PixelSource): FaceReading | null {
  const found = findOutline(image, 4);
  if (!found) return null;
  // 왼쪽 위 꼭짓점부터 시계 방향으로
  const cx = found.reduce((s, p) => s + p.x, 0) / 4;
  const cy = found.reduce((s, p) => s + p.y, 0) / 4;
  const around = [...found].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const first = around.reduce((best, p, i) => (p.x + p.y < around[best].x + around[best].y ? i : best), 0);
  const quad = [0, 1, 2, 3].map((i) => around[(first + i) % 4]);

  const score = (q: readonly Point[]) => readQuad(image, q)?.rough ?? Infinity;
  // 가장자리 한 줄이 모두 흰색이면 배경에 묻혀 윤곽에서 빠진다. 변마다 한 줄을 더 내보낸 경우도 견줘 본다.
  let chosen = quad;
  let chosenScore = score(quad);
  for (let mask = 1; mask < 16; mask++) {
    // 마주 보는 두 변을 함께 내보내면 다섯 줄이 되므로 그런 경우는 없다.
    if ((mask & 5) === 5 || (mask & 10) === 10) continue;
    // 변 e는 꼭짓점 e와 e+1을 잇는다. 그 변을 내보내려면 두 꼭짓점을 맞은편 변에서 멀어지게 옮긴다.
    const q = quad.map((p) => ({ ...p }));
    for (let e = 0; e < 4; e++) {
      if (!(mask & (1 << e))) continue;
      const a = e;
      const b = (e + 1) % 4;
      q[a] = stretch(q[(e + 3) % 4], q[a]);
      q[b] = stretch(q[(e + 2) % 4], q[b]);
    }
    const sc = score(q) + EXTEND_MARGIN * [1, 2, 4, 8].filter((bit) => mask & bit).length;
    if (sc < chosenScore) {
      chosenScore = sc;
      chosen = q;
    }
  }
  quad.splice(0, 4, ...chosen);
  refine(quad, [0, 1, 2, 3], size(quad) * 0.04, score);
  const read = readQuad(image, quad);
  if (!read || read.rough > MAX_ROUGH) return null;
  return { colors: read.colors, points: read.points, outline: quad, rough: read.rough };
}

// ───────── 꼭짓점 쪽에서 본 세 면 읽기 ─────────

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
  /** 찾아낸 면의 네 꼭짓점: 세 면이 만나는 점부터 차례로 */
  outline: Point[];
}

export interface CornerReading {
  faces: [CornerFace, CornerFace, CornerFace];
  /** 화면에서 faces[0] → [1] → [2]가 시계 방향인지 */
  clockwise: boolean;
  /** 칸 안의 색이 고르지 않은 정도 (작을수록 잘 맞은 것) */
  rough: number;
}

/**
 * 육각형의 꼭짓점 여섯(0~5)과 가운데 점(6)으로 세 면의 사각형을 만든다.
 * parity는 육각형의 어느 꼭짓점들이 가운데 점과 이어지는지(짝수 번째인지 홀수 번째인지)다.
 * 면 k = (가운데, h[2k+parity], h[2k+parity+1], h[2k+parity+2])
 */
function cornerQuads(points: readonly Point[], parity: number): Point[][] {
  return [0, 1, 2].map((k) => [
    points[6],
    points[(2 * k + parity) % 6],
    points[(2 * k + parity + 1) % 6],
    points[(2 * k + parity + 2) % 6],
  ]);
}

/** 꼭짓점이 카메라를 보게 든 사진에서 세 면을 읽는다. 어느 꼭짓점이든, 어느 쪽으로 기울였든 된다. */
export function readCorner(image: PixelSource): CornerReading | null {
  const hexagon = findOutline(image, 6);
  if (!hexagon) return null;
  const extent = size(hexagon);

  // 가운데 점의 자리와, 어느 꼭짓점들이 가운데와 이어지는지를 함께 찾는다.
  let best: { points: Point[]; parity: number; rough: number } | null = null;
  for (const parity of [0, 1]) {
    // 원근이 없다면 가운데 점은 이웃한 꼭짓점들로 정해진다: 면이 평행사변형이므로 c = p + r - q
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < 3; k++) {
      const p = hexagon[(2 * k + parity) % 6];
      const q = hexagon[(2 * k + parity + 1) % 6];
      const r = hexagon[(2 * k + parity + 2) % 6];
      cx += (p.x + r.x - q.x) / 3;
      cy += (p.y + r.y - q.y) / 3;
    }
    const roughOf = (points: readonly Point[]) => {
      let total = 0;
      for (const quad of cornerQuads(points, parity)) {
        const read = readQuad(image, quad);
        if (!read) return Infinity;
        total += read.rough;
      }
      return total / 3;
    };
    // 원근 때문에 실제 자리는 조금 다르다. 둘레를 훑어 가장 잘 맞는 자리를 고른다.
    const step = extent * 0.03;
    const search = (outline: readonly Point[]) => {
      let at: Point = { x: cx, y: cy };
      let value = Infinity;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const c = { x: cx + dx * step, y: cy + dy * step };
          const r = roughOf([...outline, c]);
          if (r < value) {
            value = r;
            at = c;
          }
        }
      }
      return { at, value };
    };
    let outline = hexagon.map((p) => ({ ...p }));
    let { at: start, value: startRough } = search(outline);
    // 면의 가장자리 한 줄이 모두 흰색이면 배경에 묻혀, 그 면의 바깥 꼭짓점이 한 줄만큼 안으로 들어와 있다.
    // 면마다 바깥 꼭짓점을 두 방향으로 한 줄씩 내보낸 경우를 견줘 보고, 확실히 더 잘 맞을 때만 받아들인다.
    for (let k = 0; k < 3; k++) {
      const pi = (2 * k + parity) % 6;
      const qi = (2 * k + parity + 1) % 6;
      const ri = (2 * k + parity + 2) % 6;
      for (const from of [pi, ri]) {
        const trial = outline.map((p) => ({ ...p }));
        trial[qi] = stretch(outline[from], outline[qi]);
        const r = roughOf([...trial, start]);
        if (r + EXTEND_MARGIN < startRough) {
          startRough = r;
          outline = trial;
        }
      }
    }
    // 윤곽의 꼭짓점도 조금 움직여 가며 다듬는다.
    const points = [...outline, start];
    const rough = refine(points, [6, 0, 1, 2, 3, 4, 5], extent * 0.035, roughOf);
    if (!best || rough < best.rough) best = { points, parity, rough };
  }
  if (!best || best.rough > MAX_ROUGH) return null;

  const quads = cornerQuads(best.points, best.parity);
  const faces: CornerFace[] = [];
  for (let k = 0; k < 3; k++) {
    const read = readQuad(image, quads[k]);
    if (!read) return null;
    // readQuad는 [줄 j][열 i] 순서로 돌려준다. 사각형의 (0,0)은 가운데 점, u는 앞 면과 맞닿은 모서리 쪽이다.
    const colors: RGB[][] = [[], [], []];
    const points: Point[][] = [[], [], []];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        colors[a].push(read.colors[b * 3 + a]);
        points[a].push(read.points[b * 3 + a]);
      }
    }
    // u 방향 모서리(가운데 → 첫 꼭짓점)는 앞 면과, v 방향 모서리(가운데 → 셋째 꼭짓점)는 다음 면과 맞닿아 있다.
    faces.push({ center: read.points[4], colors, points, alongA: (k + 2) % 3, alongB: (k + 1) % 3, outline: quads[k] });
  }
  const [c0, c1, c2] = faces.map((f) => f.center);
  const cross = (c1.x - c0.x) * (c2.y - c0.y) - (c1.y - c0.y) * (c2.x - c0.x);
  return { faces: faces as [CornerFace, CornerFace, CornerFace], clockwise: cross > 0, rough: best.rough };
}
