import { Logo } from '../components/Logo';
import { HashLink } from '../router/HashLink';
import type { Screen } from '../router/routes';

const ITEMS: { icon: string; label: string; to: Screen }[] = [
  { icon: '▶', label: 'PLAY', to: 'character' },
  { icon: '🚗', label: 'GARAGE', to: 'garage' },
  { icon: '🏆', label: 'LEADERBOARD', to: 'leaderboard' },
  { icon: '⚙', label: 'SETTINGS', to: 'settings' },
];

export function MainMenuPage() {
  return (
    <section className="screen menu">
      <Logo size="md" />
      <nav className="menu-list" aria-label="Main menu">
        {ITEMS.map((item) => (
          <HashLink key={item.label} to={item.to} className="menu-item">
            <span className="menu-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </HashLink>
        ))}
      </nav>
    </section>
  );
}