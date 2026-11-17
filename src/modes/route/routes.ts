import { isRotation, type CubeState } from '../../core/cube';
import { solveBeginner } from '../../solvers/beginner';
import { solveCfop } from '../../solvers/cfop';
import { solveShortest } from '../../solvers/shortest';
import { stageMoves, type SolveStage } from '../../solvers/types';

/** 한 가지 풀이 방법으로 구한 경로 */
export interface Route {
  id: 'shortest' | 'cfop' | 'cfop2' | 'beginner';
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

const INFO: Record<Route['id'], Pick<Route, 'title' | 'summary' | 'memorize'>> = {
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
  cfop2: {
    title: 'CFOP (2-Look)',
    summary: 'OLL과 PLL을 두 번씩에 나눠서.',
    memorize: '공식 16개 + F2L',
  },
  beginner: {
    title: '초보자 공식',
    summary: '한 층씩 맞추기. 가장 쉽지만 가장 길어요.',
    memorize: '공식 7개',
  },
};

function makeRoute(id: Route['id'], stages: SolveStage[]): Route {
  const moves = stages.flatMap(stageMoves);
  const regrips = moves.filter(isRotation).length;
  return { id, ...INFO[id], stages, turns: moves.length - regrips, regrips };
}

/** 바로 계산되는 경로들 (사람이 쓰는 공식). 풀 수 없는 상태면 오류를 던진다. */
export function methodRoutes(state: CubeState): Route[] {
  return [
    makeRoute('cfop', solveCfop(state)),
    makeRoute('cfop2', solveCfop(state, { twoLook: true })),
    makeRoute('beginner', solveBeginner(state)),
  ];
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
