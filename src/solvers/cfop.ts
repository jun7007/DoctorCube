/**
 * CFOP 풀이기: 십자 → F2L → OLL → PLL.
 * 공식 모음(src/algorithms)에 있는 공식만 써서 풀기 때문에, 결과를 그대로 학습과 안내에 쓸 수 있다.
 *
 * 잡는 방향은 초보자 공식과 같다: 노란색이 위, 흰색이 아래.
 */
import { F2L_BY_KEY, f2lCaseKey, f2lSolve } from '../algorithms/f2l';
import { OLL_CASES } from '../algorithms/oll';
import { PLL_CASES } from '../algorithms/pll';
import {
  TWO_LOOK_OLL_CORNERS,
  TWO_LOOK_OLL_EDGES,
  TWO_LOOK_PLL_CORNERS,
  TWO_LOOK_PLL_EDGES,
} from '../algorithms/twoLook';
import type { AlgCase } from '../algorithms/types';
import { applyMoves, isSolved, type BaseMove, type CubeState, type Face, type Move } from '../core/cube';
import { parseAlg } from '../core/notation';
import { centerColor, colorAt } from '../core/pieces';
import { crossSolved, solveCross } from './cross';
import type { SolveStage, SolveStep } from './types';

export type CfopStageId = 'orient' | 'cross' | 'f2l' | 'oll' | 'pll';

export const CFOP_STAGE_ORDER: readonly CfopStageId[] = ['orient', 'cross', 'f2l', 'oll', 'pll'];

export const CFOP_STAGE_TITLES: Readonly<Record<CfopStageId, string>> = {
  orient: '큐브 잡기',
  cross: '십자',
  f2l: 'F2L',
  oll: 'OLL',
  pll: 'PLL',
};

export interface CfopOptions {
  /** true면 OLL과 PLL을 각각 두 번에 나눠 푼다 (2-Look: 공식 16개만 쓴다) */
  twoLook?: boolean;
  /**
   * 외운 공식의 id 모음. 주면 OLL과 PLL에서 맞는 공식을 외웠을 때만 한 번에 풀고,
   * 아니면 2-Look으로 푼다 (twoLook 값은 무시한다).
   */
  known?: ReadonlySet<string>;
}

const WHITE = 0;
const GREEN = 2;
const QUARTERS = [1, 2, -1] as const;
const SLOTS: readonly [Face, Face][] = [
  ['F', 'R'],
  ['F', 'L'],
  ['B', 'R'],
  ['B', 'L'],
];

function turns(base: BaseMove, k: number): Move[] {
  const n = ((k % 4) + 4) % 4;
  return n === 0 ? [] : [{ base, amount: QUARTERS[n - 1] }];
}

function fail(): never {
  throw new Error('풀 수 없는 상태예요. 큐브의 색 배치를 다시 확인해 주세요.');
}

const pick = (from: readonly AlgCase[], ids: readonly string[]) => from.filter((c) => ids.includes(c.id));

// ───────── 조건 ─────────

const slotSolved = (s: CubeState, a: Face, b: Face) =>
  colorAt(s, `D${a}${b}`, 'D') === centerColor(s, 'D') &&
  colorAt(s, `D${a}${b}`, a) === centerColor(s, a) &&
  colorAt(s, `D${a}${b}`, b) === centerColor(s, b) &&
  colorAt(s, `${a}${b}`, a) === centerColor(s, a) &&
  colorAt(s, `${a}${b}`, b) === centerColor(s, b);

const solvedSlots = (s: CubeState) => SLOTS.filter(([a, b]) => slotSolved(s, a, b)).length;

const topYellow = (s: CubeState) => {
  for (let i = 0; i < 9; i++) if (s[i] !== s[4]) return false;
  return true;
};

const topEdgesYellow = (s: CubeState) => s[1] === s[4] && s[3] === s[4] && s[5] === s[4] && s[7] === s[4];

const topCornersHome = (s: CubeState) =>
  SLOTS.every(
    ([a, b]) => colorAt(s, `U${a}${b}`, a) === centerColor(s, a) && colorAt(s, `U${a}${b}`, b) === centerColor(s, b),
  );

/** U를 몇 번 돌리면 조건이 맞는지 (0~3). 없으면 -1 */
function findU(s: CubeState, test: (s: CubeState) => boolean): number {
  for (let k = 0; k < 4; k++) if (test(applyMoves(s, turns('U', k)))) return k;
  return -1;
}

// ───────── 풀이 ─────────

class Builder {
  state: CubeState;
  readonly stages: SolveStage<CfopStageId>[] = [];
  private steps: SolveStep[] = [];

  constructor(state: CubeState) {
    this.state = state;
  }

  begin(id: CfopStageId): void {
    this.steps = [];
    this.stages.push({ id, title: CFOP_STAGE_TITLES[id], steps: this.steps });
  }

  do(note: string, moves: readonly Move[]): void {
    if (moves.length === 0) return;
    this.state = applyMoves(this.state, moves);
    this.steps.push({ note, moves: [...moves] });
  }
}

function orient(b: Builder): void {
  b.begin('orient');
  for (const first of ['', 'x', "x'", 'z', "z'", 'x2']) {
    for (const second of ['', 'y', "y'", 'y2']) {
      const moves = parseAlg(`${first} ${second}`);
      const s = applyMoves(b.state, moves);
      if (centerColor(s, 'D') === WHITE && centerColor(s, 'F') === GREEN) {
        b.do('노란색 센터가 위, 초록색 센터가 앞에 오도록 큐브를 잡아요.', moves);
        return;
      }
    }
  }
  fail();
}

function cross(b: Builder): void {
  b.begin('cross');
  if (crossSolved(b.state)) return;
  const moves = solveCross(b.state);
  b.do(`흰색 엣지 4개를 아래 면의 제자리로 바로 보내요 (${moves.length}수).`, moves);
}

/** 앞-오른쪽 자리를 푸는 동작을 (자리 맞추기, 공식)으로 나눠 돌려준다. */
function splitPair(state: CubeState, moves: readonly Move[]): { name: string; setup: Move[]; alg: Move[] } {
  // 공식이 시작되는 지점은 U 조정이 끝난 곳이다.
  for (let cut = 0; cut <= Math.min(1, moves.length); cut++) {
    const algCase = F2L_BY_KEY.get(f2lCaseKey(applyMoves(state, moves.slice(0, cut))) ?? '');
    if (algCase && parseAlg(algCase.alg).length === moves.length - cut) {
      return { name: algCase.name, setup: moves.slice(0, cut), alg: moves.slice(cut) };
    }
  }
  return { name: 'F2L', setup: [], alg: [...moves] };
}

const EJECTS = ["R U R'", "R U' R'", "F' U' F", "F' U F"].map(parseAlg);

function f2l(b: Builder): void {
  b.begin('f2l');
  for (let guard = 0; solvedSlots(b.state) < 4; guard++) {
    if (guard > 12) fail();

    // 네 자리 중 지금 바로 넣을 수 있고 가장 짧은 것을 고른다.
    let best: { rotate: Move[]; moves: Move[] } | null = null;
    for (let ny = 0; ny < 4; ny++) {
      const rotate = turns('y', ny);
      const s = applyMoves(b.state, rotate);
      if (slotSolved(s, 'F', 'R')) continue;
      const moves = f2lSolve(s);
      if (!moves || moves.length === 0) continue;
      if (!best || rotate.length + moves.length < best.rotate.length + best.moves.length) best = { rotate, moves };
    }

    if (best) {
      const nth = solvedSlots(b.state) + 1;
      const { name, setup, alg } = splitPair(applyMoves(b.state, best.rotate), best.moves);
      b.do(`${nth}번째 짝: 넣을 자리를 앞-오른쪽에 두고, U를 돌려 짝을 공식의 시작 위치에 맞춰요.`, [
        ...best.rotate,
        ...setup,
      ]);
      b.do(`${nth}번째 짝: ${name} 공식으로 코너와 엣지를 함께 넣어요.`, alg);
      continue;
    }

    // 넣을 수 있는 짝이 없으면, 다른 자리에 잘못 들어간 조각을 윗층으로 꺼낸다.
    const eject = findEject(b.state);
    if (!eject) fail();
    b.do('다른 자리에 잘못 들어간 조각을 윗층으로 꺼내요.', eject);
  }
}

function findEject(state: CubeState): Move[] | null {
  const before = solvedSlots(state);
  const solvable = (s: CubeState) => {
    for (let ny = 0; ny < 4; ny++) {
      const r = applyMoves(s, turns('y', ny));
      if (slotSolved(r, 'F', 'R')) continue;
      const moves = f2lSolve(r);
      if (moves && moves.length > 0) return true;
    }
    return false;
  };
  let fallback: Move[] | null = null;
  for (let ny = 0; ny < 4; ny++) {
    const rotate = turns('y', ny);
    if (slotSolved(applyMoves(state, rotate), 'F', 'R')) continue;
    for (let nu = 0; nu < 4; nu++) {
      for (const trigger of EJECTS) {
        const moves = [...rotate, ...turns('U', nu), ...trigger];
        const after = applyMoves(state, moves);
        // 십자와 이미 넣은 짝은 그대로여야 한다.
        if (!crossSolved(after) || solvedSlots(after) < before) continue;
        if (solvable(after)) return moves;
        fallback ??= moves;
      }
    }
  }
  return fallback;
}

/** cases 중에서, U를 맞춘 뒤 공식을 하면 조건이 되는 것을 찾는다. */
function findCase(
  state: CubeState,
  cases: readonly AlgCase[],
  done: (s: CubeState) => boolean,
): { algCase: AlgCase; pre: Move[]; alg: Move[] } | null {
  for (let k = 0; k < 4; k++) {
    const pre = turns('U', k);
    const s = applyMoves(state, pre);
    for (const algCase of cases) {
      const alg = parseAlg(algCase.alg);
      if (done(applyMoves(s, alg))) return { algCase, pre, alg };
    }
  }
  return null;
}

/** 한 번에 푸는 공식을 쓸지, 2-Look으로 나눠 풀지 */
type Look = { full: readonly AlgCase[] } | 'twoLook';

function oll(b: Builder, look: Look): void {
  b.begin('oll');
  if (topYellow(b.state)) return;

  const direct = look === 'twoLook' ? null : findCase(b.state, look.full, topYellow);
  if (direct) {
    b.do(`${direct.algCase.name} 공식으로 윗면을 한 번에 노랗게 만들어요.`, [...direct.pre, ...direct.alg]);
    return;
  }

  // 2-Look: 먼저 노란 십자, 그다음 코너.
  // 점 모양은 공식 한 번으로 끝나지 않을 수 있어 두 번까지 허용한다.
  for (let guard = 0; !topEdgesYellow(b.state); guard++) {
    if (guard > 2) fail();
    const found = findCase(b.state, TWO_LOOK_OLL_EDGES, topEdgesYellow) ?? {
      algCase: TWO_LOOK_OLL_EDGES[0],
      pre: [],
      alg: parseAlg(TWO_LOOK_OLL_EDGES[0].alg),
    };
    b.do(`첫 번째: ${found.algCase.name} 공식으로 노란 십자를 만들어요.`, [...found.pre, ...found.alg]);
  }
  if (topYellow(b.state)) return;
  const found = findCase(b.state, pick(OLL_CASES, TWO_LOOK_OLL_CORNERS), topYellow);
  if (!found) fail();
  b.do(`두 번째: ${found.algCase.name} 공식으로 코너의 노란색을 위로 올려요.`, [...found.pre, ...found.alg]);
}

function pll(b: Builder, look: Look): void {
  b.begin('pll');
  const finished = (s: CubeState) => findU(s, isSolved) >= 0;
  const cornersDone = (s: CubeState) => findU(s, topCornersHome) >= 0;

  if (!finished(b.state)) {
    const direct = look === 'twoLook' ? null : findCase(b.state, look.full, finished);
    if (direct) {
      b.do(`${direct.algCase.name} 공식으로 윗층의 자리를 한 번에 맞춰요.`, [...direct.pre, ...direct.alg]);
    } else {
      if (!cornersDone(b.state)) {
        const found = findCase(b.state, pick(PLL_CASES, TWO_LOOK_PLL_CORNERS), cornersDone);
        if (!found) fail();
        b.do(`첫 번째: ${found.algCase.name} 공식으로 코너 4개의 자리를 맞춰요.`, [...found.pre, ...found.alg]);
      }
      if (!finished(b.state)) {
        const found = findCase(b.state, pick(PLL_CASES, TWO_LOOK_PLL_EDGES), finished);
        if (!found) fail();
        b.do(`두 번째: ${found.algCase.name} 공식으로 엣지 자리를 맞춰요.`, [...found.pre, ...found.alg]);
      }
    }
  }

  const last = findU(b.state, isSolved);
  if (last < 0) fail();
  b.do('U를 돌려 마무리해요.', turns('U', last));
}

/**
 * CFOP으로 푼다. 단계는 항상 CFOP_STAGE_ORDER 순서로 모두 들어 있고,
 * 이미 끝난 단계는 steps가 비어 있다. 풀 수 없는 상태면 오류를 던진다.
 */
export function solveCfop(state: CubeState, options: CfopOptions = {}): SolveStage<CfopStageId>[] {
  const { known } = options;
  const looks = (all: readonly AlgCase[]): Look =>
    known ? { full: all.filter((c) => known.has(c.id)) } : options.twoLook ? 'twoLook' : { full: all };
  const b = new Builder(state);
  orient(b);
  cross(b);
  f2l(b);
  oll(b, looks(OLL_CASES));
  pll(b, looks(PLL_CASES));
  if (!isSolved(b.state)) fail();
  return b.stages;
}
