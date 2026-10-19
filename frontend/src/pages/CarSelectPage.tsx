import { useMemo } from 'react';
import { CARS, type Car, type CarId } from '../data/cars';
import { CHARACTERS } from '../data/characters';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { useReferenceData } from '../hooks/useReferenceData';
import { useRouter } from '../router/RouterProvider';
import type { BackendCar } from '../services/api';
import { useGameStore } from '../store/GameStore';
import { useKeyPress } from '../hooks/useKeyPress';
import '../garage.css';

/**
 * Overlay live backend stats onto the local car definitions.
 *
 * The backend now serves the same car ids the game uses, so records are joined
 * on `id` -- an exact match that cannot silently fail the way a name comparison
 * did when a car was renamed.
 *
 * The local id is kept because Phaser tuning is keyed on it; only the values
 * that the backend owns (stats, colour, blurb, unlock flag) are replaced. If
 * the backend has not loaded, the local car is used unchanged.
 */
function mergeCars(remote: BackendCar[] | undefined): readonly Car[] {
  if (!remote || remote.length === 0) return CARS;
  return CARS.map((local) => {
    const match = remote.find((r) => r.id === local.id);
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
  const { profile, saveSelectedCar } = usePlayerProfile();
  const cars = useMemo(() => mergeCars(data?.cars), [data]);

  const currentCarId = state.selectedCarId || cars[0]?.id || 'apex-vulcan';
  const selectedCar = cars.find(c => c.id === currentCarId) || cars[0];

  /**
   * Selecting a car both drives the game and records the choice on the profile.
   *
   * The save is fire-and-forget: it must not delay the selection, and a backend
   * that is down costs the player nothing but a preference that will not be
   * remembered next visit. `saveSelectedCar` already swallows its own errors.
   */
  const chooseCar = (carId: CarId) => {
    dispatch({ type: 'SELECT_CAR', id: carId });
    saveSelectedCar(carId);
  };

  useKeyPress('Escape', () => navigate('character'));

  return (
    <div className="garage-layout">
      {/* Background Atmosphere */}
      <div className="garage-atmosphere">
        <div className="garage-light red-light"></div>
        <div className="garage-light violet-light"></div>
        <div className="garage-floor-reflection"></div>
        <div className="garage-grain"></div>
      </div>

      <header className="garage-header">
        <div className="garage-brand">HAWKINS: NITRO RUN</div>
        <ol className="garage-steps" aria-label="Progress">
          <li className="done">DRIVER</li>
          <li className="on">CAR</li>
          <li>TRACK</li>
        </ol>
        {/* The real profile name once one exists, rather than a hardcoded
            placeholder. Falls back to the locally chosen driver so the header is
            never blank, and says so plainly when there is no backend at all. */}
        <div className="garage-profile">
          {profile?.displayName ?? CHARACTERS.find((c) => c.id === state.selectedCharacterId)?.name ?? 'GUEST'}
        </div>
      </header>

      <main className="garage-main">
        <div className="garage-info-panel">
          <div className="info-label">VEHICLE SELECTION</div>
          <h1 className="info-title">CHOOSE YOUR CAR</h1>
          
          <div className="selected-car-details" key={selectedCar.id}>
            <h2 className="car-name">{selectedCar.name}</h2>
            <span className="car-class">CLASS S // {selectedCar.unlocked ? 'UNLOCKED' : 'LOCKED'}</span>
            <p className="car-description">{selectedCar.blurb}</p>
            
            <div className="car-stats">
              <GarageStat label="SPEED" value={selectedCar.stats.speed} />
              <GarageStat label="ACCELERATION" value={selectedCar.stats.acceleration} />
              <GarageStat label="HANDLING" value={selectedCar.stats.handling} />
              <GarageStat label="NITRO" value={selectedCar.stats.nitro} />
            </div>
          </div>
        </div>

        <div className="garage-showcase-panel">
          <div className="showcase-container" key={`showcase-${selectedCar.id}`}>
            <img src={`/cars/ui-${selectedCar.id}.png`} alt={selectedCar.name} className="showcase-car-img" />
            <div className="showcase-shadow"></div>
          </div>
        </div>
      </main>

      <div className="garage-bottom">
        <div className="garage-carousel">
          {cars.map((car) => {
            const isSelected = currentCarId === car.id;
            return (
              <button 
                key={car.id} 
                className={`carousel-item ${isSelected ? 'selected' : ''} ${!car.unlocked ? 'locked' : ''}`}
                onClick={() => chooseCar(car.id)}
              >
                <div className="carousel-img-container">
                  <img src={`/cars/ui-${car.id}.png`} alt={car.name} />
                </div>
                <div className="carousel-item-info">
                  <div className="carousel-item-name">{car.name}</div>
                  <div className="carousel-item-class">{car.unlocked ? 'RACING' : 'LOCKED'}</div>
                </div>
              </button>
            );
          })}
        </div>

        <footer className="garage-footer">
          <button className="nav-button" onClick={() => navigate('character')}>
            BACK
          </button>
          <button 
            className="nav-button primary" 
            onClick={() => {
              // Commit the highlighted car when the player advances without
              // having clicked a card, so the profile records what they
              // actually raced rather than only what they tapped.
              if (!state.selectedCarId) {
                chooseCar(currentCarId);
              }
              navigate('track');
            }}
            disabled={!selectedCar.unlocked}
          >
            CONTINUE
          </button>
        </footer>
      </div>
    </div>
  );
}

function GarageStat({ label, value }: { label: string, value: number }) {
  return (
    <div className="garage-stat">
      <div className="g-stat-header">
        <span className="g-stat-label">{label}</span>
        <span className="g-stat-value">{value}/10</span>
      </div>
      <div className="g-stat-bar-bg">
        <div className="g-stat-bar-fill" style={{ width: `${(value / 10) * 100}%` }}></div>
      </div>
    </div>
  );
}
