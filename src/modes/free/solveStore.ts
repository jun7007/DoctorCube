import { useState, useSyncExternalStore } from 'react';
import { SOLVES_KEY, addSolve, loadSolves, removeSolve, saveSolves, type SolveRecord } from './stats';

/**
 * 기기에 저장되는 풀이 기록. 탭을 오가도, 페이지를 다시 열어도 남는다.
 * 바꿀 때마다 바로 저장하고, 보고 있는 화면에 알린다.
 */
class SolveStore {
  private solves: readonly SolveRecord[] | null = null;
  private readonly listeners = new Set<() => void>();
  private watching = false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.watch();
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): readonly SolveRecord[] => (this.solves ??= loadSolves());

  add(solve: SolveRecord): void {
    this.set(addSolve(this.getSnapshot(), solve));
  }

  remove(at: number): void {
    this.set(removeSolve(this.getSnapshot(), at));
  }

  clear(): void {
    this.set([]);
  }

  private set(next: readonly SolveRecord[]): void {
    this.solves = next;
    saveSolves(next);
    this.notify();
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  /** 다른 창에서 기록이 바뀌면 따라간다. */
  private watch(): void {
    if (this.watching || typeof window === 'undefined') return;
    this.watching = true;
    window.addEventListener('storage', (e) => {
      if (e.key !== null && e.key !== SOLVES_KEY) return;
      this.solves = loadSolves();
      this.notify();
    });
  }
}

export const solveStore = new SolveStore();

export function useSolves(): readonly SolveRecord[] {
  return useSyncExternalStore(solveStore.subscribe, solveStore.getSnapshot);
}

// ───────────────────────── 관찰 시간 설정 ─────────────────────────

/** 관찰 시간 (ms) */
export const INSPECTION_MS = 15000;

const INSPECTION_KEY = 'doctorcube.inspection';

function loadInspection(): boolean {
  try {
    return localStorage.getItem(INSPECTION_KEY) === '1';
  } catch {
    // 저장소를 못 쓰는 환경이면 기본값(끔)
    return false;
  }
}

/** 섞은 뒤 15초 동안 큐브를 살펴볼지. 기기에 저장된다. */
export function useInspection(): [boolean, (next: boolean) => void] {
  const [on, setOn] = useState(loadInspection);
  const change = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(INSPECTION_KEY, next ? '1' : '0');
    } catch {
      // 저장 실패는 무시
    }
  };
  return [on, change];
}
