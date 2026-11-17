import { describe, expect, it } from 'vitest';
import { applyMoves, isSolved, toFaceletString } from '../../core/cube';
import { COURSES } from './courses';
import { METHODS, YELLOW_UP, resolveStep } from './resolve';

const flat = (p: ReturnType<typeof resolveStep>) => p.groups.flatMap((g) => g.moves);

describe('학습 내용', () => {
  it('레슨 id는 서로 다르다', () => {
    const ids = COURSES.flatMap((c) => c.lessons.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const course of COURSES) {
    for (const lesson of course.lessons) {
      lesson.steps.forEach((step, i) => {
        const name = `${lesson.title} > ${i + 1}. ${step.title}`;

        if (!step.auto) {
          it(`${name}: 읽을 수 있다`, () => {
            const p = resolveStep(course, step);
            expect(p.start).toHaveLength(54);
            if (step.selfOnly) expect(flat(p).length).toBeGreaterThan(0);
          });
          return;
        }

        if (step.auto === 'all') {
          it(`${name}: 끝까지 풀린다`, () => {
            for (let n = 0; n < 20; n++) {
              const p = resolveStep(course, step);
              expect(isSolved(applyMoves(p.start, flat(p)))).toBe(true);
            }
          });
          return;
        }

        const method = METHODS[step.method ?? 'beginner'];
        const index = method.order.indexOf(step.auto);
        const check = () => {
          const p = resolveStep(course, step);
          // 앞 단계는 이미 끝나 있고, 이 단계에 할 일이 있어야 한다.
          // (첫 단계 '큐브 잡기'는 빼고 본다. 풀이 도중 큐브를 돌려 잡으면 방향만 달라지기 때문.)
          const before = method.solve(p.start);
          expect(before.slice(1, index).every((s) => s.steps.length === 0), '앞 단계가 끝나 있어야 함').toBe(true);
          expect(flat(p).length, '이 단계에 할 일이 있어야 함').toBeGreaterThan(0);
          // 동작을 다 하면 이 단계까지 끝난다.
          const end = applyMoves(p.start, flat(p));
          const after = method.solve(end);
          expect(after.slice(1, index + 1).every((s) => s.steps.length === 0), '이 단계가 끝나야 함').toBe(true);
          return { p, end, before };
        };

        if (step.random) {
          it(`${name}: 무작위 예제 30개`, () => {
            for (let n = 0; n < 30; n++) check();
          });
        } else {
          it(`${name}: 예시가 설명대로 풀린다`, () => {
            const { p, before } = check();
            // 고정 예시는 노란색이 위인 상태에서 시작한다.
            expect(toFaceletString(p.start)[4]).toBe(toFaceletString(YELLOW_UP)[4]);
            expect(before[0].steps).toHaveLength(0);
            expect(p.groups.every((g) => g.note)).toBe(true);
          });
        }
      });
    }
  }

  it('예시가 가르치려는 경우와 맞다', () => {
    const beginner = COURSES.find((c) => c.id === 'beginner')!;
    const groupsOf = (lessonId: string, title: string) => {
      const step = beginner.lessons.find((l) => l.id === lessonId)!.steps.find((s) => s.title === title)!;
      return resolveStep(beginner, step).groups;
    };
    const notes = (lessonId: string, title: string) => groupsOf(lessonId, title).map((g) => g.note);
    const count = (lessonId: string, title: string) => groupsOf(lessonId, title).reduce((n, g) => n + g.moves.length, 0);

    expect(count('lbl-daisy', '가운데 층에 있을 때')).toBe(1);
    expect(count('lbl-daisy', '올릴 자리에 이미 흰색이 있을 때')).toBe(2);
    expect(count('lbl-daisy', '아래층에서 흰색이 아래를 볼 때')).toBe(2);
    expect(count('lbl-daisy', '흰색이 옆을 볼 때')).toBe(2);
    expect(count('lbl-corners', '자리 위에 놓고 공식')).toBe(4);
    expect(count('lbl-corners', '들어갈 때까지 반복')).toBe(12);
    expect(notes('lbl-corners', '잘못 들어가 있는 코너')[0]).toContain('꺼내요');
    expect(notes('lbl-middle', '오른쪽으로 넣기').join()).toContain('오른쪽으로 넣는');
    expect(notes('lbl-middle', '왼쪽으로 넣기').join()).toContain('왼쪽으로 넣는');
    expect(notes('lbl-middle', '잘못 들어가 있는 엣지')[0]).toContain('꺼내요');
    expect(notes('lbl-yellow-cross', '일자 모양')).toHaveLength(1);
    expect(notes('lbl-yellow-cross', '일자 모양')[0]).toContain('일자');
    expect(notes('lbl-yellow-cross', 'ㄱ자 모양')[0]).toContain('ㄱ자');
    expect(notes('lbl-yellow-cross', '점 모양')[0]).toContain('점 모양');
    expect(notes('lbl-yellow-edges', '이웃한 두 개가 맞을 때')).toEqual(['공식을 하면 나머지 두 엣지가 서로 자리를 바꿔요.']);
    expect(notes('lbl-yellow-edges', '마주 보는 두 개가 맞을 때')[0]).toContain('마주 보고');
    expect(notes('lbl-corner-pos', '제자리 코너를 앞-오른쪽에 두고')[0]).toContain('앞-오른쪽 위에 두고');
    expect(notes('lbl-corner-pos', '제자리 코너가 없을 때')[0]).toContain('없어요');
    expect(count('lbl-corner-twist', '코너 하나씩 돌리기')).toBeGreaterThanOrEqual(24);
  });
});
