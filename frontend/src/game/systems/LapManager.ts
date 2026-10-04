import type { Point } from '../config/tracks';
import type { Gate } from './Gate';

export type LapEvent = 'none' | 'checkpoint' | 'lap' | 'finished';

/**
 * Counts laps. A lap only counts when every checkpoint was passed in order and
 * the finish line is then crossed in the racing direction, so jittering over
 * the line, reversing over it, or cutting across cannot add laps.
 */
export class LapManager {
  private completedLaps = 0;
  private nextCheckpoint = 0;
  readonly lapTimesMs: number[] = [];
  private lastLapEndMs = 0;

  constructor(
    private readonly finishGate: Gate,
    private readonly checkpoints: readonly Gate[],
    readonly totalLaps: number,
  ) {}

  /** Lap number to display (1-based, capped at totalLaps). */
  get currentLap(): number {
    return Math.min(this.completedLaps + 1, this.totalLaps);
  }

  get isComplete(): boolean {
    return this.completedLaps >= this.totalLaps;
  }

  update(prev: Point, cur: Point, raceTimeMs: number): LapEvent {
    if (this.isComplete) return 'none';

    if (this.nextCheckpoint < this.checkpoints.length) {
      if (this.checkpoints[this.nextCheckpoint].crossedForward(prev, cur)) {
        this.nextCheckpoint++;
        return 'checkpoint';
      }
      return 'none';
    }

    if (this.finishGate.crossedForward(prev, cur)) {
      this.completedLaps++;
      this.nextCheckpoint = 0;
      this.lapTimesMs.push(raceTimeMs - this.lastLapEndMs);
      this.lastLapEndMs = raceTimeMs;
      return this.isComplete ? 'finished' : 'lap';
    }
    return 'none';
  }
}
