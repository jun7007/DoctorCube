import { useState } from 'react';

const KEY = 'doctorcube.lessons-done';

function load(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 끝낸 레슨 목록. 이 기기에 저장된다. */
export function useProgress(): { done: ReadonlySet<string>; markDone: (lessonId: string) => void } {
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set(load()));
  const markDone = (lessonId: string) => {
    if (done.has(lessonId)) return;
    const next = new Set(done).add(lessonId);
    setDone(next);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // 저장 실패는 무시 (이번 실행 동안만 기억)
    }
  };
  return { done, markDone };
}
