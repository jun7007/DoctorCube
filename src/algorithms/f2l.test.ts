import { describe, expect, it } from 'vitest';
import { applyMoves, type CubeState, type Face } from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { algToString, invertAlg, parseAlg } from '../core/notation';
import { centerColor, colorAt } from '../core/pieces';
import { F2L_BY_KEY, F2L_CASES, f2lCaseKey, f2lSolve } from './f2l';

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

// ───────── 검사 도구 (f2l.ts의 구현과 따로 만든 것) ─────────

const ALL_FACES: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
const facesOf = (piece: string) => [...piece] as Face[];

/** 조각이 제자리에 바른 방향으로 있는지 */
const isHome = (s: CubeState, piece: string) =>
  facesOf(piece).every((f) => colorAt(s, piece, f) === colorAt(YELLOW_UP, piece, f));

const CROSS = ['DF', 'DR', 'DB', 'DL'];
const OTHER_SLOTS = ['DFL', 'DBL', 'DBR', 'FL', 'BL', 'BR'];

/** 센터, 흰색 십자, 나머지 세 슬롯이 그대로인지 */
const restIntact = (s: CubeState) =>
  ALL_FACES.every((f) => centerColor(s, f) === centerColor(YELLOW_UP, f)) &&
  [...CROSS, ...OTHER_SLOTS].every((p) => isHome(s, p));

const pairSolved = (s: CubeState) => isHome(s, 'DFR') && isHome(s, 'FR');

const caseState = (alg: string) => applyMoves(YELLOW_UP, invertAlg(parseAlg(alg)));

const WHITE = centerColor(YELLOW_UP, 'D');
const GREEN = centerColor(YELLOW_UP, 'F');
const ORANGE = centerColor(YELLOW_UP, 'R');

const CORNER_SPOTS = ['UFR', 'UFL', 'UBL', 'UBR', 'DFR'];
const EDGE_SPOTS = ['UF', 'UL', 'UB', 'UR', 'FR'];

interface Place {
  /** 코너가 있는 자리와 흰색이 보는 면 */
  corner: string;
  white: Face;
  /** 엣지가 있는 자리와 초록색이 보는 면 */
  edge: string;
  green: Face;
}

function placeOf(s: CubeState): Place | null {
  const holds = (piece: string, colors: number[]) =>
    facesOf(piece)
      .map((f) => colorAt(s, piece, f))
      .sort()
      .join() === [...colors].sort().join();
  const corner = CORNER_SPOTS.find((p) => holds(p, [WHITE, GREEN, ORANGE]));
  const edge = EDGE_SPOTS.find((p) => holds(p, [GREEN, ORANGE]));
  if (!corner || !edge) return null;
  return {
    corner,
    white: facesOf(corner).find((f) => colorAt(s, corner, f) === WHITE)!,
    edge,
    green: facesOf(edge).find((f) => colorAt(s, edge, f) === GREEN)!,
  };
}

const placeText = (p: Place) => `${p.corner}/${p.white}+${p.edge}/${p.green}`;

/** U를 한 번 돌리면 윗층 조각의 면이 가는 곳 */
const AFTER_U: Readonly<Record<Face, Face>> = { U: 'U', D: 'D', F: 'L', L: 'B', B: 'R', R: 'F' };
const NAME_ORDER = 'UDFBRL';

function turnPiece(piece: string, face: Face): [string, Face] {
  if (!piece.includes('U')) return [piece, face];
  const name = facesOf(piece)
    .map((f) => AFTER_U[f])
    .sort((a, b) => NAME_ORDER.indexOf(a) - NAME_ORDER.indexOf(b))
    .join('');
  return [name, AFTER_U[face]];
}

function turnPlace(p: Place): Place {
  const [corner, white] = turnPiece(p.corner, p.white);
  const [edge, green] = turnPiece(p.edge, p.green);
  return { corner, white, edge, green };
}

/** U를 돌려서 서로 바뀌는 자리들을 하나로 묶은 이름 (그중 사전순으로 가장 앞선 것) */
function classOf(p: Place): string {
  const texts: string[] = [];
  let q = p;
  for (let k = 0; k < 4; k++) {
    texts.push(placeText(q));
    q = turnPlace(q);
  }
  return texts.sort()[0];
}

const SOLVED_CLASS = classOf(placeOf(YELLOW_UP)!);

/** 가능한 모든 (코너 자리·방향, 엣지 자리·방향)을 U 회전으로 묶은 것. 완성은 뺀다. */
function allClasses(): Set<string> {
  const out = new Set<string>();
  for (const corner of CORNER_SPOTS) {
    for (const white of facesOf(corner)) {
      for (const edge of EDGE_SPOTS) {
        for (const green of facesOf(edge)) out.add(classOf({ corner, white, edge, green }));
      }
    }
  }
  out.delete(SOLVED_CLASS);
  return out;
}

/** 십자와 다른 슬롯을 건드리지 않고 앞-오른쪽 짝만 꺼냈다 넣었다 하는 동작들 */
const TRIGGERS = ['U', "U'", 'U2', "R U R'", "R U' R'", "R U2 R'", "F' U F", "F' U' F", "F' U2 F"].map(parseAlg);

/**
 * 완성 상태에서 TRIGGERS만으로 갈 수 있는 상태를 가까운 것부터 모은다.
 * 짝의 자리(코너·엣지의 위치와 방향)가 같은 상태는 하나만 남긴다.
 * TRIGGERS를 한 뒤의 자리는 그 전의 자리만으로 정해지므로, 이렇게 해도 갈 수 있는 자리를 빠짐없이 찾는다.
 */
function explore(): CubeState[] {
  const seen = new Set<string>([placeText(placeOf(YELLOW_UP)!)]);
  const queue: CubeState[] = [YELLOW_UP];
  for (let i = 0; i < queue.length; i++) {
    for (const t of TRIGGERS) {
      const next = applyMoves(queue[i], t);
      const id = placeText(placeOf(next)!);
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(next);
    }
  }
  return queue;
}

const REACHED = explore();

const U_TURNS = ['', 'U', 'U2', "U'"].map(parseAlg);

/** 모든 케이스의 대표 공식과 다른 공식 */
const ALL_ALGS = F2L_CASES.flatMap((c) => [c.alg, ...(c.alts ?? [])].map((alg) => ({ id: c.id, alg })));

// ───────── 테스트 ─────────

describe('F2L 공식 표', () => {
  it('41개가 번호 순서대로, 묶음별로 모여 있다', () => {
    expect(F2L_CASES).toHaveLength(41);
    F2L_CASES.forEach((c, i) => {
      expect(c.id).toBe(`f2l-${String(i + 1).padStart(2, '0')}`);
      expect(c.name).toBe(`F2L ${i + 1}`);
      expect(c.group.length).toBeGreaterThan(0);
      expect(c.note, c.id).toMatch(/요\.$/);
    });
    // 같은 묶음은 이어져 있어야 한다.
    const order = F2L_CASES.map((c) => c.group).filter((g, i, all) => i === 0 || all[i - 1] !== g);
    expect(new Set(order).size).toBe(order.length);
    expect(order).toHaveLength(6);
    expect(order.map((g) => F2L_CASES.filter((c) => c.group === g).length)).toEqual([4, 12, 8, 6, 6, 5]);
    expect(new Set(ALL_ALGS.map((a) => a.alg)).size).toBe(ALL_ALGS.length);
  });

  it('모든 공식은 U D L R F B만 쓰고, U로 시작하거나 끝나지 않는다', () => {
    for (const { id, alg } of ALL_ALGS) {
      const label = `${id}: ${alg}`;
      for (const token of alg.split(' ')) expect(token, label).toMatch(/^[UDLRFB][2']?$/);
      const moves = parseAlg(alg);
      expect(moves.length, label).toBeGreaterThanOrEqual(3);
      expect(moves.every((m) => 'UDLRFB'.includes(m.base)), label).toBe(true);
      expect(moves[0].base, label).not.toBe('U');
      expect(moves[moves.length - 1].base, label).not.toBe('U');
      expect(algToString(moves), label).toBe(alg);
    }
  });

  it('모든 공식은 십자와 다른 슬롯을 지키면서 앞-오른쪽 짝을 맞춘다', () => {
    for (const { id, alg } of ALL_ALGS) {
      const label = `${id}: ${alg}`;
      const s = caseState(alg);
      expect(restIntact(s), label).toBe(true);
      expect(pairSolved(s), label).toBe(false);
      const done = applyMoves(s, parseAlg(alg));
      expect(restIntact(done) && pairSolved(done), label).toBe(true);
    }
  });

  it('다른 공식(alts)은 대표 공식과 같은 케이스를 같은 자리에서 푼다', () => {
    for (const c of F2L_CASES) {
      const s = caseState(c.alg);
      for (const alt of c.alts ?? []) {
        const label = `${c.id}: ${alt}`;
        expect(f2lCaseKey(caseState(alt)), label).toBe(f2lCaseKey(s));
        const done = applyMoves(s, parseAlg(alt));
        expect(restIntact(done) && pairSolved(done), label).toBe(true);
      }
    }
  });

  it('알아보는 요령(note)이 실제 케이스의 모습과 맞다', () => {
    const cornerName: Record<string, string> = {
      UFR: '앞-오른쪽 위',
      UFL: '앞-왼쪽 위',
      UBL: '뒤-왼쪽 위',
      UBR: '뒤-오른쪽 위',
      DFR: '제자리',
    };
    const edgeName: Record<string, string> = { UF: '윗층 앞', UL: '윗층 왼쪽', UB: '윗층 뒤', UR: '윗층 오른쪽' };
    const toward: Record<Face, string> = {
      U: '위를',
      D: '아래를',
      F: '앞을',
      B: '뒤를',
      R: '오른쪽을',
      L: '왼쪽을',
    };
    for (const c of F2L_CASES) {
      const s = caseState(c.alg);
      const p = placeOf(s)!;
      const note = c.note ?? '';
      expect(note, c.id).toContain(`코너는 ${cornerName[p.corner]}에서 흰색이 ${toward[p.white]} 봐요.`);
      if (p.edge === 'FR') {
        expect(note, c.id).toContain(`엣지는 제자리에 ${p.green === 'F' ? '바르게' : '뒤집혀'} 들어가 있어요.`);
        continue;
      }
      expect(note, c.id).toMatch(new RegExp(`엣지는 (흰색 옆 )?${edgeName[p.edge]}에 `));
      const edgeTop = colorAt(s, p.edge, 'U');
      if (p.corner !== 'DFR' && p.white !== 'U') {
        const same = colorAt(s, p.corner, 'U') === edgeTop;
        expect(note, c.id).toContain(`윗면 색이 코너와 ${same ? '같아요' : '달라요'}.`);
      } else {
        expect(note, c.id).toContain(`윗면이 ${edgeTop === GREEN ? '앞' : '오른쪽'} 센터 색이에요.`);
      }
    }
  });

  it('공식 길이를 기록한다', () => {
    const lengths = F2L_CASES.map((c) => parseAlg(c.alg).length);
    const total = lengths.reduce((a, b) => a + b, 0);
    console.log(`F2L 41개: 평균 ${(total / lengths.length).toFixed(2)}회전, 최대 ${Math.max(...lengths)}회전`);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(11);
  });
});

describe('f2lCaseKey', () => {
  it('YELLOW_UP은 흰색 아래, 초록 앞, 주황 오른쪽이다 (검사 도구의 전제)', () => {
    expect([WHITE, GREEN, ORANGE]).toEqual([0, 2, 4]);
    expect(SOLVED_CLASS).toBe('DFR/D+FR/F');
  });

  it('완성 상태는 solved, 케이스 41개는 서로 다른 키를 가진다', () => {
    expect(f2lCaseKey(YELLOW_UP)).toBe('solved');
    const keys = F2L_CASES.map((c) => f2lCaseKey(caseState(c.alg)));
    for (const key of keys) {
      expect(key).not.toBeNull();
      expect(key).not.toBe('solved');
    }
    expect(new Set(keys).size).toBe(41);
    expect(F2L_BY_KEY.size).toBe(41);
    F2L_CASES.forEach((c, i) => expect(F2L_BY_KEY.get(keys[i]!)).toBe(c));
  });

  it('윗면을 돌려도 키가 같다', () => {
    for (const turn of U_TURNS) expect(f2lCaseKey(applyMoves(YELLOW_UP, turn))).toBe('solved');
    for (const c of F2L_CASES) {
      const s = caseState(c.alg);
      const key = f2lCaseKey(s);
      for (const turn of U_TURNS) expect(f2lCaseKey(applyMoves(s, turn)), c.id).toBe(key);
    }
  });

  it('가능한 자리를 모두 세면 윗면 회전을 빼고 정확히 41가지다', () => {
    const classes = allClasses();
    expect(classes.size).toBe(41);
    // 케이스 41개가 이 41가지를 하나씩 맡는다.
    const covered = new Set(F2L_CASES.map((c) => classOf(placeOf(caseState(c.alg))!)));
    expect([...covered].sort()).toEqual([...classes].sort());
  });

  it('검사 도구의 U 회전 규칙이 실제 U 동작과 같다', () => {
    const u = parseAlg('U');
    for (const s of REACHED) {
      expect(placeText(placeOf(applyMoves(s, u))!)).toBe(placeText(turnPlace(placeOf(s)!)));
    }
  });

  it('실제 큐브 상태로 41가지를 모두 만들 수 있고, 키가 자리 묶음과 일대일로 맞는다', () => {
    // 코너 자리 5 × 방향 3, 엣지 자리 5 × 방향 2 = 150가지가 모두 나온다.
    expect(REACHED).toHaveLength(150);
    const keyOfClass = new Map<string, string>();
    const classOfKey = new Map<string, string>();
    for (const s of REACHED) {
      expect(restIntact(s)).toBe(true);
      const cls = classOf(placeOf(s)!);
      const key = f2lCaseKey(s);
      expect(key).not.toBeNull();
      if (!keyOfClass.has(cls)) keyOfClass.set(cls, key!);
      if (!classOfKey.has(key!)) classOfKey.set(key!, cls);
      expect(keyOfClass.get(cls)).toBe(key);
      expect(classOfKey.get(key!)).toBe(cls);
      expect(key === 'solved').toBe(cls === SOLVED_CLASS);
      expect(key === 'solved').toBe(pairSolved(s));
    }
    expect(keyOfClass.get(SOLVED_CLASS)).toBe('solved');
    keyOfClass.delete(SOLVED_CLASS);
    expect([...keyOfClass.keys()].sort()).toEqual([...allClasses()].sort());
    expect(keyOfClass.size).toBe(41);
    for (const key of keyOfClass.values()) expect(F2L_BY_KEY.has(key), key).toBe(true);
    expect(new Set(keyOfClass.values()).size).toBe(41);
  });

  it('코너나 엣지가 다른 슬롯에 들어가 있으면 null', () => {
    // D: 코너가 다른 아래층 자리로, R2: 엣지가 뒤-오른쪽 슬롯으로, F2: 엣지가 앞-왼쪽 슬롯으로
    for (const alg of ['D', 'R2', 'F2', "L' U' L U R U R' U' L' U L", "R U R' U2 L' U' L"]) {
      const s = applyMoves(YELLOW_UP, parseAlg(alg));
      expect(placeOf(s), alg).toBeNull();
      expect(f2lCaseKey(s), alg).toBeNull();
      expect(f2lSolve(s), alg).toBeNull();
    }
  });
});

describe('f2lSolve', () => {
  /** 풀이가 [U 한 번 이하, 그 케이스의 대표 공식] 꼴이고 실제로 짝을 맞추는지 확인한다. */
  function check(s: CubeState, label: string): void {
    const moves = f2lSolve(s);
    expect(moves, label).not.toBeNull();
    if (pairSolved(s)) {
      expect(moves, label).toEqual([]);
      return;
    }
    const found = F2L_BY_KEY.get(f2lCaseKey(s)!)!;
    const alg = parseAlg(found.alg);
    const pre = moves!.slice(0, moves!.length - alg.length);
    expect(algToString(moves!.slice(pre.length)), label).toBe(found.alg);
    expect(pre.length, label).toBeLessThanOrEqual(1);
    expect(pre.every((m) => m.base === 'U'), label).toBe(true);
    // U로 맞춘 뒤의 모습은 그 케이스를 정의한 모습과 짝의 자리가 같다.
    expect(placeText(placeOf(applyMoves(s, pre))!), label).toBe(placeText(placeOf(caseState(found.alg))!));
    const done = applyMoves(s, moves!);
    expect(restIntact(done) && pairSolved(done), label).toBe(true);
  }

  it('이미 맞은 짝은 할 일이 없다', () => {
    expect(f2lSolve(YELLOW_UP)).toEqual([]);
    expect(f2lSolve(applyMoves(YELLOW_UP, parseAlg('U')))).toEqual([]);
  });

  it('케이스를 정의한 자리에서는 공식만, 윗면이 돌아가 있으면 U를 먼저 돌린다', () => {
    for (const c of F2L_CASES) {
      const s = caseState(c.alg);
      expect(algToString(f2lSolve(s)!), c.id).toBe(c.alg);
      const place = placeOf(s)!;
      const inSlot = place.corner === 'DFR' && place.edge === 'FR';
      for (const turn of U_TURNS) {
        const turned = applyMoves(s, turn);
        check(turned, `${c.id} + ${algToString(turn)}`);
        // 윗층에 조각이 있으면 돌린 만큼 되돌리는 U가 꼭 필요하다.
        if (!inSlot) expect(f2lSolve(turned)!.length, c.id).toBe(parseAlg(c.alg).length + turn.length);
      }
    }
  });

  it('만들 수 있는 모든 상태에서 짝을 맞춘다', () => {
    REACHED.forEach((s, i) => check(s, `상태 #${i}`));
  });

  it('무작위 상태 200개에서 짝을 맞춘다', () => {
    const random = rng(41);
    const seenKeys = new Set<string>();
    for (let i = 0; i < 200; i++) {
      let s = YELLOW_UP;
      const steps = 3 + Math.floor(random() * 20);
      for (let n = 0; n < steps; n++) s = applyMoves(s, TRIGGERS[Math.floor(random() * TRIGGERS.length)]);
      expect(restIntact(s)).toBe(true);
      seenKeys.add(f2lCaseKey(s)!);
      check(s, `무작위 #${i}`);
    }
    // 무작위로도 케이스 대부분이 나와야 의미 있는 검사다.
    expect(seenKeys.size).toBeGreaterThan(30);
  });
});
