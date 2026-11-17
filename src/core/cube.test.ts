import { describe, expect, it } from 'vitest';
import {
  BASE_MOVES,
  SOLVED,
  applyMoves,
  isSolved,
  toFaceletString,
  turnToMove,
  type BaseMove,
} from './cube';
import { algToString, invertAlg, parseAlg } from './notation';
import { generateScramble } from './scramble';

const run = (alg: string, from = SOLVED) => applyMoves(from, parseAlg(alg));
const str = (alg: string) => toFaceletString(run(alg));

describe('기본 회전', () => {
  // 널리 쓰이는 Kociemba 표기 기준값
  it('R', () => {
    expect(str('R')).toBe('UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB');
  });
  it('U', () => {
    expect(str('U')).toBe('UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB');
  });
  it('F', () => {
    expect(str('F')).toBe('UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB');
  });
  it('D', () => {
    expect(str('D')).toBe('UUUUUUUUURRRRRRFFFFFFFFFLLLDDDDDDDDDLLLLLLBBBBBBBBBRRR');
  });
  it('L', () => {
    expect(str('L')).toBe('BUUBUUBUURRRRRRRRRUFFUFFUFFFDDFDDFDDLLLLLLLLLBBDBBDBBD');
  });
  it('B', () => {
    expect(str('B')).toBe('RRRUUUUUURRDRRDRRDFFFFFFFFFDDDDDDLLLULLULLULLBBBBBBBBB');
  });

  it('모든 기호는 네 번 돌리면 제자리', () => {
    for (const base of Object.keys(BASE_MOVES) as BaseMove[]) {
      expect(isSolved(run(`${base} ${base} ${base} ${base}`)), base).toBe(true);
      expect(toFaceletString(run(`${base} ${base}'`)), base).toBe(toFaceletString(SOLVED));
      expect(toFaceletString(run(`${base}2`)), base).toBe(toFaceletString(run(`${base} ${base}`)));
    }
  });
});

describe('조합 동작', () => {
  it("(R U R' U') 여섯 번이면 제자리", () => {
    expect(toFaceletString(run("R U R' U' ".repeat(6)))).toBe(toFaceletString(SOLVED));
  });
  it('T-퍼뮤테이션 두 번이면 제자리', () => {
    const t = "R U R' U' R' F R2 U' R' U' R U R' F'";
    expect(isSolved(run(t))).toBe(false);
    expect(toFaceletString(run(`${t} ${t}`))).toBe(toFaceletString(SOLVED));
  });
  it('넓은 회전, 중간층, 전체 회전의 관계', () => {
    expect(str('r')).toBe(str("R M'"));
    expect(str('l')).toBe(str('L M'));
    expect(str('u')).toBe(str("U E'"));
    expect(str('d')).toBe(str('D E'));
    expect(str('f')).toBe(str('F S'));
    expect(str('b')).toBe(str("B S'"));
    expect(str('x')).toBe(str("R M' L'"));
    expect(str('y')).toBe(str("U E' D'"));
    expect(str('z')).toBe(str("F S B'"));
  });
  it('전체 회전만 한 상태는 완성으로 본다', () => {
    expect(isSolved(run("x y2 z'"))).toBe(true);
    expect(isSolved(run('M'))).toBe(false);
  });
  it('슈퍼플립은 두 번 하면 제자리', () => {
    const flip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
    expect(isSolved(run(flip))).toBe(false);
    expect(toFaceletString(run(`${flip} ${flip}`))).toBe(toFaceletString(SOLVED));
  });
});

describe('표기법', () => {
  it('문자열 ↔ 동작', () => {
    expect(algToString(parseAlg("(R U R' U') Rw2 x' M2"))).toBe("R U R' U' r2 x' M2");
  });
  it('모르는 기호는 오류', () => {
    expect(() => parseAlg('R Q')).toThrow();
    expect(() => parseAlg('Mw')).toThrow();
  });
  it('공식 뒤에 역공식을 하면 제자리', () => {
    const alg = parseAlg("R U2 F' L D B2 r M' x u'");
    const state = applyMoves(applyMoves(SOLVED, alg), invertAlg(alg));
    expect(toFaceletString(state)).toBe(toFaceletString(SOLVED));
  });
});

describe('스크램블', () => {
  it('길이와 규칙', () => {
    for (let n = 0; n < 50; n++) {
      const s = generateScramble();
      expect(s).toHaveLength(25);
      for (let i = 1; i < s.length; i++) expect(s[i].base).not.toBe(s[i - 1].base);
      for (let i = 2; i < s.length; i++) {
        const axes = [s[i], s[i - 1], s[i - 2]].map((m) => BASE_MOVES[m.base].axis);
        expect(axes[0] === axes[1] && axes[1] === axes[2]).toBe(false);
      }
    }
  });
});

describe('스와이프 해석', () => {
  it('(축, 층, 방향) → 기호', () => {
    expect(turnToMove(0, 1, -1)).toEqual({ base: 'R', amount: 1 });
    expect(turnToMove(0, 1, 1)).toEqual({ base: 'R', amount: -1 });
    expect(turnToMove(0, -1, 1)).toEqual({ base: 'L', amount: 1 });
    expect(turnToMove(1, 0, 1)).toEqual({ base: 'E', amount: 1 });
    expect(turnToMove(2, 0, 1)).toEqual({ base: 'S', amount: -1 });
  });
});
