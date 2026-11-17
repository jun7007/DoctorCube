import type { CubeState } from '../../core/cube';
import { STICKER_COLORS } from '../../render/colors';

const COLOR_NAMES = ['흰색', '빨강', '초록', '노랑', '주황', '파랑'] as const;

/** 전개도에서 각 면이 놓이는 칸 (열, 행). 면 순서는 U R F D L B */
const FACE_ORIGIN: readonly (readonly [number, number])[] = [
  [3, 0], // U
  [6, 3], // R
  [3, 3], // F
  [3, 6], // D
  [0, 3], // L
  [9, 3], // B
];

interface Props {
  state: CubeState;
  /** 지금 칠할 색 */
  color: number;
  onColor: (color: number) => void;
  onPaint: (index: number) => void;
  /** 색이 확실하지 않은 칸 (카메라로 읽었을 때). 물음표로 표시한다 */
  unsure?: readonly number[];
}

/**
 * 큐브 전개도. 칸을 누르면 고른 색으로 칠한다.
 * 센터는 면의 기준이라 바꿀 수 없다 (흰색이 위, 초록색이 앞).
 */
export function NetEditor({ state, color, onColor, onPaint, unsure = [] }: Props) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const c of state) counts[c]++;

  return (
    <div className="net">
      <div className="net__grid" role="group" aria-label="큐브 전개도">
        {FACE_ORIGIN.flatMap(([col, row], face) =>
          Array.from({ length: 9 }, (_, i) => {
            const index = face * 9 + i;
            const center = i === 4;
            return (
              <button
                key={index}
                className={`net__cell${center ? ' net__cell--center' : ''}${unsure.includes(index) ? ' net__cell--unsure' : ''}`}
                style={{
                  gridColumn: col + (i % 3) + 1,
                  gridRow: row + Math.floor(i / 3) + 1,
                  background: STICKER_COLORS[state[index]],
                }}
                disabled={center}
                aria-label={`${COLOR_NAMES[state[index]]} 칸`}
                onClick={() => onPaint(index)}
              />
            );
          }),
        )}
        <span className="net__label">
          위(흰색)가 맨 위,
          <br />
          초록색이 가운데
        </span>
      </div>

      <div className="net__palette" role="radiogroup" aria-label="칠할 색">
        {STICKER_COLORS.map((hex, c) => (
          <button
            key={c}
            role="radio"
            aria-checked={color === c}
            aria-label={`${COLOR_NAMES[c]} (${counts[c]}칸)`}
            className={`net__swatch${counts[c] !== 9 ? ' net__swatch--off' : ''}`}
            style={{ background: hex }}
            onClick={() => onColor(c)}
          >
            {counts[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
