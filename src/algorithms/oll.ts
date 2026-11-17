/**
 * OLL 57가지: 윗층 조각의 노란색을 모두 위로 돌리는 공식. 번호는 널리 쓰는 표준 번호다.
 * 모든 공식은 YELLOW_UP(노란색 위, 초록색 앞) 기준이고, 큐브를 돌려 잡은 채로 끝나지 않는다.
 * alts는 같은 케이스를 푸는 다른 공식이라, 윗면을 다른 방향으로 두고 시작할 수 있다.
 *
 * 묶음은 윗면에 보이는 노란색 모양으로 나눈다.
 */
import type { AlgCase } from './types';

const CROSS = '십자 (엣지 4개 맞음)';
const DOT = '점 (엣지 0개 맞음)';
const ALL_CORNERS = '코너 4개 맞음';
const SQUARE = '네모';
const SMALL_LIGHTNING = '작은 번개';
const BIG_LIGHTNING = '큰 번개';
const FISH = '물고기';
const KNIGHT = '나이트';
const AWKWARD = '어색한 모양';
const P_SHAPE = 'P 모양';
const T_SHAPE = 'T 모양';
const C_SHAPE = 'C 모양';
const W_SHAPE = 'W 모양';
const SMALL_L = '작은 ㄱ자';
const LINE = '일자';

const oll = (n: number, nick?: string) => ({
  id: `oll-${String(n).padStart(2, '0')}`,
  name: nick ? `OLL ${n} (${nick})` : `OLL ${n}`,
});

export const OLL_CASES: readonly AlgCase[] = [
  // ───────── 1~4: 점 ─────────
  { ...oll(1), group: DOT, alg: "R U2 R2 F R F' U2 R' F R F'", alts: ["R U' R2 D' r U' r' D R2 U R'"] },
  { ...oll(2), group: DOT, alg: "F R U R' U' F' f R U R' U' f'", alts: ["r U r' U2 r U2 R' U2 R U' r'"] },
  { ...oll(3), group: DOT, alg: "f R U R' U' f' U' F R U R' U' F'", alts: ["r' R2 U R' U r U2 r' U M'"] },
  { ...oll(4), group: DOT, alg: "f R U R' U' f' U F R U R' U' F'", alts: ["M U' r U2 r' U' R U' R' M'"] },

  // ───────── 5~16: 네모, 번개, 물고기, 나이트 ─────────
  { ...oll(5), group: SQUARE, alg: "r' U2 R U R' U r", alts: ["l' U2 L U L' U l"] },
  { ...oll(6), group: SQUARE, alg: "r U2 R' U' R U' r'" },
  { ...oll(7), group: SMALL_LIGHTNING, alg: "r U R' U R U2 r'" },
  { ...oll(8), group: SMALL_LIGHTNING, alg: "r' U' R U' R' U2 r", alts: ["l' U' L U' L' U2 l"] },
  { ...oll(9), group: FISH, alg: "R U R' U' R' F R2 U R' U' F'" },
  { ...oll(10), group: FISH, alg: "R U R' U R' F R F' R U2 R'" },
  { ...oll(11), group: SMALL_LIGHTNING, alg: "r U R' U R' F R F' R U2 r'", alts: ["r' R2 U R' U R U2 R' U M'"] },
  {
    ...oll(12),
    group: SMALL_LIGHTNING,
    alg: "M' R' U' R U' R' U2 R U' M",
    alts: ["F R U R' U' F' U F R U R' U' F'"],
  },
  { ...oll(13), group: KNIGHT, alg: "F U R U' R2 F' R U R U' R'", alts: ["r U' r' U' r U r' F' U F"] },
  { ...oll(14), group: KNIGHT, alg: "R' F R U R' F' R F U' F'" },
  { ...oll(15), group: KNIGHT, alg: "r' U' r R' U' R U r' U r", alts: ["l' U' l L' U' L U l' U l"] },
  { ...oll(16), group: KNIGHT, alg: "r U r' R U R' U' r U' r'" },

  // ───────── 17~20: 점 ─────────
  {
    ...oll(17),
    group: DOT,
    alg: "R U R' U R' F R F' U2 R' F R F'",
    alts: ["F R' F' R2 r' U R U' R' U' M'"],
  },
  {
    ...oll(18),
    group: DOT,
    alg: "r U R' U R U2 r2 U' R U' R' U2 r",
    alts: ["R U2 R2 F R F' U2 M' U R U' r'"],
  },
  { ...oll(19), group: DOT, alg: "M U R U R' U' M' R' F R F'", alts: ["r' R U R U R' U' M' R' F R F'"] },
  { ...oll(20), group: DOT, alg: "M U R U R' U' M2 U R U' r'", alts: ["r U R' U' M2 U R U' R' U' M'"] },

  // ───────── 21~27: 십자 (2단계 OLL의 둘째 단계) ─────────
  {
    ...oll(21, 'H'),
    group: CROSS,
    alg: "R U2 R' U' R U R' U' R U' R'",
    alts: ["F R U R' U' R U R' U' R U R' U' F'"],
    note: '위를 보는 노란 코너가 없어요. 코너의 노란색이 앞면에 둘, 뒷면에 둘 보이게 잡아요.',
  },
  {
    ...oll(22, 'Pi'),
    group: CROSS,
    alg: "R U2 R2 U' R2 U' R2 U2 R",
    note: '위를 보는 노란 코너가 없어요. 코너의 노란색 둘이 왼쪽 면에 나란히 보이게 잡아요.',
  },
  {
    ...oll(23),
    group: CROSS,
    alg: "R2 D' R U2 R' D R U2 R",
    alts: ["R2 D R' U2 R D' R' U2 R'"],
    note: '노란 코너 둘이 앞줄에 있어요. 나머지 둘의 노란색이 뒷면에 나란히 보여요(헤드라이트).',
  },
  {
    ...oll(24),
    group: CROSS,
    alg: "r U R' U' r' F R F'",
    note: '노란 코너 둘이 오른쪽 줄에 있어요. 왼쪽 두 코너의 노란색이 하나는 앞, 하나는 뒤를 봐요.',
  },
  {
    ...oll(25),
    group: CROSS,
    alg: "F' r U R' U' r' F R",
    alts: ["R' F R B' R' F' R B"],
    note: '노란 코너 둘이 대각선으로 있어요. 앞-오른쪽 코너의 노란색이 앞을 보게 잡아요.',
  },
  {
    ...oll(26, 'Antisune'),
    group: CROSS,
    alg: "R U2 R' U' R U' R'",
    alts: ["R' U' R U' R' U2 R"],
    note: '노란 코너가 하나뿐이에요. 그 코너를 뒤-오른쪽에 뒀을 때 앞-오른쪽 코너의 노란색이 오른쪽을 봐요.',
  },
  {
    ...oll(27, 'Sune'),
    group: CROSS,
    alg: "R U R' U R U2 R'",
    alts: ["R' U2 R U R' U R"],
    note: '노란 코너가 하나뿐이에요. 그 코너를 앞-왼쪽에 뒀을 때 앞-오른쪽 코너의 노란색이 앞을 봐요.',
  },

  // ───────── 28~57 ─────────
  { ...oll(28), group: ALL_CORNERS, alg: "r U R' U' r' R U R U' R'", alts: ["M' U M U2 M' U M"] },
  {
    ...oll(29),
    group: AWKWARD,
    alg: "R U R' U' R U' R' F' U' F R U R'",
    alts: ["r2 D' r U r' D r2 U' r' U' r"],
  },
  {
    ...oll(30),
    group: AWKWARD,
    alg: "F R' F R2 U' R' U' R U R' F2",
    alts: ["F U R U2 R' U' R U2 R' U' F'"],
  },
  { ...oll(31), group: P_SHAPE, alg: "R' U' F U R U' R' F' R" },
  { ...oll(32), group: P_SHAPE, alg: "L U F' U' L' U L F L'", alts: ["S R U R' U' R' F R f'"] },
  { ...oll(33), group: T_SHAPE, alg: "R U R' U' R' F R F'" },
  { ...oll(34), group: C_SHAPE, alg: "R U R2 U' R' F R U R U' F'", alts: ["R U R' U' B' R' F R F' B"] },
  { ...oll(35), group: FISH, alg: "R U2 R2 F R F' R U2 R'" },
  {
    ...oll(36),
    group: W_SHAPE,
    alg: "L' U' L U' L' U L U L F' L' F",
    alts: ["R U R' F' R U R' U' R' F R U' R' F R F'"],
  },
  { ...oll(37), group: FISH, alg: "F R' F' R U R U' R'", alts: ["F R U' R' U' R U R' F'"] },
  { ...oll(38), group: W_SHAPE, alg: "R U R' U R U' R' U' R' F R F'" },
  { ...oll(39), group: BIG_LIGHTNING, alg: "L F' L' U' L U F U' L'", alts: ["R U R' F' U' F U R U2 R'"] },
  { ...oll(40), group: BIG_LIGHTNING, alg: "R' F R U R' U' F' U R" },
  { ...oll(41), group: AWKWARD, alg: "R U R' U R U2 R' F R U R' U' F'" },
  { ...oll(42), group: AWKWARD, alg: "R' U' R U' R' U2 R F R U R' U' F'" },
  { ...oll(43), group: P_SHAPE, alg: "F' U' L' U L F", alts: ["R' U' F' U F R"] },
  { ...oll(44), group: P_SHAPE, alg: "F U R U' R' F'", alts: ["f R U R' U' f'"] },
  { ...oll(45), group: T_SHAPE, alg: "F R U R' U' F'" },
  { ...oll(46), group: C_SHAPE, alg: "R' U' R' F R F' U R" },
  {
    ...oll(47),
    group: SMALL_L,
    alg: "R' U' R' F R F' R' F R F' U R",
    alts: ["F' L' U' L U L' U' L U F"],
  },
  { ...oll(48), group: SMALL_L, alg: "F R U R' U' R U R' U' F'" },
  { ...oll(49), group: SMALL_L, alg: "r U' r2 U r2 U r2 U' r", alts: ["R B' R2 F R2 B R2 F' R"] },
  { ...oll(50), group: SMALL_L, alg: "r' U r2 U' r2 U' r2 U r'", alts: ["R' F R2 B' R2 F' R2 B R'"] },
  {
    ...oll(51),
    group: LINE,
    alg: "F U R U' R' U R U' R' F'",
    alts: ["f R U R' U' R U R' U' f'"],
  },
  { ...oll(52), group: LINE, alg: "R U R' U R U' B U' B' R'", alts: ["R' F' U' F U' R U R' U R"] },
  {
    ...oll(53),
    group: SMALL_L,
    alg: "l' U2 L U L' U' L U L' U l",
    alts: ["r' U2 R U R' U' R U R' U r"],
  },
  {
    ...oll(54),
    group: SMALL_L,
    alg: "r U2 R' U' R U R' U' R U' r'",
    alts: ["r U R' U R U' R' U R U2 r'"],
  },
  {
    ...oll(55),
    group: LINE,
    alg: "R' F R U R U' R2 F' R2 U' R' U R U R'",
    alts: ["R U2 R2 U' R U' R' U2 F R F'"],
  },
  {
    ...oll(56),
    group: LINE,
    alg: "r' U' r U' R' U R U' R' U R r' U r",
    alts: ["r U r' U R U' R' U R U' R' r U' r'"],
  },
  { ...oll(57), group: ALL_CORNERS, alg: "R U R' U' M' U R U' r'" },
];
