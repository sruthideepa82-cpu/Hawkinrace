import type { Point } from '../config/tracks';
import type { Gate } from './Gate';

export type LapEvent = 'none' | 'checkpoint' | 'lap' | 'finished';

/**
 * Counts laps. A lap only counts when every checkpoint was passed in order and
 * the finish line is then crossed in the racing direction, so jittering over
 * the line, reversing over it, or cutting across cannot add laps.
 */
export class LapManager {
  private _currentLap = 1;
  private nextCheckpoint = 0;
  readonly lapTimesMs: number[] = [];
  private lastLapEndMs = 0;
  private raceFinished = false;

  constructor(
    private readonly finishGate: Gate,
    private readonly checkpoints: readonly Gate[],
    readonly totalLaps: number,
  ) {}

  /** Lap number to display (1-based, capped at totalLaps). */
  get currentLap(): number {
    return this._currentLap;
  }

  get isComplete(): boolean {
    return this.raceFinished;
  }

  update(prev: Point, cur: Point, raceTimeMs: number): LapEvent {
    if (this.raceFinished) return 'none';

    if (this.nextCheckpoint < this.checkpoints.length) {
      if (this.checkpoints[this.nextCheckpoint].crossedForward(prev, cur)) {
        this.nextCheckpoint++;
        return 'checkpoint';
      }
      return 'none';
    }

    if (this.finishGate.crossedForward(prev, cur)) {
      this.lapTimesMs.push(raceTimeMs - this.lastLapEndMs);
      this.lastLapEndMs = raceTimeMs;
      this.nextCheckpoint = 0;

      if (this._currentLap < this.totalLaps) {
        this._currentLap++;
        return 'lap';
      } else {
        this.raceFinished = true;
        return 'finished';
      }
    }
    return 'none';
  }
}
