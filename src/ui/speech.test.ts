import { describe, expect, it } from 'vitest';
import { BASE_MOVES, type BaseMove } from '../core/cube';
import { parseAlg } from '../core/notation';
import { moveSpeech } from './speech';

describe('동작을 읽는 말', () => {
  it('기본 회전, 프라임, 두 번', () => {
    const say = (alg: string) => parseAlg(alg).map(moveSpeech);
    expect(say("R R' R2")).toEqual(['알', '알 프라임', '알 두 번']);
    expect(say("U F' D2 L B")).toEqual(['유', '에프 프라임', '디 두 번', '엘', '비']);
  });

  it('넓은 회전, 중간층, 통째로 돌리기', () => {
    const say = (alg: string) => parseAlg(alg).map(moveSpeech);
    expect(say("r f' Rw2")).toEqual(['넓게 알', '넓게 에프 프라임', '넓게 알 두 번']);
    expect(say("M E' S2")).toEqual(['엠', '이 프라임', '에스 두 번']);
    expect(say("x y' z2")).toEqual(['통째로 엑스', '통째로 와이 프라임', '통째로 지 두 번']);
  });

  it('모든 기호에 읽는 말이 있고, 서로 다른 동작은 다르게 읽는다', () => {
    const all = new Set<string>();
    for (const base of Object.keys(BASE_MOVES) as BaseMove[]) {
      for (const amount of [1, -1, 2] as const) {
        const text = moveSpeech({ base, amount });
        expect(text).not.toContain('undefined');
        all.add(text);
      }
    }
    expect(all.size).toBe(Object.keys(BASE_MOVES).length * 3);
  });
});
