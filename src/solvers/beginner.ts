/**
 * 초보자 공식(한 층씩 맞추기) 풀이기.
 * 사람이 배우는 순서와 공식 그대로 푼다: 큐브를 돌려 잡고(y), 윗면을 맞추고(U), 외운 공식을 쓴다.
 * 그래서 결과를 그대로 따라 하기 안내와 힌트로 쓸 수 있다.
 *
 * 잡는 방향: 노란색이 위, 흰색이 아래. 색 번호는 0 흰색, 3 노란색.
 */
import { applyMove, applyMoves, isSolved, type BaseMove, type CubeState, type Face, type Move } from '../core/cube';
import { parseAlg } from '../core/notation';
import { centerColor, colorAt } from '../core/pieces';

export type StageId =
  | 'orient'
  | 'daisy'
  | 'cross'
  | 'corners'
  | 'middle'
  | 'yellowCross'
  | 'yellowEdges'
  | 'cornerPos'
  | 'cornerTwist';

export const STAGE_TITLES: Readonly<Record<StageId, string>> = {
  orient: '큐브 잡기',
  daisy: '흰색 데이지',
  cross: '흰색 십자',
  corners: '흰색 코너',
  middle: '2층 엣지',
  yellowCross: '노란 십자',
  yellowEdges: '노란 엣지 자리',
  cornerPos: '노란 코너 자리',
  cornerTwist: '노란 코너 방향',
};

export const STAGE_ORDER: readonly StageId[] = [
  'orient',
  'daisy',
  'cross',
  'corners',
  'middle',
  'yellowCross',
  'yellowEdges',
  'cornerPos',
  'cornerTwist',
];

export interface SolveStep {
  /** 이 묶음에서 무엇을 하는지 */
  note: string;
  moves: Move[];
}

export interface SolveStage {
  id: StageId;
  title: string;
  steps: SolveStep[];
}

/** 이 풀이기가 쓰는 공식 (학습 화면에서도 같은 것을 보여 준다) */
export const ALG = {
  corner: "R U R' U'",
  edgeRight: "U R U' R' U' F' U F",
  edgeLeft: "U' L' U L U F U' F'",
  yellowCross: "F R U R' U' F'",
  yellowEdges: "R U R' U R U2 R' U",
  cornerPos: "U R U' L' U R' U' L",
  cornerTwist: "R' D' R D",
} as const;

const WHITE = 0;
const SIDES: readonly Face[] = ['F', 'R', 'B', 'L'];
const TOP_EDGES = ['UF', 'UR', 'UB', 'UL'] as const;
const QUARTERS = [1, 2, -1] as const;

/** 같은 기호를 k번(0~3) 돌리는 것을 한 동작으로 */
function turns(base: BaseMove, k: number): Move[] {
  const n = ((k % 4) + 4) % 4;
  return n === 0 ? [] : [{ base, amount: QUARTERS[n - 1] }];
}

class Solver {
  state: CubeState;
  readonly stages: SolveStage[] = [];
  private current!: SolveStage;

  constructor(state: CubeState) {
    this.state = state;
  }

  begin(id: StageId): void {
    this.current = { id, title: STAGE_TITLES[id], steps: [] };
    this.stages.push(this.current);
  }

  do(note: string, moves: readonly Move[] | string): void {
    const list = typeof moves === 'string' ? parseAlg(moves) : [...moves];
    if (list.length === 0) return;
    this.state = applyMoves(this.state, list);
    this.current.steps.push({ note, moves: list });
  }

  /** 지금 상태에 이 동작들을 해 본 결과 (실제로 적용하지는 않음) */
  peek(moves: readonly Move[]): CubeState {
    return applyMoves(this.state, moves);
  }

  /**
   * 큐브를 돌려 잡는 방법(y)과 윗면 돌리기(U)의 16가지 조합 중,
   * 조건에 맞으면서 동작 수가 가장 적은 것을 찾는다.
   */
  findHold(test: (s: CubeState) => boolean, opts: { y?: boolean; u?: boolean } = {}): Move[] | null {
    let best: Move[] | null = null;
    for (let ny = 0; ny < (opts.y === false ? 1 : 4); ny++) {
      for (let nu = 0; nu < (opts.u === false ? 1 : 4); nu++) {
        const pre = [...turns('y', ny), ...turns('U', nu)];
        if (best && pre.length >= best.length) continue;
        if (test(this.peek(pre))) best = pre;
      }
    }
    return best;
  }
}

function fail(): never {
  throw new Error('풀 수 없는 상태예요. 큐브의 색 배치를 다시 확인해 주세요.');
}

// ───────── 단계별 조건 ─────────

const petalCount = (s: CubeState) => TOP_EDGES.filter((e) => colorAt(s, e, 'U') === WHITE).length;

const crossEdgeSolved = (s: CubeState, side: Face) =>
  colorAt(s, `D${side}`, 'D') === WHITE && colorAt(s, `D${side}`, side) === centerColor(s, side);

const crossEdgeCount = (s: CubeState) => SIDES.filter((x) => crossEdgeSolved(s, x)).length;

/** 흰색 엣지 중 꽃잎이 됐거나 이미 십자 자리에 들어간 개수. 4가 되면 데이지 단계가 끝난다. */
const daisyScore = (s: CubeState) => petalCount(s) + crossEdgeCount(s);

const cornerSlotSolved = (s: CubeState, a: Face, b: Face) =>
  colorAt(s, `D${a}${b}`, 'D') === WHITE &&
  colorAt(s, `D${a}${b}`, a) === centerColor(s, a) &&
  colorAt(s, `D${a}${b}`, b) === centerColor(s, b);

const SLOTS: readonly [Face, Face][] = [
  ['F', 'R'],
  ['F', 'L'],
  ['B', 'R'],
  ['B', 'L'],
];

const firstLayerDone = (s: CubeState) => SLOTS.every(([a, b]) => cornerSlotSolved(s, a, b));

const middleEdgeSolved = (s: CubeState, a: Face, b: Face) =>
  colorAt(s, `${a}${b}`, a) === centerColor(s, a) && colorAt(s, `${a}${b}`, b) === centerColor(s, b);

const middleDone = (s: CubeState) => SLOTS.every(([a, b]) => middleEdgeSolved(s, a, b));

const yellowUp = (s: CubeState, piece: string) => colorAt(s, piece, 'U') === centerColor(s, 'U');

const topEdgeMatches = (s: CubeState, side: Face) => colorAt(s, `U${side}`, side) === centerColor(s, side);

const TOP_CORNERS: readonly [Face, Face][] = SLOTS;

function topCornerPlaced(s: CubeState, a: Face, b: Face): boolean {
  const piece = `U${a}${b}`;
  const have = [colorAt(s, piece, 'U'), colorAt(s, piece, a), colorAt(s, piece, b)].sort();
  const want = [centerColor(s, 'U'), centerColor(s, a), centerColor(s, b)].sort();
  return have.every((c, i) => c === want[i]);
}

// ───────── 단계별 풀이 ─────────

function orient(sv: Solver): void {
  sv.begin('orient');
  for (const a of ['', 'x', "x'", 'z', "z'", 'x2']) {
    for (const b of ['', 'y', "y'", 'y2']) {
      const moves = parseAlg(`${a} ${b}`);
      const s = sv.peek(moves);
      if (centerColor(s, 'D') === WHITE && centerColor(s, 'F') === 2) {
        sv.do('노란색 센터가 위, 초록색 센터가 앞에 오도록 큐브를 잡아요.', moves);
        return;
      }
    }
  }
  fail();
}

const DAISY_MOVES: readonly Move[] = (['U', 'F', 'R', 'L', 'B'] as const).flatMap((base) =>
  QUARTERS.map((amount) => ({ base, amount })),
);

/** 꽃잎이 하나 늘어나는 가장 짧은 동작을 찾는다. 이미 십자 자리에 들어간 엣지는 건드리지 않는다. */
function findPetalMoves(state: CubeState, have: number): Move[] | null {
  const path: Move[] = [];
  const search = (s: CubeState, depth: number): boolean => {
    if (depth === 0) return daisyScore(s) > have;
    for (const m of DAISY_MOVES) {
      if (path.length > 0 && path[path.length - 1].base === m.base) continue;
      // 마지막 동작이 U이면 개수가 바뀌지 않으므로 볼 필요 없다.
      if (depth === 1 && m.base === 'U') continue;
      path.push(m);
      if (search(applyMove(s, m), depth - 1)) return true;
      path.pop();
    }
    return false;
  };
  for (let depth = 1; depth <= 5; depth++) {
    if (search(state, depth)) return path;
  }
  return null;
}

function daisy(sv: Solver): void {
  sv.begin('daisy');
  for (let guard = 0; daisyScore(sv.state) < 4; guard++) {
    if (guard > 4) fail();
    const moves = findPetalMoves(sv.state, daisyScore(sv.state));
    if (!moves) fail();
    sv.do('흰색 엣지 하나를 노란 센터 옆(윗면)으로 올려요. 흰색이 위를 봐야 해요.', moves);
  }
}

function cross(sv: Solver): void {
  sv.begin('cross');
  for (let guard = 0; petalCount(sv.state) > 0; guard++) {
    if (guard > 4) fail();
    let found: Move[] | null = null;
    for (let k = 0; k < 4 && !found; k++) {
      const pre = turns('U', k);
      const s = sv.peek(pre);
      const side = SIDES.find((x) => colorAt(s, `U${x}`, 'U') === WHITE && topEdgeMatches(s, x));
      if (side) found = [...pre, { base: side, amount: 2 }];
    }
    if (!found) fail();
    sv.do('U를 돌려 꽃잎의 옆면 색을 같은 색 센터 위에 맞춘 뒤, 그 면을 두 번 돌려 흰색을 아래로 내려요.', found);
  }
}

function corners(sv: Solver): void {
  sv.begin('corners');
  for (let guard = 0; !firstLayerDone(sv.state); guard++) {
    if (guard > 12) fail();
    // 윗층에 있는 흰색 코너를 제자리(앞-오른쪽 아래) 바로 위로
    const hold = sv.findHold((s) => {
      const c = [colorAt(s, 'UFR', 'U'), colorAt(s, 'UFR', 'F'), colorAt(s, 'UFR', 'R')];
      if (!c.includes(WHITE)) return false;
      const rest = c.filter((x) => x !== WHITE).sort();
      const want = [centerColor(s, 'F'), centerColor(s, 'R')].sort();
      return rest.length === 2 && rest[0] === want[0] && rest[1] === want[1];
    });
    if (hold) {
      sv.do('흰색 코너를 들어갈 자리(앞-오른쪽 아래) 바로 위에 오게 해요.', hold);
      const reps: Move[] = [];
      for (let n = 0; !cornerSlotSolved(sv.peek(reps), 'F', 'R'); n++) {
        if (n >= 6) fail();
        reps.push(...parseAlg(ALG.corner));
      }
      sv.do(`코너가 흰색을 아래로 하고 들어갈 때까지 R U R' U'를 반복해요 (${reps.length / 4}번).`, reps);
      continue;
    }
    // 윗층에 흰색 코너가 없으면 아래층에 잘못 들어간 코너를 꺼낸다.
    const eject = sv.findHold((s) => !cornerSlotSolved(s, 'F', 'R'), { u: false });
    if (!eject) fail();
    sv.do("잘못 들어간 코너를 앞-오른쪽 아래에 두고 R U R' U'를 한 번 해서 윗층으로 꺼내요.", [
      ...eject,
      ...parseAlg(ALG.corner),
    ]);
  }
}

function middle(sv: Solver): void {
  sv.begin('middle');
  const fits = (s: CubeState, side: Face) =>
    colorAt(s, 'UF', 'F') === centerColor(s, 'F') && colorAt(s, 'UF', 'U') === centerColor(s, side);

  for (let guard = 0; !middleDone(sv.state); guard++) {
    if (guard > 12) fail();
    const hold = sv.findHold((s) => fits(s, 'R') || fits(s, 'L'));
    if (hold) {
      sv.do('노란색이 없는 윗층 엣지를 찾아, 옆면 색이 같은 색 센터 위에 오게 하고 그 면을 앞에 둬요.', hold);
      if (fits(sv.state, 'R')) {
        sv.do('엣지의 윗면 색이 오른쪽 센터와 같아요. 오른쪽으로 넣는 공식을 해요.', ALG.edgeRight);
      } else {
        sv.do('엣지의 윗면 색이 왼쪽 센터와 같아요. 왼쪽으로 넣는 공식을 해요.', ALG.edgeLeft);
      }
      continue;
    }
    const eject = sv.findHold((s) => !middleEdgeSolved(s, 'F', 'R'), { u: false });
    if (!eject) fail();
    sv.do('잘못 들어간 엣지를 앞-오른쪽에 두고, 오른쪽으로 넣는 공식을 한 번 해서 윗층으로 꺼내요.', [
      ...eject,
      ...parseAlg(ALG.edgeRight),
    ]);
  }
}

function yellowCross(sv: Solver): void {
  sv.begin('yellowCross');
  for (let guard = 0; ; guard++) {
    if (guard > 4) fail();
    const up = TOP_EDGES.filter((e) => yellowUp(sv.state, e));
    if (up.length === 4) return;
    if (up.length === 0) {
      sv.do('윗면에 노란 엣지가 하나도 없어요(점 모양). 공식을 한 번 해요.', ALG.yellowCross);
    } else if (up.length === 2 && (up.join() === 'UF,UB' || up.join() === 'UR,UL')) {
      const pre = sv.findHold((s) => yellowUp(s, 'UL') && yellowUp(s, 'UR'), { y: false });
      if (!pre) fail();
      sv.do('노란 엣지가 일자 모양이에요. 일자가 가로로 놓이게 한 뒤 공식을 해요.', [
        ...pre,
        ...parseAlg(ALG.yellowCross),
      ]);
    } else if (up.length === 2) {
      const pre = sv.findHold((s) => yellowUp(s, 'UB') && yellowUp(s, 'UL'), { y: false });
      if (!pre) fail();
      sv.do('노란 엣지가 ㄱ자 모양이에요. ㄱ자가 뒤-왼쪽에 오게 한 뒤 공식을 해요.', [
        ...pre,
        ...parseAlg(ALG.yellowCross),
      ]);
    } else {
      fail();
    }
  }
}

function yellowEdges(sv: Solver): void {
  sv.begin('yellowEdges');
  const all = (s: CubeState) => SIDES.every((x) => topEdgeMatches(s, x));
  for (let guard = 0; ; guard++) {
    if (guard > 4) fail();
    const done = sv.findHold(all, { y: false });
    if (done) {
      sv.do('U를 돌려 노란 십자의 옆면 색을 센터와 맞춰요.', done);
      return;
    }
    const adjacent = sv.findHold((s) => topEdgeMatches(s, 'B') && topEdgeMatches(s, 'R'));
    if (adjacent) {
      sv.do('U를 돌려 옆면 색이 센터와 맞는 엣지 두 개를 찾고, 그 둘이 뒤와 오른쪽에 오게 잡아요.', adjacent);
      sv.do('공식을 하면 나머지 두 엣지가 서로 자리를 바꿔요.', ALG.yellowEdges);
      continue;
    }
    const opposite = sv.findHold((s) => topEdgeMatches(s, 'F') && topEdgeMatches(s, 'B'));
    sv.do('맞는 엣지 두 개가 서로 마주 보고 있어요. 공식을 한 번 하면 이웃한 두 개가 맞는 모양으로 바뀌어요.', [
      ...(opposite ?? []),
      ...parseAlg(ALG.yellowEdges),
    ]);
  }
}

function cornerPos(sv: Solver): void {
  sv.begin('cornerPos');
  const all = (s: CubeState) => TOP_CORNERS.every(([a, b]) => topCornerPlaced(s, a, b));
  for (let guard = 0; !all(sv.state); guard++) {
    if (guard > 4) fail();
    const hold = sv.findHold((s) => topCornerPlaced(s, 'F', 'R'), { u: false });
    if (hold) {
      sv.do('제자리에 있는 코너(세 가지 색이 주변 센터와 같은 코너)를 앞-오른쪽 위에 두고 공식을 해요.', [
        ...hold,
        ...parseAlg(ALG.cornerPos),
      ]);
    } else {
      sv.do('제자리에 있는 코너가 없어요. 공식을 한 번 하면 하나가 제자리에 와요.', ALG.cornerPos);
    }
  }
}

function cornerTwist(sv: Solver): void {
  sv.begin('cornerTwist');
  const twisted = (s: CubeState) => !yellowUp(s, 'UFR');
  for (let guard = 0; TOP_CORNERS.some(([a, b]) => !yellowUp(sv.state, `U${a}${b}`)); guard++) {
    if (guard > 4) fail();
    const pre = sv.findHold(twisted, { y: false });
    if (!pre) fail();
    sv.do('큐브는 그대로 잡고 U만 돌려서, 노란색이 위를 보지 않는 코너를 앞-오른쪽 위로 가져와요.', pre);
    const reps: Move[] = [];
    for (let n = 0; twisted(sv.peek(reps)); n++) {
      if (n >= 6) fail();
      reps.push(...parseAlg(ALG.cornerTwist));
    }
    sv.do(
      `그 코너의 노란색이 위를 볼 때까지 R' D' R D를 반복해요 (${reps.length / 4}번). 아래층이 흐트러져 보여도 괜찮아요.`,
      reps,
    );
  }
  const last = sv.findHold(isSolved, { y: false });
  if (!last) fail();
  sv.do('U를 돌려 마무리해요.', last);
}

/**
 * 초보자 공식으로 푼다. 단계는 항상 STAGE_ORDER 순서로 모두 들어 있고,
 * 이미 끝난 단계는 steps가 비어 있다. 풀 수 없는 상태면 오류를 던진다.
 */
export function solveBeginner(state: CubeState): SolveStage[] {
  const sv = new Solver(state);
  orient(sv);
  daisyAndCross(sv);
  corners(sv);
  middle(sv);
  yellowCross(sv);
  yellowEdges(sv);
  cornerPos(sv);
  cornerTwist(sv);
  if (!isSolved(sv.state)) fail();
  return sv.stages;
}

const crossDone = (s: CubeState) => crossEdgeCount(s) === 4;

function daisyAndCross(sv: Solver): void {
  // 흰색 십자가 이미 되어 있으면 데이지를 거치지 않는다.
  if (crossDone(sv.state)) {
    sv.begin('daisy');
    sv.begin('cross');
    return;
  }
  daisy(sv);
  cross(sv);
}

export function stageMoves(stage: SolveStage): Move[] {
  return stage.steps.flatMap((s) => s.moves);
}
