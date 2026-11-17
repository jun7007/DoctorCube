import { SOLVED, applyMoves, type CubeState, type Move } from '../../core/cube';
import { parseAlg } from '../../core/notation';
import { YELLOW_UP } from '../../core/frames';
import { focusOf } from '../../core/pieces';
import { generateScramble } from '../../core/scramble';
import { STAGE_ORDER, solveBeginner, stageMoves, type StageId } from '../../solvers/beginner';
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

/** 단계별로 눈여겨볼 조각 (이미 맞춘 조각 + 이번에 맞출 조각). null이면 전부 */
const STAGE_FOCUS: Readonly<Record<StageId, string | null>> = {
  orient: null,
  daisy: `${CENTERS} ${WHITE_EDGES}`,
  cross: `${CENTERS} ${WHITE_EDGES}`,
  corners: `${CENTERS} ${WHITE_EDGES} ${WHITE_CORNERS}`,
  middle: `${CENTERS} ${WHITE_EDGES} ${WHITE_CORNERS} ${MIDDLE_EDGES}`,
  yellowCross: `${CENTERS} ${WHITE_EDGES} ${WHITE_CORNERS} ${MIDDLE_EDGES} ${YELLOW_EDGES}`,
  yellowEdges: `${CENTERS} ${WHITE_EDGES} ${WHITE_CORNERS} ${MIDDLE_EDGES} ${YELLOW_EDGES}`,
  cornerPos: null,
  cornerTwist: null,
};

function focusFor(step: LessonStep): ReadonlySet<number> | null {
  const spec = step.focus ?? (step.auto && step.auto !== 'all' ? STAGE_FOCUS[step.auto] : null);
  return spec ? focusOf(spec) : null;
}

export function resolveStep(course: Course, step: LessonStep, random: () => number = Math.random): Playable {
  const base = course.frame === 'yellow' ? YELLOW_UP : SOLVED;
  const focus = focusFor(step);

  if (!step.auto) {
    return {
      start: applyMoves(base, parseAlg(step.setup ?? '')),
      groups: step.alg ? [{ moves: parseAlg(step.alg) }] : [],
      focus,
    };
  }

  if (step.auto === 'all') {
    const start = applyMoves(SOLVED, generateScramble(25, random));
    const groups = solveBeginner(start).flatMap((stage) =>
      stage.steps.map((s) => ({ note: `[${stage.title}] ${s.note}`, moves: s.moves })),
    );
    return { start, groups, focus };
  }

  const index = STAGE_ORDER.indexOf(step.auto);
  if (!step.random) {
    const start = applyMoves(base, parseAlg(step.setup ?? ''));
    return { start, groups: solveBeginner(start)[index].steps, focus };
  }

  // 무작위 예제: 섞은 큐브를 이 단계 직전까지 풀어 둔 상태에서 시작한다.
  // 운 좋게 이 단계가 이미 끝나 있으면 다시 섞는다.
  let fallback: Playable | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const scrambled = applyMoves(SOLVED, generateScramble(25, random));
    const stages = solveBeginner(scrambled);
    const start = applyMoves(scrambled, stages.slice(0, index).flatMap(stageMoves));
    const playable = { start, groups: stages[index].steps, focus };
    if (playable.groups.length > 0) return playable;
    fallback = playable;
  }
  return fallback!;
}
