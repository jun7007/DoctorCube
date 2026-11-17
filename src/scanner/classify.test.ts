import { describe, expect, it } from 'vitest';
import { FACELETS, SOLVED } from '../core/cube';
import { STICKER_COLORS } from '../render/colors';
import { randomState, validateState } from '../solvers/kociemba';
import { classifyBalanced, classifyFaces, guessColor } from './classify';
import type { RGB } from './sample';

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

// ───────────────────────── 가짜 카메라 ─────────────────────────

/** 실제 큐브 스티커를 찍었을 때 나올 법한 색 (화면용 색보다 주황이 빨강에 가깝다) */
const PHYSICAL: readonly RGB[] = [
  [228, 228, 222], // 흰색
  [190, 28, 38], // 빨강
  [0, 155, 72], // 초록
  [222, 214, 40], // 노랑
  [240, 92, 22], // 주황
  [0, 68, 175], // 파랑
];

interface Camera {
  /** 전체 밝기 (선형 빛에 곱한다) */
  brightness: readonly [number, number];
  /** 색온도: R과 B를 반대 방향으로 ±이만큼 */
  temperature: number;
  /** 면마다 다른 밝기 */
  face: readonly [number, number];
  /** 한 면 안에서 밝기가 비스듬히 변하는 정도 (±) */
  gradient: number;
  gamma: readonly [number, number];
  /** 칸마다 채널별 잡음의 표준편차 (0~255 기준) */
  noise: number;
  /** 면마다 따로 흔들리는 색온도 (사진마다 자동 화이트밸런스가 달라지는 경우) */
  faceTemperature?: number;
  /** 칸의 15%에 이 비율까지 흰 반사광을 섞는다 */
  glare?: number;
}

const MILD: Camera = { brightness: [0.85, 1.1], temperature: 0.05, face: [0.92, 1.05], gradient: 0.03, gamma: [0.95, 1.05], noise: 2 };
const MODERATE: Camera = { brightness: [0.65, 1.2], temperature: 0.12, face: [0.8, 1.1], gradient: 0.06, gamma: [0.9, 1.1], noise: 4 };
const HARSH: Camera = { brightness: [0.5, 1.3], temperature: 0.2, face: [0.7, 1.15], gradient: 0.1, gamma: [0.8, 1.25], noise: 6 };
/** 요구 범위를 넘는 조건. 색만으로는 자주 틀리므로 조각 단위 보정의 효과를 재는 데 쓴다. */
const EXTREME: Camera = {
  brightness: [0.4, 1.4],
  temperature: 0.25,
  face: [0.55, 1.25],
  gradient: 0.2,
  gamma: [0.7, 1.4],
  noise: 10,
  faceTemperature: 0.06,
  glare: 0.35,
};

const toLinear = (v: number) => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
};

/** 색 하나를 주어진 조명으로 찍는다. gain은 선형 빛에 곱하는 채널별 값 */
function expose(nominal: RGB, gain: readonly [number, number, number], gamma = 1, glare = 0): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] = 255 * toSrgb((toLinear(nominal[k]) * (1 - glare) + glare) * gain[k]) ** gamma;
  }
  return out;
}

const clamp8 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** 상태를 여섯 면의 사진(면마다 9칸의 색)으로 바꾼다. palette는 색 번호 → 스티커 색 */
function photograph(state: readonly number[], cam: Camera, random: () => number, palette = PHYSICAL): RGB[][] {
  const between = ([lo, hi]: readonly [number, number]) => lo + (hi - lo) * random();
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const brightness = between(cam.brightness);
  const temp = (random() * 2 - 1) * cam.temperature;
  const gamma = between(cam.gamma);
  const faces: RGB[][] = [];
  for (let f = 0; f < 6; f++) {
    const faceGain = between(cam.face);
    const angle = random() * 2 * Math.PI;
    const amount = random() * cam.gradient;
    const faceTemp = (random() * 2 - 1) * (cam.faceTemperature ?? 0);
    const face: RGB[] = [];
    for (let i = 0; i < 9; i++) {
      const dx = (i % 3) - 1;
      const dy = Math.floor(i / 3) - 1;
      const grad = 1 + (amount * (dx * Math.cos(angle) + dy * Math.sin(angle))) / Math.SQRT2;
      const gain = brightness * faceGain * grad;
      const glare = cam.glare && random() < 0.15 ? random() * cam.glare : 0;
      const clean = expose(
        palette[state[f * 9 + i]],
        [gain * (1 + temp) * (1 + faceTemp), gain, gain * (1 - temp) * (1 - faceTemp)],
        gamma,
        glare,
      );
      face.push([clamp8(clean[0] + gauss() * cam.noise), clamp8(clean[1] + gauss() * cam.noise), clamp8(clean[2] + gauss() * cam.noise)]);
    }
    faces.push(face);
  }
  return faces;
}

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((c, i) => c === b[i]);

interface Rates {
  count: number;
  /** 조각 단위 보정까지 한 결과가 정확히 맞은 횟수 */
  repaired: number;
  /** 색 수만 맞춘 결과가 정확히 맞은 횟수 */
  balanced: number;
  /** 틀렸는데 만들 수 있는 큐브라고 나온 횟수 (보정 있음 / 없음) */
  wrongValid: number;
  balancedWrongValid: number;
  /** 한 번 부르는 데 걸린 시간 (ms) */
  average: number;
  worst: number;
}

function measure(cam: Camera, seed: number, count: number): Rates {
  const random = rng(seed);
  const r: Rates = { count, repaired: 0, balanced: 0, wrongValid: 0, balancedWrongValid: 0, average: 0, worst: 0 };
  for (let i = 0; i < count; i++) {
    const truth = randomState(random);
    const faces = photograph(truth, cam, random);
    const start = performance.now();
    const full = classifyFaces(faces);
    const took = performance.now() - start;
    r.average += took / count;
    r.worst = Math.max(r.worst, took);
    const plain = classifyBalanced(faces);
    if (same(full.state, truth)) r.repaired++;
    else if (full.check.ok) r.wrongValid++;
    if (same(plain.state, truth)) r.balanced++;
    else if (plain.check.ok) r.balancedWrongValid++;
  }
  return r;
}

const percent = (hits: number, count: number) => `${((hits / count) * 100).toFixed(1)}%`;
const describeRates = (name: string, r: Rates) =>
  `${name}: 보정 ${percent(r.repaired, r.count)} (틀린 채 통과 ${r.wrongValid}) · 색 수만 ${percent(r.balanced, r.count)} (틀린 채 통과 ${r.balancedWrongValid}) · 평균 ${r.average.toFixed(2)}ms, 최대 ${r.worst.toFixed(1)}ms`;

// ───────────────────────── 시험 ─────────────────────────

describe('classifyFaces', () => {
  it('조명이 달라져도 무작위 상태를 그대로 읽어 낸다 (각 300개)', () => {
    const mild = measure(MILD, 11, 300);
    const moderate = measure(MODERATE, 12, 300);
    const harsh = measure(HARSH, 13, 300);
    console.log([describeRates('약함', mild), describeRates('보통', moderate), describeRates('심함', harsh)].join('\n'));
    expect(mild.repaired).toBe(300);
    expect(moderate.repaired).toBeGreaterThanOrEqual(297);
    // 심한 조건은 값을 적어 두기만 하되, 크게 무너지면 알 수 있게 한다.
    expect(harsh.repaired).toBeGreaterThanOrEqual(270);
    expect(mild.wrongValid + moderate.wrongValid).toBe(0);
  });

  it('화면용 색으로 칠한 큐브도 읽는다', () => {
    const palette = STICKER_COLORS.map((hex): RGB => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number]);
    const random = rng(31);
    for (let i = 0; i < 100; i++) {
      const truth = randomState(random);
      const result = classifyFaces(photograph(truth, MODERATE, random, palette));
      expect(same(result.state, truth), `#${i}`).toBe(true);
      expect(result.check.ok).toBe(true);
    }
  });

  it('조각 단위 보정을 하면 더 잘 맞는다 (나빠지지 않는다)', () => {
    const harsh = measure(HARSH, 13, 300);
    const extreme = measure(EXTREME, 22, 300);
    console.log([describeRates('심함', harsh), describeRates('극한 (요구 범위 밖: 반사광 + 면마다 다른 색온도)', extreme)].join('\n'));
    expect(harsh.repaired).toBeGreaterThanOrEqual(harsh.balanced);
    // 심한 조건까지는 색만으로 다 맞아서 차이가 나지 않는다. 차이는 극한 조건에서 드러난다.
    expect(extreme.repaired).toBeGreaterThan(extreme.balanced + 30);
  });

  it('깨끗한 사진은 모든 칸의 확신도가 높고, 센터는 1이다', () => {
    const random = rng(41);
    const truth = randomState(random);
    const result = classifyFaces(photograph(truth, MILD, random));
    expect(result.state).toEqual([...truth]);
    expect(result.check).toEqual({ ok: true });
    expect(result.confidence).toHaveLength(54);
    for (let f = 0; f < 6; f++) expect(result.confidence[f * 9 + 4]).toBe(1);
    for (const c of result.confidence) {
      expect(c).toBeGreaterThan(0.6);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('빨강과 주황이 서로 다른 조각에서 뒤바뀌어 찍혀도 바로잡는다', () => {
    const random = rng(51);
    const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const noise: Camera = { brightness: [1, 1], temperature: 0, face: [1, 1], gradient: 0, gamma: [1, 1], noise: 2 };
    const outer = Array.from({ length: 54 }, (_, i) => i).filter((i) => i % 9 !== 4);
    for (let n = 0; n < 60; n++) {
      const truth = randomState(random);
      const faces = photograph(truth, noise, random);
      // 빨간 칸 하나와, 다른 조각의 주황 칸 하나
      const reds = outer.filter((i) => truth[i] === 1);
      const red = reds[Math.floor(random() * reds.length)];
      const oranges = outer.filter((i) => truth[i] === 4 && FACELETS[i].pos.join() !== FACELETS[red].pos.join());
      const orange = oranges[Math.floor(random() * oranges.length)];
      // 둘 다 상대 색 쪽으로 조금 더 가깝게 찍힌다 (색 수는 그대로라 색 수 맞추기로는 못 잡는다).
      faces[Math.floor(red / 9)][red % 9] = mix(PHYSICAL[1], PHYSICAL[4], 0.6);
      faces[Math.floor(orange / 9)][orange % 9] = mix(PHYSICAL[4], PHYSICAL[1], 0.6);

      const plain = classifyBalanced(faces);
      expect(plain.state[red], `#${n} 색 수만`).toBe(4);
      expect(plain.state[orange], `#${n} 색 수만`).toBe(1);
      expect(plain.check.ok).toBe(false);

      const result = classifyFaces(faces);
      expect(same(result.state, truth), `#${n}`).toBe(true);
      expect(result.check.ok).toBe(true);
      // 고쳐 놓은 두 칸이 가장 미심쩍은 칸으로 표시된다.
      const doubtful = outer.filter((i) => result.confidence[i] < 0.2);
      expect(doubtful.sort((a, b) => a - b)).toEqual([red, orange].sort((a, b) => a - b));
    }
  });

  it('여섯 면이 모두 같은 색이면 오류 없이 "만들 수 없는 상태"라고 알려 준다', () => {
    for (const color of [[228, 228, 222], [190, 28, 38], [0, 0, 0], [255, 255, 255]] as const) {
      const faces = Array.from({ length: 6 }, () => Array.from({ length: 9 }, (): RGB => color));
      const result = classifyFaces(faces);
      expect(result.state).toHaveLength(54);
      expect(result.confidence).toHaveLength(54);
      expect(result.state.every((c) => Number.isInteger(c) && c >= 0 && c <= 5)).toBe(true);
      expect(result.check.ok).toBe(false);
      expect(result.check).toEqual(validateState(result.state));
    }
  });

  it('같은 면을 두 번 찍으면 (두 센터의 색이 같으면) 거의 언제나 통과시키지 않는다', () => {
    const random = rng(61);
    let passed = 0;
    for (let i = 0; i < 200; i++) {
      // F면 차례에 R면을 다시 찍은 것처럼: 초록이 있어야 할 칸이 모두 빨갛게 보인다.
      const truth = randomState(random).map((c) => (c === 2 ? 1 : c));
      if (classifyFaces(photograph(truth, MODERATE, random)).check.ok) passed++;
    }
    console.log(`같은 면을 두 번 찍은 200번 가운데 통과: ${passed}번`);
    expect(passed).toBeLessThanOrEqual(30);
  });

  it('이상한 입력에도 오류를 내지 않는다', () => {
    const broken: unknown[] = [
      [],
      [[], [], [], [], [], []],
      Array.from({ length: 6 }, () => Array.from({ length: 9 }, () => [NaN, Infinity, -5])),
      Array.from({ length: 4 }, () => Array.from({ length: 9 }, () => [10, 20, 30])),
      Array.from({ length: 6 }, (_, f) => Array.from({ length: 9 }, (_, i) => [f * 40, i * 25, 999])),
    ];
    for (const faces of broken) {
      const result = classifyFaces(faces as RGB[][]);
      expect(result.state).toHaveLength(54);
      expect(result.confidence).toHaveLength(54);
      expect(result.confidence.every((c) => c >= 0 && c <= 1)).toBe(true);
      expect(result.check).toEqual(validateState(result.state));
    }
    // 무작위 색: 무엇이 나오든 형식은 지킨다.
    const random = rng(71);
    for (let n = 0; n < 50; n++) {
      const faces = Array.from({ length: 6 }, () =>
        Array.from({ length: 9 }, (): RGB => [random() * 255, random() * 255, random() * 255]),
      );
      const result = classifyFaces(faces);
      expect(result.state).toHaveLength(54);
      expect(result.check).toEqual(validateState(result.state));
    }
  });

  it('완성된 큐브를 읽는다', () => {
    const faces = photograph(SOLVED, MODERATE, rng(81));
    expect(classifyFaces(faces).state).toEqual([...SOLVED]);
  });

  it('300번 부르는 데 9초가 안 걸린다', () => {
    const random = rng(91);
    const scans = Array.from({ length: 300 }, (_, i) => photograph(randomState(random), i % 2 ? EXTREME : HARSH, random));
    const start = performance.now();
    for (const faces of scans) classifyFaces(faces);
    const took = performance.now() - start;
    console.log(`classifyFaces 300번: ${took.toFixed(0)}ms (한 번에 ${(took / 300).toFixed(2)}ms)`);
    expect(took).toBeLessThan(9000);
  });
});

describe('guessColor', () => {
  const screen = STICKER_COLORS.map((hex): RGB => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number]);

  it('기준 색을 알아본다 (실제 스티커 색 · 화면용 색)', () => {
    for (let c = 0; c < 6; c++) {
      expect(guessColor(PHYSICAL[c]), `실제 ${c}`).toBe(c);
      expect(guessColor(screen[c]), `화면 ${c}`).toBe(c);
    }
  });

  it('조금 어둡거나 누렇거나 푸르스름한 조명에서도 알아본다', () => {
    const lights: [string, readonly [number, number, number], number][] = [
      ['어두움', [0.55, 0.55, 0.55], 1],
      ['밝음', [1.2, 1.2, 1.2], 1],
      ['따뜻함', [1.12, 1, 0.88], 1],
      ['차가움', [0.88, 1, 1.12], 1],
      ['어둡고 따뜻함', [0.75, 0.66, 0.58], 1.1],
      ['어둡고 차가움', [0.6, 0.68, 0.76], 0.9],
    ];
    for (const [name, gain, gamma] of lights) {
      for (let c = 0; c < 6; c++) {
        expect(guessColor(expose(PHYSICAL[c], gain, gamma)), `${name} · 실제 ${c}`).toBe(c);
        expect(guessColor(expose(screen[c], gain, gamma)), `${name} · 화면 ${c}`).toBe(c);
      }
    }
  });

  it('검은색이나 잘못된 값에도 0~5를 돌려준다', () => {
    for (const rgb of [[0, 0, 0], [255, 255, 255], [NaN, 1, 2], [300, -20, 5]] as const) {
      const c = guessColor(rgb);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(5);
    }
  });
});
