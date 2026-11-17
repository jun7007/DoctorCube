/**
 * 조각 단위로 큐브를 읽는 도구.
 * 조각 위치는 면 글자를 이어 쓴다: 'U'(센터), 'UF'(엣지), 'UFR'(코너).
 */
import { FACELETS, FACES, faceletIndex, type CubeState, type Face, type Vec3 } from './cube';

export const FACE_NORMAL: Readonly<Record<Face, Vec3>> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

function piecePos(piece: string): Vec3 {
  const pos: [number, number, number] = [0, 0, 0];
  for (const ch of piece) {
    const n = FACE_NORMAL[ch as Face];
    if (!n) throw new Error(`조각 이름이 잘못됨: ${piece}`);
    pos[0] += n[0];
    pos[1] += n[1];
    pos[2] += n[2];
  }
  return pos;
}

const faceletCache = new Map<string, number>();

/** 조각 위치와 그 조각의 한 면 → 칸 번호. 예: facelet('UFR', 'F') */
export function facelet(piece: string, face: Face): number {
  const key = `${piece}/${face}`;
  let index = faceletCache.get(key);
  if (index === undefined) {
    index = faceletIndex(piecePos(piece), FACE_NORMAL[face]);
    if (index === undefined) throw new Error(`없는 칸: ${key}`);
    faceletCache.set(key, index);
  }
  return index;
}

export function colorAt(state: CubeState, piece: string, face: Face): number {
  return state[facelet(piece, face)];
}

export function centerColor(state: CubeState, face: Face): number {
  return state[FACES.indexOf(face) * 9 + 4];
}

/** 같은 조각에 붙은 칸들 */
const CUBIE_FACELETS: readonly (readonly number[])[] = FACELETS.map((f) =>
  FACELETS.flatMap((g, j) => (g.pos.join() === f.pos.join() ? [j] : [])),
);

/**
 * 각 칸의 스티커가 완성 상태에서 원래 있던 칸 번호 (조각의 색 조합으로 알아낸다).
 * 색이 잘못된 상태라 알 수 없는 칸은 -1.
 */
export function homeOf(state: CubeState): number[] {
  return FACELETS.map((_, i) => {
    const pos: [number, number, number] = [0, 0, 0];
    for (const j of CUBIE_FACELETS[i]) {
      const n = FACE_NORMAL[FACES[state[j]]];
      pos[0] += n[0];
      pos[1] += n[1];
      pos[2] += n[2];
    }
    return faceletIndex(pos, FACE_NORMAL[FACES[state[i]]]) ?? -1;
  });
}

/**
 * 강조할 조각 모음. 완성 상태 기준 위치 이름을 띄어 쓴다. 예: focusOf('U UF UR UB UL')
 * '@U'처럼 쓰면 그 면에 있는 조각 9개 전부.
 * 결과는 그 조각들의 원래 칸 번호 집합이라, 큐브를 돌려도 같은 조각을 따라간다.
 */
export function focusOf(pieces: string): Set<number> {
  const out = new Set<number>();
  for (const piece of pieces.split(/\s+/).filter(Boolean)) {
    if (piece.startsWith('@')) {
      const n = FACE_NORMAL[piece[1] as Face];
      const axis = n.findIndex((v) => v !== 0);
      FACELETS.forEach((f, i) => {
        if (f.pos[axis] === n[axis]) out.add(i);
      });
      continue;
    }
    const key = piecePos(piece).join();
    FACELETS.forEach((f, i) => {
      if (f.pos.join() === key) out.add(i);
    });
  }
  return out;
}
