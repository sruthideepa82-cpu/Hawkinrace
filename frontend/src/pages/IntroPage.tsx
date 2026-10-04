import { Logo } from '../components/Logo';
import { useKeyPress } from '../hooks/useKeyPress';
import { useGameStore } from '../store/GameStore';

export function IntroPage() {
  const { dispatch } = useGameStore();
  const start = () => dispatch({ type: 'NAVIGATE', screen: 'menu' });
  useKeyPress('Enter', start);

  return (
    <section className="screen intro" onClick={start}>
      <div className="intro-center">
        <Logo />
        <p className="subtitle">RACE BEYOND THE ORDINARY</p>
        <button type="button" className="press-start" onClick={start}>[ PRESS START ]</button>
      </div>
    </section>
  );
}
