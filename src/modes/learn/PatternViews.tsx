/**
 * 패턴 갤러리 화면들: 무늬 목록(PatternGallery), 무늬 하나를 3D로 만들어 보기(PatternStudy).
 * 공식 모음과 달리 다 맞춘 큐브에서 시작해, 공식을 끝까지 돌리면 무늬가 나온다.
 */
import { useMemo, useRef } from 'react';
import { PATTERNS, patternOrder, patternState, type CubePattern } from '../../algorithms/patterns';
import { SOLVED, type Move } from '../../core/cube';
import { parseAlg } from '../../core/notation';
import { CubeCanvas, type CubeCanvasHandle } from '../../ui/CubeCanvas';
import { IsoView } from '../../ui/CubeThumb';
import { SPEEDS, useSpeed } from '../../ui/speed';
import './patterns.css';
import type { Playable } from './resolve';
import { StepPlayer } from './StepPlayer';

/** 목록에 쓸 것: 무늬의 모습과 회전 수. 공식은 바뀌지 않으니 한 번만 계산한다. */
const GALLERY = PATTERNS.map((pattern) => ({
  pattern,
  state: patternState(pattern),
  turns: parseAlg(pattern.alg).length,
}));

// ───────── 목록 ─────────

interface GalleryProps {
  onBack: () => void;
  onOpen: (patternId: string) => void;
}

export function PatternGallery({ onBack, onOpen }: GalleryProps) {
  return (
    <div className="algset patterns">
      <div className="algset__head">
        <button className="link" onClick={onBack}>
          ← 목록
        </button>
        <span className="muted">무늬 {GALLERY.length}개</span>
      </div>
      <h2>패턴 갤러리</h2>
      <p className="muted">다 맞춘 큐브에 공식을 돌리면 생기는 무늬예요. 하나 골라서 따라 해 보세요.</p>

      <div className="patterns__grid">
        {GALLERY.map(({ pattern, state, turns }) => (
          <button key={pattern.id} className="case-card pattern-card" onClick={() => onOpen(pattern.id)}>
            <IsoView state={state} size={104} />
            <span className="case-card__name">{pattern.name}</span>
            <span className="muted pattern-card__turns">{turns}수</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────── 무늬 하나 만들어 보기 ─────────

interface StudyProps {
  pattern: CubePattern;
  onBack: () => void;
  onOpen: (patternId: string) => void;
}

export function PatternStudy({ pattern, onBack, onOpen }: StudyProps) {
  const view = useRef<CubeCanvasHandle>(null);
  const turnHandler = useRef<((move: Move) => void) | null>(null);
  const [speed, setSpeed] = useSpeed();
  const playable = useMemo<Playable>(
    () => ({ start: SOLVED, groups: [{ moves: parseAlg(pattern.alg) }], focus: null }),
    [pattern],
  );
  const result = useMemo(() => patternState(pattern), [pattern]);
  const order = useMemo(() => patternOrder(pattern), [pattern]);

  const index = PATTERNS.indexOf(pattern);
  const prev = PATTERNS[index - 1];
  const next = PATTERNS[index + 1];

  return (
    <div className="workspace pattern-study">
      <section className="stage" aria-label="3D 큐브">
        <CubeCanvas
          ref={view}
          getState={() => playable.start}
          onTurn={(move) => turnHandler.current?.(move)}
          duration={SPEEDS[speed].ms}
        />
        <button className="stage__view" onClick={() => view.current?.resetView()}>
          시점 초기화
        </button>
      </section>

      <section className="panel panel--lesson" aria-label="패턴">
        <div className="lesson__scroll">
          <div className="lesson__head">
            <button className="link" onClick={onBack}>
              ← 패턴 갤러리
            </button>
            <span className="muted">
              {index + 1} / {PATTERNS.length}
            </span>
          </div>
          <div className="case__title">
            <IsoView state={result} size={64} />
            <div>
              <h2 className="lesson__title">{pattern.name}</h2>
              <p className="muted">다 맞춘 큐브에서 {playable.groups[0].moves.length}수</p>
            </div>
          </div>
          <p className="lesson__body">{pattern.note}</p>

          <StepPlayer
            key={pattern.id}
            view={view}
            playable={playable}
            speedMs={SPEEDS[speed].ms}
            speed={speed}
            onSpeed={setSpeed}
            selfOnly={false}
            turnHandler={turnHandler}
          />

          {order > 1 && (
            <p className="muted pattern-study__undo">
              무늬가 나온 뒤 같은 공식을 {order - 1}번 더 돌리면 다시 다 맞춰져요.
            </p>
          )}
        </div>
        <div className="lesson__nav lesson__nav--even">
          <button className="btn" onClick={() => prev && onOpen(prev.id)} disabled={!prev}>
            이전 패턴
          </button>
          <button className="btn btn--primary" onClick={() => next && onOpen(next.id)} disabled={!next}>
            다음 패턴
          </button>
        </div>
      </section>
    </div>
  );
}
