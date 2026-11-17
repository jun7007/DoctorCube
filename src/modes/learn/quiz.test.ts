import { describe, expect, it } from 'vitest';
import { ALG_SETS, caseState, type AlgCase } from '../../algorithms';
import { applyMoves, isSolved, moveToString, toFaceletString, type CubeState, type Face } from '../../core/cube';
import { YELLOW_UP } from '../../core/frames';
import { parseAlg } from '../../core/notation';
import { centerColor, colorAt } from '../../core/pieces';
import {
  CHOICE_COUNT,
  PRE_TURNS,
  buildQuestion,
  drillQuestion,
  drillTurns,
  pickTurn,
  shuffle,
  type PreTurn,
} from './quiz';

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

const setOf = (id: string) => {
  const set = ALG_SETS.find((s) => s.id === id);
  if (!set) throw new Error(`없는 모음: ${id}`);
  return set;
};
const caseOf = (setId: string, caseId: string) => {
  const found = setOf(setId).cases.find((c) => c.id === caseId);
  if (!found) throw new Error(`없는 공식: ${caseId}`);
  return found;
};
const fake = (id: string, group: string, alg: string): AlgCase => ({ id, name: id, group, alg });

describe('shuffle', () => {
  it('원본을 바꾸지 않고 같은 원소를 돌려준다', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = shuffle(items, rng(1));
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(items);
  });

  it('random이 1에 아주 가까워도 범위를 벗어나지 않는다', () => {
    expect(shuffle([1, 2, 3], () => 1).sort()).toEqual([1, 2, 3]);
  });
});

describe('그림 보고 공식 고르기: 보기 만들기', () => {
  for (const set of ALG_SETS) {
    it(`${set.title}: 모든 케이스에서 서로 다른 보기 4개, 정답은 하나`, () => {
      const random = rng(7);
      for (const answer of set.cases) {
        for (let n = 0; n < 5; n++) {
          const q = buildQuestion(set.cases, answer, random);
          expect(q.answer).toBe(answer);
          expect(q.choices).toHaveLength(CHOICE_COUNT);
          expect(new Set(q.choices.map((c) => c.alg)).size).toBe(CHOICE_COUNT);
          expect(new Set(q.choices.map((c) => c.caseId)).size).toBe(CHOICE_COUNT);
          const right = q.choices.filter((c) => c.correct);
          expect(right).toHaveLength(1);
          expect(right[0].alg).toBe(answer.alg);
          expect(right[0].caseId).toBe(answer.id);
          // 보기는 모두 같은 모음의 공식이다
          for (const c of q.choices) expect(set.cases.find((x) => x.id === c.caseId)?.alg).toBe(c.alg);
        }
      }
    });

    it(`${set.title}: 같은 묶음의 케이스를 오답으로 먼저 쓴다`, () => {
      const random = rng(11);
      for (const answer of set.cases) {
        const sameGroup = set.cases.filter((c) => c.group === answer.group && c.id !== answer.id);
        const q = buildQuestion(set.cases, answer, random);
        const wrong = q.choices.filter((c) => !c.correct);
        const fromGroup = wrong.filter((c) => sameGroup.some((s) => s.id === c.caseId)).length;
        expect(fromGroup).toBe(Math.min(CHOICE_COUNT - 1, sameGroup.length));
      }
    });
  }

  it('공식이 4개보다 적으면 보기도 줄고, 겹치지 않는다', () => {
    const cases = [fake('a', 'g', "R U R'"), fake('b', 'g', "F' U F"), fake('c', 'h', 'R2')];
    const q = buildQuestion(cases, cases[0], rng(3));
    expect(q.choices).toHaveLength(3);
    expect(q.choices.filter((c) => c.correct)).toHaveLength(1);
    expect(new Set(q.choices.map((c) => c.alg)).size).toBe(3);

    const alone = buildQuestion(cases.slice(0, 1), cases[0], rng(3));
    expect(alone.choices).toEqual([{ caseId: 'a', alg: "R U R'", correct: true }]);
  });

  it('같은 공식(띄어쓰기·괄호만 다른 것 포함)은 보기에 한 번만 나온다', () => {
    const cases = [
      fake('a', 'g', "R U R' U'"),
      fake('b', 'g', "(R U R' U')"),
      fake('c', 'g', "R  U R' U'"),
      fake('d', 'g', "F R U R' U' F'"),
      fake('e', 'h', "F R U R' U' F'"),
      fake('f', 'h', 'M2 U M2'),
    ];
    for (let seed = 0; seed < 50; seed++) {
      const q = buildQuestion(cases, cases[0], rng(seed));
      expect(q.choices.map((c) => c.alg.replace(/[()]/g, '').split(/\s+/).join(' ')).sort()).toEqual(
        ["F R U R' U' F'", 'M2 U M2', "R U R' U'"].sort(),
      );
      expect(q.choices.filter((c) => c.correct)).toEqual([{ caseId: 'a', alg: "R U R' U'", correct: true }]);
    }
  });

  it('같은 난수 씨앗이면 같은 문제가 나온다', () => {
    const set = setOf('oll');
    for (const answer of set.cases.slice(0, 10)) {
      const a = buildQuestion(set.cases, answer, rng(42));
      const b = buildQuestion(set.cases, answer, rng(42));
      expect(a).toEqual(b);
    }
    // 씨앗이 다르면 (거의 항상) 다른 문제
    const answer = set.cases[0];
    const variants = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        buildQuestion(set.cases, answer, rng(seed))
          .choices.map((c) => c.caseId)
          .join(),
      ),
    );
    expect(variants.size).toBeGreaterThan(5);
  });

  it('정답 자리가 고르게 나온다', () => {
    const random = rng(2026);
    const set = setOf('pll');
    const counts = [0, 0, 0, 0];
    const total = 8000;
    for (let n = 0; n < total; n++) {
      const answer = set.cases[n % set.cases.length];
      counts[buildQuestion(set.cases, answer, random).choices.findIndex((c) => c.correct)] += 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(total * 0.22);
      expect(count).toBeLessThan(total * 0.28);
    }
  });

  it('묶음에 케이스가 많으면 오답이 골고루 뽑힌다', () => {
    const random = rng(5);
    const set = setOf('pll');
    const answer = caseOf('pll', 'pll-Ga');
    const seen = new Set<string>();
    for (let n = 0; n < 200; n++) {
      for (const c of buildQuestion(set.cases, answer, random).choices) if (!c.correct) seen.add(c.caseId);
    }
    // G 계열 나머지 셋은 늘 나온다
    expect([...seen].sort()).toEqual(['pll-Gb', 'pll-Gc', 'pll-Gd']);
  });
});

describe('가리고 연습하기: 윗층 돌려 놓기', () => {
  for (const set of ALG_SETS) {
    it(`${set.title}: 어느 방향으로 돌려 놓아도 끝 상태는 원래 공식과 같다`, () => {
      for (const algCase of set.cases) {
        const plainEnd = toFaceletString(applyMoves(caseState(algCase), parseAlg(algCase.alg)));
        for (const preTurn of PRE_TURNS) {
          const q = drillQuestion(algCase, preTurn);
          const label = `${algCase.id} +${preTurn}: ${q.moves.map(moveToString).join(' ')}`;
          expect(toFaceletString(applyMoves(q.start, q.moves)), label).toBe(plainEnd);
          expect(isSolved(applyMoves(q.start, q.moves)), label).toBe(true);
        }
      }
    });

    it(`${set.title}: 맨 앞에 U가 연달아 나오거나 헛도는 동작이 없다`, () => {
      for (const algCase of set.cases) {
        const alg = parseAlg(algCase.alg);
        for (const preTurn of PRE_TURNS) {
          const { moves } = drillQuestion(algCase, preTurn);
          const label = `${algCase.id} +${preTurn}: ${moves.map(moveToString).join(' ')}`;
          expect(moves.length, label).toBeGreaterThan(0);
          expect(moves.length >= 2 && moves[0].base === 'U' && moves[1].base === 'U', label).toBe(false);
          for (const m of moves) expect([1, 2, -1], label).toContain(m.amount);
          // 공식보다 길어져도 한 수뿐이고, 줄어들어도 한 수뿐이다
          expect(Math.abs(moves.length - alg.length), label).toBeLessThanOrEqual(1);
        }
      }
    });

    it(`${set.title}: 돌려 놓지 않으면 원래 케이스와 공식 그대로다`, () => {
      for (const algCase of set.cases) {
        const q = drillQuestion(algCase, 0);
        expect(q.start).toEqual(caseState(algCase));
        expect(q.moves).toEqual(parseAlg(algCase.alg));
      }
    });

    it(`${set.title}: 돌려 놓은 시작 상태는 방향마다 다르고, 되돌리면 원래 케이스다`, () => {
      for (const algCase of set.cases) {
        const starts = PRE_TURNS.map((k) => toFaceletString(drillQuestion(algCase, k).start));
        expect(new Set(starts).size, algCase.id).toBe(4);
        const undo: Record<PreTurn, string> = { 0: '', 1: "U'", 2: 'U2', 3: 'U' };
        for (const k of PRE_TURNS) {
          expect(applyMoves(drillQuestion(algCase, k).start, parseAlg(undo[k])), algCase.id).toEqual(
            caseState(algCase),
          );
        }
      }
    });
  }

  it('되돌리는 U가 공식 앞에 붙는다', () => {
    const t = caseOf('pll', 'pll-T'); // R U R' U' ...
    expect(t.alg.startsWith('R ')).toBe(true);
    const lead = (k: PreTurn) => moveToString(drillQuestion(t, k).moves[0]);
    expect(lead(1)).toBe("U'");
    expect(lead(2)).toBe('U2');
    expect(lead(3)).toBe('U');
    expect(drillQuestion(t, 1).moves.slice(1)).toEqual(parseAlg(t.alg));
  });

  it('공식이 U로 시작하면 하나로 합치거나 둘 다 뺀다', () => {
    const c = fake('x', 'g', "U R U' R'");
    const text = (k: PreTurn) => drillQuestion(c, k).moves.map(moveToString).join(' ');
    expect(text(0)).toBe("U R U' R'");
    expect(text(1)).toBe("R U' R'"); // U' + U = 없음
    expect(text(2)).toBe("U' R U' R'"); // U2 + U = U'
    expect(text(3)).toBe("U2 R U' R'"); // U + U = U2

    const d = fake('y', 'g', "U2 R U' R'");
    expect(drillQuestion(d, 2).moves.map(moveToString).join(' ')).toBe("R U' R'");
    const e = fake('z', 'g', "U' F R F'");
    expect(drillQuestion(e, 3).moves.map(moveToString).join(' ')).toBe("F R F'");
    expect(drillQuestion(e, 1).moves.map(moveToString).join(' ')).toBe("U2 F R F'");
  });

  it('실제 공식 가운데 U로 시작하는 것도 합쳐진다', () => {
    const starting = ALG_SETS.flatMap((s) => s.cases).filter((c) => parseAlg(c.alg)[0].base === 'U');
    for (const algCase of starting) {
      const first = parseAlg(algCase.alg)[0];
      const cancel: PreTurn = first.amount === 1 ? 1 : first.amount === 2 ? 2 : 3;
      expect(drillQuestion(algCase, cancel).moves, algCase.id).toEqual(parseAlg(algCase.alg).slice(1));
    }
  });

  it('큐브를 돌려 잡는 동작으로 시작하는 공식은 그 앞에서 윗층을 되돌린다', () => {
    const aa = caseOf('pll', 'pll-Aa'); // x R' U R' ...
    expect(aa.alg.startsWith('x')).toBe(true);
    const q = drillQuestion(aa, 1);
    expect(moveToString(q.moves[0])).toBe("U'");
    expect(q.moves.slice(1)).toEqual(parseAlg(aa.alg));
  });
});

describe('가리고 연습하기: 돌려 놓아도 되는 케이스', () => {
  const turnable = (setId: string, caseId: string) => drillTurns(caseOf(setId, caseId), setOf(setId).view);

  it('돌려 놓을 수 있으면 네 방향 모두, 아니면 그대로만', () => {
    for (const set of ALG_SETS) {
      for (const algCase of set.cases) {
        const turns = drillTurns(algCase, set.view);
        expect([[0], [0, 1, 2, 3]], algCase.id).toContainEqual(turns);
      }
    }
  });

  it('PLL: 돌려도 같은 모양인 H, Z, E, Na, Nb만 그대로 낸다', () => {
    const fixed = setOf('pll')
      .cases.filter((c) => drillTurns(c, 'pll').length === 1)
      .map((c) => c.name)
      .sort();
    expect(fixed).toEqual(['E', 'H', 'Na', 'Nb', 'Z']);
    expect(turnable('pll', 'pll-T')).toEqual([0, 1, 2, 3]);
    expect(turnable('2look-pll', 'pll-Ua')).toEqual([0, 1, 2, 3]);
    expect(turnable('2look-pll', 'pll-H')).toEqual([0]);
  });

  it('OLL: 돌려도 같은 모양인 케이스만 그대로 낸다', () => {
    const set = setOf('oll');
    const yellowMask = (state: readonly number[]) => state.map((c) => (c === state[4] ? 1 : 0)).join('');
    for (const algCase of set.cases) {
      const masks = PRE_TURNS.map((k) => yellowMask(drillQuestion(algCase, k).start));
      const looksSame = masks.slice(1).some((m) => m === masks[0]);
      expect(drillTurns(algCase, 'oll').length === 1, algCase.id).toBe(looksSame);
    }
    // 대칭인 케이스가 있기는 하다 (전부는 아니다)
    const fixed = set.cases.filter((c) => drillTurns(c, 'oll').length === 1);
    expect(fixed.length).toBeGreaterThan(0);
    expect(fixed.length).toBeLessThan(15);
  });

  it('2-Look OLL: 십자 만들기는 엣지 모양만 본다', () => {
    expect(turnable('2look-oll', '2l-oll-dot')).toEqual([0]); // 어느 쪽이든 같다
    expect(turnable('2look-oll', '2l-oll-line')).toEqual([0]); // 반 바퀴 돌려도 일자
    expect(turnable('2look-oll', '2l-oll-L')).toEqual([0, 1, 2, 3]);
  });

  it('F2L: 짝이 윗층에 걸쳐 있으면 돌려 놓고, 둘 다 슬롯에 있으면 그대로 낸다', () => {
    const set = setOf('f2l');
    const fixed = set.cases.filter((c) => drillTurns(c, 'iso').length === 1);
    // 코너와 엣지가 모두 슬롯에 들어가 있는 케이스는 다섯 가지뿐이다
    expect(fixed.length).toBe(5);
    expect(new Set(fixed.map((c) => c.group)).size).toBe(1);
    expect(turnable('f2l', set.cases[0].id)).toEqual([0, 1, 2, 3]);
  });

  it('CMLL: 코너만 보고, 돌려도 같은 모양이면 그대로 낸다', () => {
    const set = setOf('cmll');
    expect(turnable('cmll', 'cmll-o-adj')).toEqual([0, 1, 2, 3]);
    // 대각선 코너 교환은 어느 쪽에서 봐도 같다
    expect(turnable('cmll', 'cmll-o-diag')).toEqual([0]);

    // 따로 만든 검사: 돌려 놓은 것이 원래 케이스와 같아 보이는지.
    // 코너 12칸의 무늬가, 옆면 네 색의 이름만 차례로 바꾸면(초록→주황→파랑→빨강…) 똑같아지면 같은 모양이다.
    const SPOTS = ['UFR', 'UFL', 'UBL', 'UBR'];
    const sideColors = (['F', 'R', 'B', 'L'] as Face[]).map((f) => centerColor(YELLOW_UP, f));
    const look = (state: CubeState, shift: number) =>
      SPOTS.flatMap((spot) =>
        [...spot].map((face) => {
          const color = colorAt(state, spot, face as Face);
          const at = sideColors.indexOf(color);
          return at < 0 ? color : sideColors[(at + shift) % 4];
        }),
      ).join('');
    for (const algCase of set.cases) {
      const plain = look(caseState(algCase), 0);
      const looksSame = ([1, 2, 3] as PreTurn[]).some((k) => {
        const turned = drillQuestion(algCase, k).start;
        return [0, 1, 2, 3].some((shift) => look(turned, shift) === plain);
      });
      expect(drillTurns(algCase, 'cmll').length === 1, algCase.id).toBe(looksSame);
    }
    const fixed = set.cases.filter((c) => drillTurns(c, 'cmll').length === 1);
    expect(fixed.length).toBeGreaterThan(0);
    expect(fixed.length).toBeLessThan(set.cases.length / 2);
  });

  it('pickTurn은 낼 수 있는 방향만, 고르게 고른다', () => {
    const random = rng(9);
    const t = caseOf('pll', 'pll-T');
    const counts = [0, 0, 0, 0];
    for (let n = 0; n < 4000; n++) counts[pickTurn(t, 'pll', random)] += 1;
    for (const count of counts) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
    const h = caseOf('pll', 'pll-H');
    for (let n = 0; n < 50; n++) expect(pickTurn(h, 'pll', random)).toBe(0);
    expect(pickTurn(t, 'pll', () => 0)).toBe(0);
    expect(pickTurn(t, 'pll', () => 0.999999)).toBe(3);
    expect(pickTurn(t, 'pll', () => 1)).toBe(3);
  });
});
