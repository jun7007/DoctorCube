import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { invertMove, moveToString, type Move } from '../../core/cube';
import type { CubeCanvasHandle } from '../../ui/CubeCanvas';
import { BUZZ_WRONG, buzz } from '../../ui/haptics';
import { MovePad } from '../../ui/MovePad';
import { SpeedControl, type Speed } from '../../ui/speed';
import { useMoveKeys } from '../../ui/useMoveKeys';
import type { Playable } from './resolve';

interface Props {
  view: RefObject<CubeCanvasHandle | null>;
  playable: Playable;
  /** 90° 회전 한 번의 시간 (재생 간격 계산용) */
  speedMs: number;
  speed: Speed;
  onSpeed: (next: Speed) => void;
  /** 재생 버튼 없이 직접 돌려야 하는 단계 */
  selfOnly: boolean;
  /** 사용자가 큐브를 돌렸을 때 이 플레이어가 받도록 등록한다 */
  turnHandler: RefObject<((move: Move) => void) | null>;
  /** 무작위 예제 단계에서 새 큐브로 바꾸기 */
  onNewExample?: () => void;
  /** 공식을 가린다 (외운 공식을 떠올려 돌리는 연습용) */
  mask?: boolean;
  /** 끝까지 했을 때 한 번 불린다. clean = 틀린 동작이나 버튼 도움 없이 직접 해냈는지 */
  onResult?: (clean: boolean) => void;
  /** 지금 돌릴 동작을 크게 보여 준다 (실제 큐브를 들고 따라 할 때) */
  big?: boolean;
  /** 다음에 돌릴 동작이 바뀔 때마다 불린다 (끝났으면 null). 소리로 읽어 줄 때 쓴다 */
  onNext?: (move: Move | null) => void;
}

const same = (a: Move, b: Move) => a.base === b.base && a.amount === b.amount;

/**
 * 한 단계의 동작을 보여 주고 따라 하게 한다.
 * 버튼으로 한 수씩 넘길 수도 있고, 사용자가 직접 돌린 것이 다음 동작과 같으면 그대로 진행한다.
 * 다른 동작을 돌리면 되돌려 놓고 알려 준다.
 */
export function StepPlayer({
  view,
  playable,
  speedMs,
  speed,
  onSpeed,
  selfOnly,
  turnHandler,
  onNewExample,
  mask = false,
  onResult,
  big = false,
  onNext,
}: Props) {
  const flat = useMemo(() => playable.groups.flatMap((g) => g.moves), [playable]);
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  /** F2 같은 두 번 회전을 사용자가 한 번만 돌린 상태면, 그때 돌린 방향 */
  const half = useRef<Move | null>(null);
  /** 틀린 동작을 했거나 버튼으로 넘긴 적이 있는지 */
  const assisted = useRef(false);
  const reported = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const latestResult = useRef(onResult);
  const latestNext = useRef(onNext);
  useEffect(() => {
    latestResult.current = onResult;
    latestNext.current = onNext;
  });

  useEffect(() => {
    latestNext.current?.(flat[pos] ?? null);
  }, [flat, pos]);

  useEffect(() => {
    view.current?.setState(playable.start);
    view.current?.setFocus(playable.focus);
  }, [view, playable]);

  /** byUser = 사용자가 직접 돌려서 진행했는지 (아니면 버튼·재생) */
  const forward = useCallback(
    (byUser: boolean): boolean => {
      if (half.current) {
        view.current?.enqueue(half.current);
        half.current = null;
      } else {
        if (posRef.current >= flat.length) return false;
        view.current?.enqueue(flat[posRef.current]);
      }
      if (!byUser) assisted.current = true;
      posRef.current += 1;
      setPos(posRef.current);
      setMessage(null);
      if (posRef.current >= flat.length && !reported.current) {
        reported.current = true;
        latestResult.current?.(!assisted.current);
      }
      return true;
    },
    [flat, view],
  );

  const back = useCallback(() => {
    setPlaying(false);
    setMessage(null);
    if (half.current) {
      view.current?.enqueue(invertMove(half.current));
      half.current = null;
      return;
    }
    if (posRef.current === 0) return;
    posRef.current -= 1;
    setPos(posRef.current);
    view.current?.enqueue(invertMove(flat[posRef.current]));
  }, [flat, view]);

  const restart = useCallback(() => {
    setPlaying(false);
    setMessage(null);
    half.current = null;
    posRef.current = 0;
    setPos(0);
    view.current?.setState(playable.start);
  }, [playable, view]);

  const userTurn = useCallback(
    (move: Move) => {
      if (flat.length === 0) return;
      setPlaying(false);
      const expected = flat[posRef.current];
      if (!expected) {
        setMessage('이 단계의 동작은 끝났어요.');
        return;
      }
      const wanted = half.current ?? expected;
      if (same(move, wanted)) {
        forward(true);
        return;
      }
      // 두 번 회전의 첫 번째: 어느 방향이든 받는다.
      if (!half.current && expected.amount === 2 && move.base === expected.base && move.amount !== 2) {
        view.current?.enqueue(move);
        half.current = move;
        setMessage('같은 방향으로 한 번 더 돌려요.');
        return;
      }
      // 틀린 동작은 보여 준 뒤 되돌린다.
      buzz(BUZZ_WRONG);
      assisted.current = true;
      view.current?.enqueue(move);
      view.current?.enqueue(invertMove(move));
      setMessage(
        mask
          ? `${moveToString(move)}은(는) 다음 동작이 아니에요.`
          : `지금은 ${moveToString(wanted)} 차례예요. (돌린 것: ${moveToString(move)})`,
      );
    },
    [flat, forward, view, mask],
  );

  useEffect(() => {
    turnHandler.current = userTurn;
    return () => {
      turnHandler.current = null;
    };
  }, [turnHandler, userTurn]);

  // 자동 재생
  useEffect(() => {
    if (!playing) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!forward(false)) {
        setPlaying(false);
        return;
      }
      const last = flat[posRef.current - 1];
      timer = setTimeout(tick, speedMs * (last.amount === 2 ? 1.4 : 1) + 160);
    };
    timer = setTimeout(tick, 60);
    return () => clearTimeout(timer);
  }, [playing, forward, flat, speedMs]);

  useMoveKeys(userTurn, (e) => {
    if (flat.length === 0 || e.ctrlKey) return false;
    if (e.key === 'ArrowRight' && !selfOnly) {
      setPlaying(false);
      forward(false);
      return true;
    }
    if (e.key === 'ArrowLeft') {
      back();
      return true;
    }
    if (e.key === ' ' && !selfOnly) {
      setPlaying((p) => !p);
      return true;
    }
    return false;
  });

  if (flat.length === 0) {
    return onNewExample ? (
      <button className="btn" onClick={onNewExample}>
        새 예제
      </button>
    ) : null;
  }

  // 지금 하고 있는 묶음 찾기
  const done = pos >= flat.length;
  let groupIndex = 0;
  let groupStart = 0;
  for (let i = 0, offset = 0; i < playable.groups.length; i++) {
    const length = playable.groups[i].moves.length;
    if (pos < offset + length || i === playable.groups.length - 1) {
      groupIndex = i;
      groupStart = offset;
      break;
    }
    offset += length;
  }
  const group = playable.groups[groupIndex];

  return (
    <div className="player">
      {group.note && !mask && <p className="player__note">{group.note}</p>}

      {big && (
        <p className="player__big" aria-live="polite">
          {done ? '완성!' : moveToString(flat[pos])}
          {!done && flat[pos + 1] && <span>다음 {moveToString(flat[pos + 1])}</span>}
        </p>
      )}

      <div className="player__tokens" aria-label="공식">
        {group.moves.map((move, i) => {
          const at = groupStart + i;
          const state = at < pos ? 'done' : at === pos ? 'now' : 'todo';
          return (
            <span key={i} className={`token token--${state}`}>
              {mask && state !== 'done' ? '?' : moveToString(move)}
            </span>
          );
        })}
      </div>

      <div className="player__status" role="status">
        {done ? (
          <span className="player__done">✓ {selfOnly ? '잘했어요!' : '끝까지 했어요.'}</span>
        ) : message ? (
          <span className="player__warn">{message}</span>
        ) : (
          <span className="muted">
            {pos} / {flat.length}수
            {playable.groups.length > 1 && ` · 묶음 ${groupIndex + 1} / ${playable.groups.length}`}
          </span>
        )}
      </div>

      <div className="player__controls">
        <button className="btn" onClick={restart} disabled={pos === 0 && !half.current}>
          처음으로
        </button>
        {!selfOnly && (
          <>
            <button className="btn" onClick={back} disabled={pos === 0 && !half.current}>
              ◀ 한 수
            </button>
            <button className="btn btn--primary" onClick={() => setPlaying((p) => !p)} disabled={done}>
              {playing ? '멈춤' : '▶ 재생'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPlaying(false);
                forward(false);
              }}
              disabled={done}
            >
              한 수 ▶
            </button>
          </>
        )}
        {onNewExample && (
          <button className="btn" onClick={onNewExample}>
            새 예제
          </button>
        )}
      </div>

      <details className="player__pad" open={selfOnly || undefined}>
        <summary>버튼으로 돌리기 · 속도</summary>
        <MovePad onTurn={userTurn} trailing={<SpeedControl speed={speed} onChange={onSpeed} />} />
      </details>
    </div>
  );
}
