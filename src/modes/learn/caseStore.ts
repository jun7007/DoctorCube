import { useState } from 'react';
import type { AlgCase } from '../../algorithms';

/** 공식 하나의 학습 기록 */
export interface CaseStat {
  /** "외웠어요" 표시 */
  known?: boolean;
  /** 연습에서 도움 없이 맞힌 횟수 */
  ok: number;
  /** 연습에서 틀리거나 공식을 본 횟수 */
  fail: number;
}

type Stats = Readonly<Record<string, CaseStat>>;

const KEY = 'doctorcube.cases';

function load(): Stats {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Stats) : {};
  } catch {
    return {};
  }
}

/** 공식별 학습 기록. 이 기기에 저장된다. */
export function useCaseStats() {
  const [stats, setStats] = useState<Stats>(load);

  const update = (id: string, change: (old: CaseStat) => CaseStat) => {
    setStats((prev) => {
      const next = { ...prev, [id]: change(prev[id] ?? { ok: 0, fail: 0 }) };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // 저장 실패는 무시 (이번 실행 동안만 기억)
      }
      return next;
    });
  };

  return {
    stats,
    setKnown: (id: string, known: boolean) => update(id, (old) => ({ ...old, known })),
    record: (id: string, ok: boolean) =>
      update(id, (old) => (ok ? { ...old, ok: old.ok + 1 } : { ...old, fail: old.fail + 1 })),
  };
}

/**
 * 연습에 낼 다음 문제를 고른다.
 * 아직 못 외운 공식과 자주 틀린 공식이 더 자주 나오고, 방금 낸 문제는 연달아 내지 않는다.
 */
export function pickCase(
  cases: readonly AlgCase[],
  stats: Stats,
  previousId: string | null,
  random: () => number = Math.random,
): AlgCase {
  const pool = cases.length > 1 ? cases.filter((c) => c.id !== previousId) : cases;
  const weights = pool.map((c) => {
    const s = stats[c.id];
    if (!s) return 3;
    return (s.known ? 1 : 3) + Math.min(4, Math.max(0, s.fail - s.ok));
  });
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}
