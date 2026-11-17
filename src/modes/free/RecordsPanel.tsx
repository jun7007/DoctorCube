import { useMemo, useState } from 'react';
import { solveStore, useSolves } from './solveStore';
import { formatStat, formatTime, summarize, type SolveRecord } from './stats';

/** 접어 둔 목록에서 먼저 보여 주는 풀이 수 */
const RECENT = 5;

interface Props {
  inspection: boolean;
  onInspection: (next: boolean) => void;
}

/** 풀이 기록과 통계, 관찰 시간 설정. 접은 화면이 좁아지지 않게 평소에는 접혀 있다. */
export function Records({ inspection, onInspection }: Props) {
  const solves = useSolves();
  const stats = useMemo(() => summarize(solves), [solves]);
  const [showAll, setShowAll] = useState(false);
  // "모두 지우기"를 누른 때의 기록 수. 그 뒤 목록이 바뀌면 확인 단계는 저절로 취소된다.
  const [confirmAt, setConfirmAt] = useState<number | null>(null);
  const confirming = confirmAt === solves.length;

  // 최근 것부터. 번호는 저장된 순서(오래된 것이 1번)다.
  const numbered = solves.map((solve, i) => ({ solve, no: i + 1 })).reverse();
  const shown = showAll ? numbered : numbered.slice(0, RECENT);

  return (
    <details className="records">
      <summary>
        기록{' '}
        <span className="records__brief">
          {stats.count > 0 ? `${stats.count}번 · 최고 ${formatStat(stats.best)}` : '아직 없어요'}
        </span>
      </summary>

      <div className="records__body">
        <button
          className="records__switch"
          role="switch"
          aria-checked={inspection}
          onClick={() => onInspection(!inspection)}
        >
          <span>
            관찰 시간 15초
            <small>섞은 뒤 살펴보고 시작해요</small>
          </span>
          <span className="records__knob" aria-hidden="true" />
        </button>

        <dl className="records__stats">
          <Stat name="횟수" id="count" value={`${stats.count}`} />
          <Stat name="최고" id="best" value={formatStat(stats.best)} />
          <Stat name="평균" id="mean" value={formatStat(stats.mean)} />
          <Stat name="ao5" id="ao5" value={formatStat(stats.ao5)} />
          <Stat name="ao12" id="ao12" value={formatStat(stats.ao12)} />
          <Stat name="최고 ao5" id="best-ao5" value={formatStat(stats.bestAo5)} />
        </dl>
        <p className="records__note">힌트로 돌린 풀이는 최고와 평균에서 빼요.</p>

        {numbered.length === 0 ? (
          <p className="records__empty">섞고 나서 맞추면 여기에 쌓여요.</p>
        ) : (
          <>
            <ol className="records__list" aria-label="최근 풀이">
              {shown.map(({ solve, no }) => (
                <Row key={solve.at} solve={solve} no={no} />
              ))}
            </ol>
            {numbered.length > RECENT && (
              <button className="btn records__more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? '최근 것만 보기' : `모두 보기 (${numbered.length}개)`}
              </button>
            )}
            {confirming ? (
              <div className="records__confirm" role="group" aria-label="기록 모두 지우기">
                <span>모두 지울까요?</span>
                <button
                  className="btn records__danger"
                  onClick={() => {
                    solveStore.clear();
                    setConfirmAt(null);
                    setShowAll(false);
                  }}
                >
                  지우기
                </button>
                <button className="btn" onClick={() => setConfirmAt(null)}>
                  취소
                </button>
              </div>
            ) : (
              <button className="btn records__clear" onClick={() => setConfirmAt(solves.length)}>
                기록 모두 지우기
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function Stat({ name, id, value }: { name: string; id: string; value: string }) {
  return (
    <div className="records__stat" data-stat={id}>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Row({ solve, no }: { solve: SolveRecord; no: number }) {
  return (
    <li className="records__row" title={`섞기: ${solve.scramble}`}>
      <span className="records__no">{no}</span>
      <span className="records__time">{formatTime(solve.ms)}</span>
      <span className="records__turns">{solve.turns}회전</span>
      {solve.hint && <span className="records__hint">힌트</span>}
      <button
        className="records__delete"
        aria-label={`${no}번 기록 지우기`}
        onClick={() => solveStore.remove(solve.at)}
      >
        삭제
      </button>
    </li>
  );
}
