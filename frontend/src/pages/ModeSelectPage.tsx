import { ScreenFrame } from '../components/ScreenFrame';
import { SelectCard } from '../components/SelectCard';
import { GAME_MODES } from '../data/gameModes';
import { useRouter } from '../router/RouterProvider';
import { useGameStore } from '../store/GameStore';

export function ModeSelectPage() {
  const { state, dispatch } = useGameStore();
  const { navigate } = useRouter();
  // START_RACE bumps the raceKey, which is what rebuilds the Phaser game.
  const startRace = () => {
    dispatch({ type: 'START_RACE' });
    navigate('race');
  };
  return (
    <ScreenFrame
      step={4}
      title="CHOOSE YOUR MODE"
      onBack={() => navigate('track')}
      onContinue={startRace}
      continueLabel="START RACE >"
      continueDisabled={!state.selectedGameModeId}
    >
      <div className="card-grid modes">
        {GAME_MODES.map((m) => (
          <SelectCard key={m.id} selected={state.selectedGameModeId === m.id} unavailableLabel={m.playable ? undefined : 'COMING SOON'} onSelect={() => dispatch({ type: 'SELECT_GAME_MODE', id: m.id })}>
            <h3 className="card-title">{m.name}</h3>
            <p className="card-blurb">{m.description}</p>
          </SelectCard>
        ))}
      </div>
    </ScreenFrame>
  );
}
