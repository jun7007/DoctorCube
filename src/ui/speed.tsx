import { useState } from 'react';

export type Speed = 'slow' | 'normal' | 'fast';

/** 90° 회전 한 번에 걸리는 시간 */
export const SPEEDS: Record<Speed, { label: string; ms: number }> = {
  slow: { label: '느리게', ms: 480 },
  normal: { label: '보통', ms: 220 },
  fast: { label: '빠르게', ms: 110 },
};

const KEY = 'doctorcube.speed';

function load(): Speed {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'slow' || v === 'normal' || v === 'fast') return v;
  } catch {
    // 저장소를 못 쓰는 환경이면 기본값
  }
  return 'normal';
}

/** 회전 속도 설정. 기기에 저장되어 모든 모드가 같이 쓴다. */
export function useSpeed(): [Speed, (next: Speed) => void] {
  const [speed, setSpeed] = useState<Speed>(load);
  const change = (next: Speed) => {
    setSpeed(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // 저장 실패는 무시
    }
  };
  return [speed, change];
}

export function SpeedControl({ speed, onChange }: { speed: Speed; onChange: (next: Speed) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="회전 속도">
      {(Object.keys(SPEEDS) as Speed[]).map((s) => (
        <button key={s} role="radio" aria-checked={speed === s} onClick={() => onChange(s)}>
          {SPEEDS[s].label}
        </button>
      ))}
    </div>
  );
}
