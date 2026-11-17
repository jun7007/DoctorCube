/**
 * 카메라 화면에서 3×3 격자 각 칸의 대표 색을 뽑는다 (화면과 무관한 순수 로직).
 * 초당 여러 번 불리므로 칸마다 정해진 개수의 픽셀만 띄엄띄엄 본다.
 */

/** 0~255 */
export type RGB = readonly [number, number, number];

/** RGBA가 줄 단위로 이어진 픽셀 (ImageData와 같은 모양) */
export interface PixelSource {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** 화면의 정사각 안내선 (픽셀 단위) */
export interface GridRegion {
  x: number;
  y: number;
  size: number;
}

/** 한 칸에서 가로·세로로 최대 몇 개씩 볼지 (13 × 13 = 169픽셀) */
const MAX_PER_AXIS = 13;

/** 구간 [from, to]에서 고르게 띄운 정수 좌표들. 그림 밖은 잘라 낸다. */
function axisSamples(from: number, to: number, limit: number): number[] {
  const lo = Math.max(0, Math.ceil(from));
  const hi = Math.min(limit - 1, Math.floor(to));
  if (!(hi >= lo)) return [];
  const count = Math.min(MAX_PER_AXIS, hi - lo + 1);
  if (count === 1) return [Math.round((lo + hi) / 2)];
  const out: number[] = [];
  for (let k = 0; k < count; k++) out.push(Math.round(lo + ((hi - lo) * k) / (count - 1)));
  return out;
}

/** 0~255 값들의 중앙값 (개수 세기 방식) */
function median(hist: Uint16Array, count: number): number {
  // 짝수 개면 가운데 두 값의 평균
  const lowAt = (count - 1) >> 1;
  const highAt = count >> 1;
  let seen = 0;
  let low = -1;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (low < 0 && seen > lowAt) low = v;
    if (seen > highAt) return (low + v) / 2;
  }
  return 0;
}

/**
 * 3×3 격자 각 칸의 대표 색 9개 (왼쪽 위 → 오른쪽 아래). 칸 가운데 부분만 본다.
 *
 * 대표 색은 채널별 중앙값이다. 번쩍이는 반사광이나 칸 사이 검은 테두리가 표본에 섞여도
 * 절반을 넘지 않으면 결과가 그대로다. 평균은 조금만 섞여도 끌려가고, 양 끝을 잘라 낸 평균은
 * 잘라 낸 비율보다 많이 섞이면 다시 끌려가므로 중앙값을 골랐다.
 *
 * @param inner 칸 한 변에서 가운데 얼마만큼을 볼지 (기본 0.4). 스티커가 칸을 꽉 채우지 않고
 *              안내선도 정확히 맞지 않으므로 가장자리는 버린다.
 */
export function sampleGrid(image: PixelSource, region: GridRegion, inner = 0.4): RGB[] {
  const { data, width, height } = image;
  const cell = region.size / 3;
  const frac = Number.isFinite(inner) ? Math.min(1, Math.max(0.02, inner)) : 0.4;
  const half = (cell * frac) / 2;
  const hist = [new Uint16Array(256), new Uint16Array(256), new Uint16Array(256)];
  const out: RGB[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // 픽셀 (px, py)는 [px, px + 1) 구간을 덮으므로 가운데 좌표에서 0.5를 뺀다.
      const cx = region.x + (c + 0.5) * cell - 0.5;
      const cy = region.y + (r + 0.5) * cell - 0.5;
      const xs = axisSamples(cx - half, cx + half, width);
      const ys = axisSamples(cy - half, cy + half, height);
      const count = xs.length * ys.length;
      // 칸이 통째로 그림 밖이면 검은색
      if (count === 0 || !(cell > 0)) {
        out.push([0, 0, 0]);
        continue;
      }
      for (const h of hist) h.fill(0);
      for (const py of ys) {
        for (const px of xs) {
          const at = (py * width + px) * 4;
          hist[0][data[at]]++;
          hist[1][data[at + 1]]++;
          hist[2][data[at + 2]]++;
        }
      }
      out.push([median(hist[0], count), median(hist[1], count), median(hist[2], count)]);
    }
  }
  return out;
}
