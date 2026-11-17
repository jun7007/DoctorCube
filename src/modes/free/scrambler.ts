import type { Move } from '../../core/cube';
import { generateScramble } from '../../core/scramble';
import { randomScramble } from '../../solvers/shortest';

export interface ScramblerOptions {
  /** 무작위 "상태" 스크램블을 만들어 달라고 요청한다 (다른 스레드) */
  request: () => Promise<Move[]>;
  /** 제때 못 받았을 때 대신 쓰는 스크램블 */
  fallback: () => Move[];
  /** 이 시간 안에 못 받으면 fallback을 쓴다 */
  timeoutMs?: number;
}

/**
 * 스크램블을 하나씩 미리 만들어 둔다.
 *
 * - 준비된 것이 있으면 "섞기"가 바로 된다. 꺼내 쓰는 즉시 다음 것을 만들기 시작한다.
 * - 아직 준비되지 않았으면 timeoutMs까지만 기다리고, 넘으면 무작위 회전 스크램블로 대신한다.
 *   늦게 도착한 것은 버리지 않고 다음 "섞기"에 쓴다 (그래서 두 번 섞이지 않는다).
 */
export class Scrambler {
  private ready: Move[] | null = null;
  private pending: Promise<Move[] | null> | null = null;
  private readonly request: () => Promise<Move[]>;
  private readonly fallback: () => Move[];
  private readonly timeoutMs: number;

  constructor(options: ScramblerOptions) {
    this.request = options.request;
    this.fallback = options.fallback;
    this.timeoutMs = options.timeoutMs ?? 1500;
  }

  /** 다음 스크램블을 미리 만들기 시작한다. 이미 있거나 만드는 중이면 아무것도 하지 않는다. */
  prepare(): void {
    if (this.ready || this.pending) return;
    let asked: Promise<Move[]>;
    try {
      asked = this.request();
    } catch {
      return;
    }
    const pending: Promise<Move[] | null> = asked.then(
      (moves) => {
        if (this.pending === pending) this.pending = null;
        // 빈 스크램블(무작위 상태가 우연히 완성 상태)은 쓰지 않는다.
        if (moves.length === 0) return null;
        this.ready = moves;
        return moves;
      },
      () => {
        if (this.pending === pending) this.pending = null;
        return null;
      },
    );
    this.pending = pending;
  }

  /** 준비된 스크램블이 있으면 꺼낸다. 없으면 null. */
  takeReady(): Move[] | null {
    const moves = this.ready;
    if (!moves) {
      this.prepare();
      return null;
    }
    this.ready = null;
    this.prepare();
    return moves;
  }

  /** 스크램블 하나를 돌려준다. 준비가 늦거나 실패하면 fallback으로 대신한다. */
  async take(): Promise<Move[]> {
    const now = this.takeReady();
    if (now) return now;
    const pending = this.pending;
    if (!pending) return this.fallback();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>((resolve) => {
      timer = setTimeout(() => resolve('late'), this.timeoutMs);
    });
    const winner = await Promise.race([pending, late]);
    clearTimeout(timer);
    // 제때 도착했으면 그것을 꺼내 쓴다. (그 사이 다른 곳에서 먼저 꺼내 갔으면 fallback)
    if (winner !== 'late' && winner !== null) return this.takeReady() ?? this.fallback();
    return this.fallback();
  }
}

/** 앱 전체가 같이 쓰는 스크램블 준비기. 탭을 오가도 미리 만든 것이 남아 있다. */
export const scrambler = new Scrambler({ request: randomScramble, fallback: () => generateScramble() });
