import { useEffect, useRef } from 'react';
import type { RaceBridge } from '../game/bridge';
import { raceLauncher, type RaceHandle } from '../services/raceLauncher';

/** Mounts the Phaser race for `bridge` and tears it down on unmount. */
export function GameCanvas({ bridge }: { bridge: RaceBridge }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let handle: RaceHandle | null = null;
    void raceLauncher.launch(container, bridge).then((h) => {
      if (cancelled) h.destroy();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [bridge]);

  return <div ref={containerRef} className="game-canvas" />;
}
