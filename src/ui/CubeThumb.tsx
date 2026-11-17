/**
 * 큐브 상태를 작은 그림(SVG)으로 그린다. 공식 목록처럼 여러 개를 한꺼번에 보여 줄 때 쓴다.
 */
import type { CubeState, Face } from '../core/cube';
import { facelet, homeOf } from '../core/pieces';
import { STICKER_COLORS } from '../render/colors';

const BLANK = '#454a5e';
const BODY = '#15161c';

/**
 * 위에서 내려다본 그림: 윗면 9칸과 옆면 맨 윗줄 12칸.
 * mode 'oll'은 윗면 색(노랑)만 칠하고 나머지는 회색, 'pll'은 실제 색을 모두 칠한다.
 */
export function TopView({ state, mode, size = 72 }: { state: CubeState; mode: 'oll' | 'pll'; size?: number }) {
  const top = state[4];
  const fill = (index: number) =>
    mode === 'oll' ? (state[index] === top ? STICKER_COLORS[top] : BLANK) : STICKER_COLORS[state[index]];

  // 좌표 단위: 옆 띠 1 + 윗면 3칸×3 + 옆 띠 1
  const cell = 3;
  const strip = 1;
  const gap = 0.25;
  const total = strip * 2 + cell * 3 + gap * 4;
  const at = (i: number) => strip + gap + i * (cell + gap);

  const side = (pieces: [string, string, string], face: Face) => pieces.map((p) => facelet(p, face));
  const back = side(['UBL', 'UB', 'UBR'], 'B');
  const front = side(['UFL', 'UF', 'UFR'], 'F');
  const left = side(['UBL', 'UL', 'UFL'], 'L');
  const right = side(['UBR', 'UR', 'UFR'], 'R');

  return (
    <svg viewBox={`0 0 ${total} ${total}`} width={size} height={size} role="img" aria-label="위에서 본 모습">
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={at(i % 3)} y={at(Math.floor(i / 3))} width={cell} height={cell} rx={0.5} fill={fill(i)} />
      ))}
      {back.map((f, i) => (
        <rect key={`b${i}`} x={at(i)} y={0} width={cell} height={strip} rx={0.3} fill={fill(f)} />
      ))}
      {front.map((f, i) => (
        <rect key={`f${i}`} x={at(i)} y={total - strip} width={cell} height={strip} rx={0.3} fill={fill(f)} />
      ))}
      {left.map((f, i) => (
        <rect key={`l${i}`} x={0} y={at(i)} width={strip} height={cell} rx={0.3} fill={fill(f)} />
      ))}
      {right.map((f, i) => (
        <rect key={`r${i}`} x={total - strip} y={at(i)} width={strip} height={cell} rx={0.3} fill={fill(f)} />
      ))}
    </svg>
  );
}

const COS = 0.866;
/** 3D 좌표 → 화면 좌표. 앞면(F)이 왼쪽, 오른쪽 면(R)이 오른쪽, 윗면(U)이 위에 보인다. */
const project = (x: number, y: number, z: number): string =>
  `${(COS * (x - z)).toFixed(3)},${(0.5 * (x + z) - y).toFixed(3)}`;

const INSET = 0.06;

/**
 * 비스듬히 본 그림: 윗면, 앞면, 오른쪽 면.
 * focus를 주면 그 조각들만 색을 칠하고 나머지는 회색으로 둔다 (focusOf 형식의 집합).
 */
export function IsoView({
  state,
  focus,
  size = 72,
}: {
  state: CubeState;
  focus?: ReadonlySet<number> | null;
  size?: number;
}) {
  const home = focus ? homeOf(state) : null;
  const fill = (index: number) =>
    focus && home && !focus.has(home[index]) ? BLANK : STICKER_COLORS[state[index]];

  const polygons: { key: string; points: string; fill: string }[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const a0 = c - 1.5 + INSET;
      const a1 = c - 0.5 - INSET;
      const b0 = r - 1.5 + INSET;
      const b1 = r - 0.5 - INSET;
      // 윗면: x = a, z = b
      polygons.push({
        key: `u${r}${c}`,
        fill: fill(r * 3 + c),
        points: [project(a0, 1.5, b0), project(a1, 1.5, b0), project(a1, 1.5, b1), project(a0, 1.5, b1)].join(' '),
      });
      // 앞면: x = a, y = 위에서 아래로
      const y0 = 1.5 - r - INSET;
      const y1 = 0.5 - r + INSET;
      polygons.push({
        key: `f${r}${c}`,
        fill: fill(18 + r * 3 + c),
        points: [project(a0, y0, 1.5), project(a1, y0, 1.5), project(a1, y1, 1.5), project(a0, y1, 1.5)].join(' '),
      });
      // 오른쪽 면: z = 앞에서 뒤로
      const z0 = 1.5 - c - INSET;
      const z1 = 0.5 - c + INSET;
      polygons.push({
        key: `r${r}${c}`,
        fill: fill(9 + r * 3 + c),
        points: [project(1.5, y0, z0), project(1.5, y0, z1), project(1.5, y1, z1), project(1.5, y1, z0)].join(' '),
      });
    }
  }

  const outline = [
    project(-1.5, 1.5, -1.5),
    project(1.5, 1.5, -1.5),
    project(1.5, -1.5, -1.5),
    project(1.5, -1.5, 1.5),
    project(-1.5, -1.5, 1.5),
    project(-1.5, 1.5, 1.5),
  ].join(' ');

  return (
    <svg viewBox="-2.7 -3.1 5.4 6.2" width={size} height={size} role="img" aria-label="큐브 모습">
      <polygon points={outline} fill={BODY} stroke={BODY} strokeWidth={0.12} strokeLinejoin="round" />
      {polygons.map((p) => (
        <polygon key={p.key} points={p.points} fill={p.fill} />
      ))}
    </svg>
  );
}
