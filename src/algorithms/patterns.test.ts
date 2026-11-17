import { describe, expect, it } from 'vitest';
import { FACELETS, SOLVED, applyMoves, isSolved, type CubeState } from '../core/cube';
import { parseAlg } from '../core/notation';
import { homeOf } from '../core/pieces';
import { PATTERNS, patternOrder, patternState } from './patterns';

/*
 * 면 번호와 색 번호는 U R F D L B = 0~5 (흰색, 빨강, 초록, 노랑, 주황, 파랑).
 * 한 면의 9칸은 0 1 2 / 3 4 5 / 6 7 8 순서다. 4가 센터, 0·2·6·8이 코너 칸, 1·3·5·7이 엣지 칸.
 */
const FACE_IDS = [0, 1, 2, 3, 4, 5] as const;
const SIDES = [1, 2, 4, 5] as const; // R F L B
const CENTER = 4;
const CORNER_CELLS = [0, 2, 6, 8] as const;
const EDGE_CELLS = [1, 3, 5, 7] as const;
const OTHER_CELLS = [0, 1, 2, 3, 5, 6, 7, 8] as const;
/** 코너 칸과 맞닿은 엣지 칸 둘 */
const NEAR: Readonly<Record<number, readonly [number, number]>> = { 0: [1, 3], 2: [1, 5], 6: [3, 7], 8: [5, 7] };

const opposite = (f: number) => (f + 3) % 6;
const cell = (s: CubeState, f: number, k: number) => s[f * 9 + k];
const cells = (s: CubeState, f: number, ks: readonly number[]) => ks.map((k) => cell(s, f, k));
/** 모두 같은 색이면 그 색, 아니면 -1 */
const single = (colors: readonly number[]) => (colors.every((c) => c === colors[0]) ? colors[0] : -1);
const colorCount = (s: CubeState, f: number) => new Set(cells(s, f, [0, 1, 2, 3, 4, 5, 6, 7, 8])).size;
const rest = (ks: readonly number[]) => [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((k) => !ks.includes(k));
/** 그 면에서 자기 색(센터와 같은 색)인 칸들 */
const ownCells = (s: CubeState, f: number) => [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((k) => cell(s, f, k) === f);
const faceUniform = (s: CubeState, f: number) => single(cells(s, f, [0, 1, 2, 3, 4, 5, 6, 7, 8])) === f;

/** 면 → 색 대응이 순열일 때, 순환 길이를 작은 것부터 늘어놓은 것. 순열이 아니면 null */
function cycles(map: readonly number[]): number[] | null {
  if ([...map].sort().join() !== '0,1,2,3,4,5') return null;
  const seen = new Set<number>();
  const out: number[] = [];
  for (const start of FACE_IDS) {
    let length = 0;
    for (let f: number = start; !seen.has(f); f = map[f]) {
      seen.add(f);
      length++;
    }
    if (length) out.push(length);
  }
  return out.sort((a, b) => a - b);
}

/** 칸이 붙은 조각 (같은 조각의 칸끼리 같은 값) */
const cubieOf = (index: number) => FACELETS[index].pos.join();
const kindOf = (index: number) => FACELETS[index].pos.filter((v) => v !== 0).length; // 1 센터, 2 엣지, 3 코너
/** 엣지 칸의 짝: 같은 엣지 조각의 다른 쪽 칸 */
const partner = (index: number) => FACELETS.findIndex((f, j) => j !== index && f.pos.join() === cubieOf(index));

const key = (s: CubeState) => s.join('');
const ROTATIONS = ['', 'x', "x'", 'x2', 'z', "z'"].flatMap((a) => ['', 'y', "y'", 'y2'].map((b) => parseAlg(`${a} ${b}`)));

const byId = new Map(PATTERNS.map((p) => [p.id, p]));
const stateOf = (id: string): CubeState => {
  const p = byId.get(id);
  if (!p) throw new Error(`없는 패턴: ${id}`);
  return patternState(p);
};

/** 공식을 몇 번 되풀이해야 완성 상태로 돌아오는지 (patternOrder와 따로 센다) */
function orderOf(alg: string): number {
  const moves = parseAlg(alg);
  let s: CubeState = SOLVED;
  for (let n = 1; n <= 1260; n++) {
    s = applyMoves(s, moves);
    if (key(s) === key(SOLVED)) return n;
  }
  return 0;
}

/** 측정한 차수. 체커보드 2, 슈퍼플립 2, 여섯 개의 점 3, 큐브 속 큐브 3 등은 널리 알려진 값이다. */
const ORDERS: Readonly<Record<string, number>> = {
  'pattern-checkerboard': 2,
  'pattern-six-spots': 3,
  'pattern-four-spots': 2,
  'pattern-zigzag': 2,
  'pattern-crosses': 3,
  'pattern-six-ts': 6,
  'pattern-stripes': 2,
  'pattern-checkerboard-3': 3,
  'pattern-tricolor': 3,
  'pattern-cube-in-cube': 3,
  'pattern-cube-in-cube-in-cube': 3,
  'pattern-snake': 3,
  'pattern-rings': 3,
  'pattern-superflip': 2,
};

describe('패턴 갤러리: 공통', () => {
  it('10~14개이고 id, 이름이 겹치지 않으며 글이 채워져 있다', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(10);
    expect(PATTERNS.length).toBeLessThanOrEqual(14);
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
    expect(new Set(PATTERNS.map((p) => p.name)).size).toBe(PATTERNS.length);
    for (const p of PATTERNS) {
      expect(p.id, p.id).toMatch(/^pattern-[a-z0-9-]+$/);
      expect(p.name.trim().length, p.id).toBeGreaterThan(0);
      // 해요체 한 문장
      expect(p.note, p.id).toMatch(/요\.$/);
      expect(p.note.split('.').length - 1, p.id).toBe(1);
    }
  });

  it('공식을 읽을 수 있고, 결과는 완성 상태가 아니며, 큐브를 잡은 방향(센터)은 그대로다', () => {
    for (const p of PATTERNS) {
      const moves = parseAlg(p.alg);
      expect(moves.length, p.id).toBeGreaterThan(0);
      expect(moves.length, p.id).toBeLessThanOrEqual(30);
      const s = patternState(p);
      expect(key(s), p.id).toBe(key(applyMoves(SOLVED, moves)));
      expect(isSolved(s), p.id).toBe(false);
      for (const f of FACE_IDS) expect(cell(s, f, CENTER), `${p.id} 센터 ${f}`).toBe(f);
      // 색마다 9칸
      for (const f of FACE_IDS) expect(s.filter((c) => c === f).length, p.id).toBe(9);
    }
  });

  it('결과 상태가 모두 서로 다르다 (큐브를 통째로 돌려 봐도 겹치지 않는다)', () => {
    const seen = new Map<string, string>();
    for (const p of PATTERNS) {
      const s = patternState(p);
      for (const rotation of ROTATIONS) {
        const k = key(applyMoves(s, rotation));
        const other = seen.get(k);
        expect(other === undefined || other === p.id, `${p.id}와 ${other}가 같은 모양`).toBe(true);
      }
      for (const rotation of ROTATIONS) seen.set(key(applyMoves(s, rotation)), p.id);
    }
    expect(new Set(PATTERNS.map((p) => key(patternState(p)))).size).toBe(PATTERNS.length);
  });

  it('공식을 되풀이하면 완성 상태로 돌아오는 횟수(차수)가 기록한 값과 같다', () => {
    expect(Object.keys(ORDERS).sort()).toEqual(PATTERNS.map((p) => p.id).sort());
    for (const p of PATTERNS) {
      const order = orderOf(p.alg);
      expect(order, p.id).toBe(ORDERS[p.id]);
      expect(patternOrder(p), p.id).toBe(order);
      // 차수보다 적게 되풀이해서는 완성 상태가 되지 않는다 (orderOf가 가장 작은 값을 찾는다)
      expect(order, p.id).toBeGreaterThan(1);
    }
  });
});

describe('패턴 갤러리: 무늬의 정의', () => {
  /** 바둑판 모양: 코너 칸과 센터가 자기 색, 엣지 칸 넷이 다른 한 가지 색. 그 색을 돌려준다 (아니면 -1). */
  const checkerEdge = (s: CubeState, f: number) => {
    if (single(cells(s, f, [...CORNER_CELLS, CENTER])) !== f) return -1;
    const e = single(cells(s, f, EDGE_CELLS));
    return e === f ? -1 : e;
  };

  it('체커보드: 여섯 면 모두 코너 칸과 센터는 자기 색, 엣지 칸은 마주 보는 면의 색', () => {
    const s = stateOf('pattern-checkerboard');
    for (const f of FACE_IDS) {
      expect(checkerEdge(s, f), `면 ${f}`).toBe(opposite(f));
      expect(colorCount(s, f), `면 ${f}`).toBe(2);
    }
  });

  it('이웃 색 체커보드: 여섯 면 모두 바둑판 모양이고, 엣지 칸의 색은 이웃한 면의 색이며 세 면씩 돌아가며 바뀐다', () => {
    const s = stateOf('pattern-checkerboard-3');
    const edge = FACE_IDS.map((f) => checkerEdge(s, f));
    for (const f of FACE_IDS) {
      expect(edge[f], `면 ${f}`).toBeGreaterThanOrEqual(0);
      expect(edge[f], `면 ${f}`).not.toBe(opposite(f));
      expect(colorCount(s, f), `면 ${f}`).toBe(2);
    }
    expect(cycles(edge)).toEqual([3, 3]);
  });

  it('세 색 체커보드: 면마다 센터는 자기 색, 엣지 칸 넷이 한 색, 코너 칸 넷이 또 다른 한 색', () => {
    const s = stateOf('pattern-tricolor');
    const edge = FACE_IDS.map((f) => single(cells(s, f, EDGE_CELLS)));
    const corner = FACE_IDS.map((f) => single(cells(s, f, CORNER_CELLS)));
    for (const f of FACE_IDS) {
      expect(cell(s, f, CENTER)).toBe(f);
      expect(new Set([f, edge[f], corner[f]]).size, `면 ${f}`).toBe(3);
      expect(edge[f] >= 0 && corner[f] >= 0, `면 ${f}`).toBe(true);
      expect(colorCount(s, f), `면 ${f}`).toBe(3);
    }
    // 엣지 색과 코너 색은 세 면씩, 서로 반대 방향으로 돌아가며 바뀐다
    expect(cycles(edge)).toEqual([3, 3]);
    expect(cycles(corner)).toEqual([3, 3]);
    for (const f of FACE_IDS) expect(corner[edge[f]], `면 ${f}`).toBe(f);
  });

  it('여섯 개의 점: 여섯 면 모두 센터만 자기 색이고 나머지 8칸은 다른 한 가지 색', () => {
    const s = stateOf('pattern-six-spots');
    const body = FACE_IDS.map((f) => single(cells(s, f, OTHER_CELLS)));
    for (const f of FACE_IDS) {
      expect(cell(s, f, CENTER)).toBe(f);
      expect(body[f], `면 ${f}`).toBeGreaterThanOrEqual(0);
      expect(body[f], `면 ${f}`).not.toBe(f);
    }
    expect(cycles(body)).toEqual([3, 3]);
  });

  it('네 개의 점: 옆면 넷은 센터만 자기 색이고 나머지 8칸이 마주 보는 면의 색, 위아래 면은 한 가지 색', () => {
    const s = stateOf('pattern-four-spots');
    const body = FACE_IDS.map((f) => single(cells(s, f, OTHER_CELLS)));
    for (const f of FACE_IDS) expect(cell(s, f, CENTER)).toBe(f);
    expect(FACE_IDS.filter((f) => body[f] !== f)).toEqual([...SIDES].sort());
    for (const f of SIDES) expect(body[f], `면 ${f}`).toBe(opposite(f));
    expect(faceUniform(s, 0) && faceUniform(s, 3)).toBe(true);
  });

  it('지그재그: 옆면마다 대각선 3칸만 자기 색이고 나머지는 마주 보는 면의 색, 대각선끼리 꼭짓점에서 이어진다', () => {
    const s = stateOf('pattern-zigzag');
    expect(faceUniform(s, 0) && faceUniform(s, 3)).toBe(true);
    const ends: number[] = [];
    for (const f of SIDES) {
      const own = ownCells(s, f).join();
      expect(['0,4,8', '2,4,6'], `면 ${f}`).toContain(own);
      expect(single(cells(s, f, rest(ownCells(s, f)))), `면 ${f}`).toBe(opposite(f));
      for (const k of ownCells(s, f)) if (k !== CENTER) ends.push(f * 9 + k);
    }
    // 대각선의 끝 8칸은 코너 조각 4개에 둘씩 모인다: 이웃한 면의 대각선이 같은 꼭짓점에서 만난다
    const perCubie = new Map<string, number>();
    for (const i of ends) perCubie.set(cubieOf(i), (perCubie.get(cubieOf(i)) ?? 0) + 1);
    expect([...perCubie.values()]).toEqual([2, 2, 2, 2]);
    // 만나는 꼭짓점은 위, 아래가 번갈아 나온다
    expect([...perCubie.keys()].filter((pos) => pos.split(',')[1] === '1').length).toBe(2);
  });

  it('십자 무늬: 여섯 면 모두 센터와 엣지 칸(+ 모양)은 자기 색, 코너 칸 넷은 다른 한 가지 색', () => {
    const s = stateOf('pattern-crosses');
    const corner = FACE_IDS.map((f) => single(cells(s, f, CORNER_CELLS)));
    for (const f of FACE_IDS) {
      expect(single(cells(s, f, [...EDGE_CELLS, CENTER])), `면 ${f}`).toBe(f);
      expect(corner[f], `면 ${f}`).toBeGreaterThanOrEqual(0);
      expect(corner[f], `면 ${f}`).not.toBe(f);
    }
    expect(cycles(corner)).toEqual([3, 3]);
  });

  it('여섯 개의 T: 여섯 면 모두 자기 색 5칸이 T자(한 줄 3칸 + 센터 + 맞은편 엣지 칸), 나머지 4칸은 마주 보는 면의 색', () => {
    const s = stateOf('pattern-six-ts');
    const T_SHAPES = ['0,1,2,4,7', '1,4,6,7,8', '0,3,4,5,6', '2,3,4,5,8'];
    for (const f of FACE_IDS) {
      const own = ownCells(s, f);
      expect(T_SHAPES, `면 ${f}`).toContain(own.join());
      expect(single(cells(s, f, rest(own))), `면 ${f}`).toBe(opposite(f));
    }
  });

  it('세로 줄무늬: 옆면마다 세로 세 줄이 서로 다른 색이고 가운데 줄이 자기 색, 위아래 면은 한 가지 색', () => {
    const s = stateOf('pattern-stripes');
    expect(faceUniform(s, 0) && faceUniform(s, 3)).toBe(true);
    for (const f of SIDES) {
      const [left, middle, right] = [0, 1, 2].map((c) => single(cells(s, f, [c, c + 3, c + 6])));
      expect(middle, `면 ${f}`).toBe(f);
      // 양옆 줄은 이웃한 두 옆면의 색
      expect([left, right].sort(), `면 ${f}`).toEqual(SIDES.filter((g) => g !== f && g !== opposite(f)).sort());
    }
  });

  /** 작은 큐브가 놓인 코너 칸 (그 칸, 맞닿은 엣지 칸 둘, 센터를 뺀 5칸이 한 가지 색인 코너 칸). 없으면 -1 */
  const nestCorner = (s: CubeState, f: number) => {
    const found = CORNER_CELLS.filter((k) => single(cells(s, f, rest([k, ...NEAR[k], CENTER]))) >= 0);
    return found.length === 1 ? found[0] : -1;
  };
  /** 면마다 고른 코너 칸들이 마주 보는 두 꼭짓점(하나는 위-앞-오른쪽)에 셋씩 모이는지 */
  const meetAtOppositeCorners = (picked: readonly number[]) => {
    const perCubie = new Map<string, number>();
    for (const f of FACE_IDS) {
      const pos = cubieOf(f * 9 + picked[f]);
      perCubie.set(pos, (perCubie.get(pos) ?? 0) + 1);
    }
    const [a, b] = [...perCubie.keys()].map((pos) => pos.split(',').map(Number));
    return (
      perCubie.size === 2 &&
      [...perCubie.values()].join() === '3,3' &&
      a.every((v, i) => v === -b[i]) &&
      perCubie.has('1,1,1')
    );
  };

  it('큐브 속 큐브: 면마다 두 가지 색 — 한 꼭짓점 쪽 2×2 네 칸이 자기 색, 나머지 ㄱ자 5칸이 다른 한 색', () => {
    const s = stateOf('pattern-cube-in-cube');
    const corner = FACE_IDS.map((f) => nestCorner(s, f));
    const outer: number[] = [];
    for (const f of FACE_IDS) {
      const k = corner[f];
      expect(k, `면 ${f}`).toBeGreaterThanOrEqual(0);
      expect(single(cells(s, f, [k, ...NEAR[k], CENTER])), `면 ${f}`).toBe(f);
      outer.push(single(cells(s, f, rest([k, ...NEAR[k], CENTER]))));
      expect(outer[f], `면 ${f}`).not.toBe(f);
      expect(colorCount(s, f), `면 ${f}`).toBe(2);
    }
    expect(cycles(outer)).toEqual([3, 3]);
    // 2×2 네모는 마주 보는 두 꼭짓점에 세 면씩 모여 작은 큐브가 된다
    expect(meetAtOppositeCorners(corner)).toBe(true);
  });

  it('큐브 속 큐브 속 큐브: 면마다 세 가지 색 — 꼭짓점 1칸, 그것을 감싼 ㄱ자 3칸(자기 색), 다시 감싼 ㄱ자 5칸', () => {
    const s = stateOf('pattern-cube-in-cube-in-cube');
    const corner = FACE_IDS.map((f) => nestCorner(s, f));
    const inner: number[] = [];
    const outer: number[] = [];
    for (const f of FACE_IDS) {
      const k = corner[f];
      expect(k, `면 ${f}`).toBeGreaterThanOrEqual(0);
      inner.push(cell(s, f, k));
      expect(single(cells(s, f, [...NEAR[k], CENTER])), `면 ${f}`).toBe(f);
      outer.push(single(cells(s, f, rest([k, ...NEAR[k], CENTER]))));
      expect(new Set([f, inner[f], outer[f]]).size, `면 ${f}`).toBe(3);
      expect(colorCount(s, f), `면 ${f}`).toBe(3);
    }
    expect(cycles(inner)).toEqual([3, 3]);
    expect(cycles(outer)).toEqual([3, 3]);
    // 가장 안쪽 큐브와 가장 바깥 큐브는 서로 반대 방향으로 돌아가 있다
    for (const f of FACE_IDS) expect(inner[outer[f]], `면 ${f}`).toBe(f);
    expect(meetAtOppositeCorners(corner)).toBe(true);
  });

  /**
   * 띠 무늬: 면마다 센터와 서로 맞닿은 엣지 칸 둘(ㄱ자 3칸)만 자기 색이고 나머지 6칸은 다른 한 가지 색.
   * 띠의 엣지 칸은 건너편 면에서도 띠여야 한다 (조각째 제자리). 띠로 이어진 면 묶음의 크기를 돌려준다.
   */
  const bandLoops = (s: CubeState): number[] | null => {
    const ELBOWS = ['1,3,4', '1,4,5', '3,4,7', '4,5,7'];
    const links = new Map<number, number[]>();
    for (const f of FACE_IDS) {
      const own = ownCells(s, f);
      if (!ELBOWS.includes(own.join())) return null;
      const other = single(cells(s, f, rest(own)));
      if (other < 0 || other === f) return null;
      const next: number[] = [];
      for (const k of own) {
        if (k === CENTER) continue;
        const j = partner(f * 9 + k);
        const g = Math.floor(j / 9);
        if (s[j] !== g) return null;
        next.push(g);
      }
      links.set(f, next);
    }
    const seen = new Set<number>();
    const sizes: number[] = [];
    for (const start of FACE_IDS) {
      if (seen.has(start)) continue;
      const stack: number[] = [start];
      let size = 0;
      while (stack.length) {
        const f = stack.pop()!;
        if (seen.has(f)) continue;
        seen.add(f);
        size++;
        stack.push(...links.get(f)!);
      }
      sizes.push(size);
    }
    return sizes.sort((a, b) => a - b);
  };

  it('뱀: ㄱ자 띠가 여섯 면을 모두 지나는 고리 하나로 이어진다', () => {
    const s = stateOf('pattern-snake');
    expect(bandLoops(s)).toEqual([6]);
    // 보이는 세 면(위, 앞, 오른쪽)에서 띠가 이어진다: 위-앞, 앞-오른쪽 엣지가 제자리
    expect([cell(s, 0, 7), cell(s, 2, 1), cell(s, 2, 5), cell(s, 1, 3)]).toEqual([0, 2, 2, 1]);
  });

  it('두 개의 고리: ㄱ자 띠가 세 면씩 두 고리로 나뉘고, 고리 하나는 위-앞-오른쪽 꼭짓점을 감싼다', () => {
    const s = stateOf('pattern-rings');
    expect(bandLoops(s)).toEqual([3, 3]);
    expect(ownCells(s, 0).join()).toBe('4,5,7'); // 위: 오른쪽, 앞
    expect(ownCells(s, 2).join()).toBe('1,4,5'); // 앞: 위, 오른쪽
    expect(ownCells(s, 1).join()).toBe('1,3,4'); // 오른쪽: 위, 앞
  });

  it('슈퍼플립: 코너와 센터는 모두 제자리, 엣지 12개는 모두 제자리에서 뒤집혀 있고, 두 번 하면 완성', () => {
    const p = byId.get('pattern-superflip')!;
    const s = patternState(p);
    const home = homeOf(s);
    let edgeStickers = 0;
    FACELETS.forEach((_, i) => {
      if (kindOf(i) === 2) {
        edgeStickers++;
        expect(home[i], `엣지 칸 ${i}`).toBe(partner(i));
      } else {
        expect(home[i], `칸 ${i}`).toBe(i);
      }
    });
    expect(edgeStickers).toBe(24);
    const moves = parseAlg(p.alg);
    expect(key(applyMoves(s, moves))).toBe(key(SOLVED));
    // 면에서 보면: 코너 칸과 센터는 자기 색, 엣지 칸 넷은 이웃한 네 면의 색이 하나씩
    for (const f of FACE_IDS) {
      expect(single(cells(s, f, [...CORNER_CELLS, CENTER])), `면 ${f}`).toBe(f);
      expect([...cells(s, f, EDGE_CELLS)].sort(), `면 ${f}`).toEqual(
        FACE_IDS.filter((g) => g !== f && g !== opposite(f)),
      );
    }
  });

  it('정의를 붙이지 않은 패턴이 없다', () => {
    const DEFINED = [
      'pattern-checkerboard',
      'pattern-checkerboard-3',
      'pattern-tricolor',
      'pattern-six-spots',
      'pattern-four-spots',
      'pattern-zigzag',
      'pattern-crosses',
      'pattern-six-ts',
      'pattern-stripes',
      'pattern-cube-in-cube',
      'pattern-cube-in-cube-in-cube',
      'pattern-snake',
      'pattern-rings',
      'pattern-superflip',
    ];
    expect(PATTERNS.map((p) => p.id).sort()).toEqual(DEFINED.sort());
  });
});
