import { describe, expect, it } from 'vitest';
import { SOLVED, applyMoves, isSolved, type CubeState, type Move } from '../core/cube';
import { algToString, parseAlg } from '../core/notation';
import { facelet } from '../core/pieces';
import { generateScramble } from '../core/scramble';
import {
  cubiesToState,
  initKociemba,
  randomState,
  randomStateScramble,
  solveKociemba,
  stateToCubies,
  validateState,
} from './kociemba';

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

const FACE_TURNS = 'UDLRFB';
const onlyFaceTurns = (moves: readonly Move[]) =>
  moves.every((m) => FACE_TURNS.includes(m.base) && [1, 2, -1].includes(m.amount));

/** 칸 번호들의 색을 한 칸씩 밀어 옮긴다 (둘이면 맞바꾸기). */
function cycle(state: CubeState, ...cells: number[]): CubeState {
  const next = [...state];
  cells.forEach((cell, i) => {
    next[cells[(i + 1) % cells.length]] = state[cell];
  });
  return next;
}

/** 풀 수 없는 상태들 (완성 상태에서 스티커만 옮겨 붙인 것) */
const BROKEN = {
  flippedEdge: cycle(SOLVED, facelet('UF', 'U'), facelet('UF', 'F')),
  twistedCorner: cycle(SOLVED, facelet('URF', 'U'), facelet('URF', 'R'), facelet('URF', 'F')),
  swappedEdges: cycle(cycle(SOLVED, facelet('UF', 'U'), facelet('UR', 'U')), facelet('UF', 'F'), facelet('UR', 'R')),
  swappedCorners: cycle(
    cycle(cycle(SOLVED, facelet('URF', 'U'), facelet('UFL', 'U')), facelet('URF', 'R'), facelet('UFL', 'F')),
    facelet('URF', 'F'),
    facelet('UFL', 'L'),
  ),
  // UR 엣지가 흰색-흰색
  sameColorEdge: cycle(SOLVED, facelet('UF', 'U'), facelet('UR', 'R')),
  // UF 엣지가 흰색-노란색
  oppositeColorEdge: cycle(SOLVED, facelet('UF', 'F'), facelet('DB', 'D')),
  // 색은 맞지만 거울에 비친 모양의 코너
  mirroredCorner: cycle(SOLVED, facelet('URF', 'R'), facelet('URF', 'F')),
  swappedCenters: cycle(SOLVED, 4, 13),
};

const reasonOf = (state: CubeState) => {
  const result = validateState(state);
  return result.ok ? null : result.reason;
};

describe('Kociemba 2단계 풀이기', () => {
  it('표를 6초 안에 만든다', () => {
    const t0 = performance.now();
    initKociemba();
    const elapsed = performance.now() - t0;
    console.log(`표 만들기 ${Math.round(elapsed)}ms`);
    expect(elapsed).toBeLessThan(6000);
  });

  it('칸 → 조각 → 칸으로 바꾸면 원래대로 돌아온다', () => {
    const random = rng(11);
    expect(cubiesToState(stateToCubies(SOLVED))).toEqual(SOLVED);
    for (let i = 0; i < 200; i++) {
      const state = applyMoves(SOLVED, generateScramble(25, random));
      const cubies = stateToCubies(state);
      expect([...cubies.cp].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect([...cubies.ep].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(cubiesToState(cubies)).toEqual(state);
    }
  });

  it('무작위로 섞은 큐브 200개를 모두 24회전 안에 푼다', () => {
    const random = rng(7);
    let total = 0;
    let worst = 0;
    let time = 0;
    for (let i = 0; i < 200; i++) {
      const start = applyMoves(SOLVED, generateScramble(25, random));
      const t0 = performance.now();
      const moves = solveKociemba(start);
      time += performance.now() - t0;
      expect(isSolved(applyMoves(start, moves)), `scramble #${i}`).toBe(true);
      expect(onlyFaceTurns(moves), `scramble #${i}`).toBe(true);
      expect(moves.length, `scramble #${i}`).toBeLessThanOrEqual(24);
      total += moves.length;
      worst = Math.max(worst, moves.length);
    }
    console.log(
      `평균 ${(total / 200).toFixed(2)}회전, 최대 ${worst}회전, 평균 ${(time / 200).toFixed(1)}ms (전체 ${Math.round(time)}ms)`,
    );
    expect(total / 200).toBeLessThanOrEqual(22.5);
    expect(time).toBeLessThan(60_000);
  }, 120_000);

  it('슈퍼플립(모든 엣지가 뒤집힌 상태)을 24회전 안에 푼다', () => {
    const start = applyMoves(SOLVED, parseAlg("U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2"));
    const moves = solveKociemba(start);
    console.log(`슈퍼플립 ${moves.length}회전: ${algToString(moves)}`);
    expect(isSolved(applyMoves(start, moves))).toBe(true);
    expect(moves.length).toBeLessThanOrEqual(24);
  });

  it('큐브를 통째로 돌려 놓은 상태나 중간층을 돌린 상태도 푼다', () => {
    for (const alg of ["x y' R U F", 'M E S', "M2 U M U2 M' U M2 z", "R U R' U'", 'y', "r U r' z2 f"]) {
      const start = applyMoves(SOLVED, parseAlg(alg));
      const moves = solveKociemba(start);
      expect(onlyFaceTurns(moves), alg).toBe(true);
      expect(isSolved(applyMoves(start, moves)), alg).toBe(true);
    }
    // 섞은 뒤 아무렇게나 돌려 잡은 큐브
    const random = rng(13);
    const rotations = ['x', "x'", 'x2', 'y', "y'", 'y2', 'z', "z'", 'z2'];
    for (let i = 0; i < 48; i++) {
      const turn = `${rotations[i % 9]} ${rotations[Math.floor(i / 9)]}`;
      const start = applyMoves(applyMoves(SOLVED, generateScramble(25, random)), parseAlg(turn));
      const moves = solveKociemba(start);
      expect(isSolved(applyMoves(start, moves)), turn).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(24);
    }
  });

  it('짧게 섞은 큐브는 섞은 횟수보다 길게 풀지 않는다', () => {
    const random = rng(17);
    for (let n = 1; n <= 8; n++) {
      for (let i = 0; i < 5; i++) {
        const start = applyMoves(SOLVED, generateScramble(n, random));
        const moves = solveKociemba(start);
        expect(isSolved(applyMoves(start, moves))).toBe(true);
        expect(moves.length, `${n}회전`).toBeLessThanOrEqual(n);
      }
    }
    // 반 바퀴 회전이 많은 무늬 (이미 G1 안이거나 그 근처)
    for (const alg of ['R2 L2 U2 D2 F2 B2', "U R2 F2 D' L2 B2 U2 R2", "R U2 D2 L2 F2 U' R'", "F2 U' R2 D B2 L' U2 L"]) {
      const start = applyMoves(SOLVED, parseAlg(alg));
      const moves = solveKociemba(start);
      expect(isSolved(applyMoves(start, moves)), alg).toBe(true);
      expect(moves.length, alg).toBeLessThanOrEqual(parseAlg(alg).length);
    }
  });

  it('이미 완성된 큐브는 할 일이 없다 (통째로 돌려 놓았어도)', () => {
    expect(solveKociemba(SOLVED)).toEqual([]);
    for (const alg of ['x', 'y2 z', "z' x2", 'M E S z y']) {
      const start = applyMoves(SOLVED, parseAlg(alg));
      // M E S는 큐브를 통째로 돌린 것과 같다
      if (isSolved(start)) expect(solveKociemba(start), alg).toEqual([]);
      else expect(isSolved(applyMoves(start, solveKociemba(start))), alg).toBe(true);
    }
    expect(solveKociemba(applyMoves(SOLVED, parseAlg('x')))).toEqual([]);
    expect(solveKociemba(applyMoves(SOLVED, parseAlg('y2 z')))).toEqual([]);
  });

  it('maxLength와 timeLimitMs를 따른다', () => {
    const start = applyMoves(SOLVED, generateScramble(25, rng(23)));
    // 넉넉한 길이면 처음 찾은 풀이로 끝난다
    const loose = solveKociemba(start, { maxLength: 30 });
    expect(isSolved(applyMoves(start, loose))).toBe(true);
    expect(loose.length).toBeLessThanOrEqual(30);
    // 불가능한 길이를 요구해도 시간이 되면 찾은 것 중 가장 짧은 풀이를 돌려준다
    const t0 = performance.now();
    const tight = solveKociemba(start, { maxLength: 1, timeLimitMs: 250 });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(isSolved(applyMoves(start, tight))).toBe(true);
    expect(tight.length).toBeLessThanOrEqual(22);
    // 시간을 전혀 주지 않아도 풀이 하나는 돌려준다
    const hurried = solveKociemba(start, { timeLimitMs: 0 });
    expect(isSolved(applyMoves(start, hurried))).toBe(true);
    expect(hurried.length).toBeLessThanOrEqual(24);
  });
});

describe('상태 검사', () => {
  it('섞은 큐브는 모두 올바른 상태', () => {
    const random = rng(29);
    expect(validateState(SOLVED)).toEqual({ ok: true });
    for (let i = 0; i < 100; i++) {
      expect(validateState(applyMoves(SOLVED, generateScramble(25, random)))).toEqual({ ok: true });
    }
    for (const alg of ["x y' R U F", 'M E S', "M2 U M U2 M' U M2 z"]) {
      expect(validateState(applyMoves(SOLVED, parseAlg(alg))), alg).toEqual({ ok: true });
    }
  });

  it('잘못된 상태는 종류별로 이유를 알려 준다', () => {
    expect(reasonOf(BROKEN.flippedEdge)).toBe('엣지 하나가 뒤집혀 있어요');
    expect(reasonOf(BROKEN.twistedCorner)).toBe('코너 하나가 돌아가 있어요');
    expect(reasonOf(BROKEN.swappedEdges)).toBe('두 조각의 자리가 서로 바뀌어 있어요');
    expect(reasonOf(BROKEN.swappedCorners)).toBe('두 조각의 자리가 서로 바뀌어 있어요');
    expect(reasonOf(BROKEN.sameColorEdge)).toBe('존재하지 않는 조각이 있어요');
    expect(reasonOf(BROKEN.oppositeColorEdge)).toBe('존재하지 않는 조각이 있어요');
    expect(reasonOf(BROKEN.mirroredCorner)).toBe('존재하지 않는 조각이 있어요');
    expect(reasonOf(BROKEN.swappedCenters)).toBe('가운데 조각의 배치가 올바르지 않아요');

    const miscounted = [...SOLVED];
    miscounted[0] = 1;
    expect(reasonOf(miscounted)).toBe('색의 개수가 맞지 않아요');
    expect(reasonOf(SOLVED.slice(1))).toBe('색의 개수가 맞지 않아요');
    expect(reasonOf(SOLVED.map((c) => (c === 5 ? 6 : c)))).toBe('색의 개수가 맞지 않아요');
  });

  it('잘못된 상태는 섞거나 돌려 잡아도 같은 이유로 걸린다', () => {
    const random = rng(31);
    for (const [name, broken] of Object.entries(BROKEN)) {
      const reason = reasonOf(broken);
      expect(reason, name).not.toBeNull();
      for (let i = 0; i < 20; i++) {
        const state = applyMoves(applyMoves(broken, generateScramble(25, random)), parseAlg(i % 2 ? "x y'" : 'z2'));
        expect(reasonOf(state), name).toBe(reason);
      }
    }
  });

  it('풀 수 없는 상태를 풀라고 하면 이유를 담은 오류', () => {
    expect(() => solveKociemba(BROKEN.flippedEdge)).toThrow('엣지 하나가 뒤집혀 있어요');
    expect(() => solveKociemba(BROKEN.twistedCorner)).toThrow('코너 하나가 돌아가 있어요');
    expect(() => solveKociemba(BROKEN.swappedEdges)).toThrow('두 조각의 자리가 서로 바뀌어 있어요');
    expect(() => solveKociemba(BROKEN.sameColorEdge)).toThrow('존재하지 않는 조각이 있어요');
    expect(() => solveKociemba([...SOLVED].fill(0))).toThrow('색의 개수가 맞지 않아요');
  });
});

describe('무작위 상태', () => {
  it('무작위 상태 100개는 모두 올바르고 풀린다', () => {
    const random = rng(37);
    const seen = new Set<string>();
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const state = randomState(random);
      seen.add(state.join(''));
      expect(validateState(state), `state #${i}`).toEqual({ ok: true });
      // 센터는 제자리
      expect([4, 13, 22, 31, 40, 49].map((c) => state[c])).toEqual([0, 1, 2, 3, 4, 5]);
      const moves = solveKociemba(state);
      expect(isSolved(applyMoves(state, moves)), `state #${i}`).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(24);
      total += moves.length;
    }
    expect(seen.size).toBe(100);
    console.log(`무작위 상태 평균 ${(total / 100).toFixed(2)}회전`);
  }, 60_000);

  it('무작위 상태 스크램블은 24회전 이하이고, 섞은 결과는 풀 수 있는 상태', () => {
    const random = rng(41);
    for (let i = 0; i < 20; i++) {
      const scramble = randomStateScramble(random);
      expect(onlyFaceTurns(scramble)).toBe(true);
      expect(scramble.length).toBeGreaterThan(0);
      expect(scramble.length).toBeLessThanOrEqual(24);
      const state = applyMoves(SOLVED, scramble);
      expect(isSolved(state)).toBe(false);
      expect(validateState(state)).toEqual({ ok: true });
      expect(isSolved(applyMoves(state, solveKociemba(state)))).toBe(true);
    }
  }, 60_000);

  it('같은 난수면 같은 상태, 스크램블은 그 상태를 그대로 만든다', () => {
    const state = randomState(rng(43));
    expect(randomState(rng(43))).toEqual(state);
    expect(applyMoves(SOLVED, randomStateScramble(rng(43)))).toEqual(state);
  });

  it('G1에서 나갔다가 4번 안에 돌아오는 길은 없다 (1단계 가지치기의 전제)', () => {
    // 마지막이 R L F B의 90° 회전이면서 방향이 모두 맞고 중간층 엣지가 중간층에 있는 4회전 이하의 길
    const bases = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
    const amounts = [1, 2, -1] as const;
    const inG1 = (state: CubeState) => {
      const c = stateToCubies(state);
      return c.co.every((o) => o === 0) && c.eo.every((o) => o === 0) && c.ep.slice(8).every((e) => e >= 8);
    };
    expect(inG1(applyMoves(SOLVED, parseAlg("R2 U D2 F2 U' L2 B2")))).toBe(true);
    for (const alg of ['R', "L'", 'F', "B'", 'R2 F', "U R U'"]) expect(inG1(applyMoves(SOLVED, parseAlg(alg))), alg).toBe(false);
    let found = 0;
    const walk = (state: CubeState, last: number, depth: number) => {
      for (let f = 0; f < 6; f++) {
        if (f === last || f + 3 === last) continue;
        for (const amount of amounts) {
          const next = applyMoves(state, [{ base: bases[f], amount }]);
          if (f % 3 !== 0 && amount !== 2 && inG1(next)) found++;
          if (depth < 4) walk(next, f, depth + 1);
        }
      }
    };
    walk(SOLVED, -1, 1);
    expect(found).toBe(0);
  }, 60_000);
});
