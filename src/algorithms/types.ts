/**
 * 공식 한 개(한 케이스).
 * 모든 공식은 YELLOW_UP(노란색 위, 초록색 앞) 방향으로 잡았을 때 기준이다.
 * 케이스의 모습은 "완성 상태에 공식을 거꾸로 적용한 상태"로 만든다.
 */
export interface AlgCase {
  /** 고유 id. 예: 'pll-Aa', 'oll-27', 'f2l-05' */
  id: string;
  /** 화면에 보이는 이름. 예: 'Aa', 'OLL 27', 'F2L 5' */
  name: string;
  /** 묶음 이름 (한국어). 같은 묶음끼리 모아서 보여 준다 */
  group: string;
  /** 대표 공식. core/notation의 parseAlg로 읽을 수 있어야 한다 */
  alg: string;
  /** 다른 공식들 (있으면) */
  alts?: string[];
  /** 알아보는 요령 한 줄 (한국어) */
  note?: string;
}
