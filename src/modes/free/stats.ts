/**
 * 풀이 기록과 통계 (화면과 무관한 순수 로직).
 *
 * 시간은 대회 방식대로 1/100초 아래를 버리고 계산한다.
 * 그래서 화면에 보이는 시간들로 직접 계산한 값과 통계가 정확히 맞는다.
 */

export interface SolveRecord {
  /** 끝난 시각 (Date.now()). 기록마다 달라서 이름표로도 쓴다. */
  readonly at: number;
  /** 걸린 시간 (ms) */
  readonly ms: number;
  /** 회전 수 (큐브 전체 회전은 뺌) */
  readonly turns: number;
  /** 섞은 공식 */
  readonly scramble: string;
  /** 힌트의 "이 동작 하기"를 썼는지 */
  readonly hint: boolean;
}

export const SOLVES_KEY = 'doctorcube.solves';
export const MAX_SOLVES = 200;

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'setItem'>;

// ───────────────────────── 시간 표시 ─────────────────────────

/** 1/100초 단위로 버린 시간 (단위: 1/100초) */
function toCentis(ms: number): number {
  return Math.floor(Math.max(0, ms) / 10);
}

/** 12.34 또는 1:02.34 */
export function formatTime(ms: number): string {
  const centis = toCentis(ms);
  const minutes = Math.floor(centis / 6000);
  const seconds = ((centis % 6000) / 100).toFixed(2);
  return minutes > 0 ? `${minutes}:${seconds.padStart(5, '0')}` : seconds;
}

/** 값이 없으면 "-" */
export function formatStat(ms: number | null): string {
  return ms === null ? '-' : formatTime(ms);
}

// ───────────────────────── 통계 ─────────────────────────

/** 통계에 넣는 시간들 (ms, 오래된 것부터). 힌트를 쓴 풀이는 뺀다. */
export function countedTimes(solves: readonly SolveRecord[]): number[] {
  return solves.filter((s) => !s.hint).map((s) => toCentis(s.ms) * 10);
}

export function bestOf(times: readonly number[]): number | null {
  return times.length > 0 ? Math.min(...times) : null;
}

/** 평균. 1/100초로 반올림한다. */
export function meanOf(times: readonly number[]): number | null {
  if (times.length === 0) return null;
  return roundToCenti(times.reduce((a, b) => a + b, 0) / times.length);
}

/**
 * 최근 n번의 평균(ao5, ao12 …): 가장 빠른 것과 가장 느린 것 하나씩을 빼고 나머지를 평균한다.
 * n번이 안 되면 null.
 */
export function aoN(times: readonly number[], n: number): number | null {
  if (n < 3 || times.length < n) return null;
  const sorted = times.slice(-n).sort((a, b) => a - b);
  return meanOf(sorted.slice(1, -1));
}

/** 연속한 n번 묶음 가운데 가장 좋은 평균. n번이 안 되면 null. */
export function bestAoN(times: readonly number[], n: number): number | null {
  let best: number | null = null;
  for (let end = n; end <= times.length; end++) {
    const ao = aoN(times.slice(end - n, end), n);
    if (ao !== null && (best === null || ao < best)) best = ao;
  }
  return best;
}

export interface SolveStats {
  /** 모든 풀이 수 (힌트를 쓴 것 포함) */
  readonly count: number;
  /** 힌트를 쓴 풀이 수 */
  readonly hinted: number;
  readonly best: number | null;
  readonly mean: number | null;
  readonly ao5: number | null;
  readonly ao12: number | null;
  readonly bestAo5: number | null;
}

export function summarize(solves: readonly SolveRecord[]): SolveStats {
  const times = countedTimes(solves);
  return {
    count: solves.length,
    hinted: solves.length - times.length,
    best: bestOf(times),
    mean: meanOf(times),
    ao5: aoN(times, 5),
    ao12: aoN(times, 12),
    bestAo5: bestAoN(times, 5),
  };
}

function roundToCenti(ms: number): number {
  return Math.round(ms / 10) * 10;
}

// ───────────────────────── 기록 목록 ─────────────────────────

/** 기록을 맨 뒤에 붙인다. 최근 200개만 남긴다. */
export function addSolve(solves: readonly SolveRecord[], solve: SolveRecord): SolveRecord[] {
  // at은 지울 때 이름표로 쓰므로 겹치면 1ms씩 뒤로 민다.
  let at = solve.at;
  while (solves.some((s) => s.at === at)) at++;
  return [...solves, at === solve.at ? solve : { ...solve, at }].slice(-MAX_SOLVES);
}

export function removeSolve(solves: readonly SolveRecord[], at: number): SolveRecord[] {
  return solves.filter((s) => s.at !== at);
}

// ───────────────────────── 저장 ─────────────────────────

function isRecord(value: unknown): value is SolveRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.at === 'number' &&
    Number.isFinite(v.at) &&
    typeof v.ms === 'number' &&
    Number.isFinite(v.ms) &&
    v.ms >= 0 &&
    typeof v.turns === 'number' &&
    Number.isInteger(v.turns) &&
    v.turns >= 0 &&
    typeof v.scramble === 'string' &&
    typeof v.hint === 'boolean'
  );
}

/** 저장된 글자를 기록 목록으로 바꾼다. 깨진 내용은 버리고, 읽을 수 있는 기록만 남긴다. */
export function parseSolves(raw: string | null | undefined): SolveRecord[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<number>();
  const out: SolveRecord[] = [];
  for (const item of data) {
    if (!isRecord(item) || seen.has(item.at)) continue;
    seen.add(item.at);
    out.push({ at: item.at, ms: item.ms, turns: item.turns, scramble: item.scramble, hint: item.hint });
  }
  return out.slice(-MAX_SOLVES);
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSolves(storage: ReadStore | null = defaultStorage()): SolveRecord[] {
  try {
    return parseSolves(storage?.getItem(SOLVES_KEY));
  } catch {
    // 저장소를 못 쓰는 환경이면 빈 목록
    return [];
  }
}

export function saveSolves(solves: readonly SolveRecord[], storage: WriteStore | null = defaultStorage()): void {
  try {
    storage?.setItem(SOLVES_KEY, JSON.stringify(solves.slice(-MAX_SOLVES)));
  } catch {
    // 저장 실패는 무시 (기록은 화면에 남아 있다)
  }
}
