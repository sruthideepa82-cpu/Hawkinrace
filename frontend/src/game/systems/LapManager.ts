import type { Point } from '../config/tracks';
import type { TrackLayout } from '../entities/TrackLayout';
import { clamp, formatRaceTime } from '../utils/geometry';
import type { Gate } from './Gate';

export type LapEvent = 'none' | 'checkpoint' | 'lap' | 'finished';

/**
 * Counts laps for ONE car. A lap only counts when every checkpoint was passed in
 * order and the finish line is then crossed in the racing direction, so
 * jittering over the line, reversing over it, or cutting across cannot add laps.
 *
 * It also exposes `totalRaceProgress`, a single monotonic number used to rank
 * every car on the grid against each other.
 */
export class LapManager {
  private _currentLap = 1;
  private nextCheckpoint = 0;
  readonly lapTimesMs: number[] = [];
  private lastLapEndMs = 0;
  private raceFinished = false;
  private finishedAtMs: number | null = null;
  /**
   * Forward distance covered along the centerline since the car was created, in
   * px. Used only as a ranking tiebreak -- see `progressTiebreak`.
   */
  private travelled = 0;
  /** Centerline fraction at the previous update, for accumulating `travelled`. */
  private lastFraction: number | null = null;

  constructor(
    private readonly layout: TrackLayout,
    private readonly finishGate: Gate,
    private readonly checkpoints: readonly Gate[],
    readonly totalLaps: number,
  ) {}

  /** Lap number to display (1-based, capped at totalLaps). */
  get currentLap(): number {
    return this._currentLap;
  }

  /** Checkpoint the car is heading for, 1-based for display (so it starts at 1). */
  get currentCheckpoint(): number {
    return Math.min(this.nextCheckpoint + 1, this.checkpoints.length || 1);
  }

  get totalCheckpoints(): number {
    return this.checkpoints.length;
  }

  get isComplete(): boolean {
    return this.raceFinished;
  }

  /** Race time at which this car took the chequered flag, or null while racing. */
  get finishTimeMs(): number | null {
    return this.finishedAtMs;
  }

  /** Fastest lap set, or null before the first lap is completed. */
  get bestLapMs(): number | null {
    if (this.lapTimesMs.length === 0) return null;
    return Math.min(...this.lapTimesMs);
  }

  /**
   * Comparable progress for ranking, in "gates cleared" units:
   *   lap * gatesPerLap + checkpointsPassed + fractionOfNextGate
   *
   * `fractionOfNextGate` is clamped to the segment the car is legally allowed to
   * be in, so cutting across the infield can never inflate progress past the next
   * gate the car has not actually crossed yet.
   */
  get totalRaceProgress(): number {
    const gatesPerLap = this.layout.gatesPerLap;
    if (this.raceFinished) {
      return this.totalLaps * gatesPerLap + this.checkpoints.length + 1;
    }
    const segment = this.segmentProgress;
    return this._currentLap * gatesPerLap + this.nextCheckpoint + segment;
  }

  /**
   * Ranking tiebreak: forward distance covered since the car started.
   *
   * This has to be an accumulated arc distance rather than "distance since the
   * finish line". Cars line up BEHIND the line, so during the opening run down
   * to the first checkpoint every car is still short of it -- and measuring back
   * from the line ranks a car that has driven further forward as *worse*. The
   * segment progress above saturates for that whole stretch, so without this the
   * opening order of the race would be decided backwards.
   */
  get progressTiebreak(): number {
    return this.travelled;
  }

  /**
   * How far through the current gate-to-gate segment the car is (0..1).
   * Recomputed from the car's world position each frame by `update`.
   */
  private segmentProgress = 0;

  update(prev: Point, cur: Point, raceTimeMs: number, fraction: number): LapEvent {
    // Segment progress is always refreshed, even once finished, so the HUD keeps
    // showing a stable value. Finished cars are frozen separately.
    if (!this.raceFinished) {
      // Accumulate signed arc distance so the value grows while the car drives
      // forward and shrinks if it backs up. The wrap correction is what keeps
      // crossing the finish line from reading as a huge backwards jump.
      if (this.lastFraction !== null) {
        let delta = fraction - this.lastFraction;
        if (delta > 0.5) delta -= 1;
        else if (delta < -0.5) delta += 1;
        this.travelled += delta * this.layout.trackLength;
      }
      this.lastFraction = fraction;

      const gatesPerLap = this.layout.gatesPerLap;
      const intoGate = this.layout.distanceFromFinish(fraction) * gatesPerLap - this.nextCheckpoint;
      this.segmentProgress = clamp(intoGate, 0, 1);
    }

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

      // Hard cap: a car can never be credited with more than totalLaps.
      if (this._currentLap < this.totalLaps) {
        this._currentLap++;
        return 'lap';
      }
      this._currentLap = this.totalLaps;
      this.raceFinished = true;
      this.finishedAtMs = raceTimeMs;
      return 'finished';
    }
    return 'none';
  }

  /** Full reset for the retry path. */
  reset(): void {
    this._currentLap = 1;
    this.nextCheckpoint = 0;
    this.lapTimesMs.length = 0;
    this.lastLapEndMs = 0;
    this.raceFinished = false;
    this.finishedAtMs = null;
    this.travelled = 0;
    this.lastFraction = null;
    this.segmentProgress = 0;
  }

  /** Snapshot used by the HUD and the standings readout. */
  snapshot() {
    return {
      lap: this._currentLap,
      totalLaps: this.totalLaps,
      checkpoint: this.currentCheckpoint,
      totalCheckpoints: this.totalCheckpoints,
      progress: this.totalRaceProgress,
      finished: this.raceFinished,
      finishTimeMs: this.finishedAtMs,
      bestLapMs: this.bestLapMs,
      lapTimesMs: [...this.lapTimesMs],
      display: `${this._currentLap}/${this.totalLaps}`,
      lapText: `LAP ${this._currentLap}/${this.totalLaps}`,
      timeText: this.finishedAtMs === null ? '' : formatRaceTime(this.finishedAtMs),
    };
  }
}