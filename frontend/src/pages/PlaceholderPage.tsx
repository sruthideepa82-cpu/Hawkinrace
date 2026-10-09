import { ScreenFrame } from '../components/ScreenFrame';
import { useRouter } from '../router/RouterProvider';
import { BACK_TARGET, type Screen } from '../router/routes';

const COPY: Partial<Record<Screen, { title: string; icon: string; text: string }>> = {
  garage: { title: 'GARAGE', icon: '🚗', text: 'Upgrades and unlockable cars arrive in a later milestone.' },
  settings: { title: 'SETTINGS', icon: '⚙', text: 'Audio, controls and graphics options are coming soon.' },
};

export function PlaceholderPage({ screen }: { screen: Screen }) {
  const { navigate } = useRouter();
  const copy = COPY[screen] ?? { title: 'COMING SOON', icon: '…', text: '' };
  return (
    <ScreenFrame title={copy.title} onBack={() => navigate(BACK_TARGET[screen] ?? 'menu')}>
      <div className="placeholder">
        <div className="placeholder-icon" aria-hidden="true">{copy.icon}</div>
        <p>COMING SOON</p>
        <small>{copy.text}</small>
      </div>
    </ScreenFrame>
  );
}