import type Phaser from 'phaser';

/**
 * The contract between the React app and the Phaser race.
 * React -> Phaser: `config` (what to race).  Phaser -> React: `onRaceComplete`.
 * Keep this free of React/app types so the game stays independent.
 */
export interface RaceCarConfig {
  id: string;
  name: string;
  /** 0xRRGGBB paint colour. */
  color: number;
  /** Stats on a 1-10 scale. */
  stats: { speed: number; acceleration: number; handling: number };
}

export interface RaceConfig {
  characterId: string;
  characterName: string;
  car: RaceCarConfig;
  trackId: string;
  modeId: string;
}

export interface RaceResult {
  timeMs: number;
  lapTimesMs: number[];
  lapsCompleted: number;
  totalLaps: number;
}

export interface RaceBridge {
  config: RaceConfig;
  onRaceComplete: (result: RaceResult) => void;
}

const REGISTRY_KEY = 'raceBridge';

export function setRaceBridge(game: Phaser.Game, bridge: RaceBridge): void {
  game.registry.set(REGISTRY_KEY, bridge);
}

export function getRaceBridge(game: Phaser.Game): RaceBridge {
  const bridge = game.registry.get(REGISTRY_KEY) as RaceBridge | undefined;
  if (!bridge) throw new Error('RaceBridge was not provided to the Phaser game');
  return bridge;
}
