import { useMemo, useRef, useState } from 'react';
import { ALG_SETS } from '../../algorithms';
import { PATTERNS } from '../../algorithms/patterns';
import type { Move } from '../../core/cube';
import { CubeCanvas, type CubeCanvasHandle } from '../../ui/CubeCanvas';
import { SPEEDS, useSpeed } from '../../ui/speed';
import { AlgSetView, CaseDrill, CaseStudy } from './AlgViews';
import { CaseQuiz } from './CaseQuiz';
import { useCaseStats } from './caseStore';
import { COURSES, type Course, type Lesson } from './courses';
import { PatternGallery, PatternStudy } from './PatternViews';
import { useProgress } from './progress';
import { resolveStep } from './resolve';
import { StepPlayer } from './StepPlayer';

/** 학습 탭 안에서 지금 보고 있는 화면 */
export type LearnRoute =
  | { view: 'home' }
  | { view: 'lesson'; lessonId: string }
  | { view: 'set'; setId: string }
  | { view: 'case'; setId: string; caseId: string; from?: 'quiz' }
  | { view: 'drill'; setId: string }
  | { view: 'quiz'; setId: string }
  | { view: 'patterns' }
  | { view: 'pattern'; patternId: string };

const ALL_LESSONS = COURSES.flatMap((course) => course.lessons.map((lesson) => ({ course, lesson })));

interface Props {
  route: LearnRoute;
  onRoute: (route: LearnRoute) => void;
}

export function LearnMode({ route, onRoute }: Props) {
  const { done, markDone } = useProgress();
  const home = () => onRoute({ view: 'home' });

  if (route.view === 'lesson') {
    const index = ALL_LESSONS.findIndex((x) => x.lesson.id === route.lessonId);
    if (index >= 0) {
      const { course, lesson } = ALL_LESSONS[index];
      const next = ALL_LESSONS[index + 1]?.lesson.id ?? null;
      return (
        <LessonView
          key={lesson.id}
          course={course}
          lesson={lesson}
          onExit={home}
          onFinish={() => {
            markDone(lesson.id);
            onRoute(next ? { view: 'lesson', lessonId: next } : { view: 'home' });
          }}
          hasNext={next !== null}
        />
      );
    }
  }

  if (route.view === 'set' || route.view === 'case' || route.view === 'drill' || route.view === 'quiz') {
    const set = ALG_SETS.find((s) => s.id === route.setId);
    if (set) {
      const toSet = () => onRoute({ view: 'set', setId: set.id });
      const toQuiz = () => onRoute({ view: 'quiz', setId: set.id });
      // 퀴즈에서 연 공식은 이전·다음 공식으로 넘겨도 퀴즈로 돌아간다.
      const from = route.view === 'quiz' ? 'quiz' : route.view === 'case' ? route.from : undefined;
      const toCase = (caseId: string) => onRoute({ view: 'case', setId: set.id, caseId, from });
      if (route.view === 'drill') return <CaseDrill key={set.id} set={set} onBack={toSet} />;
      if (route.view === 'quiz') return <CaseQuiz key={set.id} set={set} onBack={toSet} onOpenCase={toCase} />;
      const algCase = route.view === 'case' ? set.cases.find((c) => c.id === route.caseId) : undefined;
      if (algCase) {
        return (
          <CaseStudy
            set={set}
            algCase={algCase}
            onBack={from === 'quiz' ? toQuiz : toSet}
            backLabel={from === 'quiz' ? '퀴즈로' : undefined}
            onOpenCase={toCase}
          />
        );
      }
      return (
        <AlgSetView
          set={set}
          onBack={home}
          onOpenCase={toCase}
          onDrill={() => onRoute({ view: 'drill', setId: set.id })}
          onQuiz={toQuiz}
        />
      );
    }
  }

  if (route.view === 'patterns' || route.view === 'pattern') {
    const toPattern = (patternId: string) => onRoute({ view: 'pattern', patternId });
    const pattern = route.view === 'pattern' ? PATTERNS.find((p) => p.id === route.patternId) : undefined;
    if (pattern) {
      return <PatternStudy pattern={pattern} onBack={() => onRoute({ view: 'patterns' })} onOpen={toPattern} />;
    }
    return <PatternGallery onBack={home} onOpen={toPattern} />;
  }

  return <LearnHome done={done} onRoute={onRoute} />;
}

function LearnHome({ done, onRoute }: { done: ReadonlySet<string>; onRoute: (route: LearnRoute) => void }) {
  const { stats } = useCaseStats();
  return (
    <div className="learn-home">
      {COURSES.map((course) => (
        <section key={course.id} className="course">
          <h2>{course.title}</h2>
          <p className="muted">{course.summary}</p>
          <ol className="course__lessons">
            {course.lessons.map((lesson) => (
              <li key={lesson.id}>
                <button className="lesson-card" onClick={() => onRoute({ view: 'lesson', lessonId: lesson.id })}>
                  <span className={`lesson-card__mark${done.has(lesson.id) ? ' lesson-card__mark--done' : ''}`}>
                    {done.has(lesson.id) ? '✓' : ''}
                  </span>
                  <span className="lesson-card__text">
                    <b>{lesson.title}</b>
                    <span className="muted">{lesson.summary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="course">
        <h2>공식 모음</h2>
        <p className="muted">공식을 하나씩 보고, 가린 채로 연습해요.</p>
        <ol className="course__lessons">
          {ALG_SETS.map((set) => {
            const known = set.cases.filter((c) => stats[c.id]?.known).length;
            return (
              <li key={set.id}>
                <button className="lesson-card" onClick={() => onRoute({ view: 'set', setId: set.id })}>
                  <span className="lesson-card__count">
                    {known}/{set.cases.length}
                  </span>
                  <span className="lesson-card__text">
                    <b>{set.title}</b>
                    <span className="muted">{set.summary}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="course">
        <h2>패턴 갤러리</h2>
        <p className="muted">다 맞춘 큐브로 예쁜 무늬를 만들어요.</p>
        <ol className="course__lessons">
          <li>
            <button className="lesson-card" onClick={() => onRoute({ view: 'patterns' })}>
              <span className="lesson-card__count">{PATTERNS.length}개</span>
              <span className="lesson-card__text">
                <b>예쁜 무늬 만들기</b>
                <span className="muted">체커보드, 큐브 속 큐브 같은 무늬를 3D로 따라 해요</span>
              </span>
            </button>
          </li>
        </ol>
      </section>
    </div>
  );
}

interface LessonProps {
  course: Course;
  lesson: Lesson;
  onExit: () => void;
  onFinish: () => void;
  hasNext: boolean;
}

function LessonView({ course, lesson, onExit, onFinish, hasNext }: LessonProps) {
  const view = useRef<CubeCanvasHandle>(null);
  const turnHandler = useRef<((move: Move) => void) | null>(null);
  const [speed, setSpeed] = useSpeed();
  const [stepIndex, setStepIndex] = useState(0);
  /** 무작위 예제를 새로 만들 때마다 올린다 */
  const [exampleNo, setExampleNo] = useState(0);

  const step = lesson.steps[stepIndex];
  // exampleNo가 바뀌면 무작위 예제를 새로 만든다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playable = useMemo(() => resolveStep(course, step), [course, step, exampleNo]);
  const last = stepIndex === lesson.steps.length - 1;

  return (
    <div className="workspace">
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

      <section className="panel panel--lesson" aria-label="레슨">
        <div className="lesson__scroll">
          <div className="lesson__head">
            <button className="link" onClick={onExit}>
              ← 목록
            </button>
            <span className="muted">
              {lesson.title} · {stepIndex + 1} / {lesson.steps.length}
            </span>
          </div>
          <h2 className="lesson__title">{step.title}</h2>
          {step.body.map((paragraph, i) => (
            <p key={i} className="lesson__body">
              {paragraph}
            </p>
          ))}
          <StepPlayer
            key={`${stepIndex}-${exampleNo}`}
            view={view}
            playable={playable}
            speedMs={SPEEDS[speed].ms}
            speed={speed}
            onSpeed={setSpeed}
            selfOnly={step.selfOnly === true}
            turnHandler={turnHandler}
            onNewExample={step.random ? () => setExampleNo((n) => n + 1) : undefined}
          />
        </div>
        <div className="lesson__nav">
          <button className="btn" onClick={() => setStepIndex((i) => i - 1)} disabled={stepIndex === 0}>
            이전
          </button>
          {last ? (
            <button className="btn btn--primary" onClick={onFinish}>
              {hasNext ? '완료하고 다음 레슨' : '완료'}
            </button>
          ) : (
            <button className="btn btn--primary" onClick={() => setStepIndex((i) => i + 1)}>
              다음
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
