/**
 * 공식 모음의 문제 만들기 (화면과 무관한 순수 로직).
 * - 그림 보고 공식 고르기: 보기 네 개 만들기
 * - 가리고 연습하기: 윗층을 무작위로 돌려 놓은 문제 만들기
 */
import { caseState, type AlgCase, type AlgSet } from '../../algorithms';
import { TWO_LOOK_OLL_EDGES } from '../../algorithms/twoLook';
import { FACELETS, applyMoves, type CubeState, type Move } from '../../core/cube';
import { parseAlg } from '../../core/notation';

// ───────── 그림 보고 공식 고르기 ─────────

export interface QuizChoice {
  /** 이 공식이 푸는 케이스 */
  caseId: string;
  alg: string;
  correct: boolean;
}

export interface QuizQuestion {
  answer: AlgCase;
  /** 섞인 보기. 정답은 하나뿐이고 같은 공식이 두 번 나오지 않는다 */
  choices: QuizChoice[];
}

/** 보기 개수 (정답 포함) */
export const CHOICE_COUNT = 4;

/** 띄어쓰기나 괄호만 다른 공식을 같은 것으로 보기 위한 열쇠 */
const algKey = (alg: string) =>
  alg
    .replace(/[()[\],]/g, ' ')
    .replace(/[’‘`]/g, "'")
    .trim()
    .split(/\s+/)
    .join(' ');

/** 피셔-예이츠 섞기. 원본은 그대로 두고 새 배열을 돌려준다. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * answer 케이스의 그림을 보고 공식을 고르는 문제를 만든다.
 * 오답은 같은 모음의 다른 케이스에서 고르되, 같은 묶음(group)의 케이스를 먼저 쓴다 (비슷해서 헷갈리는 것끼리).
 * 공식이 서로 다른 케이스가 네 개보다 적으면 보기도 그만큼 줄어든다.
 */
export function buildQuestion(
  cases: readonly AlgCase[],
  answer: AlgCase,
  random: () => number = Math.random,
): QuizQuestion {
  const others = cases.filter((c) => c.id !== answer.id);
  const candidates = [
    ...shuffle(
      others.filter((c) => c.group === answer.group),
      random,
    ),
    ...shuffle(
      others.filter((c) => c.group !== answer.group),
      random,
    ),
  ];

  const used = new Set([algKey(answer.alg)]);
  const choices: QuizChoice[] = [{ caseId: answer.id, alg: answer.alg, correct: true }];
  for (const c of candidates) {
    if (choices.length >= CHOICE_COUNT) break;
    const key = algKey(c.alg);
    if (used.has(key)) continue;
    used.add(key);
    choices.push({ caseId: c.id, alg: c.alg, correct: false });
  }
  return { answer, choices: shuffle(choices, random) };
}

// ───────── 가리고 연습하기: 윗층 돌려 놓기 ─────────

/** 케이스 상태 뒤에 더 돌려 놓은 U의 횟수 (시계 방향 90° 단위). 0 = 그대로, 1 = U, 2 = U2, 3 = U' */
export type PreTurn = 0 | 1 | 2 | 3;

export const PRE_TURNS: readonly PreTurn[] = [0, 1, 2, 3];

/** U를 시계 방향으로 n번(4로 나눈 나머지) 돌리는 동작. 0번이면 없음 */
function uTurn(quarters: number): Move | null {
  const n = ((quarters % 4) + 4) % 4;
  if (n === 0) return null;
  return { base: 'U', amount: n === 1 ? 1 : n === 2 ? 2 : -1 };
}

const quartersOf = (move: Move) => (move.amount === -1 ? 3 : move.amount);

export interface DrillQuestion {
  /** 화면에 처음 보이는 상태: 케이스 상태에서 윗층을 preTurn만큼 더 돌린 것 */
  start: CubeState;
  /** 사용자가 돌려야 하는 동작: 윗층을 되돌린 다음 공식 */
  moves: Move[];
}

/**
 * 윗층이 preTurn만큼 돌아가 있는 연습 문제.
 * 되돌리는 U와 공식 맨 앞의 U는 하나로 합친다 (서로 지워지면 둘 다 뺀다).
 */
export function drillQuestion(algCase: AlgCase, preTurn: PreTurn): DrillQuestion {
  const alg = parseAlg(algCase.alg);
  const pre = uTurn(preTurn);
  const start = pre ? applyMoves(caseState(algCase), [pre]) : caseState(algCase);

  // 맨 앞에 이어지는 U를 모두 모아 한 번으로 줄인다.
  let quarters = -preTurn;
  let rest = 0;
  while (rest < alg.length && alg[rest].base === 'U') {
    quarters += quartersOf(alg[rest]);
    rest += 1;
  }
  const lead = uTurn(quarters);
  return { start, moves: lead ? [lead, ...alg.slice(rest)] : alg.slice(rest) };
}

/** 윗층(y = 1)에 있지 않은 칸들 */
const LOWER = FACELETS.flatMap((f, i) => (f.pos[1] === 1 ? [] : [i]));
/** 윗면(U)의 엣지 칸 */
const U_EDGES = [1, 3, 5, 7];
const U_FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/** Roux의 양쪽 블록(왼쪽·오른쪽 아래 두 층)과 윗층 코너의 칸 */
const ROUX_BLOCKS = FACELETS.flatMap((f, i) => (f.pos[0] !== 0 && f.pos[1] !== 1 ? [i] : []));
const TOP_CORNERS = FACELETS.flatMap((f, i) => (f.pos[0] !== 0 && f.pos[1] === 1 && f.pos[2] !== 0 ? [i] : []));

/** 노란 십자만 만들면 되는 공식 (코너 모양은 상관없다) */
const CROSS_ONLY: ReadonlySet<string> = new Set(TWO_LOOK_OLL_EDGES.map((c) => c.id));

/**
 * 공식이 할 일을 다 했는지: F2L은 아래 두 층, OLL은 거기에 윗면 색, PLL은 윗층 돌리기만 남은 상태,
 * CMLL은 양쪽 블록이 그대로이고 윗층 코너가 윗층 돌리기만 남은 상태 (가운데 줄과 윗층 엣지는 보지 않는다).
 */
function reached(algCase: AlgCase, view: AlgSet['view'], state: CubeState, done: CubeState): boolean {
  if (view === 'pll' || view === 'cmll') {
    const watched = view === 'pll' ? null : TOP_CORNERS;
    if (view === 'cmll' && !ROUX_BLOCKS.every((i) => state[i] === done[i])) return false;
    return PRE_TURNS.some((k) => {
      const turn = uTurn(k);
      const target = turn ? applyMoves(done, [turn]) : done;
      return watched ? watched.every((i) => target[i] === state[i]) : target.every((c, i) => c === state[i]);
    });
  }
  if (!LOWER.every((i) => state[i] === done[i])) return false;
  if (view === 'iso') return true;
  return (CROSS_ONLY.has(algCase.id) ? U_EDGES : U_FACE).every((i) => state[i] === state[4]);
}

/**
 * 이 케이스에 낼 수 있는 윗층 방향들.
 *
 * 윗층을 돌려도 똑같아 보이는 케이스(PLL의 H·Z, OLL과 CMLL의 대칭 모양, 짝이 이미 슬롯에 들어간 F2L 등)는
 * 돌려 놓지 않는다. 그런 케이스는 되돌리지 않고 바로 공식을 돌려도, 반대쪽으로 돌려도 맞는 풀이인데
 * 연습 화면은 한 가지 순서만 받아 주기 때문이다. 그래서 "되돌릴 방법이 하나뿐인" 케이스만 돌려 놓는다.
 */
export function drillTurns(algCase: AlgCase, view: AlgSet['view']): PreTurn[] {
  const alg = parseAlg(algCase.alg);
  const plain = caseState(algCase);
  const done = applyMoves(plain, alg);
  const symmetric = PRE_TURNS.some((k) => {
    const turn = uTurn(k);
    return turn !== null && reached(algCase, view, applyMoves(plain, [turn, ...alg]), done);
  });
  return symmetric ? [0] : [...PRE_TURNS];
}

/** 연습 문제에 쓸 윗층 방향을 무작위로 고른다. */
export function pickTurn(algCase: AlgCase, view: AlgSet['view'], random: () => number = Math.random): PreTurn {
  const turns = drillTurns(algCase, view);
  return turns[Math.min(turns.length - 1, Math.floor(random() * turns.length))];
}
