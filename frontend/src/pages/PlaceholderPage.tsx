import { ScreenFrame } from '../components/ScreenFrame';
import { BACK_TARGET, useGameStore, type Screen } from '../store/GameStore';

const COPY: Partial<Record<Screen, { title: string; icon: string; text: string }>> = {
  garage: { title: 'GARAGE', icon: '🚗', text: 'Upgrades and unlockable cars arrive in a later milestone.' },
  leaderboard: { title: 'LEADERBOARD', icon: '🏆', text: 'The online leaderboard arrives with the backend.' },
  settings: { title: 'SETTINGS', icon: '⚙', text: 'Audio, controls and graphics options are coming soon.' },
};

export function PlaceholderPage({ screen }: { screen: Screen }) {
  const { dispatch } = useGameStore();
  const copy = COPY[screen] ?? { title: 'COMING SOON', icon: '…', text: '' };
  return (
    <ScreenFrame title={copy.title} onBack={() => dispatch({ type: 'NAVIGATE', screen: BACK_TARGET[screen] ?? 'menu' })}>
      <div className="placeholder">
        <div className="placeholder-icon" aria-hidden="true">{copy.icon}</div>
        <p>COMING SOON</p>
        <small>{copy.text}</small>
      </div>
    </ScreenFrame>
  );
}
