import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { CubeState, Move } from '../core/cube';
import { CubeView } from '../render/CubeView';
import { buzz } from './haptics';

export interface CubeCanvasHandle {
  enqueue(move: Move, duration?: number): void;
  setState(state: CubeState): void;
  setFocus(focus: ReadonlySet<number> | null): void;
  resetView(): void;
}

interface Props {
  ref?: Ref<CubeCanvasHandle>;
  /** 화면을 처음 만들 때 보여 줄 상태 */
  getState: () => CubeState;
  onTurn: (move: Move) => void;
  /** 90° 회전 한 번에 걸리는 시간(ms) */
  duration: number;
}

export function CubeCanvas({ ref, getState, onTurn, duration }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const latest = useRef({ getState, onTurn });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = { getState, onTurn };
  });

  useEffect(() => {
    let view: CubeView;
    try {
      view = new CubeView(hostRef.current!, {
        onTurn: (m) => {
          buzz();
          latest.current.onTurn(m);
        },
      });
    } catch {
      setFailed(true);
      return;
    }
    view.setState(latest.current.getState());
    viewRef.current = view;
    // 개발 중 자동 점검 스크립트가 화면 좌표를 계산할 수 있게 열어 둔다 (배포본에는 없음).
    if (import.meta.env.DEV) (window as unknown as { __cubeView?: CubeView }).__cubeView = view;
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.setDuration(duration);
  }, [duration]);

  useImperativeHandle(
    ref,
    () => ({
      enqueue: (move, d) => viewRef.current?.enqueue(move, d),
      setState: (state) => viewRef.current?.setState(state),
      setFocus: (focus) => viewRef.current?.setFocus(focus),
      resetView: () => viewRef.current?.resetView(),
    }),
    [],
  );

  return (
    <div ref={hostRef} className="cube-canvas">
      {failed && <p className="cube-canvas__error">이 브라우저에서는 3D 화면(WebGL)을 쓸 수 없어요.</p>}
    </div>
  );
}
