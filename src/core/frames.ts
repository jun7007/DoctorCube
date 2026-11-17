import { SOLVED, applyMoves, type CubeState } from './cube';
import { parseAlg } from './notation';

/**
 * 공식을 배울 때 큐브를 잡는 기본 방향: 노란색이 위(U), 흰색이 아래(D), 초록색이 앞(F).
 * 이때 오른쪽(R)은 주황, 왼쪽(L)은 빨강, 뒤(B)는 파랑이다.
 * 색 번호는 0 흰색, 1 빨강, 2 초록, 3 노랑, 4 주황, 5 파랑.
 */
export const YELLOW_UP: CubeState = applyMoves(SOLVED, parseAlg('z2'));
