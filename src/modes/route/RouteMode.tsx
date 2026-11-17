/**
 * 경로 탭: 큐브 상태를 입력하고 → 풀이 방법별 경로를 비교하고 → 고른 경로를 따라 한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SOLVED, applyMoves, isRotation, isSolved, type CubeState, type Move } from '../../core/cube';
import { toStandardOrientation } from '../../core/frames';
import { parseAlg } from '../../core/notation';
import { generateScramble } from '../../core/scramble';
import { validateState } from '../../solvers/kociemba';
import { CubeCanvas, type CubeCanvasHandle } from '../../ui/CubeCanvas';
import { IsoView } from '../../ui/CubeThumb';
import { moveSpeech, speak, speechAvailable, stopSpeaking, useVoice } from '../../ui/speech';
import { SPEEDS, useSpeed } from '../../ui/speed';
import { useSolves } from '../free/solveStore';
import { useCaseStats } from '../learn/caseStore';
import type { Playable } from '../learn/resolve';
import { StepPlayer } from '../learn/StepPlayer';
import { NetEditor } from './NetEditor';
import { estimateSeconds, methodRoutes, paceFromSolves, shortestRoute, type Route } from './routes';
import { ScanView } from './ScanView';

/** 경로 탭의 상태. 탭을 오가도 유지되도록 App이 보관한다. */
export interface RouteSession {
  cube: CubeState;
  view: 'input' | 'scan' | 'compare' | 'follow';
  /** 따라 하는 중인 경로 */
  following: Route | null;
  /** 카메라로 읽은 결과에서 색이 확실하지 않은 칸. 카메라로 읽지 않았으면 null */
  unsure: readonly number[] | null;
}

export const INITIAL_ROUTE_SESSION: RouteSession = { cube: SOLVED, view: 'input', following: null, unsure: null };

interface Props {
  session: RouteSession;
  onSession: (next: RouteSession) => void;
  /** 자유 모드에서 지금 풀고 있는 큐브 */
  getFreeCube: () => CubeState;
}

export function RouteMode({ session, onSession, getFreeCube }: Props) {
  if (session.view === 'follow' && session.following) {
    return (
      <FollowView
        cube={session.cube}
        route={session.following}
        onBack={() => onSession({ ...session, view: 'compare', following: null })}
      />
    );
  }
  if (session.view === 'compare') {
    return (
      <CompareView
        cube={session.cube}
        onBack={() => onSession({ ...session, view: 'input' })}
        onFollow={(route) => onSession({ ...session, view: 'follow', following: route })}
      />
    );
  }
  if (session.view === 'scan') {
    return (
      <ScanView
        onCancel={() => onSession({ ...session, view: 'input' })}
        onDone={({ state, unsure }) => onSession({ ...session, cube: state, unsure, view: 'input' })}
      />
    );
  }
  return (
    <InputView
      cube={session.cube}
      unsure={session.unsure}
      onCube={(cube, unsure = null) => onSession({ ...session, cube, unsure })}
      onScan={() => onSession({ ...session, view: 'scan' })}
      onNext={() => onSession({ ...session, view: 'compare' })}
      getFreeCube={getFreeCube}
    />
  );
}

// ───────── 1. 큐브 입력 ─────────

interface InputProps {
  cube: CubeState;
  unsure: readonly number[] | null;
  /** unsure를 주지 않으면 카메라 결과 표시를 지운다 */
  onCube: (cube: CubeState, unsure?: readonly number[] | null) => void;
  onScan: () => void;
  onNext: () => void;
  getFreeCube: () => CubeState;
}

function InputView({ cube, unsure, onCube, onScan, onNext, getFreeCube }: InputProps) {
  const view = useRef<CubeCanvasHandle>(null);
  const [color, setColor] = useState(0);
  const [algText, setAlgText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    view.current?.setState(cube);
  }, [cube]);

  const check = useMemo(() => validateState(cube), [cube]);
  const solved = check.ok && isSolved(cube);

  const set = (next: CubeState, message: string | null = null) => {
    onCube(next);
    setNotice(message);
  };

  const applyAlg = () => {
    try {
      set(applyMoves(SOLVED, parseAlg(algText)), '완성 상태에 공식을 적용했어요.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '공식을 읽을 수 없어요.');
    }
  };

  const importFree = () => {
    const standard = toStandardOrientation(getFreeCube());
    if (standard) set(standard, '자유 모드의 큐브를 가져왔어요.');
    else setNotice('자유 모드의 큐브를 가져올 수 없어요.');
  };

  return (
    <div className="workspace">
      <section className="stage" aria-label="3D 큐브">
        <CubeCanvas ref={view} getState={() => cube} onTurn={() => {}} duration={200} />
        <button className="stage__view" onClick={() => view.current?.resetView()}>
          시점 초기화
        </button>
      </section>

      <section className="panel panel--lesson" aria-label="큐브 입력">
        <div className="lesson__scroll">
          <h2 className="lesson__title">큐브 상태 입력</h2>
          <p className="lesson__body">
            실제 큐브와 똑같이 색을 칠해요. 흰색 센터가 위, 초록색 센터가 앞을 보게 잡고 옮겨 적으면 돼요.
          </p>

          <NetEditor
            state={cube}
            color={color}
            onColor={setColor}
            unsure={unsure ?? []}
            onPaint={(index) => {
              const next = [...cube];
              next[index] = color;
              // 직접 칠한 칸은 확인한 것으로 본다.
              onCube(next, unsure && unsure.filter((i) => i !== index));
              setNotice(null);
            }}
          />

          {unsure && (
            <p className="route__notice route__scan-note">
              카메라로 읽은 결과예요. 실제 큐브와 비교해서 틀린 칸은 색을 고른 뒤 눌러 고쳐 주세요.
              {unsure.length > 0 && ` 물음표로 표시한 ${unsure.length}칸은 색이 확실하지 않아요.`}
            </p>
          )}

          <p className={`route__check${check.ok ? ' route__check--ok' : ''}`} role="status">
            {solved ? '완성된 상태예요. 색을 칠하거나 아래에서 섞어 보세요.' : check.ok ? '✓ 풀 수 있는 상태예요.' : check.reason}
          </p>
          {notice && <p className="muted route__notice">{notice}</p>}

          <button className="btn route__scan" onClick={onScan}>
            카메라로 찍어서 입력
          </button>

          <div className="route__sources">
            <button className="btn" onClick={() => set(applyMoves(SOLVED, generateScramble()), '무작위로 섞었어요.')}>
              무작위로 섞기
            </button>
            <button className="btn" onClick={importFree}>
              자유 모드 큐브
            </button>
            <button className="btn" onClick={() => set(SOLVED)}>
              완성 상태로
            </button>
          </div>

          <details className="help">
            <summary>섞는 공식으로 입력</summary>
            <div className="route__alg">
              <input
                value={algText}
                onChange={(e) => setAlgText(e.target.value)}
                placeholder="예: R U R' U' F2 D"
                aria-label="섞는 공식"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button className="btn" onClick={applyAlg}>
                적용
              </button>
            </div>
          </details>
        </div>
        <div className="lesson__nav lesson__nav--single">
          <button className="btn btn--primary" onClick={onNext} disabled={!check.ok || solved}>
            경로 찾기
          </button>
        </div>
      </section>
    </div>
  );
}

// ───────── 2. 경로 비교 ─────────

type Pace = 'mine' | 'slow' | 'normal' | 'fast';
interface PaceInfo {
  label: string;
  /** 초당 회전 수 */
  tps: number;
  /** 묶음마다 다음 할 일을 알아보는 데 드는 시간(초) */
  look: number;
}
const PACES: Record<Exclude<Pace, 'mine'>, PaceInfo> = {
  slow: { label: '처음 배우는 중', tps: 1, look: 3 },
  normal: { label: '익숙함', tps: 2.5, look: 1.2 },
  fast: { label: '빠름', tps: 5, look: 0.5 },
};

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return s >= 60 ? `약 ${Math.floor(s / 60)}분 ${s % 60}초` : `약 ${s}초`;
}

interface CompareProps {
  cube: CubeState;
  onBack: () => void;
  onFollow: (route: Route) => void;
}

function CompareView({ cube, onBack, onFollow }: CompareProps) {
  const solves = useSolves();
  const { stats } = useCaseStats();
  // 자유 탭의 기록이 있으면 그것으로 내 손 속도를 잰다. 생각하는 시간까지 들어간 값이라 따로 더하지 않는다.
  const mine = useMemo(() => paceFromSolves(solves), [solves]);
  const paces: Partial<Record<Pace, PaceInfo>> = mine
    ? { mine: { label: `내 기록 (초당 ${mine.toFixed(1)}회전)`, tps: mine, look: 0 }, ...PACES }
    : PACES;
  const [chosen, setPace] = useState<Pace | null>(null);
  const pace: Pace = chosen && paces[chosen] ? chosen : mine ? 'mine' : 'slow';
  const methods = useMemo(() => {
    const known = new Set(Object.keys(stats).filter((id) => stats[id].known));
    try {
      return methodRoutes(cube, known);
    } catch {
      return null;
    }
  }, [cube, stats]);
  const [shortest, setShortest] = useState<Route | 'loading' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setShortest('loading');
    shortestRoute(cube).then(
      (route) => alive && setShortest(route),
      () => alive && setShortest('error'),
    );
    return () => {
      alive = false;
    };
  }, [cube]);

  const routes = [...(typeof shortest === 'object' ? [shortest] : []), ...(methods ?? [])];
  const fewest = routes.length > 0 ? Math.min(...routes.map((r) => r.turns)) : 0;
  const { tps, look } = paces[pace]!;

  return (
    <div className="algset">
      <div className="algset__head">
        <button className="link" onClick={onBack}>
          ← 큐브 입력
        </button>
      </div>
      <div className="route__top">
        <IsoView state={cube} size={84} />
        <div>
          <h2>경로 비교</h2>
          <p className="muted">같은 큐브를 푸는 여러 길이에요. 회전 수가 적을수록 짧은 길이에요.</p>
        </div>
      </div>

      <div className="route__pace">
        <span className="muted">내 손 속도</span>
        <div className="segmented" role="radiogroup" aria-label="손 속도">
          {(Object.keys(paces) as Pace[]).map((p) => (
            <button key={p} role="radio" aria-checked={pace === p} onClick={() => setPace(p)}>
              {paces[p]!.label}
            </button>
          ))}
        </div>
      </div>

      <ol className="route__list">
        {shortest === 'loading' && <li className="route-card route-card--pending">최단 경로를 계산하는 중이에요…</li>}
        {shortest === 'error' && <li className="route-card route-card--pending">최단 경로를 계산하지 못했어요.</li>}
        {!methods && <li className="route-card route-card--pending">공식으로 푸는 경로를 찾지 못했어요.</li>}
        {routes.map((route) => (
          <li key={route.id} className="route-card">
            <div className="route-card__head">
              <h3>
                {route.title}
                {route.turns === fewest && <span className="chip chip--done">가장 짧음</span>}
              </h3>
              <span className="route-card__turns">{route.turns}회전</span>
            </div>
            <p className="muted">{route.summary}</p>
            <div className="route-card__stages">
              {route.stages
                .map((stage) => ({
                  stage,
                  turns: stage.steps.reduce((n, s) => n + s.moves.filter((m) => !isRotation(m)).length, 0),
                }))
                .filter((x) => x.turns > 0)
                .map(({ stage, turns }) => (
                  <span key={stage.id} className="route-card__stage">
                    {stage.title} <b>{turns}</b>
                  </span>
                ))}
            </div>
            <p className="route-card__meta">
              <span>{formatDuration(estimateSeconds(route, tps, look))}</span>
              <span className="muted">{route.memorize}</span>
            </p>
            <button className="btn btn--primary" onClick={() => onFollow(route)}>
              이 경로 따라 하기
            </button>
          </li>
        ))}
      </ol>
      {methods && !methods.some((r) => r.id === 'mine') && (
        <p className="muted route__notice">
          학습 탭의 공식 모음에서 OLL·PLL 공식에 "외웠어요"를 표시하면, 내가 외운 공식만 쓰는 경로도 함께 나와요.
        </p>
      )}
      <p className="muted route__notice">
        예상 시간은 회전 수와 고른 손 속도로 어림한 값이에요. 최단 경로는 화면을 보며 따라 돌리는 시간이에요.
        {mine ? ' "내 기록"은 자유 탭에서 힌트 없이 푼 최근 기록으로 잰 속도예요.' : ' 자유 탭에서 몇 번 풀면 내 기록으로 잰 속도도 고를 수 있어요.'}
      </p>
    </div>
  );
}

// ───────── 3. 따라 하기 ─────────

function FollowView({ cube, route, onBack }: { cube: CubeState; route: Route; onBack: () => void }) {
  const view = useRef<CubeCanvasHandle>(null);
  const turnHandler = useRef<((move: Move) => void) | null>(null);
  const [speed, setSpeed] = useSpeed();
  const [voice, setVoice] = useVoice();
  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  // 화면을 떠나면 읽던 말을 멈춘다.
  useEffect(() => stopSpeaking, []);
  const playable = useMemo<Playable>(
    () => ({
      start: cube,
      groups: route.stages.flatMap((stage) =>
        stage.steps.map((s) => ({ note: route.stages.length > 1 ? `[${stage.title}] ${s.note}` : s.note, moves: s.moves })),
      ),
      focus: null,
    }),
    [cube, route],
  );

  return (
    <div className="workspace">
      <section className="stage" aria-label="3D 큐브">
        <CubeCanvas
          ref={view}
          getState={() => cube}
          onTurn={(move) => turnHandler.current?.(move)}
          duration={SPEEDS[speed].ms}
        />
        <button className="stage__view" onClick={() => view.current?.resetView()}>
          시점 초기화
        </button>
      </section>

      <section className="panel panel--lesson" aria-label="따라 하기">
        <div className="lesson__scroll">
          <div className="lesson__head">
            <button className="link" onClick={onBack}>
              ← 경로 비교
            </button>
            <span className="muted">{route.turns}회전</span>
          </div>
          <h2 className="lesson__title">{route.title}</h2>
          <p className="lesson__body">
            실제 큐브를 흰색이 위, 초록색이 앞을 보게 잡고 시작해요. "한 수 ▶"를 누르며 화면과 같이 돌리면 돼요.
          </p>
          <StepPlayer
            view={view}
            playable={playable}
            speedMs={SPEEDS[speed].ms}
            speed={speed}
            onSpeed={setSpeed}
            selfOnly={false}
            turnHandler={turnHandler}
            big
            onNext={(move) => {
              if (voiceRef.current) speak(move ? moveSpeech(move) : '완성');
            }}
          />
          {speechAvailable() && (
            <label className="route__voice">
              <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
              다음 동작을 소리로 읽어 주기
            </label>
          )}
        </div>
      </section>
    </div>
  );
}
