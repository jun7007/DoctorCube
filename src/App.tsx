import { useState } from 'react';
import { FreeMode } from './modes/free/FreeMode';
import { FreeSession } from './modes/free/session';
import { LearnMode } from './modes/learn/LearnMode';

type Mode = 'learn' | 'free' | 'scan';

const MODES: { id: Mode; label: string }[] = [
  { id: 'learn', label: '학습' },
  { id: 'free', label: '자유' },
  { id: 'scan', label: '스캔' },
];

export function App() {
  const [mode, setMode] = useState<Mode>('learn');
  // 탭을 오가도 풀던 큐브와 보던 레슨이 유지되도록 여기서 보관한다.
  const [freeSession] = useState(() => new FreeSession());
  const [lessonId, setLessonId] = useState<string | null>(null);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">DoctorCube</h1>
        <nav className="tabs" role="tablist" aria-label="모드">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              className="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">
        {mode === 'learn' && <LearnMode lessonId={lessonId} onOpen={setLessonId} />}
        {mode === 'free' && <FreeMode session={freeSession} />}
        {mode === 'scan' && (
          <div className="coming">
            <h2>스캔과 경로 비교는 준비 중이에요</h2>
            <ul>
              <li>카메라로 실제 큐브 6면 찍기</li>
              <li>공식별 풀이 수와 예상 시간 비교</li>
              <li>고른 경로를 3D로 한 단계씩 따라 하기</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
