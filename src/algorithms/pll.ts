/**
 * PLL 21가지: 윗면이 모두 노란색이 된 뒤, 윗층 조각의 자리를 맞추는 공식.
 * 모든 공식은 YELLOW_UP(노란색 위, 초록색 앞) 기준이고, 큐브를 돌려 잡은 채로 끝나지 않는다.
 * 대표 공식은 끝에 U를 더 돌릴 필요가 없게 적었다.
 * alts는 같은 케이스를 푸는 다른 공식이라, 윗면을 다른 방향으로 두고 시작하거나 끝에 U가 남을 수 있다.
 *
 * note에서 쓰는 말:
 * - 헤드라이트: 한 옆면의 양쪽 코너가 같은 색
 * - 블록: 코너와 바로 옆 엣지가 같은 색 (2칸)
 * - 줄: 한 옆면의 3칸이 모두 같은 색
 */
import type { AlgCase } from './types';

const EDGES_ONLY = '엣지만 바뀜';
const CORNERS_ONLY = '코너만 바뀜';
const ADJACENT = '이웃한 코너 교환';
const DIAGONAL = '대각선 코너 교환';
const G_PERMS = 'G 계열 (코너 3개 + 엣지 3개)';

export const PLL_CASES: readonly AlgCase[] = [
  // ───────── 엣지만 바뀜 ─────────
  {
    id: 'pll-Ua',
    name: 'Ua',
    group: EDGES_ONLY,
    alg: "M2 U M U2 M' U M2",
    alts: ["R U' R U R U R U' R' U' R2"],
    note: '한 면은 줄이고(뒤에 둬요) 나머지 세 면은 헤드라이트예요. 앞 엣지가 오른쪽 면 색이면 Ua예요.',
  },
  {
    id: 'pll-Ub',
    name: 'Ub',
    group: EDGES_ONLY,
    alg: "M2 U' M U2 M' U' M2",
    alts: ["R2 U R U R' U' R' U' R' U R'"],
    note: '한 면은 줄이고(뒤에 둬요) 나머지 세 면은 헤드라이트예요. 앞 엣지가 왼쪽 면 색이면 Ub예요.',
  },
  {
    id: 'pll-H',
    name: 'H',
    group: EDGES_ONLY,
    alg: 'M2 U M2 U2 M2 U M2',
    note: '네 면 모두 헤드라이트이고, 가운데 엣지는 맞은편 면 색이에요.',
  },
  {
    id: 'pll-Z',
    name: 'Z',
    group: EDGES_ONLY,
    alg: "M' U M2 U M2 U M' U2 M2 U'",
    alts: ["M2 U M2 U M' U2 M2 U2 M' U2"],
    note: '네 면 모두 헤드라이트이고, 가운데 엣지는 바로 옆면 색이에요. 앞 엣지가 왼쪽 면 색이 되게 잡아요.',
  },

  // ───────── 코너만 바뀜 ─────────
  {
    id: 'pll-Aa',
    name: 'Aa',
    group: CORNERS_ONLY,
    alg: "x R' U R' D2 R U' R' D2 R2 x'",
    alts: ["x L2 D2 L' U' L D2 L' U L' x'"],
    note: '엣지는 모두 맞고 헤드라이트가 한 면에만 있어요. 헤드라이트를 뒤에 두고 시작해요.',
  },
  {
    id: 'pll-Ab',
    name: 'Ab',
    group: CORNERS_ONLY,
    alg: "x R2 D2 R U R' D2 R U' R x'",
    alts: ["x' L2 D2 L U L' D2 L U' L x"],
    note: '엣지는 모두 맞고 헤드라이트가 한 면에만 있어요. 헤드라이트를 오른쪽에 두고 시작해요.',
  },
  {
    id: 'pll-E',
    name: 'E',
    group: CORNERS_ONLY,
    alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x",
    alts: ["x' L' U L D' L' U' L D L' U' L D' L' U L D x"],
    note: '엣지는 모두 맞는데 헤드라이트가 어느 면에도 없어요.',
  },

  // ───────── 이웃한 코너 교환 ─────────
  {
    id: 'pll-T',
    name: 'T',
    group: ADJACENT,
    alg: "R U R' U' R' F R2 U' R' U' R U R' F'",
    note: '헤드라이트가 왼쪽에 있고, 앞면과 뒷면에 헤드라이트 쪽으로 붙은 블록이 하나씩 있어요.',
  },
  {
    id: 'pll-F',
    name: 'F',
    group: ADJACENT,
    alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
    note: '왼쪽 면만 줄이고, 다른 면에는 블록도 헤드라이트도 없어요.',
  },
  {
    id: 'pll-Ja',
    name: 'Ja',
    group: ADJACENT,
    alg: "x R2 F R F' R U2 r' U r U2 x'",
    alts: ["L' U' L F L' U' L U L F' L2 U L U", "R' U L' U2 R U' R' U2 R L U'"],
    note: '왼쪽 면이 줄이고, 앞면의 블록이 줄과 붙어 있어요(앞면 왼쪽 2칸).',
  },
  {
    id: 'pll-Jb',
    name: 'Jb',
    group: ADJACENT,
    alg: "R U R' F' R U R' U' R' F R2 U' R' U'",
    note: '왼쪽 면이 줄이고, 앞면의 블록이 줄과 떨어져 있어요(앞면 오른쪽 2칸).',
  },
  {
    id: 'pll-Ra',
    name: 'Ra',
    group: ADJACENT,
    alg: "R U' R' U' R U R D R' U' R D' R' U2 R' U'",
    alts: ["R U R' F' R U2 R' U2 R' F R U R U2 R' U'"],
    note: '헤드라이트가 왼쪽에 있고, 블록은 앞면에 하나뿐이에요(헤드라이트 쪽 2칸).',
  },
  {
    id: 'pll-Rb',
    name: 'Rb',
    group: ADJACENT,
    alg: "R2 F R U R U' R' F' R U2 R' U2 R U",
    alts: ["R' U2 R U2 R' F R U R' U' R' F' R2 U'"],
    note: '헤드라이트가 왼쪽에 있고, 블록은 뒷면에 하나뿐이에요(헤드라이트 쪽 2칸).',
  },

  // ───────── 대각선 코너 교환 ─────────
  {
    id: 'pll-V',
    name: 'V',
    group: DIAGONAL,
    alg: "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2",
    alts: ["R' U R' U' B' R' B2 U' B' U B' R B R"],
    note: '헤드라이트가 없고, 앞-왼쪽 코너가 양옆 엣지와 모두 붙어 큰 블록을 이뤄요.',
  },
  {
    id: 'pll-Y',
    name: 'Y',
    group: DIAGONAL,
    alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
    alts: ["F R' F R2 U' R' U' R U R' F' R U R' U' F'"],
    note: '헤드라이트가 없고, 블록 두 개가 떨어져 있어요(앞면 왼쪽, 오른쪽 면 뒤쪽).',
  },
  {
    id: 'pll-Na',
    name: 'Na',
    group: DIAGONAL,
    alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
    alts: ["z U R' D R2 U' R D' U R' D R2 U' R D' z'"],
    note: '네 면 모두 블록이 있고 헤드라이트가 없어요. 면을 마주 볼 때 블록이 오른쪽 2칸이에요.',
  },
  {
    id: 'pll-Nb',
    name: 'Nb',
    group: DIAGONAL,
    alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R",
    alts: ["r' D' F r U' r' F' D r2 U r' U' r' F r F'", "z U' R D' R2 U R' D U' R D' R2 U R' D z'"],
    note: '네 면 모두 블록이 있고 헤드라이트가 없어요. 면을 마주 볼 때 블록이 왼쪽 2칸이에요.',
  },

  // ───────── G 계열 ─────────
  {
    id: 'pll-Ga',
    name: 'Ga',
    group: G_PERMS,
    alg: "R2 U R' U R' U' R U' R2 D U' R' U R D'",
    note: '헤드라이트를 왼쪽에 두면 하나뿐인 블록이 앞면에 있어요(헤드라이트에서 먼 쪽 2칸).',
  },
  {
    id: 'pll-Gb',
    name: 'Gb',
    group: G_PERMS,
    alg: "R' U' R U D' R2 U R' U R U' R U' R2 D",
    note: '헤드라이트를 왼쪽에 두면 하나뿐인 블록이 오른쪽 면 뒤쪽에 있어요.',
  },
  {
    id: 'pll-Gc',
    name: 'Gc',
    group: G_PERMS,
    alg: "R2 U' R U' R U R' U R2 D' U R U' R' D",
    note: '헤드라이트를 왼쪽에 두면 하나뿐인 블록이 뒷면에 있어요(헤드라이트에서 먼 쪽 2칸).',
  },
  {
    id: 'pll-Gd',
    name: 'Gd',
    group: G_PERMS,
    alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'",
    note: '헤드라이트를 왼쪽에 두면 하나뿐인 블록이 오른쪽 면 앞쪽에 있어요.',
  },
];
