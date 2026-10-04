import type { RaceBridge } from '../game/bridge';

export interface RaceHandle {
  destroy(): void;
}

export interface RaceLauncher {
  launch(parent: HTMLElement, bridge: RaceBridge): Promise<RaceHandle>;
}

/**
 * The only place React starts Phaser. Phaser is loaded lazily so menu screens
 * stay light, and tests (or a future networked race) can swap `launch`.
 */
export const raceLauncher: RaceLauncher = {
  async launch(parent, bridge) {
    const { createGame } = await import('../game/main');
    const game = createGame(parent, bridge);
    return { destroy: () => game.destroy(true) };
  },
};
