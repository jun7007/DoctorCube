import { describe, expect, it } from 'vitest';
import { SOLVED, applyMoves } from '../core/cube';
import { parseAlg } from '../core/notation';
import { generateScramble } from '../core/scramble';
import { CORNER_CELLS, CORNER_SHOTS, sampleCornerCells } from './corner';

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 점이 볼록 사각형 안에 있는지 */
function inside(p: { x: number; y: number }, quad: { x: number; y: number }[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

describe('모서리에서 찍기: 칸의 위치', () => {
  it('27칸이고 칸 번호는 위·오른쪽 앞·왼쪽 앞 면의 번호와 같다', () => {
    expect(CORNER_CELLS).toHaveLength(27);
    const slots = CORNER_CELLS.map((c) => c.slot).sort((a, b) => a - b);
    expect(slots).toEqual(Array.from({ length: 27 }, (_, i) => i));
  });

  it('모든 칸이 정육각형(한 변 1) 안에 있고, 가운데는 자기 칸 안에만 있다', () => {
    for (const cell of CORNER_CELLS) {
      for (const p of [cell.center, ...cell.outline]) {
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(Math.sqrt(3) / 2 + 1e-9);
      }
      expect(inside(cell.center, cell.outline)).toBe(true);
      for (const other of CORNER_CELLS) {
        if (other !== cell) expect(inside(cell.center, other.outline)).toBe(false);
      }
    }
  });

  it('윗면은 위쪽, 앞면은 왼쪽 아래, 오른쪽 면은 오른쪽 아래에 보인다', () => {
    const center = (slot: number) => CORNER_CELLS.find((c) => c.slot === slot)!.center;
    // 세 면의 센터
    expect(center(4).y).toBeLessThan(0);
    expect(Math.abs(center(4).x)).toBeLessThan(1e-9);
    expect(center(22).x).toBeLessThan(0);
    expect(center(22).y).toBeGreaterThan(0);
    expect(center(13).x).toBeGreaterThan(0);
    expect(center(13).y).toBeGreaterThan(0);
    // 세 면이 만나는 꼭짓점 쪽 칸(위 8, 앞 20, 오른쪽 9)이 육각형 가운데에 가장 가깝다
    const dist = (slot: number) => Math.hypot(center(slot).x, center(slot).y);
    for (const [near, face] of [
      [8, 0],
      [20, 18],
      [9, 9],
    ]) {
      for (let i = 0; i < 9; i++) if (face + i !== near) expect(dist(near)).toBeLessThan(dist(face + i));
    }
    // 윗면에서 열이 커지면 화면 오른쪽 아래로, 앞면에서 행이 커지면 아래로
    expect(center(2).x).toBeGreaterThan(center(0).x);
    expect(center(24).y).toBeGreaterThan(center(18).y);
    // 오른쪽 면의 첫 열은 앞쪽(화면 가운데 쪽)
    expect(center(9).x).toBeLessThan(center(11).x);
  });
});

describe('모서리에서 찍기: 두 장으로 여섯 면', () => {
  it('두 방향의 센터 색', () => {
    expect(CORNER_SHOTS.map((s) => s.centers)).toEqual([
      [0, 2, 1],
      [3, 4, 5],
    ]);
  });

  it('두 장이 54칸을 겹치지 않고 모두 덮는다', () => {
    const covered = CORNER_SHOTS.flatMap((shot) => CORNER_CELLS.map((cell) => shot.map[cell.slot]));
    expect(new Set(covered).size).toBe(54);
  });

  it('첫 장은 기본 방향 그대로다', () => {
    for (const cell of CORNER_CELLS) expect(CORNER_SHOTS[0].map[cell.slot]).toBe(cell.slot);
  });

  it('두 번째 장은 큐브를 통째로 돌려 잡은 것과 같다', () => {
    // 노란색 위, 주황색 왼쪽 앞, 파란색 오른쪽 앞이 되는 돌리기를 엔진으로 직접 해 본다.
    const turned = applyMoves(SOLVED, parseAlg("x2 y'"));
    expect([turned[4], turned[22], turned[13]]).toEqual([3, 4, 5]);
  });

  it('무작위 큐브를 두 장으로 찍어 합치면 원래 상태가 나온다', () => {
    const random = rng(4);
    for (let n = 0; n < 200; n++) {
      const state = applyMoves(SOLVED, generateScramble(25, random));
      const rebuilt = new Array<number>(54).fill(-1);
      // 첫 장: 그대로 본다
      for (const cell of CORNER_CELLS) rebuilt[CORNER_SHOTS[0].map[cell.slot]] = state[cell.slot];
      // 두 번째 장: 큐브를 돌려 잡은 뒤 같은 세 자리(위, 앞, 오른쪽)를 본다
      const turned = applyMoves(state, parseAlg("x2 y'"));
      for (const cell of CORNER_CELLS) rebuilt[CORNER_SHOTS[1].map[cell.slot]] = turned[cell.slot];
      expect(rebuilt).toEqual([...state]);
    }
  });
});

describe('모서리에서 찍기: 색 읽기', () => {
  const SIZE = 300;
  /** 칸마다 다른 색으로 칠한 그림을 만든다. shrink < 1이면 칸을 줄여 사이에 검은 테두리를 둔다. */
  function render(colorOf: (slot: number) => [number, number, number], shrink = 1, offset = { x: 0, y: 0 }, scale = 1) {
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);
    const half = SIZE / 2;
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const p = { x: ((px - half) / half - offset.x) / scale, y: ((py - half) / half - offset.y) / scale };
        let rgb: [number, number, number] = [20, 20, 24];
        for (const cell of CORNER_CELLS) {
          const quad = cell.outline.map((q) => ({
            x: cell.center.x + (q.x - cell.center.x) * shrink,
            y: cell.center.y + (q.y - cell.center.y) * shrink,
          }));
          if (inside(p, quad)) {
            rgb = colorOf(cell.slot);
            break;
          }
        }
        const i = (py * SIZE + px) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
      }
    }
    return { data, width: SIZE, height: SIZE };
  }
  const colorOf = (slot: number): [number, number, number] => [40 + slot * 7, 250 - slot * 8, (slot * 53) % 256];
  const expected = CORNER_CELLS.map((c) => colorOf(c.slot));

  it('정확히 맞춘 그림에서 27칸을 모두 읽는다', () => {
    expect(sampleCornerCells(render(colorOf))).toEqual(expected);
  });

  it('칸 사이에 검은 테두리가 있어도 읽는다', () => {
    expect(sampleCornerCells(render(colorOf, 0.8))).toEqual(expected);
  });

  it('조금 어긋나거나 크기가 달라도 읽는다 (한 변의 4% 이동, 크기 ±6%)', () => {
    for (const offset of [
      { x: 0.04, y: 0 },
      { x: -0.03, y: 0.03 },
      { x: 0, y: -0.04 },
    ]) {
      expect(sampleCornerCells(render(colorOf, 0.85, offset))).toEqual(expected);
    }
    for (const scale of [0.94, 1.06]) expect(sampleCornerCells(render(colorOf, 0.85, { x: 0, y: 0 }, scale))).toEqual(expected);
  });

  it('많이 어긋나면 틀리게 읽는다 (맞춰야 하는 정도를 기록해 둔다)', () => {
    const read = sampleCornerCells(render(colorOf, 0.85, { x: 0.2, y: 0.1 }));
    const wrong = read.filter((c, i) => c.join() !== expected[i].join()).length;
    expect(wrong).toBeGreaterThan(0);
  });
});
