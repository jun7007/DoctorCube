/**
 * 패턴 갤러리: 다 맞춘 큐브(흰색 위, 초록색 앞)에 공식을 돌리면 생기는 예쁜 무늬들.
 * 공식마다 "어떤 무늬인지"를 patterns.test.ts에서 구조로 정의해 검증한다.
 */
import { SOLVED, applyMoves, type CubeState } from '../core/cube';
import { parseAlg } from '../core/notation';

export interface CubePattern {
  /** 고유 id. 예: 'pattern-checkerboard' */
  id: string;
  /** 화면에 보이는 이름 (한국어) */
  name: string;
  /** 완성 상태에서 돌리는 공식. core/notation의 parseAlg로 읽을 수 있어야 한다 */
  alg: string;
  /** 어떤 모양이 되는지 한 문장 (한국어) */
  note: string;
}

export const PATTERNS: readonly CubePattern[] = [
  {
    id: 'pattern-checkerboard',
    name: '체커보드',
    alg: 'M2 E2 S2',
    note: '여섯 면이 모두 마주 보는 면의 색과 번갈아 놓인 바둑판 무늬가 돼요.',
  },
  {
    id: 'pattern-six-spots',
    name: '여섯 개의 점',
    alg: "U D' R L' F B' U D'",
    note: '면마다 가운데 한 칸만 다른 색이라 점이 여섯 개 찍힌 것처럼 보여요.',
  },
  {
    id: 'pattern-four-spots',
    name: '네 개의 점',
    alg: "F2 B2 U D' R2 L2 U D'",
    note: '옆면 네 곳에만 가운데에 점이 생기고 위아래 면은 그대로예요.',
  },
  {
    id: 'pattern-zigzag',
    name: '지그재그',
    alg: 'R L F B R L F B R L F B',
    note: '옆면마다 대각선 줄이 생겨서 큐브를 한 바퀴 도는 지그재그가 돼요.',
  },
  {
    id: 'pattern-crosses',
    name: '십자 무늬',
    alg: "R2 L' D F2 R' D' R' L U' D R D B2 R' U D2",
    note: '여섯 면 모두 가운데에 더하기(+) 모양이 남고 네 귀퉁이만 다른 색이 돼요.',
  },
  {
    id: 'pattern-six-ts',
    name: '여섯 개의 T',
    alg: "F2 R2 U2 F' B D2 L2 F B",
    note: '여섯 면 모두에 T자 모양이 생겨요.',
  },
  {
    id: 'pattern-stripes',
    name: '세로 줄무늬',
    alg: "F U F R L2 B D' R D2 L D' B R2 L F U F",
    note: '옆면마다 세 가지 색의 세로 줄이 나란히 서요.',
  },
  {
    id: 'pattern-checkerboard-3',
    name: '이웃 색 체커보드',
    alg: "F B2 R' D2 B R U D' R L' D' F' R2 D F2 B'",
    note: '바둑판 무늬인데 마주 보는 면이 아니라 이웃한 면의 색이 섞여요.',
  },
  {
    id: 'pattern-tricolor',
    name: '세 색 체커보드',
    alg: "U' R2 L2 F2 B2 U' R L F B' U F2 D2 R2 L2 F2 U2 F2 U' F2",
    note: '면마다 센터, 엣지, 코너 칸이 서로 다른 세 가지 색인 바둑판 무늬가 돼요.',
  },
  {
    id: 'pattern-cube-in-cube',
    name: '큐브 속 큐브',
    alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    note: '큰 큐브의 꼭짓점에 작은 2×2 큐브가 박혀 있는 것처럼 보여요.',
  },
  {
    id: 'pattern-cube-in-cube-in-cube',
    name: '큐브 속 큐브 속 큐브',
    alg: "F R' U' F' U L' B U' B2 U' F' R' B R2 F U L U",
    note: '작은 큐브 안에 한 칸짜리 큐브가 또 들어 있어서 세 겹으로 보여요.',
  },
  {
    id: 'pattern-snake',
    name: '뱀',
    alg: "F U L' U' B F' L B' R L' D B D' R'",
    note: '한 줄로 이어진 띠가 여섯 면을 모두 지나며 큐브를 휘감아요.',
  },
  {
    id: 'pattern-rings',
    name: '두 개의 고리',
    alg: "F D F' D2 L' B' U L D R U L' F' U L U2",
    note: '마주 보는 두 꼭짓점 둘레에 고리가 하나씩 생겨요.',
  },
  {
    id: 'pattern-superflip',
    name: '슈퍼플립',
    alg: "(M' U' M' U' M' U' M' U') x y (M' U' M' U' M' U' M' U') x y (M' U' M' U' M' U' M' U') x y",
    note: '모든 엣지가 제자리에서 뒤집혀서 면마다 십자 자리에 네 가지 색이 보여요.',
  },
];

/** 완성 상태에 패턴 공식을 돌린 모습 */
export function patternState(pattern: CubePattern): CubeState {
  return applyMoves(SOLVED, parseAlg(pattern.alg));
}

/** 공식을 몇 번 되풀이하면 다시 완성 상태가 되는지 (찾지 못하면 0) */
export function patternOrder(pattern: CubePattern): number {
  const moves = parseAlg(pattern.alg);
  let state = SOLVED;
  for (let n = 1; n <= 1260; n++) {
    state = applyMoves(state, moves);
    if (state.every((color, i) => color === SOLVED[i])) return n;
  }
  return 0;
}
