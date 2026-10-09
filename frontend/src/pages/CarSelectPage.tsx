import { useMemo, type CSSProperties } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { SelectCard } from '../components/SelectCard';
import { StatBar } from '../components/StatBar';
import { CARS, colorToCss, type Car } from '../data/cars';
import { useReferenceData } from '../hooks/useReferenceData';
import { useRouter } from '../router/RouterProvider';
import type { BackendCar } from '../services/api';
import { useGameStore } from '../store/GameStore';
import { useKeyPress } from '../hooks/useKeyPress';
import '../garage.css';

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

  const currentCarId = state.selectedCarId || cars[0]?.id || 'apex-vulcan';
  const selectedCar = cars.find(c => c.id === currentCarId) || cars[0];

  useKeyPress('Escape', () => navigate('character'));

  return (
    <div className="garage-layout">
      {/* Background Atmosphere */}
      <div className="garage-atmosphere">
        <div className="garage-light red-light"></div>
        <div className="garage-light violet-light"></div>
        <div className="garage-grain"></div>
      </div>

      <header className="garage-header">
        <div className="garage-brand">HAWKINS: NITRO RUN</div>
        <ol className="garage-steps" aria-label="Progress">
          <li className="done">DRIVER</li>
          <li className="on">CAR</li>
          <li>TRACK</li>
          <li>MODE</li>
        </ol>
        <div className="garage-profile">GARAGE [ 01 ]</div>
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
            <img src={`/cars/car-${selectedCar.id}-top.png`} alt={selectedCar.name} className="showcase-car-img" />
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
                className={`carousel-item ${isSelected ? 'selected' : ''}`}
                onClick={() => dispatch({ type: 'SELECT_CAR', id: car.id })}
              >
                <div className="carousel-img-container">
                  <img src={`/cars/car-${car.id}-top.png`} alt={car.name} />
                </div>
                <div className="carousel-item-info">
                  <div className="carousel-item-name">{car.name}</div>
                  <div className="carousel-item-class">RACING</div>
                </div>
              </button>
            );
          })}
        </div>

        <footer className="garage-footer">
          <button className="garage-btn back-btn" onClick={() => navigate('character')}>
            <span className="arrow">&lt;</span> BACK
          </button>
          <button 
            className="garage-btn continue-btn" 
            onClick={() => {
              if (!state.selectedCarId) {
                dispatch({ type: 'SELECT_CAR', id: currentCarId });
              }
              navigate('track');
            }}
            disabled={!selectedCar.unlocked}
          >
            CONTINUE <span className="arrow">&gt;</span>
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
