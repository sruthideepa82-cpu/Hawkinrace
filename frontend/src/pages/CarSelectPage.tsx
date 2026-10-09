import { useMemo, type CSSProperties } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { SelectCard } from '../components/SelectCard';
import { StatBar } from '../components/StatBar';
import { CARS, colorToCss, type Car } from '../data/cars';
import { useReferenceData } from '../hooks/useReferenceData';
import { useRouter } from '../router/RouterProvider';
import type { BackendCar } from '../services/api';
import { useGameStore } from '../store/GameStore';

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Overlay live backend stats onto the local car definitions.
 *
 * The local id is kept because Phaser tuning is keyed on it; only the values
 * that the backend owns (stats, colour, blurb, unlock flag) are replaced. If
 * the backend has not loaded, the local car is used unchanged.
 */
function mergeCars(remote: BackendCar[] | undefined): readonly Car[] {
  if (!remote || remote.length === 0) return CARS;
  return CARS.map((local) => {
    const match = remote.find((r) => sameName(r.name, local.name));
    if (!match) return local;
    return {
      ...local,
      blurb: match.blurb ?? local.blurb,
      color: match.color ?? local.color,
      unlocked: match.unlocked,
      stats: {
        speed: match.speed,
        acceleration: match.acceleration,
        handling: match.handling,
        nitro: match.nitro,
      },
    };
  });
}

export function CarSelectPage() {
  const { state, dispatch } = useGameStore();
  const { navigate } = useRouter();
  const { data } = useReferenceData();
  const cars = useMemo(() => mergeCars(data?.cars), [data]);

  return (
    <ScreenFrame
      step={2}
      title="CHOOSE YOUR CAR"
      onBack={() => navigate('character')}
      onContinue={() => navigate('track')}
      continueDisabled={!state.selectedCarId}
    >
      <div className="card-grid cars">
        {cars.map((car) => {
          const css = colorToCss(car.color);
          return (
            <SelectCard key={car.id} accent={css} selected={state.selectedCarId === car.id} unavailableLabel={car.unlocked ? undefined : 'LOCKED'} onSelect={() => dispatch({ type: 'SELECT_CAR', id: car.id })}>
              <div className="car-art" style={{ '--accent': css, border: 'none', background: 'transparent' } as CSSProperties} aria-hidden="true">
                <img src={`/cars/car-${car.id}-top.png`} alt={car.name} style={{ width: '80%', objectFit: 'contain' }} />
              </div>
              <h3 className="card-title">{car.name}</h3>
              <p className="card-blurb">{car.blurb}</p>
              <div className="stats">
                <StatBar label="SPEED" value={car.stats.speed} />
                <StatBar label="ACCEL" value={car.stats.acceleration} />
                <StatBar label="HANDLING" value={car.stats.handling} />
                <StatBar label="NITRO" value={car.stats.nitro} />
              </div>
            </SelectCard>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
