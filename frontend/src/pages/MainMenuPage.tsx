import { Logo } from '../components/Logo';
import { useGameStore, type Screen } from '../store/GameStore';

const ITEMS: { icon: string; label: string; screen: Screen }[] = [
  { icon: '▶', label: 'PLAY', screen: 'character' },
  { icon: '🚗', label: 'GARAGE', screen: 'garage' },
  { icon: '🏆', label: 'LEADERBOARD', screen: 'leaderboard' },
  { icon: '⚙', label: 'SETTINGS', screen: 'settings' },
];

export function MainMenuPage() {
  const { dispatch } = useGameStore();
  return (
    <section className="screen menu">
      <Logo size="md" />
      <nav className="menu-list" aria-label="Main menu">
        {ITEMS.map((item) => (
          <button key={item.label} type="button" className="menu-item" onClick={() => dispatch({ type: 'NAVIGATE', screen: item.screen })}>
            <span className="menu-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
