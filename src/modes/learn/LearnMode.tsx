import { useMemo, useRef, useState } from 'react';
import type { Move } from '../../core/cube';
import { CubeCanvas, type CubeCanvasHandle } from '../../ui/CubeCanvas';
import { SPEEDS, useSpeed } from '../../ui/speed';
import { COURSES, type Course, type Lesson } from './courses';
import { useProgress } from './progress';
import { resolveStep } from './resolve';
import { StepPlayer } from './StepPlayer';

const ALL_LESSONS = COURSES.flatMap((course) => course.lessons.map((lesson) => ({ course, lesson })));

interface Props {
  /** 보고 있는 레슨 (없으면 목록) */
  lessonId: string | null;
  onOpen: (lessonId: string | null) => void;
}

export function LearnMode({ lessonId, onOpen }: Props) {
  const { done, markDone } = useProgress();
  const index = ALL_LESSONS.findIndex((x) => x.lesson.id === lessonId);

  if (index < 0) {
    return (
      <div className="learn-home">
        {COURSES.map((course) => (
          <section key={course.id} className="course">
            <h2>{course.title}</h2>
            <p className="muted">{course.summary}</p>
            <ol className="course__lessons">
              {course.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <button className="lesson-card" onClick={() => onOpen(lesson.id)}>
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
          <h2>CFOP</h2>
          <p className="muted">가장 널리 쓰이는 빠른 공식. 준비 중이에요.</p>
        </section>
      </div>
    );
  }

  const { course, lesson } = ALL_LESSONS[index];
  const next = ALL_LESSONS[index + 1]?.lesson.id ?? null;
  return (
    <LessonView
      key={lesson.id}
      course={course}
      lesson={lesson}
      onExit={() => onOpen(null)}
      onFinish={() => {
        markDone(lesson.id);
        onOpen(next);
      }}
      hasNext={next !== null}
    />
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
