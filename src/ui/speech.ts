/**
 * 다음 동작을 소리로 읽어 준다 (실제 큐브를 두 손으로 들고 따라 할 때).
 * 브라우저의 음성 합성을 쓰며, 지원하지 않는 기기에서는 아무 일도 하지 않는다.
 */
import { useState } from 'react';
import type { Move } from '../core/cube';

/** 기호를 한국어로 읽는 법. 음성 합성이 알파벳 한 글자를 엉뚱하게 읽는 일을 피한다. */
const LETTER: Record<string, string> = {
  u: '유',
  d: '디',
  l: '엘',
  r: '알',
  f: '에프',
  b: '비',
  m: '엠',
  e: '이',
  s: '에스',
  x: '엑스',
  y: '와이',
  z: '지',
};

const ROTATIONS = new Set(['x', 'y', 'z']);
const WIDE = new Set(['u', 'd', 'l', 'r', 'f', 'b']);

/** 동작을 읽는 말. 예: R → "알", R' → "알 프라임", R2 → "알 두 번", r → "넓게 알", x → "통째로 엑스" */
export function moveSpeech(move: Move): string {
  const name = LETTER[move.base.toLowerCase()];
  const prefix = ROTATIONS.has(move.base) ? '통째로 ' : WIDE.has(move.base) ? '넓게 ' : '';
  const suffix = move.amount === 2 ? ' 두 번' : move.amount === -1 ? ' 프라임' : '';
  return `${prefix}${name}${suffix}`;
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** 하던 말을 끊고 이 말을 읽는다. */
export function speak(text: string): void {
  if (!speechAvailable()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

const KEY = 'doctorcube.voice';

/** 소리로 읽어 주기 설정. 기기에 저장된다. */
export function useVoice(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'on';
    } catch {
      return false;
    }
  });
  const change = (next: boolean) => {
    setOn(next);
    if (!next) stopSpeaking();
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      // 저장 실패는 무시
    }
  };
  return [on, change];
}
