import { SOLVED, applyMoves, type CubeState } from './cube';
import { parseAlg } from './notation';

/**
 * 공식을 배울 때 큐브를 잡는 기본 방향: 노란색이 위(U), 흰색이 아래(D), 초록색이 앞(F).
 * 이때 오른쪽(R)은 주황, 왼쪽(L)은 빨강, 뒤(B)는 파랑이다.
 * 색 번호는 0 흰색, 1 빨강, 2 초록, 3 노랑, 4 주황, 5 파랑.
 */
export const YELLOW_UP: CubeState = applyMoves(SOLVED, parseAlg('z2'));

const ROTATIONS = ['', 'x', "x'", 'x2', 'z', "z'"].flatMap((a) => ['', 'y', "y'", 'y2'].map((b) => parseAlg(`${a} ${b}`)));

/**
 * 큐브를 통째로 돌려 기본 방향(흰색 위, 초록색 앞)으로 맞춘 상태를 돌려준다.
 * 센터 배치가 정상이 아니면 null.
 */
export function toStandardOrientation(state: CubeState): CubeState | null {
  for (const rotation of ROTATIONS) {
    const s = applyMoves(state, rotation);
    if ([0, 1, 2, 3, 4, 5].every((f) => s[f * 9 + 4] === f)) return s;
  }
  return null;
}
