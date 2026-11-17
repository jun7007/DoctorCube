/// <reference types="node" />
/**
 * 큐브 자동 인식 시험. fixtures의 그림은 앱의 3D 큐브를 원근이 있는 여러 각도에서 렌더링한 것이다
 * (만드는 법: checks/gen-scan-fixtures.mjs). 실제 사진은 아니다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { assembleCorners } from './assemble';
import { classifyFaces } from './classify';
import { DETECT_WIDTH, findGrids, readCorner, readFace } from './detect';
import type { PixelSource } from './sample';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const index: { id: string; state: number[]; fov: number; faces: boolean }[] = JSON.parse(readFileSync(`${dir}index.json`, 'utf8'));

interface Options {
  /** 배경색 */
  background?: [number, number, number];
  /** 인식에 넣을 그림의 가로 크기 */
  width?: number;
  /** 90° 단위로 돌리기 */
  rotate?: 0 | 90 | 180 | 270;
  /** 밝기 배율 */
  brightness?: number;
  /** 흐리게 */
  blur?: number;
  /** 잡음의 크기 */
  noise?: number;
  /** 색 온도: 빨강과 파랑에 곱하는 값 */
  tint?: [number, number];
}

async function load(name: string, o: Options = {}): Promise<PixelSource> {
  const [r, g, b] = o.background ?? [236, 236, 232];
  let img = sharp(`${dir}${name}`).flatten({ background: { r, g, b } });
  if (o.rotate) img = img.rotate(o.rotate);
  img = img.resize({ width: o.width ?? DETECT_WIDTH });
  if (o.blur) img = img.blur(o.blur);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data);
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let i = 0; i < pixels.length; i += 4) {
    const k = o.brightness ?? 1;
    const n = o.noise ?? 0;
    pixels[i] = pixels[i] * k * (o.tint?.[0] ?? 1) + rand() * 2 * n;
    pixels[i + 1] = pixels[i + 1] * k + rand() * 2 * n;
    pixels[i + 2] = pixels[i + 2] * k * (o.tint?.[1] ?? 1) + rand() * 2 * n;
  }
  return { data: pixels, width: info.width, height: info.height };
}

/** 두 장을 읽어 합친 결과가 정답과 같은지 */
async function solveCube(id: string, o: Options = {}): Promise<'ok' | 'not-found' | 'wrong'> {
  const a = readCorner(await load(`${id}-a.png`, o));
  const b = readCorner(await load(`${id}-b.png`, o));
  if (!a || !b) return 'not-found';
  const truth = index.find((c) => c.id === id)!.state;
  return assembleCorners(a, b).state.join() === truth.join() ? 'ok' : 'wrong';
}

describe('꼭짓점 쪽에서 찍은 사진 인식', { timeout: 60000 }, () => {
  it('스티커 27개와 3×3 면 세 개를 찾는다 (원근이 약한 것부터 강한 것까지)', async () => {
    for (const cube of index) {
      for (const shot of ['a', 'b']) {
        const image = await load(`${cube.id}-${shot}.png`);
        const grids = findGrids(image);
        expect(grids.length, `${cube.id}-${shot} (화각 ${cube.fov}°)`).toBeGreaterThanOrEqual(3);
        // 조각으로 직접 찾지 못한 칸(밝은 배경에 묻힌 흰 스티커 등)은 면마다 많아야 셋
        for (const g of grids.slice(0, 3)) expect(g.cells.flat().filter((c) => !c.found).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('두 장을 합치면 54칸이 모두 정답과 같다', async () => {
    for (const cube of index) expect(await solveCube(cube.id), `${cube.id} (화각 ${cube.fov}°)`).toBe('ok');
  });

  it('사진을 어느 쪽으로 돌려 찍어도 된다', async () => {
    for (const rotate of [90, 180, 270] as const) {
      for (const cube of index) expect(await solveCube(cube.id, { rotate }), `${cube.id} ${rotate}°`).toBe('ok');
    }
  });

  it('배경색, 그림 크기가 달라도 된다', async () => {
    const variants: Options[] = [
      { background: [30, 32, 40] },
      { background: [205, 180, 150] },
      { background: [90, 120, 170] },
      { width: 300 },
      { width: 520 },
    ];
    for (const o of variants) {
      for (const cube of index) expect(await solveCube(cube.id, o), `${cube.id} ${JSON.stringify(o)}`).toBe('ok');
    }
  });

  it('어둡거나, 흐리거나, 잡음이 있거나, 조명 색이 달라도 대부분 된다', async () => {
    const variants: Options[] = [
      { brightness: 0.7 },
      { blur: 0.8 },
      { noise: 5 },
      { tint: [1.12, 0.88] },
      { tint: [0.9, 1.1], brightness: 0.85, noise: 3 },
      { blur: 0.6, noise: 4, brightness: 0.8, background: [120, 110, 100] },
    ];
    const tally = { ok: 0, 'not-found': 0, wrong: 0 };
    for (const o of variants) for (const cube of index) tally[await solveCube(cube.id, o)]++;
    const total = variants.length * index.length;
    console.log(`거친 조건 ${total}번: 성공 ${tally.ok}, 큐브를 못 찾음 ${tally['not-found']}, 틀리게 읽음 ${tally.wrong}`);
    expect(tally.ok / total).toBeGreaterThanOrEqual(0.8);
  });

  it('큐브가 없는 그림에서는 찾지 못했다고 한다', async () => {
    const blank: PixelSource = { data: new Uint8ClampedArray(320 * 240 * 4).fill(200), width: 320, height: 240 };
    expect(readCorner(blank)).toBeNull();
    // 한 면만 보이는 사진도 세 면으로는 읽히지 않는다
    expect(readCorner(await load('cube0-face-F.png'))).toBeNull();
  });

  it('같은 꼭짓점을 두 번 찍으면 풀 수 없는 상태로 나온다', async () => {
    const a = readCorner(await load('cube0-a.png'))!;
    const result = assembleCorners(a, a);
    expect(result.check.ok).toBe(false);
  });
});

describe('한 면씩 찍은 사진 인식', { timeout: 60000 }, () => {
  it('여섯 면을 읽어 합치면 정답과 같다', async () => {
    for (const cube of index.filter((c) => c.faces)) {
      const faces = [];
      for (const name of ['U', 'R', 'F', 'D', 'L', 'B']) {
        const reading = readFace(await load(`${cube.id}-face-${name}.png`));
        expect(reading, `${cube.id} ${name}`).not.toBeNull();
        faces.push(reading!.colors);
      }
      expect(classifyFaces(faces).state.join(), cube.id).toBe(cube.state.join());
    }
  });
});
