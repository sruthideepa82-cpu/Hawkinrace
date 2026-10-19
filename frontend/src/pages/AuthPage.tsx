import { useState, type FormEvent } from 'react';
import { NeonButton } from '../components/NeonButton';
import { ScreenFrame } from '../components/ScreenFrame';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { useRouter } from '../router/RouterProvider';
import { isUnauthorised, login, register } from '../services/auth';
import { clearProfile } from '../services/profile';
import './auth.css';

/**
 * Sign in or create an account.
 *
 * <p>Reachable at any time from the menu, and never required to race. A signed
 * out player chooses a driver, picks a car and races exactly as before; the
 * difference is that their times are not recorded. That is stated on the screen
 * rather than left for someone to discover after a good run.
 *
 * <p>Errors are shown inline and specific. "Incorrect display name or password"
 * is deliberately the same message for both failure modes, because the backend
 * returns it that way -- distinguishing them here would reintroduce the account
 * enumeration the server works to prevent.
 */
export function AuthPage() {
  const { navigate } = useRouter();
  const { profile } = usePlayerProfile();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: nothing to do here.
  if (profile) {
    return (
      <ScreenFrame title="ACCOUNT" onBack={() => navigate('menu')}>
        <div className="auth-card">
          <p className="auth-current">SIGNED IN AS</p>
          <h2 className="auth-current-name">{profile.displayName}</h2>
          <p className="muted">Your race results are being saved to the leaderboard.</p>
          <NeonButton onClick={() => navigate('menu')}>BACK TO MENU</NeonButton>
        </div>
      </ScreenFrame>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setBusy(true);
    try {
      const credentials = { displayName: displayName.trim(), password };
      if (mode === 'register') {
        await register(credentials);
      } else {
        await login(credentials);
      }
      navigate('menu');
    } catch (caught) {
      if (isUnauthorised(caught)) {
        setError('Incorrect display name or password.');
      } else if (caught instanceof Error && /already taken/i.test(caught.message)) {
        setError('That display name is already taken.');
        // The user is trying to register, not sign in; switching modes is the
        // action that actually helps.
        setMode('login');
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Could not reach the server. Is the backend running?',
        );
      }
    } finally {
      setBusy(false);
      // A failed attempt may have left a stale token in the client.
      if (error) clearProfile();
    }
  }

  const tooShort = password.length > 0 && password.length < 8;

  return (
    <ScreenFrame title={mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'} onBack={() => navigate('menu')}>
      <form className="auth-card" onSubmit={submit}>
        <p className="muted">
          An account saves your race times to the leaderboard. You can race without one.
        </p>

        <label className="auth-field">
          <span>DISPLAY NAME</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            maxLength={24}
            placeholder="3-24 characters"
          />
        </label>

        <label className="auth-field">
          <span>PASSWORD</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            maxLength={72}
            aria-describedby={tooShort ? 'auth-password-hint' : undefined}
            placeholder="at least 8 characters"
          />
        </label>

        {/* The hint is tied to the field with aria-describedby, so a screen reader
            hears it in context rather than as a stray line of text. */}
        {tooShort ? (
          <p id="auth-password-hint" className="auth-hint">
            Passwords must be at least 8 characters.
          </p>
        ) : null}

        {/* role="alert" so a failed sign-in is announced rather than appearing
            silently below the fields. */}
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="auth-submit" disabled={busy || !displayName || !password}>
          {busy ? 'WORKING…' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </button>

        <NeonButton
          variant="ghost"
          onClick={() => {
            setError(null);
            setMode(mode === 'login' ? 'register' : 'login');
          }}
        >
          {mode === 'login' ? 'NEED AN ACCOUNT? SIGN UP' : 'ALREADY HAVE AN ACCOUNT? SIGN IN'}
        </NeonButton>
      </form>
    </ScreenFrame>
  );
}