import type { Point } from '../config/tracks';
import type { LapManager } from './LapManager';

export type RaceState = 'countdown' | 'racing' | 'finished';

export interface RaceSnapshot {
  state: RaceState;
  lap: number;
  totalLaps: number;
  elapsedMs: number;
  countdownRemainingMs: number;
  finalTimeMs: number | null;
  lapTimesMs: number[];
}

/** Owns race state and the race clock. Knows nothing about the car itself. */
export class RaceManager {
  private state: RaceState = 'countdown';
  private elapsedMs = 0;
  private countdownRemainingMs: number;
  private finalTimeMs: number | null = null;

  constructor(
    private readonly laps: LapManager,
    countdownSeconds: number,
  ) {
    this.countdownRemainingMs = countdownSeconds * 1000;
  }

  get isRacing(): boolean {
    return this.state === 'racing';
  }

  get currentState(): RaceState {
    return this.state;
  }

  update(dtMs: number, prev: Point, cur: Point): void {
    if (this.state === 'countdown') {
      this.countdownRemainingMs -= dtMs;
      if (this.countdownRemainingMs <= 0) {
        this.countdownRemainingMs = 0;
        this.state = 'racing';
      }
      return;
    }
    if (this.state !== 'racing') return;

    this.elapsedMs += dtMs;
    if (this.laps.update(prev, cur, this.elapsedMs) === 'finished') {
      this.state = 'finished';
      this.finalTimeMs = this.elapsedMs;
    }
  }

  snapshot(): RaceSnapshot {
    return {
      state: this.state,
      lap: this.laps.currentLap,
      totalLaps: this.laps.totalLaps,
      elapsedMs: this.elapsedMs,
      countdownRemainingMs: this.countdownRemainingMs,
      finalTimeMs: this.finalTimeMs,
      lapTimesMs: [...this.laps.lapTimesMs],
    };
  }
}
