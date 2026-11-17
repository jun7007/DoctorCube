import { describe, expect, it } from 'vitest';
import { sampleGrid, type GridRegion, type PixelSource, type RGB } from './sample';

/** 재현 가능한 난수 */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS: readonly RGB[] = [
  [228, 228, 222],
  [190, 28, 38],
  [0, 155, 72],
  [222, 214, 40],
  [240, 92, 22],
  [0, 68, 175],
  [120, 40, 200],
  [30, 200, 210],
  [90, 90, 90],
];
const BACKGROUND: RGB = [40, 35, 30];
const BLACK: RGB = [0, 0, 0];

function makeImage(width: number, height: number, pixel: (x: number, y: number) => RGB): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

/**
 * 큐브 한 면을 그린다. grid: 면이 놓인 자리, border: 칸 한 변에서 스티커 바깥 검은 테두리가 차지하는 비율 (한쪽).
 */
function drawFace(width: number, height: number, grid: GridRegion, border = 0, colors = COLORS): PixelSource {
  const cell = grid.size / 3;
  return makeImage(width, height, (x, y) => {
    const u = (x + 0.5 - grid.x) / cell;
    const v = (y + 0.5 - grid.y) / cell;
    if (u < 0 || u >= 3 || v < 0 || v >= 3) return BACKGROUND;
    const inCell = (t: number) => t - Math.floor(t) >= border && t - Math.floor(t) < 1 - border;
    return inCell(u) && inCell(v) ? colors[Math.floor(v) * 3 + Math.floor(u)] : BLACK;
  });
}

const FACE: GridRegion = { x: 60, y: 60, size: 300 };

describe('sampleGrid', () => {
  it('딱 맞는 3×3 격자의 색을 그대로 읽는다', () => {
    const image = drawFace(300, 300, { x: 0, y: 0, size: 300 });
    expect(sampleGrid(image, { x: 0, y: 0, size: 300 })).toEqual(COLORS);
    // 그림 안쪽의 일부를 가리키는 경우
    expect(sampleGrid(drawFace(420, 420, FACE), FACE)).toEqual(COLORS);
  });

  it('칸 사이의 검은 테두리는 무시한다', () => {
    for (const border of [0.05, 0.12, 0.2]) {
      expect(sampleGrid(drawFace(420, 420, FACE, border), FACE), `테두리 ${border}`).toEqual(COLORS);
    }
  });

  it('안내선이 10% 밀리거나 10% 크고 작아도 같은 색을 읽는다', () => {
    const image = drawFace(420, 420, FACE);
    const bordered = drawFace(420, 420, FACE, 0.08);
    const center = FACE.x + FACE.size / 2;
    for (const scale of [0.9, 1, 1.1]) {
      const size = FACE.size * scale;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        // 안내선 전체 크기의 10%를 한 방향으로 (칸 크기의 30%)
        if (dx === 0 || dy === 0) {
          const region = { x: center - size / 2 + dx * 30, y: center - size / 2 + dy * 30, size };
          expect(sampleGrid(image, region), `×${scale} (${dx}, ${dy}) 안내선의 10%`).toEqual(COLORS);
        }
        // 칸 크기의 10%를 (대각선으로도), 검은 테두리가 있는 면에서
        const region = { x: center - size / 2 + dx * 10, y: center - size / 2 + dy * 10, size };
        expect(sampleGrid(bordered, region), `×${scale} (${dx}, ${dy}) 칸의 10%`).toEqual(COLORS);
      }
    }
  });

  it('칸에서 보는 부분의 30%까지 번쩍이는 반사광이 덮어도 결과가 거의 그대로다', () => {
    const random = rng(3);
    // 스티커 표면의 자잘한 얼룩 (±4)
    const speckle = Array.from({ length: 420 * 420 }, () => Math.round((random() * 2 - 1) * 4));
    const clean = drawFace(420, 420, FACE, 0.08);
    const textured = makeImage(420, 420, (x, y) => {
      const at = (y * 420 + x) * 4;
      const d = speckle[y * 420 + x];
      return [clean.data[at] + d, clean.data[at + 1] + d, clean.data[at + 2] + d];
    });
    const before = sampleGrid(textured, FACE);

    // 가운데 칸에서 보는 부분: 한 변 40픽셀 (190~230). 그 넓이의 30% = 480픽셀.
    const blobs: [string, (x: number, y: number) => boolean][] = [
      ['가운데 동그라미', (x, y) => (x - 209.5) ** 2 + (y - 209.5) ** 2 <= 480 / Math.PI],
      ['왼쪽 띠', (x, y) => x >= 190 && x < 202 && y >= 190 && y < 230],
      ['아래쪽 띠', (x, y) => y >= 218 && y < 230 && x >= 190 && x < 230],
      ['모서리 네모', (x, y) => x >= 208 && x < 230 && y >= 208 && y < 230],
      ['가운데 가로줄', (x, y) => y >= 204 && y < 216 && x >= 190 && x < 230],
    ];
    for (const [name, inside] of blobs) {
      let covered = 0;
      const glared = makeImage(420, 420, (x, y) => {
        if (inside(x, y)) {
          if (x >= 190 && x < 230 && y >= 190 && y < 230) covered++;
          return [255, 255, 255];
        }
        const at = (y * 420 + x) * 4;
        return [textured.data[at], textured.data[at + 1], textured.data[at + 2]];
      });
      // 덮은 넓이가 25~31%인지 확인
      expect(covered / 1600, name).toBeGreaterThan(0.25);
      expect(covered / 1600, name).toBeLessThanOrEqual(0.31);
      const after = sampleGrid(glared, FACE);
      for (let i = 0; i < 9; i++) {
        for (let k = 0; k < 3; k++) expect(Math.abs(after[i][k] - before[i][k]), `${name} 칸 ${i}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('튀는 픽셀 몇 개로는 결과가 달라지지 않는다', () => {
    const random = rng(9);
    const clean = drawFace(300, 300, { x: 0, y: 0, size: 300 });
    const dirty = makeImage(300, 300, (x, y) => {
      if (random() < 0.08) return [random() * 255, random() * 255, random() * 255];
      const at = (y * 300 + x) * 4;
      return [clean.data[at], clean.data[at + 1], clean.data[at + 2]];
    });
    expect(sampleGrid(dirty, { x: 0, y: 0, size: 300 })).toEqual(COLORS);
  });

  it('영역이 그림 밖으로 나가도 오류 없이, 보이는 부분으로 읽는다', () => {
    // 면의 오른쪽·아래쪽이 잘린 그림
    const cropped = drawFace(250, 250, { x: 0, y: 0, size: 300 });
    expect(sampleGrid(cropped, { x: 0, y: 0, size: 300 })).toEqual(COLORS);
    // 면이 왼쪽 위로 삐져나간 그림
    const shifted = drawFace(260, 260, { x: -40, y: -40, size: 300 });
    expect(sampleGrid(shifted, { x: -40, y: -40, size: 300 })).toEqual(COLORS);

    // 통째로 밖이거나 값이 이상해도 9칸을 돌려준다.
    const image = drawFace(100, 100, { x: 0, y: 0, size: 100 });
    for (const region of [
      { x: 500, y: 500, size: 300 },
      { x: -900, y: 0, size: 300 },
      { x: 0, y: 0, size: 0 },
      { x: 0, y: 0, size: -30 },
      { x: NaN, y: 0, size: 100 },
      { x: 10.4, y: 20.7, size: 33.3 },
    ]) {
      const out = sampleGrid(image, region);
      expect(out).toHaveLength(9);
      for (const rgb of out) {
        expect(rgb).toHaveLength(3);
        for (const v of rgb) expect(v >= 0 && v <= 255).toBe(true);
      }
    }
    expect(sampleGrid({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, { x: 0, y: 0, size: 300 })).toHaveLength(9);
  });

  it('inner로 보는 범위를 바꿀 수 있다', () => {
    // 스티커가 칸의 가운데 30%만 차지하는 면: 기본값(0.4)으로는 테두리가 섞여도 중앙값이 버티지만, 0.8로는 못 읽는다.
    const tiny = drawFace(300, 300, { x: 0, y: 0, size: 300 }, 0.35);
    expect(sampleGrid(tiny, { x: 0, y: 0, size: 300 }, 0.2)).toEqual(COLORS);
    expect(sampleGrid(tiny, { x: 0, y: 0, size: 300 }, 0.8)).toEqual(Array.from({ length: 9 }, () => BLACK));
  });

  it('미리보기에 쓸 만큼 빠르다 (400×400 영역 200번)', () => {
    const image = drawFace(640, 480, { x: 120, y: 40, size: 400 }, 0.06);
    const region = { x: 120, y: 40, size: 400 };
    const start = performance.now();
    for (let i = 0; i < 200; i++) sampleGrid(image, region);
    const took = performance.now() - start;
    console.log(`sampleGrid 200번: ${took.toFixed(1)}ms (한 번에 ${(took / 200).toFixed(3)}ms)`);
    expect(took).toBeLessThan(1000);
  });
});
