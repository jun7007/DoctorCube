/**
 * 카메라로 큐브 여섯 면을 차례로 찍어 상태를 읽는다.
 * 안내대로 잡으면 화면에 보이는 9칸이 그대로 그 면의 칸 순서라, 위치 변환 없이 색만 읽으면 된다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { STICKER_COLORS } from '../../render/colors';
import { classifyFaces, guessColor } from '../../scanner/classify';
import { sampleGrid, type RGB } from '../../scanner/sample';

const COLOR_NAMES = ['흰색', '빨간색', '초록색', '노란색', '주황색', '파란색'] as const;

/** 찍는 순서. face는 면 번호(U R F D L B = 0~5)이고, 그 면의 센터 색 번호와 같다. */
const STEPS: readonly { face: number; how: string[] }[] = [
  { face: 2, how: ['흰색 센터가 위, 초록색 센터가 카메라를 보게 잡아요.', '이 방향이 기준이에요.'] },
  { face: 1, how: ['흰색은 그대로 위에 두고, 큐브를 왼쪽으로 한 번 돌려요.', '빨간색 센터가 카메라를 봐요.'] },
  { face: 5, how: ['같은 방향으로 한 번 더 돌려요.', '파란색 센터가 카메라를 봐요.'] },
  { face: 4, how: ['같은 방향으로 한 번 더 돌려요.', '주황색 센터가 카메라를 봐요.'] },
  {
    face: 0,
    how: ['한 번 더 돌려 초록색이 다시 앞에 오게 한 뒤, 큐브를 앞으로 숙여요.', '흰색 센터가 카메라를 보고, 초록색이 아래쪽에 있어요.'],
  },
  {
    face: 3,
    how: ['이번에는 반대로 뒤로 젖혀요.', '노란색 센터가 카메라를 보고, 초록색이 위쪽에 있어요.'],
  },
];

/** 안내 격자의 크기: 카메라 화면의 짧은 변에 대한 비율 */
const GUIDE = 0.66;
/** 색을 읽을 때 쓰는 작은 그림의 한 변(픽셀) */
const SAMPLE = 240;
/** 이 값보다 확신이 낮은 칸은 "확실하지 않음"으로 표시한다 */
const UNSURE_BELOW = 0.25;

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
  const [stepIndex, setStepIndex] = useState(0);
  /** 면 번호 → 찍은 9칸의 색 */
  const [captured, setCaptured] = useState<Record<number, RGB[]>>({});
  /** 지금 카메라에 보이는 9칸의 어림 색 */
  const [live, setLive] = useState<number[] | null>(null);

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

  /** 안내 격자 안쪽의 9칸 색을 읽는다. */
  const read = useCallback((): RGB[] | null => {
    const el = video.current;
    const container = box.current;
    if (!el || !container || el.videoWidth === 0) return null;
    canvas.current ??= Object.assign(document.createElement('canvas'), { width: SAMPLE, height: SAMPLE });
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // 영상은 화면을 꽉 채우도록(cover) 가운데 맞춰 보여 준다. 격자가 영상의 어느 부분인지 계산한다.
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.max(cw / el.videoWidth, ch / el.videoHeight);
    const size = (GUIDE * Math.min(cw, ch)) / scale;
    ctx.drawImage(el, (el.videoWidth - size) / 2, (el.videoHeight - size) / 2, size, size, 0, 0, SAMPLE, SAMPLE);
    return sampleGrid(ctx.getImageData(0, 0, SAMPLE, SAMPLE), { x: 0, y: 0, size: SAMPLE });
  }, []);

  // 실시간 미리보기
  useEffect(() => {
    if (status !== 'live') return;
    const id = setInterval(() => {
      const samples = read();
      if (!samples) return;
      const next = samples.map(guessColor);
      setLive((prev) => (prev && prev.every((c, i) => c === next[i]) ? prev : next));
    }, 160);
    return () => clearInterval(id);
  }, [status, read]);

  const step = STEPS[stepIndex];

  const capture = () => {
    const samples = read();
    if (!samples) return;
    const next = { ...captured, [step.face]: samples };
    setCaptured(next);
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }
    const result = classifyFaces([0, 1, 2, 3, 4, 5].map((face) => next[face]));
    onDone({
      state: result.state,
      unsure: result.confidence.flatMap((c, i) => (c < UNSURE_BELOW ? [i] : [])),
    });
  };

  const wrongFace = status === 'live' && live !== null && live[4] !== step.face;

  return (
    <div className="workspace">
      <section className="stage scan__camera" ref={box} aria-label="카메라">
        <video ref={video} className="scan__video" playsInline muted />
        {status === 'live' && (
          <div className="scan__guide" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="scan__cell">
                {live && <i style={{ background: STICKER_COLORS[live[i]] }} />}
              </span>
            ))}
          </div>
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
              {stepIndex + 1} / {STEPS.length}
            </span>
          </div>
          <h2 className="lesson__title">
            {stepIndex + 1}번째 면: {COLOR_NAMES[step.face]} 센터
          </h2>
          {step.how.map((line) => (
            <p key={line} className="lesson__body">
              {line}
            </p>
          ))}
          <p className="lesson__body">면이 네모 칸에 꽉 차게 맞추고 "찍기"를 눌러요. 칸 안의 점은 지금 읽힌 색이에요.</p>
          {wrongFace && (
            <p className="scan__warn" role="status">
              가운데가 {COLOR_NAMES[step.face]}으로 보이지 않아요. 맞는 면인지, 빛이 반사되지 않는지 확인해 주세요.
            </p>
          )}

          <div className="scan__faces" aria-label="찍은 면">
            {STEPS.map((s, i) => (
              <div key={s.face} className={`scan__face${i === stepIndex ? ' scan__face--now' : ''}`}>
                {Array.from({ length: 9 }, (_, cell) => {
                  const samples = captured[s.face];
                  const color = samples && i < stepIndex ? guessColor(samples[cell]) : cell === 4 ? s.face : null;
                  return (
                    <span
                      key={cell}
                      style={color === null ? undefined : { background: STICKER_COLORS[color] }}
                      className={samples && i < stepIndex ? undefined : 'scan__face-empty'}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <p className="muted route__notice">
            밝은 곳에서, 스티커에 빛이 번쩍이지 않게 찍으면 잘 읽혀요. 다 찍은 뒤 틀린 칸은 직접 고칠 수 있어요.
          </p>
        </div>
        <div className="lesson__nav">
          <button className="btn" onClick={() => setStepIndex(stepIndex - 1)} disabled={stepIndex === 0}>
            이전 면
          </button>
          <button className="btn btn--primary" onClick={capture} disabled={status !== 'live'}>
            찍기
          </button>
        </div>
      </section>
    </div>
  );
}
