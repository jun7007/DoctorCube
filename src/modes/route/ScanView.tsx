/**
 * 카메라로 큐브를 찍어 상태를 읽는다. 안내선에 맞출 필요 없이, 화면에서 큐브의 스티커를 직접 찾는다.
 * - 두 번에 찍기: 꼭짓점이 카메라를 보게 들어 세 면씩 두 번 (어느 꼭짓점이든, 어떻게 기울이든 된다).
 * - 여섯 번에 찍기: 한 면씩 여섯 번 (어느 면이 위인지는 안내대로 잡아야 한다).
 * 찾아낸 칸마다 점을 찍어 보여 주고, 큐브를 찾았을 때만 찍을 수 있다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { STICKER_COLORS } from '../../render/colors';
import { assembleCorners, centerColors } from '../../scanner/assemble';
import { classifyFaces, guessColor } from '../../scanner/classify';
import { DETECT_WIDTH, readCorner, readFace, type CornerReading, type FaceReading, type Point } from '../../scanner/detect';
import type { RGB } from '../../scanner/sample';

const COLOR_NAMES = ['흰색', '빨간색', '초록색', '노란색', '주황색', '파란색'] as const;

type Mode = 'corners' | 'faces';

/** 한 면씩 찍는 순서: 면 번호(U R F D L B = 0~5, 센터 색 번호와 같다)와 잡는 방법 */
const FACE_STEPS: readonly { face: number; how: string[] }[] = [
  { face: 2, how: ['흰색 센터가 위, 초록색 센터가 카메라를 보게 잡아요.', '이 방향이 기준이에요.'] },
  { face: 1, how: ['흰색은 그대로 위에 두고, 큐브를 왼쪽으로 한 번 돌려요.', '빨간색 센터가 카메라를 봐요.'] },
  { face: 5, how: ['같은 방향으로 한 번 더 돌려요.', '파란색 센터가 카메라를 봐요.'] },
  { face: 4, how: ['같은 방향으로 한 번 더 돌려요.', '주황색 센터가 카메라를 봐요.'] },
  { face: 0, how: ['한 번 더 돌려 초록색이 다시 앞에 오게 한 뒤, 큐브를 앞으로 숙여요.', '흰색 센터가 카메라를 보고, 초록색이 아래쪽에 있어요.'] },
  { face: 3, how: ['이번에는 반대로 뒤로 젖혀요.', '노란색 센터가 카메라를 보고, 초록색이 위쪽에 있어요.'] },
];

const CORNER_HOW: readonly string[][] = [
  [
    '큐브의 꼭짓점 하나가 카메라를 보게 들어요. 세 면이 모두 넉넉히 보여야 해요.',
    '어느 꼭짓점이든, 어느 쪽으로 기울이든 괜찮아요.',
  ],
  ['큐브를 뒤집어, 아직 안 찍은 세 면이 만나는 반대쪽 꼭짓점이 카메라를 보게 들어요.'],
];

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

/** 지금 화면에서 찾아낸 것과, 그림 좌표를 화면 좌표로 바꾸는 데 필요한 크기들 */
interface Seen {
  corner: CornerReading | null;
  face: FaceReading | null;
  /** 인식에 쓴 그림 크기, 카메라 영상 크기, 화면 영역 크기 */
  image: { width: number; height: number };
  box: { width: number; height: number };
}

export function ScanView({ onDone, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [mode, setMode] = useState<Mode>(loadMode);
  const [stepIndex, setStepIndex] = useState(0);
  const [seen, setSeen] = useState<Seen | null>(null);
  /** 두 번에 찍기: 첫 번째 사진에서 읽은 세 면 */
  const [firstCorner, setFirstCorner] = useState<CornerReading | null>(null);
  /** 여섯 번에 찍기: 면 번호 → 읽은 9칸 */
  const [faces, setFaces] = useState<Record<number, RGB[]>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const stepCount = mode === 'corners' ? 2 : FACE_STEPS.length;

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

  /** 지금 카메라 화면에서 큐브를 찾는다. */
  const look = useCallback((): Seen | null => {
    const el = video.current;
    const container = box.current;
    if (!el || !container || el.videoWidth === 0) return null;
    const width = DETECT_WIDTH;
    const height = Math.round((el.videoHeight * DETECT_WIDTH) / el.videoWidth);
    canvas.current ??= document.createElement('canvas');
    if (canvas.current.width !== width || canvas.current.height !== height) {
      canvas.current.width = width;
      canvas.current.height = height;
    }
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    return {
      corner: mode === 'corners' ? readCorner(image) : null,
      face: mode === 'faces' ? readFace(image) : null,
      image: { width, height },
      box: { width: container.clientWidth, height: container.clientHeight },
    };
  }, [mode]);

  // 실시간으로 찾아서 화면에 표시한다.
  useEffect(() => {
    if (status !== 'live') return;
    const id = setInterval(() => setSeen(look()), 250);
    return () => clearInterval(id);
  }, [status, look]);

  const restart = (next: Mode) => {
    setMode(next);
    setStepIndex(0);
    setFirstCorner(null);
    setFaces({});
    setSeen(null);
    setProblem(null);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // 저장 실패는 무시
    }
  };

  const finish = (result: { state: number[]; confidence: number[] }) =>
    onDone({ state: result.state, unsure: result.confidence.flatMap((c, i) => (c < UNSURE_BELOW ? [i] : [])) });

  const capture = () => {
    const now = look();
    if (!now) return;
    setProblem(null);

    if (mode === 'corners') {
      if (!now.corner) return;
      if (!firstCorner) {
        setFirstCorner(now.corner);
        setStepIndex(1);
        return;
      }
      const result = assembleCorners(firstCorner, now.corner);
      if (result.centersMatched < 6) {
        setProblem('두 사진이 서로 반대쪽 꼭짓점이 아닌 것 같아요. 큐브를 뒤집어 아직 안 찍은 세 면이 보이게 다시 찍어 주세요.');
        return;
      }
      finish(result);
      return;
    }

    if (!now.face) return;
    const next = { ...faces, [FACE_STEPS[stepIndex].face]: now.face.colors };
    setFaces(next);
    if (stepIndex < FACE_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }
    finish(classifyFaces([0, 1, 2, 3, 4, 5].map((face) => next[face])));
  };

  const back = () => {
    setProblem(null);
    setStepIndex(stepIndex - 1);
    if (mode === 'corners') setFirstCorner(null);
  };

  // 화면에 찍을 점: 찾아낸 칸의 위치와 어림 색
  const dots: { at: Point; color: number }[] = [];
  if (seen?.corner) {
    for (const face of seen.corner.faces) {
      face.points.forEach((row, a) => row.forEach((at, b) => dots.push({ at, color: guessColor(face.colors[a][b]) })));
    }
  } else if (seen?.face) {
    seen.face.points.forEach((at, i) => dots.push({ at, color: guessColor(seen.face!.colors[i]) }));
  }
  const found = dots.length > 0;

  // 영상은 잘리지 않게 전체가 보이도록(contain) 가운데 맞춰 보이므로, 그림 좌표를 그에 맞춰 옮긴다.
  const place = (p: Point): Point => {
    if (!seen) return p;
    const scale = Math.min(seen.box.width / seen.image.width, seen.box.height / seen.image.height);
    return {
      x: (p.x - seen.image.width / 2) * scale + seen.box.width / 2,
      y: (p.y - seen.image.height / 2) * scale + seen.box.height / 2,
    };
  };

  // 찍기 전에 미리 알려 줄 수 있는 문제
  let warning: string | null = null;
  if (mode === 'corners' && firstCorner && seen?.corner) {
    const before = centerColors(firstCorner);
    const again = centerColors(seen.corner).filter((c) => before.includes(c));
    if (again.length > 0) {
      warning = `${again.map((c) => COLOR_NAMES[c]).join(', ')} 센터는 이미 찍은 면이에요. 큐브를 뒤집어 반대쪽 꼭짓점을 보여 주세요.`;
    }
  }
  if (mode === 'faces' && seen?.face && guessColor(seen.face.colors[4]) !== FACE_STEPS[stepIndex].face) {
    warning = `가운데가 ${COLOR_NAMES[FACE_STEPS[stepIndex].face]}으로 보이지 않아요. 맞는 면인지, 빛이 반사되지 않는지 확인해 주세요.`;
  }

  const title =
    mode === 'corners'
      ? `${stepIndex + 1}번째 사진: ${stepIndex === 0 ? '꼭짓점 쪽에서' : '반대쪽 꼭짓점에서'}`
      : `${stepIndex + 1}번째 면: ${COLOR_NAMES[FACE_STEPS[stepIndex].face]} 센터`;
  const how = mode === 'corners' ? CORNER_HOW[stepIndex] : FACE_STEPS[stepIndex].how;
  const wanted = mode === 'corners' ? 27 : 9;

  return (
    <div className="workspace">
      <section className="stage scan__camera" ref={box} aria-label="카메라">
        <video ref={video} className="scan__video" playsInline muted />
        {status === 'live' && seen && (
          <svg className="scan__overlay" viewBox={`0 0 ${seen.box.width} ${seen.box.height}`} aria-hidden="true">
            {dots.map((dot, i) => {
              const p = place(dot.at);
              return <circle key={i} cx={p.x} cy={p.y} r={7} className="scan__dot" fill={STICKER_COLORS[dot.color]} />;
            })}
          </svg>
        )}
        {status === 'live' && (
          <p className={`scan__state${found ? ' scan__state--found' : ''}`} role="status">
            {found ? `큐브를 찾았어요 (${wanted}칸)` : '큐브를 찾는 중이에요…'}
          </p>
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
              {stepIndex + 1} / {stepCount}
            </span>
          </div>

          <div className="segmented scan__mode" role="radiogroup" aria-label="찍는 방법">
            <button role="radio" aria-checked={mode === 'corners'} onClick={() => mode !== 'corners' && restart('corners')}>
              두 번에 찍기
            </button>
            <button role="radio" aria-checked={mode === 'faces'} onClick={() => mode !== 'faces' && restart('faces')}>
              여섯 번에 찍기
            </button>
          </div>

          <h2 className="lesson__title">{title}</h2>
          {how.map((line) => (
            <p key={line} className="lesson__body">
              {line}
            </p>
          ))}
          <p className="lesson__body">
            안내선에 맞출 필요는 없어요. 칸마다 점이 찍히면 큐브를 찾은 거예요. 점의 색이 실제 색과 같아 보이면 "찍기"를 눌러요.
          </p>
          {(problem ?? warning) && (
            <p className="scan__warn" role="status">
              {problem ?? warning}
            </p>
          )}
          <p className="muted route__notice">
            잘 안 찾아지면: 큐브가 화면에 크게 나오게 하고, 스티커에 빛이 번쩍이지 않게 하고, 큐브와 색이 다른 배경 앞에서 찍어 보세요.
            손가락이 스티커를 가리지 않게 모서리를 잡아요. 다 찍은 뒤 틀린 칸은 직접 고칠 수 있어요.
          </p>
        </div>
        <div className="lesson__nav">
          <button className="btn" onClick={back} disabled={stepIndex === 0}>
            이전 사진
          </button>
          <button className="btn btn--primary" onClick={capture} disabled={status !== 'live' || !found}>
            찍기
          </button>
        </div>
      </section>
    </div>
  );
}
