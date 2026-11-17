import type { Move } from '../core/cube';

/** 풀이의 한 묶음: 무엇을 하는지와 그 동작들 */
export interface SolveStep {
  note: string;
  moves: Move[];
}

/** 풀이의 한 단계 (예: 흰색 십자, F2L, OLL) */
export interface SolveStage<Id extends string = string> {
  id: Id;
  title: string;
  steps: SolveStep[];
}

export function stageMoves(stage: SolveStage): Move[] {
  return stage.steps.flatMap((s) => s.moves);
}
