import { useEffect, useRef } from 'react';

/** Calls `handler` when `key` (KeyboardEvent.key) is pressed. */
export function useKeyPress(key: string, handler: () => void, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === key && !e.repeat) ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, enabled]);
}
