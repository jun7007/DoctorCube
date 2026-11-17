import { useState } from 'react';
import { FreeMode } from './modes/free/FreeMode';
import { FreeSession } from './modes/free/session';
import { LearnMode, type LearnRoute } from './modes/learn/LearnMode';
import { INITIAL_ROUTE_SESSION, RouteMode, type RouteSession } from './modes/route/RouteMode';

type Mode = 'learn' | 'free' | 'route';

const MODES: { id: Mode; label: string }[] = [
  { id: 'learn', label: '학습' },
  { id: 'free', label: '자유' },
  { id: 'route', label: '경로' },
];

export function App() {
  const [mode, setMode] = useState<Mode>('learn');
  // 탭을 오가도 하던 일이 유지되도록 각 탭의 상태를 여기서 보관한다.
  const [freeSession] = useState(() => new FreeSession());
  const [learnRoute, setLearnRoute] = useState<LearnRoute>({ view: 'home' });
  const [routeSession, setRouteSession] = useState<RouteSession>(INITIAL_ROUTE_SESSION);

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
        {mode === 'learn' && <LearnMode route={learnRoute} onRoute={setLearnRoute} />}
        {mode === 'free' && <FreeMode session={freeSession} />}
        {mode === 'route' && (
          <RouteMode
            session={routeSession}
            onSession={setRouteSession}
            getFreeCube={() => freeSession.getSnapshot().cube}
          />
        )}
      </main>
    </div>
  );
}
