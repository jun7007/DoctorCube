import { SOLVED, applyMoves, type CubeState, type Move } from '../../core/cube';
import { YELLOW_UP } from '../../core/frames';
import { parseAlg } from '../../core/notation';
import { focusOf } from '../../core/pieces';
import { generateScramble } from '../../core/scramble';
import { STAGE_ORDER, solveBeginner } from '../../solvers/beginner';
import { CFOP_STAGE_ORDER, solveCfop } from '../../solvers/cfop';
import { stageMoves, type SolveStage } from '../../solvers/types';
import type { Course, LessonStep } from './courses';

export interface PlayGroup {
  /** 이 묶음에서 무엇을 하는지 */
  note?: string;
  moves: Move[];
}

/** 화면에 올릴 준비가 된 한 단계: 시작 모습, 보여 줄 동작 묶음, 강조할 조각 */
export interface Playable {
  start: CubeState;
  groups: PlayGroup[];
  focus: ReadonlySet<number> | null;
}

export { YELLOW_UP };

const CENTERS = 'U R F D L B';
const WHITE_EDGES = 'UF UR UB UL';
const WHITE_CORNERS = 'UFR UFL UBR UBL';
const MIDDLE_EDGES = 'FR FL BR BL';
const YELLOW_EDGES = 'DF DR DB DL';

const CROSS_FOCUS = `${CENTERS} ${WHITE_EDGES}`;
const F2L_FOCUS = `${CENTERS} ${WHITE_EDGES} ${WHITE_CORNERS} ${MIDDLE_EDGES}`;

interface Method {
  solve: (state: CubeState) => SolveStage[];
  order: readonly string[];
  /** 단계별로 눈여겨볼 조각 (이미 맞춘 조각 + 이번에 맞출 조각). 없으면 전부 */
  focus: Readonly<Record<string, string | undefined>>;
}

/** 레슨이 쓰는 풀이 방법 */
export const METHODS: Readonly<Record<'beginner' | 'cfop', Method>> = {
  beginner: {
    solve: solveBeginner,
    order: STAGE_ORDER,
    focus: {
      daisy: CROSS_FOCUS,
      cross: CROSS_FOCUS,
      corners: `${CROSS_FOCUS} ${WHITE_CORNERS}`,
      middle: F2L_FOCUS,
      yellowCross: `${F2L_FOCUS} ${YELLOW_EDGES}`,
      yellowEdges: `${F2L_FOCUS} ${YELLOW_EDGES}`,
    },
  },
  cfop: {
    // 레슨에서는 2-Look으로 푼다 (배우는 사람이 아는 공식만 나오도록).
    solve: (state) => solveCfop(state, { twoLook: true }),
    order: CFOP_STAGE_ORDER,
    focus: { cross: CROSS_FOCUS, f2l: F2L_FOCUS },
  },
};

export function resolveStep(course: Course, step: LessonStep, random: () => number = Math.random): Playable {
  const base = course.frame === 'yellow' ? YELLOW_UP : SOLVED;
  const method = METHODS[step.method ?? 'beginner'];
  const spec = step.focus ?? (step.auto && step.auto !== 'all' ? method.focus[step.auto] : undefined);
  const focus = spec ? focusOf(spec) : null;

  if (!step.auto) {
    return {
      start: applyMoves(base, parseAlg(step.setup ?? '')),
      groups: step.alg ? [{ moves: parseAlg(step.alg) }] : [],
      focus,
    };
  }

  if (step.auto === 'all') {
    const start = applyMoves(SOLVED, generateScramble(25, random));
    const groups = method
      .solve(start)
      .flatMap((stage) => stage.steps.map((s) => ({ note: `[${stage.title}] ${s.note}`, moves: s.moves })));
    return { start, groups, focus };
  }

  const index = method.order.indexOf(step.auto);
  if (index < 0) throw new Error(`없는 단계: ${step.auto}`);

  if (!step.random) {
    const start = applyMoves(base, parseAlg(step.setup ?? ''));
    return { start, groups: method.solve(start)[index].steps, focus };
  }

  // 무작위 예제: 섞은 큐브를 이 단계 직전까지 풀어 둔 상태에서 시작한다.
  // 운 좋게 이 단계가 이미 끝나 있으면 다시 섞는다.
  let fallback: Playable | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const scrambled = applyMoves(SOLVED, generateScramble(25, random));
    const stages = method.solve(scrambled);
    const start = applyMoves(scrambled, stages.slice(0, index).flatMap(stageMoves));
    const playable = { start, groups: stages[index].steps, focus };
    if (playable.groups.length > 0) return playable;
    fallback = playable;
  }
  return fallback!;
}
