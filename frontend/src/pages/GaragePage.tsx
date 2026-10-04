import { ScreenFrame } from '../components/ScreenFrame';
import { StatBar } from '../components/StatBar';
import { CARS, colorToCss } from '../data/cars';
import { useGameStore } from '../store/GameStore';

export function GaragePage() {
  const { state, dispatch } = useGameStore();
  const currentCar = CARS.find(c => c.id === (state.selectedCarId || 'falcon-gt')) || CARS[0];
  const css = colorToCss(currentCar.color);

  return (
    <ScreenFrame
      step={0}
      title="GARAGE"
      onBack={() => dispatch({ type: 'NAVIGATE', screen: 'menu' })}
    >
      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: '32px', color: 'var(--red)', marginBottom: '16px' }}>CURRENT CAR</h2>
          <div className="car-art" style={{ '--accent': css, height: '200px' } as React.CSSProperties}>
            <div className="car-body" style={{ transform: 'scale(1.5)', marginTop: '40px' }}>
              <i className="car-window" />
            </div>
          </div>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '48px', marginTop: '16px' }}>{currentCar.name}</h3>
          
          <div className="stats" style={{ marginTop: '20px' }}>
            <StatBar label="SPEED" value={currentCar.stats.speed} />
            <StatBar label="ACCEL" value={currentCar.stats.acceleration} />
            <StatBar label="HANDLING" value={currentCar.stats.handling} />
            <StatBar label="NITRO" value={currentCar.stats.nitro} />
          </div>
        </div>

        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: '32px', color: 'var(--muted)', marginBottom: '0px' }}>UPGRADES</h2>
          
          {['ENGINE', 'TIRES', 'NEON', 'DECALS'].map(part => (
            <div key={part} style={{ background: 'var(--panel)', border: '1px solid #333', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: '24px' }}>{part}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: '#ff2e63', background: '#333', padding: '4px 8px' }}>LOCKED</span>
            </div>
          ))}
          
          <div style={{ marginTop: 'auto', textAlign: 'center', padding: '20px', border: '1px dashed #555' }}>
            <p style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>MORE FEATURES COMING SOON</p>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}
