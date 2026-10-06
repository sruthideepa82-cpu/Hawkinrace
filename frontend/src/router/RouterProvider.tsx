import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fromHash, HOME, toHash, type Screen } from './routes';

/**
 * Hash-based router.
 *
 * State lives entirely in `location.hash`, so `screen` is derived from the URL
 * rather than held separately. That is what makes the back button, a page
 * refresh, and a pasted link all behave the way a route is supposed to.
 *
 * A hash is used rather than a real path because the app is served as static
 * files: a browser history URL like `/character` would 404 on refresh unless
 * the host rewrites unknown paths to index.html. `#/character` needs nothing.
 */

interface RouterValue {
  screen: Screen;
  navigate: (screen: Screen, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  // An empty or unrecognised hash resolves to HOME for rendering, and the
  // effect below rewrites the URL to match so the address bar is honest.
  const [screen, setScreen] = useState<Screen>(() => fromHash(window.location.hash) ?? HOME);

  const navigate = useCallback((next: Screen, options?: { replace?: boolean }) => {
    const target = toHash(next);
    if (window.location.hash === target) return;
    if (options?.replace) {
      window.history.replaceState(null, '', target);
      setScreen(next);
    } else {
      // Assigning the hash fires `hashchange`, which is what drives the state.
      window.location.hash = target;
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => setScreen(fromHash(window.location.hash) ?? HOME);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Canonicalise a bad URL so it does not sit there looking like a valid page.
  useEffect(() => {
    if (window.location.hash !== toHash(screen)) {
      window.history.replaceState(null, '', toHash(screen));
    }
  }, [screen]);

  const value = useMemo(() => ({ screen, navigate }), [screen, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

/** Current screen plus a `navigate` that pushes a new route. */
export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside <RouterProvider>');
  return ctx;
}