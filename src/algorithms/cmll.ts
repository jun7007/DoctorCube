/**
 * CMLL 42가지: Roux 방식에서 양쪽 블록을 만든 뒤, 윗층 코너 4개의 방향과 자리를 한 번에 맞추는 공식.
 * 모든 공식은 YELLOW_UP(노란색 위, 초록색 앞) 기준이고, 큐브를 돌려 잡은 채로 끝나지 않는다.
 *
 * 양쪽 1×2×3 블록(왼쪽·오른쪽 아래 두 층)은 그대로 두지만,
 * 가운데 줄(M)과 윗층 엣지는 마음대로 섞어도 된다 (그 뒤 LSE 단계에서 맞춘다).
 * 공식 뒤에 U를 한 번 더 돌려야 코너가 블록과 맞을 수 있다.
 *
 * 이름은 널리 쓰는 번호를 따른다: O 2가지, H 4가지, 나머지 묶음은 6가지씩.
 * 묶음은 코너의 노란색이 어디를 보는지로 나눈다.
 */
import type { AlgCase } from './types';

const O = 'O (노란색이 모두 위)';
const H = 'H (노란색이 마주 보는 두 옆면에 둘씩)';
const PI = 'Pi (노란색이 한 옆면에 둘, 양옆 면에 하나씩)';
const U = 'U (노란색 위 코너 둘이 이웃, 나머지는 같은 옆면)';
const T = 'T (노란색 위 코너 둘이 이웃, 나머지는 서로 반대쪽)';
const SUNE = 'Sune (노란색 위 코너 하나)';
const ANTISUNE = 'Antisune (노란색 위 코너 하나, Sune의 좌우 대칭)';
const L = 'L (노란색 위 코너 둘이 대각선)';

const numbered = (prefix: string, name: string, group: string, algs: readonly string[]): AlgCase[] =>
  algs.map((alg, i) => ({ id: `cmll-${prefix}-${i + 1}`, name: `${name} ${i + 1}`, group, alg }));

export const CMLL_CASES: readonly AlgCase[] = [
  // ───────── O: 방향은 맞고 자리만 다름 ─────────
  {
    id: 'cmll-o-adj',
    name: 'O Adj',
    group: O,
    alg: "R U R' F' R U R' U' R' F R2 U' R'",
    note: '이웃한 두 코너의 자리를 바꿔요.',
  },
  {
    id: 'cmll-o-diag',
    name: 'O Diag',
    group: O,
    alg: "r2 D r' U r D' R2 U' F' U' F",
    alts: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"],
    note: '대각선에 있는 두 코너의 자리를 바꿔요.',
  },

  // ───────── H ─────────
  ...numbered('h', 'H', H, [
    "R U2 R' U' R U R' U' R U' R'",
    "F R U R' U' R U R' U' R U R' U' F'",
    "R U2 R2 F R F' U2 R' F R F'",
    "r U' r2 D' r U' r' D r2 U r'",
  ]),

  // ───────── Pi ─────────
  ...numbered('pi', 'Pi', PI, [
    "F R U R' U' R U R' U' F'",
    "F R' F' R U2 R U' R' U R U2 R'",
    "R' F R U F U' R U R' U' F'",
    "R U2 R' U' R U R' U2 R' F R F'",
    "r U' r2 D' r U r' D r2 U r'",
    "R' U' R' F R F' R U' R' U2 R",
  ]),

  // ───────── U ─────────
  ...numbered('u', 'U', U, [
    "R2 D R' U2 R D' R' U2 R'",
    "R2 D' R U2 R' D R U2 R",
    "R2 F U' F U F2 R2 U' R' F R",
    "F R2 D R' U R D' R2 U' F'",
    "r U' r' U r' D' r U' r' D r",
    "F R U R' U' F'",
  ]),

  // ───────── T ─────────
  ...numbered('t', 'T', T, [
    "R U R' U' R' F R F'",
    "L' U' L U L F' L' F",
    "F R' F R2 U' R' U' R U R' F2",
    "r' U r U2 R2 F R F' R",
    "r' D' r U r' D r U' r U r'",
    "r2 D' r U r' D r2 U' r' U' r",
  ]),

  // ───────── Sune ─────────
  ...numbered('s', 'Sune', SUNE, [
    "R U R' U R U2 R'",
    "L' U2 L U2 L F' L' F",
    "F R' F' R U2 R U2 R'",
    "R U R' U' R' F R F' R U R' U R U2 R'",
    "R U R' U R' F R F' R U2 R'",
    "R U' L' U R' U' L",
  ]),

  // ───────── Antisune ─────────
  ...numbered('as', 'Antisune', ANTISUNE, [
    "R' U' R U' R' U2 R",
    "R2 D R' U R D' R' U R' U' R U' R'",
    "F' L F L' U2 L' U2 L",
    "R U2 R' U2 R' F R F'",
    "L' U R U' L U R'",
    "R' U' R U' R' U R' F R F' U R",
  ]),

  // ───────── L ─────────
  ...numbered('l', 'L', L, [
    "F R U' R' U' R U R' F'",
    "F R' F' R U R U' R'",
    "R U2 R' U' R U R' U' R U R' U' R U' R'",
    "R U2 R D R' U2 R D' R2",
    "R' U' R U R' F' R U R' U' R' F R2",
    "R' U2 R' D' R U2 R' D R2",
  ]),
];
