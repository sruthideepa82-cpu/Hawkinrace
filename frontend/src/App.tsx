import { CharacterSelectPage } from './pages/CharacterSelectPage';
import { CarSelectPage } from './pages/CarSelectPage';
import { IntroPage } from './pages/IntroPage';
import { MainMenuPage } from './pages/MainMenuPage';
import { ModeSelectPage } from './pages/ModeSelectPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RacePage } from './pages/RacePage';
import { TrackSelectPage } from './pages/TrackSelectPage';
import { GaragePage } from './pages/GaragePage';
import { GameStoreProvider } from './store/GameStore';
import { AtmosphericBackground } from './components/AtmosphericBackground';
import { RouterProvider, useRouter } from './router/RouterProvider';
import type { Screen } from './router/routes';

/**
 * Maps a route to its page.
 *
 * `/race` and `/results` render the SAME component, with different props, and
 * neither is given a distinct React key. That is deliberate and load-bearing:
 * React reconciles them as one instance, so the Phaser game keeps running and
 * the finished race stays on screen behind the results overlay. Giving these
 * two routes different keys -- or different components -- tears the game down
 * and launches a new one, and the race appears to restart the instant the
 * player takes the chequered flag.
 */
function CurrentScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'intro': return <IntroPage />;
    case 'menu': return <MainMenuPage />;
    case 'garage': return <GaragePage />;
    case 'leaderboard':
    case 'settings': return <PlaceholderPage screen={screen} />;
    case 'character': return <CharacterSelectPage />;
    case 'car': return <CarSelectPage />;
    case 'track': return <TrackSelectPage />;
    case 'mode': return <ModeSelectPage />;
    case 'race': return <RacePage showResults={false} />;
    case 'results': return <RacePage showResults />;
  }
}

function Shell() {
  const { screen } = useRouter();
  const inRace = screen === 'race' || screen === 'results';
  return (
    <div className="app">
      {!inRace && <AtmosphericBackground />}
      <CurrentScreen screen={screen} />
    </div>
  );
}

export default function App() {
  return (
    <GameStoreProvider>
      <RouterProvider>
        <Shell />
      </RouterProvider>
    </GameStoreProvider>
  );
}