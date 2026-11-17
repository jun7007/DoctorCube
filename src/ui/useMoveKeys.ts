import { useEffect, useRef } from 'react';
import type { BaseMove, Move } from '../core/cube';

const KEY_MOVES = new Set(['u', 'd', 'l', 'r', 'f', 'b', 'm', 'e', 's', 'x', 'y', 'z']);

/**
 * 키보드로 큐브 돌리기: 글자 = 회전, Shift+글자 = 반대 방향.
 * other는 그 밖의 키를 처리하고, 처리했으면 true를 돌려준다.
 */
export function useMoveKeys(onTurn: (move: Move) => void, other?: (e: KeyboardEvent) => boolean): void {
  const latest = useRef({ onTurn, other });
  useEffect(() => {
    latest.current = { onTurn, other };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (latest.current.other?.(e)) {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (!KEY_MOVES.has(key)) return;
      const base = (key === 'x' || key === 'y' || key === 'z' ? key : key.toUpperCase()) as BaseMove;
      latest.current.onTurn({ base, amount: e.shiftKey ? -1 : 1 });
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
