import { useState, type ReactNode } from 'react';
import { moveToString, type BaseMove, type Move } from '../core/cube';

type PadTab = 'basic' | 'extra';

const PADS: Record<PadTab, { label: string; keys: { base: BaseMove; caption: string }[] }> = {
  basic: {
    label: '기본',
    keys: [
      { base: 'U', caption: '위' },
      { base: 'D', caption: '아래' },
      { base: 'L', caption: '왼쪽' },
      { base: 'R', caption: '오른쪽' },
      { base: 'F', caption: '앞' },
      { base: 'B', caption: '뒤' },
    ],
  },
  extra: {
    label: '중간층·전체',
    keys: [
      { base: 'M', caption: '세로 중간' },
      { base: 'E', caption: '가로 중간' },
      { base: 'S', caption: '앞뒤 중간' },
      { base: 'x', caption: '전체 x' },
      { base: 'y', caption: '전체 y' },
      { base: 'z', caption: '전체 z' },
    ],
  },
};

/** 회전 버튼판. trailing에는 탭 옆에 둘 것(속도 조절 등)을 넣는다. */
export function MovePad({ onTurn, trailing }: { onTurn: (move: Move) => void; trailing?: ReactNode }) {
  const [tab, setTab] = useState<PadTab>('basic');
  return (
    <div className="pad">
      <div className="pad__head">
        <div className="segmented" role="tablist" aria-label="버튼 종류">
          {(Object.keys(PADS) as PadTab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {PADS[t].label}
            </button>
          ))}
        </div>
        {trailing}
      </div>
      <div className="pad__grid">
        {PADS[tab].keys.map(({ base, caption }) => (
          <span key={`c-${base}`} className="pad__caption">
            {caption}
          </span>
        ))}
        {([1, -1] as const).map((amount) =>
          PADS[tab].keys.map(({ base }) => {
            const move: Move = { base, amount };
            const name = moveToString(move);
            return (
              <button key={name} className="key" onClick={() => onTurn(move)}>
                {name}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
