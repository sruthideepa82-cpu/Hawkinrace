import type { CSSProperties } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { SelectCard } from '../components/SelectCard';
import { StatBar } from '../components/StatBar';
import { CARS, colorToCss } from '../data/cars';
import { useRouter } from '../router/RouterProvider';
import { useGameStore } from '../store/GameStore';

export function CarSelectPage() {
  const { state, dispatch } = useGameStore();
  const { navigate } = useRouter();
  return (
    <ScreenFrame
      step={2}
      title="CHOOSE YOUR CAR"
      onBack={() => navigate('character')}
      onContinue={() => navigate('track')}
      continueDisabled={!state.selectedCarId}
    >
      <div className="card-grid cars">
        {CARS.map((car) => {
          const css = colorToCss(car.color);
          return (
            <SelectCard key={car.id} accent={css} selected={state.selectedCarId === car.id} unavailableLabel={car.unlocked ? undefined : 'LOCKED'} onSelect={() => dispatch({ type: 'SELECT_CAR', id: car.id })}>
              <div className="car-art" style={{ '--accent': css } as CSSProperties} aria-hidden="true">
                <div className="car-body"><i className="car-window" /></div>
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
