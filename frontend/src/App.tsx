import { CharacterSelectPage } from './pages/CharacterSelectPage';
import { CarSelectPage } from './pages/CarSelectPage';
import { IntroPage } from './pages/IntroPage';
import { MainMenuPage } from './pages/MainMenuPage';
import { ModeSelectPage } from './pages/ModeSelectPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RacePage } from './pages/RacePage';
import { ResultsPage } from './pages/ResultsPage';
import { TrackSelectPage } from './pages/TrackSelectPage';
import { GameStoreProvider, useGameStore, type Screen } from './store/GameStore';

function CurrentScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'intro': return <IntroPage />;
    case 'menu': return <MainMenuPage />;
    case 'garage':
    case 'leaderboard':
    case 'settings': return <PlaceholderPage screen={screen} />;
    case 'character': return <CharacterSelectPage />;
    case 'car': return <CarSelectPage />;
    case 'track': return <TrackSelectPage />;
    case 'mode': return <ModeSelectPage />;
    case 'race': return <RacePage />;
    case 'results': return <ResultsPage />;
  }
}

function Shell() {
  const { state } = useGameStore();
  const inRace = state.screen === 'race';
  return (
    <div className="app">
      {!inRace && <div className="backdrop-grid" aria-hidden="true" />}
      <CurrentScreen key={state.screen} screen={state.screen} />
      {!inRace && <div className="scanlines" aria-hidden="true" />}
    </div>
  );
}

export default function App() {
  return (
    <GameStoreProvider>
      <Shell />
    </GameStoreProvider>
  );
}
