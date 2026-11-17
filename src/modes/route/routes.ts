import { OLL_CASES } from '../../algorithms/oll';
import { PLL_CASES } from '../../algorithms/pll';
import { isRotation, type CubeState } from '../../core/cube';
import { solveBeginner } from '../../solvers/beginner';
import { solveCfop } from '../../solvers/cfop';
import { solveRoux } from '../../solvers/roux';
import { solveShortest } from '../../solvers/shortest';
import { stageMoves, type SolveStage } from '../../solvers/types';
import { solveZz } from '../../solvers/zz';

export type RouteId = 'shortest' | 'cfop' | 'mine' | 'cfop2' | 'roux' | 'zz' | 'beginner';

/** 한 가지 풀이 방법으로 구한 경로 */
export interface Route {
  id: RouteId;
  title: string;
  /** 한 줄 설명 */
  summary: string;
  /** 이 방법을 쓰려면 외워야 하는 것 */
  memorize: string;
  stages: SolveStage[];
  /** 회전 수 (큐브를 통째로 돌려 잡는 동작은 뺀 것) */
  turns: number;
  /** 큐브를 통째로 돌려 잡는 횟수 */
  regrips: number;
}

const INFO: Record<RouteId, Pick<Route, 'title' | 'summary' | 'memorize'>> = {
  shortest: {
    title: '최단 경로',
    summary: '컴퓨터가 찾은 가장 짧은 길. 화면을 보며 따라 돌려요.',
    memorize: '외울 것 없음 (사람이 스스로 찾을 수는 없어요)',
  },
  cfop: {
    title: 'CFOP (전체 공식)',
    summary: '십자 → F2L → OLL → PLL을 각각 한 번에.',
    memorize: '공식 약 120개 (F2L 41, OLL 57, PLL 21)',
  },
  mine: {
    title: 'CFOP (내가 외운 공식)',
    summary: '외웠다고 표시한 OLL·PLL은 한 번에, 나머지는 2-Look으로.',
    memorize: '지금 외운 공식 그대로',
  },
  cfop2: {
    title: 'CFOP (2-Look)',
    summary: 'OLL과 PLL을 두 번씩에 나눠서.',
    memorize: '공식 16개 + F2L',
  },
  roux: {
    title: 'Roux',
    summary: '양옆에 블록 두 개를 만든 뒤 가운데 줄과 윗면으로 마무리. 블록은 컴퓨터가 가장 짧게 찾은 것이라, 사람이 풀면 보통 45~50회전이에요.',
    memorize: 'CMLL 공식 42개 + 블록 만들기 연습',
  },
  zz: {
    title: 'ZZ',
    summary: '엣지 방향을 먼저 맞춰 두고, 큐브를 돌려 잡지 않은 채 R·U·L만으로 1·2층을 쌓아요. 블록은 컴퓨터가 가장 짧게 찾은 것이에요.',
    memorize: 'OLL 7개 + PLL 21개 + 엣지 방향 보는 연습',
  },
  beginner: {
    title: '초보자 공식',
    summary: '한 층씩 맞추기. 가장 쉽지만 가장 길어요.',
    memorize: '공식 7개',
  },
};

export function makeRoute(id: RouteId, stages: SolveStage[]): Route {
  const moves = stages.flatMap(stageMoves);
  const regrips = moves.filter(isRotation).length;
  return { id, ...INFO[id], stages, turns: moves.length - regrips, regrips };
}

const FULL_IDS = new Set([...OLL_CASES, ...PLL_CASES].map((c) => c.id));

/**
 * 바로 계산되는 경로들 (사람이 쓰는 공식). 풀 수 없는 상태면 오류를 던진다.
 * known은 "외웠어요"로 표시한 공식의 id. OLL·PLL 공식이 하나라도 있으면 "내가 외운 공식" 경로가 추가된다.
 */
export function methodRoutes(state: CubeState, known: ReadonlySet<string> = new Set()): Route[] {
  const routes = [makeRoute('cfop', solveCfop(state))];
  if ([...known].some((id) => FULL_IDS.has(id))) routes.push(makeRoute('mine', solveCfop(state, { known })));
  routes.push(
    makeRoute('cfop2', solveCfop(state, { twoLook: true })),
    makeRoute('roux', solveRoux(state)),
    makeRoute('zz', solveZz(state)),
    makeRoute('beginner', solveBeginner(state)),
  );
  return routes;
}

/** 최단 경로. 다른 스레드에서 계산하며, 처음 한 번은 몇 초 걸릴 수 있다. */
export async function shortestRoute(state: CubeState): Promise<Route> {
  const moves = await solveShortest(state);
  return makeRoute('shortest', [
    {
      id: 'shortest',
      title: '최단 풀이',
      steps: moves.length > 0 ? [{ note: '흰색이 위, 초록색이 앞을 보게 잡고 그대로 따라 돌려요.', moves }] : [],
    },
  ]);
}

/**
 * 예상 시간(초): 회전 수 ÷ 손 속도 + 큐브를 돌려 잡는 횟수 × 0.7초 + 묶음마다 다음 할 일을 알아보는 시간.
 * 어디까지나 어림값이다.
 */
export function estimateSeconds(route: Route, turnsPerSecond: number, lookSeconds: number): number {
  const looks = route.stages.reduce((n, s) => n + s.steps.length, 0);
  return route.turns / turnsPerSecond + route.regrips * 0.7 + looks * lookSeconds;
}

/**
 * 자유 탭의 기록으로 잰 내 손 속도(초당 회전 수). 생각하는 시간까지 포함한 값이다.
 * 힌트 없이 푼 최근 12번을 쓰고, 그런 기록이 3번보다 적으면 null.
 */
export function paceFromSolves(
  solves: readonly { at: number; ms: number; turns: number; hint: boolean }[],
): number | null {
  const recent = solves
    .filter((s) => !s.hint && s.ms > 0 && s.turns > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);
  if (recent.length < 3) return null;
  const turns = recent.reduce((n, s) => n + s.turns, 0);
  const seconds = recent.reduce((n, s) => n + s.ms, 0) / 1000;
  return turns / seconds;
}
