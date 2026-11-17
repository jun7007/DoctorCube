import { invertMove, moveToString, type BaseMove, type Move } from './cube';

const TOKEN = /^([URFDLBMESxyzurfdlb])(w)?(2)?(')?$/;

/**
 * "R U R' U2", "Rw", "(R U R' U')" 같은 공식 문자열을 동작 목록으로 바꾼다.
 * 괄호와 쉼표는 무시한다. 모르는 기호가 있으면 오류를 던진다.
 */
export function parseAlg(text: string): Move[] {
  const cleaned = text.replace(/[()[\],]/g, ' ').replace(/[’‘`]/g, "'");
  const moves: Move[] = [];
  for (const token of cleaned.split(/\s+/)) {
    if (!token) continue;
    const m = TOKEN.exec(token);
    if (!m) throw new Error(`알 수 없는 기호: ${token}`);
    let base = m[1];
    if (m[2]) {
      if (!'URFDLB'.includes(base)) throw new Error(`알 수 없는 기호: ${token}`);
      base = base.toLowerCase();
    }
    moves.push({ base: base as BaseMove, amount: m[3] ? 2 : m[4] ? -1 : 1 });
  }
  return moves;
}

export function algToString(moves: readonly Move[]): string {
  return moves.map(moveToString).join(' ');
}

export function invertAlg(moves: readonly Move[]): Move[] {
  return moves.map(invertMove).reverse();
}
