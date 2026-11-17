import { BASE_MOVES, type BaseMove, type Move } from './cube';

const FACE_MOVES: readonly BaseMove[] = ['U', 'D', 'L', 'R', 'F', 'B'];
const AMOUNTS = [1, -1, 2] as const;

/**
 * 무작위 회전을 이어 붙인 스크램블.
 * 같은 면을 연달아 돌리거나(R R'), 같은 축을 세 번 연속 돌리는(R L R) 낭비는 피한다.
 * (자유 모드는 무작위 "상태" 스크램블을 쓰고, 그것이 늦을 때 이것으로 대신한다.)
 */
export function generateScramble(length = 25, random: () => number = Math.random): Move[] {
  const out: Move[] = [];
  while (out.length < length) {
    const base = FACE_MOVES[Math.floor(random() * FACE_MOVES.length)];
    const last = out.at(-1);
    const prev = out.at(-2);
    if (last && last.base === base) continue;
    const axis = BASE_MOVES[base].axis;
    if (last && prev && BASE_MOVES[last.base].axis === axis && BASE_MOVES[prev.base].axis === axis) continue;
    out.push({ base, amount: AMOUNTS[Math.floor(random() * AMOUNTS.length)] });
  }
  return out;
}
