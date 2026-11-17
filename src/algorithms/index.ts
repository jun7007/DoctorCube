import { applyMoves, type CubeState } from '../core/cube';
import { YELLOW_UP } from '../core/frames';
import { invertAlg, parseAlg } from '../core/notation';
import { focusOf } from '../core/pieces';
import { F2L_CASES } from './f2l';
import { OLL_CASES } from './oll';
import { PLL_CASES } from './pll';
import {
  TWO_LOOK_OLL_CORNERS,
  TWO_LOOK_OLL_EDGES,
  TWO_LOOK_PLL_CORNERS,
  TWO_LOOK_PLL_EDGES,
} from './twoLook';
import type { AlgCase } from './types';

export type { AlgCase } from './types';

/** 공식 모음 하나 (예: PLL 21개) */
export interface AlgSet {
  id: string;
  title: string;
  summary: string;
  cases: readonly AlgCase[];
  /** 작은 그림의 종류: oll = 위에서 본 노란색 무늬, pll = 위에서 본 옆면 색, iso = 비스듬히 본 큐브 */
  view: 'oll' | 'pll' | 'iso';
  /** 강조할 조각 (없으면 전부) */
  focus: ReadonlySet<number> | null;
}

function pick(from: readonly AlgCase[], ids: readonly string[]): AlgCase[] {
  return ids.map((id) => {
    const found = from.find((c) => c.id === id);
    if (!found) throw new Error(`없는 공식: ${id}`);
    return found;
  });
}

/** F2L에서 볼 조각: 센터, 흰색 십자, 흰색 코너, 가운데 층 엣지 (윗층 조각은 흐리게) */
const F2L_FOCUS = focusOf('U R F D L B UF UR UB UL UFR UFL UBR UBL FR FL BR BL');

export const ALG_SETS: readonly AlgSet[] = [
  {
    id: '2look-oll',
    title: '2-Look OLL',
    summary: '공식 10개로 윗면을 노랗게: 먼저 십자, 그다음 코너',
    cases: [...TWO_LOOK_OLL_EDGES, ...pick(OLL_CASES, TWO_LOOK_OLL_CORNERS)],
    view: 'oll',
    focus: null,
  },
  {
    id: '2look-pll',
    title: '2-Look PLL',
    summary: '공식 6개로 윗층 마무리: 먼저 코너, 그다음 엣지',
    cases: [...pick(PLL_CASES, TWO_LOOK_PLL_CORNERS), ...pick(PLL_CASES, TWO_LOOK_PLL_EDGES)],
    view: 'pll',
    focus: null,
  },
  {
    id: 'f2l',
    title: 'F2L',
    summary: '코너와 엣지를 짝지어 1·2층을 한 번에',
    cases: F2L_CASES,
    view: 'iso',
    focus: F2L_FOCUS,
  },
  {
    id: 'oll',
    title: 'OLL 전체',
    summary: '어떤 모양이든 한 번에 윗면을 노랗게',
    cases: OLL_CASES,
    view: 'oll',
    focus: null,
  },
  {
    id: 'pll',
    title: 'PLL 전체',
    summary: '어떤 배치든 한 번에 윗층 마무리',
    cases: PLL_CASES,
    view: 'pll',
    focus: null,
  },
];

const stateCache = new Map<string, CubeState>();

/** 이 공식으로 푸는 케이스의 모습: 완성 상태에 공식을 거꾸로 적용한 상태 */
export function caseState(algCase: AlgCase): CubeState {
  let state = stateCache.get(algCase.id);
  if (!state) {
    state = applyMoves(YELLOW_UP, invertAlg(parseAlg(algCase.alg)));
    stateCache.set(algCase.id, state);
  }
  return state;
}
