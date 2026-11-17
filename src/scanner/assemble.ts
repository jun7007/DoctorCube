/**
 * 꼭짓점 쪽에서 찍은 두 장(서로 반대쪽 꼭짓점)을 합쳐 큐브 54칸을 만든다.
 *
 * 사진만으로는 어느 면이 어느 색 면인지 모르므로, 가능한 경우를 모두 맞춰 보고 가장 그럴듯한 것을 고른다.
 * 세 면이 화면에서 도는 방향(시계/반시계)이 실제 큐브의 꼭짓점과 맞아야 하기 때문에,
 * 헷갈리기 쉬운 빨강·주황, 흰색·노랑도 자리 관계로 구분된다.
 */
import { faceletIndex, type Vec3 } from '../core/cube';
import { classifyFaces, guessColor, type ScanResult } from './classify';
import type { CornerReading } from './detect';
import type { RGB } from './sample';

/** 면 번호(U R F D L B) → 바깥 방향 */
const NORMAL: readonly Vec3[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];
const opposite = (face: number) => (face + 3) % 6;

function det(a: Vec3, b: Vec3, c: Vec3): number {
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

/**
 * 사진의 세 면이 큐브의 어느 면인지에 대한 가능한 배정들.
 * 세 면은 서로 이웃해야 하고, 화면에서 도는 방향이 실제와 같아야 한다.
 * (화면에서 시계 방향으로 놓인 세 면의 바깥 방향은 행렬식이 -1이다.)
 */
function assignments(reading: CornerReading, allowed?: ReadonlySet<number>): [number, number, number][] {
  const want = reading.clockwise ? -1 : 1;
  const out: [number, number, number][] = [];
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      for (let c = 0; c < 6; c++) {
        if (allowed && !(allowed.has(a) && allowed.has(b) && allowed.has(c))) continue;
        if (det(NORMAL[a], NORMAL[b], NORMAL[c]) === want) out.push([a, b, c]);
      }
    }
  }
  return out;
}

/** 한 장의 색을 54칸 배열에 채운다. faces[k]는 사진의 k번째 면이 큐브의 어느 면인지. */
function fill(colors: (RGB | null)[], reading: CornerReading, faces: readonly number[]): void {
  reading.faces.forEach((face, k) => {
    const x = NORMAL[faces[k]];
    const y = NORMAL[faces[face.alongA]];
    const z = NORMAL[faces[face.alongB]];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        // a는 Y와 맞닿은 모서리를 따라(Z에서 멀어짐), b는 Z와 맞닿은 모서리를 따라(Y에서 멀어짐)
        const pos: Vec3 = [
          x[0] + (1 - a) * z[0] + (1 - b) * y[0],
          x[1] + (1 - a) * z[1] + (1 - b) * y[1],
          x[2] + (1 - a) * z[2] + (1 - b) * y[2],
        ];
        const index = faceletIndex(pos, x);
        if (index !== undefined) colors[index] = face.colors[a][b];
      }
    }
  });
}

export interface Assembled extends ScanResult {
  /** 여섯 센터 중 색이 기대와 맞아 보이는 개수. 6이 아니면 두 장이 반대쪽 꼭짓점이 아닐 수 있다 */
  centersMatched: number;
}

/** 서로 반대쪽 꼭짓점에서 찍은 두 장을 합친다. */
export function assembleCorners(first: CornerReading, second: CornerReading): Assembled {
  let best: Assembled | null = null;
  let bestScore = -Infinity;
  for (const one of assignments(first)) {
    const rest = new Set(one.map(opposite));
    for (const two of assignments(second, rest)) {
      const colors = new Array<RGB | null>(54).fill(null);
      fill(colors, first, one);
      fill(colors, second, two);
      if (colors.some((c) => c === null)) continue;
      const matched = [0, 1, 2, 3, 4, 5].filter((f) => guessColor(colors[f * 9 + 4]!) === f).length;
      // 센터 색이 거의 맞는 경우만 자세히 본다.
      if (matched < 4 || matched + 1 < bestScore) continue;
      const result = classifyFaces([0, 1, 2, 3, 4, 5].map((f) => colors.slice(f * 9, f * 9 + 9) as RGB[]));
      const confidence = result.confidence.reduce((a, b) => a + b, 0) / 54;
      const score = matched + (result.check.ok ? 1 : 0) + confidence * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = { ...result, centersMatched: matched };
      }
    }
  }
  if (best) return best;
  // 맞는 배정이 없으면 (같은 꼭짓점을 두 번 찍었을 때 등) 풀 수 없는 상태로 돌려준다.
  const empty = classifyFaces([0, 1, 2, 3, 4, 5].map(() => new Array<RGB>(9).fill([0, 0, 0])));
  return { ...empty, centersMatched: 0 };
}

/** 한 장에 보이는 세 센터의 어림 색 (두 번째 장이 반대쪽인지 미리 알려 줄 때 쓴다) */
export function centerColors(reading: CornerReading): number[] {
  return reading.faces.map((face) => guessColor(face.colors[1][1]));
}

// ───────── 자유롭게 찍기: 사진 한 장씩 큐브에 올려 놓기 ─────────

/** 사진 한 장(세 면)이 큐브의 어느 면들인지와, 그 27칸의 색 */
export interface PlacedCorner {
  /** 사진의 세 면이 큐브의 어느 면인지 (면 번호 = 센터 색 번호) */
  faces: [number, number, number];
  cells: { index: number; rgb: RGB }[];
}

/**
 * 꼭짓점 쪽에서 찍은 사진 한 장을 큐브의 칸 번호에 올려 놓는다.
 * 세 센터의 색과 화면에서 도는 방향만으로 어느 꼭짓점인지 정해지므로, 다른 사진이 없어도 된다.
 * 센터 색을 알아볼 수 없으면 null.
 */
export function placeCorner(reading: CornerReading): PlacedCorner | null {
  const seen = centerColors(reading);
  let best: [number, number, number] | null = null;
  let bestMatched = 0;
  let ties = 0;
  for (const faces of assignments(reading)) {
    const matched = faces.filter((f, k) => f === seen[k]).length;
    if (matched > bestMatched) {
      bestMatched = matched;
      best = faces;
      ties = 1;
    } else if (matched === bestMatched) {
      ties++;
    }
  }
  // 세 센터가 모두 맞거나, 둘이 맞고 나머지 하나가 자리 관계로 정해질 때만 받아들인다.
  if (!best || bestMatched < 2 || (bestMatched === 2 && ties > 1)) return null;
  const colors = new Array<RGB | null>(54).fill(null);
  fill(colors, reading, best);
  const cells: { index: number; rgb: RGB }[] = [];
  colors.forEach((rgb, index) => {
    if (rgb) cells.push({ index, rgb });
  });
  return cells.length === 27 ? { faces: best, cells } : null;
}

/** 54칸이 모두 채워졌을 때 색을 분류해 큐브 상태를 만든다. */
export function finishScan(colors: readonly (RGB | null)[]): ScanResult {
  return classifyFaces([0, 1, 2, 3, 4, 5].map((f) => colors.slice(f * 9, f * 9 + 9).map((c) => c ?? ([0, 0, 0] as const))));
}
