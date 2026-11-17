import { useEffect, useRef } from 'react';
import type { BaseMove, Move } from '../core/cube';

const KEY_MOVES = new Set(['u', 'd', 'l', 'r', 'f', 'b', 'm', 'e', 's', 'x', 'y', 'z']);
const WIDE_FACES = new Set(['u', 'd', 'l', 'r', 'f', 'b']);

/**
 * 키보드로 큐브 돌리기: 글자 = 회전, Shift+글자 = 반대 방향.
 * W를 누른 다음 면 글자를 누르면 두 줄을 함께 돌리는 넓은 회전이다 (W R = r, 공식의 Rw).
 * other는 그 밖의 키를 처리하고, 처리했으면 true를 돌려준다.
 */
export function useMoveKeys(onTurn: (move: Move) => void, other?: (e: KeyboardEvent) => boolean): void {
  const latest = useRef({ onTurn, other });
  useEffect(() => {
    latest.current = { onTurn, other };
  });

  useEffect(() => {
    /** 방금 W를 눌러서, 다음 면 글자를 넓은 회전으로 읽을 차례인지 */
    let wide = false;
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
      if (key === 'shift') return;
      if (key === 'w') {
        wide = true;
        e.preventDefault();
        return;
      }
      const asWide = wide && WIDE_FACES.has(key);
      wide = false;
      if (!KEY_MOVES.has(key)) return;
      const base = (asWide || key === 'x' || key === 'y' || key === 'z' ? key : key.toUpperCase()) as BaseMove;
      latest.current.onTurn({ base, amount: e.shiftKey ? -1 : 1 });
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
