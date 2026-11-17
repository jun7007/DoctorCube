/**
 * 모서리 쪽에서 찍기: 큐브의 한 꼭짓점이 카메라를 보게 들면 세 면(위, 왼쪽 앞, 오른쪽 앞)이 한꺼번에 보인다.
 * 서로 반대쪽 꼭짓점 두 곳을 찍으면 여섯 면이 모두 나온다.
 *
 * 화면의 안내 그림은 정육각형이다 (큐브를 대각선 방향에서 멀리서 본 모습).
 * 좌표는 육각형의 한 변을 1로, 가운데를 원점으로, y는 아래쪽을 양수로 둔다.
 */
import { applyMoves, type CubeState } from '../core/cube';
import { parseAlg } from '../core/notation';
import type { PixelSource, RGB } from './sample';

export interface Point {
  x: number;
  y: number;
}

export interface CornerCell {
  /** 보이는 큐브에서 이 칸의 번호: cube.ts의 칸 번호 그대로 (위 0~8, 오른쪽 앞 9~17, 왼쪽 앞 18~26) */
  slot: number;
  center: Point;
  /** 칸의 네 꼭짓점 (안내 그림을 그릴 때 쓴다) */
  outline: Point[];
}

const COS = Math.sqrt(3) / 2;

/** 큐브 좌표(한 변 = 3, 가운데 = 원점) → 육각형 좌표. 앞면이 왼쪽 아래, 오른쪽 면이 오른쪽 아래, 윗면이 위. */
const project = (x: number, y: number, z: number): Point => ({
  x: (COS * (x - z)) / 3,
  y: (0.5 * (x + z) - y) / 3,
});

function buildCells(): CornerCell[] {
  const cells: CornerCell[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // 칸의 두 변이 놓이는 범위
      const a0 = c - 1.5;
      const a1 = c - 0.5;
      // 윗면: x = 열, z = 행 (뒤쪽 줄부터)
      cells.push({
        slot: r * 3 + c,
        center: project(c - 1, 1.5, r - 1),
        outline: [project(a0, 1.5, r - 1.5), project(a1, 1.5, r - 1.5), project(a1, 1.5, r - 0.5), project(a0, 1.5, r - 0.5)],
      });
      // 왼쪽 앞에 보이는 면(F): x = 열, y = 행 (위쪽 줄부터)
      cells.push({
        slot: 18 + r * 3 + c,
        center: project(c - 1, 1 - r, 1.5),
        outline: [project(a0, 1.5 - r, 1.5), project(a1, 1.5 - r, 1.5), project(a1, 0.5 - r, 1.5), project(a0, 0.5 - r, 1.5)],
      });
      // 오른쪽 앞에 보이는 면(R): z = 열 (앞쪽 열부터), y = 행
      cells.push({
        slot: 9 + r * 3 + c,
        center: project(1.5, 1 - r, 1 - c),
        outline: [project(1.5, 1.5 - r, 1.5 - c), project(1.5, 1.5 - r, 0.5 - c), project(1.5, 0.5 - r, 0.5 - c), project(1.5, 0.5 - r, 1.5 - c)],
      });
    }
  }
  return cells;
}

/** 한 번에 보이는 27칸 */
export const CORNER_CELLS: readonly CornerCell[] = buildCells();

export interface CornerShot {
  /** 이 사진에서 위, 왼쪽 앞, 오른쪽 앞에 와야 하는 센터의 색 번호 */
  centers: readonly [number, number, number];
  /** 보이는 칸 번호(CornerCell.slot) → 기본 방향(흰색 위, 초록 앞)으로 본 큐브의 칸 번호 */
  map: readonly number[];
}

const ROTATIONS = ['', 'x', "x'", 'x2', 'z', "z'"].flatMap((a) => ['', 'y', "y'", 'y2'].map((b) => parseAlg(`${a} ${b}`)));
const IDENTITY: CubeState = Array.from({ length: 54 }, (_, i) => i);

/** 세 센터 색이 그 자리에 오도록 큐브를 돌려 잡았을 때의 칸 대응을 구한다. */
function shotFor(top: number, left: number, right: number): CornerShot {
  for (const rotation of ROTATIONS) {
    // seen[j] = 돌려 잡은 뒤 j번 자리에 보이는, 원래 큐브의 칸 번호
    const seen = applyMoves(IDENTITY, rotation);
    const face = (j: number) => Math.floor(seen[j] / 9);
    if (face(4) === top && face(22) === left && face(13) === right) return { centers: [top, left, right], map: seen };
  }
  throw new Error(`그렇게 잡을 수 없는 방향: ${top}, ${left}, ${right}`);
}

/**
 * 찍는 두 방향.
 * 첫 번째: 흰색이 위, 초록색이 왼쪽 앞, 빨간색이 오른쪽 앞.
 * 두 번째: 반대쪽 꼭짓점 — 노란색이 위, 주황색이 왼쪽 앞, 파란색이 오른쪽 앞.
 */
export const CORNER_SHOTS: readonly CornerShot[] = [shotFor(0, 2, 1), shotFor(3, 4, 5)];

/** 칸 가운데에서 색을 읽는 범위: 육각형 한 변에 대한 비율. 칸 안쪽에 넉넉히 들어가는 크기다. */
const PATCH = 0.06;

function medianOf(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

/**
 * 27칸의 대표 색을 읽는다 (CORNER_CELLS 순서).
 * image는 안내 육각형을 감싸는 정사각형을 잘라 낸 그림이어야 한다 (한 변 = 육각형의 높이).
 * 번쩍임이나 테두리가 섞여도 덜 흔들리도록 채널마다 중앙값을 쓴다.
 */
export function sampleCornerCells(image: PixelSource): RGB[] {
  const { data, width, height } = image;
  const half = Math.min(width, height) / 2;
  const radius = Math.max(1, Math.round(PATCH * half));
  const step = Math.max(1, Math.floor(radius / 5));

  return CORNER_CELLS.map(({ center }) => {
    const cx = Math.round(width / 2 + center.x * half);
    const cy = Math.round(height / 2 + center.y * half);
    const channels: [number[], number[], number[]] = [[], [], []];
    for (let y = cy - radius; y <= cy + radius; y += step) {
      if (y < 0 || y >= height) continue;
      for (let x = cx - radius; x <= cx + radius; x += step) {
        if (x < 0 || x >= width) continue;
        const i = (y * width + x) * 4;
        channels[0].push(data[i]);
        channels[1].push(data[i + 1]);
        channels[2].push(data[i + 2]);
      }
    }
    if (channels[0].length === 0) return [0, 0, 0] as const;
    return [medianOf(channels[0]), medianOf(channels[1]), medianOf(channels[2])] as const;
  });
}
