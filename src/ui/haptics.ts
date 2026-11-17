/**
 * 짧은 진동. 지원하지 않는 기기(아이폰, PC 등)에서는 아무 일도 하지 않는다.
 * pattern은 진동 시간(ms) 하나, 또는 [진동, 쉼, 진동, …].
 */
export function buzz(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 진동을 막아 둔 환경이면 무시
  }
}

/** 틀렸을 때의 진동: 짧게 두 번 */
export const BUZZ_WRONG = [35, 60, 35];
