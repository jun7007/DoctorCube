/**
 * 2단계 OLL / 2단계 PLL: 공식을 조금만 외워도 윗층을 끝낼 수 있는 입문용 묶음.
 *
 * 1. OLL 엣지: 노란 십자를 만든다 (TWO_LOOK_OLL_EDGES)
 * 2. OLL 코너: 윗면을 모두 노란색으로 만든다 (TWO_LOOK_OLL_CORNERS)
 * 3. PLL 코너: 코너 자리를 맞춘다 (TWO_LOOK_PLL_CORNERS)
 * 4. PLL 엣지: 엣지 자리를 맞춘다 (TWO_LOOK_PLL_EDGES)
 */
import type { AlgCase } from './types';

const YELLOW_CROSS = '노란 십자 만들기';

/** 노란 십자를 만드는 세 가지. 코너가 어떤 모양이든 엣지 모양만 보고 고른다. */
export const TWO_LOOK_OLL_EDGES: readonly AlgCase[] = [
  {
    id: '2l-oll-dot',
    name: '점',
    group: YELLOW_CROSS,
    alg: "F R U R' U' F' f R U R' U' f'",
    note: '윗면에 노란 엣지가 하나도 없어요. 어느 쪽을 앞으로 잡아도 돼요.',
  },
  {
    id: '2l-oll-L',
    name: 'ㄱ자',
    group: YELLOW_CROSS,
    alg: "f R U R' U' f'",
    note: '노란 엣지 두 개가 이웃해 있어요. 그 둘이 앞과 오른쪽에 오게 잡아요.',
  },
  {
    id: '2l-oll-line',
    name: '일자',
    group: YELLOW_CROSS,
    alg: "F R U R' U' F'",
    note: '노란 엣지 두 개가 마주 보고 있어요. 일자가 가로(왼쪽-오른쪽)로 놓이게 잡아요.',
  },
];

/** 노란 십자가 된 뒤 코너를 맞추는 OLL 일곱 가지 (OLL 21~27) */
export const TWO_LOOK_OLL_CORNERS: readonly string[] = [
  'oll-21',
  'oll-22',
  'oll-23',
  'oll-24',
  'oll-25',
  'oll-26',
  'oll-27',
];

/**
 * 코너 자리를 맞추는 PLL 두 가지. 흔히 가르치는 대로 T와 Y를 쓴다.
 * - 이웃한 코너 교환: T (헤드라이트가 한 면에 있을 때, 헤드라이트를 왼쪽에 두고)
 * - 대각선 코너 교환: Y (헤드라이트가 어디에도 없을 때)
 */
export const TWO_LOOK_PLL_CORNERS: readonly string[] = ['pll-T', 'pll-Y'];

/** 코너가 맞은 뒤 엣지 자리를 맞추는 PLL 네 가지 */
export const TWO_LOOK_PLL_EDGES: readonly string[] = ['pll-Ua', 'pll-Ub', 'pll-Z', 'pll-H'];
