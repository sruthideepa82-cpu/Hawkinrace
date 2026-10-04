import { useEffect, useMemo } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import { NeonButton } from '../components/NeonButton';
import type { RaceBridge } from '../game/bridge';
import { useKeyPress } from '../hooks/useKeyPress';
import { useGameStore } from '../store/GameStore';

export function RacePage() {
  const { state, dispatch, selections } = useGameStore();
  const { character, car, track, mode } = selections;
  const ready = Boolean(character && car && track && mode);

  // Build the React -> Phaser contract once per race start.
  const bridge = useMemo<RaceBridge | null>(() => {
    if (!character || !car || !track || !mode) return null;
    return {
      config: {
        characterId: character.id,
        characterName: character.name,
        car: {
          id: car.id,
          name: car.name,
          color: car.color,
          stats: { speed: car.stats.speed, acceleration: car.stats.acceleration, handling: car.stats.handling },
        },
        trackId: track.id,
        modeId: mode.id,
      },
      onRaceComplete: (result) => dispatch({ type: 'RACE_FINISHED', result }),
    };
  }, [state.raceKey]);

  const quit = () => dispatch({ type: 'NAVIGATE', screen: 'menu' });
  useKeyPress('Escape', quit);
  useEffect(() => {
    if (!ready) dispatch({ type: 'NAVIGATE', screen: 'menu' });
  }, [ready, dispatch]);

  if (!bridge) return null;
  return (
    <section className="race-page">
      <GameCanvas bridge={bridge} />
      <NeonButton variant="ghost" className="quit-btn" onClick={quit}>✕ QUIT</NeonButton>
      <footer className="race-hints">
        <span>W / ↑ accelerate</span><span>S / ↓ brake · reverse</span><span>A D / ← → steer</span><span>R restart</span><span>ESC quit</span>
      </footer>
    </section>
  );
}
