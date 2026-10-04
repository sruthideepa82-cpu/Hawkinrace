import { CharacterSelectPage } from './pages/CharacterSelectPage';
import { CarSelectPage } from './pages/CarSelectPage';
import { IntroPage } from './pages/IntroPage';
import { MainMenuPage } from './pages/MainMenuPage';
import { ModeSelectPage } from './pages/ModeSelectPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RacePage } from './pages/RacePage';
import { ResultsPage } from './pages/ResultsPage';
import { TrackSelectPage } from './pages/TrackSelectPage';
import { GaragePage } from './pages/GaragePage';
import { GameStoreProvider, useGameStore, type Screen } from './store/GameStore';
import { AtmosphericBackground } from './components/AtmosphericBackground';

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
    case 'race': return <RacePage />;
    case 'results': return <ResultsPage />;
  }
}

function Shell() {
  const { state } = useGameStore();
  const inRace = state.screen === 'race';
  return (
    <div className="app">
      {!inRace && <AtmosphericBackground />}
      <CurrentScreen key={state.screen} screen={state.screen} />
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
