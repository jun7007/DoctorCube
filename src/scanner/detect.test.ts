/// <reference types="node" />
/**
 * 큐브 인식 시험.
 * - 실제 사진: 프로젝트의 photos 폴더에 있을 때만 돌린다 (개인 사진이라 저장소에는 올리지 않는다).
 * - 렌더링 그림: fixtures의 그림은 앱의 3D 큐브를 원근이 있는 여러 각도에서 그린 것이다 (checks/gen-scan-fixtures.mjs).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { assembleCorners } from './assemble';
import { guessColor } from './classify';
import { DETECT_WIDTH, readCorner, readFace } from './detect';
import { findCubeBox } from './outline';
import type { PixelSource } from './sample';

const NAMES = 'WRGYOB';
const names = (colors: readonly (readonly [number, number, number])[]) => colors.map((c) => NAMES[guessColor(c)]).join('');

// ───────── 실제 사진 ─────────

const photos = fileURLToPath(new URL('../../photos/', import.meta.url));
const hasPhotos = existsSync(photos) && readdirSync(photos).some((f) => f.endsWith('.jpg'));

/** 사진을 앱이 쓰는 크기로 줄인다. */
async function photo(name: string): Promise<PixelSource> {
  const { data, info } = await sharp(`${photos}${name}`).rotate().resize({ width: DETECT_WIDTH }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/** 폰 카메라 영상의 가로 크기 (세로로 든 720p) */
const VIDEO_WIDTH = 720;

/**
 * 화면(ScanView)이 하는 것처럼 두 단계로 본다: 줄인 그림에서 큐브가 있는 곳을 찾고,
 * 그 부분만 영상에서 잘라 인식에 쓰는 크기로 맞춘다. shrink < 1이면 큐브가 더 멀리 있는 것처럼 여백을 둔다.
 */
async function zoomed(name: string, shrink: number): Promise<PixelSource | null> {
  const upright = await sharp(`${photos}${name}`).rotate().toBuffer({ resolveWithObject: true });
  const pad = (v: number) => Math.round((v / shrink - v) / 2);
  // sharp는 적은 순서와 상관없이 크기를 먼저 바꾸므로, 여백을 붙인 뒤 따로 줄인다.
  const padded = await sharp(upright.data)
    .extend({ top: pad(upright.info.height), bottom: pad(upright.info.height), left: pad(upright.info.width), right: pad(upright.info.width), background: '#e8e6e2' })
    .toBuffer();
  const video = await sharp(padded).resize({ width: VIDEO_WIDTH }).toBuffer({ resolveWithObject: true });
  const small = await sharp(video.data).resize({ width: DETECT_WIDTH }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = findCubeBox({ data: new Uint8ClampedArray(small.data), width: small.info.width, height: small.info.height });
  if (!box) return null;
  const k = VIDEO_WIDTH / DETECT_WIDTH;
  const left = Math.max(0, Math.round(box.x * k));
  const top = Math.max(0, Math.round(box.y * k));
  const width = Math.min(video.info.width - left, Math.round(box.width * k));
  const height = Math.min(video.info.height - top, Math.round(box.height * k));
  const crop = await sharp(video.data).extract({ left, top, width, height }).toBuffer();
  const { data, info } = await sharp(crop).resize({ width: DETECT_WIDTH }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

describe.skipIf(!hasPhotos)('실제 사진 (틈이 없는 큐브, 흰 이불 배경, 손)', { timeout: 120000 }, () => {
  // 눈으로 읽은 색: 왼쪽 위 → 오른쪽 아래
  const FACES: Record<string, string> = {
    '20261117_232328.jpg': 'BWGGRGGBR',
    '20261117_232333.jpg': 'OORYWOGGO', // 가운데는 로고가 있는 흰색
    '20261117_232337.jpg': 'BBBYORBWG',
  };
  const CORNERS = ['20261117_232256.jpg', '20261117_232305.jpg', '20261117_232314.jpg', '20261117_232321.jpg'];

  it('정면 사진: 아홉 칸의 색을 맞게 읽는다', async () => {
    for (const [name, expected] of Object.entries(FACES)) {
      const reading = readFace(await photo(name));
      expect(reading, name).not.toBeNull();
      expect(names(reading!.colors), name).toBe(expected);
    }
  });

  it('정면 사진: 큐브가 더 멀리 있어도 읽는다 (큐브가 있는 곳을 찾아 크게 잘라서 봄)', async () => {
    for (const [name, expected] of Object.entries(FACES)) {
      // 절반 크기(화면 너비의 1/7쯤)에서는 한 장이 실패한다. 거기까지는 아직 안 된다.
      for (const shrink of [1, 0.7]) {
        const image = await zoomed(name, shrink);
        expect(image, `${name} ×${shrink}`).not.toBeNull();
        const reading = readFace(image!);
        expect(reading, `${name} ×${shrink}`).not.toBeNull();
        expect(names(reading!.colors), `${name} ×${shrink}`).toBe(expected);
      }
    }
  });

  it('꼭짓점 쪽 사진: 세 면을 찾고, 같은 큐브를 찍은 사진들은 똑같이 읽힌다', async () => {
    const read: string[] = [];
    for (const name of CORNERS) {
      const reading = readCorner(await photo(name));
      expect(reading, name).not.toBeNull();
      read.push(reading!.faces.map((f) => names(f.colors.flat())).join(' '));
    }
    // 앞의 세 장은 같은 큐브를 같은 꼭짓점 쪽에서 찍은 것이다 (거리와 배경만 다르다).
    expect(read[1]).toBe(read[0]);
    expect(read[2]).toBe(read[0]);
    // 각 면의 가운데 칸은 서로 다른 색이고, 마주 보는 색(흰-노, 빨-주, 초-파)이 함께 나오지 않는다.
    for (const faces of read) {
      const centers = faces.split(' ').map((f) => NAMES.indexOf(f[4]));
      expect(new Set(centers).size).toBe(3);
      expect(new Set(centers.map((c) => c % 3)).size).toBe(3);
    }
  });

  it('꼭짓점 쪽 사진: 큐브가 더 멀리 있어도 같은 결과', async () => {
    for (const name of CORNERS) {
      const near = readCorner(await photo(name));
      for (const shrink of [1, 0.6, 0.4]) {
        const image = await zoomed(name, shrink);
        expect(image, `${name} ×${shrink}`).not.toBeNull();
        const far = readCorner(image!);
        expect(far, `${name} ×${shrink}`).not.toBeNull();
        expect(far!.faces.map((f) => names(f.colors.flat())).join(' '), `${name} ×${shrink}`).toBe(
          near!.faces.map((f) => names(f.colors.flat())).join(' '),
        );
      }
    }
  });
});

// ───────── 렌더링 그림 ─────────

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const index: { id: string; state: number[]; fov: number; faces: boolean }[] = JSON.parse(readFileSync(`${dir}index.json`, 'utf8'));

interface Options {
  background?: [number, number, number];
  width?: number;
  rotate?: 0 | 90 | 180 | 270;
  brightness?: number;
}

async function load(name: string, o: Options = {}): Promise<PixelSource> {
  const [r, g, b] = o.background ?? [150, 152, 158];
  let img = sharp(`${dir}${name}`).flatten({ background: { r, g, b } });
  if (o.rotate) img = img.rotate(o.rotate);
  const { data, info } = await img.resize({ width: o.width ?? DETECT_WIDTH }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data);
  if (o.brightness) for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) pixels[i + c] *= o.brightness;
  return { data: pixels, width: info.width, height: info.height };
}

async function solveCube(id: string, o: Options = {}): Promise<'ok' | 'not-found' | 'wrong'> {
  const a = readCorner(await load(`${id}-a.png`, o));
  const b = readCorner(await load(`${id}-b.png`, o));
  if (!a || !b) return 'not-found';
  const truth = index.find((c) => c.id === id)!.state;
  return assembleCorners(a, b).state.join() === truth.join() ? 'ok' : 'wrong';
}

describe('렌더링 그림 (틈이 있는 큐브)', { timeout: 120000 }, () => {
  it('꼭짓점 쪽 두 장을 합치면 54칸이 정답과 같다 (원근이 약한 것부터 강한 것까지)', async () => {
    const tally = { ok: 0, 'not-found': 0, wrong: 0 };
    for (const cube of index) tally[await solveCube(cube.id)]++;
    console.log(`렌더링 ${index.length}개: 성공 ${tally.ok}, 못 찾음 ${tally['not-found']}, 틀림 ${tally.wrong}`);
    // 원근이 아주 강하고 가장자리 두 줄이 모두 흰색인 그림 두 개는 아직 틀린다.
    expect(tally.ok).toBeGreaterThanOrEqual(4);
  });

  it('사진을 돌리거나 배경·크기·밝기가 달라도 대부분 된다', async () => {
    const variants: Options[] = [
      { rotate: 90 },
      { rotate: 180 },
      { background: [40, 42, 50] },
      { background: [236, 236, 232] },
      { width: 300 },
      { brightness: 0.75 },
    ];
    const tally = { ok: 0, 'not-found': 0, wrong: 0 };
    for (const o of variants) for (const cube of index) tally[await solveCube(cube.id, o)]++;
    const total = variants.length * index.length;
    console.log(`렌더링 변형 ${total}번: 성공 ${tally.ok}, 못 찾음 ${tally['not-found']}, 틀림 ${tally.wrong}`);
    expect(tally.ok / total).toBeGreaterThanOrEqual(0.6);
  });

  it('한 면을 정면에서 본 그림: 아홉 칸을 맞게 읽는다', async () => {
    // 위·아래에서 본 그림은 옆면까지 비스듬히 보이는 각도로 만들어져 있어 빼고, 옆면 네 장으로 본다.
    for (const cube of index.filter((c) => c.faces)) {
      for (const [face, name] of [[1, 'R'], [2, 'F'], [4, 'L'], [5, 'B']] as const) {
        const reading = readFace(await load(`${cube.id}-face-${name}.png`));
        expect(reading, `${cube.id} ${name}`).not.toBeNull();
        expect(names(reading!.colors), `${cube.id} ${name}`).toBe(
          cube.state.slice(face * 9, face * 9 + 9).map((c) => NAMES[c]).join(''),
        );
      }
    }
  });

  it('큐브가 없는 그림에서는 찾지 못했다고 한다', () => {
    const blank: PixelSource = { data: new Uint8ClampedArray(320 * 240 * 4).fill(200), width: 320, height: 240 };
    expect(readCorner(blank)).toBeNull();
    expect(readFace(blank)).toBeNull();
  });
});

describe('자유롭게 찍기: 사진 한 장씩 큐브에 올려 놓기', { timeout: 120000 }, () => {
  it('렌더링 그림: 한 장만으로 어느 세 면인지 알고, 칸의 색이 정답과 같다', async () => {
    const { placeCorner } = await import('./assemble');
    let placed = 0;
    let wrongCells = 0;
    for (const cube of index) {
      for (const shot of ['a', 'b']) {
        const reading = readCorner(await load(`${cube.id}-${shot}.png`));
        const p = reading && placeCorner(reading);
        if (!p) continue;
        placed++;
        expect(new Set(p.faces.map((f) => f % 3)).size).toBe(3);
        for (const cell of p.cells) if (guessColor(cell.rgb) !== cube.state[cell.index]) wrongCells++;
      }
    }
    console.log(`한 장씩 올려 놓기: ${index.length * 2}장 중 ${placed}장, 틀린 칸 ${wrongCells}개`);
    expect(placed).toBeGreaterThanOrEqual(10);
    // 원근이 아주 강한 그림에서 틀리는 칸이 있다 (전체 54칸 맞추기 시험과 같은 그림들).
    expect(wrongCells).toBeLessThanOrEqual(40);
  });

  it('렌더링 그림: 두 장으로 여섯 면이 모두 채워지고, 합친 결과가 예전 방식과 같다', async () => {
    const { placeCorner, finishScan } = await import('./assemble');
    for (const cube of index) {
      const a = readCorner(await load(`${cube.id}-a.png`));
      const b = readCorner(await load(`${cube.id}-b.png`));
      const pa = a && placeCorner(a);
      const pb = b && placeCorner(b);
      if (!a || !b || !pa || !pb) continue;
      const colors = new Array<[number, number, number] | null>(54).fill(null);
      for (const cell of [...pa.cells, ...pb.cells]) colors[cell.index] = [...cell.rgb] as [number, number, number];
      expect(colors.every((c) => c !== null), cube.id).toBe(true);
      expect(new Set([...pa.faces, ...pb.faces]).size, cube.id).toBe(6);
      expect(finishScan(colors).state.join(), cube.id).toBe(assembleCorners(a, b).state.join());
    }
  });
});

describe.skipIf(!hasPhotos)('자유롭게 찍기: 실제 사진', { timeout: 120000 }, () => {
  it('꼭짓점 쪽 사진 한 장만으로 어느 세 면인지 정해진다', async () => {
    const { placeCorner } = await import('./assemble');
    const faces: string[] = [];
    for (const name of ['20261117_232256.jpg', '20261117_232305.jpg', '20261117_232314.jpg', '20261117_232321.jpg']) {
      const reading = readCorner(await photo(name));
      const p = reading && placeCorner(reading);
      expect(p, name).not.toBeNull();
      faces.push([...p!.faces].sort().map((f) => NAMES[f]).join(''));
    }
    console.log('사진별 세 면:', faces.join(' / '));
    expect(faces[1]).toBe(faces[0]);
    expect(faces[2]).toBe(faces[0]);
  });
});
