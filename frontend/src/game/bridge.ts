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

/** One row of the live/final leaderboard. */
export interface StandingEntry {
  /** 1-based position on the road. */
  position: number;
  characterId: string;
  characterName: string;
  carName: string;
  /** 0xRRGGBB paint colour, so the results screen matches the car. */
  color: number;
  isPlayer: boolean;
  lap: number;
  totalLaps: number;
  finished: boolean;
  finishTimeMs: number | null;
  bestLapMs: number | null;
  /** Raw progress value the ranking is derived from. */
  progress: number;
}

/**
 * How the player's race ended.
 *
 * `finished` means the player took the chequered flag; their position is
 * whatever it actually was. `failed` means all three AI cars finished first and
 * the player is still on track, so the race ends for them there and they are
 * classified last. The results screen must not show "RACE COMPLETE" for the
 * second case.
 */
export type RaceOutcome = 'finished' | 'failed';

export interface RaceResult {
  outcome: RaceOutcome;
  /** The player's total race time. On failure this is the time they were beaten. */
  timeMs: number;
  lapTimesMs: number[];
  lapsCompleted: number;
  totalLaps: number;
  /** Final classification of every car, ordered 1st..4th. */
  standings: StandingEntry[];
  /** The player's finishing slot, 1-based. Always the field size on a failure. */
  playerPosition: number;
  playerBestLapMs: number | null;
  /** How many AI cars had taken the flag when the race ended. */
  aiFinishedCount: number;
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