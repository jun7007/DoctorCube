import { applyMove, type CubeState, type Move } from '../core/cube';
import { solveBeginner, type SolveStage, type SolveStep } from './beginner';

interface PlanMove {
  move: Move;
  stage: SolveStage;
  step: SolveStep;
  /** 이 동작이 속한 묶음의 마지막 동작 다음 위치 */
  stepEnd: number;
}

/**
 * 한 번 구한 풀이를 따라가기 위한 계획.
 * 큐브가 바뀔 때마다 처음부터 다시 풀면, 단계 도중의 상태(예: 마지막 단계에서 잠시 흐트러진 아래층)를
 * "덜 풀린 큐브"로 보고 엉뚱한 안내를 하게 된다. 그래서 계획 위의 어느 지점인지를 찾아 이어 간다.
 */
export interface Plan {
  moves: PlanMove[];
  /** states[i] = 동작 i개를 한 뒤의 상태 (문자열) */
  states: string[];
}

const key = (state: CubeState) => state.join('');

export function makePlan(cube: CubeState): Plan {
  const moves: PlanMove[] = [];
  const states = [key(cube)];
  let s = cube;
  for (const stage of solveBeginner(cube)) {
    for (const step of stage.steps) {
      const stepEnd = moves.length + step.moves.length;
      for (const move of step.moves) {
        moves.push({ move, stage, step, stepEnd });
        s = applyMove(s, move);
        states.push(key(s));
      }
    }
  }
  return { moves, states };
}

/** 이 상태가 계획의 몇 번째 지점인지. 계획에서 벗어났으면 -1 */
export function locate(plan: Plan, cube: CubeState): number {
  return plan.states.lastIndexOf(key(cube));
}

export interface NextStep {
  stage: SolveStage;
  /** 지금 묶음의 설명 */
  note: string;
  /** 지금 묶음에서 남은 동작 */
  moves: Move[];
  /** 완성까지 남은 동작 수 */
  left: number;
}

/** 계획의 at 지점에서 다음에 할 일. 끝났으면 null */
export function nextStep(plan: Plan, at: number): NextStep | null {
  const current = plan.moves[at];
  if (!current) return null;
  return {
    stage: current.stage,
    note: current.step.note,
    moves: plan.moves.slice(at, current.stepEnd).map((m) => m.move),
    left: plan.moves.length - at,
  };
}
