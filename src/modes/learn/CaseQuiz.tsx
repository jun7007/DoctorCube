/**
 * 그림 보고 공식 고르기: 케이스 그림을 보고 네 공식 가운데 맞는 것을 고른다.
 * 3D 큐브 없이 가볍게, 목록 화면처럼 한 장으로 스크롤되는 화면이다.
 */
import { useRef, useState } from 'react';
import { caseState, type AlgSet } from '../../algorithms';
import { Thumb } from './AlgViews';
import { pickCase, useCaseStats } from './caseStore';
import { buildQuestion, type QuizQuestion } from './quiz';
import './quiz.css';

interface Props {
  set: AlgSet;
  onBack: () => void;
  /** 이 케이스를 3D로 본다 */
  onOpenCase: (caseId: string) => void;
}

export function CaseQuiz({ set, onBack, onOpenCase }: Props) {
  const page = useRef<HTMLDivElement>(null);
  const { stats, record } = useCaseStats();
  const [question, setQuestion] = useState<QuizQuestion>(() =>
    buildQuestion(set.cases, pickCase(set.cases, stats, null)),
  );
  /** 문제 번호 */
  const [round, setRound] = useState(1);
  /** 고른 보기의 번호. 아직 안 골랐으면 null */
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });

  const { answer, choices } = question;
  const answered = picked !== null;
  const correct = answered && choices[picked].correct;

  const choose = (index: number) => {
    if (answered) return;
    const ok = choices[index].correct;
    setPicked(index);
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
    record(answer.id, ok);
  };

  const next = () => {
    setQuestion(buildQuestion(set.cases, pickCase(set.cases, stats, answer.id)));
    setRound((n) => n + 1);
    setPicked(null);
    page.current?.scrollTo({ top: 0 });
  };

  return (
    <div className="algset quiz" ref={page}>
      <div className="algset__head">
        <button className="link" onClick={onBack}>
          ← {set.title}
        </button>
        <span className="muted quiz__score">
          {round}번째 문제 · 맞힘 {score.ok} / {score.total}
        </span>
      </div>

      <h2>어떤 공식으로 풀까요?</h2>
      <p className="muted">그림을 보고 맞는 공식을 골라요.</p>

      <div className="quiz__figure">
        <Thumb set={set} state={caseState(answer)} size={160} />
      </div>

      <div className="quiz__choices" role="group" aria-label="보기">
        {choices.map((choice, i) => {
          const state = !answered ? '' : choice.correct ? 'right' : i === picked ? 'wrong' : 'dim';
          return (
            <button
              key={`${round}-${choice.caseId}`}
              className={`quiz__choice${state ? ` quiz__choice--${state}` : ''}`}
              onClick={() => choose(i)}
              disabled={answered}
            >
              <span className="quiz__alg">{choice.alg}</span>
              {state === 'right' && <span className="quiz__mark">✓ 정답</span>}
              {state === 'wrong' && <span className="quiz__mark">고른 답</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <>
          <div className="quiz__feedback" role="status">
            <p className={`drill__result${correct ? ' drill__result--ok' : ''}`}>
              {correct ? '맞았어요!' : '아쉬워요. 다음에 다시 나올 거예요.'}
            </p>
            <h3 className="quiz__name">
              {answer.name}
              <span className="muted">{answer.group}</span>
            </h3>
            {answer.note && <p className="lesson__body">{answer.note}</p>}
          </div>
          <div className="quiz__actions">
            <button className="btn" onClick={() => onOpenCase(answer.id)}>
              3D로 보기
            </button>
            <button className="btn btn--primary" onClick={next} autoFocus>
              다음 문제
            </button>
          </div>
        </>
      )}
    </div>
  );
}
