/**
 * 카메라로 큐브를 찍어 상태를 읽는다. 두 가지 방법이 있다.
 * - 두 번에 찍기: 꼭짓점이 카메라를 보게 들어 세 면씩 두 번. 빠르지만 맞추기가 까다롭다.
 * - 여섯 번에 찍기: 한 면씩 여섯 번. 느리지만 잘 읽힌다.
 * 어느 쪽이든 안내대로 잡으면 화면의 칸이 큐브의 어느 칸인지 정해져 있어, 색만 읽으면 된다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STICKER_COLORS } from '../../render/colors';
import { classifyFaces, guessColor } from '../../scanner/classify';
import { CORNER_CELLS, CORNER_SHOTS, sampleCornerCells } from '../../scanner/corner';
import { sampleGrid, type RGB } from '../../scanner/sample';
import { FACE_ORIGIN } from './NetEditor';

const COLOR_NAMES = ['흰색', '빨간색', '초록색', '노란색', '주황색', '파란색'] as const;

type Mode = 'corners' | 'faces';

interface Step {
  title: string;
  how: string[];
  /** 화면에서 읽은 색의 순서 → 큐브의 칸 번호 */
  map: readonly number[];
  /** 이 단계에서 센터가 보이는 자리(읽은 색의 순서)와 그 자리에 와야 하는 색 */
  centers: { at: number; color: number }[];
}

/** 한 면씩: face는 면 번호(U R F D L B = 0~5)이고, 그 면의 센터 색 번호와 같다. */
const FACE_STEPS: readonly Step[] = (
  [
    [2, ['흰색 센터가 위, 초록색 센터가 카메라를 보게 잡아요.', '이 방향이 기준이에요.']],
    [1, ['흰색은 그대로 위에 두고, 큐브를 왼쪽으로 한 번 돌려요.', '빨간색 센터가 카메라를 봐요.']],
    [5, ['같은 방향으로 한 번 더 돌려요.', '파란색 센터가 카메라를 봐요.']],
    [4, ['같은 방향으로 한 번 더 돌려요.', '주황색 센터가 카메라를 봐요.']],
    [0, ['한 번 더 돌려 초록색이 다시 앞에 오게 한 뒤, 큐브를 앞으로 숙여요.', '흰색 센터가 카메라를 보고, 초록색이 아래쪽에 있어요.']],
    [3, ['이번에는 반대로 뒤로 젖혀요.', '노란색 센터가 카메라를 보고, 초록색이 위쪽에 있어요.']],
  ] as const
).map(([face, how], i) => ({
  title: `${i + 1}번째 면: ${COLOR_NAMES[face]} 센터`,
  how: [...how, '면이 네모 칸에 꽉 차게 맞춰요.'],
  map: Array.from({ length: 9 }, (_, cell) => face * 9 + cell),
  centers: [{ at: 4, color: face }],
}));

/** 세 면씩: 꼭짓점이 카메라를 보게 든다. */
const CORNER_STEPS: readonly Step[] = CORNER_SHOTS.map((shot, i) => {
  const [top, left, right] = shot.centers;
  const at = (slot: number) => CORNER_CELLS.findIndex((c) => c.slot === slot);
  return {
    title: `${i + 1}번째 사진: ${COLOR_NAMES[top]}이 위`,
    how: [
      i === 0
        ? '큐브의 꼭짓점 하나가 카메라를 똑바로 보게 들어요. 세 면이 같은 크기로 보여야 해요.'
        : '큐브를 뒤집어 반대쪽 꼭짓점이 카메라를 보게 들어요.',
      `${COLOR_NAMES[top]} 센터가 위, ${COLOR_NAMES[left]} 센터가 왼쪽 아래, ${COLOR_NAMES[right]} 센터가 오른쪽 아래에 와요.`,
      '큐브의 테두리를 육각형 선에 맞추고, 점들이 각 칸 가운데에 오게 해요.',
    ],
    map: CORNER_CELLS.map((cell) => shot.map[cell.slot]),
    centers: [
      { at: at(4), color: top },
      { at: at(22), color: left },
      { at: at(13), color: right },
    ],
  };
});

const STEPS: Record<Mode, readonly Step[]> = { corners: CORNER_STEPS, faces: FACE_STEPS };

/** 안내 그림의 크기: 카메라 화면의 짧은 변에 대한 비율 (styles.css의 값과 같아야 한다) */
const GUIDE: Record<Mode, number> = { corners: 0.8, faces: 0.66 };
/** 색을 읽을 때 쓰는 작은 그림의 한 변(픽셀) */
const SAMPLE = 300;
/** 이 값보다 확신이 낮은 칸은 "확실하지 않음"으로 표시한다 */
const UNSURE_BELOW = 0.25;
const MODE_KEY = 'doctorcube.scan-mode';

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'faces' ? 'faces' : 'corners';
  } catch {
    return 'corners';
  }
}

export interface ScanOutcome {
  state: number[];
  /** 색이 확실하지 않은 칸 번호 */
  unsure: number[];
}

interface Props {
  onDone: (outcome: ScanOutcome) => void;
  onCancel: () => void;
}

type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable';

export function ScanView({ onDone, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [mode, setMode] = useState<Mode>(loadMode);
  const [stepIndex, setStepIndex] = useState(0);
  /** 지금까지 읽은 색 (큐브 칸 번호 순서, 아직 안 찍은 칸은 null) */
  const [colors, setColors] = useState<(RGB | null)[]>(() => new Array<RGB | null>(54).fill(null));
  /** 지금 카메라에 보이는 칸들의 어림 색 */
  const [live, setLive] = useState<number[] | null>(null);

  const steps = STEPS[mode];
  const step = steps[stepIndex];

  // 카메라 켜기
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const el = video.current;
        if (!el) return;
        el.srcObject = s;
        el.play().then(
          () => setStatus('live'),
          () => setStatus('unavailable'),
        );
      })
      .catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : '';
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** 안내 그림 안쪽 칸들의 색을 읽는다. */
  const read = useCallback((): RGB[] | null => {
    const el = video.current;
    const container = box.current;
    if (!el || !container || el.videoWidth === 0) return null;
    canvas.current ??= Object.assign(document.createElement('canvas'), { width: SAMPLE, height: SAMPLE });
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // 영상은 화면을 꽉 채우도록(cover) 가운데 맞춰 보여 준다. 안내 그림이 영상의 어느 부분인지 계산한다.
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.max(cw / el.videoWidth, ch / el.videoHeight);
    const size = (GUIDE[mode] * Math.min(cw, ch)) / scale;
    ctx.drawImage(el, (el.videoWidth - size) / 2, (el.videoHeight - size) / 2, size, size, 0, 0, SAMPLE, SAMPLE);
    const image = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    return mode === 'corners' ? sampleCornerCells(image) : sampleGrid(image, { x: 0, y: 0, size: SAMPLE });
  }, [mode]);

  // 실시간 미리보기
  useEffect(() => {
    if (status !== 'live') return;
    const id = setInterval(() => {
      const samples = read();
      if (!samples) return;
      const next = samples.map(guessColor);
      setLive((prev) => (prev && prev.length === next.length && prev.every((c, i) => c === next[i]) ? prev : next));
    }, 160);
    return () => clearInterval(id);
  }, [status, read]);

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setStepIndex(0);
    setColors(new Array<RGB | null>(54).fill(null));
    setLive(null);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // 저장 실패는 무시
    }
  };

  const capture = () => {
    const samples = read();
    if (!samples) return;
    const next = [...colors];
    step.map.forEach((index, i) => {
      next[index] = samples[i];
    });
    setColors(next);
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }
    const faces = [0, 1, 2, 3, 4, 5].map((face) => next.slice(face * 9, face * 9 + 9).map((c) => c ?? ([0, 0, 0] as const)));
    const result = classifyFaces(faces);
    onDone({
      state: result.state,
      unsure: result.confidence.flatMap((c, i) => (c < UNSURE_BELOW ? [i] : [])),
    });
  };

  // 센터가 기대한 색으로 보이지 않으면 알려 준다.
  const usable = status === 'live' && live !== null && live.length === step.map.length;
  const wrongCenters = usable ? step.centers.filter((c) => live[c.at] !== c.color) : [];
  /** 지금까지 찍은 칸의 어림 색 (전개도 미리보기용) */
  const preview = useMemo(() => colors.map((c) => (c ? guessColor(c) : null)), [colors]);

  return (
    <div className="workspace">
      <section className="stage scan__camera" ref={box} aria-label="카메라">
        <video ref={video} className="scan__video" playsInline muted />

        {status === 'live' && mode === 'faces' && (
          <div className="scan__guide" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="scan__cell">
                {usable && <i style={{ background: STICKER_COLORS[live[i]] }} />}
              </span>
            ))}
          </div>
        )}

        {status === 'live' && mode === 'corners' && (
          <svg className="scan__hex" viewBox="-1 -1 2 2" aria-hidden="true">
            {CORNER_CELLS.map((cell) => (
              <polygon key={cell.slot} points={cell.outline.map((p) => `${p.x},${p.y}`).join(' ')} />
            ))}
            {CORNER_CELLS.map((cell, i) => {
              const center = step.centers.find((c) => c.at === i);
              return (
                <g key={`d${cell.slot}`}>
                  {/* 센터 자리에는 그 자리에 와야 하는 색을 고리로 보여 준다 */}
                  {center && <circle cx={cell.center.x} cy={cell.center.y} r={0.085} className="scan__ring" stroke={STICKER_COLORS[center.color]} />}
                  {usable && <circle cx={cell.center.x} cy={cell.center.y} r={0.04} className="scan__dot" fill={STICKER_COLORS[live[i]]} />}
                </g>
              );
            })}
          </svg>
        )}

        {status !== 'live' && (
          <p className="scan__message">
            {status === 'starting' && '카메라를 켜는 중이에요…'}
            {status === 'denied' && '카메라 권한이 필요해요. 브라우저에서 이 사이트의 카메라 사용을 허용해 주세요.'}
            {status === 'unavailable' && '이 기기나 주소에서는 카메라를 쓸 수 없어요. 전개도에 직접 칠해 주세요.'}
          </p>
        )}
      </section>

      <section className="panel panel--lesson" aria-label="찍는 방법">
        <div className="lesson__scroll">
          <div className="lesson__head">
            <button className="link" onClick={onCancel}>
              ← 큐브 입력
            </button>
            <span className="muted">
              {stepIndex + 1} / {steps.length}
            </span>
          </div>

          <div className="segmented scan__mode" role="radiogroup" aria-label="찍는 방법">
            <button role="radio" aria-checked={mode === 'corners'} onClick={() => changeMode('corners')}>
              두 번에 찍기
            </button>
            <button role="radio" aria-checked={mode === 'faces'} onClick={() => changeMode('faces')}>
              여섯 번에 찍기
            </button>
          </div>

          <h2 className="lesson__title">{step.title}</h2>
          {step.how.map((line) => (
            <p key={line} className="lesson__body">
              {line}
            </p>
          ))}
          <p className="lesson__body">점은 지금 읽힌 색이에요. 실제 색과 같아 보이면 "찍기"를 눌러요.</p>
          {wrongCenters.length > 0 && (
            <p className="scan__warn" role="status">
              {wrongCenters.map((c) => COLOR_NAMES[c.color]).join(', ')} 센터가 제자리에 보이지 않아요. 잡은 방향과 빛 반사를
              확인해 주세요.
            </p>
          )}

          <div className="scan__net" aria-label="지금까지 읽은 색">
            {FACE_ORIGIN.flatMap(([col, row], face) =>
              Array.from({ length: 9 }, (_, i) => {
                const index = face * 9 + i;
                const color = preview[index] ?? (i === 4 ? face : null);
                return (
                  <span
                    key={index}
                    className={preview[index] === null ? 'scan__net-empty' : undefined}
                    style={{
                      gridColumn: col + (i % 3) + 1,
                      gridRow: row + Math.floor(i / 3) + 1,
                      background: color === null ? undefined : STICKER_COLORS[color],
                    }}
                  />
                );
              }),
            )}
          </div>
          <p className="muted route__notice">
            {mode === 'corners'
              ? '세 면이 비스듬히 보여서 색을 틀리게 읽기 쉬워요. 잘 안 되면 "여섯 번에 찍기"로 바꿔 보세요.'
              : '밝은 곳에서, 스티커에 빛이 번쩍이지 않게 찍으면 잘 읽혀요.'}{' '}
            다 찍은 뒤 틀린 칸은 직접 고칠 수 있어요.
          </p>
        </div>
        <div className="lesson__nav">
          <button className="btn" onClick={() => setStepIndex(stepIndex - 1)} disabled={stepIndex === 0}>
            이전 사진
          </button>
          <button className="btn btn--primary" onClick={capture} disabled={status !== 'live'}>
            찍기
          </button>
        </div>
      </section>
    </div>
  );
}
